/**
 * End-to-end smoke test (needs network, downloads several hundred MB on first run):
 * installs a Minecraft version (+ optional loader) into a throwaway LUMEN_HOME, starts the real
 * game process with a dummy session, and waits for the game's own startup log lines.
 *
 *   node dist/tests/smoke/launch-smoke.js 1.21.1 fabric
 */
import * as path from 'path';
import { setRoot } from '../../main/paths';
setRoot(process.env.LUMEN_HOME || path.join(process.cwd(), '.test-home'));

import { Task } from '../../main/net';
import { createProfile } from '../../main/profiles';
import { prepareProfile } from '../../main/game';
import { launchGame } from '../../main/minecraft/launch';
import { P } from '../../main/paths';
import { LoaderId } from '../../main/loaders';

async function main() {
  const mc = process.argv[2] || '1.21.1';
  const loader = (process.argv[3] || 'vanilla') as LoaderId;
  const profile = await createProfile({ name: `smoke ${mc} ${loader} ${Date.now()}`, mcVersion: mc, loader });
  const task = new Task('smoke', 'smoke', (t) => {
    process.stdout.write(`\r${t.label.padEnd(50)} ${t.done}/${t.total}   `);
  });
  console.log(`Preparing ${profile.id}`);
  const prep = await prepareProfile(profile.id, task);
  console.log(`\nPrepared. version=${prep.versionId} java=${prep.javaPath}`);

  let ok = false;
  const lines: string[] = [];
  await new Promise<void>((resolve) => {
    const game = launchGame(
      {
        versionId: prep.versionId,
        resolved: prep.resolved,
        javaPath: prep.javaPath,
        gameDir: P.gameDir(profile.id),
        // Dummy session: enough to reach the title screen; online features simply fail.
        session: { name: 'SmokeTest', uuid: '00000000000000000000000000000000', accessToken: '0', userType: 'legacy' },
        ramMb: 2048,
        width: 640,
        height: 360,
      },
      profile.id,
      {
        onLine: (l) => {
          lines.push(l);
          if (/Backend library|Sound engine started|Narrator library|OpenAL initialized|Loading for game Minecraft/i.test(l)) {
            ok = true;
            console.log(`Game reached startup milestone: ${l}`);
            game.child.kill();
          }
        },
        onExit: () => resolve(),
      },
    );
    setTimeout(() => game.child.kill(), 120_000);
  });
  if (!ok) {
    console.error('Game did not reach a startup milestone. Last lines:\n' + lines.slice(-25).join('\n'));
    process.exit(1);
  }
  console.log('SMOKE OK');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
