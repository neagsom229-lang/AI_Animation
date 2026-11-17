/** Phase 4 QA: hybrid media.type validation and manifest handling. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateIllustratedStory, isIllustratedStory, ILLUSTRATED_MEDIA_TYPES } from '../src/core/illustrated-story.js';
import { checkIllustratedAssets } from '../scripts/illustrated-manifest.mjs';

const story = JSON.parse(fs.readFileSync('src/stories/khmer-empire.json', 'utf8'));

test('hybrid: shipped story validates with world3d scenes in suggested positions', () => {
  assert.equal(validateIllustratedStory(story), true);
  assert.equal(isIllustratedStory(story), true);
  assert.ok(ILLUSTRATED_MEDIA_TYPES.includes('world3d'));
  const world3d = story.scenes.filter((s) => s.media && s.media.type === 'world3d').map((s) => s.id);
  assert.deepEqual(world3d, ['sc-01', 'sc-07', 'sc-13', 'sc-18']);
});

test('hybrid validator: media.type rules', () => {
  const base = JSON.parse(JSON.stringify(story));
  // illustration without image → fails
  base.scenes[1].media = { type: 'illustration' };
  delete base.scenes[1].image;
  assert.throws(() => validateIllustratedStory(base), /requires an image path/);
  // clip without clip path → fails
  const b2 = JSON.parse(JSON.stringify(story));
  b2.scenes[1].media = { type: 'clip' };
  delete b2.scenes[1].clip;
  assert.throws(() => validateIllustratedStory(b2), /requires a clip path/);
  // unknown media type → fails
  const b3 = JSON.parse(JSON.stringify(story));
  b3.scenes[1].media = { type: 'hologram' };
  assert.throws(() => validateIllustratedStory(b3), /unknown media.type/);
  // clip with valid path → passes
  const b4 = JSON.parse(JSON.stringify(story));
  b4.scenes[1].media = { type: 'clip' };
  b4.scenes[1].clip = 'assets-src/clips/scene-02.mp4';
  assert.equal(validateIllustratedStory(b4), true);
});

test('hybrid manifest: world3d scenes need no image/depth/clip', () => {
  const report = checkIllustratedAssets(story, { allowMissing: true });
  const w = report.scenes.filter((s) => s.mediaType === 'world3d');
  assert.equal(w.length, 4);
  for (const s of w) assert.equal(s.missing.length, 0, `${s.id} should need no assets`);
  const ill = report.scenes.filter((s) => s.mediaType === 'illustration');
  assert.ok(ill.length > 0);
});
