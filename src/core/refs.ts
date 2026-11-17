import type * as THREE from 'three';
import type { Ledge } from '../world/Ledge.ts';

/** Minimal views of the singletons, so low-level modules don't import high-level ones. */
export interface PenguinRef {
  groundLedge: Ledge | null;
  locked: boolean;
  readonly grounded: boolean;
  readonly hanging: boolean;
  state: number;
  facing: THREE.Vector3;
  gravityScale: number;
  externalAccel: THREE.Vector3;
  readonly position: THREE.Vector3;
  readonly object: THREE.Object3D;
  launch(velocity: THREE.Vector3, noGround: number): void;
}

export interface GameRef {
  readonly isPlaying: boolean;
  readonly currentStage: number;
  data: { trapsTriggered: number; inversions: number };
  sendToBottom(msg: string): void;
}

export interface UIRef {
  taunt(s: string): void;
  toast(s: string, color: string, secs?: number): void;
  achievement(s: string): void;
  blackout(secs: number, text: string): void;
  setChaosWarning(on: boolean): void;
  setChaos(on: boolean, mode: number): void;
}

export const refs = {
  penguin: null as PenguinRef | null,
  camera: null as THREE.PerspectiveCamera | null,
  game: null as GameRef | null,
  ui: null as UIRef | null,
  traps: null as null | { registerExternalTrap(what: string): void },
  cam: null as null | { flip180(): void },
  wind: null as null | { gustAtPenguin(strength: number, duration: number): void },
  shake: (_amount: number) => {},
  /** ControlChaos.Apply */
  chaos: (m: { x: number; y: number }) => m,
  /** physics interpolation 0..1 */
  alpha: 0,
};
