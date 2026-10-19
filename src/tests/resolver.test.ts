import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibility, pickBestFile, planInstall } from '../main/mods/resolver';
import { ModFile, ModProject, ModProvider, ProviderId } from '../main/mods/types';

const T = { mcVersion: '1.21.1', loader: 'fabric' as const };

function file(over: Partial<ModFile> & { fileId: string }): ModFile {
  return {
    provider: 'modrinth',
    projectId: 'p',
    versionNumber: '1.0',
    name: 'f',
    fileName: `${over.fileId}.jar`,
    url: 'https://example.invalid/x.jar',
    size: 1,
    releaseType: 'release',
    datePublished: '2025-01-01T00:00:00Z',
    gameVersions: ['1.21.1'],
    loaders: ['fabric'],
    dependencies: [],
    ...over,
  };
}

test('never picks the newest file when it targets another Minecraft version', () => {
  const files = [
    file({ fileId: 'new', gameVersions: ['1.21.4'], datePublished: '2025-06-01T00:00:00Z' }),
    file({ fileId: 'right', gameVersions: ['1.21.1'], datePublished: '2025-01-01T00:00:00Z' }),
  ];
  assert.equal(pickBestFile(files, T)?.fileId, 'right');
});

test('never picks a file for the wrong loader', () => {
  const files = [file({ fileId: 'forge', loaders: ['forge'] })];
  assert.equal(pickBestFile(files, T), undefined);
  assert.equal(compatibility(files[0], T).ok, false);
});

test('release beats newer beta; alpha is last resort', () => {
  const files = [
    file({ fileId: 'beta', releaseType: 'beta', datePublished: '2025-05-01T00:00:00Z' }),
    file({ fileId: 'rel', releaseType: 'release', datePublished: '2025-02-01T00:00:00Z' }),
    file({ fileId: 'alpha', releaseType: 'alpha', datePublished: '2025-06-01T00:00:00Z' }),
  ];
  assert.equal(pickBestFile(files, T)?.fileId, 'rel');
  assert.equal(pickBestFile(files.slice(2), T)?.fileId, 'alpha'); // only option, caller warns
});

test('Quilt accepts Fabric builds but prefers native Quilt builds', () => {
  const q = { mcVersion: '1.21.1', loader: 'quilt' as const };
  const fab = file({ fileId: 'fab', loaders: ['fabric'], datePublished: '2025-06-01T00:00:00Z' });
  const quilt = file({ fileId: 'q', loaders: ['quilt'], datePublished: '2025-01-01T00:00:00Z' });
  assert.equal(pickBestFile([fab], q)?.fileId, 'fab');
  assert.equal(pickBestFile([fab, quilt], q)?.fileId, 'q');
});

test('exact Minecraft version is required (1.21 build is not assumed to fit 1.21.1)', () => {
  assert.equal(pickBestFile([file({ fileId: 'a', gameVersions: ['1.21'] })], T), undefined);
});

/* --- dependency planning against a fake provider --- */
function fakeProvider(id: ProviderId, projects: Record<string, ModProject>, files: Record<string, ModFile[]>): ModProvider {
  return {
    id,
    name: id,
    status: async () => ({ ok: true }),
    search: async () => ({ hits: [], total: 0 }),
    getProject: async (p) => projects[p],
    getProjects: async (ids) => ids.map((i) => projects[i]),
    getFiles: async (p) => files[p] ?? [],
    getFile: async (p, f) => (files[p] ?? []).find((x) => x.fileId === f)!,
    getCategories: async () => [],
  };
}
const proj = (id: string, title = id): ModProject => ({ provider: 'modrinth', id, slug: id, title, summary: '', author: '', downloads: 0, categories: [], url: '' });

test('plans required dependencies, lists optional ones, skips installed', async () => {
  const prov = fakeProvider(
    'modrinth',
    { A: proj('A'), B: proj('B'), C: proj('C'), D: proj('D') },
    {
      A: [file({ fileId: 'a1', projectId: 'A', dependencies: [{ projectId: 'B', type: 'required' }, { projectId: 'C', type: 'optional' }, { projectId: 'D', type: 'required' }] })],
      B: [file({ fileId: 'b1', projectId: 'B', dependencies: [{ projectId: 'D', type: 'required' }] })],
      D: [file({ fileId: 'd1', projectId: 'D' })],
    },
  );
  const plan = await planInstall({ modrinth: prov, curseforge: prov }, { provider: 'modrinth', projectId: 'A' }, T, [
    { provider: 'modrinth', projectId: 'D', title: 'D', enabled: true },
  ]);
  assert.deepEqual(plan.items.map((i) => i.project.id), ['A', 'B']); // D already installed
  assert.deepEqual(plan.optional.map((o) => o.project.id), ['C']);
  assert.equal(plan.blockers.length, 0);
});

test('a required dependency with no compatible release becomes a blocker', async () => {
  const prov = fakeProvider(
    'modrinth',
    { A: proj('A'), B: proj('B', 'Lib B') },
    {
      A: [file({ fileId: 'a1', projectId: 'A', dependencies: [{ projectId: 'B', type: 'required' }] })],
      B: [file({ fileId: 'b1', projectId: 'B', gameVersions: ['1.20.1'] })],
    },
  );
  const plan = await planInstall({ modrinth: prov, curseforge: prov }, { provider: 'modrinth', projectId: 'A' }, T, []);
  assert.equal(plan.blockers.length, 1);
  assert.match(plan.blockers[0], /Lib B/);
});

test('requesting a mod with no compatible release throws a clear error', async () => {
  const prov = fakeProvider('modrinth', { A: proj('A', 'Alpha Mod') }, { A: [file({ fileId: 'a1', projectId: 'A', gameVersions: ['1.19'] })] });
  await assert.rejects(planInstall({ modrinth: prov, curseforge: prov }, { provider: 'modrinth', projectId: 'A' }, T, []), /no release for Minecraft 1\.21\.1/);
});

test('warns about incompatibilities in both directions and about manual downloads', async () => {
  const prov = fakeProvider(
    'modrinth',
    { A: proj('A', 'Alpha'), X: proj('X', 'Ex') },
    { A: [file({ fileId: 'a1', projectId: 'A', url: null, dependencies: [{ projectId: 'X', type: 'incompatible' }] })] },
  );
  const plan = await planInstall({ modrinth: prov, curseforge: prov }, { provider: 'modrinth', projectId: 'A' }, T, [
    { provider: 'modrinth', projectId: 'X', title: 'Ex', enabled: true },
    { provider: 'local', title: 'Other', enabled: true, incompatibles: ['modrinth:A'] },
  ]);
  assert.equal(plan.manualDownloads.length, 1);
  assert.ok(plan.warnings.some((w) => /incompatible with the installed mod "Ex"/.test(w)));
  assert.ok(plan.warnings.some((w) => /"Other" is marked incompatible with Alpha/.test(w)));
});

test('dependency cycles terminate', async () => {
  const prov = fakeProvider(
    'modrinth',
    { A: proj('A'), B: proj('B') },
    {
      A: [file({ fileId: 'a1', projectId: 'A', dependencies: [{ projectId: 'B', type: 'required' }] })],
      B: [file({ fileId: 'b1', projectId: 'B', dependencies: [{ projectId: 'A', type: 'required' }] })],
    },
  );
  const plan = await planInstall({ modrinth: prov, curseforge: prov }, { provider: 'modrinth', projectId: 'A' }, T, []);
  assert.equal(plan.items.length, 2);
});
