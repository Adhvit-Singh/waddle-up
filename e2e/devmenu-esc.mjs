// e2e: Esc while the F10 menu is open closes the menu and pauses normally. Needs `npm run dev`.
export default async function (t) {
  await t.goto('http://localhost:5173/');
  await t.sleep(9000);
  await t.eval('__wu.newGame()'); await t.sleep(3000);
  await t.tap('F10'); await t.sleep(300);
  await t.tap('Escape'); await t.sleep(400);
  const ok = await t.eval(`getComputedStyle(document.getElementById('devmenu')).display === 'none' && __wu.holdUnlocked === false && __wu.state === 3`);
  console.log(ok ? 'PASS' : 'FAIL', 'Esc with the dev menu open closes it and pauses normally');
}
