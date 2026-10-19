import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { P, ensureDir } from './paths';
import { Task, downloadFile } from './net';
import { LauncherError, logger } from './logger';
import { LoaderId, getLoaderVersions } from './loaders';
import { Profile, createProfile, deleteProfile, getProfile } from './profiles';
import { hashFile, safeJoin, writeJson } from './util';
import { curseforge } from './mods/curseforge';
import { InstalledView, installPlan, listInstalled } from './mods/manager';
import { InstallPlan, PlanItem } from './mods/resolver';

const log = logger('modpack');

/** Modrinth's modpack spec only allows downloads from these hosts. */
const MRPACK_HOSTS = new Set(['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com']);

const LOADER_DEP: Record<string, LoaderId> = {
  'fabric-loader': 'fabric',
  'quilt-loader': 'quilt',
  forge: 'forge',
  neoforge: 'neoforge',
};

function extractOverrides(zip: AdmZip, prefix: string, gameDir: string) {
  for (const e of zip.getEntries()) {
    if (e.isDirectory || !e.entryName.startsWith(prefix + '/')) continue;
    const rel = e.entryName.slice(prefix.length + 1);
    const dest = safeJoin(gameDir, rel); // zip-slip protection
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, e.getData());
  }
}

export interface ImportResult {
  profile: Profile;
  manualDownloads: { name: string; url?: string }[];
  warnings: string[];
}

/** Pick the requested loader version if the loader offers it, else the loader's default (with a warning). */
async function profileFor(name: string, mc: string, loader: LoaderId, wanted: string | undefined, source: Profile['source'], warnings: string[]) {
  let loaderVersion = wanted;
  if (loader !== 'vanilla' && wanted) {
    const available = await getLoaderVersions(loader, mc);
    const hit = available.find((v) => v.version === wanted || v.version.endsWith('-' + wanted) || v.version === `${mc}-${wanted}`);
    if (hit) loaderVersion = hit.version;
    else {
      warnings.push(`${loader} ${wanted} is no longer listed for Minecraft ${mc}; using the latest stable version instead.`);
      loaderVersion = undefined;
    }
  }
  return createProfile({ name, mcVersion: mc, loader, loaderVersion, source });
}

/* =============================== Modrinth .mrpack =============================== */
export async function importMrpack(file: string, task: Task): Promise<ImportResult> {
  task.stage('Reading modpack');
  const zip = new AdmZip(file);
  const idxEntry = zip.getEntry('modrinth.index.json');
  if (!idxEntry) throw new LauncherError('This is not a valid .mrpack file (modrinth.index.json is missing).');
  const index = JSON.parse(idxEntry.getData().toString('utf8'));
  const deps: Record<string, string> = index.dependencies ?? {};
  const mc = deps.minecraft;
  if (!mc) throw new LauncherError('The modpack does not specify a Minecraft version.');
  const loaderKey = Object.keys(deps).find((k) => LOADER_DEP[k]);
  const loader: LoaderId = loaderKey ? LOADER_DEP[loaderKey] : 'vanilla';
  const warnings: string[] = [];
  const profile = await profileFor(index.name || path.basename(file, '.mrpack'), mc, loader, loaderKey ? deps[loaderKey] : undefined, { kind: 'mrpack', name: index.name }, warnings);
  const gameDir = ensureDir(P.gameDir(profile.id));

  const files: any[] = (index.files ?? []).filter((f: any) => f.env?.client !== 'unsupported');
  task.stage('Downloading modpack files', files.length);
  for (const f of files) {
    task.throwIfCancelled();
    const dest = safeJoin(gameDir, f.path);
    const urls: string[] = f.downloads ?? [];
    const url = urls.find((u) => {
      try {
        return MRPACK_HOSTS.has(new URL(u).host);
      } catch {
        return false;
      }
    });
    if (!url) throw new LauncherError(`The modpack file ${f.path} has no download from an allowed host; refusing to fetch it.`);
    await downloadFile({ url, dest, sha1: f.hashes?.sha1, sha512: f.hashes?.sha512, size: f.fileSize }, { signal: task.signal });
    task.advance();
  }
  task.stage('Applying configuration files');
  extractOverrides(zip, 'overrides', gameDir);
  extractOverrides(zip, 'client-overrides', gameDir);
  await listInstalled(profile.id); // adopt + identify mods on Modrinth
  log.info(`Imported mrpack ${index.name} into ${profile.id}`);
  return { profile: await getProfile(profile.id), manualDownloads: [], warnings };
}

