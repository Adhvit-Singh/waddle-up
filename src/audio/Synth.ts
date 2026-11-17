import { DotNetRandom } from '../core/rng.ts';

/** Procedural sound effect + music synthesis (port of Synth.cs). Everything is generated at startup. */
export const SR = 44100;

let rng = new DotNetRandom(4242);
const Noise = () => rng.nextDouble() * 2 - 1;
const Sat = (x: number) => Math.tanh(x);
const LpA = (fc: number) => 1 - Math.exp(-2 * Math.PI * fc / SR);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);

type Buf = Float32Array;

function clip(d: Buf, normalize = true, peak = 0.9): Buf {
  if (normalize) {
    let m = 0.0001;
    for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
    const k = peak / m;
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
  const f = Math.min(64, Math.trunc(d.length / 4));
  for (let i = 0; i < f; i++) { const g = i / f; d[i] *= g; d[d.length - 1 - i] *= g; }
  return d;
}

const buf = (seconds: number) => new Float32Array(Math.max(1, Math.trunc(seconds * SR)));

/** Pitch sweep tone. wave: 0 sine, 1 square, 2 saw, 3 triangle. */
function sweep(dur: number, f0: number, f1: number, wave: number, decay: number, vibHz = 0, vibAmt = 0, curve = 1): Buf {
  const d = buf(dur);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR, u = t / dur;
    const f = lerp(f0, f1, Math.pow(u, curve)) * (1 + Math.sin(2 * Math.PI * vibHz * t) * vibAmt);
    ph += f / SR;
    const p = ph - Math.floor(ph);
    const s = wave === 0 ? Math.sin(2 * Math.PI * p) : wave === 1 ? (p < 0.5 ? 1 : -1) : wave === 2 ? 2 * p - 1 : 1 - 4 * Math.abs(p - 0.5);
    d[i] = s * Math.exp(-t * decay);
  }
  return d;
}

function noiseBurst(dur: number, lp: number, decay: number, lpEnd = -1): Buf {
  const d = buf(dur);
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const fc = lpEnd > 0 ? lerp(lp, lpEnd, t / dur) : lp;
    y += LpA(fc) * (Noise() - y);
    d[i] = y * Math.exp(-t * decay);
  }
  return d;
}

function mix(...parts: Buf[]): Buf {
  let n = 0; for (const p of parts) n = Math.max(n, p.length);
  const d = new Float32Array(n);
  for (const p of parts) for (let i = 0; i < p.length; i++) d[i] += p[i];
  return d;
}

function scale(d: Buf, k: number) { for (let i = 0; i < d.length; i++) d[i] *= k; return d; }

function offset(d: Buf, seconds: number): Buf {
  const o = Math.trunc(seconds * SR);
  const r = new Float32Array(d.length + o);
  r.set(d, o);
  return r;
}

function lowpass(d: Buf, fc: number) {
  const a = LpA(fc); let y = 0;
  for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] = y; }
  return d;
}

/** Simple brassy/plucky note with ADSR-ish envelope. */
function note(freq: number, dur: number, wave: number, attack: number, release: number, lp: number, vibHz = 0, vibAmt = 0) {
  const d = sweep(dur + release, freq, freq, wave, 0, vibHz, vibAmt);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const env = t < attack ? t / attack : (t < dur ? 1 : Math.max(0, 1 - (t - dur) / release));
    d[i] *= env;
  }
  return lowpass(d, lp);
}

