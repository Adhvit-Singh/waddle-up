import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAll, SR } from '../src/audio/Synth.ts';
import { AudioManager } from '../src/audio/AudioManager.ts';

const clips = buildAll();

test('all Unity clip names exist', () => {
  for (const n of ['jump', 'land', 'step', 'grab', 'climb', 'splat', 'squawk', 'crumble', 'gust', 'whistle', 'bounce', 'warn', 'flip', 'chime', 'pop',
    'click', 'hover', 'checkpoint', 'achievement', 'freeze', 'float', 'powerdown', 'scoot', 'bonk', 'whoosh', 'sneeze', 'suck', 'rumble_short',
    'explosion', 'asteroid', 'scratch', 'fanfare', 'trombone', 'drumroll', 'victory', 'wind', 'fallwind', 'rumble', 'music'])
    assert.ok(clips[n] && clips[n].length > 0, n);
});
test('clips are normalized to peak <= 1', () => {
  for (const [n, d] of Object.entries(clips)) { let m = 0; for (const s of d) m = Math.max(m, Math.abs(s)); assert.ok(m <= 1.0001 && m > 0.05, `${n} peak ${m}`); }
});
test('music loop is 8 bars at 92 bpm', () => {
  assert.equal(clips.music.length, Math.trunc(8 * 4 * (60 / 92) * SR));
});
test('play() before unlock is a silent no-op', () => {
  assert.doesNotThrow(() => AudioManager.play('jump'));
});
