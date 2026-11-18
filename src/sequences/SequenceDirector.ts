import * as THREE from 'three';
import { Time } from '../core/time.ts';
import { Loop } from '../core/loop.ts';
import { Scheduler, type Co } from '../core/coroutines.ts';
import { UnityRandom } from '../core/rng.ts';
import { col, smoothStep, lerpColor, eulerDeg, Rad2Deg } from '../core/math.ts';
import { SaveSystem, newSaveData } from '../core/SaveSystem.ts';
import { Physics, RAPIER } from '../physics/Physics.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { Effects, type ParticleSystem } from '../world/Effects.ts';
import { MeshBuilder, meshObject, Mats } from '../world/MeshKit.ts';
import { Props } from '../world/Props.ts';
import { WorldDecor } from '../world/WorldDecor.ts';
import type { MountainGenerator } from '../world/MountainGenerator.ts';
import type { PenguinController } from '../player/PenguinController.ts';
import type { ThirdPersonCamera } from '../player/ThirdPersonCamera.ts';
import { UIManager } from '../ui/UIManager.ts';
import type { Game } from '../core/Game.ts';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** The two fake summits ("NOPE.") and the real asteroid ending. */
export class SequenceDirector {
  private running = false;
  private spawned: { object: THREE.Object3D; body?: RAPIER.RigidBody; fx?: ParticleSystem; light?: THREE.Light }[] = [];
  private gm: Game; private scene: THREE.Scene;

  constructor(gm: Game, scene: THREE.Scene) { this.gm = gm; this.scene = scene; }

  private get ui() { return UIManager.instance; }
  private get cam(): ThirdPersonCamera { return this.gm.cam; }
  private get pc(): PenguinController { return this.gm.penguin; }
  private get mg(): MountainGenerator { return this.gm.mountain; }

  cleanup() {
    Scheduler.stopAll(this);
    this.running = false;
    for (const s of this.spawned) {
      s.object.removeFromParent();
      if (s.body) Physics.world.removeRigidBody(s.body);
      s.fx?.destroy();
    }
    this.spawned = [];
    AudioManager.setRumble(0);
    AudioManager.setMusicMultiplier(1);
    this.ui?.fakeWinShow(false);
  }

  runFakeSummit(tierIndex: number) { if (!this.running) Scheduler.start(this, this.fakeSummit(tierIndex)); }
  runEnding() { if (!this.running) Scheduler.start(this, this.ending()); }

  private *fakeSummit(tierIndex: number): Co {
    this.running = true;
    const { gm, ui, cam, pc, mg } = this;
    const tier = mg.tiers[tierIndex];
    const next = mg.tiers[tierIndex + 1];

    gm.setCutscene(true);
    pc.launch(V(), 0);
    gm.saveNow();

    // walk the penguin to the flag-ish area so it's out of the way of the rising tier
    const flag = tier.flagPos.clone();
    const outward = V(flag.x, 0, flag.z).normalize();
    const side = V().crossVectors(V(0, 1, 0), outward);
    // beside the flag, along the free ring of the plateau (the next tier rises inside this ring)
    const stand = flag.clone().addScaledVector(side, 1.4).add(V(0, 0.1, 0));
    pc.teleport(stand, Math.atan2(-outward.x, -outward.z) * Rad2Deg);
    pc.inputLocked = true;

    const camPos = stand.clone().addScaledVector(outward, 9).add(V(0, 3.5, 0)).addScaledVector(side, 3);
    cam.setCutscene(camPos, stand.clone().add(V(0, 1.2, 0)), 3);
    ui.enterGameplayUI();
    ui.showHUD(false);
    ui.fakeWinShow(true);
    AudioManager.setMusicMultiplier(0);

    AudioManager.play('fanfare', 1);
    Effects.confetti(flag.clone().add(V(0, 3, 0)));
    Effects.confetti(stand.clone().addScaledVector(outward, 2));
    if (tierIndex === 0) {
      ui.fakeWinText('YOU REACHED THE SUMMIT!', 'Congratulations! The penguin is finally free.');
      yield 3.2;
      ui.fakeWinText('THANKS FOR PLAYING!', `Time ${UIManager.formatTime(gm.data.time)}   ·   Falls ${gm.data.falls}`);
      yield 2.4;
      AudioManager.play('scratch', 1);
      yield 0.35;
      AudioManager.play('trombone', 0.9);
      yield* ui.nope('NOPE.', 'Not the end.');
    } else {
      ui.fakeWinText('CONGRATULATIONS!', 'Loading the ending...');
      let t = 0;
      while (t < 3.5) {
        t += Time.deltaTime;
        const f = Math.min(0.99, Math.pow(t / 3.5, 0.6));
        ui.fakeWinBar(true, f, Math.floor(f * 100) + '%');
        yield null;
      }
      ui.fakeWinBar(true, 0.99, '99%');
      AudioManager.play('drumroll', 0.8);
      yield 2.4;
      ui.fakeWinBar(true, 0.99, '99%   (any second now)');
      yield 1.4;
      AudioManager.play('scratch', 1);
      yield 0.3;
      AudioManager.play('trombone', 0.9);
      yield* ui.nope('LOL NO.', "There's more mountain. There's always more mountain.");
    }

    // ---- the next tier rises out of the plateau
    ui.fakeWinShow(false);
    const lookAt = V(0, next.baseY + 12, 0);
    const wide = stand.clone().addScaledVector(outward, 22).add(V(0, 10, 0));
    cam.setCutscene(wide, lookAt, 1.2);
    yield 0.8;

    const root = next.root;
    const depth = next.height + 4;
    root.position.set(0, -depth, 0);
    mg.setTierActive(tierIndex + 1, true);
    mg.syncTier(tierIndex + 1);
    AudioManager.setRumble(1);
    const dur = 7;
    let e = 0, dustT = 0;
    while (e < dur) {
      e += Time.deltaTime;
      const k = smoothStep(0, 1, e / dur);
      root.position.set(0, -depth * (1 - k), 0);
      mg.syncTier(tierIndex + 1);
      cam.shake(0.22);
      dustT -= Time.deltaTime;
      if (dustT <= 0) {
        dustT = 0.25;
        const a = UnityRandom.value() * Math.PI * 2;
        Effects.dust(V(Math.cos(a) * next.rBase, tier.topY + 0.5, Math.sin(a) * next.rBase), 14, col(0.9, 0.92, 0.98));
      }
      yield null;
    }
    root.position.set(0, 0, 0);
    mg.syncTier(tierIndex + 1);
    for (const l of mg.ledges) if (l.root === root) l.resetState();
    AudioManager.setRumble(0);
    AudioManager.play('land', 1, 0.5);
    cam.shake(0.6);

    gm.data.tiersRevealed = tierIndex + 1;
    yield 0.6;
    ui.enterGameplayUI();
    ui.taunt(tierIndex === 0 ? "Did you really think it'd be that easy?" : 'Okay, okay. The REAL top is up there. Probably.');
    AudioManager.setMusicMultiplier(1);
    gm.setCutscene(false);
    cam.snapBehindTarget();
    gm.saveNow();
    this.running = false;
  }

