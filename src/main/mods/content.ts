import * as fs from 'fs';
import * as path from 'path';
import { P, ensureDir } from '../paths';
import { Task, downloadFile, randomId } from '../net';
import { LauncherError, logger } from '../logger';
import { getProfile } from '../profiles';
import { hashFile, readJson, safeFileName, writeJson } from '../util';
import { setPackEntry, THEME_FILE } from '../theme';
import { importModpack, ImportResult } from '../modpack';
import { InstallPlan, PlanItem, PlanRequest, compatibility, keyOf } from './resolver';
import { ModFile, ModLoader, ModProject, ProviderId, ReleaseType } from './types';
import { installPlan, listInstalled, planMod, providers } from './manager';
import { modrinth } from './modrinth';

const log = logger('content');

/**
 * Resource packs, shader packs and modpacks. Kept apart from the mod manager on purpose: they have no loader,
 * no dependency graph, and "enabled" means something different (it lives in options.txt / the shader loader's config).
 */
export type PackType = 'resourcepack' | 'shader';

export interface PackEntry {
  key: string;
  type: PackType;
  provider: ProviderId | 'local';
  projectId?: string;
  fileId?: string;
  slug?: string;
  title: string;
  summary?: string;
  iconUrl?: string;
  pageUrl?: string;
  versionNumber: string;
  releaseType?: string;
  datePublished?: string;
  fileName: string;
  sha1: string;
  size: number;
  installedAt: number;
  identified?: boolean;
}

export interface PackView extends PackEntry {
  enabled: boolean;
  missing: boolean;
}

interface PackIndex {
  version: 1;
  packs: PackEntry[];
}

const DIR_NAME: Record<PackType, string> = { resourcepack: 'resourcepacks', shader: 'shaderpacks' };
const packsIndex = (id: string) => path.join(P.profile(id), 'packs.json');
export const packDir = (id: string, type: PackType) => path.join(P.gameDir(id), DIR_NAME[type]);

const locks = new Map<string, Promise<unknown>>();
function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(id, next);
  return next;
}

const loadIdx = (id: string) => readJson<PackIndex>(packsIndex(id), { version: 1, packs: [] });
const saveIdx = (id: string, idx: PackIndex) => writeJson(packsIndex(id), idx);

async function toTrash(id: string, file: string) {
  if (!fs.existsSync(file)) return;
  const dest = path.join(ensureDir(P.trash(id)), `${Date.now()}-${path.basename(file)}`);
  await fs.promises.rename(file, dest);
}

/* ---------- "enabled" state: resource packs live in options.txt, shaders in the loader's properties file ---------- */
function optionsFile(id: string) {
  return path.join(P.gameDir(id), 'options.txt');
}

export function enabledResourcePacks(id: string): Set<string> {
  const f = optionsFile(id);
  if (!fs.existsSync(f)) return new Set();
  const line = fs.readFileSync(f, 'utf8').split(/\r?\n/).find((l) => l.startsWith('resourcePacks:'));
  try {
    const list: string[] = line ? JSON.parse(line.slice('resourcePacks:'.length)) : [];
    return new Set(list.filter((x) => x.startsWith('file/')).map((x) => x.slice(5)));
  } catch {
    return new Set();
  }
}

/** Iris (Fabric/Quilt/NeoForge) and Oculus (Forge) both keep the chosen shader in a .properties file. */
function shaderPropsFile(id: string, loader: string) {
  return path.join(P.gameDir(id), 'config', loader === 'forge' ? 'oculus.properties' : 'iris.properties');
}

export function selectedShader(id: string, loader: string): string {
  const f = shaderPropsFile(id, loader);
  if (!fs.existsSync(f)) return '';
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  const pack = lines.find((l) => l.startsWith('shaderPack='))?.slice('shaderPack='.length).trim() ?? '';
  const on = lines.find((l) => l.startsWith('enableShaders='))?.slice('enableShaders='.length).trim();
  return on === 'false' ? '' : pack;
}

