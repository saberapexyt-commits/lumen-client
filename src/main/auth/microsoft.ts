import { P } from '../paths';
import { LauncherError, logger } from '../logger';
import { postJson, getJson, USER_AGENT } from '../net';
import { decryptSecret, encryptSecret, getSettings } from '../settings';
import { readJson, sleep, writeJson } from '../util';

const log = logger('auth');

/**
 * Microsoft sign-in using the OAuth2 *device code* flow: the user signs in on
 * microsoft.com in their own browser. This app never sees or stores a password.
 *
 * Requires an Entra (Azure) app registration whose client ID is approved for the
 * Minecraft Services API. See docs/SETUP.md.
 */
const TENANT = 'consumers';
const SCOPE = 'XboxLive.signin offline_access';

export interface Account {
  id: string; // Minecraft UUID (no dashes)
  name: string;
  refreshTokenEnc: string;
  /** cached short-lived Minecraft token */
  mcToken?: string;
  mcTokenExpires?: number;
  xuid?: string;
  ownsGame: boolean;
}

interface AccountsFile {
  active: string;
  accounts: Account[];
}

export interface DeviceCode {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  message: string;
}

async function clientId(): Promise<string> {
  const id = (await getSettings()).msClientId.trim() || process.env.LUMEN_MS_CLIENT_ID || '';
  if (!id)
    throw new LauncherError(
      'No Microsoft application client ID is configured. Open Settings → Accounts and enter the client ID of your registered Microsoft app (see docs/SETUP.md).',
    );
  return id;
}

async function form(url: string, body: Record<string, string>): Promise<{ status: number; data: any }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT, Accept: 'application/json' },
    body: new URLSearchParams(body).toString(),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

