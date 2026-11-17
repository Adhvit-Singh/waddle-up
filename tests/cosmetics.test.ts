import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, DEFAULT_OUTFIT, CATEGORY_ORDER, buildItem } from '../src/player/cosmetics/Catalog.ts';
import { Outfit } from '../src/player/cosmetics/Outfit.ts';

test('the agreed number of options in every category', () => {
  const n = Object.fromEntries(CATEGORY_ORDER.map(c => [c, CATALOG[c].length]));
  assert.deepEqual(n, { body: 14, eyes: 12, hat: 16, outfit: 12, accessory: 30, feet: 10 });   // hats: the agreed 15 + "No Hat"
});

test('ids are unique within each category and the defaults exist', () => {
  for (const c of CATEGORY_ORDER) {
    const ids = CATALOG[c].map(i => i.id);
    assert.equal(new Set(ids).size, ids.length, c);
    assert.ok(ids.includes(DEFAULT_OUTFIT[c]), `default ${c}`);
  }
});

test('every item builds, and nothing is absurdly big', () => {
  for (const c of CATEGORY_ORDER) for (const item of CATALOG[c]) {
    const parts = buildItem(c, item.id);
    for (const p of parts) {
      const pos = p.mesh.positions();
      for (let i = 0; i < pos.length; i += 3) assert.ok(Math.hypot(pos[i], pos[i + 1], pos[i + 2]) < 1.3, `${c}/${item.id} too big`);
    }
    if (item.id !== 'none' && c !== 'body') assert.ok(parts.length > 0 && parts.some(p => p.mesh.vertexCount > 0), `${c}/${item.id} builds nothing`);
  }
});

test('outfit save/load round trip, unknown ids fall back to the defaults', () => {
  const m = new Map<string, string>();
  Outfit.setStorage({ getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } } as never);
  const o = { ...DEFAULT_OUTFIT, hat: 'traffic-cone', feet: 'clown-shoes' };
  Outfit.save(o);
  assert.deepEqual(Outfit.load(), o);
  m.set('wu_outfit', JSON.stringify({ hat: 'does-not-exist', eyes: 42 }));
  assert.deepEqual(Outfit.load(), DEFAULT_OUTFIT);
  m.set('wu_outfit', '{broken');
  assert.deepEqual(Outfit.load(), DEFAULT_OUTFIT);
});

test('randomise only picks real options', () => {
  for (let k = 0; k < 50; k++) {
    const o = Outfit.random();
    for (const c of CATEGORY_ORDER) assert.ok(CATALOG[c].some(i => i.id === o[c]), `${c}: ${o[c]}`);
  }
});
