import type * as THREE from 'three';
import type { Ledge } from '../world/Ledge.ts';

/** Minimal views of the singletons, so low-level modules don't import high-level ones. */
export interface PenguinRef {
  groundLedge: Ledge | null;
  locked: boolean;
  position: THREE.Vector3;
  launch(velocity: THREE.Vector3, noGround: number): void;
}

export const refs = {
  penguin: null as PenguinRef | null,
  camera: null as THREE.PerspectiveCamera | null,
  game: null as null | { readonly isPlaying: boolean; currentStage: number; sendToBottom(msg: string): void },
  ui: null as null | { taunt(s: string): void; toast(s: string, c: string, secs?: number): void },
  traps: null as null | { registerExternalTrap(what: string): void },
  shake: (_amount: number) => {},
  /** ControlChaos.Apply */
  chaos: (m: { x: number; y: number }) => m,
  /** physics interpolation 0..1 */
  alpha: 0,
};
