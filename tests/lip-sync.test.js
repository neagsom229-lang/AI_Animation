/**
 * @fileoverview Phase 3 lip-sync + action tests.
 *
 * - envelopeAmplitude: frame -> env sample mapping (20 Hz), clamping,
 *   light smoothing, and mouth-closed behaviour outside the speech span.
 * - actionSpeed / applyAction: story actions (idle, walk, talk, turn,
 *   gesture, react) as pure functions of (frame, fps, durationInFrames, seed).
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { envelopeAmplitude, actionSpeed, applyAction } from '../remotion/lib/anima.ts';

test('envelopeAmplitude samples the 20 Hz env array at the exact frame', async () => {
  const env = [0, 0, 0, 0, 0.8, 0.75, 1, 0.75, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  // fps=30 -> one env sample per 50 ms -> rel = frame * 20/30
  assert.equal(envelopeAmplitude(env, 0, 30, 0), 0); // rel = 0 -> env[0]
  assert.equal(envelopeAmplitude(env, 6, 30, 0), 0.8); // rel = 4 -> exact sample env[4]
  assert.ok(Math.abs(envelopeAmplitude(env, 7, 30, 0) - (0.8 + (0.75 - 0.8) * (2 / 3))) < 1e-9); // rel = 4.667 -> lerp between env[4] and env[5]
});

test('envelopeAmplitude interpolates between samples (light smoothing)', async () => {
  const env = [0, 0, 0, 0, 0.2, 0.8, 1, 0.8, 0.2, 0];
  const mid = envelopeAmplitude(env, 7, 30, 0); // rel = 4.667 -> between env[4]=0.2 and env[5]=0.8
  assert.ok(Math.abs(mid - 0.6) < 1e-9, `expected ~0.6, got ${mid}`);
});

test('envelopeAmplitude returns 0 outside the speech span (mouth closed)', async () => {
  const env = [0, 0, 0, 0, 0.2, 0.8, 1, 0.8, 0.2, 0];
  assert.equal(envelopeAmplitude(env, -1, 30, 0), 0); // before line start
  assert.equal(envelopeAmplitude(env, 30, 30, 0), 0); // past the last env sample (rel=20 > len-1=9)
});

test('envelopeAmplitude clamps the amplitude into 0..1', async () => {
  const env = [2, 0, 0];
  assert.equal(envelopeAmplitude(env, 0, 30, 0), 1); // rel=0 -> value=2 -> clamped to 1
  assert.ok(Math.abs(envelopeAmplitude(env, 1, 30, 0) - (2 + (0 - 2) * (2 / 3))) < 1e-9); // 0.667 -> clamped to 0.667
  assert.equal(envelopeAmplitude(env, 2, 30, 0), 0);
});

test('actionSpeed: walk keeps a stride, everything else is idle', () => {
  assert.equal(actionSpeed('walk'), 1.2);
  assert.equal(actionSpeed('idle'), 0);
  assert.equal(actionSpeed('talk'), 0);
  assert.equal(actionSpeed('turn'), 0);
  assert.equal(actionSpeed('gesture'), 0);
  assert.equal(actionSpeed('react'), 0);
});

test('applyAction turn eases the character to face the opposite direction', () => {
  const mkRig = () => ({
    object: { rotation: { y: 0 } },
    bones: {
      Head: { rotation: { x: 0, y: 0 } },
      Chest: { rotation: { y: 0 } },
      RightArm: { rotation: { x: 0, z: 0 } },
      LeftArm: { rotation: { z: 0 } },
    },
  });
  const rig = mkRig();
  applyAction(rig, 'turn', 0, 30, 90, 13);
  assert.equal(rig.object.rotation.y, 0);
  applyAction(rig, 'turn', 45, 30, 90, 13);
  const eased = (0.5 * 0.5) * (3 - 2 * 0.5);
  assert.ok(Math.abs(rig.object.rotation.y - Math.PI * eased) < 1e-9);
  applyAction(rig, 'turn', 90, 30, 90, 13);
  assert.ok(Math.abs(rig.object.rotation.y - Math.PI) < 1e-9);
});

test('applyAction talk is deterministic per frame (gentle nods)', () => {
  const mkRig = () => ({
    object: { rotation: { y: 0 } },
    bones: {
      Head: { rotation: { x: 0, y: 0 } },
      Chest: { rotation: { y: 0 } },
      RightArm: { rotation: { x: 0, z: 0 } },
      LeftArm: { rotation: { z: 0 } },
    },
  });
  const a = mkRig();
  const b = mkRig();
  applyAction(a, 'talk', 12, 30, 90, 13);
  applyAction(b, 'talk', 12, 30, 90, 13);
  assert.deepEqual(a.bones.Head.rotation, b.bones.Head.rotation);
  assert.deepEqual(a.bones.Chest.rotation, b.bones.Chest.rotation);
});

test('applyAction gesture raises the right arm on a seeded rhythm', () => {
  const mkRig = () => ({
    object: { rotation: { y: 0 } },
    bones: {
      Head: { rotation: { x: 0, y: 0 } },
      Chest: { rotation: { y: 0 } },
      RightArm: { rotation: { x: 0, z: 0 } },
      LeftArm: { rotation: { z: 0 } },
    },
  });
  const a = mkRig();
  const b = mkRig();
  applyAction(a, 'gesture', 5, 30, 90, 13);
  applyAction(b, 'gesture', 5, 30, 90, 13);
  assert.deepEqual(a.bones.RightArm.rotation, b.bones.RightArm.rotation);
  assert.deepEqual(a.bones.Head.rotation, b.bones.Head.rotation);
});

test('applyAction react applies a deterministic startle dip', () => {
  const mkRig = () => ({
    object: { rotation: { y: 0 } },
    bones: {
      Head: { rotation: { x: 0, y: 0 } },
      Chest: { rotation: { y: 0 } },
      RightArm: { rotation: { x: 0, z: 0 } },
      LeftArm: { rotation: { z: 0 } },
    },
  });
  const a = mkRig();
  const b = mkRig();
  applyAction(a, 'react', 20, 30, 90, 13);
  applyAction(b, 'react', 20, 30, 90, 13);
  assert.deepEqual(a.bones.Head.rotation, b.bones.Head.rotation);
  assert.deepEqual(a.bones.Chest.rotation, b.bones.Chest.rotation);
});
