import * as fs from 'fs';
import * as path from 'path';
import { P, ensureDir } from '../paths';
import { Task, downloadAll, getJson, DownloadSpec } from '../net';
import { LauncherError, logger } from '../logger';
import { ARCH, OS } from '../util';

const log = logger('java');
const ALL_URL = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';

function platformKey(): string {
  if (OS === 'windows') return ARCH === 'arm64' ? 'windows-arm64' : ARCH === 'x86' ? 'windows-x86' : 'windows-x64';
  if (OS === 'osx') return ARCH === 'arm64' ? 'mac-os-arm64' : 'mac-os';
  return ARCH === 'x86' ? 'linux-i386' : 'linux';
}

export function javaExecutable(component: string, gui = true): string {
  const base = path.join(P.runtime(), component);
  if (OS === 'windows') return path.join(base, 'bin', gui ? 'javaw.exe' : 'java.exe');
  if (OS === 'osx') return path.join(base, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
  return path.join(base, 'bin', 'java');
}

/**
 * Ensure the Mojang-provided Java runtime `component` (e.g. "java-runtime-delta") is installed.
 * These are the same JREs the official launcher uses, so we never depend on the system Java.
 */
export async function ensureJava(component: string, task?: Task, gui = true): Promise<string> {
  const dir = path.join(P.runtime(), component);
  const marker = path.join(dir, '.lumen-complete');
  if (fs.existsSync(marker) && fs.existsSync(javaExecutable(component))) return javaExecutable(component, gui);

  task?.stage(`Preparing Java (${component})`);
  const all = await getJson<Record<string, Record<string, { manifest: { url: string; sha1: string } }[]>>>(ALL_URL, { ttl: 3600_000 });
  const entry = all[platformKey()]?.[component]?.[0];
  if (!entry) throw new LauncherError(`Java runtime "${component}" is not available for ${platformKey()}.`);
  const manifest = await getJson<{ files: Record<string, { type: string; executable?: boolean; target?: string; downloads?: { raw: { url: string; sha1: string; size: number } } }> }>(entry.manifest.url);

  ensureDir(dir);
  const specs: DownloadSpec[] = [];
  const execs: string[] = [];
  const links: [string, string][] = [];
  for (const [rel, f] of Object.entries(manifest.files)) {
    const dest = path.join(dir, rel);
    if (f.type === 'directory') ensureDir(dest);
    else if (f.type === 'file' && f.downloads) {
      specs.push({ url: f.downloads.raw.url, dest, sha1: f.downloads.raw.sha1, size: f.downloads.raw.size });
      if (f.executable) execs.push(dest);
    } else if (f.type === 'link' && f.target) links.push([dest, f.target]);
  }
  task?.stage(`Downloading Java (${component})`, specs.length);
  await downloadAll(specs, task ?? new Task('java', 'java', () => {}), 16);
  for (const e of execs) await fs.promises.chmod(e, 0o755).catch(() => {});
  for (const [dest, target] of links) {
    try {
      await fs.promises.rm(dest, { force: true });
      await fs.promises.symlink(target, dest);
    } catch (e) {
      log.warn(`symlink failed: ${dest}`, e as Error);
    }
  }
  await fs.promises.writeFile(marker, new Date().toISOString());
  log.info(`Installed Java runtime ${component}`);
  return javaExecutable(component, gui);
}
