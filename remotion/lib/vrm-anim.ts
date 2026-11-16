/**
 * @fileoverview Pure frame-index facial + body animation for the VRM
 * characters (Goal 3).
 *
 * Every export here is a pure function of (frame, fps, seed, …): no state, no
 * wall-clock, no `Math.random` — seeded values come from remotion/lib/
 * randomness.ts (Remotion's `random()`), so a frame re-rendered twice is
 * pixel-identical (the Phase 1 contract).
 *
 * The library drives three things the GLB path could not:
 *  - **blink** with seeded 3–5 s intervals,
 *  - **gaze** micro-saccades on top of the lookAt target (listener/camera),
 *  - **mouth** aa/ih/ou/ee/oh visemes from the 20 Hz voice envelope, with a
 *    Rhubarb mouth-cue path that takes precedence when `mouthCues` exist
 *    (none are shipped yet — see CREDITS.md — so the envelope is the live
 *    path and the mouth closes exactly when the voice stops).
 *
 * `bodyPose()` returns euler maps for three-vrm's *normalized* bones (world-
 * aligned axes, T-pose rest). The solved arm constants put the arms at
 * ~78° below horizontal with soft elbows — proven never-T-pose by FK in
 * tests/vrm-anim.test.js against the shipped assets (solved by
 * scripts/pose-solve.mjs).
 *
 * @module remotion/lib/vrm-anim
 */

import { seeded } from './randomness.ts';
import { envelopeAmplitude } from './anima.ts';
import { headNodRadians } from './character-anim.ts';
import type { RhubarbCue } from './story-timing.ts';

// Re-exported so the component imports one module for all VRM anim types.
export type { RhubarbCue } from './story-timing.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** VRM expression presets used for the mouth (VRM 1.0 names). */
export type MouthShape = 'aa' | 'ih' | 'ou' | 'ee' | 'oh';

/** Expression weights for one frame; all in [0, 1]. */
export interface MouthWeights {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
}

/** Euler XYZ radians (three.js convention) for one normalized bone. */
export interface Euler3 {
  x: number;
  y: number;
  z: number;
}

/** Normalized VRM bones this module drives. */
export type VrmBoneName =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftUpperArm'
  | 'rightUpperArm'
  | 'leftLowerArm'
  | 'rightLowerArm'
  | 'leftHand'
  | 'rightHand'
  | 'leftUpperLeg'
  | 'rightUpperLeg'
  | 'leftLowerLeg'
  | 'rightLowerLeg';

/** Pose map: bone name → euler; bones absent from the map stay at rest. */
export type BodyPose = Partial<Record<VrmBoneName, Euler3>>;

// RhubarbCue is defined in story-timing.ts (React-free module) and re-exported above.

// ---------------------------------------------------------------------------
// Blink — seeded 3–5 s intervals
// ---------------------------------------------------------------------------

/** Minimum gap between blink events, in seconds. */
export const BLINK_MIN_INTERVAL_SEC = 3;
/** Maximum gap between blink events, in seconds. */
export const BLINK_MAX_INTERVAL_SEC = 5;
/** How long one blink takes (close + open), in seconds. */
export const BLINK_DURATION_SEC = 0.14;
/** First blink lands 0.6–2.0 s after the scene starts. */
const BLINK_FIRST_DELAY_SEC = 0.6;
const BLINK_FIRST_JITTER_SEC = 1.4;

/**
 * Blink weight in [0, 1] for a frame: 0 = eyes open, 1 = fully closed.
 *
 * Blink events are laid out by walking seeded intervals
 * `[3 s, 5 s]` from a seeded first delay, then evaluated as a sine pulse —
 * a pure function of (frame, fps, seed), so two characters with different
 * seeds never blink in lockstep.
 */
