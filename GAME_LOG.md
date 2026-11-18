# WADDLE UP WEB — Build Log

> A living document, updated after every chunk of work. Newest entries are at the bottom.

## What this is
A web remake of the Unity game **Waddle Up** (penguin rage-climber), so friends can play it from a link.
No Unity. Stack: **Three.js + Rapier physics + TypeScript + Vite**. PC only (keyboard + mouse).
Started as a faithful port (bugs included); since v0.2 it has its own fixes and features (see CHANGELOG.md).
Deploy only after a local test.
The Unity project (`D:\UNity GAymes\AR VR  SHITTT`) was only **read**, never modified.

- Full design: [`docs/2026-11-17-waddle-up-web-design.md`](docs/2026-11-17-waddle-up-web-design.md)
- Build plan: [`docs/superpowers/plans/2026-11-17-waddle-up-web-port.md`](docs/superpowers/plans/2026-11-17-waddle-up-web-port.md)
- Run / build / deploy instructions + "where do I change X": [`README.md`](README.md)
- Plain-language list of every major update: [`CHANGELOG.md`](CHANGELOG.md) (current: **v0.8**)
- Later designs: `docs/superpowers/specs/` (round 2 mountain/traps, round 3 fixes, wardrobe, roles)

## How to run locally
1. Open `D:\waddle-up-web` in VS Code (File → Open Folder).
2. Terminal (Ctrl + `): `npm run dev` (run `npm install` first only on a fresh copy).
3. Open http://localhost:5173 in Chrome/Edge. Click NEW GAME, pick a role, then click the game once so it captures the mouse.
4. Stop with Ctrl + C in the terminal.

## Unity → web: what is the same, what differs
Same: all 20 stages, the exact same mountain (same seed + an exact port of .NET's `System.Random`, verified: 299 ledges,
tier tops 80/156/227 m, 51 walls, 34 beams), every constant, string, timing and probability; all 10+ traps, no-repeat
rule, control chaos, wind, fake checkpoints, golden fish, dodging Resume button, taunts, fake achievements, both fake
summits, asteroid ending, stats, credits, save/Continue, settings, procedural audio (same synth code + seeds).

Differences (browser limits / engine differences):
- **The world is mirror-imaged** compared with Unity (Unity is left-handed, three.js is right-handed), so the spiral
  turns the other way. Controls and mouse-look are corrected, so they feel the same.
- **QUIT** cannot close a browser tab: it saves and shows "You can close this tab now."
- **Mouse capture**: the browser needs a click to capture the mouse; pressing Esc releases it and pauses.
- **Graphics Quality** has 3 levels (Low / Medium / High) instead of Unity's quality list.
- Credits say "Three.js + Rapier" instead of "Unity".
- Particles are a small custom system (Unity's ParticleSystem doesn't exist on the web), so smoke/confetti look
  slightly different.
- Saves live in the browser (localStorage), per browser, same keys as Unity's PlayerPrefs.

## File map
```
src/main.ts                 boot (phone notice, physics init, start)
src/core/                   Game (GameManager + loop), time, coroutines, rng (.NET Random port), Input,
                            GameSettings, SaveSystem, StageData, math, refs
src/world/                  MountainData (pure generator), MountainGenerator (scene+colliders), Ledge, MeshKit,
                            Props, WorldDecor, Effects (particles), Interactables (checkpoints, fish, snowball)
src/player/                 PenguinController, PenguinVisual, ThirdPersonCamera
src/trolls/                 TrapDirector, ControlChaos, WindSystem, Taunts
src/audio/                  Synth (procedural sounds/music), AudioManager (Web Audio)
src/ui/                     UIFactory, UIManager, ui.css
src/sequences/              SequenceDirector (fake summits + asteroid)
tests/                      node --test unit tests (npm test)
```

## Progress log
- **2026-11-17**: Interview done. Stack chosen (Three.js + Rapier + TS + Vite). Folder `D:\waddle-up-web` created.
  Design doc written. Waiting for the user's approval of the package installs.
- **2026-11-17**: Approved packages installed in `D:\waddle-up-web\node_modules` (three 0.187.0, @dimforge/rapier3d-compat 0.21.0,
  vite 8.3.8, typescript 7.0.2, @types/three 0.187.0). The npm download cache is kept on D: too (`.npm-cache`, set via `.npmrc`).
  Git repo initialised. Read all 23 Unity scripts (~5,100 lines) and wrote the build plan:
  `docs/superpowers/plans/2026-11-17-waddle-up-web-port.md` (8 tasks).
- **2026-11-17**: Built the whole port on branch `web-port` (8 tasks, one commit each):
  1. Scaffold + core (Unity-style clock, coroutines, exact .NET RNG port: test values match .NET).
  2. Mountain generator (pure data). Test proves it matches the Unity mountain exactly.
  3. Rendering: mountain, ledges, signs (3D text), flags, trees, rocks, clouds, sky shader, fog, shadows, snow.
  4. Penguin (Rapier physics) + camera + procedural penguin model/animation. Played headlessly: walk, jump,
     wall grab, climb, grip runs out at 3.5 s, sweeper knock-off, moving platform, conveyor.
  5. Audio: all 39 clips + music synthesized like Unity (~0.9 s at load), Web Audio playback.
  6. Save system, settings, TrapDirector (12 traps + no-repeat rule), ControlChaos, WindSystem, checkpoints, fish, snowball.
  7. Full UI (menu, HUD, pause w/ dodging Resume, settings, how-to, confirm, credits, stats, fake-win screens) +
     GameManager flow + fake summits + asteroid ending. Played headlessly end-to-end: menu → new game → pause →
     fake summit 1 (tier 2 rises) → fake summit 2 (tier 3 rises) → real summit → asteroid → stats → credits → menu.
  8. Production build (`npm run build`, 1.8 MB gzipped), tested from `dist/`; phone notice verified; README.
  Tests: 24/24 passing (`npm test`). Type-check clean.
- **Needs a human check**: mouse-look feel (headless browsers can't capture the mouse), audio levels, overall
  lighting/colour vs. the Unity build, frame rate on your PC.
- **2026-11-17 (fixes after first play-test)**: User reported 3 problems; investigated each before changing code.
  1. **Jumps random / sometimes huge launches.** Root cause: `moveTowardsV` (src/core/math.ts) reused its output vector
     as its delta, so steering in the air *multiplied* the current speed every physics step (measured 4.5 → 20 m/s),
     and ground acceleration produced scrambled speeds. Fixed; 3 regression tests added. Re-measured in game: air speed
     never exceeds 4.6 m/s, flat jump ≈ 5 m long / 1.48 m high (same as Unity).
  2. **World mirrored (clockwise instead of Unity's counter-clockwise).** three.js is right-handed, Unity left-handed.
     Fix: the canvas is shown flipped (`transform: scaleX(-1)` in index.html), 3D text is drawn pre-mirrored, and the
     two control workarounds were removed (camera yaw and strafe now use Unity's exact math). Verified against the Unity
     report screenshots: mountain on the left of the path, counter-clockwise climb, signs readable, D moves right.
  3. **Mouse look snaps to a new direction (Brave).** Camera math verified smooth at every angle (1° in = 1° out).
     Cause is the Chromium/Windows pointer-lock glitch (one huge fake movementX). Fix: request raw `unadjustedMovement`
     (also matches Unity's raw mouse delta) + `MouseSpikeFilter` that drops a single impossible jump (3 tests).
     Needs the user's confirmation, since headless browsers can't capture the mouse.
  Also fixed: menu subtitle "a penguin's worst day" was clipped off the left edge. Tests: 30/30.
- **2026-11-18 (round 2, branch web-port)** — plan: `docs/superpowers/plans/2026-11-18-round2.md`
  - Bouncy ledges now bounce (landing overwrote the launch). e2e/bounce.mjs.
  - Traps: none on stage 1; 10%→45% chance per new ledge from stage 2; 4 s cooldown; never repeats at a ledge in one
    game; last game's (ledge, trap) pairs avoided (`wu_lasttraps`); Trapdoor → start of current stage.
    8 new traps: Seagull, Fall-through ledge, Tilting ledge, Slippery grab, Camera troll (zoom / upside-down),
    Input delay, Fake crash, Fake "save corrupted" (real save untouched). e2e/traps.mjs fires all 20: ALL PASS.
  - Mountain: tiers taper into a peak; rock carved inward into gullies/ribs; trail band; rim crags; granite colours;
    patchy snow; procedural rock grain. Tests prove every jump is identical (rise/gap/size), no rock in any ledge's
    space, no flat rock to get stuck on. Rocky outcrop ledges (exact walkable top).
  - Hills + small mountains, 3x instanced forest on the real ground, 330 decorative pines on the mountain (no collision).
  - DEV MENU (F10): only in `npm run dev` — jump to any stage / fire any trap. Not in the deployed build (tests/dist.test.ts).
  - e2e/summits.mjs: full flow ALL PASS. Tests 50/50.
  - Found, NOT changed (from the original Unity layout): 3 low-headroom spots on the top tier near stage 18
    (ledge 259 sits 1.66 m / 1.88 m above ledges 248/247; 254 is 2.45 m above 241). Ask the user.
  - Final check done: all browser checks pass (bounce, 20 traps, dev menu, full summit flow), 50/50 unit tests,
    build scan proves no developer code ships (F8/F9/F10 all live in src/dev/, dev server only). README updated.
- **2026-11-18 (round 3: play-test fixes)**: design `docs/superpowers/specs/2026-11-18-round3-fixes-design.md`
  1. Fake summit no longer traps you inside the rising tier (round-2 taper had made the plateau narrower than the tier
     rising out of it). Tiers now 27.5 / 23→19 / 14.5→8.5; flag + cutscene spot in the middle of a ≥4.5 m free ring;
     crags on the rim edge. Unit test + e2e check that you stand on the plateau after each rise.
  2. F10 dev menu doesn't pause; picking a stage/trap closes it and recaptures the mouse; Esc closes it.
  3. Wind gusts half as strong (`src/trolls/windStrength.ts`).
  4. Camera swings outward instead of jamming against the rock (e2e: jammed 0.8–1.4 m before → 6.5 m, clear view).
  5. No loop skipping: top tier wide enough (0 jump+grab skip routes, was 16) + rule: no auto-grab more than 2 ledges
     ahead of the last ledge stood on (`src/player/grabRule.ts`).
  6. Stage 18 head-bump spots gone (lowest ceiling 2.78 m, was 1.66 m); test exceptions removed.
  7. Esc never resumes (only RESUME); Esc still closes sub-menus. RESUME always dodges 4–7 times and now stays on top
     of the other buttons (it used to be able to hide behind them, so clicks hit Settings).
  Jumps still provably identical (fixture test). Unit tests 63/63; e2e: bounce, traps (20), grab, pause, devmenu,
  devmenu-esc, camera, summits — all pass. Build has no dev code (dist scan).
- **2026-11-18 (round 4: heavier traps)**: user picked "heavier". Trap chance per new ledge 30% → 80% (was 10% → 45%),
  cooldown 2 s (was 4 s). Gust and Seagull keep their round-2 chance per ledge exactly (user request); the other 18 traps
  share the rest. Control flips (inverted, mirrored, rotated 90°) last twice as long (24–36 s + up to 16 s higher up).
  Estimated traps per stage (14 landings, 1.5 s apart): stage 2 ≈ 3.3 (was 1.2), stage 10 ≈ 4.9 (was 2.4),
  stage 20 ≈ 6.4 (was 3.5). Tests 65/65; e2e traps/summits/pause pass.
- **2026-11-18 (wardrobe)**: design `docs/superpowers/specs/2026-11-18-wardrobe-design.md`. WARDROBE button in the main
  menu and the pause menu. Everything free, purely cosmetic. 6 tabs: COLOUR 14 · EYES 12 · HATS 16 (15 + No Hat) ·
  OUTFITS 12 · EXTRAS 30 · FEET 10 (`src/player/cosmetics/Catalog.ts`). RANDOMISE / RESET / BACK (or Esc). The camera
  orbits the penguin (which turns to face you); the outfit is saved in the browser (`wu_outfit`). Main menu buttons
  slimmed so 7 fit on short screens. Tests 70/70; e2e/wardrobe.mjs (14 checks) + traps/pause/devmenu/summits pass.
- **2026-11-18 (roles, v0.7)**: design `docs/superpowers/specs/2026-11-18-roles-design.md`. 8 roles in
  `src/player/roles/Roles.ts` (data + numeric modifiers), chosen on a role screen after NEW GAME / GIVE UP, saved as
  `SaveData.role` (old saves → normal), best time per role. Traps call a role-aware `knockback()`; bouncy ledges and
  cutscenes still use `launch()`. Tests: every role can make all 296 jumps and can't land >2 ledges ahead (no new skips);
  role data complete; save normalisation. e2e/roles.mjs: role screen, HUD, save, Continue keeps role, Give Up asks again,
  Old 3.68 m/s, Squirrel 5.29 m/s + wanders, Ghost see-through. Older e2e scripts updated to pass the role screen.
- **2026-11-18 (v0.8)**: save-scum fix. Root cause: saves stored `lastSafePos` (last grounded spot), so pause → Main
  Menu → Continue mid-fall restored the ledge you fell from. Fix: `SaveData.air` stores position/velocity/fall peak while
  airborne and Continue resumes the fall (`PenguinController.resumeFall`); stunned counts as your position; "back to the
  bottom" moves the save to the target before the fade. e2e/savescum.mjs (7 checks) failed before / passes after
  (verified by removing each fix). Branding: "by Adhvit" on the menu + footer, credits "a game by Adhvit" + Game Design.
