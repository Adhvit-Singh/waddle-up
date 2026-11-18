// e2e: role select on New Game; role locked in save + HUD; Continue keeps it; Give Up asks again; role effects measurable.
export default async function (t) {
  const box = async sel => JSON.parse(await t.eval(`JSON.stringify(document.querySelector('${sel}')?.getBoundingClientRect() ?? null)`));
  const click = async sel => { const b = await box(sel); if (!b || !b.width) return false; await t.click(b.x + b.width / 2, b.y + b.height / 2); await t.sleep(300); return true; };
  let fails = 0; const check = (ok, what) => { console.log(ok ? 'PASS' : 'FAIL', what); if (!ok) fails++; };
  const until = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await t.eval(expr)) return true; await t.sleep(300); } return false; };
  const startAs = async (id) => {
    if (!(await box('[data-name="RoleSelect"]'))?.width) { await click('[data-name="Btn_NEW GAME"]'); await click('[data-name="Btn_YES"]'); }
    check(!!(await box(`[data-name="Role_${id}"]`))?.width, `role screen shows the ${id} card`);
    await click(`[data-name="Role_${id}"]`); await click('[data-name="Btn_START CLIMB"]');
    check(await until('__wu.state === 2'), `game starts as ${id}`);
    await t.eval(`__wu.traps.onLanded = () => {}`);
  };
  const flatSpeed = async () => {
    await t.eval(`(() => { const g = __wu; g.penguin.teleport(new g.penguin.position.constructor(150, 0.5, 30), 0); g.cam.snapBehindTarget(); })()`);
    await t.sleep(800);
    await t.key('KeyW', 'keyDown'); await t.sleep(1300);
    const v = await t.eval('Math.hypot(__wu.penguin.velocity.x, __wu.penguin.velocity.z)');
    await t.key('KeyW', 'keyUp'); await t.sleep(500);
    return v;
  };

  await t.goto('http://localhost:5173/'); await t.sleep(9000);
  await click('[data-name="Btn_NEW GAME"]'); await click('[data-name="Btn_YES"]');
  check(await t.eval(`document.querySelectorAll('[data-name^="Role_"]').length === 8`), 'New Game shows 8 role cards');
  await t.shot('roles-select');
  await startAs('old');
  check(await until(`document.querySelector('[data-name="Role"]').innerText.includes('Old Penguin')`, 5000), 'HUD shows the role');
  check(await t.eval(`JSON.parse(localStorage.getItem('wu_save_v1')).role === 'old'`), 'the role is saved with the run');
  const vOld = await flatSpeed();
  check(Math.abs(vOld - 4.6 * 0.8) < 0.15, `Old Penguin walks 20% slower (${vOld.toFixed(2)} m/s)`);

  // give up → asked again
  await t.tap('Escape'); await t.sleep(300);
  await click('[data-name="Btn_GIVE UP (RESTART)"]'); await click('[data-name="Btn_YES"]');
  check(!!(await box('[data-name="RoleSelect"]'))?.width, 'Give Up asks for a role again');
  await startAs('squirrel');
  const vSq = await flatSpeed();
  check(Math.abs(vSq - 4.6 * 1.15) < 0.2, `Squirrel is 15% faster (${vSq.toFixed(2)} m/s)`);
  const p0 = await t.eval('JSON.stringify(__wu.penguin.position)');
  await t.sleep(3500);
  check((await t.eval('JSON.stringify(__wu.penguin.position)')) !== p0, 'Squirrel wanders off when left idle');

  // continue keeps the role
  await t.goto('http://localhost:5173/'); await t.sleep(9000);
  await click('[data-name="Btn_CONTINUE"]');
  // wait for the HUD to redraw after resuming (it updates on the next frame)
  check(await until('__wu.state === 2') && await until(`document.querySelector('[data-name="Role"]').innerText.includes('Squirrel')`, 5000), 'Continue keeps the run\'s role');

  // ghost is see-through
  await t.tap('Escape'); await t.sleep(300);
  await click('[data-name="Btn_GIVE UP (RESTART)"]'); await click('[data-name="Btn_YES"]');
  await startAs('ghost');
  check(await t.eval(`(() => { let tr = 0; __wu.penguin.object.traverse(o => { if (o.isMesh && o.material.transparent) tr++; }); return tr > 5; })()`), 'Ghost Penguin is see-through');
  await t.sleep(800); await t.shot('roles-ghost');
  console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
}
