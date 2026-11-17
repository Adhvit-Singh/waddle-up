# Waddle Up Web — Design

**Date:** 2026-11-17 · **Status:** Approved by user ("fine with everything, just do as it is")

## Intent
Remake the Unity college game **Waddle Up** (3D penguin rage-climber) as a standalone web game that
friends can play from a link. Nothing Unity is involved. Hosting (Vercel or similar) happens later,
after the user tests it locally and gives the go-ahead.

## Goals
- A **faithful port** of the Unity version (`D:\UNity GAymes\AR VR  SHITTT\Assets\Game\Scripts\*.cs`, ~5,100 lines),
  covering all 20 stages and 3 tiers, both fake summits, the asteroid ending, all 10 random troll traps, the no-repeat rule,
  control chaos, wind, fake checkpoints, the golden-fish shortcut, the dodging Resume button, taunts, fake achievements,
  procedural low-poly art, synthesized SFX and music, the menus/HUD/pause/settings/credits, and save + Continue.
- Runs on a normal PC in Chrome/Edge, loads fast, and needs no install.
- Static build output (`npm run build` → `dist/`) that any static host can serve.

## Non-goals (for now)
- **Fixing bugs.** The user explicitly wants the bugs ported as they are. Improvements come after it runs locally.
- Phone/touch controls (phones get a "play this on a computer" notice).
- Deployment (a separate step after the user approves the local build).

## Anti-goals
- A redesign that "feels different" from the Unity version.
- Heavy downloads (no big engines or asset packs).

## Constraints
- Every package install is approved by the user first.
- `GAME_LOG.md` in the project root is updated after every chunk of work.
- The project lives at `D:\waddle-up-web\`, its own git repo, separate from the Unity project.

## Approaches considered
| Option | Trade-off | Verdict |
|---|---|---|
| **Three.js + Rapier, TypeScript, Vite** | Light, most popular web 3D library; Rapier provides rigid bodies, friction-combine rules, raycasts and shape casts like Unity PhysX. Integration is hand-written. | **Chosen** |
| Babylon.js + Havok | Batteries included, but a heavier download | Rejected |
| Godot web export | Another engine/editor project with slow-loading web builds, which the user doesn't want | Rejected |

## How (decided)
- **Stack:** `three`, `@dimforge/rapier3d-compat` (WASM inlined, no extra config), `typescript`, `vite`, `@types/three`.
- **Local dev:** VS Code → `npm run dev` → http://localhost:5173.
- **Port mapping:** one TS module per C# script, same folder layout under `src/`:
  `core/` (GameManager, GameSettings, SaveSystem, StageData), `world/` (MountainGenerator, Ledge, MeshKit, WorldDecor,
  Effects, Interactables, Props), `player/` (PenguinController, PenguinVisual, ThirdPersonCamera),
  `trolls/` (TrapDirector, ControlChaos, Taunts, WindSystem), `audio/` (Synth, AudioManager), `ui/` (UIFactory, UIManager),
  `sequences/` (SequenceDirector).
- **Unity → web equivalents:**
  - MonoBehaviour Update/FixedUpdate → a central game loop with fixed 50 Hz physics steps (Unity's default) plus per-frame updates
  - Rigidbody / colliders / PhysicsMaterial (frictionless) → Rapier bodies/colliders with friction 0 and the `Min` combine rule
  - Physics.Raycast / SphereCast / CheckCapsule → Rapier `castRay` / `castShape` / `intersectionsWithShape`
  - Vertex-color lit shader → `MeshLambertMaterial({vertexColors})` with flat shading, shadows and fog
  - GradientSky shader → a large sphere with a gradient ShaderMaterial
  - 3D sign text (Text3D) → canvas-texture sprites/planes
  - uGUI built in code → HTML/CSS overlay built in code
  - AudioClips synthesized in Synth.cs → the same synthesis into Web Audio `AudioBuffer`s
  - PlayerPrefs JSON → `localStorage` with the same keys and shape
  - Input System (WASD/arrows/mouse/scroll/Space/Ctrl/Esc) → keyboard events + Pointer Lock for the mouse camera
  - Random seed: same deterministic seed and same RNG algorithm reimplemented (System.Random port) so the mountain matches
- **Mobile:** detect touch-only/small screens and show a notice.

## Left to the builder
- Exact visual tuning (lighting intensities, shadow settings) to look close to the Unity build.
- Splitting large C# files into smaller TS files where that reads better.
