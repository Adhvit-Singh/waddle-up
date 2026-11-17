import * as THREE from 'three';
import { col, lerpColor, mulRGB } from '../../core/math.ts';
import { MeshBuilder } from '../../world/MeshKit.ts';
import { noise3 } from '../../world/noise.ts';

/**
 * Penguin wardrobe catalog (purely cosmetic). Every item is a set of low-poly parts attached to one of the penguin's
 * animated anchors. Frames (all +Z = forward, +Y = up):
 *   body  – centre of the body ellipsoid (radii 0.36, 0.44, 0.32); belly patch around (0, -0.04, 0.13)
 *   head  – centre of the head ellipsoid (radii 0.27, 0.25, 0.26); face points +Z, top of head ≈ y 0.25
 *   flipL / flipR – flipper pivot at the shoulder; the flipper hangs down to y ≈ -0.44
 *   footL / footR – foot origin; foot ellipsoid at (0, 0, 0.06), radii (0.1, 0.04, 0.16)
 *   root  – between the feet on the ground
 */
export type Category = 'body' | 'eyes' | 'hat' | 'outfit' | 'accessory' | 'feet';
export const CATEGORY_ORDER: Category[] = ['body', 'eyes', 'hat', 'outfit', 'accessory', 'feet'];
export const CATEGORY_LABEL: Record<Category, string> = { body: 'COLOUR', eyes: 'EYES', hat: 'HATS', outfit: 'OUTFITS', accessory: 'EXTRAS', feet: 'FEET' };

export type Anchor = 'body' | 'head' | 'flipL' | 'flipR' | 'footL' | 'footR' | 'root';
export type MatKind = 'normal' | 'ghost' | 'glow' | 'chrome';
export interface Part { anchor: Anchor; mesh: MeshBuilder; material: MatKind; }
type SkinPart = 'body' | 'belly' | 'head' | 'face' | 'flipper';
export interface Palette { fn: (part: SkinPart, p: THREE.Vector3) => THREE.Color; material?: MatKind; }
type Builder = (add: (anchor: Anchor, build: (mb: MeshBuilder) => void, material?: MatKind) => void) => void;
export interface Item { id: string; name: string; build?: Builder; palette?: Palette; }

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const C = col;
const BLACK = C(0.05, 0.05, 0.07), WHITE = C(0.97, 0.97, 0.97), NAVY = C(0.13, 0.15, 0.24), BELLY = C(0.97, 0.97, 0.95);
const ORANGE = C(1, 0.55, 0.12), RED = C(0.9, 0.2, 0.22), GOLD = C(1, 0.78, 0.2), PINK = C(1, 0.45, 0.7), BROWN = C(0.45, 0.28, 0.15);
const SILVER = C(0.75, 0.77, 0.8), GREEN = C(0.25, 0.75, 0.3), BLUE = C(0.2, 0.45, 0.95), YELLOW = C(1, 0.9, 0.15), PURPLE = C(0.55, 0.3, 0.85);

// ------------------------------------------------------------------ shape helpers
const S = (mb: MeshBuilder, c: THREE.Vector3, r: THREE.Vector3 | number, color: THREE.Color, lon = 8, lat = 5) =>
  mb.sphere(c, typeof r === 'number' ? V(r, r, r) : r, color, lon, lat);
const B = (mb: MeshBuilder, c: THREE.Vector3, size: THREE.Vector3, color: THREE.Color, top?: THREE.Color) => mb.box(c, size, color, top ?? color);

/** vertical (frustum) cylinder from base centre c */
function cyl(mb: MeshBuilder, c: THREE.Vector3, r: number, h: number, color: THREE.Color, segs = 8, rTop = r, capColor = color) {
  const ring = (y: number, rr: number) => Array.from({ length: segs }, (_, i) => V(c.x + Math.cos(i / segs * Math.PI * 2) * rr, c.y + y, c.z + Math.sin(i / segs * Math.PI * 2) * rr));
  const a = ring(0, r), b = ring(h, rTop);
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    const out = a[i].clone().add(a[j]).multiplyScalar(0.5).sub(c); out.y = 0;
    mb.quad(a[i], a[j], b[j], b[i], color, out);
    if (rTop > 0.001) mb.tri(b[i], b[j], V(c.x, c.y + h, c.z), capColor, V(0, 1, 0));
    mb.tri(a[i], a[j], V(c.x, c.y, c.z), mulRGB(color, 0.7), V(0, -1, 0));
  }
}
/** a ring of small spheres (torus-ish) around centre, in the plane given by axes u,v */
function ring(mb: MeshBuilder, c: THREE.Vector3, R: number, r: number, color: THREE.Color | ((k: number) => THREE.Color), n = 12, u = V(1, 0, 0), v = V(0, 0, 1)) {
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2;
    const p = c.clone().addScaledVector(u, Math.cos(a) * R).addScaledVector(v, Math.sin(a) * R);
    S(mb, p, r, typeof color === 'function' ? color(k) : color, 6, 4);
  }
}
/** a band hugging the body ellipsoid between two heights (body frame), slightly bigger than the body */
function bodyBand(mb: MeshBuilder, y0: number, y1: number, color: THREE.Color | ((th: number, y: number) => THREE.Color), grow = 0.025, segs = 14) {
  const rx = (y: number) => 0.36 * Math.sqrt(Math.max(0.05, 1 - (y / 0.44) ** 2)) + grow;
  const rz = (y: number) => 0.32 * Math.sqrt(Math.max(0.05, 1 - (y / 0.44) ** 2)) + grow;
  const steps = Math.max(1, Math.round((y1 - y0) / 0.08));
  for (let s = 0; s < steps; s++) {
    const ya = y0 + (y1 - y0) * s / steps, yb = y0 + (y1 - y0) * (s + 1) / steps;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs * Math.PI * 2, t1 = (i + 1) / segs * Math.PI * 2;
      const p = (t: number, y: number) => V(Math.sin(t) * rx(y), y, Math.cos(t) * rz(y));
      const cc = typeof color === 'function' ? color((t0 + t1) / 2, (ya + yb) / 2) : color;
      mb.quad(p(t0, ya), p(t1, ya), p(t1, yb), p(t0, yb), cc, V(Math.sin((t0 + t1) / 2), 0, Math.cos((t0 + t1) / 2)));
    }
  }
}

