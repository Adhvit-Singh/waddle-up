import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

test('the deployable build contains no developer menu', { skip: !existsSync('dist/assets') }, () => {
  for (const f of readdirSync('dist/assets').filter(f => f.endsWith('.js'))) {
    const js = readFileSync(`dist/assets/${f}`, 'utf8');
    assert.ok(!js.includes('DEV MENU') && !js.includes('devGotoStage') && !js.includes('__wu'), `${f} contains dev code`);
  }
});
