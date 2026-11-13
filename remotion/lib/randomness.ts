/**
 * @fileoverview Deterministic randomness helpers for the Remotion pipeline.
 *
 * RULE (Phase 1): never call `Math.random()`. Every random-looking value must
 * be derived from Remotion's seeded `random(seed)` so that rendering the same
 * frame twice produces identical pixels.
 * @module remotion/lib/randomness
 */

import { random } from 'remotion';

/**
 * Seeded, deterministic float in [0, 1) for a stable string key.
 * `seeded('dust-3', 'x')` returns the same value in every run, every frame.
 */
export function seeded(key: string, subKey: string): number {
  return random(`${key}::${subKey}`);
}

/**
 * mulberry32: tiny deterministic PRNG factory. Same seed → identical sequence,
 * in every process, on every machine. Use it to seed libraries that accept a
 * `random` function (e.g. simplex-noise's createNoise2D).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DustSpec {
  id: string;
  x: number;
  /** Base height [m]. */
  y: number;
  z: number;
  /** Rise speed [m/s]. */
  speed: number;
  size: number;
}

/**
 * Build a deterministic field of floating dust motes.
 * Pure function: same `count` → identical array, forever.
 */
export function makeDust(count: number): DustSpec[] {
  return Array.from({ length: count }, (_unused, i) => {
    const id = `dust-${i}`;
    return {
      id,
      x: (seeded(id, 'x') - 0.5) * 26,
      y: 0.4 + seeded(id, 'y') * 6.5,
      z: (seeded(id, 'z') - 0.5) * 18,
      speed: 0.15 + seeded(id, 'speed') * 0.35,
      size: 0.03 + seeded(id, 'size') * 0.05
    };
  });
}