// ------------------------------------------------------------------ body colour schemes
const two = (main: THREE.Color, belly: THREE.Color): Palette['fn'] => (part) => (part === 'belly' || part === 'face' ? belly : main);
const stripes = (cols: THREE.Color[], scale: number): Palette['fn'] => (part, p) =>
  part === 'belly' || part === 'face' ? lerpColor(cols[Math.floor((p.y + 2) * scale) % cols.length], WHITE, 0.55) : cols[Math.floor((p.y + 2) * scale) % cols.length];
const spots = (base: THREE.Color, spot: THREE.Color, freq: number, cut: number, bellyBase = base): Palette['fn'] => (part, p) =>
  noise3(p.x * freq + 3, p.y * freq, p.z * freq, 11) > cut ? spot : (part === 'belly' || part === 'face' ? bellyBase : base);

const BODY: Item[] = [
  { id: 'classic', name: 'Classic Navy', palette: { fn: two(NAVY, BELLY) } },
  { id: 'hot-pink', name: 'Hot Pink', palette: { fn: two(C(0.95, 0.25, 0.6), C(1, 0.85, 0.92)) } },
  { id: 'toxic', name: 'Toxic Green', palette: { fn: two(C(0.35, 0.85, 0.1), C(0.85, 1, 0.4)) } },
  { id: 'gold', name: 'Gold Chrome', palette: { fn: two(C(1, 0.72, 0.15), C(1, 0.9, 0.55)), material: 'chrome' } },
  { id: 'rainbow', name: 'Rainbow Stripes', palette: { fn: stripes([RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE], 12) } },
  { id: 'zebra', name: 'Zebra', palette: { fn: (part, p) => (Math.sin(p.y * 38 + Math.sin(p.x * 9) * 2) > 0.1 ? BLACK : WHITE) } },
  { id: 'leopard', name: 'Leopard', palette: { fn: spots(C(0.92, 0.68, 0.3), C(0.25, 0.15, 0.08), 14, 0.66, C(1, 0.9, 0.7)) } },
  { id: 'ghost', name: 'See-Through Ghost', palette: { fn: two(C(0.9, 0.95, 1), WHITE), material: 'ghost' } },
  { id: 'toast', name: 'Burnt Toast', palette: { fn: (part, p) => (part === 'belly' || part === 'face' ? C(0.9, 0.72, 0.45) : noise3(p.x * 9, p.y * 9, p.z * 9, 5) > 0.6 ? C(0.18, 0.1, 0.05) : C(0.55, 0.32, 0.12)) } },
  { id: 'snow-camo', name: 'Snow Camo (useless)', palette: { fn: (_part, p) => [WHITE, C(0.82, 0.86, 0.9), C(0.66, 0.7, 0.76)][Math.floor(noise3(p.x * 7, p.y * 7, p.z * 7, 9) * 2.99)] } },
  { id: 'glow', name: 'Glow-in-the-Dark', palette: { fn: two(C(0.2, 1, 0.75), C(0.8, 1, 0.95)), material: 'glow' } },
  { id: 'cow', name: 'Cow', palette: { fn: spots(WHITE, BLACK, 6, 0.62) } },
  { id: 'galaxy', name: 'Galaxy', palette: { fn: (_part, p) => (noise3(p.x * 40, p.y * 40, p.z * 40, 21) > 0.88 ? WHITE : lerpColor(C(0.12, 0.05, 0.3), C(0.35, 0.1, 0.55), noise3(p.x * 4, p.y * 4, p.z * 4, 22))) } },
  { id: 'cone-orange', name: 'Traffic-Cone Orange', palette: { fn: stripes([C(1, 0.42, 0.05), C(1, 0.42, 0.05), WHITE], 9) } },
];

