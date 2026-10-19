import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell, Menu } from 'electron';
import * as path from 'path';
import { P, ensureDir, getRoot } from './paths';
import { LauncherError, CancelledError, friendlyError, logger, onLog, recentLogs } from './logger';
import { Task, getJson, randomId } from './net';
import { encryptSecret, getSettings, setSafeStorage, updateSettings, Settings } from './settings';
import * as auth from './auth/microsoft';
import { getManifest } from './minecraft/versions';
import { LOADERS, LoaderId, getLoaderVersions } from './loaders';
import * as profiles from './profiles';
import * as game from './game';
import * as mods from './mods/manager';
import * as modpack from './modpack';
import * as options from './options';
import { QUICK_OPTIONS } from './options';

const log = logger('main');
let win: BrowserWindow | null = null;
const tasks = new Map<string, Task>();
let pendingLogin: AbortController | null = null;

const send = (channel: string, payload: unknown) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

/** Run `fn` as a cancellable background task whose progress is pushed to the UI. */
function startTask<T>(title: string, fn: (t: Task) => Promise<T>, onDone?: (r: T) => void): string {
  const id = randomId();
  const task = new Task(id, title, (t) => send('task:update', t.toJSON()));
  tasks.set(id, task);
  send('task:update', task.toJSON());
  fn(task)
    .then((r) => {
      task.status = 'done';
      onDone?.(r);
      send('task:update', { ...task.toJSON(), result: r as any });
    })
    .catch((e) => {
      if (e instanceof CancelledError || task.signal.aborted) task.status = 'cancelled';
      else {
        task.status = 'error';
        task.error = friendlyError(e);
        log.error(`Task "${title}" failed`, e instanceof Error ? e : new Error(String(e)));
      }
      send('task:update', task.toJSON());
    })
    .finally(() => setTimeout(() => tasks.delete(id), 60_000));
  return id;
}

const openExternalSafe = (url: string) => {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') void shell.openExternal(url);
  } catch {
    /* ignore malformed */
  }
};

type Handler = (...args: any[]) => Promise<unknown> | unknown;

