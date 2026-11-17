import * as THREE from 'three';
import { DotNetRandom, UnityRandom } from '../core/rng.ts';
import { col, lerpColor, mulRGB, eulerDeg, lookRotation, UP } from '../core/math.ts';
import { Time } from '../core/time.ts';
import { Loop } from '../core/loop.ts';
import { refs } from '../core/refs.ts';
import { MeshBuilder, meshObject, Mats } from './MeshKit.ts';
import { Effects, type ParticleSystem } from './Effects.ts';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Procedural props: flags, signs, fish, glows, trees, rocks, clouds (port of Props.cs). */
export const Props = {
  flag(parent: THREE.Object3D, basePos: THREE.Vector3, height: number, cloth: THREE.Color, label: string | null, labelScale: number) {
    const go = new THREE.Group();
    go.name = 'Flag';
    parent.add(go);
    go.position.copy(basePos);
    const mb = new MeshBuilder();
    mb.box(V(0, height * 0.5, 0), V(0.12, height, 0.12), col(0.85, 0.85, 0.9), col(1, 1, 1));
    mb.sphere(V(0, height + 0.08, 0), V(0.14, 0.14, 0.14), col(1, 0.85, 0.3), 6, 4);
    mb.box(V(0, 0.1, 0), V(0.5, 0.2, 0.5), col(0.4, 0.4, 0.45), col(0.6, 0.6, 0.65));
    meshObject('Pole', mb.build(), go);

    const clothPivot = new THREE.Group();
    clothPivot.position.set(0, height - 0.1, 0);
    go.add(clothPivot);
    const cm = new MeshBuilder();
    const w = height * 0.38, h = height * 0.24;
    cm.tri(V(), V(w, -h * 0.5, 0), V(0, -h, 0), cloth, V(0, 0, 1));
    cm.tri(V(), V(w, -h * 0.5, 0), V(0, -h, 0), mulRGB(cloth, 0.85), V(0, 0, -1));
    meshObject('Cloth', cm.build(), clothPivot, false);
    Loop.add(new Waver(clothPivot));

    if (label) Props.text3D(go, V(0, height + 0.9, 0), label, labelScale, col(1, 0.95, 0.7), true);
    return go;
  },

  sign(parent: THREE.Object3D, basePos: THREE.Vector3, rot: THREE.Quaternion, text: string, scale = 1) {
    const go = new THREE.Group();
    go.name = 'Sign';
    parent.add(go);
    go.position.copy(basePos); go.quaternion.copy(rot);
    const mb = new MeshBuilder();
    const wood = col(0.55, 0.36, 0.2), woodTop = col(0.65, 0.45, 0.26);
    mb.box(V(0, 0.6 * scale, 0), V(0.12, 1.2 * scale, 0.12), mulRGB(wood, 0.8), woodTop);
    mb.box(V(0, 1.45 * scale, 0), V(1.9 * scale, 0.9 * scale, 0.1), wood, woodTop);
    mb.box(V(0, 1.93 * scale, 0), V(2.0 * scale, 0.08 * scale, 0.16), col(0.95, 0.97, 1), col(1, 1, 1));
    meshObject('SignMesh', mb.build(), go);
    const tc = col(1, 0.95, 0.85);
    // one readable face on each side of the board
    const t1 = Props.text3D(go, V(0, 1.45 * scale, -0.06), text, 0.45 * scale, tc, false);
    t1.rotation.y = Math.PI;
    Props.text3D(go, V(0, 1.45 * scale, 0.06), text, 0.45 * scale, tc, false);
    return go;
  },

  /** TextMesh replacement: canvas texture on a plane. Supports \n and <size=N> (N relative to 100). */
  text3D(parent: THREE.Object3D, localPos: THREE.Vector3, text: string, scale: number, color: THREE.Color, billboard: boolean) {
    const mesh = makeTextMesh(text, scale, color);
    mesh.position.copy(localPos);
    parent.add(mesh);
    if (billboard) Loop.add(new Billboard(mesh));
    return mesh;
  },

  fish(parent: THREE.Object3D, pos: THREE.Vector3) {
    const go = new THREE.Group();
    go.name = 'GoldenFish';
    parent.add(go);
    go.position.copy(pos);
    const mb = new MeshBuilder();
    const gold = col(1, 0.78, 0.15);
    mb.sphere(V(), V(0.18, 0.22, 0.42), gold, 8, 5, 0, 0, col(1, 0.9, 0.4));
    mb.coneAxis(V(0, 0, -0.32), V(0, 0, -1), 0.22, 0.3, mulRGB(gold, 0.9), 4);
    mb.sphere(V(0.12, 0.06, 0.25), V(0.05, 0.05, 0.05), col(0, 0, 0), 5, 3);
    mb.sphere(V(-0.12, 0.06, 0.25), V(0.05, 0.05, 0.05), col(0, 0, 0), 5, 3);
    meshObject('FishMesh', mb.build(), go, true, Mats.vertexColorInstance(col(1, 1, 1), col(0.35, 0.25, 0.02)));
    Loop.add(new Spinner(go));
    const glow = Effects.glow(pos.clone(), col(1, 0.85, 0.3), 2.2, go);
    return { object: go, glow };
  },

  glow(pos: THREE.Vector3, color: THREE.Color, size = 4): ParticleSystem {
    return Effects.glow(pos, color, size);
  },

  treeMesh(seed: number, scale: number) {
    const r = new DotNetRandom(seed);
    const mb = new MeshBuilder();
    const trunk = col(0.4, 0.27, 0.17);
    mb.box(V(0, 0.5 * scale, 0), V(0.35 * scale, 1 * scale, 0.35 * scale), trunk, trunk);
    const green = lerpColor(col(0.13, 0.42, 0.32), col(0.2, 0.55, 0.35), r.nextDouble());
    let y = 0.8 * scale;
    for (let i = 0; i < 3; i++) {
      const rad = (1.6 - i * 0.4) * scale, h = (1.8 - i * 0.25) * scale;
      mb.cone(V(0, y, 0), rad, h, i === 2 ? lerpColor(green, col(1, 1, 1), 0.6) : green, 7, 0.15, seed + i);
      y += h * 0.55;
    }
    return mb;
  },

  rockMesh(seed: number, size: THREE.Vector3, color: THREE.Color) {
    const mb = new MeshBuilder();
    mb.sphere(V(0, size.y * 0.35, 0), size, color, 7, 4, 0.28, seed, mulRGB(color, 0.85));
    return mb;
  },

  cloudMesh(seed: number) {
    const r = new DotNetRandom(seed);
    const mb = new MeshBuilder();
    const n = 3 + r.next(4);
    for (let i = 0; i < n; i++) {
      const c = V((r.nextDouble() - 0.5) * 12, r.nextDouble() * 1.5, (r.nextDouble() - 0.5) * 5);
      const s = 2.5 + r.nextDouble() * 3;
      mb.sphere(c, V(s, s * 0.6, s), col(1, 1, 1), 7, 4, 0.12, seed + i, col(0.92, 0.95, 1));
    }
    return mb;
  },
};

