/** Round 10 item 7: draft render artifacts exist at the required paths. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'out/review/draft-frames';
const pj = (a, b) => path.join(a, b);

test('draft frames land in out/review/draft-frames/ (not build/)', () => {
  assert.ok(fs.existsSync(pj(DIR, 'draft-scenes.mp4')));
  assert.ok(fs.existsSync(pj(DIR, 'before-after-contact.png')));
  assert.ok(fs.existsSync(pj(DIR, 'timing.json')));
});

test('3 frames per scene start/mid/end for scenes 1,4,7', () => {
  for (const s of [1, 4, 7]) {
    for (const label of ['before', 'after']) {
      for (const k of [0, 1, 2]) {
        assert.ok(fs.existsSync(pj(DIR, `s${s}-${label}-${k}.png`)), `missing s${s}-${label}-${k}.png`);
      }
    }
  }
});

test('timing.json records real ffprobe output (resolution/codec/duration)', () => {
  const t = JSON.parse(fs.readFileSync(pj(DIR, 'timing.json'), 'utf8'));
  assert.ok(t.output, 'must record ffprobe output');
  assert.equal(t.output.width, 1280);
  assert.equal(t.output.height, 720);
  assert.equal(t.output.codec, 'h264');
  assert.ok(Number(t.output.duration) > 0);
  assert.equal(t.timing.length, 3);
});

