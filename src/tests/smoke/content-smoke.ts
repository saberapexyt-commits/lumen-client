/**
 * Live test (real Modrinth): resource pack + shader (auto-installs Iris/Sodium) + toggling + modpack-as-profile.
 *   node dist/tests/smoke/content-smoke.js
 */
import * as path from 'path';
import * as fs from 'fs';
import assert from 'node:assert/strict';
import { setRoot, P } from '../../main/paths';
setRoot(process.env.LUMEN_HOME || path.join(process.cwd(), '.test-home'));

import { Task } from '../../main/net';
import { createProfile, getProfile, listProfiles } from '../../main/profiles';
import { modrinth } from '../../main/mods/modrinth';
import { enabledResourcePacks, installModpackFromProject, installPacks, listPacks, planPack, removePack, selectedShader, setPackEnabled } from '../../main/mods/content';
import { listInstalled } from '../../main/mods/manager';

const t = () => new Task('t', 't', () => {});

async function main() {
  const profile = await createProfile({ name: `content smoke ${Date.now()}`, mcVersion: '1.21.1', loader: 'fabric' });

  // --- resource pack: no loader needed, filtered by Minecraft version only
  const rp = await modrinth.search({ type: 'resourcepack', query: 'faithful', mcVersion: '1.21.1', sort: 'downloads', offset: 0, limit: 5 });
  assert.ok(rp.hits.length && rp.hits.every((h) => h.type === 'resourcepack'), 'resource pack search');
  console.log('resource packs:', rp.hits.map((h) => h.title).join(', '));
  const rpPlan = await planPack(profile.id, { provider: 'modrinth', projectId: rp.hits[0].id, type: 'resourcepack' });
  assert.equal(rpPlan.items.length, 1);
  await installPacks(profile.id, rpPlan, t());
  let packs = await listPacks(profile.id, 'resourcepack');
  assert.equal(packs.length, 1);
  assert.ok(fs.existsSync(path.join(P.gameDir(profile.id), 'resourcepacks', packs[0].fileName)));
  assert.equal(packs[0].enabled, false);
  await setPackEnabled(profile.id, packs[0].key, true);
  assert.ok(enabledResourcePacks(profile.id).has(packs[0].fileName), 'enabled in options.txt');
  console.log('options.txt:', fs.readFileSync(path.join(P.gameDir(profile.id), 'options.txt'), 'utf8').trim());

  // --- shader: must bring Iris (+ Sodium) along
  const sh = await modrinth.search({ type: 'shader', query: 'complementary', mcVersion: '1.21.1', sort: 'downloads', offset: 0, limit: 5 });
  assert.ok(sh.hits.length && sh.hits.every((h) => h.type === 'shader'), 'shader search');
  console.log('shaders:', sh.hits.map((h) => h.title).join(', '));
  const shPlan = await planPack(profile.id, { provider: 'modrinth', projectId: sh.hits[0].id, type: 'shader' });
  console.log('shader plan:', shPlan.items.map((i) => `${i.role}:${i.project.type}:${i.project.title}`).join(' | '));
  assert.ok(shPlan.items.some((i) => i.project.slug === 'iris'), 'Iris planned');
  const irisItem = shPlan.items.find((i) => i.project.slug === 'iris')!;
  const sodiumItem = shPlan.items.find((i) => i.project.slug === 'sodium')!;
  assert.ok(irisItem.file.dependencies.some((d) => d.fileId === sodiumItem.file.fileId), 'Sodium is the exact build Iris pins');
  console.log('pair:', irisItem.file.versionNumber, '+', sodiumItem.file.versionNumber);
  await installPacks(profile.id, shPlan, t());
  assert.ok((await listInstalled(profile.id)).some((m) => m.slug === 'iris'), 'Iris installed in mods');
  const shaders = await listPacks(profile.id, 'shader');
  assert.equal(shaders.length, 1);
  await setPackEnabled(profile.id, shaders[0].key, true);
  assert.equal(selectedShader(profile.id, 'fabric'), shaders[0].fileName);
  console.log('iris.properties:', fs.readFileSync(path.join(P.gameDir(profile.id), 'config', 'iris.properties'), 'utf8').trim().replace(/\n/g, ' | '));
  await setPackEnabled(profile.id, shaders[0].key, false);
  assert.equal(selectedShader(profile.id, 'fabric'), '');

  // --- removing moves to trash and disables
  await removePack(profile.id, packs[0].key);
  assert.ok(!enabledResourcePacks(profile.id).has(packs[0].fileName));
  assert.ok(fs.readdirSync(P.trash(profile.id)).some((f) => f.includes(packs[0].fileName)));

  // --- vanilla profiles: resource packs fine, shaders refused with a clear message
  const van = await createProfile({ name: `vanilla smoke ${Date.now()}`, mcVersion: '1.21.1', loader: 'vanilla' });
  await planPack(van.id, { provider: 'modrinth', projectId: rp.hits[0].id, type: 'resourcepack' });
  await assert.rejects(planPack(van.id, { provider: 'modrinth', projectId: sh.hits[0].id, type: 'shader' }), /Shaders need a mod loader/);

  // --- modpack becomes its own profile
  const mp = await modrinth.search({ type: 'modpack', query: 'fabulously optimized', sort: 'downloads', offset: 0, limit: 3 });
  assert.ok(mp.hits.length && mp.hits[0].type === 'modpack', 'modpack search');
  const before = (await listProfiles()).length;
  const res = await installModpackFromProject('modrinth', mp.hits[0].id, undefined, t());
  assert.equal((await listProfiles()).length, before + 1);
  const imported = await getProfile(res.profile.id);
  console.log('modpack ->', imported.name, imported.mcVersion, imported.loader, 'mods:', (await listInstalled(imported.id, { identify: false })).length);
  assert.ok((await listInstalled(imported.id, { identify: false })).length > 5);
  console.log('CONTENT SMOKE OK');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
