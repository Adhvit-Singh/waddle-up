# Waddle Up (web)

*a penguin's worst day* — a game by **Adhvit**.

A rage-bait climbing game in the browser: a clumsy penguin, a craggy spiral mountain, lots of random troll traps,
two fake endings and an asteroid. Built with **Three.js + Rapier physics + TypeScript + Vite**. PC only (keyboard + mouse).
Started as a remake of the Unity version; see [`CHANGELOG.md`](CHANGELOG.md) for every update since.

## Run it on your computer

You need **Node.js** (already installed: v26). Open this folder in **VS Code**, then open the terminal
(**Ctrl + `**) and type:

```bash
npm install      # first time only (or after copying the folder to another PC)
npm run dev      # starts the game at http://localhost:5173
```

Open **http://localhost:5173** in Chrome or Edge. Keep the terminal open while you play.
Code changes reload the page automatically. Press **Ctrl + C** in the terminal to stop.

## Playing

- **WASD / arrows** waddle · **Space** jump (jump at a ledge edge to grab it) · **Mouse** look · **Scroll** zoom
- **Esc** pauses. Only the (very shy) **RESUME** button unpauses.
- Your climb is saved automatically. **CONTINUE** picks up exactly where you were (even mid-fall).

### Roles
**NEW GAME** asks you to pick a penguin role. It's locked for the whole climb; to switch, start a new game.
Normal is the easiest; the others each have one advantage and a bigger disadvantage. Traps are the same for everyone.

| Role | Advantage | Disadvantage |
|---|---|---|
| Normal Penguin | — | — |
| Scaredy Penguin | grip lasts 50% longer | controls tremble the higher you are, tunnel vision near the top |
| Squirrel Mode | 15% faster | wanders off if you stand still for 2 s, camera glances away |
| Bird Brain | never stunned by falls | 1 in 4 jumps happen late, direction drifts |
| Old Penguin | never stunned, traps and wind push it 40% less | 20% slower, jumps a bit lower |
| Show-off | jumps 15% higher | every jump flips and nudges the landing, dramatic zoom |
| Ice Skater | 20% faster on the ground | everything is slippery, ice is nearly impossible |
| Ghost Penguin | 1 in 3 trap knock-backs and gusts pass through | floaty low gravity, see-through |

Each role keeps its own best time.

### Wardrobe
Main menu or pause menu → **WARDROBE**: colours (14), eyes (12), hats (15 + none), outfits (12), extras (30) and
feet (10). All free, purely cosmetic, saved in the browser. RANDOMISE / RESET included.

### Developer menu (only on your PC)
While running `npm run dev`, press **F10** in a game to open the **DEV MENU**:
- **Go to stage 1–20**: teleports to that stage's start and raises the tiers it needs.
- **Fire trap**: triggers any of the 20 traps on the ledge you're standing on.
- A run where you used the menu never records a best time.

**F8** (next stage) and **F9** (just below the current summit) also work.
None of this exists in `npm run build` / the deployed game. `npm test` checks the built files to make sure.

## Check the real (deployable) version

```bash
npm run build    # type-checks, then writes the finished game to dist/
npm run preview  # serves dist/ at http://localhost:4173 (what friends will get)
```

## Tests

```bash
npm test                          # unit tests (91): every jump makeable for every role, no skip routes, mountain
                                  # safety rules, trap rules, saving, wardrobe catalog, pause rules, audio, build scan
node e2e/cdp.mjs e2e/summits.mjs  # browser checks (need `npm run dev` running and Microsoft Edge)
```

Browser checks in `e2e/`: `summits` (full game flow), `traps` (all 20 traps), `roles`, `wardrobe`, `savescum`
(no pause-and-quit cheating), `pause`, `grab` (no skipping loops), `camera`, `bounce`, `devmenu`, `devmenu-esc`,
`air-speed`, `look` / `perf` (screenshots, frame time).

## Deploying (later)

`dist/` is a plain static website. On Vercel: import the Git repo, framework preset **Vite**,
build command `npm run build`, output directory `dist`. (Netlify / GitHub Pages / Cloudflare Pages work the same way.)

## Where things are

| Want to change | File |
|---|---|
| Stage names, order, gimmicks, difficulty, colours | `src/core/StageData.ts` |
| Mountain shape, tier widths, path, crags | `src/world/MountainData.ts` |
| Move speed / jump height | `MOVE_SPEED`, `JUMP_V` in `src/world/MountainData.ts` |
| Rocky ledge looks | `src/world/LedgeVisual.ts` |
| Hills, forest, sky, fog, lighting | `src/world/WorldDecor.ts` · pines on the mountain: `src/world/Pines.ts` |
| Grip time, stun threshold, accelerations | `src/player/PenguinController.ts` |
| No-skip grab rule | `src/player/grabRule.ts` |
| Roles (names, descriptions, numbers) | `src/player/roles/Roles.ts` |
| Wardrobe items | `src/player/cosmetics/Catalog.ts` |
| Trap chances, cooldown, weights, new traps | `src/trolls/TrapDirector.ts`, `src/trolls/TrapEffects.ts`, `src/trolls/Seagull.ts` |
| Wind strength | `src/trolls/windStrength.ts` |
| Control flips (timing, duration) | `src/trolls/ControlChaos.ts` |
| Taunts, fake achievements | `src/trolls/Taunts.ts` |
| Pause rules (Esc, RESUME dodging) | `src/core/pauseRules.ts` |
| Saving / Continue | `src/core/SaveSystem.ts` |
| Fake summits / asteroid ending | `src/sequences/SequenceDirector.ts` |
| Sounds and music (all generated) | `src/audio/Synth.ts` |
| Menus, HUD, role screen, wardrobe screen, credits | `src/ui/UIManager.ts` |
| Developer menu (local only) | `src/dev/DevMenu.ts` |
