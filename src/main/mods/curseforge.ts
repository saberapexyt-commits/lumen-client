import { getJson, postJson } from '../net';
import { LauncherError } from '../logger';
import { getCurseForgeKey } from '../settings';
import { Category, ModDependency, ModFile, ModLoader, ModProject, ModProvider, SearchQuery, SortKey } from './types';

/**
 * CurseForge Core API (https://docs.curseforge.com/). Requires an API key - the key is supplied
 * by the user (or the distributor) at runtime and is never bundled in this repository.
 */
const API = 'https://api.curseforge.com/v1';
const GAME_ID = 432; // Minecraft
const CLASS_MODS = 6;

const LOADER_TYPE: Record<ModLoader, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
const LOADER_NAME: Record<ModLoader, string> = { forge: 'Forge', fabric: 'Fabric', quilt: 'Quilt', neoforge: 'NeoForge' };
// ModsSearchSortField: 1 Featured, 2 Popularity, 3 LastUpdated, 4 Name, 5 Author, 6 TotalDownloads, 8 GameVersion, 11 ReleasedDate
const SORT: Record<SortKey, number> = { relevance: 2, downloads: 6, updated: 3, newest: 11, follows: 2 };

async function headers() {
  const key = await getCurseForgeKey();
  if (!key) throw new LauncherError('CurseForge needs an API key. Add yours in Settings → Mod sources (get one free at console.curseforge.com).');
  return { 'x-api-key': key };
}

async function get<T>(path: string, ttl = 60_000): Promise<T> {
  return getJson<T>(`${API}${path}`, { headers: await headers(), ttl });
}

function projectFrom(m: any): ModProject {
  return {
    provider: 'curseforge',
    id: String(m.id),
    slug: m.slug,
    title: m.name,
    summary: m.summary ?? '',
    iconUrl: m.logo?.thumbnailUrl || m.logo?.url || undefined,
    author: m.authors?.[0]?.name ?? '',
    downloads: m.downloadCount ?? 0,
    categories: (m.categories ?? []).map((c: any) => c.name),
    url: m.links?.websiteUrl ?? `https://www.curseforge.com/minecraft/mc-mods/${m.slug}`,
    updated: m.dateModified,
    gameVersions: [...new Set<string>((m.latestFilesIndexes ?? []).map((i: any) => i.gameVersion))],
    allowDistribution: m.allowModDistribution !== false,
  };
}

const REL: Record<number, ModFile['releaseType']> = { 1: 'release', 2: 'beta', 3: 'alpha' };
const DEP: Record<number, ModDependency['type'] | undefined> = { 1: 'embedded', 2: 'optional', 3: 'required', 4: 'tool', 5: 'incompatible', 6: 'embedded' };

export function fileFrom(f: any, slug?: string): ModFile {
  const hash = (algo: number) => f.hashes?.find((h: any) => h.algo === algo)?.value as string | undefined;
  const gv: string[] = f.gameVersions ?? [];
  const loaders = gv.filter((g) => /^(forge|fabric|quilt|neoforge)$/i.test(g)).map((g) => g.toLowerCase());
  const deps: ModDependency[] = (f.dependencies ?? [])
    .map((d: any) => ({ projectId: String(d.modId), type: DEP[d.relationType] }))
    .filter((d: any) => d.type);
  return {
    provider: 'curseforge',
    projectId: String(f.modId),
    fileId: String(f.id),
    versionNumber: f.displayName ?? f.fileName,
    name: f.displayName ?? f.fileName,
    fileName: f.fileName,
    url: f.downloadUrl ?? null,
    pageUrl: slug ? `https://www.curseforge.com/minecraft/mc-mods/${slug}/files/${f.id}` : undefined,
    sha1: hash(1),
    size: f.fileLength ?? 0,
    releaseType: REL[f.releaseType] ?? 'release',
    datePublished: f.fileDate,
    gameVersions: gv.filter((g) => /^\d+\.\d+/.test(g)),
    loaders,
    dependencies: deps,
  };
}

