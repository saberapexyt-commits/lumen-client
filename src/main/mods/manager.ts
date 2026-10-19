import * as fs from 'fs';
import * as path from 'path';
import { P, ensureDir } from '../paths';
import { Task, downloadFile, randomId } from '../net';
import { LauncherError, logger } from '../logger';
import { getSettings } from '../settings';
import { Profile, getProfile } from '../profiles';
import { hashFile, readJson, safeFileName, writeJson } from '../util';
import { JarMeta, isBuiltinDep, readJarMeta } from './jarmeta';
import { InstallPlan, InstalledRef, PlanRequest, Target, compatibility, keyOf, pickBestFile, planInstall } from './resolver';
import { ModFile, ModLoader, ModProject, ModProvider, ProviderId } from './types';
import { modrinth } from './modrinth';
import { curseforge } from './curseforge';

const log = logger('mods');

export const providers: Record<ProviderId, ModProvider> = { modrinth, curseforge };

export interface InstalledMod {
  key: string;
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
  /** Modrinth CDN URL, kept so profiles can be exported as .mrpack without redistributing files */
  downloadUrl?: string;
  fileName: string; // canonical jar name (without ".disabled")
  sha1: string;
  size: number;
  role: 'user' | 'dependency';
  requiredBy: string[];
  dependsOn: string[];
  /** display names for dependsOn keys, so a missing dependency can be named even after it is removed */
  depNames?: Record<string, string>;
  incompatibles: string[];
  installedAt: number;
  meta?: JarMeta;
  /** set once a hash lookup for this local jar was attempted, so we do not retry on every refresh */
  identified?: boolean;
}

interface IndexFile {
  version: 1;
  mods: InstalledMod[];
}

export interface InstalledView extends InstalledMod {
  enabled: boolean;
  missing: boolean;
  loaderMismatch?: string;
}

