# Setup

## Build and run

Requirements: Node.js 20+ and npm. (Java is **not** required - Lumen downloads the exact Mojang
Java runtime each Minecraft version needs.)

```bash
npm install
npm start          # build + launch the app
npm test           # unit tests (offline)
npm run smoke      # live end-to-end: installs + launches a real game (see below)
npm run pack       # unpacked app in release/  (npm run dist for an installer)
```

Data (profiles, downloaded game files, logs) lives in `%APPDATA%\LumenClient` on Windows,
`~/Library/Application Support/LumenClient` on macOS, `~/.local/share/LumenClient` on Linux.
Set `LUMEN_HOME` to use a different folder (handy for testing).

## Microsoft sign-in (required to play)

Microsoft does not let launchers borrow someone else's app registration, so you register your own
once (free):

1. Go to <https://entra.microsoft.com> → **App registrations** → **New registration**.
2. Name it, choose **Personal Microsoft accounts only** (consumers) as the account type.
3. Under **Authentication** → **Advanced settings**, set **Allow public client flows** to **Yes**.
4. Copy the **Application (client) ID**.
5. Minecraft's API only accepts apps that Mojang has approved: submit the form at
   <https://aka.ms/AppRegistrationForm> with that client ID. Until it is approved, sign-in succeeds
   at Microsoft but the final Minecraft step returns an error - Lumen tells you when that happens.
6. Paste the client ID in **Settings → Accounts** (or set `LUMEN_MS_CLIENT_ID`).

Lumen uses the OAuth *device code* flow: you sign in on microsoft.com in your own browser, so Lumen
never sees your password. Only the refresh token is stored, encrypted with the OS keychain
(Electron `safeStorage`). If you distribute Lumen, ship it with *your* approved client ID baked in as
the default (see `src/main/auth/microsoft.ts`) - a client ID is public, there is no secret.

## CurseForge API key

CurseForge only serves API requests with a key. Get a free one at <https://console.curseforge.com>
and paste it in **Settings → Mod sources**. It is stored encrypted and sent only to
`api.curseforge.com`. The key is deliberately **not** part of this repository. A distributor may set
the `CURSEFORGE_API_KEY` environment variable for their build, but must follow CurseForge's terms
(do not embed a key in a public binary).

Modrinth needs no key. Lumen identifies itself with a descriptive `User-Agent` as their API requires.

## Live smoke tests

These hit the real services and download real game files (hundreds of MB on first run into
`.test-home/`):

```bash
node dist/tests/smoke/mods-smoke.js 1.21.1 fabric   # search, dependency plan, install, disable, remove, health check
node dist/tests/smoke/launch-smoke.js 1.21.1 fabric # install + start the actual game and wait for LWJGL init
node dist/tests/smoke/launch-smoke.js 1.21.1 neoforge
```

The launch smoke test uses a dummy offline session purely to confirm the game process boots; the
launcher UI itself only ever launches with a verified Microsoft session.
