// e2e: F10 dev menu (dev server only) jumps to stage 15. Needs `npm run dev`.
export default async function (t) {
  await t.goto('http://localhost:5173/');
  await t.sleep(9000);
  const box = async n => JSON.parse(await t.eval(`JSON.stringify(document.querySelector('[data-name="Btn_${n}"]').getBoundingClientRect())`));
  let b = await box('NEW GAME'); await t.click(b.x + b.width / 2, b.y + b.height / 2); await t.sleep(600);
  b = await box('YES'); if (b.width) await t.click(b.x + b.width / 2, b.y + b.height / 2);
  await t.sleep(3000);
  await t.key('F10', 'keyDown'); await t.key('F10', 'keyUp'); await t.sleep(300);
  const open = await t.eval(`getComputedStyle(document.getElementById('devmenu')).display`);
  const stillPlaying = await t.eval('__wu.state === 2 && __wu.holdUnlocked === true');
  console.log(stillPlaying ? 'PASS' : 'FAIL', 'opening F10 does not pause (game keeps running, mouse held free)');
  const p = JSON.parse(await t.eval(`JSON.stringify([...document.querySelectorAll('#devmenu button')].find(x => x.textContent === '15').getBoundingClientRect())`));
  await t.click(p.x + p.width / 2, p.y + p.height / 2);
  await t.sleep(1500);
  const hud = await t.eval(`document.querySelector('[data-name="Stage"]').innerText`);
  await t.shot('devmenu-stage15');
  const closed = await t.eval(`getComputedStyle(document.getElementById('devmenu')).display === 'none' && __wu.holdUnlocked === false && __wu.state === 2`);
  console.log(closed ? 'PASS' : 'FAIL', 'picking a stage closes the menu and returns to normal play');
  const ok = open === 'block' && hud.includes('STAGE 15') && await t.eval('__wu.data.devUsed === true');
  console.log(ok ? 'PASS' : 'FAIL', 'menu', open, '| HUD:', hud.replace(/\n/g, ' '));
}