export function blinkWeight(frame: number, fps: number, seed: string): number {
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) return 0;
  const t = frame / fps;
  let next = BLINK_FIRST_DELAY_SEC + seeded(`blink:${seed}`, 'first') * BLINK_FIRST_JITTER_SEC;
  let i = 0;
  while (next <= t) {
    if (t < next + BLINK_DURATION_SEC) {
      const phase = (t - next) / BLINK_DURATION_SEC;
      return Math.sin(phase * Math.PI);
    }
    i += 1;
    next +=
      BLINK_MIN_INTERVAL_SEC +
      seeded(`blink:${seed}`, `i${i}`) * (BLINK_MAX_INTERVAL_SEC - BLINK_MIN_INTERVAL_SEC);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Gaze — micro-saccades on top of the lookAt target
// ---------------------------------------------------------------------------

/** Minimum gap between saccades, in seconds. */
export const SACCADE_MIN_PERIOD_SEC = 0.55;
/** Maximum gap between saccades, in seconds. */
export const SACCADE_MAX_PERIOD_SEC = 1.15;
/** Peak yaw offset of a saccade (radians, ≈2.6°). */
export const SACCADE_YAW_RAD = 0.045;
/** Peak pitch offset of a saccade (radians, ≈1.4°). */
export const SACCADE_PITCH_RAD = 0.025;

export interface GazeOffset {
  yaw: number;
  pitch: number;
}

/**
 * Eye-gaze micro-saccade offset (radians) for a frame.
 *
 * Real eyes fixate, jump, fixate — this returns the current piecewise-
 * constant offset (the component rotates the lookAt target direction by it).
 * Pure function of (frame, fps, seed); starts at 0 so a freshly mounted
 * scene looks straight at its target first.
 */
export function gazeSaccade(frame: number, fps: number, seed: string): GazeOffset {
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) {
    return { yaw: 0, pitch: 0 };
  }
  const t = frame / fps;
  let current: GazeOffset = { yaw: 0, pitch: 0 };
  let next = 0.4 + seeded(`sac:${seed}`, 'first') * 0.8;
  let i = 0;
  while (next <= t) {
    i += 1;
    current = {
      yaw: (seeded(`sac:${seed}`, `y${i}`) - 0.5) * 2 * SACCADE_YAW_RAD,
      pitch: (seeded(`sac:${seed}`, `p${i}`) - 0.5) * 2 * SACCADE_PITCH_RAD,
    };
    next +=
      SACCADE_MIN_PERIOD_SEC +
      seeded(`sac:${seed}`, `w${i}`) * (SACCADE_MAX_PERIOD_SEC - SACCADE_MIN_PERIOD_SEC);
  }
  return current;
}

// ---------------------------------------------------------------------------
// Breathing + head sway — always-on micro-motion
// ---------------------------------------------------------------------------

/** Shortest breath cycle, in seconds. */
export const BREATH_MIN_PERIOD_SEC = 3.2;
/** Longest breath cycle, in seconds. */
export const BREATH_MAX_PERIOD_SEC = 4.6;

/**
 * Breathing wave in [0, 1] (0 = exhale bottom, 1 = inhale top).
 * Seeded period + phase so two characters never breathe in sync.
 */
export function breathWave(frame: number, fps: number, seed: string): number {
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) return 0.5;
  const period =
    BREATH_MIN_PERIOD_SEC + seeded(`breath:${seed}`, 'p') * (BREATH_MAX_PERIOD_SEC - BREATH_MIN_PERIOD_SEC);
  const phase = seeded(`breath:${seed}`, 'o');
  const t = frame / fps;
  return 0.5 + 0.5 * Math.sin(2 * Math.PI * (t / period + phase));
}

/**
 * Subtle head-sway euler (radians) for a frame: three incommensurate seeded
 * sines, each bounded by `MAX_SWAY_RAD` (≈1.3°) so the head is never still
 * but never wobbles.
 */
export const MAX_SWAY_RAD = 0.022;

export function headSway(frame: number, fps: number, seed: string): Euler3 {
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) {
    return { x: 0, y: 0, z: 0 };
  }
  const t = frame / fps;
  const yaw =
    MAX_SWAY_RAD * Math.sin(2 * Math.PI * (0.19 + seeded(`sway:${seed}`, 'fy') * 0.07) * t + seeded(`sway:${seed}`, 'py') * 2 * Math.PI);
  const pitch =
    (MAX_SWAY_RAD * 0.65) * Math.sin(2 * Math.PI * (0.27 + seeded(`sway:${seed}`, 'fp') * 0.09) * t + seeded(`sway:${seed}`, 'pp') * 2 * Math.PI);
  const roll =
    (MAX_SWAY_RAD * 0.5) * Math.sin(2 * Math.PI * (0.13 + seeded(`sway:${seed}`, 'fr') * 0.05) * t + seeded(`sway:${seed}`, 'pr') * 2 * Math.PI);
  return { x: pitch, y: yaw, z: roll };
}

// ---------------------------------------------------------------------------
// Mouth — 20 Hz envelope visemes + Rhubarb mouth-cue path
// ---------------------------------------------------------------------------

/** Rhubarb (Preston Blair) mouth shape → VRM expression preset.
 *  `F` (closed M/B/P) maps to null: mouth shut. */
