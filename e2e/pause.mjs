// e2e: Esc pauses; Esc again does NOT resume; RESUME dodges 4–7 times, then a click resumes. Needs `npm run dev`.
export default async function (t) {
  const box = async n => JSON.parse(await t.eval(`JSON.stringify(document.querySelector('[data-name="Btn_${n}"]').getBoundingClientRect())`));
  const check = (ok, what) => console.log(ok ? 'PASS' : 'FAIL', what);
  await t.goto('http://localhost:5173/');
  await t.sleep(9000);
  await t.eval('__wu.newGame()');
  await t.sleep(3000);
  await t.tap('Escape'); await t.sleep(300);
  check(await t.eval('__wu.state === 3'), 'Esc pauses');
  await t.tap('Escape'); await t.sleep(300);
  check(await t.eval('__wu.state === 3'), 'second Esc does not resume');
  let dodges = 0;
  for (let k = 0; k < 12; k++) {
    const b = await box('RESUME');
    const before = `${b.x},${b.y}`;
    await t.move(5, 5); await t.sleep(50);
    await t.move(b.x + b.width / 2, b.y + b.height / 2); await t.sleep(120);
    const a = await box('RESUME');
    if (`${a.x},${a.y}` !== before) { dodges++; continue; }
    await t.click(a.x + a.width / 2, a.y + a.height / 2); await t.sleep(400);
    break;
  }
  await t.shot('pause-dodge');
  check(dodges >= 4 && dodges <= 7, `RESUME dodged ${dodges} times before it could be clicked`);
  check(await t.eval('__wu.state === 2'), 'clicking RESUME resumes');
}
