# Waddle Up Web — Round 2: Natural Mountain, Rocky Ledges, More Traps

**Date:** 2026-11-17 · **Status:** Approved by the user (2026-11-18), plus the developer-access addition below.

## Intent
Friends should find the game **infuriating and trolly, but always beatable** for anyone who keeps trying.
They should never hit something so unfair that they quit. This round makes the world look like a real mountain
and adds many more traps.

## Goals
1. **Natural craggy mountain (option A, "craggy peak").** Uneven cliffs, rocky spurs, gullies, patchy snow. Low-poly style, matching the penguin.
2. **Rocky ledges.** Ledges look like rock outcrops growing out of the mountain, not blocks.
3. **Surroundings.** More hills and small mountains around, a thick forest at the foot, small pines on the mountain (decoration only).
4. **More traps.** Three times the frequency from stage 2 on, plus 8 new trap types.
5. **Trap no-repeat, within a game and across games** (option C).
6. **Bug fix:** bouncy ledges actually bounce.
7. **No new bugs.** Every change is covered by tests or headless play checks (see Testing).

## Non-goals (this round)
- Rage bait beyond traps (best-height marker, fall replays, share screenshot, leaderboards). Next round.
- Changing the route, the jump distances or the stage list. Every ledge keeps its exact position and size.
- Touching the Unity project (read-only, as always).

## Anti-goals (a failure even if it "works")
- A spot where the penguin can get stuck with no way out.
- Rock geometry that blocks a jump or the headroom above a ledge.
- A ledge whose visible edge differs from where you can actually stand or grab.
- A trap that destroys real progress (real save, or the real position beyond the agreed limits).

## Approaches considered
| # | Approach | Verdict |
|---|---|---|
| 1 | **Reshape the existing mountain with noise** around the unchanged spiral path | **Chosen by the user.** Keeps every proven jump; falls still slide to lower loops; fake summits still work |
| 2 | Build the mountain from piled boulder/cliff chunks | Rejected: messy collisions, snag points, places to get stuck |
| 3 | New mountain + new route from scratch | Rejected: re-balancing all 20 stages; stops being the same game |

## Design

### 1. Mountain shape (`src/world/MountainData.ts`, `buildTierMesh`)
- Higher-resolution mesh per tier: rings roughly every 3 m and 64–96 segments, instead of 6.5 m rings and 14–48 segments.
- The surface radius is the old smooth slope plus layered "ridged" noise:
  - big **spurs** (ribs sticking out up to about 4 m)
  - **gullies** (pushed in up to about 2 m)
  - **cliff bands** (noise stepped in height, so horizontal rock bands show)
  - small facet jitter for the low-poly look
- **Path protection, the key rule.** Wherever a ledge exists at that angle, the rock may not stick out:
  - from 2 m below a ledge's underside to 3.5 m above its top
  - widened by the ledge length plus a margin
  - the radius there is clamped to at most the old surface
  So ledges stay attached and no rock can block a jump or bump the penguin's head.
- **No stuck spots.** Outside the path corridor, the generated rock stays steeper than walkable (surface normal y < 0.6, the same rule the penguin uses for "ground"). So any fall still slides down to a lower loop, as in Unity. A test enforces this.
- **Summit plateaus:**
  - Tier tops keep a flat, walkable area around the flag, because the fake-summit cutscenes stand there and the next tier rises out of it.
  - Only the rim becomes rocky and broken.
  - The real summit keeps a small flat top.
- **Colours** (still vertex colours, no image files):
  - stage-tinted rock with light/dark variation
  - darker in gullies, lighter on ridges
- **Snow** goes on faces that are fairly flat and/or high up, broken into patches by noise, so it's snow "just somewhere", not a uniform cap.
- **Rock grain:** a subtle procedural noise in the shader gives surfaces a rocky texture instead of plain flat colour. There are no texture files, so the download size is unchanged.

### 2. Rocky ledges (`src/world/Ledge.ts` visuals only)
- **Collision is unchanged:** the same box at the same place, so every jump and grab behaves exactly as now.
- **The visible top surface is exactly the walkable rectangle**, with uneven snow or colour patches. All roughness goes on the sides and underneath.
- Sides are jagged low-poly rock. The underside tapers back into the cliff like a natural outcrop.
- Per kind:

| Kind | Look |
|---|---|
| Normal, Rest | rock shelf / outcrop (Rest wider and flatter) |
| Wall | tall rock pillar or step |
| Beam | thin rock spine or arch |
| Ice | icy blue rock shelf with frosty top |
| Crumble | cracked brown rock (visible crack lines) |
| Blink | purple crystal ledge |
| Moving, Rotating, Bouncy, Conveyor, Sweeper | stay as "man-made" platforms (current look, lightly polished). Looking out of place is the fair warning |

