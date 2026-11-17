export default async function (t) {
  await t.goto('http://localhost:5173/');
  await t.sleep(8000);
  await t.eval(`(() => { const g = __wu; g.state = 2; g.cam.mode = 0; const p = g.penguin;
    window.rec = []; const wd = p.wishDir.bind(p);
    p.wishDir = () => { const w = wd(); window._w = w; return w; };
    const fu = p.fixedUpdate.bind(p);
    p.fixedUpdate = () => { const ea = p.externalAccel.clone(), v0 = p.velocity; fu(); const v1 = p.velocity, w = window._w || {x:0,z:0};
      if (p.state === 1) rec.push({ h0: +Math.hypot(v0.x, v0.z).toFixed(2), h1: +Math.hypot(v1.x, v1.z).toFixed(2), w: +Math.hypot(w.x, w.z).toFixed(2), dot: +((v0.x*w.x+v0.z*w.z)/(Math.hypot(v0.x,v0.z)*Math.hypot(w.x,w.z)||1)).toFixed(2), ext: +Math.hypot(ea.x, ea.z).toFixed(2), gs: p.gravityScale, gust: +(g.scene && window.__gust || 0) }); };
    // log trap fires
    const tf = g.traps.fire.bind(g.traps); g.traps.fire = (type, l) => { console.log('TRAP', type, 'at ledge', l.index); tf(type, l); };
  })()`);
  for (const i of [15, 27, 40, 69, 90, 96, 103, 140, 180]) {
    await t.eval(`(() => { const g = __wu, L = g.mountain.ledges, a = L[${i}], b = L[${i} + 1];
      const d = b.position.clone().sub(a.position); d.y = 0; d.normalize();
      g.penguin.teleport(a.position.clone().addScaledVector(d, -0.6).add({x:0,y:0.1,z:0}), Math.atan2(d.x, d.z) * 180 / Math.PI); g.cam.snapBehindTarget(); })()`);
    await t.sleep(700); await t.eval('rec.length = 0');
    await t.key('KeyW', 'keyDown'); await t.sleep(400); await t.tap('Space'); await t.sleep(1600); await t.key('KeyW', 'keyUp');
    console.log('ledge', i, await t.eval(`rec.filter(r => r.h1 > 4.62).slice(0, 4).map(r => JSON.stringify(r)).join(' ; ') || 'normal'`));
  }
}
