// screenshots of the mountain from a few viewpoints. Needs `npm run dev`.
export default async function (t, name = 'look') {
  await t.goto('http://localhost:5173/');
  await t.sleep(9000);
  await t.shot(name + '-menu');
  const view = async (i, label) => {
    await t.eval(`(() => { const g = __wu; g.ui.enterGameplayUI(); g.state = 2; g.cam.mode = 0; const L = g.mountain.ledges, l = L[${i}];
      g.penguin.teleport(l.position.add({x:0,y:0.1,z:0}), Math.atan2(l.forward.x, l.forward.z) * 57.2958); g.cam.snapBehindTarget(); g.cam.pitch = 12; })()`);
    await t.sleep(1500); await t.shot(name + '-' + label);
  };
  await view(5, 'start'); await view(40, 'stage3'); await view(95, 'stage7');
  await t.eval(`(() => { const g = __wu; g.state = 1; g.cam.mode = 2; g.cam.setCutscene(new g.camera.position.constructor(150, 40, -120), new g.camera.position.constructor(0, 45, 0), 50); })()`);
  await t.sleep(1500); await t.shot(name + '-wide');
}