const handlers: Record<string, Handler> = {
  'app:info': () => ({ version: app.getVersion(), root: getRoot(), platform: process.platform, safeStorage: safeStorage.isEncryptionAvailable() }),

  /* settings */
  'settings:get': async () => {
    const s = await getSettings();
    const { curseforgeKeyEnc, ...rest } = s;
    return { ...rest, curseforgeKeySet: !!curseforgeKeyEnc || !!process.env.CURSEFORGE_API_KEY };
  },
  'settings:set': async (patch: Partial<Settings> & { curseforgeKey?: string }) => {
    const { curseforgeKey, ...rest } = patch;
    const next: Partial<Settings> = { ...rest };
    delete (next as any).curseforgeKeyEnc;
    if (curseforgeKey !== undefined) next.curseforgeKeyEnc = encryptSecret(curseforgeKey.trim());
    await updateSettings(next);
    return handlers['settings:get']();
  },

  /* minecraft versions & loaders */
  'versions:list': async () => {
    const m = await getManifest();
    return { latest: m.latest, versions: m.versions.map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime })) };
  },
  'loaders:versions': async (loader: LoaderId, mc: string) => getLoaderVersions(loader, mc),
  'loaders:list': () => Object.values(LOADERS).map((l) => ({ id: l.id, name: l.name })),

  /* profiles */
  'profiles:list': async () => (await profiles.listProfiles()).map((p) => ({ ...p, running: game.isRunning(p.id) })),
  'profiles:create': (input: profiles.CreateProfileInput) => profiles.createProfile(input),
  'profiles:update': (id: string, patch: Partial<profiles.Profile>) => profiles.updateProfile(id, patch),
  'profiles:duplicate': (id: string) => profiles.duplicateProfile(id),
  'profiles:delete': (id: string) => {
    if (game.isRunning(id)) throw new LauncherError('Close the game before deleting this profile.');
    return profiles.deleteProfile(id);
  },
  'profiles:presets': () => Object.entries(profiles.JVM_PRESETS).map(([id, p]) => ({ id, name: p.name })),
  'profiles:openFolder': async (id: string) => void (await shell.openPath(P.gameDir((await profiles.getProfile(id)).id))),
  'profiles:install': (id: string) => startTask('Installing profile files', async (t) => void (await game.prepareProfile(id, t))),

  /* game */
  'game:play': (id: string) => {
    const taskId = startTask(
      'Preparing to play',
      (t) =>
        game.play(id, t, {
          onStarted: () => send('game:state', { profileId: id, state: 'running' }),
          onLine: (line, stream) => send('game:log', { profileId: id, line, stream }),
          onExit: (code) => {
            send('game:state', { profileId: id, state: 'exited', code });
            if (win && !win.isDestroyed() && !win.isVisible()) win.show();
          },
        }),
      async () => {
        if ((await getSettings()).closeOnLaunch) win?.minimize();
      },
    );
    send('game:state', { profileId: id, state: 'starting' });
    return taskId;
  },
  'game:kill': (id: string) => game.killGame(id),
  'task:cancel': (id: string) => tasks.get(id)?.cancel(),
  'options:get': (id: string) => ({ spec: QUICK_OPTIONS, values: options.readOptions(id) }),
  'options:set': (id: string, values: any) => {
    if (game.isRunning(id)) throw new LauncherError('Close the game first - Minecraft rewrites options.txt when it exits.');
    options.writeOptions(id, values);
  },

  /* accounts */
  'auth:list': () => auth.listAccounts(),
  'auth:begin': async () => {
    const { device, deviceCode, interval } = await auth.beginLogin();
    pendingLogin?.abort();
    const ctl = (pendingLogin = new AbortController());
    auth
      .finishLogin(deviceCode, interval, device.expiresIn, ctl.signal)
      .then((acc) => send('auth:done', { ok: true, name: acc.name }))
      .catch((e) => send('auth:done', { ok: false, error: friendlyError(e) }));
    openExternalSafe(device.verificationUri);
    return device;
  },
  'auth:cancel': () => pendingLogin?.abort(),
  'auth:remove': (id: string) => auth.removeAccount(id),
  'auth:setActive': (id: string) => auth.setActiveAccount(id),

  /* mod sources */
  'mods:providers': async () => ({
    modrinth: await mods.providers.modrinth.status(),
    curseforge: await mods.providers.curseforge.status(),
  }),
  'mods:search': async (provider: 'modrinth' | 'curseforge', q: any) => mods.providers[provider].search(q),
  'mods:categories': (provider: 'modrinth' | 'curseforge') => mods.providers[provider].getCategories(),
  'mods:project': (provider: 'modrinth' | 'curseforge', id: string) => mods.providers[provider].getProject(id),
  'mods:versions': (profileId: string, provider: 'modrinth' | 'curseforge', projectId: string) => mods.listVersions(profileId, provider, projectId),
  'mods:plan': (profileId: string, req: any) => mods.planMod(profileId, req),
  // The renderer only says *what* to install; the main process re-plans, so file URLs never come from the UI.
  'mods:install': (profileId: string, req: any, optional: any[] = []) =>
    startTask('Installing mods', async (t) => {
      t.stage('Resolving compatible files');
      const plan = await mods.planMod(profileId, req);
      if (plan.blockers.length && !req.ignoreBlockers) throw new LauncherError(plan.blockers.join('\n'));
      return mods.installPlan(profileId, plan, t, optional);
    }),
  'mods:list': (profileId: string) => mods.listInstalled(profileId),
  'mods:count': (profileId: string) => mods.countMods(profileId),
  'mods:toggle': (profileId: string, key: string, enabled: boolean) => mods.setEnabled(profileId, key, enabled),
  'mods:dependents': (profileId: string, key: string) => mods.dependentsOf(profileId, key),
  'mods:remove': (profileId: string, key: string) => mods.removeMod(profileId, key),
  'mods:checkUpdates': (profileId: string) => mods.checkUpdates(profileId),
  'mods:update': (profileId: string, keys: string[]) =>
    startTask('Updating mods', async (t) => {
      const done: string[] = [];
      for (const k of keys) {
        t.throwIfCancelled();
        const r = await mods.updateMod(profileId, k, t);
        done.push(...r.installed);
      }
      return { installed: done, skipped: [] };
    }),
  'mods:performancePack': (profileId: string) => startTask('Installing performance pack', (t) => mods.installPerformancePack(profileId, t)),
  'mods:diagnose': (profileId: string) => mods.diagnose(profileId),
  'mods:importFiles': async (profileId: string) => {
    const r = await dialog.showOpenDialog(win!, { title: 'Add mod files', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Mods', extensions: ['jar'] }] });
    return r.canceled ? null : mods.importJars(profileId, r.filePaths);
  },
  'mods:importFolder': async (profileId: string) => {
    const r = await dialog.showOpenDialog(win!, { title: 'Import all mods from a folder', properties: ['openDirectory'] });
    return r.canceled ? null : mods.importFolder(profileId, r.filePaths[0]);
  },
  'mods:openFolder': async (profileId: string) => void (await shell.openPath(ensureDir(P.modsDir(profileId)))),
  'mods:openTrash': async (profileId: string) => void (await shell.openPath(ensureDir(P.trash(profileId)))),

  /* modpacks & backups */
  'packs:import': async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Import modpack', properties: ['openFile'], filters: [{ name: 'Modpacks', extensions: ['mrpack', 'zip'] }] });
    if (r.canceled) return null;
    return startTask('Importing modpack', (t) => modpack.importModpack(r.filePaths[0], t));
  },
  'packs:exportMrpack': async (profileId: string) => {
    const p = await profiles.getProfile(profileId);
    const r = await dialog.showSaveDialog(win!, { title: 'Export as Modrinth modpack', defaultPath: `${p.name}.mrpack`, filters: [{ name: 'Modrinth modpack', extensions: ['mrpack'] }] });
    return r.canceled || !r.filePath ? null : { path: r.filePath, ...(await modpack.exportMrpack(profileId, r.filePath)) };
  },
  'packs:exportBackup': async (profileId: string, includeWorlds: boolean) => {
    const p = await profiles.getProfile(profileId);
    const r = await dialog.showSaveDialog(win!, { title: 'Back up profile', defaultPath: `${p.name}-backup.zip`, filters: [{ name: 'Lumen backup', extensions: ['zip'] }] });
    if (r.canceled || !r.filePath) return null;
    await modpack.exportBackup(profileId, r.filePath, includeWorlds);
    return { path: r.filePath };
  },

  /* home */
  'news:get': async () => {
    const data = await getJson<{ entries: any[] }>('https://launchercontent.mojang.com/v2/javaPatchNotes.json', { ttl: 30 * 60_000 });
    return data.entries.slice(0, 12).map((e) => ({
      title: e.title,
      type: e.type,
      version: e.version,
      date: e.date,
      image: e.image?.url ? `https://launchercontent.mojang.com${e.image.url}` : undefined,
      text: String(e.shortText ?? '').trim().slice(0, 220),
      url: e.version ? `https://www.minecraft.net/en-us/article/minecraft-java-edition-${String(e.version).replace(/\./g, '-')}` : undefined,
    }));
  },

  /* misc */
  'logs:recent': () => recentLogs(),
  'shell:openLogs': async () => void (await shell.openPath(ensureDir(P.logs()))),
  'shell:openExternal': (url: string) => openExternalSafe(url),
};

