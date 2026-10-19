import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { P, ensureDir } from '../paths';
import { DownloadSpec, Task, downloadAll, downloadFile, getJson } from '../net';
import { LauncherError, logger } from '../logger';
import { safeJoin } from '../util';
import { VersionJson, loadVersionJson, resolveLibraries, resolveVersion, getManifest } from './versions';

const log = logger('install');

export function libraryPath(rel: string) {
  return path.join(P.libraries(), rel);
}

export function clientJarPath(baseVersion: string) {
  return path.join(P.versions(), baseVersion, `${baseVersion}.jar`);
}

export function nativesDir(versionId: string) {
  return path.join(P.versions(), versionId, 'natives');
}

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>;
  virtual?: boolean;
  map_to_resources?: boolean;
}

/** Download the vanilla client jar + JSON for a Minecraft version. */
export async function installVanillaBase(mcVersion: string, task: Task): Promise<VersionJson> {
  task.stage(`Fetching Minecraft ${mcVersion} metadata`);
  const manifest = await getManifest();
  const entry = manifest.versions.find((v) => v.id === mcVersion);
  if (!entry) throw new LauncherError(`Minecraft ${mcVersion} does not exist.`);
  const json = await loadVersionJson(mcVersion);
  const client = json.downloads?.client;
  if (!client) throw new LauncherError(`Minecraft ${mcVersion} has no client download.`);
  task.stage(`Downloading Minecraft ${mcVersion}`, 1);
  await downloadFile({ url: client.url, dest: clientJarPath(mcVersion), sha1: client.sha1, size: client.size }, { signal: task.signal });
  task.advance();
  return json;
}

/**
 * Make an (already merged) version launchable: libraries, natives, assets, logging config.
 * Idempotent and resumable - every file is checksum-verified and skipped when already valid.
 */
export async function installRuntimeFiles(versionId: string, task: Task, gameDir: string): Promise<{ resolved: VersionJson; nativeDir: string }> {
  const v = await resolveVersion(versionId);
  const libs = resolveLibraries(v);

  const specs: DownloadSpec[] = [];
  for (const l of libs) {
    const dest = libraryPath(l.path);
    if (!l.url) {
      if (!fs.existsSync(dest)) throw new LauncherError(`Library ${l.name} is missing and has no download URL (the loader install may be incomplete).`);
      continue;
    }
    specs.push({ url: l.url, dest, sha1: l.sha1, size: l.size });
  }
  task.stage('Downloading libraries', specs.length);
  await downloadAll(specs, task);

  // Natives (old-style classifier jars) are unpacked into a per-version folder.
  const nDir = nativesDir(versionId);
  const natives = libs.filter((l) => l.native);
  if (natives.length) {
    task.stage('Extracting native libraries', natives.length);
    ensureDir(nDir);
    for (const n of natives) {
      const zip = new AdmZip(libraryPath(n.path));
      for (const e of zip.getEntries()) {
        if (e.isDirectory || e.entryName.startsWith('META-INF')) continue;
        if (n.excludes?.some((x) => e.entryName.startsWith(x))) continue;
        const out = safeJoin(nDir, e.entryName);
        ensureDir(path.dirname(out));
        fs.writeFileSync(out, e.getData());
      }
      task.advance();
    }
  }

  // Assets
  if (v.assetIndex) {
    const idx = v.assetIndex;
    const idxFile = path.join(P.assets(), 'indexes', `${idx.id}.json`);
    task.stage('Fetching asset index');
    await downloadFile({ url: idx.url, dest: idxFile, sha1: idx.sha1 }, { signal: task.signal });
    const index: AssetIndex = JSON.parse(await fs.promises.readFile(idxFile, 'utf8'));
    const objs = Object.entries(index.objects);
    const assetSpecs: DownloadSpec[] = objs.map(([, o]) => ({
      url: `https://resources.download.minecraft.net/${o.hash.slice(0, 2)}/${o.hash}`,
      dest: path.join(P.assets(), 'objects', o.hash.slice(0, 2), o.hash),
      sha1: o.hash,
      size: o.size,
    }));
    task.stage('Downloading assets', assetSpecs.length);
    await downloadAll(assetSpecs, task, 24);

    // Pre-1.7 style asset layouts expect real file names.
    if (index.virtual || index.map_to_resources) {
      const base = index.map_to_resources ? path.join(gameDir, 'resources') : path.join(P.assets(), 'virtual', idx.id);
      for (const [name, o] of objs) {
        const dest = safeJoin(base, name);
        if (fs.existsSync(dest)) continue;
        ensureDir(path.dirname(dest));
        fs.copyFileSync(path.join(P.assets(), 'objects', o.hash.slice(0, 2), o.hash), dest);
      }
    }
  }

  // Logging config (also contains the Log4Shell mitigation for 1.7-1.18).
  const lc = v.logging?.client?.file;
  if (lc) await downloadFile({ url: lc.url, dest: path.join(P.assets(), 'log_configs', lc.id), sha1: lc.sha1 }, { signal: task.signal });

  log.info(`Runtime files ready for ${versionId}`);
  return { resolved: v, nativeDir: nDir };
}

export function listInstalledVersions(): string[] {
  try {
    return fs
      .readdirSync(P.versions(), { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(P.versions(), d.name, `${d.name}.json`)))
      .map((d) => d.name);
  } catch {
    return [];
  }
}
