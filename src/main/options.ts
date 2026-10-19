import * as fs from 'fs';
import * as path from 'path';
import { P, ensureDir } from './paths';
import { LauncherError } from './logger';

/**
 * Minecraft's own options.txt ("key:value" per line). We only touch the keys below and keep
 * every other line exactly as the game wrote it. Takes effect next launch (the game rewrites
 * the file on exit, so don't edit while the profile is running).
 */
export const QUICK_OPTIONS = {
  maxFps: { label: 'Max FPS', type: 'number', min: 10, max: 260, hint: '260 = unlimited' },
  renderDistance: { label: 'Render distance', type: 'number', min: 2, max: 32, hint: 'chunks' },
  simulationDistance: { label: 'Simulation distance', type: 'number', min: 5, max: 32, hint: 'chunks' },
  enableVsync: { label: 'VSync', type: 'bool' },
  guiScale: { label: 'GUI scale', type: 'number', min: 0, max: 6, hint: '0 = auto' },
  particles: { label: 'Particles', type: 'number', min: 0, max: 2, hint: '0 all, 1 decreased, 2 minimal' },
  entityDistanceScaling: { label: 'Entity distance', type: 'float', min: 0.5, max: 5, hint: '1.0 = default' },
} as const;

type Key = keyof typeof QUICK_OPTIONS;

function file(profileId: string) {
  return path.join(P.gameDir(profileId), 'options.txt');
}

export function readOptions(profileId: string): Record<string, string> {
  const f = file(profileId);
  const out: Record<string, string> = {};
  if (!fs.existsSync(f)) return out;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

export function writeOptions(profileId: string, values: Partial<Record<Key, string | number | boolean>>) {
  const f = file(profileId);
  ensureDir(path.dirname(f));
  const lines = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/) : [];
  if (fs.existsSync(f)) fs.copyFileSync(f, f + '.lumen-bak'); // one-step undo, never lose the user's file
  for (const [k, raw] of Object.entries(values)) {
    const spec = QUICK_OPTIONS[k as Key];
    if (!spec) throw new LauncherError(`Unknown option ${k}`);
    let v: string;
    if (spec.type === 'bool') v = String(raw === true || raw === 'true');
    else {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new LauncherError(`${spec.label} must be a number.`);
      v = String(Math.min(spec.max, Math.max(spec.min, spec.type === 'number' ? Math.round(n) : n)));
    }
    const i = lines.findIndex((l) => l.startsWith(k + ':'));
    if (i >= 0) lines[i] = `${k}:${v}`;
    else lines.push(`${k}:${v}`);
  }
  fs.writeFileSync(f, lines.filter((l, i, a) => l !== '' || i < a.length - 1).join('\n') + '\n');
}
