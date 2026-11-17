# Waddle Up (web)

A browser remake of the Unity game **Waddle Up**: a clumsy penguin, a spiral mountain, random troll traps,
two fake endings and an asteroid. Built with **Three.js + Rapier physics + TypeScript + Vite**. PC only (keyboard + mouse).

## Run it on your computer

You need **Node.js** (already installed: v26). Open this folder in **VS Code**, then open the terminal
(**Ctrl + `**) and type:

```bash
npm install      # first time only (or after copying the folder to another PC)
npm run dev      # starts the game at http://localhost:5173
```

Open **http://localhost:5173** in Chrome or Edge. Keep the terminal open while you play.
Code changes reload the page automatically. Press **Ctrl + C** in the terminal to stop.

### Wardrobe
Main menu or pause menu → **WARDROBE**: colours, eyes, hats, outfits, extras and feet. All free, purely cosmetic, saved in the browser. Add new items in `src/player/cosmetics/Catalog.ts`.

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
npm test                          # unit tests: jumps unchanged, mountain safety rules, trap rules, saving, audio
node e2e/cdp.mjs e2e/summits.mjs  # browser checks (need `npm run dev` running and Microsoft Edge):
                                  #   bounce.mjs, traps.mjs, devmenu.mjs, summits.mjs, air-speed.mjs, look.mjs (screenshots)
```

## Deploying (later)

`dist/` is a plain static website. On Vercel: import the Git repo, framework preset **Vite**,
build command `npm run build`, output directory `dist`. (Netlify / GitHub Pages / Cloudflare Pages work the same way.)

## Where things are

| Want to change | File |
|---|---|
| Stage names, order, gimmicks, difficulty, colors | `src/core/StageData.ts` |
| Mountain shape, gaps, seed | `src/world/MountainData.ts` |
| Move speed / jump height | `MOVE_SPEED`, `JUMP_V` in `src/world/MountainData.ts` |
| Grip time, stun threshold, accelerations | `src/player/PenguinController.ts` |
| Trap chances, cooldown, weights | `src/trolls/TrapDirector.ts` |
| Control flips | `src/trolls/ControlChaos.ts` |
| Wind | `src/trolls/WindSystem.ts` |
| Taunts, fake achievements | `src/trolls/Taunts.ts` |
| Fake summits / asteroid ending | `src/sequences/SequenceDirector.ts` |
| Sounds and music (all generated) | `src/audio/Synth.ts` |
| Menus, HUD, credits | `src/ui/UIManager.ts` |
| Lighting, sky, fog, trees | `src/world/WorldDecor.ts` |
