import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './core/Game.ts';

function isPhoneOnly() {
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
}

async function boot() {
  if (isPhoneOnly()) { (document.getElementById('mobile') as HTMLElement).style.display = 'flex'; return; }
  await RAPIER.init();
  const game = new Game(document.getElementById('game') as HTMLCanvasElement);
  game.init();
  document.getElementById('loading')?.remove();
  game.start();
  if (import.meta.env.DEV) {
    (window as unknown as { __wu: Game }).__wu = game;
    import('./dev/DevMenu.ts').then(m => m.installDevMenu(game));
  }
}
boot();