// ------------------------------------------------------------------ eyes (head frame; eye spots ≈ (±0.09, 0.06, 0.22))
const eyePair = (fn: (mb: MeshBuilder, x: number, side: 1 | -1) => void): Builder => add => add('head', mb => { fn(mb, 0.09, 1); fn(mb, -0.09, -1); });
const EYES: Item[] = [
  { id: 'googly', name: 'Mismatched Googly', build: add => add('head', mb => {
    S(mb, V(0.085, 0.05, 0.22), 0.065, WHITE); S(mb, V(0.097, 0.04, 0.27), 0.03, BLACK);
    S(mb, V(-0.09, 0.07, 0.215), 0.085, WHITE); S(mb, V(-0.07, 0.085, 0.285), 0.034, BLACK);
  }) },
  { id: 'anime', name: 'Anime Sparkle', build: eyePair((mb, x) => { S(mb, V(x, 0.06, 0.21), V(0.075, 0.1, 0.05), WHITE); S(mb, V(x, 0.05, 0.25), V(0.055, 0.08, 0.02), C(0.2, 0.5, 1)); S(mb, V(x + 0.02, 0.09, 0.27), 0.018, WHITE); }) },
  { id: 'dots', name: 'Tiny Dots', build: eyePair((mb, x) => S(mb, V(x * 0.8, 0.06, 0.24), 0.022, BLACK)) },
  { id: 'cyclops', name: 'Cyclops', build: add => add('head', mb => { S(mb, V(0, 0.07, 0.21), 0.11, WHITE); S(mb, V(0, 0.07, 0.3), 0.05, C(0.3, 0.7, 0.2)); S(mb, V(0, 0.07, 0.34), 0.022, BLACK); }) },
  { id: 'hypno', name: 'Hypno Spirals', build: eyePair((mb, x) => { S(mb, V(x, 0.06, 0.22), 0.075, WHITE); ring(mb, V(x, 0.06, 0.285), 0.045, 0.012, k => (k % 2 ? BLACK : PURPLE), 10, V(1, 0, 0), V(0, 1, 0)); S(mb, V(x, 0.06, 0.29), 0.015, BLACK); }) },
  { id: 'angry', name: 'Angry Brows', build: eyePair((mb, x, side) => { S(mb, V(x, 0.05, 0.22), 0.06, WHITE); S(mb, V(x, 0.045, 0.27), 0.028, BLACK); B(mb, V(x, 0.13 - side * 0.0, 0.25), V(0.11, 0.025, 0.03), BLACK); }) },
  { id: 'sleepy', name: 'Sleepy', build: eyePair((mb, x) => { S(mb, V(x, 0.05, 0.22), V(0.065, 0.03, 0.05), WHITE); B(mb, V(x, 0.07, 0.25), V(0.12, 0.03, 0.04), NAVY); }) },
  { id: 'hearts', name: 'Heart Eyes', build: eyePair((mb, x) => { S(mb, V(x - 0.022, 0.07, 0.24), 0.035, RED); S(mb, V(x + 0.022, 0.07, 0.24), 0.035, RED); mb.coneAxis(V(x, 0.055, 0.24), V(0, -1, 0), 0.05, 0.06, RED, 6); }) },
  { id: 'pixel-shades', name: 'Deal-With-It Shades', build: add => add('head', mb => { B(mb, V(0, 0.07, 0.25), V(0.34, 0.05, 0.04), BLACK); B(mb, V(0.09, 0.04, 0.25), V(0.1, 0.05, 0.04), BLACK); B(mb, V(-0.09, 0.04, 0.25), V(0.1, 0.05, 0.04), BLACK); B(mb, V(0.06, 0.08, 0.275), V(0.03, 0.015, 0.01), WHITE); }) },
  { id: 'crying', name: 'Crying Waterfalls', build: eyePair((mb, x) => { S(mb, V(x, 0.05, 0.22), 0.06, WHITE); S(mb, V(x, 0.045, 0.27), 0.026, BLACK); B(mb, V(x, -0.08, 0.255), V(0.03, 0.22, 0.02), C(0.4, 0.7, 1)); }) },
  { id: 'stalks', name: 'Snail Stalks', build: eyePair((mb, x) => { cyl(mb, V(x, 0.12, 0.12), 0.015, 0.22, NAVY, 6); S(mb, V(x, 0.36, 0.12), 0.05, WHITE); S(mb, V(x, 0.36, 0.165), 0.022, BLACK); }) },
  { id: 'xx', name: 'Knocked Out ✕✕', build: eyePair((mb, x) => { B(mb, V(x, 0.06, 0.25), V(0.11, 0.02, 0.02), BLACK); B(mb, V(x, 0.06, 0.25), V(0.02, 0.11, 0.02), BLACK); }) },
];

