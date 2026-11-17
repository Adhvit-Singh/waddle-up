// e2e: if the camera is squeezed against the mountain, it swings outward instead of staying jammed close. Needs `npm run dev`.
export default async function (t) {
  await t.goto('http://localhost:5173/');
  await t.sleep(9000);
  // ray from camera to penguin's head through the game's own physics (ignores the penguin)
  await t.eval(`window.__wuRay = (c, d) => { const len = d.length(); const h = __wu.cam && window.__wuPhys(c, d, len); return h; }`);
  await t.eval(`(() => { const g = __wu; g.ui.enterGameplayUI(); g.state = 2; g.cam.mode = 0; g.traps.onLanded = () => {}; })()`);
  let fails = 0;
  for (const i of [20, 60, 130, 200]) {
    await t.eval(`(() => { const g = __wu, l = g.mountain.ledges[${i}];
      for (let k = 1; k < 3; k++) if (g.mountain.tiers.findIndex(t => t.root === l.root) >= k) { g.revealInstant(k); g.data.tiersRevealed = k; }
      g.penguin.teleport(l.position.add({x:0,y:0.1,z:0}), 0); g.cam.snapBehindTarget();
      const o = l.position; o.y = 0; o.normalize();
      g.cam.yaw = Math.atan2(o.x, o.z) * 57.29578;   // camera behind the penguin = inside the mountain
      g.cam.pitch = 10; })()`);
    await t.sleep(2500);
    const r = JSON.parse(await t.eval(`(() => { const g = __wu, c = g.camera.position, p = g.penguin.object.position;
      const head = p.clone().add({x:0,y:1,z:0}); const d = head.clone().sub(c);
      const block = g.penguin && window.__wu ? null : null;
      return JSON.stringify({ dist: c.distanceTo(head), clear: !__wuRay(c, d) }); })()`));
    const ok = r.dist > 4 && r.clear;
    if (!ok) fails++;
    console.log(ok ? 'PASS' : 'FAIL', `ledge ${i}: camera ${r.dist.toFixed(1)} m from penguin, view ${r.clear ? 'clear' : 'BLOCKED by rock'}`);
    if (i === 60) await t.shot('camera-swing');
  }
  console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
}
