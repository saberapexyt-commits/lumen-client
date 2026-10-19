/**
 * Starts a real game with the Lumen theme applied and saves a screenshot of the title screen.
 *   node dist/tests/smoke/theme-smoke.js 1.21.1 [loader] [outfile.png]
 */
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { setRoot, P } from '../../main/paths';
setRoot(process.env.LUMEN_HOME || path.join(process.cwd(), '.test-home'));
import { Task } from '../../main/net';
import { createProfile } from '../../main/profiles';
import { prepareProfile } from '../../main/game';
import { launchGame } from '../../main/minecraft/launch';
import { LoaderId } from '../../main/loaders';

async function main() {
  const mc = process.argv[2] || '1.21.1';
  const loader = (process.argv[3] || 'vanilla') as LoaderId;
  const out = path.resolve(process.argv[4] || `theme-${mc}.png`);
  const profile = await createProfile({ name: `theme ${mc} ${Date.now()}`, mcVersion: mc, loader });
  const prep = await prepareProfile(profile.id, new Task('t', 't', () => {}));
  const gameDir = P.gameDir(profile.id);
  if (process.env.LUMEN_SERVERS) {
    // minimal uncompressed NBT: { servers: [ {name, ip}, ... ] }
    const str = (v: string) => { const b = Buffer.from(v, 'utf8'); const l = Buffer.alloc(2); l.writeUInt16BE(b.length); return Buffer.concat([l, b]); };
    const entry = (name: string, ip: string) => Buffer.concat([Buffer.from([8]), str('name'), str(name), Buffer.from([8]), str('ip'), str(ip), Buffer.from([0])]);
    const list = [['Hypixel', 'mc.hypixel.net'], ['My Survival', 'play.example.com'], ['Creative Plots', 'creative.example.org']].map(([n, i]) => entry(n, i));
    const count = Buffer.alloc(4); count.writeInt32BE(list.length);
    fs.writeFileSync(path.join(gameDir, 'servers.dat'), Buffer.concat([Buffer.from([10]), str(''), Buffer.from([9]), str('servers'), Buffer.from([10]), count, ...list, Buffer.from([0])]));
  }
  console.log('options.txt:', fs.readFileSync(path.join(gameDir, 'options.txt'), 'utf8').trim());
  console.log('pack present:', fs.existsSync(path.join(gameDir, 'resourcepacks', 'Lumen Theme.zip')));

  await new Promise<void>((resolve) => {
    let shot = false;
    const game = launchGame(
      { versionId: prep.versionId, resolved: prep.resolved, javaPath: prep.javaPath, gameDir, session: { name: 'Tester', uuid: '00000000000000000000000000000000', accessToken: '0', userType: 'legacy' }, ramMb: 2048, width: 1280, height: 720, jvmArgs: process.env.LUMEN_JVM ? process.env.LUMEN_JVM.split(' ') : [] },
      profile.id,
      {
        onLine: (l) => {
          if (/pack|resource/i.test(l) && /(incompatible|invalid|error|fail)/i.test(l)) console.log('LOG:', l.slice(0, 200));
          if (!shot && /Backend library|Sound engine started|OpenAL initialized/i.test(l)) {
            shot = true;
            setTimeout(() => {
              // Capture only the game window (never the whole desktop).
              execFileSync('powershell', ['-NoProfile', '-File', path.join(process.cwd(), 'scripts', 'capture-window.ps1'), '-TitlePrefix', 'Minecraft', '-Out', out]);
              console.log('screenshot saved', out);
              game.child.kill();
            }, 14000);
          }
        },
        onExit: () => resolve(),
      },
    );
    setTimeout(() => game.child.kill(), 150_000);
  });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