export const RHUBARB_TO_VOWEL: Record<string, MouthShape | null> = {
  A: 'aa', // "eye" — wide open
  B: 'ee', // "E" — spread
  C: 'oh', // "O" — rounded
  D: 'ou', // "U" — tight round
  E: 'ih', // "etc" — slight
  F: null, // M/B/P — lips closed
};

const VOWEL_CYCLE: MouthShape[] = ['aa', 'ih', 'ou', 'ee', 'oh'];

/** How many 20 Hz samples one viseme is held (2 = 100 ms). */
const VOWEL_HOLD_SAMPLES = 2;

export interface MouthWeightInput {
  frame: number;
  fps: number;
  /** 20 Hz loudness envelope of the active line (fallback path). */
  env?: number[];
  /** Sequence-local frame where the line's audio starts. */
  lineStartFrame: number;
  /** Rhubarb mouth cues (seconds relative to line start), when available. */
  mouthCues?: RhubarbCue[];
  /** Per-character seed so two speakers do not viseme in lockstep. */
  seed: string;
}

/**
 * Mouth expression weights for one frame.
 *
 * Precedence (Goal 3 requirement):
 *  1. **Rhubarb cues** — when `mouthCues` is non-empty, the cue covering the
 *     current line-relative second selects the viseme (value `F` or a gap
 *     between cues = mouth closed).
 *  2. **Envelope fallback** — otherwise the 20 Hz RMS envelope selects both
 *     *whether* the mouth is open (weight = amplitude) and *which* viseme
 *     (seeded vowel cycle held 100 ms, crossfaded over the last 40% of each
 *     hold so shapes do not pop).
 *
 * Exactly 0 outside the line's audio span → the mouth closes the moment the
 * voice stops. Pure function of the inputs.
 */
export function mouthWeights(input: MouthWeightInput): MouthWeights {
  const { frame, fps, env, lineStartFrame, mouthCues, seed } = input;
  const closed: MouthWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) return closed;

  const t = (frame - lineStartFrame) / fps;

  // 1) Rhubarb path (authoritative when present).
  if (Array.isArray(mouthCues) && mouthCues.length > 0) {
    for (const cue of mouthCues) {
      if (t >= cue.start && t < cue.end) {
        const shape = RHUBARB_TO_VOWEL[String(cue.value || '').toUpperCase()];
        if (shape) closed[shape] = 1;
        break;
      }
    }
    return closed;
  }

  // 2) Envelope fallback.
  const amp = envelopeAmplitude(env, frame, fps, lineStartFrame);
  if (amp <= 0.005 || t < 0) return closed;

  const sample = Math.floor(t * 20);
  const idx = Math.floor(sample / VOWEL_HOLD_SAMPLES);
  const progress = (sample % VOWEL_HOLD_SAMPLES) / VOWEL_HOLD_SAMPLES;
  const now = vowelAt(seed, lineStartFrame, idx);
  const next = vowelAt(seed, lineStartFrame, idx + 1);
  const fade = progress > 0.6 ? (progress - 0.6) / 0.4 : 0;
  closed[now] = amp * (1 - fade);
  if (fade > 0) closed[next] += amp * fade;
  return closed;
}

function vowelAt(seed: string, lineStartFrame: number, index: number): MouthShape {
  const r = seeded(`vowel:${seed}:${lineStartFrame}`, `${index}`);
  return VOWEL_CYCLE[Math.min(VOWEL_CYCLE.length - 1, Math.floor(r * VOWEL_CYCLE.length))];
}

// ---------------------------------------------------------------------------
// Body pose — Idle / Talk / Gesture / Walk, cross-faded, never T-pose
// ---------------------------------------------------------------------------

/**
 * The solved relaxed stance (scripts/pose-solve.mjs, FK-verified on both
 * shipped VRMs in tests/vrm-anim.test.js): arms ~78° below horizontal,
 * elbows soft, hands at the hips and slightly forward. Every other bone
 * starts at rest — this map is the floor under *all* actions, which is what
 * makes a T-pose impossible at any frame.
 */
export const IDLE_POSE: BodyPose = {
  leftUpperArm: { x: 0.04, y: 0.38, z: 1.3 },
  rightUpperArm: { x: 0.04, y: -0.38, z: -1.3 },
  leftLowerArm: { x: 0.12, y: -0.28, z: 0.46 },
  rightLowerArm: { x: 0.12, y: 0.28, z: -0.46 },
};