// ------------------------------------------------------------------ hats (head frame; brim at y ≈ 0.17)
const hat = (fn: (mb: MeshBuilder) => void): Builder => add => add('head', fn);
const HATS: Item[] = [
  { id: 'beanie', name: 'Red Beanie', build: hat(mb => { S(mb, V(0, 0.15, -0.01), V(0.25, 0.14, 0.25), RED, 9, 5); B(mb, V(0, 0.11, -0.01), V(0.5, 0.07, 0.5), WHITE); S(mb, V(0.03, 0.31, -0.03), 0.07, WHITE, 6, 4); }) },
  { id: 'none', name: 'No Hat' },
  { id: 'traffic-cone', name: 'Traffic Cone', build: hat(mb => { B(mb, V(0, 0.17, 0), V(0.4, 0.04, 0.4), C(1, 0.42, 0.05)); cyl(mb, V(0, 0.19, 0), 0.15, 0.42, C(1, 0.42, 0.05), 10, 0.025); cyl(mb, V(0, 0.32, 0), 0.105, 0.07, WHITE, 10, 0.085); }) },
  { id: 'propeller', name: 'Propeller Cap', build: hat(mb => { S(mb, V(0, 0.16, 0), V(0.25, 0.13, 0.25), BLUE, 8, 4); S(mb, V(0, 0.16, 0), V(0.255, 0.1, 0.255), k(YELLOW), 8, 3); cyl(mb, V(0, 0.27, 0), 0.015, 0.1, SILVER); B(mb, V(0, 0.38, 0), V(0.42, 0.015, 0.06), RED); B(mb, V(0, 0.38, 0), V(0.06, 0.015, 0.42), GREEN); }) },
  { id: 'viking', name: 'Viking Helmet', build: hat(mb => { S(mb, V(0, 0.14, 0), V(0.27, 0.16, 0.27), SILVER, 9, 5); mb.coneAxis(V(0.22, 0.2, 0), V(0.7, 1, 0), 0.05, 0.22, C(0.95, 0.92, 0.8), 6); mb.coneAxis(V(-0.22, 0.2, 0), V(-0.7, 1, 0), 0.05, 0.22, C(0.95, 0.92, 0.8), 6); }) },
  { id: 'chef', name: 'Chef Hat', build: hat(mb => { cyl(mb, V(0, 0.15, 0), 0.19, 0.16, WHITE, 10); S(mb, V(0, 0.38, 0), V(0.25, 0.14, 0.25), WHITE); S(mb, V(0.12, 0.4, 0.05), 0.12, WHITE); S(mb, V(-0.12, 0.4, -0.04), 0.12, WHITE); }) },
  { id: 'plunger', name: 'Toilet Plunger', build: hat(mb => { S(mb, V(0, 0.2, 0), V(0.14, 0.09, 0.14), C(0.8, 0.1, 0.1), 8, 4); cyl(mb, V(0, 0.27, 0), 0.025, 0.55, C(0.75, 0.55, 0.3)); }) },
  { id: 'party', name: 'Party Hat', build: hat(mb => { mb.cone(V(0, 0.18, 0), 0.14, 0.36, k(PINK), 8); S(mb, V(0, 0.55, 0), 0.04, YELLOW, 6, 4); }) },
  { id: 'pizza', name: 'A Slice of Pizza', build: hat(mb => { mb.tri(V(-0.25, 0.22, -0.2), V(0.25, 0.22, -0.2), V(0, 0.24, 0.32), C(1, 0.8, 0.3), V(0, 1, 0)); B(mb, V(0, 0.22, -0.2), V(0.52, 0.06, 0.07), C(0.8, 0.5, 0.2)); for (const p of [V(-0.08, 0.255, -0.08), V(0.09, 0.255, -0.05), V(0, 0.255, 0.1)]) S(mb, p, V(0.045, 0.012, 0.045), RED, 6, 3); }) },
  { id: 'top-hat', name: 'Top Hat & Monocle', build: hat(mb => { cyl(mb, V(0, 0.16, 0), 0.3, 0.025, BLACK, 12); cyl(mb, V(0, 0.18, 0), 0.17, 0.32, BLACK, 12); cyl(mb, V(0, 0.2, 0), 0.175, 0.05, RED, 12); ring(mb, V(0.09, 0.05, 0.27), 0.05, 0.008, GOLD, 10, V(1, 0, 0), V(0, 1, 0)); }) },
  { id: 'crown', name: 'Crown', build: hat(mb => { cyl(mb, V(0, 0.16, 0), 0.17, 0.08, GOLD, 10); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; mb.cone(V(Math.cos(a) * 0.15, 0.24, Math.sin(a) * 0.15), 0.04, 0.1, GOLD, 5); S(mb, V(Math.cos(a) * 0.17, 0.2, Math.sin(a) * 0.17), 0.02, i % 2 ? RED : BLUE, 5, 3); } }) },
  { id: 'fishbowl', name: 'Fishbowl Helmet', build: add => { add('head', mb => S(mb, V(0, 0.02, 0.02), 0.4, C(0.7, 0.9, 1), 12, 8), 'ghost'); add('head', mb => { S(mb, V(0.1, 0.25, 0.12), V(0.06, 0.04, 0.03), ORANGE, 6, 4); mb.coneAxis(V(0.04, 0.25, 0.12), V(-1, 0, 0), 0.035, 0.05, ORANGE, 4); }); } },
  { id: 'banana', name: 'Banana', build: hat(mb => { for (let i = 0; i < 7; i++) { const a = -1 + i / 6 * 2; S(mb, V(Math.sin(a) * 0.25, 0.22 + Math.cos(a) * 0.1, 0), V(0.06, 0.06, 0.07), i === 0 || i === 6 ? BROWN : YELLOW, 6, 4); } }) },
  { id: 'bucket', name: 'Bucket', build: hat(mb => { cyl(mb, V(0, 0.08, 0), 0.24, 0.3, C(0.55, 0.6, 0.65), 10, 0.2, C(0.45, 0.5, 0.55)); ring(mb, V(0, 0.14, 0), 0.25, 0.012, SILVER, 14, V(1, 0, 0), V(0, 1, 0)); }) },
  { id: 'mini-penguin', name: 'A Tinier Penguin', build: hat(mb => { S(mb, V(0, 0.33, 0), V(0.11, 0.14, 0.1), NAVY); S(mb, V(0, 0.31, 0.04), V(0.08, 0.11, 0.07), BELLY); S(mb, V(0, 0.49, 0.01), 0.08, NAVY); mb.coneAxis(V(0, 0.48, 0.08), V(0, 0, 1), 0.025, 0.06, ORANGE, 5); S(mb, V(0.03, 0.51, 0.065), 0.018, WHITE, 5, 3); S(mb, V(-0.03, 0.51, 0.065), 0.018, WHITE, 5, 3); }) },
  { id: 'wizard', name: 'Wizard Hat', build: hat(mb => { cyl(mb, V(0, 0.16, 0), 0.32, 0.025, PURPLE, 12); mb.cone(V(0, 0.18, 0), 0.19, 0.55, PURPLE, 9); S(mb, V(0.05, 0.4, 0.13), 0.03, YELLOW, 5, 3); S(mb, V(-0.08, 0.3, 0.14), 0.025, YELLOW, 5, 3); }) },
];
function k(c: THREE.Color) { return c; }

