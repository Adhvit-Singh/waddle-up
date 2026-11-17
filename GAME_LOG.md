# WADDLE UP WEB — Build Log

> A living document, updated after every chunk of work. Newest entries are at the bottom.

## What this is
A web remake of the Unity game **Waddle Up** (penguin rage-climber), so friends can play it from a link.
No Unity. Stack: **Three.js + Rapier physics + TypeScript + Vite**. PC only (keyboard + mouse).
Faithful port, bugs included. Deploy only after a local test.

Full design: [`docs/2026-11-17-waddle-up-web-design.md`](docs/2026-11-17-waddle-up-web-design.md)

## How to run locally (after setup)
1. Open `D:\waddle-up-web` in VS Code.
2. Terminal: `npm install` (first time only), then `npm run dev`.
3. Open http://localhost:5173 in Chrome.

## Progress log
- **2026-11-17**: Interview done. Stack chosen (Three.js + Rapier + TS + Vite). Folder `D:\waddle-up-web` created.
  Design doc written. Waiting for the user's approval of the package installs.
- **2026-11-17**: Approved packages installed in `D:\waddle-up-web\node_modules` (three 0.187.0, @dimforge/rapier3d-compat 0.21.0,
  vite 8.3.8, typescript 7.0.2, @types/three 0.187.0). The npm download cache is kept on D: too (`.npm-cache`, set via `.npmrc`).
  Git repo initialised. Read all 23 Unity scripts (~5,100 lines) and wrote the build plan:
  `docs/superpowers/plans/2026-11-17-waddle-up-web-port.md` (8 tasks).