/** Cross-fade into non-idle actions, in seconds (mirrors character-anim). */
export const POSE_CROSS_FADE_SEC = 0.4;

/** Gesture phrase length range, in seconds. */
const GESTURE_PHRASE_SEC = 1.1;
const GESTURE_FIRST_DELAY_SEC = 1.2;
const GESTURE_FIRST_JITTER_SEC = 1.4;
const GESTURE_MIN_PERIOD_SEC = 2.4;
const GESTURE_MAX_PERIOD_SEC = 4.0;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Fade weight for a non-idle action: 0 at frame 0 → 1 after the cross-fade. */
export function actionFadeWeight(frame: number, fps: number, action: string): number {
  if (action === 'idle') return 1;
  const fadeFrames = Math.max(1, POSE_CROSS_FADE_SEC * fps);
  return smoothstep(0, fadeFrames, frame);
}

/**
 * Gesture-phrase envelope in [0, 1] for the current time: phrases walk a
 * seeded schedule (first at 1.2–2.6 s, then every 2.4–4.0 s), each rising
 * and falling with smoothsteps so Talk ↔ Gesture cross-fades instead of
 * popping. Pure function of (frame, fps, seed).
 */
export function gestureEnvelope(frame: number, fps: number, seed: string): number {
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) return 0;
  const t = frame / fps;
  let start = GESTURE_FIRST_DELAY_SEC + seeded(`gest:${seed}`, 'first') * GESTURE_FIRST_JITTER_SEC;
  let i = 0;
  let best = 0;
  while (start <= t) {
    if (t < start + GESTURE_PHRASE_SEC) {
      const rise = smoothstep(0, 0.3, t - start);
      const fall = 1 - smoothstep(GESTURE_PHRASE_SEC - 0.3, GESTURE_PHRASE_SEC, t - start);
      best = Math.max(best, rise * fall);
    }
    i += 1;
    start +=
      GESTURE_MIN_PERIOD_SEC +
      seeded(`gest:${seed}`, `p${i}`) * (GESTURE_MAX_PERIOD_SEC - GESTURE_MIN_PERIOD_SEC);
    if (i > 1000) break; // safety: unreachable for any real clip
  }
  return best;
}

/** Which hand gestures for phrase `i` (alternating, seeded start side). */
function gestureHand(seed: string, phraseIndex: number): 'left' | 'right' {
  const side = seeded(`gest:${seed}`, 'side') < 0.5 ? 0 : 1;
  return (phraseIndex + side) % 2 === 0 ? 'right' : 'left';
}

/** Index of the gesture phrase active at `frame` (−1 when none). */
function gesturePhraseIndex(frame: number, fps: number, seed: string): number {
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) return -1;
  const t = frame / fps;
  let start = GESTURE_FIRST_DELAY_SEC + seeded(`gest:${seed}`, 'first') * GESTURE_FIRST_JITTER_SEC;
  let i = 0;
  while (start <= t) {
    if (t < start + GESTURE_PHRASE_SEC) return i;
    i += 1;
    start +=
      GESTURE_MIN_PERIOD_SEC +
      seeded(`gest:${seed}`, `p${i}`) * (GESTURE_MAX_PERIOD_SEC - GESTURE_MIN_PERIOD_SEC);
    if (i > 1000) return -1;
  }
  return -1;
}

export interface BodyPoseInput {
  /** Story action: idle | talk | walk | turn | react. */
  action?: string;
  frame: number;
  fps: number;
  /** Per-character seed (blink/gaze/sway/gesture schedules differ). */
  seed: string;
  /** 20 Hz envelope of the active line (talk micro-motion). */
  env?: number[];
  /** Sequence-local frame where the line's audio starts. */
  lineStartFrame?: number;
}

/**
 * Full body pose for one frame — a pure function of the inputs.
 *
 * Layers (all additive on top of `IDLE_POSE`, so the arms are *always* the
 * solved down-stance):
 *  1. always-on breathing (chest), head sway, hips weight-shift,
 *  2. action layer faded in over `POSE_CROSS_FADE_SEC` (frame 0 = pure
 *     idle → a freshly mounted scene can never show a T-pose),
 *  3. talk: envelope-driven head nod + low-amplitude hand chatter,
 *  4. gesture phrases: a bigger one-hand emphasis with torso follow,
 *  5. walk: alternating leg/arm swing (procedural — no clips needed).
 */