function loopify(d: Buf, fadeSeconds: number) {
  const f = Math.trunc(fadeSeconds * SR);
  const n = d.length - f;
  const r = d.slice(0, n);
  for (let i = 0; i < f; i++) { const g = i / f; r[i] = r[i] * g + d[n + i] * (1 - g); }
  return r;
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export function buildAll(): Record<string, Float32Array> {
  rng = new DotNetRandom(4242);
  const c: Record<string, Float32Array> = {};
  const add = (n: string, d: Buf, peak = 0.9) => { c[n] = clip(d, true, peak); };

  add('jump', mix(sweep(0.16, 330, 720, 3, 14, 0, 0, 0.6), scale(noiseBurst(0.05, 3000, 60), 0.2)), 0.6);
  add('land', mix(noiseBurst(0.12, 900, 30), scale(sweep(0.12, 120, 60, 0, 30), 0.8)), 0.7);
  add('step', noiseBurst(0.045, 1800, 80), 0.35);
  add('grab', mix(noiseBurst(0.03, 4000, 120), scale(sweep(0.06, 700, 500, 0, 50), 0.6)), 0.6);
  add('climb', mix(noiseBurst(0.28, 1200, 8, 3500), scale(sweep(0.22, 280, 520, 3, 9), 0.4)), 0.5);
  add('splat', mix(noiseBurst(0.35, 700, 10, 200), scale(sweep(0.3, 110, 45, 0, 9), 1.2), scale(sweep(0.25, 300, 90, 2, 14, 30, 0.2), 0.25)), 0.95);
  add('squawk', lowpass(mix(sweep(0.3, 780, 430, 2, 6, 24, 0.08), scale(sweep(0.3, 1560, 860, 1, 9, 24, 0.08), 0.25)), 2600), 0.6);
  add('crumble', crackle(0.75), 0.75);
  add('gust', swell(1.4, 500, 1800), 0.75);
  add('whistle', sweep(0.7, 1300, 1900, 0, 2.5, 7, 0.02), 0.25);
  add('bounce', sweep(0.55, 180, 520, 3, 5, 22, 0.25, 0.5), 0.7);
  add('warn', mix(sweep(0.07, 1250, 1250, 1, 20), offset(sweep(0.07, 1250, 1250, 1, 20), 0.12)), 0.3);
  add('flip', mix(sweep(0.25, 900, 300, 1, 8), scale(offset(sweep(0.2, 300, 900, 1, 8), 0.12), 0.6)), 0.35);
  add('chime', mix(note(midi(84), 0.05, 0, 0.005, 0.6, 9000), offset(note(midi(91), 0.05, 0, 0.005, 0.8, 9000), 0.09)), 0.4);
  add('pop', sweep(0.09, 480, 980, 0, 25), 0.5);
  add('click', mix(sweep(0.04, 1100, 900, 3, 60), scale(noiseBurst(0.015, 6000, 200), 0.3)), 0.45);
  add('hover', sweep(0.03, 1700, 1900, 0, 80), 0.18);
  add('checkpoint', mix(note(midi(76), 0.08, 3, 0.005, 0.4, 7000), offset(note(midi(83), 0.1, 3, 0.005, 0.6, 7000), 0.1), offset(note(midi(88), 0.2, 3, 0.005, 0.8, 7000), 0.2)), 0.55);
  add('achievement', mix(note(midi(72), 0.08, 1, 0.005, 0.2, 3000), offset(note(midi(79), 0.25, 1, 0.005, 0.4, 3000), 0.1)), 0.4);
  add('freeze', mix(sweep(0.6, 2400, 3400, 0, 5, 30, 0.02), scale(noiseBurst(0.5, 7000, 6), 0.3)), 0.35);
  add('float', sweep(1.2, 400, 900, 0, 1.5, 5, 0.06), 0.4);
  add('powerdown', sweep(0.9, 600, 60, 2, 2.5, 0, 0, 0.7), 0.5);
  add('scoot', mix(sweep(0.2, 300, 900, 3, 10), noiseBurst(0.2, 2000, 12)), 0.5);
  add('bonk', mix(sweep(0.18, 420, 180, 3, 18), scale(noiseBurst(0.06, 2500, 50), 0.5)), 0.8);
  add('whoosh', swell(0.45, 800, 3000), 0.5);
  add('sneeze', mix(lowpass(sweep(0.32, 260, 330, 2, 1.5, 6, 0.04), 1500), offset(noiseBurst(0.25, 5000, 14), 0.3)), 0.8);
  add('suck', sweep(0.9, 900, 90, 2, 2, 14, 0.15, 0.6), 0.6);
  add('rumble_short', noiseBurst(1.0, 140, 2.5), 0.9);
  add('explosion', mix(noiseBurst(3.5, 2500, 1.3, 120), scale(sweep(2.5, 70, 25, 0, 1.5), 1.2), crackle(2.5)), 1);
  add('asteroid', asteroidWhoosh(4.5), 0.8);
  add('scratch', scratch(), 0.7);
  add('fanfare', fanfare(), 0.75);
  add('trombone', sadTrombone(), 0.75);
  add('drumroll', drumRoll(2.2), 0.6);
  add('victory', victory(), 0.8);

  c.wind = clip(loopify(windNoise(6.5, 0.6), 0.5), true, 0.8);
  c.fallwind = clip(loopify(windNoise(3.5, 2.5), 0.4), true, 0.8);
  c.rumble = clip(loopify(noiseBurst(4.5, 110, 0), 0.5), true, 0.95);
  c.music = clip(music(), true, 0.7);
  return c;
}

function crackle(dur: number) {
  const d = buf(dur); let y = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 3 / dur);
    const imp = rng.nextDouble() < 0.004 ? Noise() * 3 : 0;
    y += LpA(1800) * (Noise() * 0.3 + imp - y);
    d[i] = y * env;
  }
  return d;
}