/* =============================== CurseForge modpack zip =============================== */
export async function importCurseForgePack(file: string, task: Task): Promise<ImportResult> {
  task.stage('Reading modpack');
  const zip = new AdmZip(file);
  const mEntry = zip.getEntry('manifest.json');
  if (!mEntry) throw new LauncherError('This is not a valid CurseForge modpack (manifest.json is missing).');
  const manifest = JSON.parse(mEntry.getData().toString('utf8'));
  const mc: string | undefined = manifest.minecraft?.version;
  if (!mc) throw new LauncherError('The modpack does not specify a Minecraft version.');
  const primary = (manifest.minecraft.modLoaders ?? []).find((l: any) => l.primary) ?? manifest.minecraft.modLoaders?.[0];
  let loader: LoaderId = 'vanilla';
  let loaderVersion: string | undefined;
  if (primary?.id) {
    const m = /^(forge|fabric|neoforge|quilt)-(.+)$/.exec(primary.id);
    if (m) {
      loader = m[1] as LoaderId;
      loaderVersion = m[2];
    }
  }
  const st = await curseforge.status();
  if (!st.ok) throw new LauncherError(`Importing CurseForge modpacks needs a CurseForge API key. ${st.reason}`);

  const warnings: string[] = [];
  const profile = await profileFor(manifest.name || path.basename(file, '.zip'), mc, loader, loaderVersion, { kind: 'curseforge', name: manifest.name }, warnings);
  const gameDir = ensureDir(P.gameDir(profile.id));

  const refs: { projectID: number; fileID: number; required?: boolean }[] = manifest.files ?? [];
  task.stage('Resolving mods on CurseForge', refs.length);
  const projects = new Map((await curseforge.getProjects([...new Set(refs.map((r) => String(r.projectID)))])).map((p) => [p.id, p]));
  const items: PlanItem[] = [];
  const manual: { name: string; url?: string }[] = [];
  for (const r of refs) {
    task.throwIfCancelled();
    try {
      const f = await curseforge.getFile(String(r.projectID), String(r.fileID));
      const project = projects.get(String(r.projectID));
      if (!project) throw new Error('project not found');
      const item: PlanItem = { project, file: f, role: 'requested' };
      if (f.url) items.push(item);
      else manual.push({ name: project.title, url: f.pageUrl ?? project.url });
    } catch (e: any) {
      warnings.push(`Could not resolve CurseForge file ${r.projectID}/${r.fileID}: ${e.message}`);
    }
    task.advance();
  }
  const plan: InstallPlan = { items, optional: [], warnings: [], blockers: [], manualDownloads: [] };
  await installPlan(profile.id, plan, task);
  task.stage('Applying configuration files');
  extractOverrides(zip, manifest.overrides || 'overrides', gameDir);
  if (manual.length) warnings.push(`${manual.length} mod(s) must be downloaded manually because their authors disable third-party downloads.`);
  return { profile: await getProfile(profile.id), manualDownloads: manual, warnings };
}

export async function importModpack(file: string, task: Task): Promise<ImportResult> {
  const before = new Set(fs.existsSync(P.profiles()) ? fs.readdirSync(P.profiles()) : []);
  try {
    const lower = file.toLowerCase();
    if (lower.endsWith('.mrpack')) return await importMrpack(file, task);
    if (lower.endsWith('.zip')) {
      const zip = new AdmZip(file);
      if (zip.getEntry('modrinth.index.json')) return await importMrpack(file, task);
      if (zip.getEntry('manifest.json')) return await importCurseForgePack(file, task);
      if (zip.getEntry('profile.json')) return await restoreBackup(file, task);
    }
    throw new LauncherError('Unsupported modpack. Use a Modrinth .mrpack, a CurseForge modpack .zip, or a Lumen backup .zip.');
  } catch (e) {
    // A half-imported profile is worse than none: move whatever was created aside (not erased).
    for (const id of fs.existsSync(P.profiles()) ? fs.readdirSync(P.profiles()) : []) {
      if (!before.has(id)) await deleteProfile(id).catch(() => {});
    }
    throw e;
  }
}

