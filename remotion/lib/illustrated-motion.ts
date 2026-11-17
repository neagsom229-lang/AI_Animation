/**
 * @fileoverview Pure parallax camera + ambient-FX math for the illustrated film.
 *
 * Every export is a pure function of (frame, fps, seed, …) — no state, no
 * wall-clock, no Math.random (seeded values come from randomness.ts). A frame
 * re-rendered twice is pixel-identical.
 * @module remotion/lib/illustrated-motion
 */

import { seeded } from './randomness.ts';

export type CameraMove = 'push-in' | 'push-out' | 'truck-left' | 'truck-right' | 'crane-up' | 'static';

/** Overscan so parallax never reveals the plane edges (8% per brief). */
export const OVERSCAN = 0.08;
/** Max parallax offset (fraction of plane) — clamps to avoid stretching. */
export const MAX_PARALLAX = 0.10;

export interface ParallaxPose {
  /** Horizontal texture offset in [-MAX_PARALLAX, MAX_PARALLAX]. */
  offsetX: number;
  offsetY: number;
  /** Scale >1; 1 + OVERSCAN is the resting overscan. */
  scale: number;
}

function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * Camera move as a pure function of frame. Returns texture-space offsets that
 * the shader applies to the depth-displaced mesh; bounded by MAX_PARALLAX.
 */
export function parallaxPose(
  move: CameraMove,
  frame: number,
  fps: number,
  durationInFrames: number,
  seed = 'cam'
): ParallaxPose {
  const rest = 1 + OVERSCAN;
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0 || durationInFrames <= 0) {
    return { offsetX: 0, offsetY: 0, scale: rest };
  }
  const t = easeInOut(frame / Math.max(1, durationInFrames - 1));
  const a = MAX_PARALLAX * (0.6 + 0.4 * seeded(`illcam:${seed}`, 'amp'));
  const noise = (seeded(`illcam:${seed}`, 'drift') - 0.5) * MAX_PARALLAX * 0.06;
  switch (move) {
    case 'push-in': return { offsetX: noise * t, offsetY: 0, scale: rest + 0.10 * t };
    case 'push-out': return { offsetX: noise * t, offsetY: 0, scale: rest + 0.10 * (1 - t) };
    case 'truck-left': return { offsetX: a * (0.5 - t), offsetY: 0, scale: rest };
    case 'truck-right': return { offsetX: a * (t - 0.5), offsetY: 0, scale: rest };
    case 'crane-up': return { offsetX: noise, offsetY: a * (t - 0.35), scale: rest + 0.03 * t };
    case 'static':
    default: return { offsetX: noise, offsetY: 0, scale: rest };
  }
}

// ---------------------------------------------------------------------------
// Ambient FX — seeded, frame-pure scalar helpers (the composition turns these
// into DOM/CSS or shader elements).
// ---------------------------------------------------------------------------

/** Deterministic pseudo-random in [0,1) for an fx particle/frame. */
export function fxRandom(fx: string, particle: number, frame: number, channel: string): number {
  return seeded(`fx:${fx}:${particle}:${frame}`, channel);
}

/** Normalised time in seconds. */
export function secs(frame: number, fps: number): number {
  return fps > 0 ? frame / fps : 0;
}

/** Dust/pollen: particle position (x,y in 0..1) and opacity for a frame. */
export function dustParticle(seed: string, i: number, frame: number, fps: number) {
  const sp = 0.02 + fxRandom('dust', i, 0, 'speed') * 0.05;
  const t = secs(frame, fps);
  const x = (fxRandom('dust', i, 0, 'x') + t * sp * 0.3) % 1;
  const y = (fxRandom('dust', i, 0, 'y') - t * sp) % 1;
  const phase = fxRandom('dust', i, 0, 'phase') * Math.PI * 2;
  return { x: (x + 1) % 1, y: (y + 1) % 1, opacity: 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + phase)) };
}

/** God-ray beam angle (radians) and strength, slow and frame-pure. */
export function godRays(seed: string, frame: number, fps: number) {
  const t = secs(frame, fps);
  return {
    angle: -0.5 + 0.12 * Math.sin(t * 0.18 + seeded(`godrays:${seed}`, 'p') * 6.28),
    strength: 0.12 + 0.06 * (0.5 + 0.5 * Math.sin(t * 0.3)),
  };
}

/** Water shimmer phase forripple highlights. */
export function waterShimmer(seed: string, frame: number, fps: number): number {
  return Math.sin(secs(frame, fps) * 1.6 + seeded(`water:${seed}`, 'p') * 6.28) * 0.5 + 0.5;
}

