/** Round 11 item 2: world3d camera-travel clamp is frame-pure and engages. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clampCameraTravel } from '../remotion/lib/parallelax-safety.ts';

test('clampCameraTravel: factor 1 = full travel, 0.4 = 40% toward start', () => {
  const start = [0, 5, 15];
  const full = [2, 8, 12];
  assert.deepEqual(clampCameraTravel(full, start, 1), full);
  const c = clampCameraTravel(full, start, 0.4);
  assert.ok(Math.abs(c[0] - 0.8) < 1e-9, `x ${c[0]} should be 0.8`);
  assert.ok(Math.abs(c[1] - 6.2) < 1e-9);
  assert.ok(Math.abs(c[2] - 13.8) < 1e-9);
});

test('clampCameraTravel: pure + clamped for invalid factors', () => {
  const a = clampCameraTravel([1, 2, 3], [0, 0, 0], 0.6);
  const b = clampCameraTravel([1, 2, 3], [0, 0, 0], 0.6);
  assert.deepEqual(a, b);
  assert.deepEqual(clampCameraTravel([1, 2, 3], [0, 0, 0], NaN), [1, 2, 3]);
  assert.deepEqual(clampCameraTravel([1, 2, 3], [0, 0, 0], -5), [0, 0, 0]);
  assert.deepEqual(clampCameraTravel([1, 2, 3], [0, 0, 0], 5), [1, 2, 3]);
});

test('world3d scenes have varied limitFactors from real metrics (limiter engages)', () => {
  const m = JSON.parse(fs.readFileSync('out/review/parallax-metrics.json', 'utf8'));
  const world3d = m.scenes.filter((s) => ['crane-up', 'orbit', 'dolly'].some((c) => (s.camera || '').includes(c)));
  assert.ok(world3d.length > 0);
  assert.ok(new Set(world3d.map((s) => s.limitFactor)).size > 1,
    'world3d scenes have varied limitFactors');
});

test('composition wires clampCameraTravel into World3DScene', () => {
  const src = fs.readFileSync('remotion/compositions/IllustratedFilm.tsx', 'utf8');
  assert.ok(src.includes('clampCameraTravel'), 'World3D must use the clamp');
  assert.ok(src.includes('limitFactor={factor}'), 'limiter factor must reach World3DScene');
});