/** Step 1: start device code flow. The caller shows `userCode` and opens `verificationUri`. */
export async function beginLogin(): Promise<{ device: DeviceCode; deviceCode: string; interval: number }> {
  const cid = await clientId();
  const r = await form(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/devicecode`, { client_id: cid, scope: SCOPE });
  if (r.status !== 200) {
    throw new LauncherError(`Microsoft sign-in could not start: ${r.data.error_description ?? r.data.error ?? r.status}`);
  }
  return {
    device: { userCode: r.data.user_code, verificationUri: r.data.verification_uri, expiresIn: r.data.expires_in, message: r.data.message },
    deviceCode: r.data.device_code,
    interval: r.data.interval ?? 5,
  };
}

/** Step 2: poll until the user finishes signing in (or it expires / is cancelled). */
export async function finishLogin(deviceCode: string, interval: number, expiresIn: number, signal?: AbortSignal): Promise<Account> {
  const cid = await clientId();
  const deadline = Date.now() + expiresIn * 1000;
  let wait = interval;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new LauncherError('Sign-in cancelled.');
    await sleep(wait * 1000);
    const r = await form(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: cid,
      device_code: deviceCode,
    });
    if (r.status === 200) return completeFromMicrosoftToken(r.data.access_token, r.data.refresh_token);
    const err = r.data.error;
    if (err === 'authorization_pending') continue;
    if (err === 'slow_down') {
      wait += 5;
      continue;
    }
    if (err === 'expired_token') break;
    throw new LauncherError(`Sign-in failed: ${r.data.error_description ?? err}`);
  }
  throw new LauncherError('The sign-in code expired. Please try again.');
}

const XSTS_ERRORS: Record<number, string> = {
  2148916233: 'This Microsoft account has no Xbox profile. Sign in at xbox.com once to create one, then try again.',
  2148916235: 'Xbox Live is not available in your country/region.',
  2148916236: 'This account needs adult verification on the Xbox page.',
  2148916237: 'This account needs adult verification on the Xbox page.',
  2148916238: 'This is a child account. An adult must add it to a Microsoft Family before it can play.',
};

interface McAuth {
  mcToken: string;
  expires: number;
  xuid?: string;
}

/** Microsoft token -> Xbox Live -> XSTS -> Minecraft services token. */
async function minecraftToken(msAccessToken: string): Promise<McAuth> {
  const xbl = await postJson('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT',
  });
  if (xbl.status !== 200) throw new LauncherError(`Xbox Live sign-in failed (HTTP ${xbl.status}).`);
  const xblToken: string = xbl.data.Token;

  const xsts = await postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT',
  });
  if (xsts.status !== 200) {
    const msg = XSTS_ERRORS[xsts.data?.XErr as number];
    throw new LauncherError(msg ?? `Xbox security token request failed (HTTP ${xsts.status}).`);
  }
  const uhs: string = xsts.data.DisplayClaims.xui[0].uhs;
  const xuid: string | undefined = xsts.data.DisplayClaims.xui[0].xid;

  const mc = await postJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
    identityToken: `XBL3.0 x=${uhs};${xsts.data.Token}`,
  });
  if (mc.status !== 200) throw new LauncherError(`Minecraft sign-in failed (HTTP ${mc.status}). Your Microsoft app may not be approved for the Minecraft API yet.`);
  return { mcToken: mc.data.access_token, expires: Date.now() + (mc.data.expires_in - 60) * 1000, xuid };
}

async function fetchProfile(mcToken: string): Promise<{ id: string; name: string } | null> {
  try {
    return await getJson('https://api.minecraftservices.com/minecraft/profile', { headers: { Authorization: `Bearer ${mcToken}` }, retries: 0 });
  } catch (e: any) {
    if ((e?.detail as any)?.status === 404) return null;
    throw e;
  }
}

async function completeFromMicrosoftToken(msAccess: string, refresh: string): Promise<Account> {
  const auth = await minecraftToken(msAccess);
  const profile = await fetchProfile(auth.mcToken);
  if (!profile) throw new LauncherError('This Microsoft account does not own Minecraft: Java Edition. Purchase it at minecraft.net to play.');
  const account: Account = {
    id: profile.id,
    name: profile.name,
    refreshTokenEnc: encryptSecret(refresh),
    mcToken: auth.mcToken,
    mcTokenExpires: auth.expires,
    xuid: auth.xuid,
    ownsGame: true,
  };
  await saveAccount(account, true);
  log.info(`Signed in as ${account.name}`);
  return account;
}

/* ---------- persistence ---------- */
async function load(): Promise<AccountsFile> {
  return readJson<AccountsFile>(P.accounts(), { active: '', accounts: [] });
}
async function saveAccount(a: Account, makeActive: boolean) {
  const f = await load();
  const i = f.accounts.findIndex((x) => x.id === a.id);
  if (i >= 0) f.accounts[i] = a;
  else f.accounts.push(a);
  if (makeActive || !f.active) f.active = a.id;
  await writeJson(P.accounts(), f);
}

export async function listAccounts() {
  const f = await load();
  return { active: f.active, accounts: f.accounts.map((a) => ({ id: a.id, name: a.name })) };
}

export async function setActiveAccount(id: string) {
  const f = await load();
  if (f.accounts.some((a) => a.id === id)) {
    f.active = id;
    await writeJson(P.accounts(), f);
  }
}

export async function removeAccount(id: string) {
  const f = await load();
  f.accounts = f.accounts.filter((a) => a.id !== id);
  if (f.active === id) f.active = f.accounts[0]?.id ?? '';
  await writeJson(P.accounts(), f);
}

/** Return a valid Minecraft session for launching, refreshing tokens as needed. */
export async function getSession(accountId?: string): Promise<{ name: string; uuid: string; accessToken: string; xuid?: string; clientId: string }> {
  const f = await load();
  const acc = f.accounts.find((a) => a.id === (accountId || f.active));
  if (!acc) throw new LauncherError('Please sign in with your Microsoft account first.');
  const cid = await clientId();
  if (acc.mcToken && acc.mcTokenExpires && acc.mcTokenExpires > Date.now()) {
    return { name: acc.name, uuid: acc.id, accessToken: acc.mcToken, xuid: acc.xuid, clientId: cid };
  }
  const refresh = decryptSecret(acc.refreshTokenEnc);
  if (!refresh) throw new LauncherError('Your saved sign-in could not be read. Please sign in again.');
  const r = await form(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    grant_type: 'refresh_token',
    client_id: cid,
    refresh_token: refresh,
    scope: SCOPE,
  });
  if (r.status !== 200) throw new LauncherError('Your Microsoft session expired. Please sign in again.');
  const auth = await minecraftToken(r.data.access_token);
  acc.mcToken = auth.mcToken;
  acc.mcTokenExpires = auth.expires;
  acc.xuid = auth.xuid;
  if (r.data.refresh_token) acc.refreshTokenEnc = encryptSecret(r.data.refresh_token);
  await saveAccount(acc, false);
  return { name: acc.name, uuid: acc.id, accessToken: acc.mcToken!, xuid: acc.xuid, clientId: cid };
}
