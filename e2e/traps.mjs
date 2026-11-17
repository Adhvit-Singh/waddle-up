// e2e: force-fire every trap type on a stage-10 ledge; no page exceptions, penguin stays valid. Needs `npm run dev`.
const TYPES = ['Crumble', 'Sneeze', 'Achievement', 'Gust', 'Ice', 'Shy', 'Bounce', 'Snowball', 'CameraFlip', 'Gravity', 'Blackout', 'Trapdoor',
  'Seagull', 'FallThrough', 'Tilt', 'SlipGrab', 'CameraTroll', 'InputDelay', 'FakeCrash', 'FakeSave'];
const SHOTS = { Seagull: 900, FallThrough: 0, Tilt: 900, CameraTroll: 800, FakeCrash: 1000, FakeSave: 900 };
export default async function (t) {
  await t.goto('http://localhost:5173/');
  await t.sleep(8000);
  await t.eval(`(() => { const g = __wu; g.state = 2; g.cam.mode = 0; g.data.tiersRevealed = 1; g.mountain.setTierActive(1, true); g.mountain.syncTier(1); })()`);
  let bad = 0;
  for (const type of TYPES) {
    await t.eval(`(() => { const g = __wu, L = g.mountain.ledges; const l = L.find(x => x.stage === 9 && x.kind === 0 && L[x.index+1].kind === 0);
      g.penguin.teleport(l.position.add({x:0,y:0.1,z:0}), Math.atan2(l.forward.x, l.forward.z) * 57.2958); g.currentStage = 9; g.cam.snapBehindTarget(); window._l = l; })()`);
    await t.sleep(600);
    const before = t.logs.length;
    await t.eval(`__wu.traps.forceFire('${type}', window._l)`);
    if (type in SHOTS) { await t.sleep(SHOTS[type]); await t.shot('trap-' + type); }
    await t.sleep(3200);
    const st = JSON.parse(await t.eval(`JSON.stringify({ s: __wu.penguin.state, y: __wu.penguin.position.y, ts: (window.Time ?? null), ok: Number.isFinite(__wu.penguin.position.y) })`));
    const errs = t.logs.slice(before).filter(l => l.startsWith('[exception]') || l.startsWith('[error]'));
    const ok = st.ok && errs.length === 0;
    if (!ok) bad++;
    console.log(ok ? 'PASS' : 'FAIL', type.padEnd(12), 'state', st.s, 'y', st.y.toFixed(1), errs.join(' | '));
  }
  console.log(bad === 0 ? 'ALL PASS' : `${bad} FAILED`);
}
