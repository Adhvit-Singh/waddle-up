import * as THREE from 'three';
import { UnityRandom } from '../core/rng.ts';
import { Time } from '../core/time.ts';
import { col, lerpColor } from '../core/math.ts';

/** A tiny CPU particle system that covers what Effects.cs used from Unity's ParticleSystem. */
export interface PSConfig {
  max: number;
  lifetime: [number, number];
  speed: [number, number];
  size: [number, number];
  color: THREE.Color | [THREE.Color, THREE.Color] | 'confetti';
  alpha?: number;                       // start alpha
  gravity?: number;                     // gravity modifier (×9.81)
  shape: { type: 'sphere'; radius: number } | { type: 'cone'; angle: number; radius: number } | { type: 'box'; x: number; z: number };
  /** color over lifetime: end tint; alpha keys follow Effects.Fade (1 → 0.8@0.6 → 0) unless alphaCurve given */
  endTint?: THREE.Color;
  alphaCurve?: 'fade' | 'glow' | 'none';
  sizeOverLife?: [number, number];
  limit?: { limit: number; dampen: number };
  additive?: boolean;
  noise?: number;                       // gentle drifting
  stretch?: number;                     // wind streak velocity scale (draws stretched)
  rate?: number;                        // emission per second (looping)
  follow?: THREE.Object3D;              // emitter follows this object (position only)
  offset?: THREE.Vector3;
  velocityOverride?: THREE.Vector3;     // world-space constant velocity (wind streaks)
  destroyWhenDone?: boolean;
}

