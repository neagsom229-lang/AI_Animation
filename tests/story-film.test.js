/**
 * @fileoverview StoryFilm film-level tests:
 *   1. Pure timeline math (durations from real voice data + padding).
 *   2. Same story+voiceData inputProps → identical frame hash (determinism).
 *   3. A different story → a different film (different frame hash).
 *
 * Uses committed fixtures (tests/fixtures/*.json + public/fixtures/tiny-silence.mp3),
 * so no network and no generated state is required.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const storyA = JSON.parse(fs.readFileSync('tests/fixtures/tiny-story.json', 'utf-8'));
const storyB = JSON.parse(fs.readFileSync('tests/fixtures/tiny-story-alt.json', 'utf-8'));
const voiceA = JSON.parse(fs.readFileSync('tests/fixtures/tiny-voice.json', 'utf-8'));
const voiceB = JSON.parse(fs.readFileSync('tests/fixtures/tiny-voice-alt.json', 'utf-8'));

let serveUrlPromise = null;
function getServeUrl() {
  if (!serveUrlPromise) {
    serveUrlPromise = bundle({
      entryPoint: path.resolve('remotion/index.ts'),
      publicDir: path.resolve('public'),
      onProgress: () => {},
    });
  }
  return serveUrlPromise;
}

async function renderFrame(story, voiceData, frame, tag) {
  const serveUrl = await getServeUrl();
  const inputProps = { story, voiceData };
  const composition = await selectComposition({ serveUrl, id: 'StoryFilm', inputProps });
  const outDir = path.resolve('out');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `storyfilm-${tag}.png`);
  await renderStill({ composition, serveUrl, frame, output: file, inputProps });
  return {
    hash: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    durationInFrames: composition.durationInFrames,
  };
}

test('buildStoryTimeline: total duration = sum of real voice durations + inter-scene padding', async () => {
  const { buildStoryTimeline } = await import('../remotion/lib/story-timing.ts');
  const tl = buildStoryTimeline(voiceA, 30);

  assert.equal(tl.scenes.length, 2);
  // Scene 1: 1.0 s audio = 30 frames + 0.75 s gap (Math.round(22.5) = 23) → 53.
  assert.equal(tl.scenes[0].audioDurationInFrames, 30);
  assert.equal(tl.scenes[0].durationInFrames, 53);
  // Last scene: no trailing gap → exactly its audio (30 frames).
  assert.equal(tl.scenes[1].audioDurationInFrames, 30);
  assert.equal(tl.scenes[1].durationInFrames, 30);
  // Absolute positioning.
  assert.equal(tl.scenes[1].startFrame, 53);
  assert.equal(tl.scenes[1].lines[0].startFrame, 53);
  assert.equal(tl.durationInFrames, 83);
});

test('buildStoryTimeline is a pure function of (voiceData, fps, gapSec)', async () => {
  const { buildStoryTimeline } = await import('../remotion/lib/story-timing.ts');
  const a = buildStoryTimeline(voiceA, 30);
  const b = buildStoryTimeline(voiceA, 30);
  assert.deepEqual(a, b);
  assert.throws(() => buildStoryTimeline({}, 30), /non-empty scenes array/);
});

test('same story+voiceData inputProps produce an identical frame hash (determinism)', async () => {
  const r1 = await renderFrame(storyA, voiceA, 15, 'same-1');
  const r2 = await renderFrame(storyA, voiceA, 15, 'same-2');
  assert.equal(r1.durationInFrames, 83, 'composition duration must come from the fixture timeline');
  assert.equal(r1.hash, r2.hash, 'identical inputs must produce identical frames');
});

test('a different story produces a different film (different frame hash)', async () => {
  const hashA = (await renderFrame(storyA, voiceA, 15, 'story-a')).hash;
  const hashB = (await renderFrame(storyB, voiceB, 15, 'story-b')).hash;
  assert.notEqual(hashA, hashB, 'different stories must render different frames');
});