/* ---------- per-profile serialisation: two operations never interleave writes ---------- */
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(profileId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(profileId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(profileId, next);
  return next;
}

async function loadIndex(id: string): Promise<IndexFile> {
  return readJson<IndexFile>(P.modsIndex(id), { version: 1, mods: [] });
}
async function saveIndex(id: string, idx: IndexFile) {
  await writeJson(P.modsIndex(id), idx);
}

/** Copy the mod index aside before any destructive change. Keeps the newest 30. */
async function snapshot(id: string, reason: string) {
  const src = P.modsIndex(id);
  if (!fs.existsSync(src)) return;
  const dir = ensureDir(P.backups(id));
  await fs.promises.copyFile(src, path.join(dir, `mods-${Date.now()}-${reason}.json`));
  const snaps = fs.readdirSync(dir).filter((f) => f.startsWith('mods-')).sort();
  for (const old of snaps.slice(0, Math.max(0, snaps.length - 30))) await fs.promises.rm(path.join(dir, old), { force: true });
}

/** Move a file to the profile trash instead of deleting it. */
async function toTrash(id: string, file: string): Promise<string | null> {
  if (!fs.existsSync(file)) return null;
  const dest = path.join(ensureDir(P.trash(id)), `${Date.now()}-${path.basename(file)}`);
  await fs.promises.rename(file, dest);
  return dest;
}

const jarPath = (id: string, m: Pick<InstalledMod, 'fileName'>, enabled = true) => path.join(P.modsDir(id), m.fileName + (enabled ? '' : '.disabled'));

function targetOf(p: Profile, allowBeta: boolean): Target {
  if (p.loader === 'vanilla') throw new LauncherError('Vanilla profiles cannot use mods. Change this profile\'s loader to Fabric, Quilt, Forge or NeoForge first.');
  return { mcVersion: p.mcVersion, loader: p.loader as ModLoader, allowBeta };
}

function refs(mods: InstalledView[]): InstalledRef[] {
  return mods.map((m) => ({
    provider: m.provider,
    projectId: m.projectId,
    slug: m.slug,
    title: m.title,
    enabled: m.enabled,
    incompatibles: m.incompatibles,
  }));
}

/* ---------- listing & reconciliation with what is really on disk ---------- */
export async function listInstalled(profileId: string, opts: { identify?: boolean } = {}): Promise<InstalledView[]> {
  return withLock(profileId, async () => {
    const profile = await getProfile(profileId);
    const idx = await loadIndex(profileId);
    const dir = ensureDir(P.modsDir(profileId));
    const onDisk = new Map<string, boolean>(); // canonical name -> enabled
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.jar')) onDisk.set(f, true);
      else if (f.endsWith('.jar.disabled')) onDisk.set(f.slice(0, -'.disabled'.length), false);
    }

    let changed = false;
    // Adopt jars we did not install (manual copies, imports) as "local" entries.
    for (const [name] of onDisk) {
      if (idx.mods.some((m) => m.fileName === name)) continue;
      const full = jarPath(profileId, { fileName: name }, onDisk.get(name));
      const sha1 = await hashFile(full, 'sha1');
      const meta = readJarMeta(full);
      idx.mods.push({
        key: `local:${sha1.slice(0, 12)}`,
        provider: 'local',
        title: meta.name || name.replace(/\.jar$/, ''),
        versionNumber: meta.version ?? '',
        fileName: name,
        sha1,
        size: fs.statSync(full).size,
        role: 'user',
        requiredBy: [],
        dependsOn: [],
        incompatibles: [],
        installedAt: Date.now(),
        meta,
      });
      changed = true;
    }

    // Try to recognise local jars on Modrinth by hash so they gain icons, update checks, links.
    if (opts.identify !== false) {
      const unknown = idx.mods.filter((m) => m.provider === 'local' && !m.identified);
      if (unknown.length) {
        try {
          const found = (await modrinth.identifyByHashes?.(unknown.map((m) => m.sha1))) ?? {};
          for (const m of unknown) {
            m.identified = true;
            const hit = found[m.sha1];
            if (!hit) continue;
            applyFile(m, hit.project, hit.file);
            m.key = keyOf('modrinth', hit.project.id);
          }
        } catch (e) {
          log.warn('Hash identification failed (offline?)', e as Error); // retried next time
          for (const m of unknown) m.identified = false;
        }
        changed = true;
      }
    }
    // Deduplicate keys that collapsed onto the same project.
    const seen = new Set<string>();
    idx.mods = idx.mods.filter((m) => (seen.has(m.key) ? false : (seen.add(m.key), true)));
    if (changed) await saveIndex(profileId, idx);

    return idx.mods
      .map((m): InstalledView => {
        const enabled = onDisk.get(m.fileName) ?? false;
        const missing = !onDisk.has(m.fileName);
        let loaderMismatch: string | undefined;
        const jl = m.meta?.loader;
        if (jl && profile.loader !== 'vanilla' && jl !== profile.loader && !(profile.loader === 'quilt' && jl === 'fabric')) {
          loaderMismatch = `This is a ${jl} mod but the profile uses ${profile.loader}.`;
        }
        return { ...m, enabled, missing, loaderMismatch };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  });
}

function applyFile(m: InstalledMod, project: ModProject, file: ModFile) {
  m.provider = project.provider;
  m.projectId = project.id;
  m.fileId = file.fileId;
  m.slug = project.slug;
  m.title = project.title;
  m.summary = project.summary;
  m.iconUrl = project.iconUrl;
  m.pageUrl = project.url;
  m.downloadUrl = file.provider === 'modrinth' ? (file.url ?? undefined) : undefined;
  m.versionNumber = file.versionNumber;
  m.releaseType = file.releaseType;
  m.datePublished = file.datePublished;
  m.incompatibles = file.dependencies.filter((d) => d.type === 'incompatible').map((d) => keyOf(file.provider, d.projectId));
  m.dependsOn = file.dependencies.filter((d) => d.type === 'required').map((d) => keyOf(file.provider, d.projectId));
}

/* ---------- planning ---------- */
export async function planMod(profileId: string, req: PlanRequest): Promise<InstallPlan> {
  const profile = await getProfile(profileId);
  const settings = await getSettings();
  const installed = await listInstalled(profileId, { identify: false });
  const st = await providers[req.provider].status();
  if (!st.ok) throw new LauncherError(st.reason ?? `${req.provider} is unavailable.`);
  return planInstall(providers, req, targetOf(profile, settings.allowBetaMods), refs(installed));
}

/** All releases of a project, each annotated with compatibility for the profile - powers the "other versions" picker. */
export async function listVersions(profileId: string, provider: ProviderId, projectId: string) {
  const profile = await getProfile(profileId);
  const target = targetOf(profile, true);
  const files = await providers[provider].getFiles(projectId);
  const best = pickBestFile(files, target);
  return files
    .map((f) => {
      const c = compatibility(f, target);
      return { file: f, compatible: c.ok, reason: c.reason, recommended: best?.fileId === f.fileId, viaFabric: c.via === 'fabric-on-quilt' };
    })
    .sort((a, b) => Number(b.compatible) - Number(a.compatible) || Date.parse(b.file.datePublished) - Date.parse(a.file.datePublished));
}

/* ---------- executing a plan ---------- */
export async function installPlan(profileId: string, plan: InstallPlan, task: Task, extraOptional: PlanRequest[] = []): Promise<{ installed: string[]; skipped: string[] }> {
  const profile = await getProfile(profileId);
  const items = [...plan.items];
  // User-ticked optional dependencies: resolve them into the same transaction.
  for (const o of extraOptional) {
    const sub = await planMod(profileId, o);
    for (const it of sub.items) if (!items.some((x) => x.file.fileId === it.file.fileId && x.file.provider === it.file.provider)) items.push({ ...it, role: 'dependency', requiredBy: it.requiredBy ?? 'optional' });
  }
  const downloadable = items.filter((i) => i.file.url);
  const skipped = items.filter((i) => !i.file.url).map((i) => i.project.title);

  return withLock(profileId, async () => {
    const idx = await loadIndex(profileId);
    await snapshot(profileId, 'install');
    const stage = ensureDir(path.join(P.tmp(), `stage-${randomId()}`));
    try {
      // 1) Download + verify everything into a staging dir first. A failure here changes nothing.
      task.stage('Downloading mods', downloadable.length);
      for (const it of downloadable) {
        task.throwIfCancelled();
        const name = safeFileName(it.file.fileName);
        await downloadFile({ url: it.file.url!, dest: path.join(stage, `${it.file.fileId}-${name}`), sha1: it.file.sha1, sha512: it.file.sha512, size: it.file.size || undefined }, { signal: task.signal });
        task.advance();
      }
      // 2) Commit: move into the mods folder; previous versions go to trash, never deleted.
      const installed: string[] = [];
      for (const it of downloadable) {
        const name = safeFileName(it.file.fileName);
        const key = keyOf(it.file.provider, it.file.projectId);
        const existing = idx.mods.find((m) => m.key === key);
        let wasDisabled = false;
        if (existing) {
          wasDisabled = !fs.existsSync(jarPath(profileId, existing, true)) && fs.existsSync(jarPath(profileId, existing, false));
          await toTrash(profileId, jarPath(profileId, existing, true));
          await toTrash(profileId, jarPath(profileId, existing, false));
        }
        // A different, untracked file with the same name: keep it in trash too.
        const clash = jarPath(profileId, { fileName: name }, true);
        if (fs.existsSync(clash) && !idx.mods.some((m) => m.fileName === name && m.key !== key)) await toTrash(profileId, clash);
        const staged = path.join(stage, `${it.file.fileId}-${name}`);
        const final = jarPath(profileId, { fileName: name }, !wasDisabled);
        await fs.promises.rename(staged, final).catch(async () => {
          await fs.promises.copyFile(staged, final);
        });

        const entry: InstalledMod = existing ?? {
          key,
          provider: it.file.provider,
          title: it.project.title,
          versionNumber: '',
          fileName: name,
          sha1: '',
          size: 0,
          role: it.role === 'requested' ? 'user' : 'dependency',
          requiredBy: [],
          dependsOn: [],
          incompatibles: [],
          installedAt: Date.now(),
        };
        applyFile(entry, it.project, it.file);
        entry.fileName = name;
        entry.sha1 = await hashFile(final, 'sha1');
        entry.size = fs.statSync(final).size;
        entry.meta = readJarMeta(final);
        entry.installedAt = Date.now();
        if (it.role === 'requested') entry.role = 'user'; // explicitly requested wins over dependency
        if (!existing) idx.mods.push(entry);
        installed.push(it.project.title);
      }
      const names = new Map<string, string>();
      for (const it of items) names.set(keyOf(it.file.provider, it.file.projectId), it.project.title);
      for (const m of idx.mods) names.set(m.key, m.title);
      for (const m of idx.mods) {
        m.depNames = { ...(m.depNames ?? {}) };
        for (const d of m.dependsOn) if (names.has(d)) m.depNames[d] = names.get(d)!;
      }
      // Record who needs whom so removal can warn and orphans can be found.
      for (const m of idx.mods) {
        for (const dep of m.dependsOn) {
          const d = idx.mods.find((x) => x.key === dep);
          if (d && !d.requiredBy.includes(m.key)) d.requiredBy.push(m.key);
        }
      }
      await saveIndex(profileId, idx);
      log.info(`Installed into ${profile.id}: ${installed.join(', ')}`);
      return { installed, skipped };
    } finally {
      await fs.promises.rm(stage, { recursive: true, force: true }).catch(() => {});
    }
  });
}

/* ---------- enable / disable / remove ---------- */
export async function setEnabled(profileId: string, key: string, enabled: boolean) {
  return withLock(profileId, async () => {
    const idx = await loadIndex(profileId);
    const m = idx.mods.find((x) => x.key === key);
    if (!m) throw new LauncherError('Mod not found in this profile.');
    const on = jarPath(profileId, m, true);
    const off = jarPath(profileId, m, false);
    if (enabled && fs.existsSync(off)) await fs.promises.rename(off, on);
    else if (!enabled && fs.existsSync(on)) await fs.promises.rename(on, off);
    else if (!fs.existsSync(on) && !fs.existsSync(off)) throw new LauncherError(`${m.fileName} is missing from the mods folder.`);
  });
}

/** Mods that declare `key` as a required dependency (and are still installed). */
export async function dependentsOf(profileId: string, key: string): Promise<{ key: string; title: string }[]> {
  const idx = await loadIndex(profileId);
  const target = idx.mods.find((m) => m.key === key);
  const providedIds = new Set([target?.meta?.modId, ...(target?.meta?.provides ?? [])].filter(Boolean) as string[]);
  return idx.mods
    .filter((m) => m.key !== key && (m.dependsOn.includes(key) || m.meta?.depends.some((d) => providedIds.has(d))))
    .map((m) => ({ key: m.key, title: m.title }));
}

export async function removeMod(profileId: string, key: string): Promise<{ orphans: { key: string; title: string }[] }> {
  return withLock(profileId, async () => {
    const idx = await loadIndex(profileId);
    const m = idx.mods.find((x) => x.key === key);
    if (!m) throw new LauncherError('Mod not found in this profile.');
    await snapshot(profileId, 'remove');
    await toTrash(profileId, jarPath(profileId, m, true));
    await toTrash(profileId, jarPath(profileId, m, false));
    idx.mods = idx.mods.filter((x) => x.key !== key);
    for (const o of idx.mods) o.requiredBy = o.requiredBy.filter((k) => k !== key);
    await saveIndex(profileId, idx);
    log.info(`Removed ${m.title} from ${profileId} (moved to trash)`);
    return { orphans: idx.mods.filter((x) => x.role === 'dependency' && x.requiredBy.length === 0).map((x) => ({ key: x.key, title: x.title })) };
  });
}

/* ---------- updates ---------- */
export interface UpdateInfo {
  key: string;
  title: string;
  current: string;
  latest: ModFile;
}

export async function checkUpdates(profileId: string): Promise<{ updates: UpdateInfo[]; unchecked: string[] }> {
  const profile = await getProfile(profileId);
  const settings = await getSettings();
  const target = targetOf(profile, settings.allowBetaMods);
  const mods = (await listInstalled(profileId)).filter((m) => m.provider !== 'local' && m.projectId && !m.missing);
  const updates: UpdateInfo[] = [];
  const unchecked: string[] = [];
  const status: Partial<Record<ProviderId, boolean>> = {};
  let i = 0;
  const worker = async () => {
    while (i < mods.length) {
      const m = mods[i++];
      const prov = providers[m.provider as ProviderId];
      if (status[m.provider as ProviderId] === undefined) status[m.provider as ProviderId] = (await prov.status()).ok;
      if (!status[m.provider as ProviderId]) {
        unchecked.push(m.title);
        continue;
      }
      try {
        const files = await prov.getFiles(m.projectId!, { mcVersion: target.mcVersion, loader: target.loader });
        const best = pickBestFile(files, target);
        // Only newer *and* different; never "update" to an older build or a worse release tier.
        if (best && best.fileId !== m.fileId && Date.parse(best.datePublished) > Date.parse(m.datePublished ?? '1970-01-01')) {
          if (best.releaseType === 'release' || m.releaseType !== 'release') updates.push({ key: m.key, title: m.title, current: m.versionNumber, latest: best });
        }
      } catch (e) {
        log.warn(`Update check failed for ${m.title}`, e as Error);
        unchecked.push(m.title);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { updates, unchecked };
}

export async function updateMod(profileId: string, key: string, task: Task) {
  const mods = await listInstalled(profileId);
  const m = mods.find((x) => x.key === key);
  if (!m || !m.projectId || m.provider === 'local') throw new LauncherError('This mod is not tracked by a mod source, so it cannot be updated automatically.');
  const { updates } = await checkUpdates(profileId);
  const u = updates.find((x) => x.key === key);
  if (!u) throw new LauncherError(`${m.title} is already up to date.`);
  const plan = await planMod(profileId, { provider: m.provider as ProviderId, projectId: m.projectId, fileId: u.latest.fileId });
  return installPlan(profileId, plan, task);
}

/* ---------- import ---------- */
export async function importJars(profileId: string, files: string[]): Promise<{ added: string[]; skipped: string[] }> {
  await getProfile(profileId);
  const dir = ensureDir(P.modsDir(profileId));
  const added: string[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    if (!f.toLowerCase().endsWith('.jar')) {
      skipped.push(`${path.basename(f)} (not a .jar)`);
      continue;
    }
    let name = safeFileName(f);
    const existingHash = fs.existsSync(path.join(dir, name)) ? await hashFile(path.join(dir, name)) : null;
    if (existingHash && existingHash === (await hashFile(f))) {
      skipped.push(`${name} (already present)`);
      continue;
    }
    for (let n = 1; fs.existsSync(path.join(dir, name)); n++) name = safeFileName(f).replace(/\.jar$/, ` (${n}).jar`);
    await fs.promises.copyFile(f, path.join(dir, name));
    added.push(name);
  }
  await listInstalled(profileId); // adopt + identify
  return { added, skipped };
}

export async function importFolder(profileId: string, folder: string) {
  const jars = fs
    .readdirSync(folder)
    .filter((f) => f.toLowerCase().endsWith('.jar'))
    .map((f) => path.join(folder, f));
  return importJars(profileId, jars);
}

/* ---------- health check ---------- */
export interface Problem {
  severity: 'error' | 'warning';
  mod: string;
  message: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Check enabled mods for missing dependencies (provider metadata + jar metadata), wrong loader and duplicates. */
export async function diagnose(profileId: string): Promise<Problem[]> {
  const profile = await getProfile(profileId);
  const mods = (await listInstalled(profileId, { identify: false })).filter((m) => m.enabled);
  const provided = new Set<string>();
  const topIds = new Map<string, string>(); // top-level mod id -> jar title
  const problems: Problem[] = [];
  for (const m of mods) {
    for (const id of [m.meta?.modId, ...(m.meta?.provides ?? [])]) if (id) provided.add(id);
    const id = m.meta?.modId;
    if (id) {
      // Nested (jar-in-jar) copies are resolved by the loader; only two top-level jars with one id is a real conflict.
      if (topIds.has(id)) problems.push({ severity: 'error', mod: m.title, message: `Duplicate mod id "${id}" - "${topIds.get(id)}" provides it too. Remove or disable one.` });
      else topIds.set(id, m.title);
    }
  }
  const enabledKeys = new Set(mods.map((m) => m.key));
  for (const m of mods) {
    if (m.loaderMismatch) problems.push({ severity: 'error', mod: m.title, message: m.loaderMismatch });
    const named = new Set<string>();
    for (const k of m.dependsOn) {
      const label = m.depNames?.[k] ?? k;
      named.add(norm(label));
      if (!enabledKeys.has(k)) problems.push({ severity: 'error', mod: m.title, message: `Requires "${label}", which is not installed or is disabled.` });
    }
    for (const dep of m.meta?.depends ?? []) {
      if (isBuiltinDep(dep) || provided.has(dep) || named.has(norm(dep))) continue;
      problems.push({ severity: 'error', mod: m.title, message: `Requires "${dep}", which is not installed or is disabled.` });
    }
    for (const k of m.incompatibles) {
      const other = mods.find((x) => x.key === k);
      if (other) problems.push({ severity: 'warning', mod: m.title, message: `Marked incompatible with "${other.title}".` });
    }
  }
  for (const m of await loadIndexMissing(profileId)) problems.push({ severity: 'warning', mod: m, message: 'The jar file is missing from the mods folder (deleted outside the launcher?).' });
  if (profile.loader === 'vanilla' && mods.length) problems.push({ severity: 'warning', mod: 'Profile', message: 'This is a Vanilla profile but the mods folder has mods; they will not be loaded.' });
  return problems;
}

async function loadIndexMissing(profileId: string): Promise<string[]> {
  const idx = await loadIndex(profileId);
  return idx.mods.filter((m) => !fs.existsSync(jarPath(profileId, m, true)) && !fs.existsSync(jarPath(profileId, m, false))).map((m) => m.title);
}

/* ---------- curated optimisation pack ---------- */
const PERF_PACK: Record<ModLoader, string[]> = {
  fabric: ['sodium', 'lithium', 'ferrite-core', 'immediatelyfast', 'entityculling', 'modernfix'],
  quilt: ['sodium', 'lithium', 'ferrite-core', 'immediatelyfast', 'entityculling', 'modernfix'],
  neoforge: ['sodium', 'lithium', 'ferrite-core', 'immediatelyfast', 'entityculling', 'modernfix'],
  forge: ['embeddium', 'ferrite-core', 'modernfix', 'entityculling'],
};

/** Install the optimisation mods that have a release for this profile; report the ones that do not. */
export async function installPerformancePack(profileId: string, task: Task): Promise<{ installed: string[]; unavailable: string[]; skipped: string[] }> {
  const profile = await getProfile(profileId);
  targetOf(profile, false);
  const installedNow = await listInstalled(profileId, { identify: false });
  const have = new Set(installedNow.map((m) => m.key));
  const merged: InstallPlan = { items: [], optional: [], warnings: [], blockers: [], manualDownloads: [] };
  const unavailable: string[] = [];
  task.stage('Finding compatible optimisation mods', PERF_PACK[profile.loader as ModLoader].length);
  for (const slug of PERF_PACK[profile.loader as ModLoader]) {
    task.throwIfCancelled();
    try {
      const project = await modrinth.getProject(slug);
      if (have.has(keyOf('modrinth', project.id))) continue;
      const plan = await planMod(profileId, { provider: 'modrinth', projectId: project.id });
      if (plan.blockers.length) {
        unavailable.push(`${project.title} (needs a dependency that has no compatible release)`);
        continue;
      }
      for (const it of plan.items) if (!merged.items.some((x) => x.file.fileId === it.file.fileId) && !have.has(keyOf(it.file.provider, it.file.projectId))) merged.items.push(it);
    } catch (e: any) {
      unavailable.push(`${slug}`);
    }
    task.advance();
  }
  if (!merged.items.length) return { installed: [], unavailable, skipped: [] };
  const r = await installPlan(profileId, merged, task);
  return { ...r, unavailable };
}
