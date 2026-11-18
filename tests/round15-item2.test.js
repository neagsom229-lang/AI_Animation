/** Round 15 item 2: honest draft report (cold start, scene type, voice, share). */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sceneType, summaryTable } from '../scripts/film-draft.mjs';

test('sceneType reads the story field; painted scenes are illustrations', () => {
  assert.equal(sceneType({ media: { type: 'world3d' } }), 'world3d');
  assert.equal(sceneType({ media: { type: 'illustration' } }), 'illustration');
  assert.equal(sceneType({}), 'illustration');
  assert.equal(sceneType({ media: {} }), 'illustration');
});

test('summaryTable: type, frames, ms/frame, seconds and % of total render time', () => {
  const timing = [
    { scene: 1, type: 'world3d', frames: 100, ms: 50000, msPerFrame: 500, seconds: 3.3 },
    { scene: 2, type: 'illustration', frames: 100, ms: 5000, msPerFrame: 50, seconds: 3.3 },
  ];
  const lines = summaryTable(timing);
  assert.equal(lines.length, 4);
  assert.match(lines[0], /\| scene \| type \| frames \| ms\/frame \| seconds \| % of total \|/);
  assert.match(lines[2], /\| 1 \| world3d \| 100 \| 500 \| 3\.3 \| 90\.9% \|/);
  assert.match(lines[3], /\| 2 \| illustration \| 100 \| 50 \| 3\.3 \| 9\.1% \|/);
});

test('draft source reports cold start separately and records the actual voice id', () => {
  const src = fs.readFileSync('scripts/film-draft.mjs', 'utf8');
  assert.match(src, /setupMs = Date.now\(\) - startedAt/);
  assert.match(src, /bundleMs = Date.now\(\) - tBundle/);
  assert.match(src, /NOT charged to scene 1/);
  assert.match(src, /voiceId = voiceData\.voice/);
  assert.match(src, /const type = sceneType\(spec\)/);
  assert.match(src, /summaryTable\(timing\)/);
  assert.match(src, /COLD START \(separate/);
});