// ------------------------------------------------------------------ outfits (body frame + flippers)
const OUTFITS: Item[] = [
  { id: 'none', name: 'Nothing (classy)' },
  { id: 'tuxedo', name: 'Tuxedo (a penguin in a tuxedo)', build: add => add('body', mb => {
    bodyBand(mb, -0.3, 0.32, (th) => (Math.abs(Math.sin(th / 2 - Math.PI / 2)) > 0.93 ? WHITE : BLACK));
    mb.coneAxis(V(0.05, 0.28, 0.33), V(1, 0, 0), 0.04, 0.08, BLACK, 4); mb.coneAxis(V(-0.05, 0.28, 0.33), V(-1, 0, 0), 0.04, 0.08, BLACK, 4);
    for (const y of [0.1, 0, -0.1]) S(mb, V(0, y, 0.345), 0.018, BLACK, 5, 3);
  }) },
  { id: 'hawaiian', name: 'Hawaiian Shirt', build: add => add('body', mb => bodyBand(mb, -0.25, 0.33, (th, y) => (noise3(th * 3, y * 12, 1, 4) > 0.62 ? (noise3(th, y, 2, 6) > 0.5 ? YELLOW : PINK) : C(0.1, 0.65, 0.65)))) },
  { id: 'tutu', name: 'Tiny Tutu', build: add => add('body', mb => { for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; mb.coneAxis(V(Math.sin(a) * 0.3, -0.2, Math.cos(a) * 0.27), V(Math.sin(a), -0.25, Math.cos(a)), 0.07, 0.2, i % 2 ? PINK : C(1, 0.7, 0.85), 5); } }) },
  { id: 'cape', name: 'Superhero Cape', build: add => add('body', mb => { mb.quad(V(-0.28, 0.3, -0.3), V(0.28, 0.3, -0.3), V(0.42, -0.42, -0.42), V(-0.42, -0.42, -0.42), RED, V(0, 0, -1)); mb.quad(V(-0.28, 0.3, -0.3), V(0.28, 0.3, -0.3), V(0.42, -0.42, -0.42), V(-0.42, -0.42, -0.42), C(0.6, 0.1, 0.12), V(0, 0, 1)); S(mb, V(0, 0.3, 0.3), 0.04, GOLD, 6, 4); }) },
  { id: 'hi-vis', name: 'Hi-Vis Vest', build: add => add('body', mb => bodyBand(mb, -0.2, 0.3, (_th, y) => (Math.abs(y - 0.02) < 0.04 || Math.abs(y + 0.12) < 0.03 ? SILVER : C(0.85, 1, 0.1)))) },
  { id: 'pool-ring', name: 'Inflatable Pool Ring', build: add => add('body', mb => ring(mb, V(0, -0.12, 0), 0.38, 0.11, i => (i % 2 ? WHITE : C(1, 0.35, 0.3)), 16)) },
  { id: 'hot-dog', name: 'Hot-Dog Costume', build: add => add('body', mb => { S(mb, V(0.25, -0.02, 0), V(0.14, 0.5, 0.3), C(0.92, 0.7, 0.4)); S(mb, V(-0.25, -0.02, 0), V(0.14, 0.5, 0.3), C(0.92, 0.7, 0.4)); S(mb, V(0, 0.48, -0.05), V(0.1, 0.12, 0.2), C(0.85, 0.35, 0.2)); for (let i = 0; i < 5; i++) S(mb, V(0, 0.4 - i * 0.18, 0.31), V(0.04, 0.025, 0.02), YELLOW, 5, 3); }) },
  { id: 'astronaut', name: 'Astronaut Suit', build: add => { add('body', mb => { bodyBand(mb, -0.4, 0.4, WHITE, 0.035); B(mb, V(0, 0.05, 0.36), V(0.2, 0.15, 0.05), C(0.3, 0.35, 0.45)); S(mb, V(-0.05, 0.08, 0.39), 0.02, RED, 5, 3); S(mb, V(0.05, 0.08, 0.39), 0.02, GREEN, 5, 3); B(mb, V(0, 0, -0.38), V(0.3, 0.4, 0.14), SILVER); }); add('head', mb => S(mb, V(0, 0.02, 0.02), 0.38, C(0.85, 0.95, 1), 12, 8), 'ghost'); } },
  { id: 'xmas-sweater', name: 'Christmas Sweater', build: add => add('body', mb => bodyBand(mb, -0.3, 0.34, (th, y) => (Math.abs(y - 0.12) < 0.04 ? WHITE : (Math.floor(th * 5) + Math.floor(y * 20)) % 5 === 0 ? GREEN : C(0.8, 0.12, 0.15)))) },
  { id: 'prisoner', name: 'Prisoner Stripes', build: add => add('body', mb => bodyBand(mb, -0.36, 0.34, (_th, y) => (Math.floor((y + 1) * 14) % 2 ? BLACK : WHITE))) },
  { id: 'box-armour', name: 'Cardboard Box Armour', build: add => add('body', mb => { B(mb, V(0, -0.05, 0), V(0.82, 0.62, 0.74), C(0.72, 0.55, 0.32), C(0.62, 0.45, 0.25)); B(mb, V(0, 0.05, 0.375), V(0.3, 0.12, 0.005), C(0.3, 0.2, 0.1)); }) },
];

