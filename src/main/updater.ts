import { app } from 'electron';
import { logger } from './logger';

const log = logger('updater');

export interface UpdateState {
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'error' | 'unavailable';
  version?: string;
  percent?: number;
  error?: string;
}

let state: UpdateState = { status: 'idle' };
let emit: (s: UpdateState) => void = () => {};
let updater: any = null;

const set = (s: UpdateState) => {
  state = s;
  emit(s);
};
export const getUpdateState = () => state;

/**
 * In-launcher updates: the new version downloads in the background, the UI shows progress and a
 * "Restart to update" button, and installing runs the installer silently (no installer window) and
 * relaunches. Only active in packaged builds; releases come from GitHub Releases (see package.json "publish").
 */
export function initUpdater(onState: (s: UpdateState) => void) {
  emit = onState;
  if (!app.isPackaged) {
    state = { status: 'unavailable' };
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    updater = require('electron-updater').autoUpdater;
  } catch (e) {
    log.warn('electron-updater missing', e as Error);
    return set({ status: 'unavailable' });
  }
  updater.logger = null;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true; // also silent: if the user just closes the launcher, it updates quietly
  updater.on('checking-for-update', () => set({ status: 'checking' }));
  updater.on('update-not-available', () => set({ status: 'idle' }));
  updater.on('update-available', (i: any) => {
    log.info(`Update ${i.version} found, downloading`);
    set({ status: 'downloading', version: i.version, percent: 0 });
  });
  updater.on('download-progress', (p: any) => set({ status: 'downloading', version: state.version, percent: Math.round(p.percent) }));
  updater.on('update-downloaded', (i: any) => {
    log.info(`Update ${i.version} ready`);
    set({ status: 'ready', version: i.version });
  });
  updater.on('error', (e: Error) => {
    log.warn('Update error', e);
    set({ status: 'error', error: e.message.split('\n')[0] });
  });
  void checkNow();
  setInterval(() => void checkNow(), 30 * 60_000).unref();
}

export async function checkNow() {
  if (!updater || state.status === 'downloading' || state.status === 'ready') return state;
  try {
    await updater.checkForUpdates();
  } catch (e) {
    log.warn('Update check failed', e as Error);
  }
  return state;
}

/** Install the downloaded update: silent installer, then relaunch the launcher. */
export function installNow() {
  if (!updater || state.status !== 'ready') return false;
  setImmediate(() => updater.quitAndInstall(true, true));
  return true;
}
