import * as THREE from 'three';
import { hexCol } from './math.ts';

export const LedgeKind = {
  Normal: 0, Rest: 1, Wall: 2, Beam: 3, Ice: 4, Moving: 5, Rotating: 6, Crumble: 7, Blink: 8, Bouncy: 9, Conveyor: 10, Sweeper: 11,
} as const;
export type LedgeKind = (typeof LedgeKind)[keyof typeof LedgeKind];
export const LedgeKindName: Record<number, string> = Object.fromEntries(Object.entries(LedgeKind).map(([k, v]) => [v, k]));

export interface StageDef {
  name: string;
  tier: number;
  count: number;
  pool: LedgeKind[];
  wallChance: number;
  difficulty: number;
  rock: THREE.Color;
  top: THREE.Color;
  wind: boolean;
  fog: boolean;
  fishShortcut: boolean;
}

const K = LedgeKind;
const f = Math.fround; // Unity stores these as 32-bit floats
function S(name: string, tier: number, count: number, wall: number, diff: number, rock: string, top: string, pool: LedgeKind[], extra: Partial<StageDef> = {}): StageDef {
  return { name, tier, count, wallChance: f(wall), difficulty: f(diff), rock: hexCol(rock), top: hexCol(top), pool, wind: false, fog: false, fishShortcut: false, ...extra };
}

/** The 20 stages. Order and tier split define the whole mountain. */
export const STAGES: StageDef[] = [
  // ---------- Tier 1 ----------
  S('The Easy Part (Enjoy It)', 0, 14, 0.00, 0.00, '#8a7f73', '#f4f7fb', [K.Normal]),
  S('Baby Steps',               0, 15, 0.05, 0.15, '#7d8a6a', '#eef6ea', [K.Normal, K.Normal, K.Beam]),
  S('Wall-E-Gant',              0, 15, 0.45, 0.20, '#6f6a80', '#f1effa', [K.Normal, K.Wall]),
  S('Tightrope Tuesday',        0, 15, 0.10, 0.25, '#946c58', '#fbefe6', [K.Beam, K.Beam, K.Normal]),
  S('Skating Rink',             0, 15, 0.10, 0.30, '#5f7f99', '#dff3ff', [K.Ice, K.Ice, K.Normal]),
  S('Elevator Music',           0, 15, 0.10, 0.32, '#7a6c8f', '#f3eafc', [K.Moving, K.Normal, K.Moving]),
  S('Trust Issues',             0, 15, 0.15, 0.36, '#8f6f4e', '#fff4e2', [K.Crumble, K.Normal, K.Crumble]),
  // ---------- Tier 2 ----------
  S('The Breezy Bit',           1, 15, 0.15, 0.40, '#5d8a86', '#e7fbf8', [K.Normal, K.Beam], { wind: true }),
  S('Blink and You Fall',       1, 15, 0.10, 0.42, '#6c5f8c', '#efe9ff', [K.Blink, K.Normal, K.Blink], { fishShortcut: true }),
  S('Spin Cycle',               1, 15, 0.10, 0.45, '#8c5f6f', '#ffe9f0', [K.Rotating, K.Normal]),
  S('Bouncy Castle',            1, 15, 0.10, 0.47, '#9b5f8f', '#ffe6fa', [K.Bouncy, K.Normal, K.Normal]),
  S('Conveyor of Despair',      1, 15, 0.10, 0.50, '#5f6670', '#eef1f5', [K.Conveyor, K.Normal, K.Conveyor]),
  S('Sweeper Street',           1, 15, 0.10, 0.52, '#7a7f5a', '#f7f9e7', [K.Sweeper, K.Normal]),
  S('Pea Soup',                 1, 15, 0.35, 0.55, '#6b7f6b', '#eef7ee', [K.Normal, K.Wall, K.Beam], { fog: true }),
  // ---------- Tier 3 ----------
  S('Ice Ice Maybe',            2, 15, 0.35, 0.60, '#5a7a9c', '#e1f3ff', [K.Ice, K.Wall, K.Ice]),
  S('Mixed Feelings',           2, 15, 0.20, 0.64, '#8a6a5a', '#fff0e6', [K.Moving, K.Blink, K.Crumble, K.Ice, K.Normal], { fishShortcut: true }),
  S('The Gauntlet',             2, 15, 0.15, 0.68, '#7f5a5a', '#ffeaea', [K.Moving, K.Crumble, K.Sweeper]),
  S('Gale Force',               2, 15, 0.15, 0.72, '#5a7f7a', '#e6fffb', [K.Beam, K.Normal, K.Beam], { wind: true }),
  S('Almost (Not Really)',      2, 15, 0.25, 0.78, '#6a5a7f', '#f2eaff', [K.Rotating, K.Bouncy, K.Conveyor, K.Wall, K.Blink, K.Ice]),
  S('The Final Stretch',        2, 15, 0.30, 0.85, '#4f4f66', '#f0f0ff', [K.Beam, K.Wall, K.Crumble, K.Moving, K.Ice]),
];

export const TIER_COUNT = 3;