// ------------------------------------------------------------------ accessories
const ACCESSORIES: Item[] = [
  { id: 'none', name: 'Nothing' },
  { id: 'scarf', name: 'Scarf', build: add => add('body', mb => { bodyBand(mb, 0.33, 0.42, C(0.2, 0.6, 0.9), 0.04); B(mb, V(0.12, 0.18, 0.33), V(0.09, 0.3, 0.04), C(0.2, 0.6, 0.9)); }) },
  { id: 'bow-tie', name: 'Bow Tie', build: add => add('body', mb => { mb.coneAxis(V(0, 0.33, 0.31), V(1, 0, 0.2), 0.05, 0.1, RED, 4); mb.coneAxis(V(0, 0.33, 0.31), V(-1, 0, 0.2), 0.05, 0.1, RED, 4); S(mb, V(0, 0.33, 0.32), 0.025, C(0.6, 0.1, 0.1), 5, 3); }) },
  { id: 'gold-chain', name: 'Gold Chain', build: add => add('body', mb => { ring(mb, V(0, 0.3, 0.02), 0.27, 0.025, GOLD, 18, V(1, 0, 0), V(0, -0.45, 0.89)); S(mb, V(0, 0.1, 0.33), V(0.06, 0.07, 0.02), GOLD, 6, 4); }) },
  { id: 'moustache', name: 'Fake Moustache', build: add => add('head', mb => { S(mb, V(0.06, -0.09, 0.27), V(0.07, 0.025, 0.03), BROWN, 6, 3); S(mb, V(-0.06, -0.09, 0.27), V(0.07, 0.025, 0.03), BROWN, 6, 3); }) },
  { id: 'clown-nose', name: 'Clown Nose', build: add => add('head', mb => S(mb, V(0, -0.04, 0.44), 0.055, RED, 8, 5)) },
  { id: 'rubber-duck', name: 'Rubber Duck', build: add => add('flipL', mb => { S(mb, V(0.12, -0.35, 0.08), V(0.07, 0.06, 0.09), YELLOW); S(mb, V(0.12, -0.27, 0.12), 0.045, YELLOW); mb.coneAxis(V(0.12, -0.28, 0.16), V(0, 0, 1), 0.02, 0.04, ORANGE, 4); }) },
  { id: 'fish-backpack', name: 'Backpack With a Fish', build: add => add('body', mb => { B(mb, V(0, 0.05, -0.38), V(0.34, 0.4, 0.14), C(0.25, 0.5, 0.3)); S(mb, V(0.06, 0.36, -0.38), V(0.05, 0.12, 0.04), C(0.6, 0.7, 0.8)); mb.coneAxis(V(0.06, 0.46, -0.38), V(0, 1, 0), 0.06, 0.07, C(0.6, 0.7, 0.8), 4); }) },
  { id: 'jetpack', name: 'Jetpack (does nothing)', build: add => add('body', mb => { cyl(mb, V(0.1, -0.2, -0.4), 0.08, 0.45, SILVER, 8); cyl(mb, V(-0.1, -0.2, -0.4), 0.08, 0.45, SILVER, 8); mb.coneAxis(V(0.1, -0.2, -0.4), V(0, -1, 0), 0.06, 0.12, C(1, 0.5, 0.1), 6); mb.coneAxis(V(-0.1, -0.2, -0.4), V(0, -1, 0), 0.06, 0.12, C(1, 0.5, 0.1), 6); }) },
  { id: 'angel-wings', name: 'Angel Wings', build: add => add('body', mb => { S(mb, V(0.28, 0.2, -0.36), V(0.26, 0.12, 0.04), WHITE); S(mb, V(-0.28, 0.2, -0.36), V(0.26, 0.12, 0.04), WHITE); }) },
  { id: 'devil-tail', name: 'Devil Tail', build: add => add('body', mb => { cyl(mb, V(0, -0.35, -0.3), 0.02, 0.3, RED, 6); mb.coneAxis(V(0, -0.05, -0.34), V(0, 0.4, -1), 0.06, 0.1, RED, 4); }) },
  { id: 'balloon', name: 'Balloon on the Flipper', build: add => add('flipR', mb => { cyl(mb, V(-0.05, -0.4, 0), 0.006, 0.9, WHITE, 4); S(mb, V(-0.05, 0.62, 0), V(0.16, 0.2, 0.16), RED, 9, 6); }) },
  { id: 'tp-trail', name: 'Toilet-Paper Trail', build: add => add('root', mb => { for (let i = 0; i < 6; i++) B(mb, V(0.05 + Math.sin(i) * 0.05, 0.012, -0.35 - i * 0.16), V(0.12, 0.01, 0.15), WHITE); cyl(mb, V(0.05, 0.03, -0.32), 0.05, 0.09, WHITE, 8); }) },
  { id: 'monocle', name: 'Monocle', build: add => add('head', mb => { ring(mb, V(-0.09, 0.07, 0.27), 0.06, 0.009, GOLD, 12, V(1, 0, 0), V(0, 1, 0)); cyl(mb, V(-0.14, -0.25, 0.25), 0.004, 0.28, GOLD, 4); }) },
  { id: 'detective', name: 'Pipe & Deerstalker', build: add => add('head', mb => { S(mb, V(0, 0.16, 0), V(0.25, 0.12, 0.27), C(0.55, 0.42, 0.28)); B(mb, V(0, 0.14, 0.28), V(0.2, 0.02, 0.08), C(0.45, 0.33, 0.2)); B(mb, V(0, 0.14, -0.28), V(0.2, 0.02, 0.08), C(0.45, 0.33, 0.2)); cyl(mb, V(0.08, -0.12, 0.3), 0.012, 0.12, BROWN, 5); S(mb, V(0.08, -0.04, 0.38), V(0.04, 0.05, 0.04), BROWN, 6, 4); }) },
  { id: 'nerd-glasses', name: 'Taped Nerd Glasses', build: add => add('head', mb => { for (const x of [0.09, -0.09]) ring(mb, V(x, 0.06, 0.29), 0.06, 0.012, BLACK, 12, V(1, 0, 0), V(0, 1, 0)); B(mb, V(0, 0.06, 0.3), V(0.06, 0.025, 0.025), WHITE); }) },
  { id: 'groucho', name: 'Groucho Glasses', build: add => add('head', mb => { for (const x of [0.09, -0.09]) ring(mb, V(x, 0.06, 0.29), 0.055, 0.01, BLACK, 12, V(1, 0, 0), V(0, 1, 0)); B(mb, V(0, 0.13, 0.29), V(0.28, 0.03, 0.03), BLACK); S(mb, V(0, -0.02, 0.36), V(0.05, 0.07, 0.06), C(1, 0.75, 0.65)); S(mb, V(0, -0.09, 0.31), V(0.12, 0.03, 0.03), BLACK); }) },
  { id: 'lollipop', name: 'Giant Lollipop', build: add => add('flipL', mb => { cyl(mb, V(0.1, -0.4, 0.05), 0.012, 0.55, WHITE, 5); S(mb, V(0.1, 0.22, 0.05), V(0.17, 0.17, 0.04), PINK, 10, 6); ring(mb, V(0.1, 0.22, 0.095), 0.09, 0.02, WHITE, 10, V(1, 0, 0), V(0, 1, 0)); }) },
  { id: 'fish-sword', name: 'Sword Through a Fish', build: add => add('flipR', mb => { B(mb, V(-0.1, 0.1, 0.1), V(0.025, 0.9, 0.06), SILVER); B(mb, V(-0.1, -0.38, 0.1), V(0.16, 0.03, 0.06), GOLD); S(mb, V(-0.1, 0.25, 0.1), V(0.06, 0.14, 0.05), C(0.5, 0.65, 0.8)); }) },
  { id: 'guitar', name: 'Guitar on the Back', build: add => add('body', mb => { S(mb, V(0, -0.1, -0.4), V(0.2, 0.22, 0.06), C(0.85, 0.45, 0.15)); B(mb, V(0, 0.35, -0.4), V(0.07, 0.6, 0.04), BROWN); S(mb, V(0, -0.05, -0.46), 0.05, BLACK, 6, 4); }) },
  { id: 'umbrella', name: 'Tiny Umbrella', build: add => add('flipL', mb => { cyl(mb, V(0.1, -0.4, 0.05), 0.01, 0.9, BLACK, 4); mb.cone(V(0.1, 0.45, 0.05), 0.32, 0.18, k(C(0.3, 0.6, 1)), 8); }) },
  { id: 'snorkel', name: 'Snorkel & Mask', build: add => add('head', mb => { B(mb, V(0, 0.06, 0.27), V(0.3, 0.1, 0.05), C(0.6, 0.85, 1)); B(mb, V(0, 0.12, 0.25), V(0.34, 0.025, 0.06), BLACK); cyl(mb, V(0.22, -0.05, 0.1), 0.02, 0.45, C(1, 0.8, 0.1), 6); }) },
  { id: 'lei', name: 'Flower Lei', build: add => add('body', mb => ring(mb, V(0, 0.3, 0.02), 0.28, 0.05, i => [PINK, YELLOW, C(1, 0.4, 0.2), PURPLE][i % 4], 16, V(1, 0, 0), V(0, -0.45, 0.89))) },
  { id: 'sheriff', name: 'Sheriff Badge', build: add => add('body', mb => { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; mb.coneAxis(V(0.15, 0.12, 0.31), V(Math.cos(a), Math.sin(a), 0), 0.035, 0.08, GOLD, 4); } S(mb, V(0.15, 0.12, 0.32), 0.035, GOLD, 6, 4); }) },
  { id: 'headphones', name: 'Headphones', build: add => add('head', mb => { ring(mb, V(0, 0.04, 0), 0.29, 0.02, BLACK, 10, V(1, 0, 0), V(0, 1, 0)); S(mb, V(0.28, 0, 0), V(0.05, 0.09, 0.09), C(0.9, 0.15, 0.2)); S(mb, V(-0.28, 0, 0), V(0.05, 0.09, 0.09), C(0.9, 0.15, 0.2)); }) },
  { id: 'rock-sign', name: '"I ❤ ROCKS" Sign', build: add => add('flipR', mb => { cyl(mb, V(-0.08, -0.4, 0.1), 0.012, 0.7, BROWN, 5); B(mb, V(-0.08, 0.38, 0.1), V(0.4, 0.24, 0.02), C(0.82, 0.68, 0.48)); S(mb, V(-0.08, 0.38, 0.115), V(0.05, 0.05, 0.01), RED, 6, 3); }) },
  { id: 'hero-cape', name: 'Tiny Hero Cape', build: add => add('body', mb => { mb.quad(V(-0.18, 0.32, -0.3), V(0.18, 0.32, -0.3), V(0.24, -0.05, -0.37), V(-0.24, -0.05, -0.37), BLUE, V(0, 0, -1)); mb.quad(V(-0.18, 0.32, -0.3), V(0.18, 0.32, -0.3), V(0.24, -0.05, -0.37), V(-0.24, -0.05, -0.37), C(0.1, 0.25, 0.6), V(0, 0, 1)); }) },
  { id: 'bandana', name: 'Bandana', build: add => add('head', mb => { ring(mb, V(0, 0.1, 0), 0.26, 0.03, RED, 14, V(1, 0, 0), V(0, 0, 1)); mb.coneAxis(V(0, 0.1, -0.25), V(0.3, -0.5, -1), 0.06, 0.15, RED, 4); }) },
  { id: 'baguette', name: 'Baguette', build: add => add('flipL', mb => S(mb, V(0.1, -0.25, 0.12), V(0.05, 0.05, 0.4), C(0.85, 0.6, 0.3), 8, 4)) },
  { id: 'toaster', name: 'Toaster Strapped On', build: add => add('body', mb => { B(mb, V(0, 0.05, -0.42), V(0.36, 0.26, 0.2), SILVER, C(0.6, 0.6, 0.65)); B(mb, V(0.07, 0.22, -0.42), V(0.09, 0.08, 0.12), C(0.85, 0.6, 0.3)); B(mb, V(-0.07, 0.22, -0.42), V(0.09, 0.08, 0.12), C(0.85, 0.6, 0.3)); B(mb, V(0, 0.05, -0.31), V(0.42, 0.04, 0.02), BLACK); }) },
];