function writeShaderProps(id: string, loader: string, pack: string) {
  const f = shaderPropsFile(id, loader);
  ensureDir(path.dirname(f));
  let lines = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l !== '') : [];
  const set = (k: string, v: string) => {
    const i = lines.findIndex((l) => l.startsWith(k + '='));
    if (i >= 0) lines[i] = `${k}=${v}`;
    else lines.push(`${k}=${v}`);
  };
  set('shaderPack', pack);
  set('enableShaders', pack ? 'true' : 'false');
  lines = lines.filter((l) => !l.startsWith('#'));
  fs.writeFileSync(f, lines.join('\n') + '\n');
}

/* ---------- listing ---------- */
export async function listPacks(id: string, type: PackType, opts: { identify?: boolean } = {}): Promise<PackView[]> {
  return withLock(id, async () => {
    const profile = await getProfile(id);
    const idx = await loadIdx(id);
    const dir = ensureDir(packDir(id, type));
    const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.zip') && f !== THEME_FILE);
    let changed = false;
    for (const name of files) {
      if (idx.packs.some((p) => p.type === type && p.fileName === name)) continue;
      const full = path.join(dir, name);
      const sha1 = await hashFile(full, 'sha1');
      idx.packs.push({ key: `local:${sha1.slice(0, 12)}`, type, provider: 'local', title: name.replace(/\.zip$/i, ''), versionNumber: '', fileName: name, sha1, size: fs.statSync(full).size, installedAt: Date.now() });
      changed = true;
    }
    if (opts.identify !== false) {
      const unknown = idx.packs.filter((p) => p.type === type && p.provider === 'local' && !p.identified);
      if (unknown.length) {
        try {
          const found = (await modrinth.identifyByHashes?.(unknown.map((p) => p.sha1))) ?? {};
          for (const p of unknown) {
            p.identified = true;
            const hit = found[p.sha1];
            if (hit && hit.project.type === type) {
              Object.assign(p, entryFields(hit.project, hit.file));
              p.key = keyOf('modrinth', hit.project.id);
            }
          }
        } catch (e) {
          log.warn('Pack identification failed (offline?)', e as Error);
          for (const p of unknown) p.identified = false;
        }
        changed = true;
      }
    }
    const seen = new Set<string>();
    idx.packs = idx.packs.filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)));
    if (changed) await saveIdx(id, idx);

    const enabledRes = enabledResourcePacks(id);
    const shader = selectedShader(id, profile.loader);
    return idx.packs
      .filter((p) => p.type === type)
      .map((p): PackView => ({
        ...p,
        missing: !fs.existsSync(path.join(dir, p.fileName)),
        enabled: type === 'resourcepack' ? enabledRes.has(p.fileName) : shader === p.fileName,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  });
}

function entryFields(project: ModProject, file: ModFile): Partial<PackEntry> {
  return {
    provider: project.provider,
    projectId: project.id,
    fileId: file.fileId,
    slug: project.slug,
    title: project.title,
    summary: project.summary,
    iconUrl: project.iconUrl,
    pageUrl: project.url,
    versionNumber: file.versionNumber,
    releaseType: file.releaseType,
    datePublished: file.datePublished,
  };
}

/* ---------- enable / disable / remove ---------- */
export async function setPackEnabled(id: string, key: string, enabled: boolean) {
  return withLock(id, async () => {
    const profile = await getProfile(id);
    const p = (await loadIdx(id)).packs.find((x) => x.key === key);
    if (!p) throw new LauncherError('Pack not found in this profile.');
    if (p.type === 'resourcepack') {
      const f = optionsFile(id);
      const before = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
      if (before) fs.copyFileSync(f, f + '.lumen-bak');
      // enabling puts it on top (highest priority) so it actually shows
      fs.writeFileSync(f, setPackEntry(before, `file/${p.fileName}`, enabled, 'high'));
    } else {
      if (profile.loader === 'vanilla') throw new LauncherError('Shaders need a mod loader with Iris (or Oculus). Change this profile to Fabric, Quilt, Forge or NeoForge.');
      writeShaderProps(id, profile.loader, enabled ? p.fileName : '');
    }
  });
}

