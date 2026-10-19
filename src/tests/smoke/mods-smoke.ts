/**
 * Live test of the mod manager against the real Modrinth API (no key needed).
 *   node dist/tests/smoke/mods-smoke.js
 */
import * as path from 'path';
import * as fs from 'fs';
import assert from 'node:assert/strict';
import { setRoot, P } from '../../main/paths';
setRoot(process.env.LUMEN_HOME || path.join(process.cwd(), '.test-home'));

import { Task } from '../../main/net';
import { createProfile } from '../../main/profiles';
import { modrinth } from '../../main/mods/modrinth';
import { checkUpdates, dependentsOf, diagnose, installPlan, listInstalled, planMod, listVersions, removeMod, setEnabled } from '../../main/mods/manager';

const mc = process.argv[2] || '1.21.1';
const loader = (process.argv[3] || 'fabric') as 'fabric' | 'quilt' | 'forge' | 'neoforge';

async function main() {
  const profile = await createProfile({ name: `mods smoke ${Date.now()}`, mcVersion: mc, loader });
  const task = () => new Task('t', 't', () => {});

  // Search is filtered by version + loader.
  const res = await modrinth.search({ query: 'sodium', mcVersion: mc, loader, sort: 'relevance', offset: 0, limit: 5 });
  console.log('search hits:', res.hits.map((h) => h.title).join(', '));
  assert.ok(res.hits.length > 0);

  // Mod Menu declares Fabric API as a required dependency.
  const menu = (await modrinth.search({ query: 'modmenu', mcVersion: mc, loader, sort: 'relevance', offset: 0, limit: 3 })).hits.find((h) => h.slug === 'modmenu');
  assert.ok(menu, 'modmenu found');
  const plan = await planMod(profile.id, { provider: 'modrinth', projectId: menu!.id });
  console.log('plan:', plan.items.map((i) => `${i.role}:${i.project.title}@${i.file.versionNumber} [${i.file.gameVersions.includes(mc)}]`).join(' | '));
  for (const it of plan.items) {
    assert.ok(it.file.gameVersions.includes(mc), `${it.project.title} targets ${mc}`);
    assert.ok(it.file.loaders.includes(loader) || (loader === 'quilt' && it.file.loaders.includes('fabric')));
  }
  assert.ok(plan.items.some((i) => i.project.slug === 'fabric-api' && i.role === 'dependency'), 'fabric-api pulled in as dependency');

  const r = await installPlan(profile.id, plan, task());
  console.log('installed:', r.installed.join(', '));
  let mods = await listInstalled(profile.id);
  assert.equal(mods.length, plan.items.length);
  for (const m of mods) assert.ok(fs.existsSync(path.join(P.modsDir(profile.id), m.fileName)), `${m.fileName} on disk`);

  // Dependents of fabric-api include modmenu.
  const api = mods.find((m) => m.slug === 'fabric-api')!;
  assert.ok((await dependentsOf(profile.id, api.key)).some((d) => d.title.toLowerCase().includes('mod menu')));

  // Disable / enable renames the jar and never deletes it.
  const mm = mods.find((m) => m.slug === 'modmenu')!;
  await setEnabled(profile.id, mm.key, false);
  assert.ok(fs.existsSync(path.join(P.modsDir(profile.id), mm.fileName + '.disabled')));
  assert.equal((await listInstalled(profile.id)).find((m) => m.key === mm.key)!.enabled, false);
  // Disabled Mod Menu = fabric-api no longer *needed*, but health check must flag nothing wrong.
  await setEnabled(profile.id, mm.key, true);

  // Health check: removing Fabric API (which Mod Menu needs) must be detected.
  await removeMod(profile.id, api.key);
  const problems = await diagnose(profile.id);
  console.log('problems after removing fabric-api:', problems.map((p) => p.message).join(' | '));
  assert.ok(problems.some((p) => /Fabric API/.test(p.message)), 'missing dependency detected');
  assert.ok(fs.readdirSync(P.trash(profile.id)).some((f) => f.includes(api.fileName)), 'removed jar kept in trash');

  // Other versions picker flags incompatible releases instead of hiding them.
  const versions = await listVersions(profile.id, 'modrinth', menu!.id);
  assert.ok(versions.some((v) => v.compatible) && versions.some((v) => !v.compatible));
  assert.equal(versions.filter((v) => v.recommended).length, 1);

  const upd = await checkUpdates(profile.id);
  console.log('updates:', upd.updates.length, 'unchecked:', upd.unchecked.length);

  // Hash-based identification of an untracked jar.
  const sodium = (await modrinth.getFiles('AANobbMI', { mcVersion: mc, loader }))[0];
  if (sodium) {
    const dest = path.join(P.modsDir(profile.id), sodium.fileName);
    const buf = Buffer.from(await (await fetch(sodium.url!)).arrayBuffer());
    fs.writeFileSync(dest, buf);
    mods = await listInstalled(profile.id);
    const found = mods.find((m) => m.fileName === sodium.fileName)!;
    console.log('local jar identified as:', found.provider, found.title);
    assert.equal(found.provider, 'modrinth');
  }
  console.log('MODS SMOKE OK');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
