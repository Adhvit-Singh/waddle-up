/** Player-facing options, persisted in localStorage (same keys as Unity PlayerPrefs). */
type Listener = () => void;
const listeners: Listener[] = [];

function store(): Storage | null { try { return globalThis.localStorage ?? null; } catch { return null; } }
function getF(k: string, d: number) { const v = store()?.getItem(k); const n = v == null ? NaN : parseFloat(v); return isNaN(n) ? d : n; }
function getI(k: string, d: number) { return Math.round(getF(k, d)); }
function set(k: string, v: number) { try { store()?.setItem(k, String(v)); } catch { /* ignored */ } }

export const QUALITY_NAMES = ['Low', 'Medium', 'High'];

export const GameSettings = {
  master: 0.8, music: 0.45, sfx: 0.85, sensitivity: 1, invertY: false, fullscreen: false, showTimer: true, cameraShake: true, quality: 2,
  onChanged(f: Listener) { listeners.push(f); },
  load() {
    this.master = getF('wu_master', 0.8);
    this.music = getF('wu_music', 0.45);
    this.sfx = getF('wu_sfx', 0.85);
    this.sensitivity = getF('wu_sens', 1);
    this.invertY = getI('wu_invy', 0) === 1;
    this.fullscreen = typeof document !== 'undefined' && !!document.fullscreenElement;
    this.showTimer = getI('wu_timer', 1) === 1;
    this.cameraShake = getI('wu_shake', 1) === 1;
    this.quality = Math.min(2, Math.max(0, getI('wu_quality', 2)));
    this.apply();
  },
  save() {
    set('wu_master', this.master); set('wu_music', this.music); set('wu_sfx', this.sfx); set('wu_sens', this.sensitivity);
    set('wu_invy', this.invertY ? 1 : 0); set('wu_fs', this.fullscreen ? 1 : 0); set('wu_timer', this.showTimer ? 1 : 0);
    set('wu_shake', this.cameraShake ? 1 : 0); set('wu_quality', this.quality);
    this.apply();
  },
  apply() {
    if (typeof document !== 'undefined') {
      const fs = !!document.fullscreenElement;
      if (this.fullscreen && !fs) document.documentElement.requestFullscreen?.().catch(() => { this.fullscreen = false; });
      else if (!this.fullscreen && fs) document.exitFullscreen?.().catch(() => {});
    }
    for (const l of listeners) l();
  },
};
