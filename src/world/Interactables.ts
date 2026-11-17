import * as THREE from 'three';
import { Time } from '../core/time.ts';
import { Loop } from '../core/loop.ts';
import { Scheduler, type Co } from '../core/coroutines.ts';
import { refs } from '../core/refs.ts';
import { UnityRandom } from '../core/rng.ts';
import { col, css } from '../core/math.ts';
import { Physics, RAPIER } from '../physics/Physics.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { Effects } from './Effects.ts';
import { MeshBuilder, meshObject } from './MeshKit.ts';

const PENGUIN_R = 0.34, PENGUIN_MID = 0.56;

/** Trigger helper: sphere trigger vs the penguin capsule (approximated by its middle), with enter edge detection. */
function penguinInside(center: THREE.Vector3, radius: number) {
  const pc = refs.penguin;
  if (!pc) return false;
  const p = pc.object.position.clone();
  // closest point on the capsule segment to the trigger center
  const y = Math.min(Math.max(center.y, p.y + PENGUIN_R), p.y + 1.12 - PENGUIN_R);
  return center.distanceTo(new THREE.Vector3(p.x, y, p.z)) < radius + PENGUIN_R || center.distanceTo(p.clone().setY(p.y + PENGUIN_MID)) < radius;
}

/** A checkpoint flag that is not a checkpoint. Some are spring-loaded. */
export class FakeCheckpoint {
  stage: number;
  private flag: THREE.Object3D;
  private lastTrigger = -999;
  private inside = false;

  constructor(flag: THREE.Object3D, stage: number) {
    this.flag = flag; this.stage = stage;
    Loop.add(this);
  }

  update() {
    if (!this.flag.parent?.visible) { this.inside = false; return; }
    const c = this.flag.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.8, 0));
    const now = penguinInside(c, 1.1);
    if (now && !this.inside) this.onTriggerEnter();
    this.inside = now;
  }

  private onTriggerEnter() {
    const p = refs.penguin;
    if (!p || Time.time - this.lastTrigger < 20) return;
    this.lastTrigger = Time.time;
    const spring = this.stage >= 4 && UnityRandom.value() < 0.25;
    Scheduler.start(this, this.routine(spring));
  }

  private *routine(spring: boolean): Co {
    const pos = this.flag.getWorldPosition(new THREE.Vector3());
    AudioManager.play('checkpoint');
    Effects.sparkle(pos.clone().add(new THREE.Vector3(0, 2, 0)), col(0.4, 1, 0.5), 40);
    refs.ui?.toast('CHECKPOINT REACHED!', css(0.4, 1, 0.5));
    yield spring ? 0.9 : 1.6;
    const p = refs.penguin;
    if (spring && p && !p.locked) {
      const outward = pos.clone(); outward.y = 0; outward.normalize();
      p.launch(new THREE.Vector3(0, 7.5, 0).addScaledVector(outward, 6.5), 0.3);
      AudioManager.play('bounce');
      refs.ui?.taunt('This checkpoint is spring-loaded.');
      refs.traps?.registerExternalTrap('spring');
    } else refs.ui?.toast('(there are no checkpoints)', css(0.8, 0.8, 0.8), 0.8);
  }
}

/** The golden fish "shortcut": sends you straight back to the very bottom. */
export class ShortcutFish {
  private fish: THREE.Object3D;
  private last = -999;
  private inside = false;
  constructor(fish: THREE.Object3D) { this.fish = fish; Loop.add(this); }
  update() {
    if (!this.fish.parent?.visible) { this.inside = false; return; }
    const now = penguinInside(this.fish.getWorldPosition(new THREE.Vector3()), 0.8);
    if (now && !this.inside) {
      const p = refs.penguin;
      if (p && Time.time - this.last >= 5 && !p.locked) {
        this.last = Time.time;
        refs.game?.sendToBottom('Shortcut to the bottom. As advertised.');
      }
    }
    this.inside = now;
  }
}

/** TrapDirector's snowball: a heavy rolling ball aimed at the penguin. */
export function spawnSnowball(scene: THREE.Scene, from: THREE.Vector3, penguinCollider: RAPIER.Collider) {
  const go = new THREE.Group();
  go.name = 'Snowball';
  go.position.copy(from);
  scene.add(go);
  const mb = new MeshBuilder();
  mb.sphere(new THREE.Vector3(), new THREE.Vector3(0.75, 0.75, 0.75), col(0.96, 0.98, 1), 9, 6, 0.08, UnityRandom.rangeInt(0, 999), col(0.88, 0.92, 1));
  meshObject('Mesh', mb.build(), go);
  const w = Physics.world;
  const body = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(from.x, from.y, from.z).setCcdEnabled(true));
  const collider = w.createCollider(RAPIER.ColliderDesc.ball(0.72).setMass(4), body);
  Physics.register(collider, { snowball: go, object: go });
  const pc = refs.penguin!;
  const to = pc.position.add(new THREE.Vector3(0, 0.5, 0)).sub(from);
  body.setLinvel(to.normalize().multiplyScalar(12).add(new THREE.Vector3(0, 2, 0)), true);
  AudioManager.play('rumble_short', 0.8);
  refs.ui?.taunt('Incoming!');

  let hit = false;
  const born = Time.time;
  const beh = Loop.add({
    fixedUpdate() {
      if (hit) return;
      let touching = false;
      w.contactPair(collider, penguinCollider, m => { if (m.numContacts() > 0) touching = true; });
      if (touching) {
        hit = true;
        const dir = pc.position.sub(go.position); dir.y = 0;
        pc.launch(dir.normalize().multiplyScalar(7).add(new THREE.Vector3(0, 4, 0)), 0.3);
        AudioManager.play('bonk', 1);
        AudioManager.play('squawk', 0.7);
        Effects.snow(go.position.clone(), 30);
        destroyAfter(0.05);
      }
    },
    lateUpdate() {
      const t = body.translation(), r = body.rotation();
      go.position.set(t.x, t.y, t.z); go.quaternion.set(r.x, r.y, r.z, r.w);
      if (Time.time - born > 7) destroy();
    },
  });
  let dead = false;
  const destroy = () => {
    if (dead) return; dead = true;
    Loop.remove(beh);
    Physics.unregister(collider);
    w.removeRigidBody(body);
    go.removeFromParent();
  };
  const destroyAfter = (s: number) => { const t0 = Time.time; Loop.add({ update() { if (Time.time - t0 >= s) { destroy(); Loop.remove(this); } } }); };
  return go;
}