export function bodyPose(input: BodyPoseInput): BodyPose {
  const { action = 'idle', frame, fps, seed } = input;
  const lineStartFrame = input.lineStartFrame ?? 0;
  const env = input.env;
  const t = frame / fps;
  const fade = actionFadeWeight(frame, fps, action);
  const envAmp = envelopeAmplitude(env, frame, fps, lineStartFrame);
  const breath = breathWave(frame, fps, seed);
  const sway = headSway(frame, fps, seed);

  // 1) Always-on micro-motion.
  const pose: BodyPose = {
    ...IDLE_POSE,
    chest: { x: -0.016 * (breath - 0.5) * 2, y: 0, z: 0 },
    head: { x: sway.x, y: sway.y, z: sway.z },
    spine: { x: 0, y: 0.012 * Math.sin(2 * Math.PI * 0.11 * t + seeded(`torso:${seed}`, 'p')), z: 0 },
    hips: { x: 0, y: 0, z: 0.01 * Math.sin(2 * Math.PI * 0.07 * t + seeded(`hips:${seed}`, 'p')) },
  };

  const add = (bone: VrmBoneName, delta: Partial<Euler3>) => {
    const base = pose[bone] || { x: 0, y: 0, z: 0 };
    pose[bone] = {
      x: base.x + (delta.x || 0),
      y: base.y + (delta.y || 0),
      z: base.z + (delta.z || 0),
    };
  };

  // 2) Action layer.
  if (action === 'talk' && fade > 0) {
    // Head nod scaled by the voice envelope (same mapping as the GLB path).
    add('head', { x: headNodRadians(envAmp) * fade });
    // Conversational hand chatter: small, envelope-gated, different phase per
    // hand so the arms never mirror each other mechanically.
    const chatterL = envAmp * fade * 0.1 * Math.sin(2 * Math.PI * 2.1 * t);
    const chatterR = envAmp * fade * 0.09 * Math.sin(2 * Math.PI * 2.7 * t + 1.1);
    add('leftLowerArm', { z: chatterL });
    add('rightLowerArm', { z: chatterR });
    add('leftHand', { y: chatterL * 0.6 });
    add('rightHand', { y: -chatterR * 0.6 });
  } else if (action === 'walk' && fade > 0) {
    const stride = 2 * Math.PI * 1.4 * t;
    const swing = 0.32 * fade;
    add('leftUpperLeg', { x: swing * Math.sin(stride) });
    add('rightUpperLeg', { x: -swing * Math.sin(stride) });
    // Knees bend on the back-swing only (max(0, ·) keeps the leg straight
    // while it pushes off).
    add('leftLowerLeg', { x: 0.45 * fade * Math.max(0, -Math.sin(stride)) });
    add('rightLowerLeg', { x: 0.45 * fade * Math.max(0, Math.sin(stride)) });
    // Opposite arm swing keeps the shoulders alive (arms stay down).
    add('leftUpperArm', { x: -0.12 * fade * Math.sin(stride) });
    add('rightUpperArm', { x: 0.12 * fade * Math.sin(stride) });
    add('chest', { y: 0.05 * fade * Math.sin(stride) });
  } else if (action === 'turn' && fade > 0) {
    add('head', { y: 0.35 * fade });
    add('chest', { y: 0.1 * fade });
  } else if (action === 'react' && fade > 0) {
    // Startled beat that settles back over ~0.6 s.
    const settle = 1 - smoothstep(0, 0.6, t);
    add('head', { x: -0.07 * fade * settle });
    add('spine', { x: -0.03 * fade * settle });
  }

  // 3) Gesture phrases (Talk only) — cross-faded by the phrase envelope.
  if (action === 'talk') {
    const envG = gestureEnvelope(frame, fps, seed) * fade;
    if (envG > 0) {
      const phrase = gesturePhraseIndex(frame, fps, seed);
      const hand = gestureHand(seed, Math.max(0, phrase));
      const sign = hand === 'right' ? 1 : -1;
      const lower: VrmBoneName = hand === 'right' ? 'rightLowerArm' : 'leftLowerArm';
      const wrist: VrmBoneName = hand === 'right' ? 'rightHand' : 'leftHand';
      const shoulder: VrmBoneName = hand === 'right' ? 'rightShoulder' : 'leftShoulder';
      add(lower, { y: -0.3 * sign * envG, z: 0.22 * envG });
      add(wrist, { y: 0.35 * sign * envG, x: 0.12 * envG });
      add(shoulder, { z: -0.05 * sign * envG });
      add('chest', { y: 0.05 * sign * envG });
    }
  }

  return pose;
}
