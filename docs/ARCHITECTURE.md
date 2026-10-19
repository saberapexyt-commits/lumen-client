# Architecture

## Why Electron + TypeScript

- A launcher is mostly I/O (HTTP, files, child processes) plus a rich UI. Electron gives a real
  desktop shell (frameless window, native dialogs, OS keychain via `safeStorage`) and Node's fast
  streaming I/O in one language.
- Java is *not* a dependency of the launcher: the launcher downloads the same Mojang Java runtimes
  the official launcher uses, per Minecraft version (`minecraft/java.ts`). That is also how Forge /
  NeoForge installers are run.
- The renderer is dependency-free ES modules (`src/renderer`), so there is no bundler to maintain and
  the attack surface of the UI is small (strict CSP, `contextIsolation`, sandbox, allow-listed IPC).

## Layout

```
src/main/
  index.ts            window, IPC table, task runner (progress + cancel)
  paths.ts            every on-disk location (LUMEN_HOME overridable)
  net.ts              downloadFile (.part → verify → rename, retries), Task, getJson cache
  logger.ts           file log + error classes / friendly messages
  settings.ts         settings + secret encryption
  auth/microsoft.ts   device-code → XBL → XSTS → Minecraft token, refresh, account store
  minecraft/          versions (manifest, rules, inheritsFrom merge) · install · java · launch
  loaders/index.ts    Fabric/Quilt (meta API) · Forge/NeoForge (official installer)
  profiles.ts         profile model + CRUD
  game.ts             prepare (install everything) and play (launch, track process)
  mods/
    types.ts          provider-neutral ModProject / ModFile / ModProvider
    modrinth.ts       Modrinth API v2          ┐ independent modules; each implements
    curseforge.ts     CurseForge Core API v1   ┘ ModProvider and can change on its own
    resolver.ts       compatibility + dependency planning (pure, unit-tested)
    manager.ts        per-profile mod index, install/remove/toggle/update, health check
    jarmeta.ts        read fabric/quilt/forge metadata from jars
  modpack.ts          .mrpack / CurseForge import, .mrpack + backup export
src/preload.ts        the only renderer↔main bridge (allow-listed channels)
src/renderer/         UI (pages/ = home, profiles, browse, installed, client, console, settings)
```

## Key decisions

**Shared game files, per-profile game directories.** `shared/{versions,libraries,assets,runtime}`
are downloaded once. Each profile has `profiles/<id>/minecraft/` (mods, config, saves…), so changing
one profile can never touch another. A profile's `mods.json` records provider, project and file ids,
checksums, dependency edges and enabled state; it is reconciled with the real `mods/` folder on every
listing (hand-added jars are adopted, missing jars are flagged - never silently dropped).

**Compatibility is explicit, never "newest".** `resolver.ts`: a release is eligible only if it lists
the *exact* Minecraft version and the profile's loader (Quilt additionally accepts Fabric builds,
ranked lower). Ranking: release > beta > alpha, native loader > fabric-on-quilt, then newest. The UI's
"Versions" dialog lists every release with a reason when it is incompatible, and lets the user
override with a warning.

**The renderer asks, the main process decides.** The UI sends "install project X"; the main process
re-resolves the plan itself, so file URLs and hashes never come from renderer-supplied data.

**Safe file operations.** Downloads stream to `*.part`, are checksum-verified (sha1/sha512 where the
provider supplies them) and renamed. Mod installs download to a staging directory first and only
commit when everything succeeded; replaced or removed jars go to `profiles/<id>/trash/`, the mod
index is snapshotted to `backups/` before every destructive change, profiles are moved to
`deleted-profiles/` rather than erased, JSON is written atomically, and corrupt JSON is quarantined
instead of crashing. Modpack archives are extracted with zip-slip protection; `.mrpack` downloads are
restricted to the hosts the spec allows.

**Loader install.** Fabric/Quilt publish ready-made launcher profiles (JSON with `inheritsFrom`),
which we merge with the vanilla version. Forge/NeoForge only ship an installer jar whose processors
patch the game; we run it headlessly (`--installClient`) with the right Java and detect the version it
created. Support for a (loader, Minecraft version) pair is verified against the loader's own
metadata before a profile is created or changed.

## In-game features: what needs a mod

A launcher cannot draw inside Minecraft. These need a **client-side companion mod** (Fabric first,
NeoForge later) that the launcher would install per profile:

| Feature | Where it lives |
|---|---|
| HUD (FPS/CPS/keystrokes/armour) and layout editor | companion mod; layout stored in the profile's `config/` |
| In-game overlays / menus | companion mod |
| Keybind management | options.txt is editable from the launcher; a conflict-aware key-capture UI belongs in-game |
| Performance | already available: JVM presets, options.txt tuning, and the "Performance pack" of existing open-source mods |

The companion mod is **not written yet**, so these are listed as *Planned* in the app. The natural
interface between the two: the launcher drops a `lumen-client.json` into the profile's config folder
(HUD layout, feature toggles) and the mod reads it.

## Adding things

- **A Minecraft/loader version**: nothing to do for Fabric/Quilt (meta API). For a new installer-based
  loader, add a `LoaderProvider` in `loaders/index.ts` (list versions + install).
- **A mod source**: implement `ModProvider` in `mods/<name>.ts`, register it in `mods/manager.ts`
  (`providers`) and add a tab in `renderer/js/pages/browse.js`.
- **A client feature that needs the launcher**: add an IPC handler in `index.ts` and its channel is
  automatically reachable from the renderer via `api()`.

## Known limitations

- Forge support starts at 1.12.2 (older installers are untested); NeoForge starts at 1.20.2 (its first release).
- Fabric mods that only list "1.21" are not assumed to fit 1.21.1; they show up as incompatible and can be forced manually.
- CurseForge files whose authors disallow API distribution must be downloaded manually (the app links to them).
- No automatic Java-heap or GPU detection; defaults come from system RAM.
- Only Windows was run during development; macOS/Linux paths are implemented but untested.
