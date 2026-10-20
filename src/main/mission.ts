import { BrowserWindow, nativeImage, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { P } from './paths';
import { Profile } from './profiles';

/**
 * "Mission Control": a separate window that opens while a game starts and shows its live console,
 * the mods that were loaded and the profile's screenshots, with a stop button. It lives in the main process
 * so the log buffer survives the window being closed and reopened.
 */
const MAX_LINES = 6000;

let win: BrowserWindow | null = null;
let current: { profile: Profile; state: 'starting' | 'running' | 'exited'; code?: number | null; startedAt: number; lines: { line: string; stream: string }[] } | null = null;

export function missionInfo() {
  return current ? { profile: current.profile, state: current.state, code: current.code ?? null, startedAt: current.startedAt } : null;
}

export function missionLines() {
  return current?.lines ?? [];
}

function sendToWindow(channel: string, payload: unknown) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/** Called when a game starts launching. Resets the buffer and opens (or refocuses) the window. */
export function startMission(profile: Profile) {
  current = { profile, state: 'starting', startedAt: Date.now(), lines: [] };
  ev = null;
  if (win && !win.isDestroyed()) {
    win.webContents.send('game:state', { profileId: profile.id, state: 'starting' });
    win.show();
    return;
  }
  win = new BrowserWindow({
    width: 940,
    height: 640,
    minWidth: 760,
    minHeight: 480,
    backgroundColor: '#0b0d11',
    title: 'Mission Control',
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'logo-mark.png'),
    frame: false,
    show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => win?.show());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'mission.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('closed', () => (win = null));
}

/**
 * Minecraft's log4j config writes XML events (a few lines each). Turn them back into readable
 * "[12:34:56] [Render thread/INFO] (Logger): message" lines; anything else passes through untouched.
 */
let ev: { head: string; msg: string[]; inMsg: boolean; extra: string[] } | null = null;

function formatEvent(e: NonNullable<typeof ev>): string {
  const attr = (n: string) => new RegExp(`${n}="([^"]*)"`).exec(e.head)?.[1] ?? '';
  const ts = Number(attr('timestamp'));
  const time = ts ? new Date(ts).toTimeString().slice(0, 8) : '--:--:--';
  const logger = attr('logger').split('.').pop() || '';
  const NL = String.fromCharCode(10);
  const text = e.msg.join(NL).trim();
  return `[${time}] [${attr('thread')}/${attr('level')}] (${logger}) ${text}${e.extra.length ? NL + e.extra.join(NL) : ''}`;
}

function* normalise(line: string): Generator<string> {
  if (!ev && !line.includes('<log4j:Event')) {
    if (line.includes('<log4j:') || line.includes('</log4j:') || /^\s*<\?xml/.test(line)) return; // stray XML scaffolding
    yield line;
    return;
  }
  if (!ev) ev = { head: line, msg: [], inMsg: false, extra: [] };
  else if (line.includes('<log4j:Event')) ev.head = line;
  let rest = line;
  if (ev.inMsg || rest.includes('<![CDATA[')) {
    const start = rest.indexOf('<![CDATA[');
    if (start >= 0) {
      rest = rest.slice(start + 9);
      ev.inMsg = true;
    }
    const end = rest.indexOf(']]>');
    if (end >= 0) {
      ev.msg.push(rest.slice(0, end));
      ev.inMsg = false;
    } else if (ev.inMsg) ev.msg.push(rest);
  } else if (!/<\/?log4j:/.test(line) && line.trim()) {
    ev.extra.push(line); // e.g. stack trace lines inside <log4j:Throwable>
  }
  if (line.includes('</log4j:Event>')) {
    const out = formatEvent(ev);
    ev = null;
    yield out;
  }
}

export function missionLine(profileId: string, line: string, stream: string) {
  if (!current || current.profile.id !== profileId) return;
  for (const out of normalise(line)) {
    for (const part of out.split(String.fromCharCode(10))) {
      current.lines.push({ line: part, stream });
      sendToWindow('game:log', { profileId, line: part, stream });
    }
  }
  if (current.lines.length > MAX_LINES) current.lines.splice(0, 1000);
}

export function missionState(profileId: string, state: 'running' | 'exited', code?: number | null) {
  if (!current || current.profile.id !== profileId) return;
  current.state = state;
  if (state === 'running') current.startedAt = Date.now();
  current.code = code;
  sendToWindow('game:state', { profileId, state, code });
}

export function closeMission() {
  if (win && !win.isDestroyed()) win.close();
}

export function isMissionWindow(wc: Electron.WebContents) {
  return !!win && !win.isDestroyed() && win.webContents === wc;
}

/** Newest screenshots of the running profile as small data URLs. */
export function missionScreenshots(limit = 24): { name: string; dataUrl: string; time: number }[] {
  if (!current) return [];
  const dir = path.join(P.gameDir(current.profile.id), 'screenshots');
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(0, limit);
  const out: { name: string; dataUrl: string; time: number }[] = [];
  for (const { f, t } of files) {
    try {
      const img = nativeImage.createFromPath(path.join(dir, f));
      if (img.isEmpty()) continue;
      out.push({ name: f, dataUrl: img.resize({ width: 360 }).toDataURL(), time: t });
    } catch {
      /* unreadable file: skip */
    }
  }
  return out;
}

export async function openScreenshot(name: string) {
  if (!current || name !== path.basename(name)) return; // no path traversal
  await shell.openPath(path.join(P.gameDir(current.profile.id), 'screenshots', name));
}

export async function openGameLogs() {
  if (current) await shell.openPath(path.join(P.gameDir(current.profile.id), 'logs'));
}
