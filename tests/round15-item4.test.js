/** Round 15 item 4: fast preview + per-scene cache identity (no render needed). */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseArgs, draftVideoName, sceneCacheKey, sceneCachePath, stillCachePath,
  honestyNotes, FAST_LABEL, FAST_SCALE,
} from '../scripts/film-draft.mjs';

test('draft CLI parses --fast and keeps --scenes', () => {
  const a = parseArgs(['--fast', '--scenes', '2,7,15']);
  assert.equal(a.fast, true);
  assert.deepEqual(a.scenes, [2, 7, 15]);
  assert.equal(parseArgs([]).fast, false);
  assert.equal(draftVideoName('khmer-empire', FAST_LABEL), `khmer-empire-${FAST_LABEL}.mp4`);
  assert.match(FAST_LABEL, /DRAFT-FAST-NOT-RELEASABLE/);
  assert.equal(FAST_SCALE, 2 / 3);
});

test('scene cache key is stable and changes ONLY for the modified scene', () => {
  const base = { voiceId: 'km-KH-PisethNeural', voiceSceneId: 'sc-02', frames: 258,
    type: 'illustration', fast: false, limitFactor: 0.9, metric: 0.001 };
  const shots = {
    1: { imageSha: 'img1', depthSha: 'dep1' },
    2: { imageSha: 'img2', depthSha: 'dep2' },
  };
  const key = (n, s) => sceneCacheKey({ sceneNo: n, ...s, ...base, voiceSceneId: `sc-0${n}` });
  const a1 = key(1, shots[1]);
  const b1 = key(2, shots[2]);
  assert.equal(key(1, shots[1]), a1, 'unchanged inputs => identical key');
  assert.equal(key(2, shots[2]), b1);
  const b2 = key(2, { ...shots[2], imageSha: 'img2-CHANGED' });
  assert.notEqual(b2, b1, 'changed image => different key for that scene');
  assert.equal(key(1, shots[1]), a1, 'other scene key unchanged');
  const fastKey = sceneCacheKey({ sceneNo: 2, ...shots[2], ...base, fast: true });
  assert.notEqual(fastKey, b1, 'fast mode must not reuse normal-draft cache');
});

test('cache paths live under out/drafts/scene-cache, outside timestamped drafts', () => {
  const root = path.join('build', 'cache', 'round15-cache');
  const key = 'abcd1234abcd1234';
  const mp4 = sceneCachePath(root, key, 7);
  const still = stillCachePath(root, key, 7, 1);
  assert.match(mp4.replace(/\\/g, '/'), /out\/drafts\/scene-cache\/abcd1234abcd1234\/scene-07\.mp4$/);
  assert.match(still.replace(/\\/g, '/'), /out\/drafts\/scene-cache\/abcd1234abcd1234\/scene-07-1\.png$/);
});

test('fast honesty note does NOT claim world3d half-frame-rate', () => {
  const notes = honestyNotes({
    story: { scenes: [] }, manifest: { scenes: [] }, voiceData: { provider: 'edge-tts' },
    metrics: {}, sceneNumbers: [1], label: FAST_LABEL,
  });
  assert.match(notes, /854x480/);
  assert.match(notes, /NOT enabled/);
  assert.match(notes, /validateEveryNthFrame accepts only 1/);
  assert.match(notes, /no frame skipping was faked/);
});

test('source implements real reuse, zero-render report and fast label', () => {
  const src = fs.readFileSync('scripts/film-draft.mjs', 'utf8');
  assert.match(src, /fs\.existsSync\(cacheFile\)/);
  assert.match(src, /CACHED \(0 rendered\)/);
  assert.match(src, /const renderedCount = timing\.filter/);
  assert.match(src, /const cachedCount = timing\.length/);
  assert.match(src, /scale: FAST_SCALE/);
  assert.match(src, /draftVideoName\(storyName, label\)/);
});
