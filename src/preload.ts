import { contextBridge, ipcRenderer } from 'electron';

/**
 * The only bridge between the UI and the main process. Channels are allow-listed so a compromised
 * page can never reach arbitrary IPC.
 */
const EVENTS = new Set(['task:update', 'game:state', 'game:log', 'auth:done', 'log:line', 'window:state']);

contextBridge.exposeInMainWorld('lumen', {
  invoke: async (channel: string, ...args: unknown[]) => {
    if (!/^[a-z]+:[A-Za-z]+$/.test(channel)) throw new Error('Bad channel');
    const r = await ipcRenderer.invoke(channel, ...args);
    if (!r.ok) throw new Error(r.error);
    return r.data;
  },
  on: (event: string, cb: (payload: any) => void) => {
    if (!EVENTS.has(event)) throw new Error('Bad event');
    const fn = (_e: unknown, payload: any) => cb(payload);
    ipcRenderer.on(event, fn);
    return () => ipcRenderer.removeListener(event, fn);
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  platform: process.platform,
});
