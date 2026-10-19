import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { P, ensureDir } from '../paths';
import { Task, downloadFile, getJson } from '../net';
import { LauncherError, logger } from '../logger';
import { cmpVersion, writeJson } from '../util';
import { ensureJava } from '../minecraft/java';
import { loadVersionJson, versionJsonPath } from '../minecraft/versions';

const log = logger('loaders');

export type LoaderId = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge';

export interface LoaderVersion {
  version: string;
  stable: boolean;
}

export interface LoaderProvider {
  id: Exclude<LoaderId, 'vanilla'>;
  name: string;
  /** Loader versions available for this exact Minecraft version (empty = unsupported). */
  getVersions(mc: string): Promise<LoaderVersion[]>;
  /** Install into the shared versions dir and return the launchable version id. */
  install(mc: string, loaderVersion: string, task: Task): Promise<string>;
}

async function text(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'LumenClient/0.1.0' } });
  if (!res.ok) throw new LauncherError(`Request failed (HTTP ${res.status}) for ${url}`);
  return res.text();
}

const xmlVersions = (xml: string) => [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);

/* ---------- Fabric & Quilt: profile JSON served by the loader's meta API ---------- */
function metaLoader(id: 'fabric' | 'quilt', name: string, base: string): LoaderProvider {
  const api = base;
  return {
    id,
    name,
    async getVersions(mc) {
      try {
        const list = await getJson<{ loader: { version: string; stable?: boolean } }[]>(`${api}/versions/loader/${encodeURIComponent(mc)}`, { ttl: 300_000 });
        return list.map((l) => ({ version: l.loader.version, stable: l.loader.stable ?? !/(beta|alpha|pre|rc)/i.test(l.loader.version) }));
      } catch (e: any) {
        if ((e?.detail as any)?.status === 400 || (e?.detail as any)?.status === 404) return [];
        throw e;
      }
    },
    async install(mc, loaderVersion, task) {
      task.stage(`Installing ${name} ${loaderVersion}`);
      const profile = await getJson<{ id: string }>(`${api}/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(loaderVersion)}/profile/json`);
      if (!profile?.id) throw new LauncherError(`${name} returned an invalid profile for ${mc}.`);
      await writeJson(versionJsonPath(profile.id), profile);
      return profile.id;
    },
  };
}

/* ---------- Forge / NeoForge: run the official installer headlessly ---------- */
async function runInstaller(jar: string, mc: string, task: Task, label: string): Promise<void> {
  const root = P.shared();
  // The installer insists on a launcher_profiles.json next to versions/.
  const lp = path.join(root, 'launcher_profiles.json');
  if (!fs.existsSync(lp)) await writeJson(lp, { profiles: {}, settings: {}, version: 3 });

  const vanilla = await loadVersionJson(mc);
  const javaComponent = vanilla.javaVersion?.component ?? 'jre-legacy';
  const java = await ensureJava(javaComponent, task, false);
  task.stage(`Running ${label} installer (this can take a few minutes)`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(java, ['-jar', jar, '--installClient', root], { cwd: root });
    let tail = '';
    const onData = (d: Buffer) => {
      const s = d.toString();
      tail = (tail + s).slice(-4000);
      for (const line of s.split(/\r?\n/)) if (line.trim()) log.debug(`[installer] ${line}`);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    task.signal.addEventListener('abort', () => child.kill());
    child.on('error', reject);
    child.on('close', (code) => {
      if (task.signal.aborted) return reject(new LauncherError('Cancelled'));
      if (code === 0) return resolve();
      reject(new LauncherError(`${label} installer failed (exit code ${code}). Last output:\n${tail.slice(-800)}`));
    });
  });
}

function listVersionDirs(): Set<string> {
  try {
    return new Set(fs.readdirSync(P.versions()));
  } catch {
    return new Set();
  }
}

async function installWithInstaller(opts: {
  mc: string;
  loaderVersion: string;
  url: string;
  fileName: string;
  label: string;
  expectId: (mc: string, lv: string) => string[];
  task: Task;
}): Promise<string> {
  const { mc, loaderVersion, task } = opts;
  // Already installed? Skip the (slow) installer.
  for (const id of opts.expectId(mc, loaderVersion)) if (fs.existsSync(versionJsonPath(id))) return id;

  task.stage(`Downloading ${opts.label} installer`);
  const jar = path.join(ensureDir(P.installers()), opts.fileName);
  await downloadFile({ url: opts.url, dest: jar }, { signal: task.signal, force: false });
  const before = listVersionDirs();
  await runInstaller(jar, mc, task, opts.label);
  for (const id of opts.expectId(mc, loaderVersion)) if (fs.existsSync(versionJsonPath(id))) return id;
  // Fall back to whichever new version directory the installer created.
  const added = [...listVersionDirs()].filter((d) => !before.has(d) && fs.existsSync(versionJsonPath(d)));
  if (added.length) return added[0];
  throw new LauncherError(`${opts.label} installer finished but no version was created.`);
}