export async function removePack(id: string, key: string) {
  const profile = await getProfile(id);
  await withLock(id, async () => {
    const idx = await loadIdx(id);
    const p = idx.packs.find((x) => x.key === key);
    if (!p) throw new LauncherError('Pack not found in this profile.');
    if (p.type === 'resourcepack') {
      const f = optionsFile(id);
      if (fs.existsSync(f)) fs.writeFileSync(f, setPackEntry(fs.readFileSync(f, 'utf8'), `file/${p.fileName}`, false));
    } else if (selectedShader(id, profile.loader) === p.fileName) writeShaderProps(id, profile.loader, '');
    await toTrash(id, path.join(packDir(id, p.type), p.fileName)); // moved, never erased
    idx.packs = idx.packs.filter((x) => x.key !== key);
    await saveIdx(id, idx);
    log.info(`Removed ${p.type} ${p.title} from ${id} (moved to trash)`);
  });
}

/* ---------- choosing a file ---------- */
/** Packs rarely list every Minecraft patch version, so prefer an exact match but fall back to the newest build. */
export function pickPackFile(files: ModFile[], mc: string): { file: ModFile; exact: boolean } | undefined {
  if (!files.length) return undefined;
  const rank: Record<ReleaseType, number> = { release: 0, beta: 1, alpha: 2 };
  const sorted = [...files].sort((a, b) => rank[a.releaseType] - rank[b.releaseType] || Date.parse(b.datePublished) - Date.parse(a.datePublished));
  const exact = sorted.find((f) => f.gameVersions.includes(mc));
  if (exact) return { file: exact, exact: true };
  return { file: sorted[0], exact: false };
}

const SHADER_LOADER: Record<string, string> = { fabric: 'iris', quilt: 'iris', neoforge: 'iris', forge: 'oculus' };

/** Plan a resource pack / shader install. Shaders also pull in Iris (or Oculus on Forge) and its dependencies. */
export async function planPack(id: string, req: PlanRequest & { type: PackType }): Promise<InstallPlan> {
  const profile = await getProfile(id);
  const prov = providers[req.provider];
  const st = await prov.status();
  if (!st.ok) throw new LauncherError(st.reason ?? `${req.provider} is unavailable.`);
  if (req.type === 'shader' && profile.loader === 'vanilla') {
    throw new LauncherError('Shaders need a mod loader that supports them (Iris). Change this profile to Fabric, Quilt, Forge or NeoForge first.');
  }
  const project = await prov.getProject(req.projectId);
  const plan: InstallPlan = { items: [], optional: [], warnings: [], blockers: [], manualDownloads: [] };

  let file: ModFile | undefined;
  let exact = true;
  if (req.fileId) {
    file = await prov.getFile(req.projectId, req.fileId);
    exact = file.gameVersions.includes(profile.mcVersion);
  } else {
    let files = await prov.getFiles(req.projectId, { mcVersion: profile.mcVersion });
    if (!files.length) files = await prov.getFiles(req.projectId);
    const pick = pickPackFile(files, profile.mcVersion);
    file = pick?.file;
    exact = pick?.exact ?? false;
  }
  if (!file) throw new LauncherError(`${project.title} has no downloadable files.`);
  const item: PlanItem = { project, file, role: 'requested' };
  if (!exact) {
    item.loaderNote = `Built for Minecraft ${file.gameVersions.slice(0, 3).join(', ') || 'another version'}, not ${profile.mcVersion}.`;
    plan.warnings.push(`${project.title} does not list Minecraft ${profile.mcVersion}. It often still works, but it may not.`);
  }
  if (file.url === null) {
    plan.manualDownloads.push(item);
    plan.warnings.push(`${project.title}: the author does not allow automatic downloads. Download it from the website instead.`);
  }
  plan.items.push(item);

  if (req.type === 'shader') {
    const slug = SHADER_LOADER[profile.loader];
    const have = (await listInstalled(id, { identify: false })).some((m) => m.slug === slug || m.meta?.modId === slug);
    if (!have) {
      try {
        const loaderProject = await modrinth.getProject(slug);
        // Iris/Sodium (and Oculus/Embeddium) must be a matching pair, and "newest release of each" often is not one:
        // pick the newest loader build that pins the exact dependency build its authors tested it with.
        const target = { mcVersion: profile.mcVersion, loader: profile.loader as ModLoader, allowBeta: true };
        const loaderFiles = (await modrinth.getFiles(loaderProject.id, { mcVersion: profile.mcVersion, loader: profile.loader as ModLoader }))
          .filter((f) => compatibility(f, target).ok)
          .sort((a, b) => Date.parse(b.datePublished) - Date.parse(a.datePublished));
        const pinned = loaderFiles.find((f) => f.dependencies.some((d) => d.type === 'required' && d.fileId)) ?? loaderFiles[0];
        const sub = await planMod(id, { provider: 'modrinth', projectId: loaderProject.id, fileId: pinned?.fileId });
        for (const it of sub.items) plan.items.push({ ...it, role: 'dependency', requiredBy: it.role === 'requested' ? project.title : it.requiredBy });
        plan.warnings.push(...sub.warnings);
        plan.blockers.push(...sub.blockers);
      } catch (e: any) {
        plan.warnings.push(`Shaders need ${slug === 'iris' ? 'Iris' : 'Oculus'}, which has no compatible release for Minecraft ${profile.mcVersion} on ${profile.loader} (${e.message}). The pack will be installed but will not work until a shader loader is available.`);
      }
    }
  }
  return plan;
}

