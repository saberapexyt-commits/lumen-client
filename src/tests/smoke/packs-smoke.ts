/**
 * Live round-trip: install mods (Modrinth) → export .mrpack → import it as a new profile →
 * same mods present with matching hashes. Also backup export → restore. Needs network.
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import assert from 'node:assert/strict';
import { setRoot, getRoot, P } from '../../main/paths';
setRoot(process.env.LUMEN_HOME || path.join(process.cwd(), '.test-home'));

import { Task } from '../../main/net';
import { createProfile } from '../../main/profiles';
import { installPlan, listInstalled, planMod, importJars } from '../../main/mods/manager';
import { modrinth } from '../../main/mods/modrinth';
import { exportBackup, exportMrpack, importModpack } from '../../main/modpack';

async function main() {
  const t = () => new Task('t', 't', () => {});
  const src = await createProfile({ name: `pack src ${Date.now()}`, mcVersion: '1.21.1', loader: 'fabric' });
  const menu = (await modrinth.search({ query: 'modmenu', mcVersion: '1.21.1', loader: 'fabric', sort: 'relevance', offset: 0, limit: 3 })).hits.find((h) => h.slug === 'modmenu')!;
  await installPlan(src.id, await planMod(src.id, { provider: 'modrinth', projectId: menu.id }), t());
  fs.mkdirSync(path.join(P.gameDir(src.id), 'config'), { recursive: true });
  fs.writeFileSync(path.join(P.gameDir(src.id), 'config', 'example.json'), '{"hello":"world"}');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-pack-'));
  const pack = path.join(tmp, 'x.mrpack');
  const ex = await exportMrpack(src.id, pack);
  console.log('exported', ex);
  assert.ok(ex.included >= 3);

  const res = await importModpack(pack, t());
  const a = (await listInstalled(src.id)).map((m) => m.sha1).sort();
  const b = (await listInstalled(res.profile.id)).map((m) => m.sha1).sort();
  assert.deepEqual(b, a, 'imported profile has identical mod jars');
  assert.equal(res.profile.mcVersion, '1.21.1');
  assert.equal(res.profile.loader, 'fabric');
  assert.equal(fs.readFileSync(path.join(P.gameDir(res.profile.id), 'config', 'example.json'), 'utf8'), '{"hello":"world"}', 'config overrides applied');
  assert.ok((await listInstalled(res.profile.id)).every((m) => m.provider === 'modrinth'), 'mods re-identified on Modrinth');
  console.log('mrpack round-trip OK');

  // Zip-slip: a hostile pack must not write outside the profile.
  const AdmZip = (await import('adm-zip')).default;
  const evil = new AdmZip();
  evil.addFile('modrinth.index.json', Buffer.from(JSON.stringify({ formatVersion: 1, game: 'minecraft', name: 'evil', files: [], dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.0' } })));
  evil.addFile('overrides/xx/escaped.txt', Buffer.from('pwned'));
  const evilPath = path.join(tmp, 'evil.mrpack');
  evil.writeZip(evilPath);
  // adm-zip sanitises names on write, so patch the raw bytes: same length, 'xx' -> '..'
  const raw = fs.readFileSync(evilPath);
  let at = -1;
  while ((at = raw.indexOf('overrides/xx/escaped.txt', at + 1)) >= 0) raw.write('overrides/../escaped.txt', at);
  fs.writeFileSync(evilPath, raw);
  await assert.rejects(importModpack(evilPath, t()), /escapes target directory/);
  assert.ok(!fs.existsSync(path.join(P.profiles(), 'escaped.txt')) && !fs.existsSync(path.join(getRoot(), 'escaped.txt')));
  console.log('zip-slip rejected OK');

  // Full backup → restore into a new profile
  const bak = path.join(tmp, 'backup.zip');
  await exportBackup(src.id, bak, false);
  const restored = await importModpack(bak, t());
  assert.deepEqual((await listInstalled(restored.profile.id)).map((m) => m.sha1).sort(), a);
  console.log('backup restore OK');

  // importJars: duplicates are skipped, never overwritten
  const jar = path.join(P.modsDir(src.id), (await listInstalled(src.id))[0].fileName);
  const r = await importJars(res.profile.id, [jar]);
  assert.equal(r.added.length, 0);
  console.log('PACKS SMOKE OK');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
