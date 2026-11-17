# Waddle Up Web Port: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A faithful browser remake of the Unity game Waddle Up, runnable with `npm run dev` and buildable to static files with `npm run build`.

**Architecture:** One TS module per C# script. A central `Game` loop runs fixed 50 Hz physics steps (Rapier) and per-frame updates, and Unity coroutines become generator functions on a small scheduler. World generation is pure data (testable in Node). Builders turn that data into Three.js meshes and Rapier colliders. The UI is HTML/CSS built in code.

**Tech Stack:** three 0.187, @dimforge/rapier3d-compat 0.21, TypeScript 7, Vite 8. Tests use Node 26's built-in `node:test` plus native TS type-stripping, so nothing extra needs installing.

**Spec:** `docs/2026-11-17-waddle-up-web-design.md`. The **source of truth for every number, string and behavior** is the Unity code at
`D:\UNity GAymes\AR VR  SHITTT\Assets\Game\Scripts\**\*.cs` (referred to below as `cs/…`). Port values verbatim.

## Global Constraints
- Faithful port: same constants, strings, timings and probabilities as `cs/`. Do **not** fix bugs.
- No new npm packages without asking the user.
- Project root `D:\waddle-up-web`. Update `GAME_LOG.md` after each task.
- PC only: if `matchMedia('(pointer: coarse)')` matches and there is no fine pointer, show the "Waddle Up is a PC game. Open this link on a computer." overlay.
- Unity→web coordinate rule: keep every Unity number unchanged. Rotation matrices are the same (`Quaternion.Euler(x,y,z)` ⇒ `new Euler(x,y,z,'YXZ')` in radians, and `Quaternion.LookRotation(f, up)` ⇒ basis X=`up×f` normalized, Y=`f×X`, Z=`f`). Because the three.js camera is right-handed, the **picture is mirrored** relative to Unity. Compensate in exactly two places: camera mouse/stick yaw uses `yaw -= dx`, and `WishDir` uses `right = f × up` (the screen right of the three camera). Everything else is ported literally.
- Imports between `src/` files use explicit `.ts` extensions (`allowImportingTsExtensions`), so Node can run the pure modules in tests.

