import { ModFile, ModLoader, ModProject, ModProvider, ProviderId, ReleaseType } from './types';
import { LauncherError } from '../logger';

/**
 * Compatibility + dependency resolution. Pure logic over provider data, so it is unit-tested
 * with fake providers. Rules:
 *  - a release is compatible only if it explicitly lists the exact Minecraft version AND the loader;
 *  - Quilt profiles also accept Fabric releases (Quilt loads Fabric mods), ranked below native Quilt;
 *  - releases beat betas beat alphas; within a tier the newest wins;
 *  - the newest file is never assumed to be right.
 */

export interface Target {
  mcVersion: string;
  loader: ModLoader;
  allowBeta?: boolean; // alpha/beta are only auto-picked when true (or when nothing else exists)
}

export function loaderMatch(file: ModFile, loader: ModLoader): 'exact' | 'fabric-on-quilt' | null {
  const ls = file.loaders.map((l) => l.toLowerCase());
  if (ls.includes(loader)) return 'exact';
  if (loader === 'quilt' && ls.includes('fabric')) return 'fabric-on-quilt';
  return null;
}

export function compatibility(file: ModFile, t: Target): { ok: boolean; reason?: string; via?: 'exact' | 'fabric-on-quilt' } {
  if (!file.gameVersions.includes(t.mcVersion)) return { ok: false, reason: `Built for Minecraft ${summarize(file.gameVersions)}, not ${t.mcVersion}` };
  const via = loaderMatch(file, t.loader);
  if (!via) return { ok: false, reason: `Built for ${file.loaders.join('/') || 'unknown loader'}, not ${t.loader}` };
  return { ok: true, via };
}

function summarize(v: string[]): string {
  if (v.length <= 3) return v.join(', ') || 'unknown';
  return `${v.slice(0, 3).join(', ')} +${v.length - 3}`;
}

const TIER: Record<ReleaseType, number> = { release: 0, beta: 1, alpha: 2 };

/** Best compatible file for the target, or undefined. */
export function pickBestFile(files: ModFile[], t: Target): ModFile | undefined {
  const compatible = files
    .map((f) => ({ f, c: compatibility(f, t) }))
    .filter((x) => x.c.ok)
    .map((x) => x as { f: ModFile; c: { via: 'exact' | 'fabric-on-quilt' } });
  if (!compatible.length) return undefined;
  compatible.sort(
    (a, b) =>
      TIER[a.f.releaseType] - TIER[b.f.releaseType] ||
      (a.c.via === b.c.via ? 0 : a.c.via === 'exact' ? -1 : 1) ||
      Date.parse(b.f.datePublished) - Date.parse(a.f.datePublished),
  );
  // Unless the user opted in, never auto-pick an alpha when a beta/release exists (sorting already
  // guarantees that); if only prereleases exist the plan carries a warning rather than hiding the mod.
  const pool = t.allowBeta ? compatible : compatible.filter((x) => x.f.releaseType !== 'alpha');
  return (pool.length ? pool : compatible)[0].f;
}

export interface InstalledRef {
  provider: ProviderId | 'local';
  projectId?: string;
  slug?: string;
  title: string;
  enabled: boolean;
  incompatibles?: string[]; // "provider:projectId" keys this mod declares incompatible
}

export interface PlanItem {
  project: ModProject;
  file: ModFile;
  role: 'requested' | 'dependency';
  requiredBy?: string; // title
  loaderNote?: string;
  prerelease?: boolean;
}

export interface OptionalDep {
  project: ModProject;
  requiredBy: string;
}

export interface InstallPlan {
  items: PlanItem[];
  optional: OptionalDep[];
  warnings: string[];
  /** Problems that make the install unsafe (e.g. required dependency has no compatible release). */
  blockers: string[];
  manualDownloads: PlanItem[]; // files the provider forbids downloading via API
}

export const keyOf = (provider: string, id: string) => `${provider}:${id}`;

export interface PlanRequest {
  provider: ProviderId;
  projectId: string;
  fileId?: string;
}

/**
 * Build an install plan: the requested mod (a specific file or the best compatible one) plus all
 * transitive required dependencies that are not already installed.
 */