function registerIpc() {
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (_e, ...args) => {
      try {
        return { ok: true, data: await fn(...args) };
      } catch (e) {
        if (!(e instanceof LauncherError)) log.error(`IPC ${channel} failed`, e instanceof Error ? e : new Error(String(e)));
        return { ok: false, error: friendlyError(e) };
      }
    });
  }
  ipcMain.on('window:minimize', () => win?.minimize());
  ipcMain.on('window:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.on('window:close', () => win?.close());
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0b0d11',
    title: 'Lumen Client',
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'logo-mark.png'),
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win?.show());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  if (process.env.LUMEN_SHOT_DIR) void screenshotTour(process.env.LUMEN_SHOT_DIR);
  win.on('maximize', () => send('window:state', { maximized: true }));
  win.on('unmaximize', () => send('window:state', { maximized: false }));
}

/** Developer aid: LUMEN_SHOT_DIR=<dir> renders each page to a PNG, prints renderer errors, then exits. */
async function screenshotTour(dir: string) {
  const fs = await import('fs');
  fs.mkdirSync(dir, { recursive: true });
  const wc = win!.webContents;
  wc.on('console-message', (e: any) => {
    if ((e.level ?? e) === 'error' || e.level === 3) console.log('[renderer error]', e.message ?? '', e.sourceId ?? '', e.lineNumber ?? '');
  });
  await new Promise<void>((r) => wc.once('did-finish-load', () => r()));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await wait(3500);
  if (process.env.LUMEN_SHOT_SIZE) {
    const [w, h] = process.env.LUMEN_SHOT_SIZE.split(',').map(Number);
    win!.setSize(w, h);
    await wait(600);
  }
  const extra = (process.env.LUMEN_SHOT_JS || '').split(';;').filter(Boolean);
  for (const page of ['home', 'profiles', 'browse', 'installed', 'client', 'console', 'settings']) {
    await wc.executeJavaScript(`window.__navigate('${page}')`);
    await wait(page === 'browse' || page === 'home' ? 3500 : 1200);
    for (const js of page === (process.env.LUMEN_SHOT_PAGE || '') ? extra : []) {
      await wc.executeJavaScript(js);
      await wait(2500);
    }
    const img = await wc.capturePage();
    fs.writeFileSync(path.join(dir, `${page}.png`), img.toPNG());
  }
  app.quit();
}

/** Packaged builds check GitHub Releases for a newer version and install it on next quit. */
function checkForUpdates() {
  if (!app.isPackaged) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { autoUpdater } = require('electron-updater');
    autoUpdater.logger = null;
    autoUpdater.on('update-available', (i: any) => log.info(`Update ${i.version} available, downloading`));
    autoUpdater.on('update-downloaded', (i: any) => {
      log.info(`Update ${i.version} downloaded; installs on quit`);
      send('log:line', `Update ${i.version} ready - it installs when you close the launcher.`);
    });
    autoUpdater.on('error', (e: Error) => log.warn('Update check failed', e));
    void autoUpdater.checkForUpdates();
  } catch (e) {
    log.warn('Updater unavailable', e as Error);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    setSafeStorage(safeStorage);
    Menu.setApplicationMenu(null);
    ensureDir(P.profiles());
    onLog((line) => send('log:line', line));
    registerIpc();
    createWindow();
    checkForUpdates();
    log.info(`Lumen Client ${app.getVersion()} started; data in ${getRoot()}`);
  });
  app.on('window-all-closed', () => {
    // Keep running games alive; just quit the launcher UI.
    app.quit();
  });
  process.on('unhandledRejection', (e) => log.error('Unhandled rejection', e instanceof Error ? e : new Error(String(e))));
}