## Review Focus
1. **Tab loses focus / Alt-Tab mid-jump:** the game should auto-pause (like Unity's `OnApplicationFocus`), and the frame delta after refocus must be clamped (max 0.1 s) so the penguin isn't teleported. Test: `Game.tick` with dt=5 runs at most 5 physics steps (`time.test.ts`).
2. **Pointer lock refused or released by the browser (Esc pressed):** the browser eats the first Esc to exit pointer lock. The `pointerlockchange` → unlocked event while Playing must open pause, same as Unity Esc. A click while Playing re-locks.
3. **Corrupt or old localStorage save:** `SaveSystem.load()` returns `null` on bad JSON, and a missing `bannedTraps` becomes `[]` (`save.test.ts`).
4. **Audio blocked until a user gesture:** create the AudioContext on the first click/key, and calls to `AudioManager.play` before that are silent no-ops instead of throwing (`audio.test.ts` checks `play()` with no context doesn't throw).
5. **Window resize / different aspect ratios:** the UI scales by `sqrt((w/1920)*(h/1080))` (Unity's match 0.5), and the renderer and camera aspect update on resize.

---

## File Structure
```
index.html                 canvas host + #ui root + mobile notice
vite.config.ts             base './' (static hosting)
tsconfig.json
src/main.ts                boot: await RAPIER.init(), new Game().start()
src/core/rng.ts            DotNetRandom (exact port of System.Random seeded algorithm) + UnityRandom helpers
src/core/time.ts           Time {time, deltaTime, unscaledTime, unscaledDeltaTime, fixedDeltaTime=0.02, timeScale}
src/core/coroutines.ts     Scheduler: start(gen), stopAll(owner); yields: number (scaled secs), {realtime:n}, null (frame)
src/core/math.ts           lerp, inverseLerp, clamp01, moveTowards(v), moveTowardsAngle, smoothStep, repeat, lookRotation, eulerDeg
src/core/StageData.ts      LedgeKind enum, StageDef, STAGES (20), TIER_COUNT
src/core/GameSettings.ts   localStorage keys wu_master…wu_quality, changed event
src/core/SaveSystem.ts     SaveData, key wu_save_v1, BestTime/Wins/LifetimeFalls
src/core/Game.ts           GameManager port + main loop + physics world ownership
src/core/Input.ts          keyboard state (isPressed / wasPressedThisFrame), mouse delta, scroll, gamepad, pointer lock
src/world/MeshKit.ts       MeshBuilder (tri/quad/box/sphere/cone/coneAxis → BufferGeometry, non-indexed, flat normals, vertex colors), Mats
src/world/MountainData.ts  pure generator: steps, tiers, ledge specs, rest decorations, tier body points (no three scene/Rapier)
src/world/MountainGenerator.ts builds Object3Ds + colliders from MountainData; queries StageAtHeight/GetLedge/ResetAllLedges
src/world/Ledge.ts         Ledge behavior (moving/rotating/crumble/blink/conveyor/sweeper/bouncy/scoot/icy)
src/world/Props.ts         Flag, Sign, Text3D (canvas texture), Fish, Glow, Tree/Rock/Cloud meshes, Waver/Spinner/Billboard/Drifter
src/world/WorldDecor.ts    sun, hemisphere ambient, gradient sky sphere, FogExp2, ground, scatter, far peaks, clouds, doom
src/world/Effects.ts       CPU particle system on THREE.Points (dust, snow, confetti, explosion, sparkle, snowfall, wind streaks, fire trail)
src/world/Interactables.ts FakeCheckpoint, ShortcutFish (distance triggers)
src/physics/Physics.ts     Rapier wrapper: owners map (collider handle → {ledge?, sweeper?, mountain?, penguin?}), raycast, sphereCast, checkCapsule, layer filter
src/player/PenguinController.ts
src/player/PenguinVisual.ts
src/player/ThirdPersonCamera.ts
src/trolls/TrapDirector.ts (+ Snowball)
src/trolls/ControlChaos.ts
src/trolls/Taunts.ts
src/trolls/WindSystem.ts
src/audio/Synth.ts         sample generation → Float32Array per clip (pure)
src/audio/AudioManager.ts  Web Audio: 14-voice pool, loops (music, wind, fallwind, rumble), volumes as cs/
src/ui/ui.css
src/ui/UIFactory.ts        rect/stretch/panel/text/button/column/sliderRow/optionRow, UIColors, DodgeButton
src/ui/UIManager.ts        every screen from cs/UI/UIManager.cs
src/sequences/SequenceDirector.ts
tests/*.test.ts            node --test
```

---

### Task 1: Scaffold, core utilities, deterministic RNG

**Files:**
- Create: `index.html`, `vite.config.ts`, `tsconfig.json`, `src/main.ts`, `src/core/rng.ts`, `src/core/time.ts`, `src/core/coroutines.ts`, `src/core/math.ts`
- Modify: `package.json` (add `"test": "node --test tests/"`)
- Test: `tests/rng.test.ts`, `tests/coroutines.test.ts`, `tests/time.test.ts`

**Interfaces:**
- Produces: `class DotNetRandom { constructor(seed:number); next():number; next(max:number):number; next(min:number,max:number):number; nextDouble():number }`. It is the Knuth subtractive generator exactly as in .NET/Mono `System.Random(int)` (MSEED 161803398, 56-slot array, inext=0, inextp=21, `Sample()=InternalSample()*(1/int.MaxValue)`, `Next(max)=(int)(Sample()*max)`), using 32-bit integer arithmetic (`|0`).
- Produces: `UnityRandom`, a module with `value()`, `range(a,b)` (float; the int overload is exclusive of max), `insideUnitSphere()`, `rotation()`, backed by `Math.random`.
- Produces: `Time` singleton fields as listed; `Scheduler.start(owner:object, gen:Generator<Yield>)`, `Scheduler.stopAll(owner)`, `Scheduler.update()`.

- [ ] **Step 1: Write the tests.** `rng.test.ts`: `new DotNetRandom(0).next()` === 1559595546, `new DotNetRandom(42).next()` === 1434747710, `new DotNetRandom(42).nextDouble()` ≈ 0.6681064659115423 (1e-12). These are the known .NET Framework values; if the run disagrees, verify against a C# snippet before changing the algorithm. `coroutines.test.ts`: a generator yielding `0.5` resumes after `Time.time` passes 0.5, and `stopAll(owner)` prevents resumption. `time.test.ts`: `stepsFor(5)` (fixed-step accumulator) returns ≤ 5.
- [ ] **Step 2:** Run `npm test` and confirm it fails (modules are missing).
- [ ] **Step 3:** Implement the modules. `index.html` has a `<canvas id="game">`, `<div id="ui">`, `<div id="mobile">` and loads `/src/main.ts`. `vite.config.ts` sets `base:'./'`. `tsconfig.json`: `target ES2022`, `module ESNext`, `moduleResolution bundler`, `strict`, `allowImportingTsExtensions`, `noEmit`. `main.ts` for now renders a spinning cube so `npm run dev` shows something.
- [ ] **Step 4:** Run `npm test` and `npx tsc --noEmit` and confirm both pass. Run `npm run dev` and confirm the cube shows on localhost:5173.
- [ ] **Step 5:** Commit: `feat: scaffold vite+three+rapier project with core utilities`

### Task 2: Stage data, mountain generation (pure), MeshBuilder

**Files:**
- Create: `src/core/StageData.ts`, `src/world/MountainData.ts`, `src/world/MeshKit.ts`
- Test: `tests/mountain.test.ts`

**Interfaces:**
- Produces: `enum LedgeKind { Normal, Rest, Wall, Beam, Ice, Moving, Rotating, Crumble, Blink, Bouncy, Conveyor, Sweeper }`, `STAGES: StageDef[]` (colors as `THREE.Color` from hex, and all 20 rows verbatim from `cs/Core/StageData.cs`).
- Produces: `generateMountain(): MountainData` with `{ ledges: LedgeSpec[], tiers: TierInfo[], stageMinY:number[], stageMaxY:number[], spawnPoint:Vector3, spawnYaw:number, rests: RestDeco[], tierBodies: TierBody[] }`. Here `LedgeSpec = {index, stage, kind, size:Vector3, pos:Vector3, rot:Quaternion, rock:Color, top:Color, seed, tier}`, and `TierInfo` has the same fields as cs plus `slopeR(y)` and `height`. The RNG call order must match `cs/World/MountainGenerator.cs` exactly (one `DotNetRandom(20261117)` consumed by `Generate`/`MakeStep`, and separate RNGs for tier meshes).
- Produces: `MeshBuilder` with `tri, quad, box, sphere, cone, coneAxis, build(): BufferGeometry` (non-indexed, `computeVertexNormals()` gives flat normals because vertices aren't shared, plus a `color` attribute). Color multiply (`rock * 0.88`) is done on RGB only. `Mats.vertexColor` = `MeshLambertMaterial({vertexColors:true, flatShading:true})`.
- Consts exported: `SEED=20261117, JUMP_V=5.3, MOVE_SPEED=4.6, G=9.81`.

- [ ] **Step 1: Write the test.** `mountain.test.ts` checks against the Unity results in `GAME_LOG.md` §4: `ledges.length === 299`; tier topY ≈ 80 / 156 / 227 (±1.5); 51 ledges of kind Wall; 34 of kind Beam; `ledges[0].kind === Rest`; spawnPoint = ledge0.pos + (0,0.05,0).
- [ ] **Step 2:** Run it and confirm it fails.
- [ ] **Step 3:** Port `MakeStep`, the step-list loop, tier shapes, spiral placement, rest decorations (as data: sign/flag/fish positions and text) and tier-body point grids.
- [ ] **Step 4:** Run `npm test` and confirm it passes. If the counts differ, the RNG call order is wrong; fix it until they match.
- [ ] **Step 5:** Commit: `feat: deterministic mountain generation matching Unity`

### Task 3: Rendering the world (no player yet)

**Files:**
- Create: `src/world/MountainGenerator.ts`, `src/world/Ledge.ts` (visual + collider only in this task), `src/world/Props.ts`, `src/world/WorldDecor.ts`, `src/world/Effects.ts`, `src/physics/Physics.ts`, `src/core/Game.ts` (renderer, scene, loop, a free orbit camera for viewing)

**Interfaces:**
- Consumes: `generateMountain()`, `MeshBuilder`.
- Produces: `Physics` with `world: RAPIER.World` (gravity 0,0,0; the penguin applies gravity itself), `register(collider, owner)`, `ownerOf(collider)`, `raycast(origin, dir, maxDist, excludePenguin=true): Hit|null`, `sphereCast(origin, radius, dir, maxDist): Hit|null`, `checkCapsule(a, b, radius): boolean`, where `Hit = {point, normal, distance, collider, owner}`. Sensors/triggers are excluded from queries.
- Produces: `Ledge` class with the public fields of cs (`index, stage, kind, size, velocity, angularVelocity, conveyor, solid`) and an `object: THREE.Group` whose origin is the top-surface center. Colliders: cuboid (fixed; `kinematicPositionBased` for Moving/Rotating; the sweeper arm is its own kinematic body).
- Produces: `MountainGenerator.instance` with `ledges, tiers (root: THREE.Group), spawnPoint, spawnYaw, summitY, stageAtHeight(y), getLedge(i), resetAllLedges()`. Tier roots for tiers 1 and 2 start hidden, with colliders disabled (`collider.setEnabled(false)`).
- Lighting/sky per `cs/World/WorldDecor.cs`: a DirectionalLight from `Euler(48°,-35°,0)` at intensity ~1.1×π (three uses physical units; tune by eye), a HemisphereLight (sky 0.46,0.54,0.7 / ground 0.28,0.28,0.34), a gradient sky ShaderMaterial on a BackSide sphere using the `_Top/_Horizon/_Bottom/_Exponent 0.55` formula from `GradientSky.shader`, and `FogExp2(0.72,0.84,0.95, 0.0035)`. Shadows: PCFSoft, a 2048 map, and a shadow camera that follows the player.
- Text3D: render to a canvas (bold sans), honoring `\n` and `<size=N>` (relative to 100), on a `Mesh` plane with a depth-tested transparent material; billboard when asked.

- [ ] **Step 1:** Build everything and view it with a temporary orbit camera (mouse drag).
- [ ] **Step 2:** Run `npx tsc --noEmit` and confirm it passes. Run `npm run dev` and confirm the mountain, ledges, signs, flags, trees, clouds, snow and sky render. Take a screenshot (Chrome) for the log.
- [ ] **Step 3:** Commit: `feat: render procedural mountain, props and environment`

### Task 4: Input, penguin controller, camera, penguin visual

**Files:**
- Create: `src/core/Input.ts`, `src/player/PenguinController.ts`, `src/player/PenguinVisual.ts`, `src/player/ThirdPersonCamera.ts`
- Modify: `src/core/Game.ts`, `src/world/Ledge.ts` (fixedUpdate/update behaviors: moving, rotating, sweeper spin, crumble, blink, conveyor chevrons, ice tint, bouncy launch, scoot, resetState)

**Interfaces:**
- Produces: `Input.isPressed(code)`, `Input.wasPressed(code)` (this frame), `Input.mouseDelta`, `Input.scrollY`, `Input.gamepad()`, `Input.lockPointer()`, `Input.isLocked`, `Input.endFrame()`.
- Produces: `PenguinController` with the public API of `cs/Player/PenguinController.cs` (`state, groundLedge, inputLocked, locked, grounded, hanging, gravityScale, externalAccel, facing, horizontalSpeed, grip01, airTime, rawMove, events landed/jumped/fell/grabbed, drop(), launch(v,noGround), teleport(pos,yawDeg), stun(s), ragdoll(v,torque)`, and the `body` with `linvel`/`position`). Body: dynamic, `lockRotations()`, gravityScale 0, `setCcdEnabled(true)`, capsule (half-height `(1.12-2*0.34)/2`, radius 0.34) offset so the origin is at the feet, friction 0 with `CoefficientCombineRule.Min`, restitution 0. Kinematic while hanging is done with `setBodyType(KinematicPositionBased)`. Sweeper contact (`OnCollisionEnter`) is detected each step via `world.contactPair(penguinCollider, armCollider)` going from false to true.
- Constants verbatim: GripTime 3.5, grab rays at 0.75/1.2 m, probe +2.05, stun impact >15, fall event drop >5.5, accel 38/15 (ice 5/0.8), air accel 9, terminal −42, coyote 0.11, jump buffer 0.14, `noGroundUntil` +0.15, fall-off-world y < −40.
- Camera: `ThirdPersonCamera` (Follow / MenuOrbit / Cutscene, `snapBehindTarget, flip180, shake, setCutscene(pos, look, lerp)`). Euler `(pitch,yaw,0,'YXZ')`, `dir = rot·(0,0,-1)`, SphereCast radius 0.28 for collision, and FOV 60 + fall kick 14 (three FOV is vertical, same as Unity).
- Visual: every part and animation of `cs/Player/PenguinVisual.cs`.

- [ ] **Step 1:** Implement. A temporary Game state = Playing, with spawn at the start ledge.
- [ ] **Step 2:** Run `npx tsc --noEmit`. Play in Chrome: walk, jump, auto-grab a wall in stage 3, climb, hang until the grip runs out, slide down the slope, belly-flop stun from a high fall, ride a moving platform, get swept by a sweeper.
- [ ] **Step 3:** Commit: `feat: penguin controller, camera and procedural penguin`

### Task 5: Audio

**Files:**
- Create: `src/audio/Synth.ts`, `src/audio/AudioManager.ts`
- Test: `tests/audio.test.ts`

**Interfaces:**
- Produces: `buildAll(): Record<string, Float32Array>` at sample rate 44100, generating every clip in `cs/Audio/Synth.cs` (same names, same RNG `DotNetRandom(4242)`, and the music RNG `DotNetRandom(7)`), with normalize/peak/fade and loopify as cs.
- Produces: `AudioManager.play(name, vol=1, pitch=1)`, `playAt(name, pos, vol)`, `setWindAmbient`, `setFallLoop`, `setRumble`, `duckMusic`, `setMusicMultiplier`, `update(dt)`, `unlock()` (creates the AudioContext on the first gesture). Pitch = `playbackRate`. Master volume = a GainNode set from `GameSettings.master`. Generation runs after unlock. Music generation is ~21 s of audio, so it's acceptable if it takes <1 s; show "loading" otherwise.

- [ ] **Step 1: Write the test.** `buildAll()` returns keys including `jump, land, step, music, wind, fallwind, rumble, explosion, victory`, every array is non-empty with peak ≤ 1. `AudioManager.play('jump')` before `unlock()` doesn't throw.
- [ ] **Step 2:** Run it and confirm it fails. **Step 3:** Implement. **Step 4:** Run `npm test` and confirm it passes. Listen in the browser.
- [ ] **Step 5:** Commit: `feat: procedural audio synthesis and web audio manager`

### Task 6: Game flow, save, settings, trolls

**Files:**
- Create: `src/core/GameSettings.ts`, `src/core/SaveSystem.ts`, `src/trolls/Taunts.ts`, `src/trolls/TrapDirector.ts`, `src/trolls/ControlChaos.ts`, `src/trolls/WindSystem.ts`, `src/world/Interactables.ts`
- Modify: `src/core/Game.ts` (full GameManager port: states Boot/Menu/Playing/Paused/Cutscene/Ending, newGame/continueGame/beginRun, resetWorld, revealInstant, setPaused, stage tracking + banners, lastSafePos, idle taunt 45 s, autosave 8 s, summit checks, onFell, sendToBottom, saveNow; Esc and blur → pause)
- Test: `tests/save.test.ts`, `tests/traps.test.ts`

**Interfaces:**
- Produces: `SaveSystem.load(): SaveData|null`, `save(d)`, `clear()`, `hasSave`, `bestTime`, `wins`, `lifetimeFalls` (localStorage keys exactly `wu_save_v1, wu_besttime, wu_wins, wu_lifefalls`). Tests pass a `Storage` stub via `SaveSystem.setStorage(s)`.
- Produces: `TrapDirector` with `defs` verbatim, cooldown 7, chance `lerp(0.035,0.21,(stage-1)/19)`, `loadBans/exportBans/isBanned/registerExternalTrap`, all 12 trap behaviors and the snowball (Rapier ball r=0.72, mass 4). The ban rule fires on a fall within 5 s of a non-External trap.
- Produces: `ControlChaos.apply(v2)`, mode, timers verbatim. `WindSystem.gustAtPenguin(strength, dur)`.

- [ ] **Step 1: Write the tests.** `save.test.ts`: round-trip SaveData; bad JSON → null; JSON without `bannedTraps` → `[]` after `Game`-style normalize (export `normalizeSave`). `traps.test.ts`: `onFell` within 5 s of a Crumble at ledge 40 bans `"40:Crumble"` and adds ledge 40 to grace; the next landing on 40 fires nothing; External traps never ban.
- [ ] **Step 2:** Run them and confirm they fail. **Step 3:** Implement. **Step 4:** Run `npm test` and confirm it passes.
- [ ] **Step 5:** Commit: `feat: game flow, saving, settings and troll systems`

### Task 7: UI (all screens) and sequences (fake summits, asteroid ending)

**Files:**
- Create: `src/ui/ui.css`, `src/ui/UIFactory.ts`, `src/ui/UIManager.ts`, `src/sequences/SequenceDirector.ts`
- Modify: `src/core/Game.ts` (wire the UI, remove the temporary debug camera)

**Interfaces:**
- Produces: `UIManager` with every public method of `cs/UI/UIManager.cs`: `showHUD, updateHUD, showControlsHint, formatTime, stageBanner, taunt, toast, achievement, setChaosWarning, setChaos, blackout, fade(to, secs, color?) (a generator for coroutines), setFade, showMenu, showPause, back, confirm, rollCredits, endCredits, creditsActive, showStats, fakeWinShow, fakeWinText, fakeWinBar, nope (a generator), enterGameplayUI`. Layout uses Unity anchors/positions/sizes on a 1920×1080 reference, scaled by `sqrt((w/1920)*(h/1080))`. Rich text `<b> <i> <color=#…> <size=N>` is converted to HTML spans. The font is a system bold sans-serif. All strings are verbatim, except the credits line "BUILT WITH / Unity" → "Three.js + Rapier", and QUIT → after confirming, shows a "You can close this tab now. The penguin will wait." toast (browsers can't quit).
- Settings: Graphics Quality cycles `Low / Medium / High` (pixelRatio 0.75/1/min(devicePixelRatio,2), shadows off/1024/2048). Fullscreen uses the Fullscreen API.
- `SequenceDirector.runFakeSummit(tier)`, `runEnding()`, `cleanup()`: timings, texts, camera poses, the tier rise (7 s smoothstep), asteroid (r=14 sphere, PointLight, fire trail), explosions, 110 Rapier chunks, ragdoll, stats → credits → menu.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `npx tsc --noEmit` and `npm test`. In Chrome, go through: menu → New Game → hint shows → Esc pause (resume dodge) → settings sliders persist after reload → Continue restores position → for testing, a dev-only `?debug` URL flag allows `F9` = teleport to tier summit (stripped from production with `import.meta.env.DEV`) → fake summit 1 → tier 2 rises → fake summit 2 → ending → stats → credits → menu.
- [ ] **Step 3:** Commit: `feat: full UI and summit/ending sequences`

### Task 8: Build, polish pass for parity, docs

**Files:**
- Modify: `GAME_LOG.md` (how to run, file map, Unity→web differences, known limitations), `README.md` (create: run/build/deploy steps)

- [ ] **Step 1:** Run `npm run build`. Expected: `dist/` is created with no TS errors. Run `npm run preview` and play-test in Chrome from the built files.
- [ ] **Step 2:** Mobile notice check (Chrome devtools device mode shows the notice).
- [ ] **Step 3:** Commit: `docs: run/build instructions and port notes`
