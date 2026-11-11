/**
 * @fileoverview Unit tests for engine.js (keyframes and ParticleSystem pool).
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert';
import { keyframes, ParticleSystem, Easing } from '../src/core/engine.js';

test('keyframes evaluates exactly at each keyframe boundary', () => {
  const frames = [
    [0, 10, 'linear'],
    [5, 50, 'linear'],
    [10, 100, 'linear']
  ];
  for (const [t, val] of frames) {
    assert.strictEqual(keyframes(t, frames), val);
  }
});

test('keyframes handles duplicate timestamps without NaN', () => {
  const frames = [
    [0, 0],
    [1, 1],
    [1, 2],
    [2, 3]
  ];
  assert.strictEqual(keyframes(1, frames), 2);
  assert.strictEqual(keyframes(1.5, frames), 2.5);
  assert.notStrictEqual(Number.isNaN(keyframes(1, frames)), true);
});

test('ParticleSystem.emit() returns false when pool is full', () => {
  const ps = new ParticleSystem(5);
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(ps.emit({ x: i, y: i, life: 1 }), true);
  }
  assert.strictEqual(ps.activeCount, 5);
  assert.strictEqual(ps.emit({ x: 99, y: 99, life: 1 }), false);
});

test('ParticleSystem pool recycling', () => {
  const ps = new ParticleSystem(10);
  for (let i = 0; i < 10; i++) {
    ps.emit({ x: 0, y: 0, life: 0.1 });
  }
  assert.strictEqual(ps.activeCount, 10);

  // Update past lifetime
  ps.update(0.2);
  assert.strictEqual(ps.activeCount, 0);

  // Emit again successfully
  assert.strictEqual(ps.emit({ x: 1, y: 1, life: 1 }), true);
  assert.strictEqual(ps.activeCount, 1);
});
