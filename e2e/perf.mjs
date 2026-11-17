// rough frame timing + scene stats (headless uses a software GPU, so compare runs, not absolute numbers)
export default async function (t) {
  await t.goto('http://localhost:5173/');
  await t.sleep(9000);
  const r = await t.eval(`new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 90) requestAnimationFrame(f); else res(JSON.stringify({ avgMs: +((performance.now() - t0) / n).toFixed(1), pines: __wu.mountain.pineCounts, drawCalls: __wu.renderer.info.render.calls, tris: __wu.renderer.info.render.triangles })); }; requestAnimationFrame(f); })`);
  console.log('menu orbit:', r);
}
