import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { P, ensureDir } from '../paths';
import { LauncherError, logger } from '../logger';
import { ArgValue, VersionJson, resolveLibraries, rulesAllow } from './versions';
import { clientJarPath, libraryPath, nativesDir } from './install';

const log = logger('launch');

export interface LaunchSession {
  name: string;
  uuid: string;
  accessToken: string;
  userType: 'msa' | 'legacy';
  xuid?: string;
  clientId?: string;
}

export interface LaunchOptions {
  versionId: string; // the launchable (possibly loader) version id
  resolved: VersionJson;
  javaPath: string;
  gameDir: string;
  session: LaunchSession;
  ramMb: number;
  minRamMb?: number;
  jvmArgs?: string[];
  gameArgs?: string[];
  width?: number;
  height?: number;
  fullscreen?: boolean;
  quickPlayServer?: string;
  launcherVersion?: string;
}

/** Split a user-typed JVM argument string, honouring simple quotes. */
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function flattenArgs(list: ArgValue[] | undefined, features: Record<string, boolean>): string[] {
  const out: string[] = [];
  for (const a of list ?? []) {
    if (typeof a === 'string') out.push(a);
    else if (rulesAllow(a.rules, features)) out.push(...(Array.isArray(a.value) ? a.value : [a.value]));
  }
  return out;
}

export function buildClasspath(v: VersionJson, baseVersion: string): string[] {
  const entries: string[] = [];
  const seen = new Set<string>();
  for (const l of resolveLibraries(v)) {
    if (l.native) continue; // extracted into the natives dir instead
    const p = libraryPath(l.path);
    if (seen.has(p)) continue;
    seen.add(p);
    entries.push(p);
  }
  entries.push(clientJarPath(baseVersion));
  return entries;
}

/** Build the full argv (without the java binary) for a launch. Pure apart from path lookups. */
export function buildLaunchArgs(o: LaunchOptions): string[] {
  const v = o.resolved;
  const baseVersion: string = (v as any)._baseVersion ?? v.id;
  const sep = process.platform === 'win32' ? ';' : ':';
  const classpath = buildClasspath(v, baseVersion).join(sep);
  const assetsIndex = v.assetIndex?.id ?? v.assets ?? 'legacy';
  const legacyAssets = assetsIndex === 'legacy' || assetsIndex === 'pre-1.6';

  const features: Record<string, boolean> = {
    has_custom_resolution: !!(o.width && o.height),
    is_demo_user: false,
    has_quick_plays_support: !!o.quickPlayServer,
    is_quick_play_multiplayer: !!o.quickPlayServer,
  };

  const vars: Record<string, string> = {
    auth_player_name: o.session.name,
    auth_uuid: o.session.uuid,
    auth_access_token: o.session.accessToken,
    auth_session: `token:${o.session.accessToken}:${o.session.uuid}`,
    auth_xuid: o.session.xuid ?? '',
    clientid: o.session.clientId ?? '',
    user_type: o.session.userType,
    user_properties: '{}',
    version_name: v.id,
    version_type: v.type ?? 'release',
    game_directory: o.gameDir,
    assets_root: P.assets(),
    assets_index_name: assetsIndex,
    game_assets: legacyAssets ? path.join(P.assets(), 'virtual', assetsIndex) : P.assets(),
    natives_directory: nativesDir(v.id),
    launcher_name: 'LumenClient',
    launcher_version: o.launcherVersion ?? '0.1.0',
    classpath,
    classpath_separator: sep,
    library_directory: P.libraries(),
    resolution_width: String(o.width ?? 854),
    resolution_height: String(o.height ?? 480),
    quickPlayMultiplayer: o.quickPlayServer ?? '',
  };
  const subWith = (v: Record<string, string>) => (s: string) => s.replace(/\$\{([^}]+)\}/g, (m, k) => (k in v ? v[k] : m));
  const sub = subWith(vars);
  // Forge/NeoForge pass -DignoreList=...,${version_name}.jar so the module loader skips the vanilla client
  // jar on the classpath. That jar is named after the *base* Minecraft version, so JVM args must see
  // the base name (otherwise "Modules _1._21._1 and minecraft export package ..." at startup).
  const subJvm = subWith({ ...vars, version_name: baseVersion });

  let jvm: string[];
  let game: string[];
  if (v.arguments) {
    jvm = flattenArgs(v.arguments.jvm, features);
    game = flattenArgs(v.arguments.game, features);
  } else {
    jvm = ['-Djava.library.path=${natives_directory}', '-Dminecraft.launcher.brand=${launcher_name}', '-Dminecraft.launcher.version=${launcher_version}', '-cp', '${classpath}'];
    game = (v.minecraftArguments ?? '').split(/\s+/).filter(Boolean);
  }
  // Legacy Windows 10 / old-version quirk guards: make sure classpath is always provided.
  if (!jvm.includes('-cp') && !jvm.includes('-classpath')) jvm.push('-cp', '${classpath}');

  const logArg = v.logging?.client?.argument;
  const logCfg = v.logging?.client?.file;
  if (logArg && logCfg) jvm.push(logArg.replace('${path}', path.join(P.assets(), 'log_configs', logCfg.id)));

  if (o.width && o.height && !v.arguments) game.push('--width', String(o.width), '--height', String(o.height));
  if (o.fullscreen) game.push('--fullscreen');
  if (o.quickPlayServer && !v.arguments) game.push('--server', o.quickPlayServer);

  const mem = [`-Xmx${o.ramMb}M`, `-Xms${Math.min(o.minRamMb ?? 512, o.ramMb)}M`];
  return [...mem, ...(o.jvmArgs ?? []), ...jvm.map(subJvm), v.mainClass, ...game.map(sub), ...(o.gameArgs ?? [])];
}

/** Mask secrets before an argv is written to logs. */
export function redact(args: string[], token: string): string {
  return args.map((a) => (token && a.includes(token) ? a.split(token).join('***') : a)).join(' ');
}

export interface RunningGame {
  child: ChildProcess;
  profileId: string;
  startedAt: number;
}

export function launchGame(
  o: LaunchOptions,
  profileId: string,
  hooks: { onLine: (line: string, stream: 'out' | 'err') => void; onExit: (code: number | null, signal: string | null) => void },
): RunningGame {
  if (!fs.existsSync(o.javaPath)) throw new LauncherError(`Java was not found at ${o.javaPath}.`);
  ensureDir(o.gameDir);
  const args = buildLaunchArgs(o);
  log.info(`Launching ${o.versionId}: ${o.javaPath} ${redact(args, o.session.accessToken)}`);
  const child = spawn(o.javaPath, args, { cwd: o.gameDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
  const pipe = (s: NodeJS.ReadableStream, kind: 'out' | 'err') => {
    let buf = '';
    s.on('data', (d: Buffer) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        hooks.onLine(buf.slice(0, i).replace(/\r$/, ''), kind);
        buf = buf.slice(i + 1);
      }
    });
  };
  pipe(child.stdout!, 'out');
  pipe(child.stderr!, 'err');
  child.on('exit', (code, sig) => hooks.onExit(code, sig));
  child.on('error', (e) => {
    hooks.onLine(`Failed to start the game: ${e.message}`, 'err');
    hooks.onExit(-1, null);
  });
  return { child, profileId, startedAt: Date.now() };
}
