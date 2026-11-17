import * as THREE from 'three';

/** Placeholder API; real Web Audio implementation arrives in Task 5. */
export const AudioManager = {
  play(_name: string, _volume = 1, _pitch = 1) {},
  playAt(_name: string, _pos: THREE.Vector3, _volume = 1) {},
  setWindAmbient(_v: number) {},
  setFallLoop(_v: number) {},
  setRumble(_v: number) {},
  duckMusic(_v: number) {},
  setMusicMultiplier(_v: number) {},
};
