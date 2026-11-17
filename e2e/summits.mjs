// e2e: menu → new game → fake summit 1 → fake summit 2 → asteroid ending → stats → credits → menu.
// Waits on game state (not fixed sleeps), so it works on slow software rendering too. Needs `npm run dev`.
export default async function (t) {
  const until = async (expr, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await t.eval(expr)) return true; await t.sleep(400); } return false; };
  const box = async n => JSON.parse(await t.eval(`JSON.stringify(document.querySelector('[data-name="Btn_${n}"]').getBoundingClientRect())`));
  const click = async n => { const b = await box(n); await t.click(b.x + b.width / 2, b.y + b.height / 2); };
  let fails = 0;
  const check = (ok, what) => { console.log(ok ? 'PASS' : 'FAIL', what); if (!ok) fails++; };

  await t.goto('http://localhost:5173/');
  await t.sleep(9000);
  await click('NEW GAME'); await t.sleep(600);
  if ((await box('YES')).width) await click('YES');
  check(await until('__wu.state === 2', 20000), 'new game starts');

  for (const i of [0, 1]) {
    await t.eval(`(() => { const g = __wu, tr = g.mountain.tiers[${i}]; const o = tr.flagPos.clone(); o.y = 0; o.normalize();
      g.penguin.teleport(tr.flagPos.clone().addScaledVector(o, -2).add({x:0,y:0.3,z:0}), 0); })()`);
    check(await until('__wu.state === 4', 15000), `fake summit ${i + 1} starts`);
    if (i === 0) { await until(`document.querySelector('[data-name="Nope"]')?.innerText.includes('NOPE')`, 30000); await t.shot('summit-nope'); }
    check(await until(`__wu.data.tiersRevealed === ${i + 1} && __wu.state === 2`, 120000), `tier ${i + 2} rose and play resumed`);
    const y = await t.eval(`__wu.mountain.tiers[${i + 1}].root.position.y`);
    check(Math.abs(y) < 1e-6, `tier ${i + 2} (with its pines/crags) settled at its final height`);
    await t.shot(`summit-after-${i + 1}`);
  }
  await t.eval(`(() => { const g = __wu, tr = g.mountain.tiers[2]; g.penguin.teleport(tr.flagPos.clone().add({x:1.5,y:0.3,z:0}), 0); })()`);
  check(await until('__wu.state === 5', 15000), 'real summit → ending starts');
  check(await until(`!!document.querySelector('[data-name="Btn_ROLL CREDITS"]')?.getBoundingClientRect().width`, 150000), 'stats screen after the asteroid');
  await t.shot('summit-stats');
  check(await t.eval('localStorage.getItem("wu_save_v1") === null'), 'run save cleared after the ending');
  check(await t.eval('JSON.parse(localStorage.getItem("wu_lasttraps") || "null") !== null'), "this game's traps remembered for the next game");
  await click('ROLL CREDITS'); await t.sleep(2000);
  await t.tap('Escape');
  check(await until('__wu.state === 1', 15000), 'back to the menu');
  console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
}
