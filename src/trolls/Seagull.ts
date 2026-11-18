import * as THREE from 'three';
import { Time } from '../core/time.ts';
import { Loop } from '../core/loop.ts';
import { refs } from '../core/refs.ts';
import { UnityRandom } from '../core/rng.ts';
import { col, css, lookRotation, UP } from '../core/math.ts';
import { MeshBuilder, meshObject } from '../world/MeshKit.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { Effects } from '../world/Effects.ts';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function buildGull() {
  const root = new THREE.Group();
  root.name = 'Seagull';
  const body = new MeshBuilder();
  body.sphere(V(), V(0.22, 0.2, 0.55), col(0.97, 0.97, 0.97), 8, 5);
  body.sphere(V(0, 0.12, 0.45), V(0.15, 0.14, 0.16), col(0.97, 0.97, 0.97), 7, 4);
  body.coneAxis(V(0, 0.1, 0.6), V(0, -0.1, 1), 0.05, 0.22, col(1, 0.75, 0.1), 5);
  body.sphere(V(0.08, 0.17, 0.55), V(0.025, 0.025, 0.025), col(0, 0, 0), 4, 3);
  body.sphere(V(-0.08, 0.17, 0.55), V(0.025, 0.025, 0.025), col(0, 0, 0), 4, 3);
  body.coneAxis(V(0, 0, -0.45), V(0, 0, -1), 0.14, 0.3, col(0.6, 0.62, 0.66), 4);
  meshObject('Body', body.build(), root);
  const wing = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.18 * side, 0.08, 0.05);
    const w = new MeshBuilder();
    w.box(V(0.55 * side, 0, 0), V(1.1, 0.05, 0.42), col(0.62, 0.64, 0.68), col(0.72, 0.74, 0.78));
    w.box(V(1.05 * side, 0, -0.05), V(0.2, 0.06, 0.3), col(0.15, 0.15, 0.18), col(0.2, 0.2, 0.22));
    meshObject('Wing', w.build(), pivot);
    root.add(pivot);
    return pivot;
  };
  return { root, left: wing(1), right: wing(-1) };
}

/**
 * Seagull trap: a screech, then the bird swoops in from the side of the path and knocks the penguin.
 * Fair: you hear it ~0.8 s before it arrives and can see it coming. If you're hanging, it misses.
 */
export function seagullAttack(scene: THREE.Scene) {
  const pc = refs.penguin;
  if (!pc) return;
  AudioManager.play('squawk', 0.9, 1.7);
  refs.ui?.toast('SKREEEE!', css(1, 1, 1), 0.9);

  const g = buildGull();
  scene.add(g.root);
  const target = () => pc.position.add(V(0, 0.7, 0));
  const outward = pc.position.clone(); outward.y = 0;
  if (outward.lengthSq() < 0.01) outward.set(1, 0, 0);
  outward.normalize();
  const side = new THREE.Vector3().crossVectors(UP, outward).multiplyScalar(UnityRandom.value() < 0.5 ? 1 : -1);
  const start = target().addScaledVector(outward, 10).addScaledVector(side, 9).add(V(0, 5, 0));
  g.root.position.copy(start);

  const born = Time.time;
  const arrive = 1.0;       // seconds from screech to impact
  let hit = false;
  let vel = new THREE.Vector3();
  const beh = Loop.add({
    update() {
      const t = Time.time - born;
      const flap = Math.sin(Time.time * (hit ? 14 : 22)) * 0.7;
      g.left.rotation.z = flap; g.right.rotation.z = -flap;
      if (!hit) {
        const k = Math.min(1, t / arrive);
        const tgt = target();
        // swoop: ease toward the penguin with a dip
        const p = new THREE.Vector3().lerpVectors(start, tgt, k * k * (3 - 2 * k)).add(V(0, Math.sin(k * Math.PI) * 1.5, 0));
        vel = p.clone().sub(g.root.position).divideScalar(Math.max(1e-3, Time.deltaTime));
        g.root.position.copy(p);
        if (vel.lengthSq() > 0.01) g.root.quaternion.copy(lookRotation(vel, UP));
        if (k >= 1) {
          hit = true;
          if (!pc.hanging && !pc.locked) {
            const push = vel.clone(); push.y = 0;
            if (push.lengthSq() < 0.01) push.copy(side);
            pc.knockback(push.normalize().multiplyScalar(3.6).add(V(0, 3.6, 0)), 0.2);
            AudioManager.play('bonk', 0.9);
            AudioManager.play('squawk', 0.7);
            Effects.sparkle(tgt, col(1, 1, 1), 24);
            refs.ui?.taunt('The seagull says hi.');
            refs.traps?.registerExternalTrap('seagull');
          } else refs.ui?.taunt('It missed. This time.');
          vel.y = Math.max(vel.y, 2).valueOf();
          vel.add(V(0, 6, 0));
        }
      } else {
        g.root.position.addScaledVector(vel.clone().setLength(9), Time.deltaTime);
        if (Time.time - born > arrive + 2.5) { g.root.removeFromParent(); Loop.remove(beh); }
      }
    },
  });
}
