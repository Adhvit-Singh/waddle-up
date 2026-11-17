import * as THREE from 'three';
import { DotNetRandom } from '../core/rng.ts';
import { col, mulRGB, lerpColor, UP } from '../core/math.ts';

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpN = new THREE.Vector3();

/** Flat-shaded, vertex-colored low-poly mesh builder (port of MeshBuilder in MeshKit.cs). */
export class MeshBuilder {
  private v: number[] = [];
  private c: number[] = [];

  get vertexCount() { return this.v.length / 3; }

  /** Adds a triangle. If `facing` is non-zero the winding is flipped so the face points that way. */
  tri(a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, color: THREE.Color, facing?: THREE.Vector3) {
    if (facing && facing.lengthSq() > 0) {
      tmpN.crossVectors(tmpA.subVectors(b, a), tmpB.subVectors(d, a));
      if (tmpN.dot(facing) < 0) { const t = b; b = d; d = t; }
    }
    this.v.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
    for (let i = 0; i < 3; i++) this.c.push(color.r, color.g, color.b);
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, e: THREE.Vector3, color: THREE.Color, facing?: THREE.Vector3) {
    this.tri(a, b, d, color, facing);
    this.tri(a, d, e, color, facing);
  }

  /** Axis-aligned box in local space with separate top color. */
  box(center: THREE.Vector3, size: THREE.Vector3, side: THREE.Color, top: THREE.Color, bottom?: THREE.Color) {
    const h = size.clone().multiplyScalar(0.5);
    const p = (x: number, y: number, z: number) => new THREE.Vector3(center.x + h.x * x, center.y + h.y * y, center.z + h.z * z);
    const bot = bottom ?? mulRGB(side, 0.7);
    const sideA = side, sideB = lerpColor(side, col(0, 0, 0), 0.08);
    this.quad(p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), top, new THREE.Vector3(0, 1, 0));
    this.quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1), bot, new THREE.Vector3(0, -1, 0));
    this.quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), sideA, new THREE.Vector3(0, 0, 1));
    this.quad(p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), p(1, -1, -1), sideA, new THREE.Vector3(0, 0, -1));
    this.quad(p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), p(1, -1, 1), sideB, new THREE.Vector3(1, 0, 0));
    this.quad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), sideB, new THREE.Vector3(-1, 0, 0));
  }

  /** Low-poly ellipsoid (lat/long), optional jitter for rocks. */
  sphere(center: THREE.Vector3, radii: THREE.Vector3, color: THREE.Color, lon = 8, lat = 6, jitter = 0, seed = 0, col2?: THREE.Color) {
    const rng = new DotNetRandom(seed);
    const pts: THREE.Vector3[][] = [];
    for (let i = 0; i < lon; i++) pts.push([]);
    for (let j = 0; j <= lat; j++) {
      const phi = Math.PI * j / lat;
      for (let i = 0; i < lon; i++) {
        const th = 2 * Math.PI * i / lon;
        const dx = Math.sin(phi) * Math.cos(th), dy = Math.cos(phi), dz = Math.sin(phi) * Math.sin(th);
        const k = 1 + (jitter > 0 && j > 0 && j < lat ? (rng.nextDouble() * 2 - 1) * jitter : 0);
        pts[i][j] = new THREE.Vector3(dx * radii.x * k, dy * radii.y * k, dz * radii.z * k);
      }
    }
    const C = (p: THREE.Vector3) => p.clone().add(center);
    for (let j = 0; j < lat; j++)
      for (let i = 0; i < lon; i++) {
        const i2 = (i + 1) % lon;
        const a = pts[i][j], b = pts[i2][j], d = pts[i2][j + 1], e = pts[i][j + 1];
        const mid = a.clone().add(b).add(d).add(e).multiplyScalar(0.25);
        const cc = col2 && ((i + j) % 3 === 0) ? col2 : color;
        if (j === 0) this.tri(C(a), C(d), C(e), cc, mid);
        else if (j === lat - 1) this.tri(C(a), C(b), C(d), cc, mid);
        else this.quad(C(a), C(b), C(d), C(e), cc, mid);
      }
  }

  /** Cone pointing along +Y from base center. */
  cone(baseCenter: THREE.Vector3, radius: number, height: number, color: THREE.Color, segs = 7, jitter = 0, seed = 0) {
    const rng = new DotNetRandom(seed);
    const tip = baseCenter.clone().add(new THREE.Vector3(0, height, 0));
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i < segs; i++) {
      const th = 2 * Math.PI * i / segs;
      const r = radius * (1 + (rng.nextDouble() * 2 - 1) * jitter);
      ring.push(baseCenter.clone().add(new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r)));
    }
    const under = mulRGB(color, 0.7);
    for (let i = 0; i < segs; i++) {
      const a = ring[i], b = ring[(i + 1) % segs];
      const outward = a.clone().add(b).multiplyScalar(0.5).sub(baseCenter);
      outward.y = 0; outward.normalize();
      this.tri(a, b, tip, color, outward.clone().add(new THREE.Vector3(0, 0.3, 0)));
      this.tri(a, b, baseCenter, under, new THREE.Vector3(0, -1, 0));
    }
  }

  /** Cone pointing along an arbitrary axis (for beaks etc.). */
  coneAxis(baseCenter: THREE.Vector3, axis: THREE.Vector3, radius: number, length: number, color: THREE.Color, segs = 6) {
    axis = axis.clone().normalize();
    const u = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
    const w = new THREE.Vector3().crossVectors(axis, u);
    const tip = baseCenter.clone().addScaledVector(axis, length);
    const back = mulRGB(color, 0.8);
    for (let i = 0; i < segs; i++) {
      const a0 = 2 * Math.PI * i / segs, a1 = 2 * Math.PI * (i + 1) / segs;
      const p0 = baseCenter.clone().addScaledVector(u, Math.cos(a0) * radius).addScaledVector(w, Math.sin(a0) * radius);
      const p1 = baseCenter.clone().addScaledVector(u, Math.cos(a1) * radius).addScaledVector(w, Math.sin(a1) * radius);
      const outward = p0.clone().add(p1).multiplyScalar(0.5).sub(baseCenter).normalize();
      this.tri(p0, p1, tip, color, outward.addScaledVector(axis, 0.2));
      this.tri(p0, p1, baseCenter, back, axis.clone().negate());
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.v, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /** raw triangle soup (for Rapier trimesh colliders) */
  positions(): Float32Array { return new Float32Array(this.v); }
}

/** Shared materials (port of Mats). Created lazily so Node tests never touch WebGL. */
export const Mats = {
  _vc: null as THREE.MeshLambertMaterial | null,
  get vertexColor(): THREE.MeshLambertMaterial {
    if (!this._vc) this._vc = makeVertexColorMat();
    return this._vc;
  },
  /** A tinted copy of the vertex color material (for flashes/emission on one object). */
  vertexColorInstance(tint: THREE.Color, emission?: THREE.Color) {
    const m = makeVertexColorMat();
    m.color.copy(tint);
    if (emission) m.emissive.copy(emission);
    return m;
  },
};

function makeVertexColorMat() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}

/** Mats.MeshObject: a Mesh using the vertex color material. */
export function meshObject(name: string, geo: THREE.BufferGeometry, parent: THREE.Object3D | null, castShadows = true, material?: THREE.Material) {
  const m = new THREE.Mesh(geo, material ?? Mats.vertexColor);
  m.name = name;
  m.castShadow = castShadows;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
