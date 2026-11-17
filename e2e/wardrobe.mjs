// e2e: wardrobe from the menu and from pause; every tab works; randomise/reset; the outfit survives a reload. Needs `npm run dev`.
export default async function (t) {
  const box = async sel => JSON.parse(await t.eval(`JSON.stringify(document.querySelector('${sel}')?.getBoundingClientRect() ?? null)`));
  const click = async sel => { await t.eval(`document.querySelector('${sel}')?.scrollIntoView({ block: 'center' })`); await t.sleep(100); const b = await box(sel); if (!b || !b.width) return false; await t.click(b.x + b.width / 2, b.y + b.height / 2); await t.sleep(250); return true; };
  let fails = 0; const check = (ok, what) => { console.log(ok ? 'PASS' : 'FAIL', what); if (!ok) fails++; };
  await t.goto('http://localhost:5173/'); await t.sleep(9000);
  await t.eval("localStorage.removeItem('wu_outfit')");
  check(await click('[data-name="Btn_WARDROBE"]'), 'menu has a WARDROBE button');
  await t.sleep(1500);
  check(await t.eval('__wu.cam.mode === 3'), 'camera moves to the wardrobe orbit');
  const picks = { body: 'galaxy', eyes: 'cyclops', hat: 'traffic-cone', outfit: 'tuxedo', accessory: 'toaster', feet: 'clown-shoes' };
  for (const [tab, id] of Object.entries(picks)) {
    await click(`[data-name="Tab_${tab}"]`);
    const ok = await click(`[data-name="Item_${id}"]`);
    check(ok && await t.eval(`__wu.outfit.${tab} === '${id}'`), `pick ${tab}: ${id}`);
  }
  await t.sleep(1500); await t.shot('wardrobe-outfit');
  await click('[data-name="Btn_RANDOMISE"]'); await t.sleep(800); await t.shot('wardrobe-random');
  const rnd = await t.eval('JSON.stringify(__wu.outfit)');
  check(rnd !== JSON.stringify(picks), 'randomise changes the outfit');
  await click('[data-name="Btn_RESET"]');
  check(await t.eval("__wu.outfit.hat === 'beanie' && __wu.outfit.body === 'classic'"), 'reset gives the classic penguin back');
  await click('[data-name="Tab_hat"]'); await click('[data-name="Item_wizard"]');
  await t.tap('Escape'); await t.sleep(600);
  check(await t.eval('__wu.cam.mode === 1'), 'Esc closes the wardrobe back to the menu');
  await t.goto('http://localhost:5173/'); await t.sleep(9000);
  check(await t.eval("__wu.outfit.hat === 'wizard'"), 'the outfit is remembered after a reload');
  await t.eval('__wu.newGame()'); await t.sleep(3000);
  await t.tap('Escape'); await t.sleep(400);
  check(await click('[data-name="Pause"] [data-name="Btn_WARDROBE"]') || await click('[data-name="Btn_WARDROBE"]'), 'pause menu has a WARDROBE button');
  await t.sleep(1500); await t.shot('wardrobe-pause');
  await click('[data-name="Wardrobe"] [data-name="Btn_BACK"]');
  check(await t.eval('__wu.state === 3 && __wu.cam.mode === 0'), 'BACK returns to the pause menu, game still paused');
  console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
}
