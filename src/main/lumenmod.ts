import * as fs from 'fs';
import * as path from 'path';
import { P, ensureDir } from './paths';
import { Task } from './net';
import { logger } from './logger';
import { hashFile } from './util';
import { Profile } from './profiles';
import { installPlan, listInstalled, planMod, toTrashFile } from './mods/manager';
import { modrinth } from './mods/modrinth';

const log = logger('lumenmod');

/** Minecraft versions the bundled in-game mod is built for. */
const SUPPORTED: Record<string, string> = { '1.21.1': 'lumen-client-mc1.21.1.jar' };

function bundledDir(): string {
  const rp = (process as any).resourcesPath as string | undefined;
  const packaged = rp ? path.join(rp, 'mods') : '';
  return packaged && fs.existsSync(packaged) ? packaged : path.join(__dirname, '..', '..', 'resources', 'mods');
}

export const lumenModSupports = (p: Pick<Profile, 'mcVersion' | 'loader'>) => (p.loader === 'fabric' || p.loader === 'quilt') && p.mcVersion in SUPPORTED;

/**
 * Keep the Lumen in-game mod (custom main menu + settings screen) in sync with a profile:
 * installs it (and Fabric API, which it needs) when enabled, removes only its own jar when disabled.
 */
export async function syncLumenMod(profile: Profile, enabled: boolean, task: Task) {
  if (!lumenModSupports(profile)) return;
  const modsDir = ensureDir(P.modsDir(profile.id));
  const name = SUPPORTED[profile.mcVersion];
  const dest = path.join(modsDir, name);
  const ours = fs.readdirSync(modsDir).filter((f) => /^lumen-client-mc[\d.]+\.jar(\.disabled)?$/.test(f));

  if (!enabled) {
    for (const f of ours) await toTrashFile(profile.id, path.join(modsDir, f));
    return;
  }
  const src = path.join(bundledDir(), name);
  if (!fs.existsSync(src)) return log.warn(`Bundled Lumen mod missing: ${src}`);

  // Fabric API is a hard dependency of the mod: install a compatible build through the normal mod manager.
  const have = (await listInstalled(profile.id, { identify: false })).some((m) => m.slug === 'fabric-api' || m.meta?.modId === 'fabric-api');
  if (!have) {
    try {
      task.stage('Installing Fabric API (needed by the Lumen mod)');
      const proj = await modrinth.getProject('fabric-api');
      await installPlan(profile.id, await planMod(profile.id, { provider: 'modrinth', projectId: proj.id }), task);
    } catch (e) {
      log.warn('Could not install Fabric API; skipping the Lumen mod for this launch', e as Error);
      return;
    }
  }
  for (const f of ours) if (f !== name && f !== `${name}.disabled`) await toTrashFile(profile.id, path.join(modsDir, f));
  const disabled = `${dest}.disabled`; // the user switched it off in Installed mods: respect that
  if (fs.existsSync(disabled)) return;
  if (!fs.existsSync(dest) || (await hashFile(dest)) !== (await hashFile(src))) await fs.promises.copyFile(src, dest);
}