const VERT = /* glsl */`
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
#include <fog_pars_vertex>
void main() {
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.001, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */`
varying vec4 vColor;
#include <fog_pars_fragment>
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float a = clamp(1.0 - length(d), 0.0, 1.0);
  a = a * a * (3.0 - 2.0 * a);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  if (gl_FragColor.a < 0.004) discard;
  #include <fog_fragment>
}`;

const systems: ParticleSystem[] = [];
let scene: THREE.Scene | null = null;
let pixelScale = 500;

export class ParticleSystem {
  cfg: PSConfig;
  points: THREE.Points;
  emitter = new THREE.Vector3();
  rotation = new THREE.Quaternion();
  rate = 0;
  dead = false;
  private n = 0;
  private pos: Float32Array; private vel: Float32Array; private age: Float32Array; private life: Float32Array;
  private size0: Float32Array; private col0: Float32Array;
  private gSize: Float32Array; private gCol: Float32Array;
  private acc = 0;
  private burstDone = false;
  private lastPos = new THREE.Vector3();

  constructor(cfg: PSConfig, position: THREE.Vector3) {
    this.cfg = cfg;
    this.emitter.copy(position);
    this.rate = cfg.rate ?? 0;
    const m = cfg.max;
    this.pos = new Float32Array(m * 3); this.vel = new Float32Array(m * 3);
    this.age = new Float32Array(m); this.life = new Float32Array(m);
    this.size0 = new Float32Array(m); this.col0 = new Float32Array(m * 4);
    this.gSize = new Float32Array(m); this.gCol = new Float32Array(m * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.gSize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.gCol, 4).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
      blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: pixelScale } }]),
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    if (cfg.follow) this.lastPos.copy(cfg.follow.getWorldPosition(new THREE.Vector3()));
    scene?.add(this.points);
    systems.push(this);
  }

  burst(count: number) {
    for (let i = 0; i < count; i++) this.spawn();
    this.burstDone = true;
  }

  private spawn() {
    const c = this.cfg;
    if (this.n >= c.max) return;
    const i = this.n++;
    let px = 0, py = 0, pz = 0, dx = 0, dy = 1, dz = 0;
    const s = c.shape;
    if (s.type === 'sphere') {
      const r = UnityRandom.insideUnitSphere();
      const len = Math.hypot(r.x, r.y, r.z) || 1;
      px = r.x * s.radius; py = r.y * s.radius; pz = r.z * s.radius;
      dx = r.x / len; dy = r.y / len; dz = r.z / len;
    } else if (s.type === 'cone') {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
      px = Math.cos(a) * s.radius * rr; pz = Math.sin(a) * s.radius * rr;
      const ang = s.angle * Math.PI / 180 * rr;
      dx = Math.cos(a) * Math.sin(ang); dz = Math.sin(a) * Math.sin(ang); dy = Math.cos(ang);
    } else {
      px = (Math.random() - 0.5) * s.x; pz = (Math.random() - 0.5) * s.z; dx = 0; dy = -1; dz = 0;
    }
    const sp = UnityRandom.range(c.speed[0], c.speed[1]);
    const o = this.emitter;
    this.pos[i * 3] = o.x + px; this.pos[i * 3 + 1] = o.y + py; this.pos[i * 3 + 2] = o.z + pz;
    this.vel[i * 3] = dx * sp; this.vel[i * 3 + 1] = dy * sp; this.vel[i * 3 + 2] = dz * sp;
    this.age[i] = 0; this.life[i] = UnityRandom.range(c.lifetime[0], c.lifetime[1]);
    this.size0[i] = UnityRandom.range(c.size[0], c.size[1]);
    let cc: THREE.Color;
    if (c.color === 'confetti') cc = CONFETTI[Math.floor(Math.random() * CONFETTI.length)];
    else if (Array.isArray(c.color)) cc = lerpColor(c.color[0], c.color[1], Math.random());
    else cc = c.color;
    this.col0[i * 4] = cc.r; this.col0[i * 4 + 1] = cc.g; this.col0[i * 4 + 2] = cc.b; this.col0[i * 4 + 3] = c.alpha ?? 1;
  }

  private kill(i: number) {
    const j = --this.n;
    if (i === j) return;
    for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[j * 3 + k]; this.vel[i * 3 + k] = this.vel[j * 3 + k]; }
    for (let k = 0; k < 4; k++) this.col0[i * 4 + k] = this.col0[j * 4 + k];
    this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.size0[i] = this.size0[j];
  }

  update(dt: number) {
    const c = this.cfg;
    if (c.follow) {
      const fp = c.follow.getWorldPosition(new THREE.Vector3());
      this.emitter.copy(fp).add(c.offset ?? new THREE.Vector3());
    }
    if (this.rate > 0) {
      this.acc += this.rate * dt;
      while (this.acc >= 1) { this.acc -= 1; this.spawn(); }
    }
    const g = -9.81 * (c.gravity ?? 0);
    const tint = c.endTint;
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      if (c.velocityOverride) {
        this.vel[i * 3] = c.velocityOverride.x; this.vel[i * 3 + 1] = c.velocityOverride.y; this.vel[i * 3 + 2] = c.velocityOverride.z;
      } else {
        this.vel[i * 3 + 1] += g * dt;
        if (c.noise) {
          const t = Time.time + i * 1.7;
          this.vel[i * 3] += Math.sin(t * 1.3) * c.noise * dt;
          this.vel[i * 3 + 2] += Math.cos(t * 1.1) * c.noise * dt;
        }
        if (c.limit) {
          const vx = this.vel[i * 3], vy = this.vel[i * 3 + 1], vz = this.vel[i * 3 + 2];
          const sp = Math.hypot(vx, vy, vz);
          if (sp > c.limit.limit) {
            const ns = sp - (sp - c.limit.limit) * c.limit.dampen;
            const k = ns / sp;
            this.vel[i * 3] *= k; this.vel[i * 3 + 1] *= k; this.vel[i * 3 + 2] *= k;
          }
        }
      }
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
    }
    // write render attributes
    for (let i = 0; i < this.n; i++) {
      const u = this.age[i] / this.life[i];
      let a = 1;
      const curve = c.alphaCurve ?? 'fade';
      if (curve === 'fade') a = u < 0.6 ? 1 - 0.2 * (u / 0.6) : 0.8 * (1 - (u - 0.6) / 0.4);
      else if (curve === 'glow') a = u < 0.4 ? u / 0.4 : 1 - (u - 0.4) / 0.6;
      let sm = 1;
      if (c.sizeOverLife) sm = c.sizeOverLife[0] + (c.sizeOverLife[1] - c.sizeOverLife[0]) * u;
      this.gSize[i] = this.size0[i] * sm;
      let r = this.col0[i * 4], gg = this.col0[i * 4 + 1], b = this.col0[i * 4 + 2];
      if (tint) { r *= 1 + (tint.r - 1) * u; gg *= 1 + (tint.g - 1) * u; b *= 1 + (tint.b - 1) * u; }
      this.gCol[i * 4] = r; this.gCol[i * 4 + 1] = gg; this.gCol[i * 4 + 2] = b; this.gCol[i * 4 + 3] = this.col0[i * 4 + 3] * a;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.n);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = pixelScale;
    if (c.destroyWhenDone && this.burstDone && this.n === 0 && this.rate <= 0) this.destroy();
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

const CONFETTI = [col(1, 0.3, 0.3), col(1, 0.85, 0.2), col(0.3, 0.9, 0.4), col(0.3, 0.6, 1), col(0.9, 0.4, 1)];
const W = () => col(1, 1, 1);

/** One-shot and persistent particle effects (port of Effects.cs). */
export const Effects = {
  setScene(s: THREE.Scene) { scene = s; for (const p of systems) if (!p.dead && !p.points.parent) s.add(p.points); },
  /** pixels per world unit at distance 1 (screen height / (2 tan(fov/2))) */
  setPixelScale(v: number) { pixelScale = v; },
  update(dt: number) {
    for (const s of systems.slice()) if (!s.dead) s.update(dt);
    for (let i = systems.length - 1; i >= 0; i--) if (systems[i].dead) systems.splice(i, 1);
  },

  dust(pos: THREE.Vector3, count: number, color: THREE.Color, alpha = 1) {
    const ps = new ParticleSystem({
      max: count, lifetime: [0.5, 1.1], speed: [0.8, 2.6], size: [0.25, 0.6], color, alpha, gravity: 0.15,
      shape: { type: 'sphere', radius: 0.4 }, sizeOverLife: [0.6, 1.4], destroyWhenDone: true,
    }, pos);
    ps.burst(count);
  },
  snow(pos: THREE.Vector3, count: number) { this.dust(pos, count, col(0.95, 0.97, 1), 0.9); },

  confetti(pos: THREE.Vector3, count = 160) {
    const ps = new ParticleSystem({
      max: count, lifetime: [2, 3.5], speed: [6, 13], size: [0.12, 0.25], color: 'confetti', gravity: 0.55,
      shape: { type: 'cone', angle: 35, radius: 0.5 }, limit: { limit: 6, dampen: 0.08 }, alphaCurve: 'none', destroyWhenDone: true,
    }, pos);
    ps.burst(count);
  },

  explosion(pos: THREE.Vector3, scale: number) {
    const n = Math.floor(220 * scale);
    new ParticleSystem({
      max: Math.min(600, n), lifetime: [1.2, 2.6], speed: [8 * scale, 26 * scale], size: [4 * scale, 11 * scale],
      color: [col(1, 0.9, 0.5), col(1, 0.45, 0.1)], shape: { type: 'sphere', radius: 2 * scale }, endTint: col(0.6, 0.1, 0.05),
      limit: { limit: 4, dampen: 0.06 }, additive: true, destroyWhenDone: true,
    }, pos).burst(n);
    const m = Math.floor(160 * scale);
    new ParticleSystem({
      max: Math.min(400, m), lifetime: [3, 6], speed: [4 * scale, 14 * scale], size: [6 * scale, 16 * scale],
      color: [col(0.25, 0.22, 0.22), col(0.5, 0.45, 0.45)], alpha: 0.75, gravity: -0.05, shape: { type: 'sphere', radius: 3 * scale },
      limit: { limit: 3, dampen: 0.05 }, destroyWhenDone: true,
    }, pos).burst(m);
  },

  sparkle(pos: THREE.Vector3, color: THREE.Color, count = 30) {
    new ParticleSystem({
      max: count, lifetime: [0.4, 0.9], speed: [1.5, 4], size: [0.1, 0.3], color, shape: { type: 'sphere', radius: 0.3 }, additive: true, destroyWhenDone: true,
    }, pos).burst(count);
  },

  /** Persistent snowfall that follows a target. */
  snowFall(follow: THREE.Object3D) {
    return new ParticleSystem({
      max: 1500, lifetime: [6, 6], speed: [0.5, 1.5], size: [0.06, 0.16], color: W(), alpha: 0.85, gravity: 0.05,
      shape: { type: 'box', x: 45, z: 45 }, rate: 60, noise: 0.6, follow, offset: new THREE.Vector3(0, 12, 0), alphaCurve: 'fade',
    }, follow.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 12, 0)));
  },

  /** Persistent wind streaks (enable emission during gusts). */
  windStreaks(follow: THREE.Object3D) {
    return new ParticleSystem({
      max: 300, lifetime: [0.7, 0.7], speed: [0, 0], size: [0.07, 0.07], color: W(), alpha: 0.5,
      shape: { type: 'sphere', radius: 7 }, rate: 0, follow, velocityOverride: new THREE.Vector3(), stretch: 0.12,
    }, follow.getWorldPosition(new THREE.Vector3()));
  },

  fireTrail(follow: THREE.Object3D, scale: number) {
    return new ParticleSystem({
      max: 800, lifetime: [0.8, 1.6], speed: [0.5, 0.5], size: [3 * scale, 7 * scale], color: [col(1, 0.8, 0.3), col(1, 0.35, 0.1)],
      shape: { type: 'sphere', radius: 2.5 * scale }, rate: 160, follow, endTint: col(0.3, 0.1, 0.1), sizeOverLife: [1, 0.2], additive: true,
    }, follow.getWorldPosition(new THREE.Vector3()));
  },

  /** Props.Glow: soft additive glow puffs. */
  glow(pos: THREE.Vector3, color: THREE.Color, size = 4, follow?: THREE.Object3D) {
    return new ParticleSystem({
      max: 20, lifetime: [1.6, 1.6], speed: [0, 0], size: [size * 0.7, size], color, alpha: 0.25,
      shape: { type: 'sphere', radius: 0.2 }, rate: 6, alphaCurve: 'glow', additive: true, follow,
    }, pos);
  },
};
