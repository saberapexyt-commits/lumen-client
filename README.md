# Lumen Client

A Minecraft: Java Edition launcher with a built-in **CurseForge + Modrinth mod manager**.
Pick a Minecraft version and loader, search for mods, and Lumen downloads the *compatible* file and
its required dependencies for you.

Built with Electron + TypeScript. Setup (including the Microsoft and CurseForge credentials you need
to supply yourself): [docs/SETUP.md](docs/SETUP.md). Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```bash
npm install
npm start
```

## What works today

| Area | Status |
|---|---|
| Profiles - separate version, loader, mods, configs, worlds, RAM, JVM args; duplicate; delete (moved aside, not erased) | ✅ |
| Install + launch vanilla Minecraft (libraries, assets, natives, Mojang Java runtime, log4j config) | ✅ tested live |
| Fabric, Quilt (meta API), Forge, NeoForge (official installer, run headlessly) | ✅ each installed from scratch and the real game booted to LWJGL init: Fabric 1.21.1 + 26.3, Quilt 1.21.1, NeoForge 1.21.1, Forge 1.20.1 |
| Loader/version support check before anything is created | ✅ |
| Microsoft sign-in (device-code OAuth → Xbox → XSTS → Minecraft), encrypted token storage, auto-refresh | ✅ implemented; **needs your own approved client ID** - not testable without one |
| Modrinth search/browse/versions/dependencies | ✅ tested live |
| CurseForge search/browse/versions/dependencies | ✅ implemented, field mapping unit-tested; **needs your API key** - not tested live |
| Exact-version + loader matching, release>beta>alpha ranking, Quilt accepts Fabric builds | ✅ unit-tested |
| Dependency plan shown before install (required auto-added, optional opt-in, incompatible + manual-download warnings) | ✅ |
| Enable/disable, update, remove (to trash), import jars/folders, Modrinth hash recognition | ✅ |
| Health check: missing dependencies, duplicate ids, wrong-loader jars (from jar metadata + provider data) | ✅ |
| Import `.mrpack`, CurseForge pack `.zip`; export `.mrpack` and full backups | ✅ `.mrpack` and backup round-trips tested live; CurseForge pack import untested (needs key) |
| Checksum verification, cancel, retry with backoff, atomic file writes, staged installs | ✅ |
| Performance pack (curated optimisation mods, resolved per profile), JVM presets, options.txt quick settings, themes | ✅ |
| HUD editor, in-game overlays, keybind UI, quick-join | 🟡 **Planned** - need an in-game companion mod; shown as planned in the app, not faked |

## Testing

```bash
npm test                                   # 24 offline unit tests (resolver, version rules, launch args, downloads, CurseForge mapping)
node dist/tests/smoke/mods-smoke.js        # live Modrinth: plan, install, deps, disable, remove, health check
node dist/tests/smoke/launch-smoke.js 1.21.1 fabric   # live: install + boot the real game
node dist/tests/smoke/packs-smoke.js       # live: .mrpack + backup round-trip, zip-slip rejection
```

Not covered by automated tests: the Microsoft sign-in flow (needs a registered client ID and a
Minecraft account), CurseForge network calls (needs an API key), and the UI beyond screenshot
checks (`LUMEN_SHOT_DIR=<dir> npx electron .` renders every page to PNG).

## Legal

Lumen is not affiliated with Mojang, Microsoft, CurseForge or Modrinth. It downloads game files from
Mojang's servers on the user's machine and never redistributes them. Mod files are fetched from the
providers' official APIs; `.mrpack` exports contain links, not copies of third-party jars, and mods
whose authors disable third-party downloads on CurseForge are never fetched automatically.
