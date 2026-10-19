import * as path from 'path';
import { setRoot } from '../../main/paths';
setRoot(process.env.LUMEN_HOME || path.join(process.cwd(), '.test-home'));
import { Task } from '../../main/net';
import { createProfile } from '../../main/profiles';
import { installPerformancePack, listInstalled, diagnose } from '../../main/mods/manager';

(async () => {
  const p = await createProfile({ name: `perf ${Date.now()}`, mcVersion: '1.21.1', loader: 'fabric' });
  const r = await installPerformancePack(p.id, new Task('t', 't', () => {}));
  console.log('installed:', r.installed.join(', '));
  console.log('unavailable:', r.unavailable.join(', ') || '-');
  const mods = await listInstalled(p.id);
  console.log('problems:', (await diagnose(p.id)).map((x) => x.message));
  if (mods.length < 3) throw new Error('expected several mods');
  console.log('PERF SMOKE OK');
})().catch((e) => { console.error(e); process.exit(1); });
