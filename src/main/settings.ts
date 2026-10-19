import * as os from 'os';
import { P } from './paths';
import { readJson, writeJson } from './util';

export interface Settings {
  theme: 'dark' | 'light';
  accent: string;
  language: string;
  defaultRamMb: number;
  closeOnLaunch: boolean;
  showSnapshots: boolean;
  showOldVersions: boolean;
  javaPathOverride: string;
  /** Microsoft Entra (Azure) application client ID registered for this launcher. */
  msClientId: string;
  /** CurseForge API key; stored encrypted via the OS keychain when available. */
  curseforgeKeyEnc: string;
  preferredSource: 'both' | 'modrinth' | 'curseforge';
  allowBetaMods: boolean;
  maxConcurrentDownloads: number;
  lastProfileId: string;
}

const DEFAULTS: Settings = {
  theme: 'dark',
  accent: '#7c5cff',
  language: 'en',
  defaultRamMb: Math.min(4096, Math.max(2048, Math.floor((os.totalmem() / 1024 / 1024) / 4 / 512) * 512)),
  closeOnLaunch: false,
  showSnapshots: false,
  showOldVersions: false,
  javaPathOverride: '',
  msClientId: '',
  curseforgeKeyEnc: '',
  preferredSource: 'both',
  allowBetaMods: false,
  maxConcurrentDownloads: 8,
  lastProfileId: '',
};

let cache: Settings | null = null;

export async function getSettings(): Promise<Settings> {
  if (!cache) cache = { ...DEFAULTS, ...(await readJson<Partial<Settings>>(P.settings(), {})) };
  return cache;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const s = { ...(await getSettings()), ...patch };
  cache = s;
  await writeJson(P.settings(), s);
  return s;
}

export function resetSettingsCache() {
  cache = null;
}

/** Secret storage: Electron's safeStorage when running in the app, plain-marked fallback in tests. */
type SafeStorage = { isEncryptionAvailable(): boolean; encryptString(s: string): Buffer; decryptString(b: Buffer): string };
let safe: SafeStorage | null = null;
export function setSafeStorage(s: SafeStorage) {
  safe = s;
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  if (safe?.isEncryptionAvailable()) return 'enc:' + safe.encryptString(plain).toString('base64');
  return 'raw:' + Buffer.from(plain).toString('base64'); // only reachable outside Electron (tests / headless)
}

export function decryptSecret(stored: string): string {
  if (!stored) return '';
  if (stored.startsWith('enc:')) {
    if (!safe) return '';
    try {
      return safe.decryptString(Buffer.from(stored.slice(4), 'base64'));
    } catch {
      return '';
    }
  }
  if (stored.startsWith('raw:')) return Buffer.from(stored.slice(4), 'base64').toString();
  return '';
}

export async function getCurseForgeKey(): Promise<string> {
  const env = process.env.CURSEFORGE_API_KEY;
  if (env) return env;
  return decryptSecret((await getSettings()).curseforgeKeyEnc);
}