// ------------------------------------------------------------------ feet (both feet; foot frame)
const feetPair = (fn: (mb: MeshBuilder) => void): Builder => add => { add('footL', fn); add('footR', fn); };
const FEET: Item[] = [
  { id: 'classic', name: 'Classic Orange', build: feetPair(mb => S(mb, V(0, 0, 0.06), V(0.1, 0.04, 0.16), ORANGE, 7, 4)) },
  { id: 'rain-boots', name: 'Rain Boots', build: feetPair(mb => { cyl(mb, V(0, -0.04, 0), 0.09, 0.22, YELLOW, 8); S(mb, V(0, -0.01, 0.08), V(0.1, 0.05, 0.13), YELLOW, 7, 4); }) },
  { id: 'high-heels', name: 'High Heels', build: feetPair(mb => { S(mb, V(0, 0.02, 0.08), V(0.08, 0.04, 0.12), RED, 7, 4); cyl(mb, V(0, -0.04, -0.05), 0.015, 0.09, RED, 5); }) },
  { id: 'roller-skates', name: 'Roller Skates', build: feetPair(mb => { B(mb, V(0, 0.03, 0.05), V(0.16, 0.12, 0.26), WHITE, C(0.95, 0.4, 0.6)); for (const z of [-0.05, 0.14]) for (const x of [-0.06, 0.06]) S(mb, V(x, -0.04, z), 0.035, C(0.3, 0.9, 0.9), 6, 4); }) },
  { id: 'flip-flops', name: 'Flip-Flops', build: feetPair(mb => { S(mb, V(0, 0.01, 0.06), V(0.1, 0.035, 0.16), ORANGE, 7, 4); B(mb, V(0, -0.025, 0.06), V(0.18, 0.02, 0.34), C(0.2, 0.7, 0.95)); B(mb, V(0, 0.03, 0.11), V(0.14, 0.015, 0.02), PINK); }) },
  { id: 'clown-shoes', name: 'Clown Shoes', build: feetPair(mb => { S(mb, V(0, 0.02, 0.18), V(0.13, 0.08, 0.3), RED, 8, 5); S(mb, V(0, 0.08, 0), V(0.08, 0.06, 0.08), YELLOW, 6, 4); }) },
  { id: 'ski-boots', name: 'Ski Boots', build: feetPair(mb => { B(mb, V(0, 0.08, 0.03), V(0.16, 0.22, 0.22), C(0.3, 0.3, 0.35), BLUE); B(mb, V(0, -0.03, 0.06), V(0.07, 0.02, 0.9), C(0.9, 0.2, 0.2)); }) },
  { id: 'bunny-slippers', name: 'Bunny Slippers', build: feetPair(mb => { S(mb, V(0, 0.03, 0.06), V(0.11, 0.07, 0.17), C(1, 0.85, 0.9), 7, 4); S(mb, V(0.04, 0.12, 0.12), V(0.025, 0.07, 0.02), WHITE, 5, 3); S(mb, V(-0.04, 0.12, 0.12), V(0.025, 0.07, 0.02), WHITE, 5, 3); S(mb, V(0, 0.06, 0.22), 0.02, PINK, 5, 3); }) },
  { id: 'gold-sneakers', name: 'Golden Sneakers', build: feetPair(mb => { S(mb, V(0, 0.03, 0.06), V(0.1, 0.06, 0.17), GOLD, 7, 4); B(mb, V(0, -0.02, 0.06), V(0.17, 0.03, 0.32), WHITE); }) },
  { id: 'socks-sandals', name: 'Socks With Sandals', build: feetPair(mb => { cyl(mb, V(0, -0.02, 0), 0.07, 0.16, WHITE, 8); S(mb, V(0, 0.01, 0.07), V(0.09, 0.045, 0.15), WHITE, 7, 4); B(mb, V(0, -0.03, 0.06), V(0.16, 0.02, 0.32), BROWN); B(mb, V(0, 0.03, 0.08), V(0.17, 0.015, 0.03), BROWN); }) },
];