/** Grass/rice sway angle (radians) for a frame. */
export function grassSway(seed: string, frame: number, fps: number, frequencyHz = 0.7): number {
  const t = secs(frame, fps);
  return 0.045 * Math.sin(t * Math.PI * 2 * frequencyHz + seeded(`grass:${seed}`, 'p') * 6.28);
}

/** Bird flock: one bird's (x,y) for a frame. */
export function bird(seed: string, i: number, frame: number, fps: number) {
  const t = secs(frame, fps);
  const speed = 0.03 + fxRandom('bird', i, 0, 'speed') * 0.03;
  const x = (fxRandom('bird', i, 0, 'x') + t * speed) % 1;
  const y = fxRandom('bird', i, 0, 'y') + 0.05 * Math.sin(t * 3 + i);
  return { x: (x + 1) % 1, y };
}

/** Firefly brightness at dusk for a frame. */
export function firefly(seed: string, i: number, frame: number, fps: number) {
  const t = secs(frame, fps);
  const phase = fxRandom('fire', i, 0, 'phase') * 6.28;
  const pulse = Math.max(0, Math.sin(t * 2.2 + phase)) ** 3;
  return {
    x: fxRandom('fire', i, 0, 'x'),
    y: fxRandom('fire', i, 0, 'y') + 0.02 * Math.sin(t + phase),
    brightness: pulse,
  };
}

/** Film-grain tile offset (integer pixels) — deterministic per frame. */
export function grainOffset(frame: number, fps: number): { x: number; y: number } {
  return { x: (frame * 37) % 512, y: (frame * 91) % 512 };
}

/** Smoke plume drift (x offset) for a frame. */
export function smokeDrift(seed: string, frame: number, fps: number): number {
  return 0.03 * Math.sin(secs(frame, fps) * 0.9 + seeded(`smoke:${seed}`, 'p') * 6.28);
}

// ---------------------------------------------------------------------------
// Transitions + year chips (frame-pure)
// ---------------------------------------------------------------------------

/** 0.6 s crossfade: opacity in [0,1] over the first `fadeFrames` of a scene. */
export function crossfadeOpacity(frame: number, fps: number, seconds = 0.6): number {
  const fadeFrames = Math.max(1, seconds * fps);
  return easeInOut(frame / fadeFrames);
}

/** Dip-to-black: 1 = black, 0 = clear; dips at both ends of a scene. */
export function dipToBlack(frame: number, fps: number, durationInFrames: number, seconds = 0.6): number {
  const fadeFrames = Math.max(1, seconds * fps);
  const inFade = 1 - easeInOut(frame / fadeFrames);
  const outFade = 1 - easeInOut((durationInFrames - frame) / fadeFrames);
  return Math.max(inFade, outFade);
}

/** Year chips appear after the crossfade, for ~2.2 s, then retire. */
export function yearChipOpacity(frame: number, fps: number, delaySec = 0.7, holdSec = 2.2): number {
  const t = secs(frame, fps);
  if (t < delaySec) return easeInOut((t - delaySec + 0.3) / 0.3);
  if (t > delaySec + holdSec) return 1 - easeInOut((t - (delaySec + holdSec)) / 0.4);
  return 1;
}

// ---------------------------------------------------------------------------
// Audio ducking (frame-pure)
// ---------------------------------------------------------------------------

/** Music gain (0..1): ~-14 dB under voice, smooth fades. */
export const DUCK_GAIN = Math.pow(10, -14 / 20); // ≈ 0.1995
export const DUCK_FADE_SEC = 0.35;

/**
 * Frame-pure music volume given voice line spans [startFrame, endFrame).
 * Returns DUCK_GAIN during narration with linear ramps at the edges.
 */
export function musicVolume(
  frame: number,
  fps: number,
  spans: Array<{ start: number; end: number }>,
  fadeSec = DUCK_FADE_SEC
): number {
  const fadeFrames = Math.max(1, fadeSec * fps);
  let target = 1;
  for (const s of spans) {
    if (frame >= s.start && frame < s.end) { target = DUCK_GAIN; break; }
    if (frame >= s.start - fadeFrames && frame < s.start) {
      target = Math.min(target, 1 + (DUCK_GAIN - 1) * ((frame - (s.start - fadeFrames)) / fadeFrames));
    }
    if (frame >= s.end && frame < s.end + fadeFrames) {
      target = Math.min(target, DUCK_GAIN + (1 - DUCK_GAIN) * ((frame - s.end) / fadeFrames));
    }
  }
  return Math.min(1, Math.max(DUCK_GAIN, target));
}
