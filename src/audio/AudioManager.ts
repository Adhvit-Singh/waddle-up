import type * as THREE from 'three';
import { buildAll, SR } from './Synth.ts';
import { Time } from '../core/time.ts';
import { GameSettings } from '../core/GameSettings.ts';
import { UnityRandom } from '../core/rng.ts';
import { refs } from '../core/refs.ts';

/** Plays synthesized clips: pooled one-shots, "3D" one-shots, music and ambient loops (port of AudioManager.cs). */
interface LoopSrc { src: AudioBufferSourceNode; gain: GainNode; vol: number; }

let samples: Record<string, Float32Array> | null = null;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers: Record<string, AudioBuffer> = {};
const voices: { src: AudioBufferSourceNode }[] = [];
let music: LoopSrc | null = null, wind: LoopSrc | null = null, fall: LoopSrc | null = null, rumble: LoopSrc | null = null;
let windTarget = 0, fallTarget = 0, rumbleTarget = 0, musicDuck = 1, musicMul = 1;
const MAX_VOICES = 14;

function makeLoop(name: string): LoopSrc | null {
  if (!ctx || !master || !buffers[name]) return null;
  const src = ctx.createBufferSource();
  src.buffer = buffers[name]; src.loop = true;
  const gain = ctx.createGain(); gain.gain.value = 0;
  src.connect(gain).connect(master);
  src.start();
  return { src, gain, vol: 0 };
}

export const AudioManager = {
  /** Generate all samples (CPU only, no AudioContext needed). */
  prepare() { if (!samples) samples = buildAll(); },

  /** Create the AudioContext on the first user gesture (browser autoplay rules). */
  unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!AC) return;
    this.prepare();
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = GameSettings.master;
    master.connect(ctx.destination);
    for (const [n, d] of Object.entries(samples!)) {
      const b = ctx.createBuffer(1, d.length, SR);
      b.getChannelData(0).set(d);
      buffers[n] = b;
    }
    music = makeLoop('music'); wind = makeLoop('wind'); fall = makeLoop('fallwind'); rumble = makeLoop('rumble');
    GameSettings.onChanged(() => { if (master) master.gain.value = Math.min(1, Math.max(0, GameSettings.master)); });
  },

  play(name: string, volume = 1, pitch = 1) {
    if (!ctx || !master) return;
    const b = buffers[name];
    if (!b) return;
    if (voices.length >= MAX_VOICES) {
      // steal the oldest voice, like Unity's FreeSource()
      const old = voices.shift()!;
      try { old.src.stop(); } catch { /* already stopped */ }
    }
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = pitch;
    const g = ctx.createGain();
    g.gain.value = volume * GameSettings.sfx;
    src.connect(g).connect(master);
    const v = { src };
    voices.push(v);
    src.onended = () => { const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); };
    src.start();
  },

  /** Positional-ish one-shot: attenuated by distance to the camera. */
  playAt(name: string, pos: THREE.Vector3, volume = 1) {
    const cam = refs.camera;
    const d = cam ? cam.position.distanceTo(pos) : 0;
    const att = Math.min(1, Math.max(0, 1 - d / 45));
    if (att > 0.02) this.play(name, volume * att, UnityRandom.range(0.9, 1.1));
  },

  setWindAmbient(v: number) { windTarget = v; },
  setFallLoop(v: number) { fallTarget = v; },
  setRumble(v: number) { rumbleTarget = v; },
  duckMusic(v: number) { musicDuck = v; },
  setMusicMultiplier(v: number) { musicMul = v; },

  update() {
    if (!ctx) return;
    const dt = Time.unscaledDeltaTime;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
    if (music) {
      const target = GameSettings.music * 0.55 * musicDuck * musicMul;
      const step = dt * 0.8;
      music.vol = Math.abs(target - music.vol) <= step ? target : music.vol + Math.sign(target - music.vol) * step;
      music.gain.gain.value = music.vol;
    }
    if (wind) { wind.vol = lerp(wind.vol, windTarget * GameSettings.sfx * 0.6, dt * 2); wind.gain.gain.value = wind.vol; }
    if (fall) {
      fall.vol = lerp(fall.vol, fallTarget * GameSettings.sfx * 0.8, dt * 6); fall.gain.gain.value = fall.vol;
      fall.src.playbackRate.value = 0.8 + fallTarget * 0.6;
    }
    if (rumble) { rumble.vol = lerp(rumble.vol, rumbleTarget * GameSettings.sfx, dt * 3); rumble.gain.gain.value = rumble.vol; }
  },
};