function swell(dur: number, f0: number, f1: number) {
  const d = buf(dur); let y = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR, u = t / dur;
    const env = Math.sin(u * Math.PI);
    const fc = lerp(f0, f1, Math.sin(u * Math.PI));
    y += LpA(fc) * (Noise() - y);
    y2 += LpA(fc * 0.3) * (y - y2);
    d[i] = (y - y2) * env;
  }
  return d;
}

function windNoise(dur: number, modHz: number) {
  const d = buf(dur); let y = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const m = 0.6 + 0.4 * Math.sin(2 * Math.PI * modHz * t * 0.3) * Math.sin(2 * Math.PI * modHz * 0.13 * t + 1);
    const fc = 350 + 500 * m;
    y += LpA(fc) * (Noise() - y);
    y2 += LpA(fc * 0.25) * (y - y2);
    d[i] = (y - y2 * 0.6) * m;
  }
  return d;
}

function asteroidWhoosh(dur: number) {
  const d = buf(dur); let y = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR, u = t / dur;
    const env = u * u;
    y += LpA(lerp(200, 4000, u * u)) * (Noise() - y);
    d[i] = y * env + Math.sin(2 * Math.PI * lerp(40, 90, u) * t) * env * 0.4;
  }
  return d;
}

function scratch() {
  const d = buf(0.45); let y = 0, ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const f = 300 + 1500 * Math.abs(Math.sin(t * 22));
    ph += f / SR;
    y += LpA(f * 2) * (Noise() - y);
    d[i] = (y * 0.8 + Math.sin(ph * 2 * Math.PI) * 0.3) * Math.exp(-t * 3);
  }
  return d;
}

function fanfare() {
  const notes = [60, 64, 67, 72], times = [0, 0.14, 0.28, 0.42];
  const parts: Buf[] = [];
  for (let i = 0; i < notes.length; i++) {
    const len = i === notes.length - 1 ? 1.2 : 0.12;
    parts.push(offset(note(midi(notes[i]), len, 2, 0.02, 0.4, 2800, 5, 0.004), times[i]));
    parts.push(offset(scale(note(midi(notes[i] + 12), len, 1, 0.02, 0.4, 3500), 0.25), times[i]));
  }
  parts.push(offset(scale(note(midi(48), 1.4, 2, 0.02, 0.5, 900), 0.7), 0.42));
  parts.push(offset(scale(note(midi(64), 1.2, 2, 0.03, 0.5, 2000), 0.5), 0.42));
  parts.push(offset(scale(note(midi(67), 1.2, 2, 0.03, 0.5, 2000), 0.5), 0.42));
  return mix(...parts);
}

function sadTrombone() {
  const notes = [63, 62, 61, 60], lens = [0.42, 0.42, 0.42, 1.4];
  const parts: Buf[] = [];
  let t = 0;
  for (let i = 0; i < notes.length; i++) {
    const last = i === notes.length - 1;
    parts.push(offset(note(midi(notes[i] - 12), lens[i], 2, 0.04, 0.15, 1100, last ? 6 : 0, last ? 0.025 : 0), t));
    t += lens[i] + 0.06;
  }
  return mix(...parts);
}

