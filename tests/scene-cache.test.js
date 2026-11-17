/**
 * @fileoverview Round-5 performance helpers: per-scene cache hashing and
 * storyboard ffmpeg list generation. Pure — no rendering, no network.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneContentHash, PIPELINE_VERSION } from '../scripts/render-scenes.mjs';
import {
  stillFrameForScene,
  buildSlideshowList,
  buildAudioList,
} from '../scripts/storyboard.mjs';

test('sceneContentHash is deterministic and keys on scene, voice and bundle', () => {
  const a = sceneContentHash({
    sceneSpec: { id: 'k1', dur: 6 },
    sceneVoice: { lines: [{ dur: 6 }] },
    bundleHash: 'abc',
  });
  const b = sceneContentHash({
    sceneSpec: { id: 'k1', dur: 6 },
    sceneVoice: { lines: [{ dur: 6 }] },
    bundleHash: 'abc',
  });
  assert.equal(a, b, 'same inputs must produce the same hash');
  assert.ok(a.length === 16, 'hash should be a 16-char hex digest');
  assert.notEqual(
    a,
    sceneContentHash({
      sceneSpec: { id: 'k2', dur: 8 },
      sceneVoice: { lines: [{ dur: 8 }] },
      bundleHash: 'abc',
    }),
    'a different scene must change the hash'
  );
  assert.notEqual(
    a,
    sceneContentHash({
      sceneSpec: { id: 'k1', dur: 6 },
      sceneVoice: { lines: [{ dur: 6 }] },
      bundleHash: 'changed-assets',
    }),
    'changed assets must change the hash'
  );
  assert.notEqual(
    a,
    sceneContentHash({
      sceneSpec: { id: 'k1', dur: 7 },
      sceneVoice: { lines: [{ dur: 7 }] },
      bundleHash: 'abc',
    }),
    'a changed caption/duration must change the hash'
  );
  assert.ok(PIPELINE_VERSION.startsWith('round5'), 'bump the version when the renderer changes');
});

test('stillFrameForScene picks the dialogue midpoint, clamped to the scene', () => {
  const scene = { startFrame: 100, durationInFrames: 60, lines: [{ startFrame: 110, durationInFrames: 30 }] };
  assert.equal(stillFrameForScene(scene), 125);
  // No lines → middle of the scene.
  assert.equal(
    stillFrameForScene({ startFrame: 0, durationInFrames: 40, lines: [] }),
    20
  );
  // A line whose midpoint overruns the scene is clamped to the last frame.
  assert.equal(
    stillFrameForScene({ startFrame: 0, durationInFrames: 10, lines: [{ startFrame: 8, durationInFrames: 30 }] }),
    9
  );
});

test('buildSlideshowList repeats the last file and uses scene durations', () => {
  const list = buildSlideshowList([
    { file: 'C:\\a\\one.png', seconds: 2.4 },
    { file: 'C:\\a\\two.png', seconds: 6 },
  ]);
  assert.ok(list.includes("file 'C:/a/one.png'"), 'paths normalised to forward slashes');
  assert.ok(list.includes('duration 2.400'));
  assert.ok(list.includes('duration 6.000'));
  const fileLines = list.split('\n').filter((l) => l.startsWith('file '));
  assert.equal(fileLines.length, 3, 'the last file is repeated for the concat demuxer');
  assert.ok(fileLines[2].includes('two.png'), 'the repeated file is the last one');
});

test('buildAudioList emits one absolute file entry per line', () => {
  const list = buildAudioList(['public/voice/a.mp3', 'public/voice/b.mp3']);
  const lines = list.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith("file '") && lines[0].endsWith("'"));
  assert.ok(lines[0].includes('public/voice/a.mp3'.replaceAll('\\', '/')));
});
