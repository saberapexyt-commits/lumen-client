import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8')) as T;
  } catch (e: any) {
    if (e.code === 'ENOENT') return fallback;
    // Corrupt file: keep it for inspection and fall back instead of crashing.
    try {
      await fs.promises.rename(file, `${file}.corrupt-${Date.now()}`);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

/** Atomic write: write temp then rename, so a crash never leaves half a JSON file. */
export async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.promises.rename(tmp, file);
}

export function exists(p: string): boolean {
  return fs.existsSync(p);
}

export async function hashFile(file: string, algo: 'sha1' | 'sha256' | 'sha512' | 'md5' = 'sha1'): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash(algo);
    fs.createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'profile'
  );
}

/** Reject file names that could escape the target directory. */
export function safeFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/'));
  if (!base || base === '.' || base === '..') throw new Error(`Unsafe file name: ${name}`);
  return base;
}

/** Resolve `rel` under `base`, throwing on path traversal (zip-slip protection). */
export function safeJoin(base: string, rel: string): string {
  const full = path.resolve(base, rel);
  const b = path.resolve(base);
  if (full !== b && !full.startsWith(b + path.sep)) throw new Error(`Path escapes target directory: ${rel}`);
  return full;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const OS: 'windows' | 'linux' | 'osx' =
  process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
export const ARCH = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'x86' : 'x64';

/** Compare Minecraft-style dotted versions numerically ("1.21.1" > "1.21"). */
export function cmpVersion(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}
