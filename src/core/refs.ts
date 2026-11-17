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
};