// ---------------------------------------------------------------- behaviours

export class Waver {
  private seed = UnityRandom.value() * 10;
  private t: THREE.Object3D;
  constructor(t: THREE.Object3D) { this.t = t; }
  update() { this.t.quaternion.copy(eulerDeg(0, Math.sin(Time.time * 3 + this.seed) * 18, Math.sin(Time.time * 5 + this.seed) * 4)); }
}

export class Spinner {
  private basePos: THREE.Vector3;
  private t: THREE.Object3D;
  constructor(t: THREE.Object3D) { this.t = t; this.basePos = t.position.clone(); }
  update() {
    this.t.quaternion.copy(eulerDeg(0, Time.time * 90, Math.sin(Time.time * 2) * 10));
    this.t.position.copy(this.basePos).add(V(0, Math.sin(Time.time * 2.2) * 0.15, 0));
  }
}

export class Billboard {
  private t: THREE.Object3D;
  constructor(t: THREE.Object3D) { this.t = t; }
  lateUpdate() {
    const cam = refs.camera;
    if (!cam || !this.t.parent) return;
    // face the camera (planes face +Z in three)
    const wp = this.t.getWorldPosition(new THREE.Vector3());
    const wq = lookRotation(cam.position.clone().sub(wp), UP);
    const pq = this.t.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.t.quaternion.copy(pq.multiply(wq));
  }
}

export class Drifter {
  speed = 1;
  private t: THREE.Object3D;
  constructor(t: THREE.Object3D, speed: number) { this.t = t; this.speed = speed; }
  update() {
    const a = this.speed * Time.deltaTime * Math.PI / 180;
    this.t.position.applyAxisAngle(UP, a);
    this.t.rotateOnWorldAxis(UP, a);
  }
}

// ---------------------------------------------------------------- text

interface Seg { text: string; size: number; }

function parseLines(text: string): Seg[][] {
  const lines: Seg[][] = [[]];
  const stack: number[] = [100];
  const re = /<size=(\d+)>|<\/size>|\n|[^<\n]+|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tok = m[0];
    if (m[1]) stack.push(parseInt(m[1], 10));
    else if (tok === '</size>') { if (stack.length > 1) stack.pop(); }
    else if (tok === '\n') lines.push([]);
    else lines[lines.length - 1].push({ text: tok, size: stack[stack.length - 1] });
  }
  return lines;
}

const PX = 64; // canvas px for size=100

function makeTextMesh(text: string, scale: number, color: THREE.Color) {
  const lines = parseLines(text);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = (s: number) => `bold ${Math.round(PX * s / 100)}px "Segoe UI", Arial, sans-serif`;
  const metrics = lines.map(l => {
    let w = 0, h = 0;
    for (const s of l) { ctx.font = font(s.size); w += ctx.measureText(s.text).width; h = Math.max(h, s.size); }
    return { w, h: (h || 100) * PX / 100 * 1.15 };
  });
  const pad = 8;
  const W = Math.ceil(Math.max(...metrics.map(m => m.w), 1) + pad * 2);
  const H = Math.ceil(metrics.reduce((a, m) => a + m.h, 0) + pad * 2);
  canvas.width = W; canvas.height = H;
  const css = `rgb(${Math.round(Math.min(1, color.r) * 255)},${Math.round(Math.min(1, color.g) * 255)},${Math.round(Math.min(1, color.b) * 255)})`;
  ctx.translate(W, 0); ctx.scale(-1, 1); // pre-mirror: the canvas is shown flipped (see index.html)
  let y = pad;
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => {
    const m = metrics[i];
    let x = (W - m.w) / 2;
    for (const s of l) {
      ctx.font = font(s.size);
      ctx.lineWidth = Math.max(2, PX * s.size / 100 * 0.08);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeText(s.text, x, y + m.h / 2);
      ctx.fillStyle = css;
      ctx.fillText(s.text, x, y + m.h / 2);
      x += ctx.measureText(s.text).width;
    }
    y += m.h;
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // Unity TextMesh: line height ≈ fontSize(100) * characterSize(0.05*scale) * 0.1 = 0.5*scale world units
  const unitsPerPx = (0.5 * scale) / (PX * 1.15);
  const geo = new THREE.PlaneGeometry(W * unitsPerPx, H * unitsPerPx);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Text';
  mesh.renderOrder = 2;
  return mesh;
}