export async function planInstall(
  providers: Record<ProviderId, ModProvider>,
  req: PlanRequest,
  target: Target,
  installed: InstalledRef[],
): Promise<InstallPlan> {
  const plan: InstallPlan = { items: [], optional: [], warnings: [], blockers: [], manualDownloads: [] };
  const planned = new Set<string>();
  const installedKeys = new Set(installed.filter((i) => i.projectId).map((i) => keyOf(i.provider, i.projectId!)));
  const installedSlugs = new Map(installed.filter((i) => i.slug).map((i) => [i.slug!.toLowerCase(), i]));
  const queue: { provider: ProviderId; projectId: string; fileId?: string; role: PlanItem['role']; requiredBy?: string }[] = [
    { ...req, role: 'requested' },
  ];

  while (queue.length) {
    const cur = queue.shift()!;
    const key = keyOf(cur.provider, cur.projectId);
    if (planned.has(key)) continue;
    planned.add(key);
    const prov = providers[cur.provider];

    let project: ModProject;
    try {
      project = await prov.getProject(cur.projectId);
    } catch (e: any) {
      if (cur.role === 'requested') throw e;
      plan.blockers.push(`Could not look up required dependency ${cur.projectId} (${e.message}).`);
      continue;
    }

    if (cur.role === 'dependency') {
      if (installedKeys.has(key)) continue;
      const dup = installedSlugs.get(project.slug.toLowerCase());
      if (dup) {
        if (!dup.enabled) plan.warnings.push(`${project.title} is installed but disabled - ${cur.requiredBy} needs it enabled.`);
        continue;
      }
    }

    let file: ModFile | undefined;
    if (cur.fileId) {
      const pinned = await prov.getFile(cur.projectId, cur.fileId).catch(() => undefined);
      if (pinned && compatibility(pinned, target).ok) file = pinned;
      else if (cur.role === 'requested') {
        // The user explicitly picked this file: honour it but warn loudly if it does not match.
        if (pinned) {
          file = pinned;
          const c = compatibility(pinned, target);
          plan.warnings.push(`${project.title} ${pinned.versionNumber}: ${c.reason}. It may not work in this profile.`);
        }
      }
    }
    if (!file) {
      const files = await prov.getFiles(cur.projectId, { mcVersion: target.mcVersion, loader: target.loader });
      file = pickBestFile(files, target);
    }

    if (!file) {
      const msg = `${project.title} has no release for Minecraft ${target.mcVersion} on ${target.loader}.`;
      if (cur.role === 'requested') throw new LauncherError(msg);
      plan.blockers.push(`${cur.requiredBy} requires ${project.title}, but ${msg.replace(project.title + ' has', 'it has')}`);
      continue;
    }

    const item: PlanItem = { project, file, role: cur.role, requiredBy: cur.requiredBy };
    if (loaderMatch(file, target.loader) === 'fabric-on-quilt') item.loaderNote = 'Fabric build - runs on Quilt through its Fabric compatibility layer.';
    if (file.releaseType !== 'release') {
      item.prerelease = true;
      plan.warnings.push(`${project.title} ${file.versionNumber} is a ${file.releaseType} build - it may be unstable.`);
    }
    if (file.url === null) {
      plan.manualDownloads.push(item);
      plan.warnings.push(`${project.title}: the author does not allow automatic downloads. You will need to download it from CurseForge manually.`);
    }
    plan.items.push(item);

    for (const d of file.dependencies) {
      const depKey = keyOf(file.provider, d.projectId);
      if (d.type === 'required') {
        queue.push({ provider: file.provider, projectId: d.projectId, fileId: d.fileId, role: 'dependency', requiredBy: project.title });
      } else if (d.type === 'optional' && !installedKeys.has(depKey)) {
        const op = await prov.getProject(d.projectId).catch(() => undefined);
        if (op && !plan.optional.some((o) => o.project.id === op.id)) plan.optional.push({ project: op, requiredBy: project.title });
      } else if (d.type === 'incompatible') {
        const hit = installed.find((i) => i.projectId === d.projectId && i.provider === file!.provider);
        if (hit) plan.warnings.push(`${project.title} is marked incompatible with the installed mod "${hit.title}".`);
      }
    }
    // Reverse direction: an installed mod declares this one incompatible.
    for (const i of installed) if (i.incompatibles?.includes(key)) plan.warnings.push(`The installed mod "${i.title}" is marked incompatible with ${project.title}.`);
  }

  // Requested mod first, then dependencies; stable and predictable for the UI.
  plan.items.sort((a, b) => (a.role === b.role ? 0 : a.role === 'requested' ? -1 : 1));
  return plan;
}
