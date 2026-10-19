import * as fs from 'fs';
import * as path from 'path';
import { ensureDir, getRoot } from './paths';
import { LauncherError, logger } from './logger';
import { USER_AGENT, getJson, randomId } from './net';
import { readJson, writeJson } from './util';
import * as auth from './auth/microsoft';

const log = logger('skins');
const SERVICES = 'https://api.minecraftservices.com';

export type SkinModel = 'classic' | 'slim';
interface SkinEntry {
  id: string;
  name: string;
  model: SkinModel;
  file: string;
  created: number;
  source?: string;
}
export interface SkinView {
  id: string;
  name: string;
  model: SkinModel;
  created: number;
  source?: string;
  dataUrl: string;
}

const dir = () => ensureDir(path.join(getRoot(), 'skins'));
const indexFile = () => path.join(dir(), 'library.json');

/** Reads width/height from a PNG header and rejects anything that is not a valid Minecraft skin size. */
export function checkSkinPng(buf: Buffer): { w: number; h: number } {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(sig) || buf.toString('ascii', 12, 16) !== 'IHDR') throw new LauncherError('That file is not a PNG image.');
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (buf.length > 1024 * 1024) throw new LauncherError('That image is too large to be a skin.');
  if (!(w === 64 && (h === 64 || h === 32))) throw new LauncherError(`Skins must be 64×64 (or old-style 64×32) pixels. This one is ${w}×${h}.`);
  return { w, h };
}

async function load(): Promise<SkinEntry[]> {
  return readJson<SkinEntry[]>(indexFile(), []);
}
const save = (l: SkinEntry[]) => writeJson(indexFile(), l);

const toView = (e: SkinEntry): SkinView | null => {
  try {
    const buf = fs.readFileSync(path.join(dir(), e.file));
    return { id: e.id, name: e.name, model: e.model, created: e.created, source: e.source, dataUrl: 'data:image/png;base64,' + buf.toString('base64') };
  } catch {
    return null;
  }
};

export async function listSkins(): Promise<SkinView[]> {
  return (await load()).map(toView).filter((x): x is SkinView => !!x);
}

export async function addSkinBuffer(buf: Buffer, name: string, model: SkinModel, source?: string): Promise<SkinView> {
  checkSkinPng(buf);
  const id = randomId();
  const file = `${id}.png`;
  fs.writeFileSync(path.join(dir(), file), buf);
  const list = await load();
  const entry: SkinEntry = { id, name: name.slice(0, 40) || 'Skin', model, file, created: Date.now(), source };
  list.unshift(entry);
  await save(list);
  return toView(entry)!;
}

export async function addSkinFile(file: string, model: SkinModel): Promise<SkinView> {
  const buf = fs.readFileSync(file);
  return addSkinBuffer(buf, path.basename(file, path.extname(file)), model, 'file');
}

/** Only ever downloads from Mojang's own texture host. */
async function downloadTexture(url: string): Promise<Buffer> {
  const u = new URL(url.replace(/^http:/, 'https:'));
  if (u.hostname !== 'textures.minecraft.net') throw new LauncherError('Unexpected texture host.');
  const res = await fetch(u, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new LauncherError(`Could not download the skin (HTTP ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

/** Add a player's current skin by username (public Mojang data). */
export async function addSkinByName(username: string): Promise<SkinView> {
  const name = username.trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) throw new LauncherError('Enter a valid Minecraft username (3–16 letters, numbers or underscores).');
  let prof: any;
  try {
    prof = await getJson(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`, { retries: 1 });
  } catch (e: any) {
    if ((e?.detail as any)?.status === 404) throw new LauncherError(`No Minecraft player named "${name}" was found.`);
    throw e;
  }
  if (!prof?.id) throw new LauncherError(`No Minecraft player named "${name}" was found.`);
  const full = await getJson(`https://sessionserver.mojang.com/session/minecraft/profile/${prof.id}`, { retries: 1 });
  const prop = (full.properties || []).find((p: any) => p.name === 'textures');
  if (!prop) throw new LauncherError('That player has no skin.');
  const tex = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8'))?.textures?.SKIN;
  if (!tex?.url) throw new LauncherError('That player uses a default skin.');
  const model: SkinModel = tex.metadata?.model === 'slim' ? 'slim' : 'classic';
  return addSkinBuffer(await downloadTexture(tex.url), prof.name || name, model, 'player:' + (prof.name || name));
}

