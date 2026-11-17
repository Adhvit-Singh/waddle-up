# WADDLE UP WEB — Build Log

> A living document, updated after every chunk of work. Newest entries are at the bottom.

## What this is
A web remake of the Unity game **Waddle Up** (penguin rage-climber), so friends can play it from a link.
No Unity. Stack: **Three.js + Rapier physics + TypeScript + Vite**. PC only (keyboard + mouse).
Faithful port, bugs included. Deploy only after a local test.
The Unity project (`D:\UNity GAymes\AR VR  SHITTT`) was only **read**, never modified.

- Full design: [`docs/2026-11-17-waddle-up-web-design.md`](docs/2026-11-17-waddle-up-web-design.md)
- Build plan: [`docs/superpowers/plans/2026-11-17-waddle-up-web-port.md`](docs/superpowers/plans/2026-11-17-waddle-up-web-port.md)
- Run / build / deploy instructions + "where do I change X": [`README.md`](README.md)

## How to run locally
1. Open `D:\waddle-up-web` in VS Code (File → Open Folder).
2. Terminal (Ctrl + `): `npm run dev` (run `npm install` first only on a fresh copy).
3. Open http://localhost:5173 in Chrome/Edge. Click NEW GAME, then click the game once so it captures the mouse.
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
