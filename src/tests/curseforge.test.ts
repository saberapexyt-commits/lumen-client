import test from 'node:test';
import assert from 'node:assert/strict';
import { fileFrom } from '../main/mods/curseforge';
import { pickBestFile } from '../main/mods/resolver';

// Shape follows the CurseForge Core API "File" object (https://docs.curseforge.com/rest-api/#file).
const apiFile = (over: any = {}) => ({
  id: 5001,
  modId: 306612,
  displayName: 'fabric-api-0.100.0+1.21',
  fileName: 'fabric-api-0.100.0+1.21.jar',
  releaseType: 1,
  fileDate: '2025-03-01T10:00:00Z',
  fileLength: 2048,
  downloadUrl: 'https://edge.forgecdn.net/files/5001/fabric-api.jar',
  hashes: [
    { value: 'abc123', algo: 1 },
    { value: 'def456', algo: 2 },
  ],
  gameVersions: ['1.21.1', '1.21', 'Fabric', 'Java 21'],
  dependencies: [
    { modId: 111, relationType: 3 },
    { modId: 222, relationType: 2 },
    { modId: 333, relationType: 5 },
    { modId: 444, relationType: 1 },
  ],
  ...over,
});

test('maps a CurseForge file: loader from gameVersions, sha1 from algo 1, dependency types', () => {
  const f = fileFrom(apiFile(), 'fabric-api');
  assert.equal(f.provider, 'curseforge');
  assert.equal(f.sha1, 'abc123');
  assert.deepEqual(f.loaders, ['fabric']);
  assert.deepEqual(f.gameVersions, ['1.21.1', '1.21']); // "Fabric" / "Java 21" are not MC versions
  assert.deepEqual(f.dependencies.map((d) => d.type), ['required', 'optional', 'incompatible', 'embedded']);
  assert.equal(f.pageUrl, 'https://www.curseforge.com/minecraft/mc-mods/fabric-api/files/5001');
});

test('a null downloadUrl is preserved so the UI can ask for a manual download', () => {
  assert.equal(fileFrom(apiFile({ downloadUrl: null })).url, null);
});

test('resolver matches CurseForge files like any other provider', () => {
  const files = [
    fileFrom(apiFile({ id: 1, gameVersions: ['1.20.1', 'Forge'], fileDate: '2025-06-01T00:00:00Z' })),
    fileFrom(apiFile({ id: 2 })),
  ];
  assert.equal(pickBestFile(files, { mcVersion: '1.21.1', loader: 'fabric' })?.fileId, '2');
  assert.equal(pickBestFile(files, { mcVersion: '1.21.1', loader: 'forge' }), undefined);
});
