export type ProviderId = 'modrinth' | 'curseforge';
export type ModLoader = 'fabric' | 'quilt' | 'forge' | 'neoforge';
export type ReleaseType = 'release' | 'beta' | 'alpha';
/** What kind of thing a project is. Mods need a loader; packs and shaders only care about the Minecraft version. */
export type ContentType = 'mod' | 'resourcepack' | 'shader' | 'modpack';
export type SortKey = 'relevance' | 'downloads' | 'updated' | 'newest' | 'follows';

/** A mod/project as shown in browse results - identical shape for every provider. */
export interface ModProject {
  provider: ProviderId;
  type: ContentType;
  id: string;
  slug: string;
  title: string;
  summary: string;
  iconUrl?: string;
  author: string;
  downloads: number;
  follows?: number;
  categories: string[];
  url: string; // public page on the provider's website
  updated?: string;
  /** Present on search hits when the provider returns it; not authoritative for compatibility. */
  gameVersions?: string[];
  clientSide?: string;
  serverSide?: string;
  /** CurseForge: false means the author forbids downloads through third-party apps. */
  allowDistribution?: boolean;
}

export type DependencyType = 'required' | 'optional' | 'incompatible' | 'embedded' | 'tool';

export interface ModDependency {
  projectId: string;
  fileId?: string;
  type: DependencyType;
}

/** One downloadable release of a project. */
export interface ModFile {
  provider: ProviderId;
  projectId: string;
  fileId: string;
  versionNumber: string;
  name: string;
  fileName: string;
  /** null => provider forbids API download; user must fetch it from `pageUrl`. */
  url: string | null;
  pageUrl?: string;
  sha1?: string;
  sha512?: string;
  size: number;
  releaseType: ReleaseType;
  datePublished: string;
  gameVersions: string[];
  loaders: string[];
  dependencies: ModDependency[];
}

export interface SearchQuery {
  type?: ContentType; // default 'mod'
  query: string;
  mcVersion?: string;
  loader?: ModLoader;
  category?: string;
  sort: SortKey;
  offset: number;
  limit: number;
}

export interface SearchResult {
  hits: ModProject[];
  total: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface ModProvider {
  id: ProviderId;
  name: string;
  /** Whether the provider can be used right now (e.g. API key configured). */
  status(): Promise<{ ok: boolean; reason?: string }>;
  search(q: SearchQuery): Promise<SearchResult>;
  getProject(id: string): Promise<ModProject>;
  getProjects(ids: string[]): Promise<ModProject[]>;
  /** All releases of the project, optionally pre-filtered by the provider. Resolver re-checks compatibility. */
  getFiles(projectId: string, filter?: { mcVersion?: string; loader?: ModLoader }): Promise<ModFile[]>;
  getFile(projectId: string, fileId: string): Promise<ModFile>;
  getCategories(type?: ContentType): Promise<Category[]>;
  /** Identify local jars by SHA-1 (used when importing existing mods). Optional per provider. */
  identifyByHashes?(sha1s: string[]): Promise<Record<string, { project: ModProject; file: ModFile }>>;
}
