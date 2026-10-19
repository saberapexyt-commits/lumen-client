import * as fs from 'fs';
import * as path from 'path';
import { P, ensureDir } from './paths';
import { hashFile } from './util';
import { logger } from './logger';

const log = logger('theme');
export const THEME_FILE = 'Lumen Theme.zip';

/** The bundled resource pack (built by scripts/make-theme.js). */
export function themeZip(): string {
  const packaged = (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'lumen-theme.zip') : '';
  if (packaged && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', '..', 'resources', 'lumen-theme.zip');
}

/** Insert or remove `entry` in options.txt's resourcePacks list, leaving every other line untouched. */
export function setPackEntry(optionsText: string, entry: string, enabled: boolean, position: 'low' | 'high' = 'low'): string {
  const lines = optionsText ? optionsText.split(/\r?\n/) : [];
  const i = lines.findIndex((l) => l.startsWith('resourcePacks:'));
  let list: string[] = ['vanilla'];
  if (i >= 0) {
    try {
      list = JSON.parse(lines[i].slice('resourcePacks:'.length));
    } catch {
      list = ['vanilla'];
    }
  }
  list = list.filter((x) => x !== entry);
  // Later entries win. Lumen's pack goes right after vanilla (lowest priority) so a player's own packs always override it.
  if (enabled) {
    if (position === 'high') list.push(entry);
    else list.splice(Math.min(1, list.length), 0, entry);
  }
  const line = `resourcePacks:${JSON.stringify(list)}`;
  if (i >= 0) lines[i] = line;
  else lines.push(line);
  return lines.filter((l, k, a) => l !== '' || k < a.length - 1).join('\n') + '\n';
}

/** Install (or remove) the Lumen menu theme for one profile. Never touches other resource packs. */
export async function applyTheme(profileId: string, enabled: boolean) {
  const gameDir = P.gameDir(profileId);
  const dest = path.join(ensureDir(path.join(gameDir, 'resourcepacks')), THEME_FILE);
  const src = themeZip();
  if (enabled) {
    if (!fs.existsSync(src)) return log.warn('Theme pack missing; skipping');
    if (!fs.existsSync(dest) || (await hashFile(dest)) !== (await hashFile(src))) await fs.promises.copyFile(src, dest);
  }
  const opt = path.join(gameDir, 'options.txt');
  const before = fs.existsSync(opt) ? fs.readFileSync(opt, 'utf8') : '';
  if (!enabled && !before) return;
  const after = setPackEntry(before, `file/${THEME_FILE}`, enabled);
  if (after !== before) {
    if (before) fs.copyFileSync(opt, opt + '.lumen-bak');
    fs.writeFileSync(opt, after);
  }
}
