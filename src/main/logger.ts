import * as fs from 'fs';
import * as path from 'path';
import { P, ensureDir } from './paths';

type Level = 'debug' | 'info' | 'warn' | 'error';
const listeners = new Set<(line: string) => void>();
const ring: string[] = [];

function file() {
  const d = new Date().toISOString().slice(0, 10);
  return path.join(ensureDir(P.logs()), `launcher-${d}.log`);
}

function write(level: Level, scope: string, msg: string, extra?: unknown) {
  let line = `${new Date().toISOString()} [${level.toUpperCase()}] [${scope}] ${msg}`;
  if (extra instanceof Error) line += `\n${extra.stack || extra.message}`;
  else if (extra !== undefined) {
    try {
      line += ` ${JSON.stringify(extra)}`;
    } catch {
      line += ` ${String(extra)}`;
    }
  }
  ring.push(line);
  if (ring.length > 500) ring.shift();
  try {
    fs.appendFileSync(file(), line + '\n');
  } catch {
    /* logging must never throw */
  }
  if (process.env.LUMEN_DEBUG) console.log(line);
  listeners.forEach((l) => l(line));
}

export function logger(scope: string) {
  return {
    debug: (m: string, e?: unknown) => write('debug', scope, m, e),
    info: (m: string, e?: unknown) => write('info', scope, m, e),
    warn: (m: string, e?: unknown) => write('warn', scope, m, e),
    error: (m: string, e?: unknown) => write('error', scope, m, e),
  };
}

export const recentLogs = () => ring.slice();
export const onLog = (fn: (l: string) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Errors whose message is already written for end users. */
export class LauncherError extends Error {
  constructor(
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = 'LauncherError';
  }
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

/** Convert any thrown value into a message that is safe and useful to show a user. */
export function friendlyError(e: unknown): string {
  if (e instanceof LauncherError) return e.message;
  if (e instanceof CancelledError) return 'Cancelled';
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as any)?.code ?? (e as any)?.cause?.code;
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ECONNRESET' || /fetch failed/i.test(msg))
    return 'Network error: could not reach the server. Check your internet connection and try again.';
  if (code === 'ENOSPC') return 'Your disk is full.';
  if (code === 'EACCES' || code === 'EPERM')
    return `Permission denied while accessing a file (${(e as any).path ?? ''}). Close programs using it and retry.`;
  return msg;
}