export const curseforge: ModProvider = {
  id: 'curseforge',
  name: 'CurseForge',
  async status() {
    const key = await getCurseForgeKey();
    if (!key) return { ok: false, reason: 'No API key configured. Add one in Settings → Mod sources.' };
    return { ok: true };
  },

  async search(q: SearchQuery) {
    const p = new URLSearchParams({
      gameId: String(GAME_ID),
      classId: String(CLASS_MODS),
      searchFilter: q.query,
      sortField: String(SORT[q.sort]),
      sortOrder: 'desc',
      pageSize: String(Math.min(q.limit, 50)),
      index: String(q.offset),
    });
    if (q.mcVersion) p.set('gameVersion', q.mcVersion);
    // For Quilt, search Fabric+Quilt both (CurseForge allows a list via modLoaderTypes).
    if (q.loader) {
      if (q.loader === 'quilt') p.set('modLoaderTypes', JSON.stringify([LOADER_TYPE.quilt, LOADER_TYPE.fabric]));
      else p.set('modLoaderType', String(LOADER_TYPE[q.loader]));
    }
    if (q.category) p.set('categoryId', q.category);
    const r = await get<{ data: any[]; pagination: { totalCount: number } }>(`/mods/search?${p}`);
    return { hits: r.data.map(projectFrom), total: r.pagination.totalCount };
  },

  async getProject(id) {
    return projectFrom((await get<{ data: any }>(`/mods/${id}`, 120_000)).data);
  },

  async getProjects(ids) {
    if (!ids.length) return [];
    const { status, data } = await postJson<{ data: any[] }>(`${API}/mods`, { modIds: ids.map(Number) }, await headers());
    if (status !== 200) throw new LauncherError(`CurseForge request failed (HTTP ${status}).`);
    return data.data.map(projectFrom);
  },

  async getFiles(projectId, filter) {
    const project = await this.getProject(projectId).catch(() => undefined);
    const files: ModFile[] = [];
    const loaders = filter?.loader ? (filter.loader === 'quilt' ? [LOADER_TYPE.quilt, LOADER_TYPE.fabric] : [LOADER_TYPE[filter.loader]]) : [undefined];
    for (const lt of loaders) {
      for (let index = 0; index < 200; index += 50) {
        const p = new URLSearchParams({ pageSize: '50', index: String(index) });
        if (filter?.mcVersion) p.set('gameVersion', filter.mcVersion);
        if (lt !== undefined) p.set('modLoaderType', String(lt));
        const r = await get<{ data: any[]; pagination: { totalCount: number } }>(`/mods/${projectId}/files?${p}`);
        files.push(...r.data.filter((f) => f.isAvailable !== false).map((f) => fileFrom(f, project?.slug)));
        if (index + 50 >= r.pagination.totalCount) break;
      }
    }
    // Files whose downloadUrl is null: ask the official endpoint once; if still denied they need manual download.
    for (const f of files) {
      if (f.url === null && project?.allowDistribution !== false) {
        try {
          f.url = (await get<{ data: string }>(`/mods/${f.projectId}/files/${f.fileId}/download-url`, 300_000)).data || null;
        } catch {
          /* stays null -> manual download */
        }
      }
    }
    const seen = new Set<string>();
    return files.filter((f) => (seen.has(f.fileId) ? false : (seen.add(f.fileId), true)));
  },

  async getFile(projectId, fileId) {
    const [project, f] = await Promise.all([
      this.getProject(projectId).catch(() => undefined),
      get<{ data: any }>(`/mods/${projectId}/files/${fileId}`, 120_000),
    ]);
    const file = fileFrom(f.data, project?.slug);
    if (file.url === null) {
      try {
        file.url = (await get<{ data: string }>(`/mods/${projectId}/files/${fileId}/download-url`, 300_000)).data || null;
      } catch {
        /* manual download required */
      }
    }
    return file;
  },

  async getCategories(): Promise<Category[]> {
    const r = await get<{ data: any[] }>(`/categories?gameId=${GAME_ID}&classId=${CLASS_MODS}`, 3600_000);
    return r.data.filter((c) => !c.isClass).map((c) => ({ id: String(c.id), name: c.name }));
  },
};

export { LOADER_NAME };
