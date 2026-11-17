import * as THREE from 'three';
import { DotNetRandom } from '../core/rng.ts';
import { col, srgb, lerp, inverseLerp, eulerDeg, mulRGB } from '../core/math.ts';
import { Time } from '../core/time.ts';
import { Loop } from '../core/loop.ts';
import { STAGES } from '../core/StageData.ts';
import { Physics, RAPIER } from '../physics/Physics.ts';
import { MeshBuilder, meshObject } from './MeshKit.ts';
import { Props, Drifter } from './Props.ts';
import type { MountainGenerator } from './MountainGenerator.ts';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = /* glsl */`
uniform vec3 uTop, uHorizon, uBottom, uSun, uSunDir;
uniform float uExp;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 c = d.y > 0.0 ? mix(uHorizon, uTop, pow(clamp(d.y, 0.0, 1.0), uExp)) : mix(uHorizon, uBottom, clamp(-d.y * 4.0, 0.0, 1.0));
  float s = clamp(dot(d, normalize(uSunDir)), 0.0, 1.0);
  c += uSun * (pow(s, 900.0) * 3.0 + pow(s, 16.0) * 0.22);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

const SUN = srgb(1, 0.95, 0.86), SUN_DOOM = srgb(1, 0.5, 0.3);
const FOG = srgb(0.72, 0.84, 0.95), FOG_DOOM = srgb(0.7, 0.25, 0.15);
const TOP = srgb(0.22, 0.45, 0.86), TOP_DOOM = srgb(0.35, 0.05, 0.05);
const HOR = srgb(0.74, 0.86, 0.98), HOR_DOOM = srgb(1, 0.45, 0.15);
const BOT = srgb(0.84, 0.9, 0.97), BOT_DOOM = srgb(0.6, 0.2, 0.1);

/** Lighting, sky, fog, ground, trees, rocks, clouds and distant mountains (port of WorldDecor.cs). */
export class WorldDecor {
  static instance: WorldDecor;
  sun!: THREE.DirectionalLight;
  hemi!: THREE.HemisphereLight;
  sunDir = new THREE.Vector3();   // direction the light travels
  doomAmount = 0;
  private fogTarget = 0.0035;
  private fog!: THREE.FogExp2;
  private sky!: THREE.ShaderMaterial;
  private skyMesh!: THREE.Mesh;
  readonly root = new THREE.Group();
  private scene: THREE.Scene;
  private mg: MountainGenerator;

  constructor(scene: THREE.Scene, mg: MountainGenerator) {
    WorldDecor.instance = this;
    this.scene = scene; this.mg = mg;
    this.root.name = 'World';
    scene.add(this.root);
    Loop.add(this);
  }

  build() {
    // ---- sun (Unity Euler 48, -35, 0; light travels along its +Z)
    this.sunDir.set(0, 0, 1).applyQuaternion(eulerDeg(48, -35, 0));
    this.sun = new THREE.DirectionalLight(SUN.clone(), 1.35 * Math.PI);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    // ---- ambient (Unity trilight → hemisphere)
    this.hemi = new THREE.HemisphereLight(srgb(0.46, 0.54, 0.7), srgb(0.28, 0.28, 0.34), 0.7 * Math.PI);   // a bit less fill light so rock facets read
    this.scene.add(this.hemi);

    // ---- sky
    this.sky = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
      uniforms: {
        uTop: { value: TOP.clone() }, uHorizon: { value: HOR.clone() }, uBottom: { value: BOT.clone() },
        uSun: { value: srgb(1, 0.95, 0.82) }, uSunDir: { value: this.sunDir.clone().negate() }, uExp: { value: 0.55 },
      },
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.sky);
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = -1000;
    this.scene.add(this.skyMesh);

    this.fog = new THREE.FogExp2(FOG.clone(), this.fogTarget);
    this.scene.fog = this.fog;

    this.buildGround();
    this.buildScatter();
    this.buildDistantMountains();
    this.buildClouds();
  }

  private buildGround() {
    const r = new DotNetRandom(77);
    const mb = new MeshBuilder();
    const rings = 14, segs = 40, maxR = 700;
    const pts: THREE.Vector3[][] = [];
    for (let i = 0; i < segs; i++) pts.push([]);
    for (let j = 0; j <= rings; j++) {
      const rad = j === 0 ? 0 : lerp(0, maxR, Math.pow(j / rings, 1.6));
      for (let i = 0; i < segs; i++) {
        const th = 2 * Math.PI * (i + (j % 2) * 0.5) / segs;
        const h = rad < 110 ? 0 : r.nextDouble() * inverseLerp(110, 600, rad) * 28;
        pts[i][j] = new THREE.Vector3(Math.cos(th) * rad, h, Math.sin(th) * rad);
      }
    }
    const up = new THREE.Vector3(0, 1, 0);
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < segs; i++) {
        const i2 = (i + 1) % segs;
        const shade = 0.92 + r.nextDouble() * 0.08;
        const c = col(0.9 * shade, 0.94 * shade, 1 * shade);
        if (j === 0) { mb.tri(pts[i][0], pts[i][1], pts[i2][1], c, up); continue; }
        mb.tri(pts[i][j], pts[i2][j], pts[i2][j + 1], c, up);
        mb.tri(pts[i][j], pts[i2][j + 1], pts[i][j + 1], mulRGB(c, 0.98), up);
      }
    const ground = meshObject('Ground', mb.build(), this.root, false);
    ground.receiveShadow = true;
    trimeshCollider(mb, { mountain: -1 });

    // frozen lake
    const lake = new MeshBuilder();
    const lc = new THREE.Vector3(-150, 0.03, 90);
    for (let i = 0; i < 18; i++) {
      const a0 = i / 18 * Math.PI * 2, a1 = (i + 1) / 18 * Math.PI * 2;
      lake.tri(lc, lc.clone().add(new THREE.Vector3(Math.cos(a0) * 45, 0, Math.sin(a0) * 28)), lc.clone().add(new THREE.Vector3(Math.cos(a1) * 45, 0, Math.sin(a1) * 28)),
        i % 2 === 0 ? col(0.6, 0.82, 0.95) : col(0.66, 0.86, 0.97), up);
    }
    meshObject('FrozenLake', lake.build(), this.root, false);
  }

  private buildScatter() {
    const r = new DotNetRandom(99);
    const trees: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) trees.push(Props.treeMesh(500 + i, 1 + i * 0.25).build());
    const rockMBs: MeshBuilder[] = [];
    for (let i = 0; i < 4; i++) rockMBs.push(Props.rockMesh(800 + i, new THREE.Vector3(1.6, 1.1, 1.3).multiplyScalar(1 + i * 0.5), col(0.5, 0.5, 0.56)));
    const rocks = rockMBs.map(m => m.build());
    const parent = new THREE.Group(); parent.name = 'Scatter'; this.root.add(parent);
    const baseR = this.mg.tiers[0].rBase;
    const spawn = this.mg.spawnPoint;
    for (let i = 0; i < 170; i++) {
      const a = r.nextDouble() * Math.PI * 2;
      const d = baseR + 14 + r.nextDouble() * 280;
      const p = new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
      if (p.distanceToSquared(spawn) < 18 * 18) continue;
      if (Math.hypot(p.x + 150, p.z - 90) < 50) continue;
      const t = meshObject('Tree', trees[r.next(trees.length)], parent);
      t.position.copy(p);
      t.quaternion.copy(eulerDeg(0, r.nextDouble() * 360, 0));
      const s = 1.2 + r.nextDouble() * 1.8;
      t.scale.setScalar(s);
      if (d < baseR + 60) {
        const body = Physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y + s, p.z));
        Physics.world.createCollider(RAPIER.ColliderDesc.capsule(0.7 * s, 0.3 * s), body);
      }
    }
    for (let i = 0; i < 70; i++) {
      const a = r.nextDouble() * Math.PI * 2;
      const d = baseR + 3 + r.nextDouble() * 200;
      const p = new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
      if (p.distanceToSquared(spawn) < 10 * 10) continue;
      const ri = r.next(rocks.length);
      const rock = meshObject('Rock', rocks[ri], parent);
      rock.position.copy(p);
      const yaw = r.nextDouble() * 360;
      rock.quaternion.copy(eulerDeg(0, yaw, 0));
      if (d < baseR + 40) {
        const body = Physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z).setRotation(rock.quaternion));
        const pos = rockMBs[ri].positions();
        const idx = new Uint32Array(pos.length / 3).map((_, k) => k);
        Physics.world.createCollider(RAPIER.ColliderDesc.trimesh(pos, idx), body);
      }
    }
  }

  private buildDistantMountains() {
    const r = new DotNetRandom(123);
    const parent = new THREE.Group(); parent.name = 'DistantMountains'; this.root.add(parent);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2 + r.nextDouble() * 0.2;
      const d = 650 + r.nextDouble() * 200;
      const mb = new MeshBuilder();
      const h = 120 + r.nextDouble() * 160, rad = 140 + r.nextDouble() * 120;
      mb.cone(new THREE.Vector3(), rad, h, col(0.55, 0.62, 0.75), 8, 0.2, 900 + i);
      mb.cone(new THREE.Vector3(0, h * 0.62, 0), rad * 0.4, h * 0.38 + 1, col(0.95, 0.97, 1), 8, 0.1, 950 + i);
      const go = meshObject('FarPeak', mb.build(), parent, false);
      go.receiveShadow = false;
      go.position.set(Math.cos(a) * d, -5, Math.sin(a) * d);
    }
  }

  private buildClouds() {
    const r = new DotNetRandom(321);
    const parent = new THREE.Group(); parent.name = 'Clouds'; this.root.add(parent);
    const top = this.mg.summitY;
    for (let i = 0; i < 26; i++) {
      const go = meshObject('Cloud', Props.cloudMesh(1000 + i).build(), parent, false);
      go.receiveShadow = false;
      const a = r.nextDouble() * Math.PI * 2;
      const d = 110 + r.nextDouble() * 260;
      go.position.set(Math.cos(a) * d, 40 + r.nextDouble() * (top + 60), Math.sin(a) * d);
      go.scale.setScalar(1.5 + r.nextDouble() * 2.5);
      Loop.add(new Drifter(go, 0.4 + r.nextDouble() * 0.8));
    }
  }

  setStageFog(stage: number) {
    const fog = stage >= 0 && stage < STAGES.length && STAGES[stage].fog;
    this.fogTarget = fog ? 0.06 : 0.0032;
  }

  /** keep the shadow camera around whatever we're looking at */
  focusShadows(at: THREE.Vector3) {
    this.sun.target.position.copy(at);
    this.sun.position.copy(at).addScaledVector(this.sunDir, -150);
  }

  update() {
    this.fog.density = lerp(this.fog.density, this.fogTarget, Time.deltaTime * 1.2);
    const d = this.doomAmount;
    this.fog.color.copy(FOG).lerp(FOG_DOOM, d);
    this.sky.uniforms.uTop.value.copy(TOP).lerp(TOP_DOOM, d);
    this.sky.uniforms.uHorizon.value.copy(HOR).lerp(HOR_DOOM, d);
    this.sky.uniforms.uBottom.value.copy(BOT).lerp(BOT_DOOM, d);
    this.sun.color.copy(SUN).lerp(SUN_DOOM, d);
  }

  /** sky follows the camera so it never clips */
  lateUpdate() {
    const cam = this.scene.userData.camera as THREE.Camera | undefined;
    if (cam) this.skyMesh.position.copy(cam.position);
  }
}

export function trimeshCollider(mb: MeshBuilder, owner: import('../physics/Physics.ts').Owner, body?: RAPIER.RigidBody) {
  const pos = mb.positions();
  const idx = new Uint32Array(pos.length / 3).map((_, k) => k);
  const b = body ?? Physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const c = Physics.world.createCollider(RAPIER.ColliderDesc.trimesh(pos, idx), b);
  Physics.register(c, owner);
  return { body: b, collider: c };
}