/* =============================== Export =============================== */
const CONFIG_EXPORTS = ['config', 'options.txt', 'servers.dat'];

export async function exportMrpack(profileId: string, dest: string): Promise<{ included: number; skipped: string[] }> {
  const profile = await getProfile(profileId);
  if (profile.loader === 'vanilla') throw new LauncherError('Vanilla profiles have no mods to export.');
  const mods = (await listInstalled(profileId, { identify: true })).filter((m) => m.enabled);
  const gameDir = P.gameDir(profileId);
  const files: any[] = [];
  const skipped: string[] = [];
  for (const m of mods as InstalledView[]) {
    // Only files hosted on Modrinth can be referenced by URL; we never re-bundle third-party jars.
    if (m.provider !== 'modrinth' || !m.downloadUrl) {
      skipped.push(`${m.title} (${m.provider === 'local' ? 'unknown source' : 'not on Modrinth'})`);
      continue;
    }
    const full = path.join(gameDir, 'mods', m.fileName);
    files.push({
      path: `mods/${m.fileName}`,
      hashes: { sha1: m.sha1, sha512: await hashFile(full, 'sha512') },
      env: { client: 'required', server: 'unsupported' },
      downloads: [m.downloadUrl],
      fileSize: m.size,
    });
  }
  const loaderKey = Object.entries(LOADER_DEP).find(([, v]) => v === profile.loader)![0];
  const index = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: '1.0.0',
    name: profile.name,
    summary: profile.notes || `Exported from Lumen Client`,
    files,
    dependencies: { minecraft: profile.mcVersion, ...(profile.loaderVersion ? { [loaderKey]: profile.loaderVersion.replace(`${profile.mcVersion}-`, '') } : {}) },
  };
  const zip = new AdmZip();
  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index, null, 2)));
  for (const c of CONFIG_EXPORTS) {
    const p = path.join(gameDir, c);
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) zip.addLocalFolder(p, `overrides/${c}`);
    else zip.addLocalFile(p, 'overrides');
  }
  zip.writeZip(dest);
  return { included: files.length, skipped };
}

/** Full personal backup (includes the mod jars) - for restoring your own setup, not for sharing. */
export async function exportBackup(profileId: string, dest: string, includeWorlds: boolean): Promise<void> {
  const profile = await getProfile(profileId);
  const zip = new AdmZip();
  zip.addFile('profile.json', Buffer.from(JSON.stringify(profile, null, 2)));
  if (fs.existsSync(P.modsIndex(profileId))) zip.addLocalFile(P.modsIndex(profileId));
  const gameDir = P.gameDir(profileId);
  const dirs = ['mods', 'config', 'resourcepacks', 'shaderpacks', ...(includeWorlds ? ['saves'] : [])];
  for (const d of dirs) if (fs.existsSync(path.join(gameDir, d))) zip.addLocalFolder(path.join(gameDir, d), `minecraft/${d}`);
  for (const f of ['options.txt', 'servers.dat']) if (fs.existsSync(path.join(gameDir, f))) zip.addLocalFile(path.join(gameDir, f), 'minecraft');
  zip.writeZip(dest);
}

/** Restores into a NEW profile; an existing profile is never overwritten. */
export async function restoreBackup(file: string, task: Task): Promise<ImportResult> {
  const zip = new AdmZip(file);
  const metaEntry = zip.getEntry('profile.json');
  if (!metaEntry) throw new LauncherError('This is not a Lumen backup (profile.json is missing).');
  const meta = JSON.parse(metaEntry.getData().toString('utf8')) as Profile;
  task.stage('Restoring backup');
  const warnings: string[] = [];
  const profile = await profileFor(`${meta.name} (restored)`, meta.mcVersion, meta.loader, meta.loaderVersion, { kind: 'backup', name: meta.name }, warnings);
  const gameDir = ensureDir(P.gameDir(profile.id));
  extractOverrides(zip, 'minecraft', gameDir);
  const idx = zip.getEntry('mods.json');
  if (idx) await writeJson(P.modsIndex(profile.id), JSON.parse(idx.getData().toString('utf8')));
  return { profile: await getProfile(profile.id), manualDownloads: [], warnings };
}
