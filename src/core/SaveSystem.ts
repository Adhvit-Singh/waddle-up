import { ROLES } from '../player/roles/Roles.ts';
const ROLE_IDS = ROLES.map(r => r.id);

/** Run save (Continue) + lifetime stats, in localStorage with the same keys/shape as Unity's PlayerPrefs. */
export interface SaveData {
  px: number; py: number; pz: number; yaw: number;
  time: number;
  falls: number;
  tiersRevealed: number;      // 0 = only tier 1 visible, 1 = tier 2 risen, 2 = tier 3 risen
  bestHeight: number;
  biggestFall: number;
  trapsTriggered: number;
  inversions: number;
  bottomResets: number;
  maxStage: number;
  bannedTraps: string[];      // "ledgeIndex:TrapType"
  firedTraps: string[];       // every trap that fired this game (never repeats this game)
  devUsed: boolean;           // the local dev menu was used: no best time
  role: string;               // the penguin role chosen for this run (locked for the run)
  /** saved while falling: Continue resumes the fall exactly (no pause-and-quit escape) */
  air: AirState | null;
}
export interface AirState { x: number; y: number; z: number; vx: number; vy: number; vz: number; peak: number; }

export function newSaveData(): SaveData {
  return { px: 0, py: 0, pz: 0, yaw: 0, time: 0, falls: 0, tiersRevealed: 0, bestHeight: 0, biggestFall: 0, trapsTriggered: 0, inversions: 0, bottomResets: 0, maxStage: 1, bannedTraps: [], firedTraps: [], devUsed: false, role: 'normal', air: null };
}

/** JsonUtility fills missing fields with defaults; do the same. */
export function normalizeSave(raw: Partial<SaveData>): SaveData {
  const d = { ...newSaveData(), ...raw };
  if (!Array.isArray(d.bannedTraps)) d.bannedTraps = [];
  if (!Array.isArray(d.firedTraps)) d.firedTraps = [];
  if (!ROLE_IDS.includes(d.role)) d.role = 'normal';
  const a = d.air as Partial<AirState> | null;
  d.air = a && ['x', 'y', 'z', 'vx', 'vy', 'vz', 'peak'].every(k => Number.isFinite((a as Record<string, number>)[k])) ? a as AirState : null;
  return d;
}

const KEY = 'wu_save_v1';
let storage: Storage | null = null;
function st(): Storage | null {
  if (storage) return storage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
function get(k: string) { try { return st()?.getItem(k) ?? null; } catch { return null; } }
function set(k: string, v: string) { try { st()?.setItem(k, v); } catch { /* storage full or blocked */ } }
function del(k: string) { try { st()?.removeItem(k); } catch { /* ignored */ } }

export const SaveSystem = {
  /** for tests */
  setStorage(s: Storage) { storage = s; },
  get hasSave() { return get(KEY) != null; },
  load(): SaveData | null {
    const s = get(KEY);
    if (!s) return null;
    try { return normalizeSave(JSON.parse(s)); } catch { return null; }
  },
  save(d: SaveData) { set(KEY, JSON.stringify(d)); },
  clear() { del(KEY); },

  get bestTime() { return parseFloat(get('wu_besttime') ?? '0') || 0; },
  set bestTime(v: number) { set('wu_besttime', String(v)); },
  /** best time per role (Normal keeps the original key) */
  bestTimeFor(role: string) { return parseFloat(get(role === 'normal' ? 'wu_besttime' : `wu_besttime_${role}`) ?? '0') || 0; },
  setBestTimeFor(role: string, v: number) { set(role === 'normal' ? 'wu_besttime' : `wu_besttime_${role}`, String(v)); },
  get wins() { return parseInt(get('wu_wins') ?? '0', 10) || 0; },
  set wins(v: number) { set('wu_wins', String(v)); },
  get lifetimeFalls() { return parseInt(get('wu_lifefalls') ?? '0', 10) || 0; },
  set lifetimeFalls(v: number) { set('wu_lifefalls', String(v)); },
  /** (ledge:trap) pairs that fired in the previous game */
  get lastRunTraps(): string[] { try { const v = JSON.parse(get('wu_lasttraps') ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } },
  set lastRunTraps(v: string[]) { set('wu_lasttraps', JSON.stringify(v)); },
  resetLifetime() { del('wu_besttime'); del('wu_wins'); del('wu_lifefalls'); },
};
