import * as fs from 'fs';
import * as path from 'path';
import { P, ensureDir } from '../paths';
import { getJson, downloadFile } from '../net';
import { LauncherError, logger } from '../logger';
import { ARCH, OS, readJson, writeJson } from '../util';

const log = logger('versions');
const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export interface ManifestEntry {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  url: string;
  sha1: string;
  releaseTime: string;
}
export interface Manifest {
  latest: { release: string; snapshot: string };
  versions: ManifestEntry[];
}

export interface Rule {
  action: 'allow' | 'disallow';
  os?: { name?: string; arch?: string; version?: string };
  features?: Record<string, boolean>;
}

export interface Library {
  name: string;
  url?: string;
  rules?: Rule[];
  natives?: Record<string, string>;
  extract?: { exclude?: string[] };
  downloads?: {
    artifact?: { path: string; url: string; sha1?: string; size?: number };
    classifiers?: Record<string, { path: string; url: string; sha1?: string; size?: number }>;
  };
  sha1?: string;
  size?: number;
}

export type ArgValue = string | { rules?: Rule[]; value: string | string[] };

export interface VersionJson {
  id: string;
  inheritsFrom?: string;
  type?: string;
  mainClass: string;
  minecraftArguments?: string;
  arguments?: { game?: ArgValue[]; jvm?: ArgValue[] };
  libraries: Library[];
  assetIndex?: { id: string; url: string; sha1: string; size: number; totalSize?: number };
  assets?: string;
  downloads?: { client?: { url: string; sha1: string; size: number } };
  javaVersion?: { component: string; majorVersion: number };
  logging?: { client?: { argument: string; file: { id: string; url: string; sha1: string; size: number } } };
  [k: string]: any;
}

export async function getManifest(): Promise<Manifest> {
  const cacheFile = path.join(P.shared(), 'version_manifest_v2.json');
  try {
    const m = await getJson<Manifest>(MANIFEST_URL, { ttl: 5 * 60_000 });
    await writeJson(cacheFile, m);
    return m;
  } catch (e) {
    const cached = await readJson<Manifest | null>(cacheFile, null);
    if (cached) {
      log.warn('Using cached version manifest (offline?)');
      return cached;
    }
    throw new LauncherError('Could not load the Minecraft version list. Check your internet connection.');
  }
}

/** Evaluate Mojang-style rules. No rules => allowed. Last matching rule wins. */
export function rulesAllow(rules: Rule[] | undefined, features: Record<string, boolean> = {}): boolean {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const r of rules) {
    let match = true;
    if (r.os) {
      if (r.os.name && r.os.name !== OS) match = false;
      if (r.os.arch) {
        // Mojang uses "x86" for 32-bit only and "arm64" for ARM.
        const a = r.os.arch === 'x86' ? 'x86' : r.os.arch;
        if (a !== ARCH) match = false;
      }
      // os.version is a regex (used for old macOS/Windows 10 tweaks); ignore unless clearly matching.
    }
    if (r.features) {
      for (const [k, v] of Object.entries(r.features)) if (!!features[k] !== v) match = false;
    }
    if (match) allowed = r.action === 'allow';
  }
  return allowed;
}

export function versionJsonPath(id: string) {
  return path.join(P.versions(), id, `${id}.json`);
}

/** Read a version JSON from disk, downloading vanilla ones from Mojang if missing. */
export async function loadVersionJson(id: string): Promise<VersionJson> {
  const file = versionJsonPath(id);
  if (fs.existsSync(file)) {
    const raw = await readJson<VersionJson | null>(file, null);
    if (raw) return raw;
  }
  const manifest = await getManifest();
  const entry = manifest.versions.find((v) => v.id === id);
  if (!entry) throw new LauncherError(`Minecraft version "${id}" was not found.`);
  ensureDir(path.dirname(file));
  await downloadFile({ url: entry.url, dest: file, sha1: entry.sha1 });
  return JSON.parse(await fs.promises.readFile(file, 'utf8'));
}

function libKey(name: string): string {
  const [g, a, , c] = name.split(':');
  return `${g}:${a}${c ? ':' + c : ''}`;
}

/** Merge `inheritsFrom` chains (Fabric/Quilt/Forge profiles) into one effective version JSON. */
export async function resolveVersion(id: string, load: (id: string) => Promise<VersionJson> = loadVersionJson): Promise<VersionJson> {
  const child = await load(id);
  if (!child.inheritsFrom) return child;
  const parent = await resolveVersion(child.inheritsFrom, load);

  // Child libraries win over same-artifact parent libraries (different version of the same lib).
  const childKeys = new Set(child.libraries.map((l) => libKey(l.name)));
  const libraries = [...child.libraries, ...parent.libraries.filter((l) => !childKeys.has(libKey(l.name)))];

  const merged: VersionJson = { ...parent, ...child, libraries };
  merged.id = child.id;
  delete merged.inheritsFrom;
  if (parent.arguments || child.arguments) {
    merged.arguments = {
      game: [...(parent.arguments?.game ?? []), ...(child.arguments?.game ?? [])],
      jvm: [...(parent.arguments?.jvm ?? []), ...(child.arguments?.jvm ?? [])],
    };
  }
  merged.assetIndex = child.assetIndex ?? parent.assetIndex;
  merged.assets = child.assets ?? parent.assets;
  merged.downloads = child.downloads ?? parent.downloads;
  merged.javaVersion = child.javaVersion ?? parent.javaVersion;
  merged.logging = child.logging ?? parent.logging;
  merged.minecraftArguments = child.minecraftArguments ?? parent.minecraftArguments;
  (merged as any)._baseVersion = (parent as any)._baseVersion ?? parent.id;
  return merged;
}

export function mavenPath(name: string): string {
  const [group, artifact, version, classifier] = name.split(':');
  let v = version;
  let ext = 'jar';
  if (v.includes('@')) [v, ext] = v.split('@');
  const file = `${artifact}-${v}${classifier ? '-' + classifier : ''}.${ext}`;
  return `${group.replace(/\./g, '/')}/${artifact}/${v}/${file}`;
}

export interface ResolvedLibrary {
  name: string;
  path: string; // relative to libraries/
  url: string;
  sha1?: string;
  size?: number;
  native: boolean; // old-style classifier jar to extract (not on classpath)
  excludes?: string[];
}

/** Turn a version's library list into concrete downloads for this OS/arch. */
export function resolveLibraries(v: VersionJson): ResolvedLibrary[] {
  const out: ResolvedLibrary[] = [];
  for (const lib of v.libraries) {
    if (!rulesAllow(lib.rules)) continue;
    const art = lib.downloads?.artifact;
    if (art || !lib.natives) {
      if (art) {
        // Forge installer profiles can leave url empty for jars produced locally by processors.
        out.push({ name: lib.name, path: art.path, url: art.url, sha1: art.sha1, size: art.size, native: false });
      } else {
        const p = mavenPath(lib.name);
        const base = lib.url ?? 'https://libraries.minecraft.net/';
        out.push({ name: lib.name, path: p, url: base.replace(/\/?$/, '/') + p, sha1: lib.sha1, size: lib.size, native: false });
      }
    }
    if (lib.natives) {
      const key = lib.natives[OS]?.replace('${arch}', ARCH === 'x86' ? '32' : '64');
      const cls = key ? lib.downloads?.classifiers?.[key] : undefined;
      if (cls) out.push({ name: `${lib.name}:${key}`, path: cls.path, url: cls.url, sha1: cls.sha1, size: cls.size, native: true, excludes: lib.extract?.exclude });
    }
  }
  return out;
}
