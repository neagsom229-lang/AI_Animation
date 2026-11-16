/**
 * @fileoverview Unit tests for the VRM facial/body animation library
 * (remotion/lib/vrm-anim.ts) plus the FK never-T-pose proof against the
 * shipped VRM assets (the "solved arm constants" the module documents).
 *
 * Everything here is pure frame math — the same frame always produces the
 * same pose, which is what keeps the render deterministic (Phase 1 contract).
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  blinkWeight,
  gazeSaccade,
  breathWave,
  headSway,
  mouthWeights,
  bodyPose,
  actionFadeWeight,
  gestureEnvelope,
  IDLE_POSE,
  RHUBARB_TO_VOWEL,
  SACCADE_YAW_RAD,
  SACCADE_PITCH_RAD,
  MAX_SWAY_RAD,
  BLINK_MIN_INTERVAL_SEC,
  BLINK_MAX_INTERVAL_SEC,
  POSE_CROSS_FADE_SEC,
} from '../remotion/lib/vrm-anim.ts';
import { buildRestPose, fkPose, boneDirection } from '../scripts/lib/vrm-pose.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FPS = 30;

const ENV_LOUD = Array.from({ length: 220 }, () => 0.9);
const ENV_SILENT = Array.from({ length: 220 }, () => 0);

// ---------------------------------------------------------------------------
// Blink
// ---------------------------------------------------------------------------

test('blinkWeight is deterministic, ranged, and blinks at least once in 10 s', () => {
  for (const seed of ['reach', 'minea', 'test-seed']) {
    let sawClose = false;
    for (let frame = 0; frame < 300; frame++) {
      const w = blinkWeight(frame, FPS, seed);
      assert.ok(w >= 0 && w <= 1, `weight ${w} out of [0, 1]`);
      if (w > 0.9) sawClose = true;
      assert.equal(w, blinkWeight(frame, FPS, seed), 'not deterministic');
    }
    assert.ok(sawClose, `seed "${seed}" never blinks in 10 s`);
  }
});

test('blinkWeight returns 0 for invalid input', () => {
  assert.equal(blinkWeight(NaN, FPS, 'reach'), 0);
  assert.equal(blinkWeight(0, 0, 'reach'), 0);
  assert.equal(blinkWeight(0, -30, 'reach'), 0);
});

test('blink schedule respects the 3–5 s seeded interval contract', () => {
  // The module documents minimum/maximum gaps; assert the constants pin the
  // documented window (3 s .. 5 s) so a future tweak is a deliberate act.
  assert.equal(BLINK_MIN_INTERVAL_SEC, 3);
  assert.equal(BLINK_MAX_INTERVAL_SEC, 5);
});

// ---------------------------------------------------------------------------
// Gaze
// ---------------------------------------------------------------------------

test('gazeSaccade stays inside its documented bounds and starts at zero', () => {
  for (const seed of ['reach', 'minea']) {
    assert.deepEqual(gazeSaccade(0, FPS, seed), { yaw: 0, pitch: 0 });
    for (let frame = 0; frame < 1500; frame++) {
      const { yaw, pitch } = gazeSaccade(frame, FPS, seed);
      assert.ok(Math.abs(yaw) <= SACCADE_YAW_RAD + 1e-9, `yaw ${yaw}`);
      assert.ok(Math.abs(pitch) <= SACCADE_PITCH_RAD + 1e-9, `pitch ${pitch}`);
      assert.deepEqual(gazeSaccade(frame, FPS, seed), { yaw, pitch });
    }
  }
});

// ---------------------------------------------------------------------------
// Breathing + head sway
// ---------------------------------------------------------------------------

test('breathWave stays in [0, 1] and is deterministic', () => {
  for (const seed of ['reach', 'minea']) {
    for (let frame = 0; frame < 600; frame++) {
      const v = breathWave(frame, FPS, seed);
      assert.ok(v >= 0 && v <= 1, `breath ${v}`);
      assert.equal(v, breathWave(frame, FPS, seed));
    }
  }
});

test('headSway stays inside MAX_SWAY_RAD on every axis', () => {
  for (const seed of ['reach', 'minea']) {
    for (let frame = 0; frame < 900; frame++) {
      const s = headSway(frame, FPS, seed);
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(Math.abs(s[axis]) <= MAX_SWAY_RAD + 1e-9, `${axis} ${s[axis]}`);
      }
      assert.deepEqual(s, headSway(frame, FPS, seed));
    }
  }
});

// ---------------------------------------------------------------------------
// Mouth — envelope fallback and Rhubarb cues
// ---------------------------------------------------------------------------

test('mouth is closed before the line starts and when the voice is silent', () => {
  const before = mouthWeights({ frame: 10, fps: FPS, env: ENV_LOUD, lineStartFrame: 30, seed: 'reach' });
  assert.deepEqual(before, { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 });

  const silent = mouthWeights({ frame: 60, fps: FPS, env: ENV_SILENT, lineStartFrame: 0, seed: 'reach' });
  assert.deepEqual(silent, { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 });

  // No envelope at all (listener, or a line with no audio yet) = closed.
  const noEnv = mouthWeights({ frame: 60, fps: FPS, lineStartFrame: 0, seed: 'reach' });
  assert.deepEqual(noEnv, { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 });
});

test('a loud envelope opens the mouth with weights in [0, 1]', () => {
  const m = mouthWeights({ frame: 45, fps: FPS, env: ENV_LOUD, lineStartFrame: 0, seed: 'reach' });
  const total = m.aa + m.ih + m.ou + m.ee + m.oh;
  assert.ok(total > 0.5, `expected an open mouth, got total ${total}`);
  for (const v of Object.values(m)) {
    assert.ok(v >= 0 && v <= 1, `weight ${v} out of [0, 1]`);
  }
});

test('Rhubarb cues take precedence over the envelope', () => {
  const cues = [{ start: 0, end: 10, value: 'A' }];
  const m = mouthWeights({ frame: 30, fps: FPS, env: ENV_SILENT, lineStartFrame: 0, mouthCues: cues, seed: 'reach' });
  assert.deepEqual(m, { aa: 1, ih: 0, ou: 0, ee: 0, oh: 0 });

  // F = lips closed (M/B/P) even if the cue overlaps a vowel region.
  const closedCue = [{ start: 0, end: 10, value: 'F' }];
  const f = mouthWeights({ frame: 30, fps: FPS, env: ENV_LOUD, lineStartFrame: 0, mouthCues: closedCue, seed: 'reach' });
  assert.deepEqual(f, { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 });

  // In the gap between two cues the mouth closes exactly when the cue ends.
  const gapped = [
    { start: 0, end: 1, value: 'A' },
    { start: 2, end: 3, value: 'C' },
  ];
  const gap = mouthWeights({ frame: 45, fps: FPS, env: ENV_LOUD, lineStartFrame: 0, mouthCues: gapped, seed: 'reach' });
  assert.deepEqual(gap, { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 });

  // The Preston Blair A–F table maps to all five VRM vowel presets + null.
  assert.deepEqual(
    Object.keys(RHUBARB_TO_VOWEL).sort(),
    ['A', 'B', 'C', 'D', 'E', 'F']
  );
});

test('mouthWeights is deterministic', () => {
  const input = { frame: 123, fps: FPS, env: ENV_LOUD, lineStartFrame: 0, seed: 'minea' };
  assert.deepEqual(mouthWeights(input), mouthWeights(input));
});

// ---------------------------------------------------------------------------
// Body pose — structure, never-T-pose, determinism
// ---------------------------------------------------------------------------

test('frame 0 equals the solved IDLE_POSE for the arms (no action layer yet)', () => {
  for (const action of ['talk', 'walk', 'turn', 'react', 'idle']) {
    const pose = bodyPose({ action, frame: 0, fps: FPS, seed: 'reach', env: ENV_LOUD, lineStartFrame: 0 });
    assert.equal(pose.leftUpperArm.z, IDLE_POSE.leftUpperArm.z);
    assert.equal(pose.rightUpperArm.z, IDLE_POSE.rightUpperArm.z);
    assert.equal(pose.leftLowerArm.z, IDLE_POSE.leftLowerArm.z);
    assert.equal(pose.rightLowerArm.z, IDLE_POSE.rightLowerArm.z);
  }
  assert.equal(actionFadeWeight(0, FPS, 'talk'), 0);
  assert.equal(actionFadeWeight(Math.ceil(POSE_CROSS_FADE_SEC * FPS), FPS, 'talk'), 1);
  assert.equal(actionFadeWeight(0, FPS, 'idle'), 1);
});

test('bodyPose is NaN-free and deterministic across actions and frames', () => {
  for (const action of ['idle', 'talk', 'walk', 'turn', 'react']) {
    for (let frame = 0; frame < 400; frame += 3) {
      const input = { action, frame, fps: FPS, seed: 'minea', env: ENV_LOUD, lineStartFrame: 0 };
      const a = bodyPose(input);
      const b = bodyPose(input);
      assert.deepEqual(a, b);
      for (const bone of Object.values(a)) {
        for (const v of [bone.x, bone.y, bone.z]) assert.ok(Number.isFinite(v), 'non-finite bone value');
      }
    }
  }
});

test('walk actually moves the legs (opposite phases)', () => {
  const pose = bodyPose({ action: 'walk', frame: 11, fps: FPS, seed: 'minea', env: ENV_LOUD, lineStartFrame: 0 });
  assert.ok(Math.abs(pose.leftUpperLeg.x) > 1e-6, 'left leg did not move');
  assert.equal(Math.sign(pose.leftUpperLeg.x), -Math.sign(pose.rightUpperLeg.x));
});

test('gestureEnvelope stays in [0, 1] and is deterministic', () => {
  for (const seed of ['reach', 'minea']) {
    let sawActive = false;
    for (let frame = 0; frame < 900; frame++) {
      const v = gestureEnvelope(frame, FPS, seed);
      assert.ok(v >= 0 && v <= 1, `gesture envelope ${v}`);
      if (v > 0.5) sawActive = true;
      assert.equal(v, gestureEnvelope(frame, FPS, seed));
    }
    assert.ok(sawActive, `seed "${seed}" never gestures in 30 s`);
  }
});

// ---------------------------------------------------------------------------
// FK never-T-pose against the shipped VRM assets
// ---------------------------------------------------------------------------

const ARM_CHECKS = [
  { side: 'left', upper: 'leftUpperArm', lower: 'leftLowerArm', hand: 'leftHand' },
  { side: 'right', upper: 'rightUpperArm', lower: 'rightLowerArm', hand: 'rightHand' },
];

/** Angle of the shoulder→elbow segment below the horizontal, in radians. */
function armDropRadians(world, upper, lower) {
  const dir = boneDirection(world, upper, lower);
  return Math.asin(Math.max(-1, Math.min(1, -dir.y)));
}

for (const file of ['Vita.vrm', 'Vivi.vrm']) {
 test(`FK: arms stay far below horizontal on ${file} (never T-pose)`, () => {
    const buffer = fs.readFileSync(path.join(ROOT, 'public/models/characters', file));
    const rest = buildRestPose(buffer);
    const frames = [0, 30, 75, 120, 210, 300, 359];
    for (const action of ['idle', 'talk', 'walk', 'turn', 'react']) {
      for (const frame of frames) {
        const pose = bodyPose({ action, frame, fps: FPS, seed: 'minea', env: ENV_LOUD, lineStartFrame: 0 });
        const world = fkPose(rest, pose);
        for (const arm of ARM_CHECKS) {
          const drop = armDropRadians(world, arm.upper, arm.lower);
          assert.ok(
            drop > 0.9,
            `${file} ${action} frame ${frame} ${arm.side}: arm only ${(drop * 180 / Math.PI).toFixed(1)}° below horizontal`
          );
        }
      }
    }
  });
}
