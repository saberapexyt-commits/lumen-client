import * as path from 'path';
import * as fs from 'fs';

/**
 * All on-disk locations. The root is overridable (LUMEN_HOME) so tests and
 * portable installs never touch the real user data.
 *
 *   <root>/
 *     shared/{versions,libraries,assets,runtime}   downloaded once, used by all profiles
 *     profiles/<id>/{profile.json, mods.json, minecraft/, backups/, trash/}
 *     settings.json, accounts.json, logs/
 */
let root: string | null = null;

export function setRoot(dir: string) {
  root = dir;
}

export function getRoot(): string {
  if (!root) {
    const env = process.env.LUMEN_HOME;
    if (env) root = env;
    else {
      const base =
        process.platform === 'win32'
          ? process.env.APPDATA || path.join(process.env.USERPROFILE || '.', 'AppData', 'Roaming')
          : process.platform === 'darwin'
            ? path.join(process.env.HOME || '.', 'Library', 'Application Support')
            : process.env.XDG_DATA_HOME || path.join(process.env.HOME || '.', '.local', 'share');
      root = path.join(base, 'LumenClient');
    }
  }
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export const P = {
  shared: () => path.join(getRoot(), 'shared'),
  versions: () => path.join(getRoot(), 'shared', 'versions'),
  libraries: () => path.join(getRoot(), 'shared', 'libraries'),
  assets: () => path.join(getRoot(), 'shared', 'assets'),
  runtime: () => path.join(getRoot(), 'shared', 'runtime'),
  installers: () => path.join(getRoot(), 'shared', 'installers'),
  profiles: () => path.join(getRoot(), 'profiles'),
  profile: (id: string) => path.join(getRoot(), 'profiles', id),
  gameDir: (id: string) => path.join(getRoot(), 'profiles', id, 'minecraft'),
  modsDir: (id: string) => path.join(getRoot(), 'profiles', id, 'minecraft', 'mods'),
  profileMeta: (id: string) => path.join(getRoot(), 'profiles', id, 'profile.json'),
  modsIndex: (id: string) => path.join(getRoot(), 'profiles', id, 'mods.json'),
  backups: (id: string) => path.join(getRoot(), 'profiles', id, 'backups'),
  trash: (id: string) => path.join(getRoot(), 'profiles', id, 'trash'),
  deletedProfiles: () => path.join(getRoot(), 'deleted-profiles'),
  settings: () => path.join(getRoot(), 'settings.json'),
  accounts: () => path.join(getRoot(), 'accounts.json'),
  logs: () => path.join(getRoot(), 'logs'),
  tmp: () => path.join(getRoot(), 'tmp'),
};

export function ensureDir(p: string): string {
  fs.mkdirSync(p, { recursive: true });
  return p;
}
