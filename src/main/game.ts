import * as fs from 'fs';
import { P, ensureDir } from './paths';
import { Task } from './net';
import { LauncherError, logger } from './logger';
import { LOADERS, assertLoaderSupports } from './loaders';
import { ensureJava } from './minecraft/java';
import { installRuntimeFiles, installVanillaBase } from './minecraft/install';
import { LaunchSession, RunningGame, launchGame, splitArgs } from './minecraft/launch';
import { JVM_PRESETS, Profile, getProfile, saveProfile } from './profiles';
import { getSettings } from './settings';
import { applyTheme } from './theme';
import { syncLumenMod } from './lumenmod';
import { getSession } from './auth/microsoft';

const log = logger('game');
const running = new Map<string, RunningGame>();

export const isRunning = (id: string) => running.has(id);
export const runningIds = () => [...running.keys()];

export interface PreparedProfile {
  profile: Profile;
  versionId: string;
  javaPath: string;
  resolved: Awaited<ReturnType<typeof installRuntimeFiles>>['resolved'];
}

/**
 * Make a profile ready to launch: vanilla files, loader, libraries, assets, Java.
 * Safe to call repeatedly; only missing/corrupt files are fetched.
 */
export async function prepareProfile(profileId: string, task: Task): Promise<PreparedProfile> {
  let profile = await getProfile(profileId);
  const settings = await getSettings();

  const vanilla = await installVanillaBase(profile.mcVersion, task);
  task.throwIfCancelled();

  let versionId = profile.mcVersion;
  if (profile.loader !== 'vanilla') {
    const lv = await assertLoaderSupports(profile.loader, profile.mcVersion, profile.loaderVersion);
    versionId = await LOADERS[profile.loader].install(profile.mcVersion, lv!, task);
    if (profile.launchVersionId !== versionId || profile.loaderVersion !== lv) {
      profile = { ...profile, launchVersionId: versionId, loaderVersion: lv };
      await saveProfile(profile);
    }
  } else if (profile.launchVersionId !== versionId) {
    profile = { ...profile, launchVersionId: versionId };
    await saveProfile(profile);
  }
  task.throwIfCancelled();

  const gameDir = ensureDir(P.gameDir(profile.id));
  const { resolved } = await installRuntimeFiles(versionId, task, gameDir);

  let javaPath = profile.javaPath || settings.javaPathOverride;
  if (!javaPath) {
    const component = resolved.javaVersion?.component ?? vanilla.javaVersion?.component ?? 'jre-legacy';
    javaPath = await ensureJava(component, task);
  } else if (!fs.existsSync(javaPath)) {
    throw new LauncherError(`The custom Java path does not exist: ${javaPath}`);
  }
  await applyTheme(profile.id, profile.useLumenTheme ?? settings.lumenTheme);
  await syncLumenMod(profile, profile.useLumenMod ?? settings.lumenMod, task);
  return { profile, versionId, javaPath, resolved };
}

export async function play(
  profileId: string,
  task: Task,
  hooks: { onLine: (line: string, stream: 'out' | 'err') => void; onExit: (code: number | null) => void; onStarted: () => void },
): Promise<void> {
  if (running.has(profileId)) throw new LauncherError('This profile is already running.');
  // Sign-in first: fail fast before downloading gigabytes.
  const session = await getSession();
  const prep = await prepareProfile(profileId, task);
  task.throwIfCancelled();

  const settings = await getSettings();
  const { profile } = prep;
  const preset = JVM_PRESETS[profile.jvmPreset] ?? JVM_PRESETS.default;
  const launchSession: LaunchSession = { name: session.name, uuid: session.uuid, accessToken: session.accessToken, userType: 'msa', xuid: session.xuid, clientId: session.clientId };

  const started = Date.now();
  const game = launchGame(
    {
      versionId: prep.versionId,
      resolved: prep.resolved,
      javaPath: prep.javaPath,
      gameDir: P.gameDir(profile.id),
      session: launchSession,
      ramMb: profile.ramMb ?? settings.defaultRamMb,
      jvmArgs: [...preset.args, ...splitArgs(profile.jvmArgs)],
      width: profile.width,
      height: profile.height,
      fullscreen: profile.fullscreen,
    },
    profile.id,
    {
      onLine: hooks.onLine,
      onExit: async (code) => {
        running.delete(profile.id);
        try {
          const cur = await getProfile(profile.id);
          await saveProfile({ ...cur, playTimeMs: cur.playTimeMs + (Date.now() - started) });
        } catch {
          /* profile may have been deleted while playing */
        }
        log.info(`Game exited with code ${code}`);
        hooks.onExit(code);
      },
    },
  );
  running.set(profile.id, game);
  await saveProfile({ ...(await getProfile(profile.id)), lastPlayed: Date.now() });
  hooks.onStarted();
}

export function killGame(profileId: string) {
  running.get(profileId)?.child.kill();
}