const FORGE_MIN = '1.12.2';

const forge: LoaderProvider = {
  id: 'forge',
  name: 'Forge',
  async getVersions(mc) {
    if (cmpVersion(mc, FORGE_MIN) < 0) return [];
    const xml = await text('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
    const prefix = `${mc}-`;
    const all = xmlVersions(xml).filter((v) => v.startsWith(prefix));
    let promos: Record<string, string> = {};
    try {
      promos = (await getJson<{ promos: Record<string, string> }>('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', { ttl: 300_000 })).promos;
    } catch {
      /* promotions only decorate the list */
    }
    const rec = new Set([promos[`${mc}-recommended`], promos[`${mc}-latest`]].filter(Boolean));
    return all
      .map((v) => v.slice(prefix.length))
      .reverse()
      .map((v) => ({ version: v, stable: rec.has(v.split('-')[0]) }));
  },
  async install(mc, lv, task) {
    // Early Forge builds append the MC version again ("1.12.2-14.23.5.2860-1.12.2").
    const full = `${mc}-${lv}`;
    const base = `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`;
    return installWithInstaller({
      mc,
      loaderVersion: lv,
      url: base,
      fileName: `forge-${full}-installer.jar`,
      label: 'Forge',
      expectId: (m, v) => [`${m}-forge-${v}`, `${m}-forge${m}-${v}`],
      task,
    });
  },
};

/**
 * NeoForge version prefix for a Minecraft release.
 *   1.21.1 -> "21.1."      (legacy 1.x scheme: <minor>.<patch>.<build>)
 *   26.3   -> "26.3.0."    (year-based scheme: <year>.<drop>.<patch>.<build>)
 */
export function neoPrefix(mc: string): string | null {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(mc);
  if (!m) return null; // snapshots etc.
  if (m[1] === '1') return `${m[2]}.${m[3] ?? '0'}.`;
  return `${m[1]}.${m[2]}.${m[3] ?? '0'}.`;
}

const neoforge: LoaderProvider = {
  id: 'neoforge',
  name: 'NeoForge',
  async getVersions(mc) {
    const prefix = neoPrefix(mc);
    if (!prefix || cmpVersion(mc, '1.20.2') < 0) return [];
    const xml = await text('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
    return xmlVersions(xml)
      .filter((v) => v.startsWith(prefix))
      .reverse()
      .map((v) => ({ version: v, stable: !/(beta|alpha|rc)/i.test(v) }));
  },
  async install(mc, lv, task) {
    return installWithInstaller({
      mc,
      loaderVersion: lv,
      url: `https://maven.neoforged.net/releases/net/neoforged/neoforge/${lv}/neoforge-${lv}-installer.jar`,
      fileName: `neoforge-${lv}-installer.jar`,
      label: 'NeoForge',
      expectId: (_m, v) => [`neoforge-${v}`],
      task,
    });
  },
};

export const LOADERS: Record<Exclude<LoaderId, 'vanilla'>, LoaderProvider> = {
  fabric: metaLoader('fabric', 'Fabric', 'https://meta.fabricmc.net/v2'),
  quilt: metaLoader('quilt', 'Quilt', 'https://meta.quiltmc.org/v3'),
  forge,
  neoforge,
};

export async function getLoaderVersions(loader: LoaderId, mc: string): Promise<LoaderVersion[]> {
  if (loader === 'vanilla') return [];
  return LOADERS[loader].getVersions(mc);
}

/** Pick the version to install when the user did not choose one: newest stable, else newest. */
export function pickDefaultLoaderVersion(list: LoaderVersion[]): string | undefined {
  return (list.find((v) => v.stable) ?? list[0])?.version;
}

/** Throws a user-friendly error when the loader does not support the Minecraft version. */
export async function assertLoaderSupports(loader: LoaderId, mc: string, loaderVersion?: string): Promise<string | undefined> {
  if (loader === 'vanilla') return undefined;
  const list = await getLoaderVersions(loader, mc);
  if (list.length === 0) throw new LauncherError(`${LOADERS[loader].name} does not support Minecraft ${mc}.`);
  if (loaderVersion) {
    if (!list.some((v) => v.version === loaderVersion)) throw new LauncherError(`${LOADERS[loader].name} ${loaderVersion} is not available for Minecraft ${mc}.`);
    return loaderVersion;
  }
  return pickDefaultLoaderVersion(list);
}
