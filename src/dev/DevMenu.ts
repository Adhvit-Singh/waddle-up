// DEV MENU — loaded only by `npm run dev` (see main.ts). Vite removes it from `npm run build`, so the deployed game
// has no way to skip stages. Press F10 to toggle.
import * as THREE from 'three';
import { LedgeKind } from '../core/StageData.ts';
import { yawOf } from '../core/math.ts';
import type { Game } from '../core/Game.ts';
import { Input } from '../core/Input.ts';
import type { TrapType } from '../trolls/TrapDirector.ts';

const TRAPS: TrapType[] = ['Crumble', 'Sneeze', 'Achievement', 'Gust', 'Ice', 'Shy', 'Bounce', 'Snowball', 'CameraFlip', 'Gravity', 'Blackout', 'Trapdoor',
  'Seagull', 'FallThrough', 'Tilt', 'SlipGrab', 'CameraTroll', 'InputDelay', 'FakeCrash', 'FakeSave'];

export function installDevMenu(g: Game) {
  const el = document.createElement('div');
  el.id = 'devmenu';
  el.style.cssText = 'position:fixed;right:12px;top:12px;z-index:200;background:rgba(10,14,30,.92);color:#fff;font:13px system-ui;padding:10px;border:2px solid #f80;border-radius:8px;max-width:420px;display:none';
  el.innerHTML = '<b>DEV MENU</b> (local only · F10)<br><br>Go to stage:<br>';
  const btn = (label: string, f: () => void) => { const b = document.createElement('button'); b.textContent = label; b.style.margin = '2px'; b.onclick = e => { e.stopPropagation(); f(); }; el.appendChild(b); };
  // open: the game keeps running and the mouse is free (no pause). Picking something closes it and recaptures the mouse.
  const setOpen = (open: boolean) => {
    el.style.display = open ? 'block' : 'none';
    g.holdUnlocked = open;
    if (open) Input.unlockPointer(); else if (g.state === 2) Input.lockPointer();
  };
  for (let s = 0; s < 20; s++) btn(String(s + 1), () => { devGotoStage(g, s); setOpen(false); });
  el.appendChild(document.createElement('br')); el.appendChild(document.createTextNode('Fire trap here:')); el.appendChild(document.createElement('br'));
  for (const t of TRAPS) btn(t, () => { const l = g.penguin.groundLedge; if (l) g.traps.forceFire(t, l); setOpen(false); });
  document.body.appendChild(el);
  addEventListener('keydown', e => {
    // F8: start of the next stage · F9: last ledge before the current summit
    if (e.code === 'F8') { e.preventDefault(); devGotoStage(g, g.currentStage + 1); return; }
    if (e.code === 'F9' && g.state === 2) {
      e.preventDefault();
      const t = g.mountain.tiers[Math.min(g.data.tiersRevealed, 2)];
      const l = [...g.mountain.ledges].reverse().find(x => x.stage === t.lastStage)!;
      g.data.devUsed = true;
      g.penguin.teleport(l.position.add(new THREE.Vector3(0, 0.2, 0)), yawOf(l.forward));
      g.cam.snapBehindTarget();
      return;
    }
    if (e.code === 'Escape' && el.style.display !== 'none') { setOpen(false); return; }   // Esc: close the dev menu, game then pauses as usual
    if (e.code !== 'F10') return;
    e.preventDefault();
    if (g.state !== 2 && el.style.display === 'none') return;   // only during play
    setOpen(el.style.display === 'none');
  });
}

/** teleport to a stage's start platform, revealing the tiers it needs (marks the run as dev-touched: no best time) */
export function devGotoStage(g: Game, stage: number) {
  if (g.state !== 2 || stage < 0 || stage > 19) return;
  const rest = g.mountain.ledges.find(l => l.stage === stage && l.kind === LedgeKind.Rest);
  if (!rest) return;
  const tier = g.mountain.tiers.findIndex(t => t.root === rest.root);
  for (let t = 1; t <= tier; t++) if (!g.mountain.isTierActive(t)) g.revealInstant(t);
  g.data.tiersRevealed = Math.max(g.data.tiersRevealed, tier);
  g.data.devUsed = true;
  g.penguin.teleport(rest.position.add(new THREE.Vector3(0, 0.2, 0)), yawOf(rest.forward));
  g.currentStage = stage;
  g.cam.snapBehindTarget();
}