  private *ending(): Co {
    this.running = true;
    const { gm, ui, cam, pc, mg } = this;
    const tier = mg.tiers[mg.tiers.length - 1];

    gm.setCutscene(true);
    gm.setEnding();
    pc.launch(V(), 0);
    const top = tier.flagPos.clone();
    const stand = top.clone().add(V(1.6, 0.1, 0.8));
    pc.teleport(stand, 200);
    pc.inputLocked = true;
    ui.enterGameplayUI();
    ui.showHUD(false);
    ui.fakeWinShow(true);
    AudioManager.setMusicMultiplier(0);

    cam.setCutscene(stand.clone().add(V(6, 3, -6)), stand.clone().add(V(0, 1, 0)), 2.5);
    AudioManager.play('victory', 1);
    Effects.confetti(top.clone().add(V(0, 4, 0)), 220);
    ui.fakeWinText('THE ACTUAL SUMMIT!', 'No tricks this time. You really made it.');
    const finalTime = gm.data.time;
    yield 4;
    ui.fakeWinText('', '...wait. What\'s that?');
    yield 1.5;

    // ---- the asteroid
    const skyDir = V(-0.55, 0.6, 0.58).normalize();
    const start = top.clone().addScaledVector(skyDir, 650);
    const ast = this.buildAsteroid(start);
    const trail = Effects.fireTrail(ast, 2.5);
    this.spawned.push({ object: new THREE.Object3D(), fx: trail });
    cam.setCutscene(stand.clone().add(V(4, 2, -4)), top.clone().addScaledVector(skyDir, 220), 1.5);
    AudioManager.play('asteroid', 1);
    ui.fakeWinText('', '');

    const travel = 4.4;
    let t = 0;
    const wide = V(0, top.y * 0.55, 0).add(new THREE.Vector3(0, 0, 1).applyQuaternion(eulerDeg(0, 120, 0)).multiplyScalar(mg.tiers[0].rBase + 190));
    while (t < travel) {
      t += Time.deltaTime;
      const u = t / travel;
      WorldDecor.instance.doomAmount = Math.min(1, u * 1.4);
      ast.position.lerpVectors(start, top, Math.min(1, u * u * (0.4 + 0.6 * u)));
      ast.rotateX(40 * Time.deltaTime * Math.PI / 180); ast.rotateY(70 * Time.deltaTime * Math.PI / 180); ast.rotateZ(20 * Time.deltaTime * Math.PI / 180);
      if (t > 1.8) cam.setCutscene(wide, top.clone().lerp(V(0, top.y * 0.5, 0), 0.3), 1.4);
      cam.shake(u * 0.25);
      yield null;
    }

    // ---- impact
    ast.removeFromParent();
    trail.rate = 0; trail.cfg.destroyWhenDone = true; trail.burst(0);
    AudioManager.play('explosion', 1);
    AudioManager.play('squawk', 1, 0.8);
    yield* ui.fade(1, 0.08, '#fff');
    Effects.explosion(top, 3);
    for (let i = 0; i < 6; i++) {
      const tr = mg.tiers[UnityRandom.rangeInt(0, mg.tiers.length)];
      const a = UnityRandom.value() * Math.PI * 2, y = UnityRandom.range(tr.baseY, tr.topY);
      const r = tr.slopeR(y);
      Effects.explosion(V(Math.cos(a) * r, y, Math.sin(a) * r), 1.6);
    }
    this.spawnChunks();
    for (let i = 0; i < mg.tiers.length; i++) mg.setTierActive(i, false);
    pc.ragdoll(V(8, 34, -6), V(12, 4, 18));
    cam.shake(1.6);
    yield 0.15;
    yield* ui.fade(0, 1.2, '#fff');
    ui.fakeWinShow(false);
    yield 5.5;
    ui.fakeWinShow(true);
    ui.fakeWinText('', 'the penguin is fine. probably.');
    yield 2.5;
    yield* ui.fade(1, 1.5);
    ui.fakeWinShow(false);

    // ---- results
    const roleId = gm.data.role;
    const best = SaveSystem.bestTimeFor(roleId);
    const newBest = !gm.data.devUsed && (best <= 0 || finalTime < best);
    if (newBest && !gm.data.devUsed) SaveSystem.setBestTimeFor(roleId, finalTime);
    SaveSystem.wins = SaveSystem.wins + 1;
    const data = gm.data;
    gm.traps.endRun();
    SaveSystem.clear();
    WorldDecor.instance.doomAmount = 0;
    AudioManager.setMusicMultiplier(1);
    ui.showStats(data, newBest, () => {
      ui.rollCredits(() => {
        this.running = false;
        gm.resetWorld();
        pc.teleport(mg.spawnPoint, mg.spawnYaw);
        gm.data = newSaveData();
        gm.toMenu();
        Scheduler.start(this, ui.fade(0, 1));
      });
    });
    yield* ui.fade(0, 0.6);
  }

