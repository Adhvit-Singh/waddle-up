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

Dev-only cheat keys (they only exist in `npm run dev`, never in the deployed game):
**F8** = jump to the next stage, **F9** = jump to the last ledge before the current summit.

## Check the real (deployable) version

```bash
npm run build    # type-checks, then writes the finished game to dist/
npm run preview  # serves dist/ at http://localhost:4173 (what friends will get)
```

## Tests

```bash
npm test         # mountain matches Unity, RNG matches .NET, saving, trap rules, audio
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
