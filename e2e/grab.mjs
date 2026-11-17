// e2e: normal wall grab still works; a grab "4 ledges ahead" of the last ledge stood on is refused. Needs `npm run dev`.
export default async function (t) {
  await t.goto('http://localhost:5173/');
  await t.sleep(9000);
  await t.eval(`(() => { const g = __wu; g.ui.enterGameplayUI(); g.state = 2; g.cam.mode = 0; g.traps.trapsFired = 0; g.traps.onLanded = () => {}; })()`);
  const attempt = async (pretendBehind) => {
    await t.eval(`(() => { const g = __wu, L = g.mountain.ledges; const i = L.findIndex(l => l.kind === 2 && l.stage === 2);
      const a = L[i-1], b = L[i]; const d = b.position.clone().sub(a.position); d.y = 0; d.normalize();
      g.penguin.teleport(a.position.clone().add({x:0,y:0.1,z:0}), Math.atan2(d.x, d.z) * 180 / Math.PI); g.cam.snapBehindTarget(); window._wall = i; })()`);
    await t.sleep(700);
    await t.key('KeyW', 'keyDown'); await t.sleep(250); await t.key('Space', 'keyDown'); await t.sleep(30); await t.key('Space', 'keyUp');
    // once airborne, pretend the last ledge we stood on was 4 behind the wall
    if (pretendBehind) { for (let k = 0; k < 20 && (await t.eval('__wu.penguin.state')) !== 1; k++) await t.sleep(10); await t.eval(`__wu.penguin.lastStoodIndex = window._wall - 4`); }
    await t.sleep(170); await t.key('KeyW', 'keyUp');
    let grabbed = false;
    for (let k = 0; k < 40; k++) { await t.sleep(30); if ((await t.eval('__wu.penguin.state')) >= 2) { grabbed = true; break; } }
    await t.sleep(4000);
    return grabbed;
  };
  const normal = await attempt(false);
  console.log(normal ? 'PASS' : 'FAIL', 'normal wall grab still works');
  const skip = await attempt(true);
  console.log(!skip ? 'PASS' : 'FAIL', 'grab 4 ledges ahead is refused');
}
