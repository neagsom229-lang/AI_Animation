/** Phase 3 QA: parallax safety limiter purity + depth metric helpers. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  safetyFactor, limitParallax, directionVector,
  ABSOLUTE_MAX_AMPLITUDE, ABSOLUTE_MAX_OFFSET, EDGE_LIMIT,
} from '../remotion/lib/parallelax-safety.ts';

test('safetyFactor: 1 with no edges, clamped to [0.25,1] at/above edge limit', () => {
  assert.equal(safetyFactor(0), 1);
  assert.equal(safetyFactor(EDGE_LIMIT), 0.25, 'Round 10: clamps at MIN_LIMIT_FACTOR');
  assert.ok(safetyFactor(EDGE_LIMIT / 2) > 0.25 && safetyFactor(EDGE_LIMIT / 2) < 1);
  assert.equal(safetyFactor(1), 0.25, 'beyond limit clamps to 0.25, never 0');
  assert.equal(safetyFactor(NaN), 0.25);
});

test('directionVector maps overrides', () => {
  assert.deepEqual(directionVector('left'), { x: -1, y: 0 });
  assert.deepEqual(directionVector('right'), { x: 1, y: 0 });
  assert.deepEqual(directionVector('up'), { x: 0, y: -1 });
  assert.deepEqual(directionVector('down'), { x: 0, y: 1 });
  assert.deepEqual(directionVector(undefined), { x: 1, y: 0 });
});

test('limitParallax is deterministic, respects override, and never exceeds ceiling', () => {
  const a = limitParallax(0.1, { amplitude: 0.8, direction: 'left' });
  const b = limitParallax(0.1, { amplitude: 0.8, direction: 'left' });
  assert.deepEqual(a, b);
  assert.ok(a.amplitude <= ABSOLUTE_MAX_AMPLITUDE + 1e-12);
  assert.ok(a.offset <= ABSOLUTE_MAX_OFFSET + 1e-12);
  assert.equal(a.dirX, -1);
  // Hard edges clamp motion to the 0.25 floor (Round 10), not zero.
  const z = limitParallax(0.5, { amplitude: 1 });
  assert.ok(z.amplitude > 0 && z.amplitude <= ABSOLUTE_MAX_AMPLITUDE * 0.25 + 1e-12);
  assert.equal(z.factor, 0.25);
  // Clean depth with small override stays small.
  const s = limitParallax(0, { amplitude: 0.1 });
  assert.ok(s.amplitude < a.amplitude);
});

test('per-scene override amplitude is capped, not amplified', () => {
  const cap = limitParallax(0, { amplitude: 5 }); // invalid >1 clamps to 1
  assert.ok(cap.amplitude <= ABSOLUTE_MAX_AMPLITUDE + 1e-12);
});
