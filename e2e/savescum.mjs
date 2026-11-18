// e2e: pausing mid-fall (or mid "back to the bottom") then Main Menu → Continue must NOT put you back where you were safe.
export default async function (t) {
  const box = async n => JSON.parse(await t.eval(`JSON.stringify(document.querySelector('[data-name="Btn_${n}"]')?.getBoundingClientRect() ?? null)`));
  const click = async n => { const b = await box(n); if (!b || !b.width) return false; await t.click(b.x + b.width / 2, b.y + b.height / 2); await t.sleep(300); return true; };
  const until = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await t.eval(expr)) return true; await t.sleep(250); } return false; };
  let fails = 0; const check = (ok, what) => { console.log(ok ? 'PASS' : 'FAIL', what); if (!ok) fails++; };
  const quitAndContinue = async () => {
    await t.tap('Escape'); await t.sleep(250);
    await click('MAIN MENU'); await t.sleep(800);
    await click('CONTINUE');
    await until('__wu.state === 2');
  };

  await t.goto('http://localhost:5173/'); await t.sleep(9000);
  await t.eval('__wu.newGame()'); await until('__wu.state === 2');
  await t.eval('__wu.traps.onLanded = () => {}');

  // 1) fall off a high ledge, pause mid-air, quit, continue
  await t.eval(`(() => { const g = __wu, l = g.mountain.ledges[60]; g.penguin.teleport(l.position.add({x:0,y:0.1,z:0}), 0); window._ly = l.position.y; })()`);
  await t.sleep(1500);                                        // land → this ledge becomes the "safe" spot
  await t.eval(`(() => { const g = __wu, p = g.penguin.position; const o = p.clone(); o.y = 0; o.normalize(); g.penguin.launch(o.multiplyScalar(5).add({x:0,y:2,z:0}), 0.3); })()`);
  await t.sleep(700);
  const midAir = await t.eval('__wu.penguin.state === 1');
  check(midAir, 'penguin is falling when the player pauses');
  await quitAndContinue();
  await t.sleep(2500);
  const y1 = await t.eval('__wu.penguin.position.y'), ly = await t.eval('window._ly');
  check(y1 < ly - 2, `after Continue the fall carries on (y ${y1.toFixed(1)}, ledge was ${ly.toFixed(1)})`);

  // 2) "back to the bottom" trap, pause during its fade, quit, continue
  await t.eval(`(() => { const g = __wu, l = g.mountain.ledges[60]; g.penguin.teleport(l.position.add({x:0,y:0.1,z:0}), 0); })()`);
  await t.sleep(1500);
  await t.eval(`__wu.sendToBottom('test')`);
  // a fast player: Esc and Main Menu straight away, inside the 0.45 s fade
  await t.tap('Escape'); await t.sleep(40);
  const clicked = await click('MAIN MENU'); await t.sleep(1200);
  check(clicked && await t.eval('__wu.state === 1'), 'reached the main menu during the fade');
  await click('CONTINUE'); await until('__wu.state === 2');
  await t.sleep(1500);
  const y2 = await t.eval('__wu.penguin.position.y');
  check(y2 < 3, `pausing during "back to the bottom" still sends you to the bottom (y ${y2.toFixed(1)})`);

  // 3) the fastest possible quit: pause + main menu in the same moment the trap starts
  await t.eval(`(() => { const g = __wu, l = g.mountain.ledges[60]; g.penguin.teleport(l.position.add({x:0,y:0.1,z:0}), 0); })()`);
  await t.sleep(1500);
  await t.eval(`(() => { __wu.sendToBottom('test'); __wu.setPaused(true); __wu.toMenu(); })()`);
  await t.sleep(1200);
  await click('CONTINUE'); await until('__wu.state === 2'); await t.sleep(1500);
  const y3 = await t.eval('__wu.penguin.position.y');
  check(y3 < 3, `instant quit during "back to the bottom" still sends you to the bottom (y ${y3.toFixed(1)})`);

  // 4) big fall → stunned on landing → instant quit: you stay where you landed
  await t.eval(`(() => { const g = __wu, l = g.mountain.ledges[60]; g.penguin.teleport(l.position.add({x:0,y:0.1,z:0}), 0); })()`);
  await t.sleep(1500);                                                   // safe spot = high ledge
  await t.eval(`__wu.penguin.teleport(new __wu.penguin.position.constructor(150, 24, 30), 0)`);  // drop from 24 m onto flat ground
  await until('__wu.penguin.state === 4', 6000);
  check(await t.eval('__wu.penguin.state === 4'), 'penguin is stunned after the big fall');
  await t.eval(`(() => { __wu.setPaused(true); __wu.toMenu(); })()`);
  await t.sleep(1200);
  await click('CONTINUE'); await until('__wu.state === 2'); await t.sleep(1000);
  const y4 = await t.eval('__wu.penguin.position.y');
  check(y4 < 3, `quitting while stunned keeps you where you landed (y ${y4.toFixed(1)})`);
  console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
}