export async function removeSkin(id: string): Promise<void> {
  const list = await load();
  const e = list.find((x) => x.id === id);
  if (!e) return;
  try {
    fs.unlinkSync(path.join(dir(), e.file));
  } catch {
    /* already gone */
  }
  await save(list.filter((x) => x.id !== id));
}

export async function updateSkin(id: string, patch: { name?: string; model?: SkinModel }): Promise<void> {
  const list = await load();
  const e = list.find((x) => x.id === id);
  if (!e) return;
  if (patch.name !== undefined) e.name = patch.name.trim().slice(0, 40) || e.name;
  if (patch.model === 'classic' || patch.model === 'slim') e.model = patch.model;
  await save(list);
}

// ---------------------------------------------------------------- account (needs a signed-in Microsoft account)

async function token(): Promise<string> {
  return (await auth.getSession()).accessToken;
}

export interface Cape {
  id: string;
  alias: string;
  url: string;
  active: boolean;
}
export interface AccountSkins {
  name: string;
  skin: { dataUrl: string; model: SkinModel } | null;
  capes: Cape[];
}

export async function accountSkins(): Promise<AccountSkins> {
  const tk = await token();
  const prof = await getJson(`${SERVICES}/minecraft/profile`, { headers: { Authorization: `Bearer ${tk}` }, retries: 0 });
  const active = (prof.skins || []).find((s: any) => s.state === 'ACTIVE');
  let skin: AccountSkins['skin'] = null;
  if (active?.url) {
    try {
      skin = { dataUrl: 'data:image/png;base64,' + (await downloadTexture(active.url)).toString('base64'), model: active.variant === 'SLIM' ? 'slim' : 'classic' };
    } catch (e) {
      log.warn(`could not fetch current skin: ${e}`);
    }
  }
  const capes: Cape[] = (prof.capes || []).map((c: any) => ({ id: c.id, alias: c.alias, url: String(c.url).replace(/^http:/, 'https:'), active: c.state === 'ACTIVE' }));
  return { name: prof.name, skin, capes };
}

/** Upload a library skin to the signed-in account. */
export async function applySkin(id: string): Promise<void> {
  const e = (await load()).find((x) => x.id === id);
  if (!e) throw new LauncherError('That skin is no longer in your library.');
  const buf = fs.readFileSync(path.join(dir(), e.file));
  checkSkinPng(buf);
  const form = new FormData();
  form.append('variant', e.model === 'slim' ? 'slim' : 'classic');
  form.append('file', new Blob([new Uint8Array(buf)], { type: 'image/png' }), 'skin.png');
  const res = await fetch(`${SERVICES}/minecraft/profile/skins`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'User-Agent': USER_AGENT }, body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log.warn(`skin upload failed: HTTP ${res.status} ${body.slice(0, 200)}`);
    throw new LauncherError(res.status === 401 ? 'Your sign-in expired. Please sign in again in Settings.' : `Minecraft rejected the skin (HTTP ${res.status}).`);
  }
}

export async function setCape(capeId: string | null): Promise<void> {
  const tk = await token();
  const res = capeId
    ? await fetch(`${SERVICES}/minecraft/profile/capes/active`, { method: 'PUT', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT }, body: JSON.stringify({ capeId }) })
    : await fetch(`${SERVICES}/minecraft/profile/capes/active`, { method: 'DELETE', headers: { Authorization: `Bearer ${tk}`, 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new LauncherError(`Could not change the cape (HTTP ${res.status}).`);
}
