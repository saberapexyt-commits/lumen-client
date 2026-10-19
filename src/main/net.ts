import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { CancelledError, LauncherError, logger } from './logger';
import { hashFile, sleep } from './util';

const log = logger('net');
export const USER_AGENT = 'LumenClient/0.1.0 (https://github.com/lumen-client/lumen-client)';

export interface Progress {
  label: string;
  done: number;
  total: number;
}

/** Tracks a long-running operation; supports cancellation and progress reporting. */
export class Task {
  readonly controller = new AbortController();
  label = '';
  done = 0;
  total = 0;
  status: 'running' | 'done' | 'error' | 'cancelled' = 'running';
  error?: string;
  private lastEmit = 0;
  constructor(
    public readonly id: string,
    public readonly title: string,
    private readonly emit: (t: Task) => void,
  ) {}
  get signal() {
    return this.controller.signal;
  }
  cancel() {
    this.controller.abort();
  }
  throwIfCancelled() {
    if (this.signal.aborted) throw new CancelledError();
  }
  /** Replace the stage and progress, e.g. "Downloading libraries" 0/120. */
  stage(label: string, total = 0) {
    this.label = label;
    this.done = 0;
    this.total = total;
    this.push(true);
  }
  advance(n = 1) {
    this.done += n;
    this.push(false);
  }
  setDone(n: number) {
    this.done = n;
    this.push(false);
  }
  push(force: boolean) {
    const now = Date.now();
    if (force || now - this.lastEmit > 100) {
      this.lastEmit = now;
      this.emit(this);
    }
  }
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      label: this.label,
      done: this.done,
      total: this.total,
      status: this.status,
      error: this.error,
    };
  }
}

export interface DownloadSpec {
  url: string;
  dest: string;
  sha1?: string;
  sha256?: string;
  sha512?: string;
  size?: number;
}

async function verify(file: string, spec: DownloadSpec): Promise<boolean> {
  try {
    if (spec.sha1) return (await hashFile(file, 'sha1')) === spec.sha1.toLowerCase();
    if (spec.sha512) return (await hashFile(file, 'sha512')) === spec.sha512.toLowerCase();
    if (spec.sha256) return (await hashFile(file, 'sha256')) === spec.sha256.toLowerCase();
    if (spec.size !== undefined) return (await fs.promises.stat(file)).size === spec.size;
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

/**
 * Download one file: skips if a valid copy exists, streams to `<dest>.part`,
 * verifies the checksum, then atomically renames. Retries with backoff.
 * A failed/cancelled download never touches an existing good file.
 */
export async function downloadFile(
  spec: DownloadSpec,
  opts: { signal?: AbortSignal; retries?: number; onBytes?: (n: number) => void; force?: boolean } = {},
): Promise<'skipped' | 'downloaded'> {
  const hasChecksum = !!(spec.sha1 || spec.sha256 || spec.sha512);
  if (!opts.force && fs.existsSync(spec.dest) && hasChecksum && (await verify(spec.dest, spec))) return 'skipped';
  await fs.promises.mkdir(path.dirname(spec.dest), { recursive: true });
  const part = `${spec.dest}.part`;
  const retries = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) throw new CancelledError();
    let counted = 0;
    try {
      const res = await fetch(spec.url, { signal: opts.signal, headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok || !res.body) throw new LauncherError(`Download failed (HTTP ${res.status}) for ${spec.url}`);
      const out = fs.createWriteStream(part);
      const body = Readable.fromWeb(res.body as any);
      body.on('data', (c: Buffer) => {
        counted += c.length;
        opts.onBytes?.(c.length);
      });
      await pipeline(body, out);
      if (hasChecksum || spec.size !== undefined) {
        if (!(await verify(part, spec))) throw new LauncherError(`Checksum mismatch for ${path.basename(spec.dest)} - the download was corrupted.`);
      }
      await fs.promises.rename(part, spec.dest);
      return 'downloaded';
    } catch (e: any) {
      lastErr = e;
      opts.onBytes?.(-counted); // roll back byte progress for retried attempt
      await fs.promises.rm(part, { force: true }).catch(() => {});
      if (e?.name === 'AbortError' || opts.signal?.aborted) throw new CancelledError();
      log.warn(`download attempt ${attempt + 1} failed for ${spec.url}: ${e?.message}`);
      if (attempt < retries) await sleep(500 * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Download many files with bounded concurrency; aggregate progress through the task. */
export async function downloadAll(specs: DownloadSpec[], task: Task, concurrency = 12): Promise<void> {
  let i = 0;
  let firstError: unknown;
  const worker = async () => {
    while (!firstError) {
      task.throwIfCancelled();
      const idx = i++;
      if (idx >= specs.length) return;
      try {
        await downloadFile(specs[idx], { signal: task.signal });
        task.advance();
      } catch (e) {
        firstError = firstError ?? e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, specs.length) }, worker));
  if (firstError) throw firstError;
}

/** JSON GET with a simple retry and an in-memory TTL cache for read-only metadata. */
const cache = new Map<string, { at: number; data: unknown }>();
export async function getJson<T = any>(
  url: string,
  opts: { headers?: Record<string, string>; ttl?: number; signal?: AbortSignal; retries?: number } = {},
): Promise<T> {
  const key = url + JSON.stringify(opts.headers ?? {});
  const hit = cache.get(key);
  if (hit && opts.ttl && Date.now() - hit.at < opts.ttl) return hit.data as T;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= (opts.retries ?? 2); attempt++) {
    try {
      const res = await fetch(url, { signal: opts.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...opts.headers } });
      if (res.status === 429) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new LauncherError(`Request failed (HTTP ${res.status}) for ${new URL(url).host}${new URL(url).pathname}${body ? ': ' + body.slice(0, 200) : ''}`, { status: res.status });
      }
      const data = (await res.json()) as T;
      if (opts.ttl) cache.set(key, { at: Date.now(), data });
      return data;
    } catch (e: any) {
      lastErr = e;
      if (e?.name === 'AbortError') throw new CancelledError();
      if (e instanceof LauncherError && (e.detail as any)?.status < 500) throw e; // 4xx won't improve with retries
      await sleep(400 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function postJson<T = any>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, data };
}

export function randomId(): string {
  return crypto.randomBytes(6).toString('hex');
}
