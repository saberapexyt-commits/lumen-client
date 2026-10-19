import { getJson, postJson } from '../net';
import { LauncherError } from '../logger';
import { Category, ContentType, ModDependency, ModFile, ModLoader, ModProject, ModProvider, SearchQuery } from './types';

/**
 * Modrinth API v2 (https://docs.modrinth.com/api/). No key required, but a descriptive
 * User-Agent is mandatory - set globally in net.ts.
 */
const API = 'https://api.modrinth.com/v2';

/** Quilt can load Fabric mods, so Fabric releases are an acceptable (lower-ranked) match. */
export function loaderFamily(loader: ModLoader): string[] {
  return loader === 'quilt' ? ['quilt', 'fabric'] : [loader];
}

function projectFromHit(h: any): ModProject {
  return {
    provider: 'modrinth',
    type: (['mod', 'resourcepack', 'shader', 'modpack'].includes(h.project_type) ? h.project_type : 'mod') as ContentType,
    id: h.project_id ?? h.id,
    slug: h.slug,
    title: h.title,
    summary: h.description,
    iconUrl: h.icon_url || undefined,
    author: h.author ?? '',
    downloads: h.downloads ?? 0,
    follows: h.follows ?? h.followers,
    categories: h.display_categories ?? h.categories ?? [],
    url: `https://modrinth.com/${['resourcepack', 'shader', 'modpack'].includes(h.project_type) ? h.project_type : 'mod'}/${h.slug}`,
    updated: h.date_modified ?? h.updated,
    gameVersions: h.versions ?? h.game_versions,
    clientSide: h.client_side,
    serverSide: h.server_side,
    allowDistribution: true,
  };
}

export function fileFromVersion(v: any): ModFile {
  const f = (v.files ?? []).find((x: any) => x.primary) ?? v.files?.[0];
  if (!f) throw new LauncherError(`Modrinth version ${v.id} has no files.`);
  const deps: ModDependency[] = (v.dependencies ?? [])
    .filter((d: any) => d.project_id)
    .map((d: any) => ({ projectId: d.project_id, fileId: d.version_id ?? undefined, type: d.dependency_type }));
  return {
    provider: 'modrinth',
    projectId: v.project_id,
    fileId: v.id,
    versionNumber: v.version_number,
    name: v.name,
    fileName: f.filename,
    url: f.url,
    pageUrl: undefined,
    sha1: f.hashes?.sha1,
    sha512: f.hashes?.sha512,
    size: f.size ?? 0,
    releaseType: v.version_type,
    datePublished: v.date_published,
    gameVersions: v.game_versions ?? [],
    loaders: v.loaders ?? [],
    dependencies: deps,
  };
}

const q = (s: string) => encodeURIComponent(s);

export const modrinth: ModProvider = {
  id: 'modrinth',
  name: 'Modrinth',
  async status() {
    return { ok: true };
  },

  async search(query: SearchQuery) {
    const type = query.type ?? 'mod';
    const facets: string[][] = [[`project_type:${type}`]];
    if (query.mcVersion && type !== 'modpack') facets.push([`versions:${query.mcVersion}`]);
    // Loaders only matter for mods. Shader packs are filtered to ones the Iris/Oculus loaders can run.
    if (query.loader && type === 'mod') facets.push(loaderFamily(query.loader).map((l) => `categories:${l}`));
    if (type === 'shader') facets.push(['categories:iris']);
    if (query.category) facets.push([`categories:${query.category}`]);
    const url = `${API}/search?query=${q(query.query)}&facets=${q(JSON.stringify(facets))}&index=${query.sort}&offset=${query.offset}&limit=${query.limit}`;
    const r = await getJson<{ hits: any[]; total_hits: number }>(url, { ttl: 60_000 });
    return { hits: r.hits.map(projectFromHit), total: r.total_hits };
  },

  async getProject(id) {
    return projectFromHit(await getJson(`${API}/project/${q(id)}`, { ttl: 120_000 }));
  },

  async getProjects(ids) {
    if (!ids.length) return [];
    const list = await getJson<any[]>(`${API}/projects?ids=${q(JSON.stringify(ids))}`, { ttl: 120_000 });
    return list.map(projectFromHit);
  },

  async getFiles(projectId, filter) {
    const params: string[] = [];
    if (filter?.loader) params.push(`loaders=${q(JSON.stringify(loaderFamily(filter.loader)))}`);
    if (filter?.mcVersion) params.push(`game_versions=${q(JSON.stringify([filter.mcVersion]))}`);
    const url = `${API}/project/${q(projectId)}/version${params.length ? '?' + params.join('&') : ''}`;
    const list = await getJson<any[]>(url, { ttl: 60_000 });
    return list.filter((v) => v.files?.length).map(fileFromVersion);
  },

  async getFile(_projectId, fileId) {
    return fileFromVersion(await getJson(`${API}/version/${q(fileId)}`, { ttl: 120_000 }));
  },

  async getCategories(type: ContentType = 'mod'): Promise<Category[]> {
    const cats = await getJson<{ name: string; project_type: string; header: string }[]>(`${API}/tag/category`, { ttl: 3600_000 });
    return cats
      .filter((c) => c.project_type === type && c.header === 'categories')
      .map((c) => ({ id: c.name, name: c.name.replace(/(^|-)(\w)/g, (_m, a, b) => (a ? ' ' : '') + b.toUpperCase()) }));
  },

  async identifyByHashes(sha1s) {
    if (!sha1s.length) return {};
    const { status, data } = await postJson<Record<string, any>>(`${API}/version_files`, { hashes: sha1s, algorithm: 'sha1' });
    if (status !== 200) return {};
    const projectIds = [...new Set(Object.values(data).map((v: any) => v.project_id))];
    const projects = await this.getProjects(projectIds);
    const byId = new Map(projects.map((p) => [p.id, p]));
    const out: Record<string, { project: ModProject; file: ModFile }> = {};
    for (const [hash, v] of Object.entries(data)) {
      const project = byId.get((v as any).project_id);
      if (project) out[hash] = { project, file: fileFromVersion(v) };
    }
    return out;
  },
};