/* ---------- installing ---------- */
export async function installPacks(id: string, plan: InstallPlan, task: Task): Promise<{ installed: string[]; skipped: string[] }> {
  const modItems = plan.items.filter((i) => i.project.type === 'mod');
  const packItems = plan.items.filter((i) => i.project.type !== 'mod' && i.file.url);
  const skipped = plan.items.filter((i) => i.project.type !== 'mod' && !i.file.url).map((i) => i.project.title);
  const installed: string[] = [];
  if (modItems.length) {
    const r = await installPlan(id, { ...plan, items: modItems, manualDownloads: [] }, task); // shader loader + dependencies, staged and verified
    installed.push(...r.installed);
  }
  await withLock(id, async () => {
    const idx = await loadIdx(id);
    const stage = ensureDir(path.join(P.tmp(), `stage-${randomId()}`));
    try {
      task.stage('Downloading packs', packItems.length);
      for (const it of packItems) {
        task.throwIfCancelled();
        const type = it.project.type as PackType;
        const name = safeFileName(it.file.fileName);
        const staged = path.join(stage, `${it.file.fileId}-${name}`);
        await downloadFile({ url: it.file.url!, dest: staged, sha1: it.file.sha1, sha512: it.file.sha512, size: it.file.size || undefined }, { signal: task.signal });
        task.advance();
        const dest = path.join(ensureDir(packDir(id, type)), name);
        const key = keyOf(it.file.provider, it.file.projectId);
        const existing = idx.packs.find((p) => p.key === key);
        if (existing) await toTrash(id, path.join(packDir(id, existing.type), existing.fileName));
        else if (fs.existsSync(dest)) await toTrash(id, dest);
        await fs.promises.rename(staged, dest).catch(async () => fs.promises.copyFile(staged, dest));
        const base: PackEntry = existing ?? { key, type, provider: it.file.provider, title: it.project.title, versionNumber: '', fileName: name, sha1: '', size: 0, installedAt: Date.now() };
        Object.assign(base, entryFields(it.project, it.file), { fileName: name, sha1: await hashFile(dest, 'sha1'), size: fs.statSync(dest).size, installedAt: Date.now() });
        if (!existing) idx.packs.push(base);
        installed.push(it.project.title);
      }
      await saveIdx(id, idx);
    } finally {
      await fs.promises.rm(stage, { recursive: true, force: true }).catch(() => {});
    }
  });
  return { installed, skipped };
}

