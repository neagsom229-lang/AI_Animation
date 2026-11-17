/**
 * @fileoverview Round-4 tests: procedural motion, the face rig, foot
 * planting, language-aware subtitles, the camera move and the render
 * pre-flight.
 *
 * These are the contracts the Round-4 work introduced:
 *  - the weight shift is bounded, continuous and deterministic,
 *  - the speech-peak gesture fires on the ENVELOPE, not on a clock,
 *  - the shared viseme table drives both the VRM expression path and the
 *    GLB morph/jaw path,
 *  - foot planting clamps to the floor and never exceeds the leg budget,
 *  - the subtitle text follows the caption language's SCRIPT,
 *  - the dolly-drift rig pushes in AND drifts,
 *  - the pre-flight suggests a safe concurrency and only reaps the
 *    browsers that belong to this pipeline.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  weightShift,
  speechPeaks,
  speechPeakGesture,
  breathWave,
  bodyPose
} from '../remotion/lib/vrm-anim.ts';
import {
  lipSyncVisemes,
  visemeFromMorphName,
  resolveClip,
  clipWeights,
  CROSS_FADE_SECONDS
} from '../remotion/lib/character-anim.ts';
import { plantFoot, stanceFoot, MAX_LEG_CORRECTION_M } from '../remotion/lib/foot-plant.ts';
import { getSubtitleText, textMatchesLanguage } from '../remotion/lib/subtitles.ts';
import { getShotPose, SHOT_SPECS } from '../remotion/lib/camera.ts';
import {
  suggestConcurrency,
  staleRemotionChrome,
  freeMemoryMb,
  MIN_FREE_RAM_MB,
  DEFAULT_CONCURRENCY
} from '../scripts/preflight.mjs';

const FPS = 30;

// ---------------------------------------------------------------------------
// 1. Weight shift
// ---------------------------------------------------------------------------

test('weightShift is bounded, continuous and deterministic', () => {
  let prev = weightShift(0, FPS, 'a');
  for (let f = 1; f <= 300; f += 1) {
    const v = weightShift(f, FPS, 'a');
    assert.ok(v >= -1 && v <= 1, `weight shift out of range at frame ${f}: ${v}`);
    assert.ok(
      Math.abs(v - prev) < 0.12,
      `weight shift jumped ${Math.abs(v - prev).toFixed(4)} at frame ${f} — it must be continuous`
    );
    prev = v;
  }
  assert.equal(weightShift(42, FPS, 'a'), weightShift(42, FPS, 'a'));
  // Two characters must not shift in lockstep.
  assert.notEqual(weightShift(42, FPS, 'a'), weightShift(42, FPS, 'b'));
});

test('weightShift actually moves the hips, spine and chest (not just a number)', () => {
  const a = bodyPose({ action: 'idle', frame: 0, fps: FPS, seed: 'a' });
  const b = bodyPose({ action: 'idle', frame: 45, fps: FPS, seed: 'a' });
  assert.ok(
    Math.abs((a.hips?.z ?? 0) - (b.hips?.z ?? 0)) > 0.005,
    'the hips must roll with the weight shift'
  );
  assert.ok(
    Math.abs((a.spine?.y ?? 0) - (b.spine?.y ?? 0)) > 0.003,
    'the spine must counter-rotate'
  );
  assert.ok(
    Math.abs((a.chest?.y ?? 0) - (b.chest?.y ?? 0)) > 0.003,
    'the chest must counter-rotate against the hips'
  );
});

// ---------------------------------------------------------------------------
// 2. Speech peaks
// ---------------------------------------------------------------------------

test('speechPeaks finds the envelope maxima, not every sample', () => {
  const env = new Array(40).fill(0);
  env[10] = 0.9;
  env[20] = 0.8;
  env[30] = 0.95;
  const peaks = speechPeaks(env, 0, FPS);
  assert.ok(peaks.length >= 2, `expected the three peaks, got ${JSON.stringify(peaks)}`);
  for (const p of peaks) {
    assert.ok(p >= 0.45 && p <= 1.55, `peak at ${p}s is not a real envelope maximum`);
  }
});

test('speechPeaks returns nothing without an envelope', () => {
  assert.deepEqual(speechPeaks(undefined, 0, FPS), []);
  assert.deepEqual(speechPeaks([], 0, FPS), []);
});

test('the speech-peak gesture fires on the stressed syllable', () => {
  const env = new Array(60).fill(0);
  env[25] = 0.95; // 1.25 s into the line
  const fps = 30;
  const lineStart = 0;
  // Just before the peak: no gesture yet.
  const before = speechPeakGesture(30, fps, env, lineStart, 'a');
  // At the peak: the hand is up.
  const at = speechPeakGesture(Math.round(1.25 * fps), fps, env, lineStart, 'a');
  assert.equal(before.amount, 0, 'the gesture must not fire before the stress');
  assert.ok(at.amount > 0.5, `the gesture must fire on the peak, got ${at.amount}`);
  assert.ok(at.side === 'left' || at.side === 'right');
  // And it settles again.
  const after = speechPeakGesture(Math.round(2.4 * fps), fps, env, lineStart, 'a');
  assert.equal(after.amount, 0, 'the gesture must settle after the phrase');
});

test('a silent line produces no gesture and no mouth movement', () => {
  const gesture = speechPeakGesture(30, FPS, undefined, 0, 'a');
  assert.equal(gesture.amount, 0);
  const visemes = lipSyncVisemes(undefined, 30, FPS, 0, 'a');
  for (const v of Object.values(visemes)) assert.equal(v, 0);
});

// ---------------------------------------------------------------------------
// 3. Face rig (shared viseme table)
// ---------------------------------------------------------------------------

test('visemeFromMorphName maps the common spellings onto the five visemes', () => {
  assert.equal(visemeFromMorphName('aa'), 'aa');
  assert.equal(visemeFromMorphName('viseme_A'), 'aa');
  assert.equal(visemeFromMorphName('mouth_IH'), 'ih');
  assert.equal(visemeFromMorphName('v_ee'), 'ee');
  assert.equal(visemeFromMorphName('OU'), 'ou');
  assert.equal(visemeFromMorphName('oh'), 'oh');
  assert.equal(visemeFromMorphName('browRaise'), null);
  assert.equal(visemeFromMorphName(''), null);
});

test('lipSyncVisemes opens the mouth only while the voice runs', () => {
  const env = new Array(60).fill(0.8);
  const speaking = lipSyncVisemes(env, 30, FPS, 0, 'a');
  const total = Object.values(speaking).reduce((a, b) => a + b, 0);
  assert.ok(total > 0.5, 'the mouth must be open while the voice runs');
  // Before the line starts there is no mouth movement at all.
  const before = lipSyncVisemes(env, 30, FPS, 600, 'a');
  for (const v of Object.values(before)) assert.equal(v, 0);
  // After the line ends the mouth closes.
  const after = lipSyncVisemes(env, 30, FPS, -600, 'a');
  for (const v of Object.values(after)) assert.equal(v, 0);
});

test('lipSyncVisemes is deterministic', () => {
  const env = new Array(60).fill(0.5);
  assert.deepEqual(
    lipSyncVisemes(env, 45, FPS, 0, 'a'),
    lipSyncVisemes(env, 45, FPS, 0, 'a')
  );
});

// ---------------------------------------------------------------------------
// 4. Clip blending
// ---------------------------------------------------------------------------

test('resolveClip prefers the richest clip the model actually ships', () => {
  assert.equal(resolveClip(['Idle', 'Talk', 'Gesture', 'Walk'], 'talk'), 'Talk');
  assert.equal(resolveClip(['Idle', 'Walk'], 'talk'), 'Idle');
  assert.equal(resolveClip(['Idle', 'Walk'], 'walk'), 'Walk');
  assert.equal(resolveClip([], 'talk'), null);
  // Case-insensitive.
  assert.equal(resolveClip(['idle', 'talk'], 'talk'), 'talk');
});

test('clipWeights cross-fades from Idle and always starts on Idle', () => {
  const start = clipWeights('talk', 0, FPS);
  assert.equal(start.idle, 1, 'frame 0 must be pure Idle (never a bind pose)');
  assert.equal(start.talk, 0);
  const fadeFrames = Math.round(CROSS_FADE_SECONDS * FPS);
  const end = clipWeights('talk', fadeFrames, FPS);
  assert.equal(end.idle, 0);
  assert.equal(end.talk, 1);
  const mid = clipWeights('walk', fadeFrames / 2, FPS);
  assert.ok(mid.idle > 0 && mid.idle < 1, 'the fade must be gradual');
  assert.ok(Math.abs(mid.idle + mid.walk - 1) < 1e-9, 'weights must sum to 1');
});

// ---------------------------------------------------------------------------
// 5. Foot planting
// ---------------------------------------------------------------------------

test('plantFoot clamps a sunken foot to the floor and never exceeds the budget', () => {
  const sunk = plantFoot(-0.05, 0);
  assert.ok(sunk.planted, 'a foot below the floor must be reported as planted');
  assert.ok(sunk.correction > 0);
  assert.ok(sunk.correction <= MAX_LEG_CORRECTION_M);
  assert.ok(sunk.y >= -1e-9, 'the corrected foot must not stay below the floor');

  const floating = plantFoot(0.2, 0);
  assert.equal(floating.correction, 0, 'a foot above the floor must not be corrected');
  assert.equal(floating.planted, false);
});

test('plantFoot is a pure function of its inputs', () => {
  assert.deepEqual(plantFoot(-0.02, 0), plantFoot(-0.02, 0));
  assert.deepEqual(plantFoot(0.3, 0), plantFoot(0.3, 0));
});

test('stanceFoot alternates over the stride cycle', () => {
  assert.equal(stanceFoot(0.25), 'left');
  assert.equal(stanceFoot(0.75), 'right');
  assert.equal(stanceFoot(0.0), 'both');
  assert.equal(stanceFoot(1.25), 'left', 'the phase must wrap');
});

// ---------------------------------------------------------------------------
// 6. Language-aware subtitles
// ---------------------------------------------------------------------------

test('textMatchesLanguage reads the script, not the declared language', () => {
  assert.ok(textMatchesLanguage('ទឹកគឺជីវិត', 'km'));
  assert.ok(!textMatchesLanguage('Water is life', 'km'));
  assert.ok(textMatchesLanguage('Water is life', 'en'));
  assert.ok(!textMatchesLanguage('ទឹកគឺជីវិត', 'en'));
});

test('a Khmer caption uses the spoken Khmer line, not the English gloss', () => {
  const line = { text: 'ទឹកគឺជីវិតនៃអាណាចក្រ', subtitle: 'Water is life for the empire.' };
  assert.equal(
    getSubtitleText(line, { narrationLanguage: 'km', captionLanguage: 'km' }),
    'ទឹកគឺជីវិតនៃអាណាចក្រ'
  );
  // An English caption keeps the English gloss.
  assert.equal(
    getSubtitleText(line, { narrationLanguage: 'km', captionLanguage: 'en' }),
    'Water is life for the empire.'
  );
});

test('without language information the historical behaviour is kept', () => {
  assert.equal(
    getSubtitleText({ text: 'Stone temples rise.', subtitle: 'STONE TEMPLES RISE' }),
    'STONE TEMPLES RISE'
  );
});

// ---------------------------------------------------------------------------
// 7. Camera: the dolly-drift two-shot move
// ---------------------------------------------------------------------------

test('dolly-drift pushes in AND drifts sideways', () => {
  const start = getShotPose('over-shoulder', 'dolly-drift', 0, FPS, 120);
  const end = getShotPose('over-shoulder', 'dolly-drift', 120, FPS, 120);
  const dist = (p) =>
    Math.hypot(
      p.position[0] - p.lookAt[0],
      p.position[1] - p.lookAt[1],
      p.position[2] - p.lookAt[2]
    );
  assert.ok(dist(start) > dist(end), 'dolly-drift must push in');

  // The camera must not stand still: consecutive frames have to differ.
  const a = getShotPose('over-shoulder', 'dolly-drift', 40, FPS, 120);
  const b = getShotPose('over-shoulder', 'dolly-drift', 43, FPS, 120);
  const moved = Math.hypot(
    a.position[0] - b.position[0],
    a.position[1] - b.position[1],
    a.position[2] - b.position[2]
  );
  assert.ok(moved > 0.005, `the camera must move between frames, moved ${moved}`);
});

test('dolly-drift keeps the wide shot an establishing shot', () => {
  for (let frame = 0; frame <= 120; frame += 5) {
    const pose = getShotPose('wide', 'dolly-drift', frame, FPS, 120);
    assert.ok(pose.position[2] > 0, 'the camera must stay in front of the set');
    assert.ok(pose.position[1] >= 0.4, 'the camera must stay above the ground');
  }
});

test('the wide shot is aimed at the monument, not at the character', () => {
  const wide = SHOT_SPECS.wide;
  assert.ok(wide.target[2] < -30, 'the wide shot must look at the temple');
  assert.ok(wide.distance > 40, 'the wide shot must stand back from the monument');
});

// ---------------------------------------------------------------------------
// 8. Render pre-flight
// ---------------------------------------------------------------------------

test('suggestConcurrency falls back as the free memory drops', () => {
  assert.ok(suggestConcurrency(16384) >= DEFAULT_CONCURRENCY);
  assert.equal(suggestConcurrency(8192), 6);
  assert.equal(suggestConcurrency(4096), 4);
  assert.equal(suggestConcurrency(1000), 2);
  assert.equal(suggestConcurrency(0), 2);
});

test('the pre-flight only reaps browsers that belong to this pipeline', () => {
  const processes = [
    { pid: 1, rssMb: 10, commandLine: 'C:\\Program Files\\Google\\Chrome\\chrome.exe --no-startup-window' },
    {
      pid: 2,
      rssMb: 300,
      commandLine:
        'chrome.exe --headless --user-data-dir=C:\\Users\\x\\AppData\\Local\\Temp\\remotion-webpack-bundle-abc'
    },
    { pid: 3, rssMb: 200, commandLine: 'chrome.exe --type=renderer --user-data-dir=C:\\Temp\\remotion-x' }
  ];
  const stale = staleRemotionChrome(processes);
  assert.ok(
    stale.every((p) => p.pid !== 1),
    'a user\'s own browser must never be reaped'
  );
  assert.ok(stale.some((p) => p.pid === 2), 'a headless Remotion browser must be reaped');
});

test('the pre-flight reports the machine it is running on', () => {
  const free = freeMemoryMb();
  assert.ok(free > 0, 'free memory must be readable');
  assert.ok(MIN_FREE_RAM_MB === 4096, 'the warning threshold is 4 GB');
});