function drumRoll(dur: number) {
  const d = buf(dur); let y = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const rate = 18 + t * 6;
    const hit = Math.exp(-((t * rate) % 1) * 9);
    y += LpA(2500) * (Noise() - y);
    d[i] = y * hit * (0.4 + 0.6 * t / dur);
  }
  return d;
}

function victory() {
  const mel = [72, 76, 79, 84, 79, 84, 88], tm = [0, 0.15, 0.3, 0.45, 0.75, 0.9, 1.05];
  const parts: Buf[] = [];
  for (let i = 0; i < mel.length; i++)
    parts.push(offset(note(midi(mel[i]), i === mel.length - 1 ? 1.5 : 0.12, 3, 0.01, 0.5, 5000, 5, 0.004), tm[i]));
  parts.push(offset(scale(note(midi(48), 2.5, 2, 0.05, 0.8, 800), 0.6), 0));
  parts.push(offset(scale(note(midi(55), 2.5, 2, 0.05, 0.8, 1200), 0.35), 0));
  return mix(...parts);
}

/** Calm, ironic "elevator music" loop: I-vi-IV-V with e-piano chords, bass and a melody. */
function music() {
  const bpm = 92, beat = 60 / bpm;
  const bars = 8;
  const total = bars * 4 * beat;
  const d = buf(total + 1.5);
  const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
  const bass = [36, 33, 29, 31];
  const sc = [72, 74, 76, 79, 81, 84];
  const mr = new DotNetRandom(7);

  const addNote = (start: number, freq: number, dur: number, vol: number, kind: number) => {
    const s0 = Math.trunc(start * SR);
    const n = Math.trunc((dur + 0.6) * SR);
    let ph = 0;
    for (let i = 0; i < n && s0 + i < d.length; i++) {
      const t = i / SR;
      ph += freq / SR;
      const p = ph * 2 * Math.PI;
      let env: number, s: number;
      if (kind === 0) {
        env = Math.exp(-t * 2.2) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.6));
        s = Math.sin(p + 1.2 * Math.sin(p * 2) * Math.exp(-t * 6));
      } else if (kind === 1) {
        env = Math.min(1, t * 60) * Math.exp(-t * 1.8) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.2));
        s = Math.sin(p) + 0.25 * Math.sin(p * 2);
      } else {
        env = Math.min(1, t * 200) * Math.exp(-t * 3.2);
        s = Math.sin(p) * (1 + 0.15 * Math.sin(2 * Math.PI * 5.5 * t)) + 0.2 * Math.sin(p * 4) * Math.exp(-t * 10);
      }
      d[s0 + i] += s * env * vol;
    }
  };

  for (let bar = 0; bar < bars; bar++) {
    const ci = bar % 4;
    const bt = bar * 4 * beat;
    for (const nn of chords[ci]) {
      addNote(bt, midi(nn), beat * 1.6, 0.11, 0);
      addNote(bt + beat * 2.5, midi(nn), beat * 1.2, 0.08, 0);
    }
    addNote(bt, midi(bass[ci]), beat * 1.5, 0.32, 1);
    addNote(bt + beat * 2, midi(bass[ci] + 7), beat * 0.9, 0.22, 1);
    addNote(bt + beat * 3, midi(bass[ci] + 12), beat * 0.9, 0.2, 1);
    for (let k = 0; k < 4; k++) {
      if (mr.nextDouble() < 0.3) continue;
      const tt = bt + k * beat + (mr.nextDouble() < 0.3 ? beat * 0.5 : 0);
      addNote(tt, midi(sc[mr.next(sc.length)]), beat * 0.8, 0.13, 2);
    }
  }
  // fold the tail back into the start for a seamless loop
  const len = Math.trunc(total * SR);
  const r = d.slice(0, len);
  for (let i = len; i < d.length; i++) r[i - len] += d[i];
  for (let i = 0; i < r.length; i++) r[i] = Sat(r[i] * 1.2);
  return r;
}
