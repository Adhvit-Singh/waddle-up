import { CATALOG, CATEGORY_ORDER, DEFAULT_OUTFIT, type OutfitIds } from './Catalog.ts';

const KEY = 'wu_outfit';
let storage: Storage | null = null;
const st = () => { if (storage) return storage; try { return globalThis.localStorage ?? null; } catch { return null; } };

/** The player's chosen look, saved in the browser. Unknown / missing ids fall back to the defaults. */
export const Outfit = {
  setStorage(s: Storage) { storage = s; },
  normalize(raw: unknown): OutfitIds {
    const o = { ...DEFAULT_OUTFIT };
    if (raw && typeof raw === 'object')
      for (const c of CATEGORY_ORDER) {
        const v = (raw as Record<string, unknown>)[c];
        if (typeof v === 'string' && CATALOG[c].some(i => i.id === v)) o[c] = v;
      }
    return o;
  },
  load(): OutfitIds {
    try { const s = st()?.getItem(KEY); return Outfit.normalize(s ? JSON.parse(s) : null); } catch { return { ...DEFAULT_OUTFIT }; }
  },
  save(o: OutfitIds) { try { st()?.setItem(KEY, JSON.stringify(Outfit.normalize(o))); } catch { /* storage blocked */ } },
  random(): OutfitIds {
    const o = { ...DEFAULT_OUTFIT };
    for (const c of CATEGORY_ORDER) o[c] = CATALOG[c][Math.floor(Math.random() * CATALOG[c].length)].id;
    return o;
  },
};
