// e2e: a bouncy (pink) ledge must throw the penguin upward. Run: node e2e/cdp.mjs e2e/bounce.mjs (needs `npm run dev`)
export default async function (t) {
  await t.goto('http://localhost:5173/');
  await t.sleep(8000);
  await t.eval(`(() => { const g = __wu; g.state = 2; g.cam.mode = 0; for (let i = 1; i < 3; i++) g.mountain.setTierActive(i, true);
    g.data.tiersRevealed = 2;
    const l = g.mountain.ledges.find(l => l.kind === 9); window.maxVy = -99; window.landed = false;
    const as = g.penguin.afterStep.bind(g.penguin);
    g.penguin.afterStep = () => { as(); if (g.penguin.position.y < l.position.y + 0.2) landed = true; if (landed) maxVy = Math.max(maxVy, g.penguin.velocity.y); };
    g.penguin.teleport(l.position.clone().add({x:0,y:1.5,z:0}), 0); })()`);
  await t.sleep(2500);
  const vy = await t.eval('maxVy');
  console.log(vy > 9 ? 'PASS' : 'FAIL', 'bounce: max upward speed after landing =', vy);
}