### 3. Surroundings (`src/world/WorldDecor.ts`)
- **Hills and small mountains:** about 10–14 low-poly hills and small craggy peaks at 120–450 m, with colliders, so you can't walk through them. Keep the far mountain ring.
- **Forest at the foot:** about 3× the trees, packed near the base. Uses instancing so it stays fast. Trees close to the mountain keep their trunk colliders (as in Unity).
- **Pines on the mountain:**
  - small pines on spurs and gentler patches, outside the path corridor
  - fewer as you go higher, none in the icy top tier
  - **no collision** (decoration only)
  - they rise along with their tier in the fake-summit sequence

### 4. Traps (`src/trolls/TrapDirector.ts`)
- **Stage 1:** no traps (unchanged).
- **Frequency:** chance per new ledge landed goes from about 10% at stage 2 to about 45% at stage 20 (was 3.5%→21%). The cooldown between traps drops from 7 s to 4 s.
- **Existing 12 traps** are kept with the same behaviours, with one change: the **Trapdoor** sends you back to the **start of the current stage** (its rest platform), not the very bottom. This is the agreed "beatable" safeguard.
- **New traps:**

| Trap | From stage | What happens | Fairness |
|---|---|---|---|
| Seagull | 2 | warning squawk + a seagull visibly swoops in after ~0.8 s and knocks the penguin sideways (about sneeze strength) | you hear and see it coming; normal-fall consequences |
| Fall-through ledge | 3 | the *next* ledge turns ghostly: when you jump to it, you pass straight through, then it becomes solid again | just a normal missed jump; never 2 in a row |
| Tilting ledge | 3 | after a 0.4 s wobble warning, the ledge you're on tilts ~25° outward for 1.5 s and slides you toward the edge | jump off during the warning or walk inward to survive |
| Slippery grab | 4 | your next ledge grab (within 6 s) holds 0.35 s then slips | you can grab again after the normal cooldown |
| Camera troll | 5 | either a sudden zoom-in (narrow view) or the camera flips upside-down, for 3 s | controls keep working as normal |
| Input delay | 6 | movement and jump lag 0.25 s behind your keys for 4 s, with a tiny "(lag)" note | short, survivable |
| Fake crash | 7 | game freezes behind a fake "Waddle Up has stopped working" box for ~2.5 s, then "...just kidding" | the game is paused under it; nothing lost |
| Fake save corrupted | 8 | "SAVE FILE CORRUPTED — all progress lost" for 2 s, then "relax. it's fine." | the real save is never touched |

### 5. No-repeat rule, option C (`TrapDirector`, `SaveSystem`)
- **Within a game:**
  - once trap T has fired at ledge L, T never fires at L again this game (stronger than today's "only if it made you fall")
  - the existing fall-ban and grace rules stay
  - all of this is saved with the run
- **Across games:**
  - when a game ends (summit, or New Game over an old run), its list of fired (ledge, trap) pairs is stored as `wu_lasttraps`
  - the next game avoids those exact pairs
  - timing is random every game anyway (landings, chance roll, cooldown)

### 6. Bouncy ledge fix (`PenguinController.onLand` / `updateMove`)
- Root cause (reproduced): the bounce launch set in `onLand` is overwritten in the same physics step when the landing code writes "standing still" velocity.
- Fix: if `onLand` launched the penguin, the move update stops there and keeps the launch velocity.

### 7. Developer access, local only (option A)
- Only when running `npm run dev` on the user's PC: a **DEV menu** (key **F10**) lists the 20 stages. Clicking one:
  - teleports the penguin to that stage's rest platform
  - reveals the tiers it needs
  - updates the stage banner and HUD
  It also has buttons to force-fire any trap (handy for testing the new traps). The F8/F9 keys stay.
- **The deployed game contains none of it.** Everything sits behind `import.meta.env.DEV`, which Vite removes from `npm run build`. A test scans `dist/` and fails if any dev-menu code is present.
- The dev menu never writes a different save format. Using it marks the run's save as dev-touched so it can't produce a "best time".

## Testing (how "no bugs" is checked)
- **Build check:** `npm run build` followed by a test that `dist/` has no dev-menu code.
- **Unit tests (`npm test`):**
  - ledges identical to before (positions, sizes, count 299)
  - rock never inside any ledge's corridor/headroom
  - no walkable rock outside path corridors and plateaus (no stuck spots)
  - trap rules: no stage-1 traps, the new frequencies, within-game no-repeat, cross-game avoidance, the Trapdoor goes to the stage start, fake-save trap leaves the save byte-identical
- **Headless play checks (Edge driver):**
  - bounce works (upward speed > 9 m/s after landing)
  - every trap, old and new, force-fired once with no errors and the penguin recoverable
  - the existing jump measurements are unchanged
  - full flow: menu → game → both fake summits (tiers + pines rise) → ending → menu
  - screenshots of the new mountain from the start, mid-climb and the menu orbit
- **Performance:** frame time checked in the menu orbit and mid-climb; instancing for trees and pines.
- **Needs the user's check:** the overall look, how often the traps feel, mouse feel.

## Left to the builder
Exact noise frequencies and colours (tuned by screenshot), seagull model details, exact trap weights inside the agreed frequency band, and the wording of the fake-crash and fake-save texts (in the game's existing joking tone).