/* ---------- updates ---------- */
export async function checkPackUpdates(id: string, type: PackType) {
  const profile = await getProfile(id);
  const packs = (await listPacks(id, type)).filter((p) => p.provider !== 'local' && p.projectId && !p.missing);
  const updates: { key: string; title: string; current: string; latest: ModFile }[] = [];
  const unchecked: string[] = [];
  for (const p of packs) {
    const prov = providers[p.provider as ProviderId];
    try {
      if (!(await prov.status()).ok) {
        unchecked.push(p.title);
        continue;
      }
      let files = await prov.getFiles(p.projectId!, { mcVersion: profile.mcVersion });
      if (!files.length) files = await prov.getFiles(p.projectId!);
      const pick = pickPackFile(files, profile.mcVersion);
      if (pick && pick.file.fileId !== p.fileId && Date.parse(pick.file.datePublished) > Date.parse(p.datePublished ?? '1970-01-01')) {
        updates.push({ key: p.key, title: p.title, current: p.versionNumber, latest: pick.file });
      }
    } catch {
      unchecked.push(p.title);
    }
  }
  return { updates, unchecked };
}

export async function updatePack(id: string, key: string, task: Task) {
  const all = [...(await listPacks(id, 'resourcepack')), ...(await listPacks(id, 'shader'))];
  const p = all.find((x) => x.key === key);
  if (!p || !p.projectId || p.provider === 'local') throw new LauncherError('This pack is not tracked by a mod source, so it cannot be updated automatically.');
  const { updates } = await checkPackUpdates(id, p.type);
  const u = updates.find((x) => x.key === key);
  if (!u) throw new LauncherError(`${p.title} is already up to date.`);
  const plan = await planPack(id, { provider: p.provider as ProviderId, projectId: p.projectId, fileId: u.latest.fileId, type: p.type });
  // keep the shader selected / the pack enabled if it was
  const wasEnabled = p.enabled;
  const r = await installPacks(id, { ...plan, items: plan.items.filter((i) => i.project.type !== 'mod') }, task);
  if (wasEnabled) {
    const fresh = (await listPacks(id, p.type, { identify: false })).find((x) => x.key === key);
    if (fresh) await setPackEnabled(id, key, true);
  }
  return r;
}

/* ---------- modpacks: always become a brand-new profile ---------- */
export async function installModpackFromProject(provider: ProviderId, projectId: string, fileId: string | undefined, task: Task): Promise<ImportResult> {
  const prov = providers[provider];
  const st = await prov.status();
  if (!st.ok) throw new LauncherError(st.reason ?? `${provider} is unavailable.`);
  task.stage('Finding the latest modpack version');
  const project = await prov.getProject(projectId);
  const files = fileId ? [await prov.getFile(projectId, fileId)] : await prov.getFiles(projectId);
  const rank: Record<ReleaseType, number> = { release: 0, beta: 1, alpha: 2 };
  const file = [...files].sort((a, b) => rank[a.releaseType] - rank[b.releaseType] || Date.parse(b.datePublished) - Date.parse(a.datePublished))[0];
  if (!file) throw new LauncherError(`${project.title} has no downloadable versions.`);
  if (!file.url) throw new LauncherError(`${project.title}: the author does not allow automatic downloads. Download the pack from ${file.pageUrl ?? project.url} and use Profiles → Import modpack.`);
  const ext = file.fileName.toLowerCase().endsWith('.mrpack') ? '.mrpack' : '.zip';
  const tmp = path.join(ensureDir(P.tmp()), `modpack-${randomId()}${ext}`);
  try {
    task.stage(`Downloading ${project.title}`);
    await downloadFile({ url: file.url, dest: tmp, sha1: file.sha1, sha512: file.sha512, size: file.size || undefined }, { signal: task.signal });
    return await importModpack(tmp, task);
  } finally {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
  }
}