  private buildAsteroid(pos: THREE.Vector3) {
    const go = new THREE.Group();
    go.name = 'Asteroid';
    go.position.copy(pos);
    this.scene.add(go);
    const mb = new MeshBuilder();
    mb.sphere(V(), V(14, 14, 14), col(0.35, 0.28, 0.25), 12, 8, 0.25, 4040, col(0.25, 0.2, 0.18));
    meshObject('Rock', mb.build(), go, true, Mats.vertexColorInstance(col(1, 1, 1), col(0.5, 0.15, 0.02)));
    const light = new THREE.PointLight(col(1, 0.5, 0.2), 8, 250, 0);
    go.add(light);
    this.spawned.push({ object: go });
    return go;
  }

  private spawnChunks() {
    const mg = this.mg;
    const geos: { geo: THREE.BufferGeometry; size: THREE.Vector3 }[] = [];
    for (let i = 0; i < 5; i++) {
      const size = V(2.4, 2, 2.2).multiplyScalar(0.8 + i * 0.45);
      geos.push({ geo: Props.rockMesh(7000 + i, size, lerpColor(col(0.45, 0.42, 0.42), col(0.92, 0.95, 1), i % 2 === 0 ? 0 : 0.7)).build(), size });
    }
    const w = Physics.world;
    for (let i = 0; i < 110; i++) {
      const tr = mg.tiers[Math.min(mg.tiers.length - 1, Math.trunc(UnityRandom.value() * UnityRandom.value() * 3))];
      const y = UnityRandom.range(tr.baseY, tr.topY);
      const a = UnityRandom.value() * Math.PI * 2;
      const r = tr.slopeR(y) * UnityRandom.range(0.3, 1);
      const p = V(Math.cos(a) * r, y, Math.sin(a) * r);
      const g = geos[UnityRandom.rangeInt(0, geos.length)];
      const go = meshObject('Chunk', g.geo, this.scene);
      go.position.copy(p);
      const q = UnityRandom.rotation();
      go.quaternion.set(q[0], q[1], q[2], q[3]);
      const s = UnityRandom.range(1, 3.2);
      go.scale.setScalar(s);
      const body = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation(go.quaternion));
      const half = g.size.clone().multiplyScalar(s); // sphere radii = size → bounds ±size
      w.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y * 0.85, half.z).setTranslation(0, g.size.y * 0.35 * s, 0).setMass(5), body);
      const dir = p.clone().sub(V(0, mg.summitY * 0.4, 0)).normalize();
      body.setLinvel(dir.multiplyScalar(UnityRandom.range(18, 55)).add(V(0, UnityRandom.range(10, 40), 0)), true);
      const av = UnityRandom.insideUnitSphere();
      body.setAngvel({ x: av.x * 4, y: av.y * 4, z: av.z * 4 }, true);
      const entry = { object: go, body };
      this.spawned.push(entry);
      Loop.add({
        lateUpdate() {
          if (!go.parent) { Loop.remove(this); return; }
          const t = body.translation(), rr = body.rotation();
          go.position.set(t.x, t.y, t.z); go.quaternion.set(rr.x, rr.y, rr.z, rr.w);
        },
      });
    }
  }
}