export const CATALOG: Record<Category, Item[]> = { body: BODY, eyes: EYES, hat: HATS, outfit: OUTFITS, accessory: ACCESSORIES, feet: FEET };
export type OutfitIds = Record<Category, string>;
export const DEFAULT_OUTFIT: OutfitIds = { body: 'classic', eyes: 'googly', hat: 'beanie', outfit: 'none', accessory: 'none', feet: 'classic' };

/** Skin (body colour) parts: body, belly, head, face patch and both flippers, coloured by the palette. */
function buildSkin(pal: Palette): Part[] {
  const mat = pal.material ?? 'normal';
  const skin = (part: SkinPart, c: THREE.Vector3, r: THREE.Vector3, lon = 10, lat = 7) => {
    const mb = new MeshBuilder();
    mb.sphereFn(c, r, mid => pal.fn(part, mid), lon, lat);
    return mb;
  };
  return [
    { anchor: 'body', mesh: skin('body', V(), V(0.36, 0.44, 0.32)), material: mat },
    { anchor: 'body', mesh: skin('belly', V(0, -0.04, 0.13), V(0.27, 0.36, 0.22)), material: mat },
    { anchor: 'head', mesh: skin('head', V(), V(0.27, 0.25, 0.26)), material: mat },
    { anchor: 'head', mesh: skin('face', V(0, -0.02, 0.11), V(0.2, 0.17, 0.17), 9, 6), material: mat },
    { anchor: 'flipL', mesh: skin('flipper', V(0.04, -0.2, 0), V(0.06, 0.24, 0.13), 7, 5), material: mat },
    { anchor: 'flipR', mesh: skin('flipper', V(-0.04, -0.2, 0), V(0.06, 0.24, 0.13), 7, 5), material: mat },
  ];
}

export function findItem(cat: Category, id: string) { return CATALOG[cat].find(i => i.id === id) ?? CATALOG[cat].find(i => i.id === DEFAULT_OUTFIT[cat])!; }

/** Build the parts for one wardrobe choice. */
export function buildItem(cat: Category, id: string): Part[] {
  const item = findItem(cat, id);
  if (cat === 'body') return buildSkin(item.palette!);
  const parts: Part[] = [];
  item.build?.((anchor, build, material = 'normal') => { const mb = new MeshBuilder(); build(mb); parts.push({ anchor, mesh: mb, material }); });
  return parts;
}
