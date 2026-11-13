/**
 * @fileoverview Deterministic anima3d integration for the Remotion pipeline.
 *
 * Bridges anima3d's imperative API (AnimationMixer, Speech, LookAt) into
 * Remotion's frame-deterministic model. Every function below is a pure
 * function of (frame, fps, seed, ...) — rendering the same frame twice
 * produces identical pixels (Phase 1 contract).
 *
 * anima3d provides:
 *   - createHumanoid({ seed })   — seeded rigged SkinnedMesh (deterministic)
 *   - createLocomotionClips(rig) — procedural idle/walk/run AnimationClips
 *   - Speech                     — viseme/lip-sync engine
 *   - mouthOf(key)               — FACS-style mouth shape from a phoneme
 *   - BLINK_RATE / BLINK_SECONDS — blink timing constants
 * @module remotion/lib/anima
 */

import * as THREE from 'three';
import {
  createHumanoid,
  createLocomotionClips,
  Speech,
  mouthOf,
  REST,
  BLINK_RATE,
  BLINK_SECONDS,
  type HumanoidRig,
  type LocomotionClips,
  type MouthShape,
} from 'anima3d';

export interface AnimaCharacterProps {
  position?: [number, number, number];
  seed?: number;
  /** Planar speed m/s: >2.5 run, >0.15 walk, else idle. */
  speed?: number;
  /** Narration text for lip-sync (simple phoneme string, space-separated keys). */
  narration?: string;
  /** Look-at target in world space [x, y, z]. */
  lookAtTarget?: [number, number, number];
  /** Scale the whole character. */
  scale?: number;
  /** Story action: idle | walk | talk | turn | gesture | react (default idle). */
  action?: CharacterAction;
  /** Scene length in frames; drives actions that evolve over the scene. */
  durationInFrames?: number;
  /** Audio loudness envelope (20Hz array) for precise lip-sync. */
  env?: number[];
  /** Line start frame in the scene for env timing. */
  lineStartFrame?: number;
}

/** A phoneme segment with timing. */
export interface PhonemeSegment {
  key: string;
  start: number;   // seconds from utterance start
  duration: number; // seconds
}

/** Simple built-in phoneme table for common English sounds. Maps to keys
 *  understood by anima3d's `mouthOf`. */
const PHONEME_MAP: Record<string, string> = {
  a: 'AA', aa: 'AA', ah: 'AH', ao: 'AO', aw: 'AW', ay: 'AY',
  b: 'B', ch: 'CH', d: 'D', dh: 'DH', eh: 'EH', er: 'ER', ey: 'EY',
  f: 'F', g: 'G', hh: 'HH', ih: 'IH', iy: 'IY', jh: 'JH', k: 'K',
  l: 'L', m: 'M', n: 'N', ng: 'NG', ow: 'OW', oy: 'OY', p: 'P',
  r: 'R', s: 'S', sh: 'SH', t: 'T', th: 'TH', uh: 'UH', uw: 'UW',
  v: 'V', w: 'W', y: 'Y', z: 'Z', zh: 'ZH',
  ' ': 'sil',
};

/** Default narration phoneme sequence (a short greeting) with per-phoneme
 *  timing. Each phoneme gets ~0.12s; silence pads the ends. */
const DEFAULT_PHONEMES: PhonemeSegment[] = [
  { key: 'sil', start: 0.0, duration: 0.25 },
  { key: 'HH', start: 0.25, duration: 0.12 },
  { key: 'AH', start: 0.37, duration: 0.12 },
  { key: 'L', start: 0.49, duration: 0.12 },
  { key: 'OW', start: 0.61, duration: 0.16 },
  { key: 'sil', start: 0.77, duration: 0.25 },
  { key: 'W', start: 1.02, duration: 0.12 },
  { key: 'UH', start: 1.14, duration: 0.12 },
  { key: 'R', start: 1.26, duration: 0.12 },
  { key: 'L', start: 1.38, duration: 0.12 },
  { key: 'D', start: 1.50, duration: 0.12 },
  { key: 'sil', start: 1.62, duration: 0.5 },
];

/**
 * Create a seeded humanoid rig. Same seed → identical character, forever.
 * Deterministic: no Math.random inside anima3d (seeded RNG only).
 */
export function createCharacter(seed: number): HumanoidRig {
  return createHumanoid({ seed });
}

/**
 * Parse a narration string into phoneme segments with timing.
 * Pure function of the string.
 */
export function parseNarration(text: string, startTime = 0): PhonemeSegment[] {
  const tokens = text.toLowerCase().split(/\s+/);
  let t = startTime;
  const segments: PhonemeSegment[] = [{ key: 'sil', start: t, duration: 0.2 }];
  t += 0.2;

  for (const token of tokens) {
    const key = PHONEME_MAP[token] || 'sil';
    segments.push({ key, start: t, duration: 0.15 });
    t += 0.15;
  }

  segments.push({ key: 'sil', start: t, duration: 0.3 });
  return segments;
}

/**
 * Compute the mouth shape for lip-sync at a given frame.
 * Pure function of (frame, fps, segments).
 */
export function computeMouthShape(
  frame: number,
  fps: number,
  segments: PhonemeSegment[]
): MouthShape {
  const time = frame / fps;
  let shape: MouthShape = { ...REST };

  for (const seg of segments) {
    if (time >= seg.start && time <= seg.start + seg.duration) {
      const t = (time - seg.start) / Math.max(seg.duration, 0.001);
      const eased = t * t * (3 - 2 * t); // smoothstep
      const target = mouthOf(seg.key);
      shape = {
        open: lerp(REST.open, target.open, eased),
        round: lerp(REST.round, target.round, eased),
        close: lerp(REST.close, target.close, eased),
        spread: lerp(REST.spread, target.spread, eased),
      };
      break;
    }
  }

  return shape;
}

/**
 * Sample the loudness envelope at an exact frame.
 *
 * The envelope is a 20 Hz array (one value per 50 ms RMS window, produced by
 * scripts/generate-voice.py). Mapping frame → env index:
 *
 *     rel = (frame - lineStartFrame) / fps * 20
 *
 * Behaviour:
 *   - frame before the line starts or after the audio ends → 0 (mouth closed
 *     outside speech),
 *   - between samples → linear interpolation (light temporal smoothing),
 *   - result clamped to [0, 1].
 *
 * Pure function of (env, frame, fps, lineStartFrame).
 */
export function envelopeAmplitude(
  env: number[] | undefined,
  frame: number,
  fps: number,
  lineStartFrame: number
): number {
  if (!env || env.length === 0) return 0;
  const rel = ((frame - lineStartFrame) / fps) * 20;
  if (rel < 0 || rel > env.length - 1) return 0;
  const k = Math.floor(rel);
  const frac = rel - k;
  const a = env[Math.min(k, env.length - 1)];
  const b = env[Math.min(k + 1, env.length - 1)];
  const value = a + (b - a) * frac;
  return Math.max(0, Math.min(1, value));
}

/** Compute blink factor 0 (open) → 1 (closed) at a given frame. */
export function computeBlink(frame: number, fps: number): number {
  const time = frame / fps;
  const phase = (time * Number(BLINK_RATE)) % 1;
  const blinkWidth = 0.12; // fraction of cycle the lid is closing/closed
  if (phase < blinkWidth) {
    const eased = phase / blinkWidth;
    return Math.sin(eased * Math.PI); // close then open within the window
  }
  return 0;
}

/**
 * Apply a mouth shape and blink to the humanoid rig.
 * - Mouth: drives a mouth socket mesh (scale open/round/close/spread).
 * - Blink: scales a pair of eyelid meshes (created lazily on the head bone).
 *
 * Call this during render; it mutates the rig's socket meshes deterministically.
 */
export function applyFacialAnimation(
  rig: HumanoidRig,
  mouth: MouthShape,
  blink: number
): { mouthGroup: THREE.Group; eyelids: THREE.Group } | null {
  const mouthSocket = getOrCreateMouthSocket(rig);
  const eyelids = getOrCreateEyelids(rig);

  // Mouth: scale the socket by openness + roundness
  const mouthScale = 1 + mouth.open * 0.6 + mouth.round * 0.3;
  mouthSocket.scale.set(mouthScale, mouthScale, mouthScale);
  mouthSocket.position.set(0, -mouth.open * 0.02, mouth.close * 0.01);

  // Eyelids: scale Y by (1 - blink) so they close as blink → 1
  const lidScale = 1 - blink;
  eyelids.children.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      child.scale.set(1, Math.max(lidScale, 0.01), 1);
    }
  });

  return { mouthGroup: mouthSocket, eyelids };
}

/** Get (or lazily create) a mouth socket group on the head bone. */
function getOrCreateMouthSocket(rig: HumanoidRig): THREE.Group {
  const head = rig.bones['Head'] || (rig.bones as any)['head'];
  if (!head) return rig.object; // fallback

  let socket = head.userData.animaMouthSocket as THREE.Group | undefined;
  if (!socket) {
    socket = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(0.08, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b2c2c });
    const mesh = new THREE.Mesh(geo, mat);
    socket.add(mesh);
    head.add(socket);
    socket.position.set(0, -0.05, 0.12);
    head.userData.animaMouthSocket = socket;
  }
  return socket;
}

/** Get (or lazily create) eyelid meshes on the head bone. */
function getOrCreateEyelids(rig: HumanoidRig): THREE.Group {
  const head = rig.bones['Head'] || (rig.bones as any)['head'];
  if (!head) return new THREE.Group();

  let eyelids = head.userData.animaEyelids as THREE.Group | undefined;
  if (!eyelids) {
    eyelids = new THREE.Group();
    const geo = new THREE.PlaneGeometry(0.16, 0.06);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
    const left = new THREE.Mesh(geo, mat);
    const right = new THREE.Mesh(geo, mat);
    left.position.set(-0.09, 0.03, 0.09);
    right.position.set(0.09, 0.03, 0.09);
    left.rotation.x = -0.2;
    right.rotation.x = -0.2;
    eyelids.add(left, right);
    head.add(eyelids);
    head.userData.animaEyelids = eyelids;
  }
  return eyelids;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Evaluate the locomotion clip at a given frame and apply it to the rig.
 * Pure function of (rig, frame, fps, speed). Creates a fresh mixer each call
 * so there is no mutable carry-over between frames.
 */
export function applyLocomotion(
  rig: HumanoidRig,
  clips: LocomotionClips,
  frame: number,
  fps: number,
  speed: number
): void {
  // Ensure skeleton is reset to bind pose before sampling
  if (rig.mesh && rig.mesh.skeleton) {
    rig.mesh.skeleton.pose();
  }

  const time = frame / fps;

  // Choose gait by speed
  let clip: THREE.AnimationClip;
  if (speed > 2.5) clip = clips.run;
  else if (speed > 0.15) clip = clips.walk;
  else clip = clips.idle;

  const mixer = new THREE.AnimationMixer(rig.mesh);
  const action = mixer.clipAction(clip);
  action.weight = 1;
  action.loop = THREE.LoopRepeat;

  // Wrap time into the clip duration for seamless looping
  const clipDuration = clip.duration;
  const wrappedTime = time % clipDuration;
  action.time = wrappedTime;

  mixer.time = wrappedTime;
  mixer.update(0);

  action.stop();
  mixer.uncacheAction(clip);
}

/**
 * Create locomotion clips once (memoized by the caller via useMemo).
 * Pure function of the rig (which is seeded → deterministic).
 */
export function createGaitClips(rig: HumanoidRig): LocomotionClips {
  return createLocomotionClips(rig);
}

/** Character actions available from story JSON. */
export type CharacterAction = 'idle' | 'walk' | 'talk' | 'turn' | 'gesture' | 'react';

/**
 * Planar speed for the locomotion clip chosen by `action`.
 * walk keeps stride; every other action is stationary (idle clip).
 */
export function actionSpeed(action: CharacterAction): number {
  return action === 'walk' ? 1.2 : 0;
}

/**
 * Apply a story action on top of the base locomotion clip.
 * Pure function of (rig, action, frame, fps, durationInFrames, seed):
 * the same inputs always produce the same pose.
 *
 * - idle:   base idle clip, no additive motion.
 * - walk:   walk clip at stride speed (handled via actionSpeed).
 * - talk:   idle + gentle head nods while speaking.
 * - turn:   rotate the character to face the opposite side over the scene.
 * - gesture: periodic one-arm raise on a seeded rhythm.
 * - react:  a quick startle dip at a seeded moment in the scene.
 */
export function applyAction(
  rig: HumanoidRig,
  action: CharacterAction,
  frame: number,
  fps: number,
  durationInFrames: number,
  seed: number
): void {
  const time = frame / fps;
  const sceneDur = durationInFrames / fps;

  const head = rig.bones['Head'];
  const rightArm = rig.bones['RightArm'];
  const leftArm = rig.bones['LeftArm'];
  const chest = rig.bones['Chest'];

  switch (action) {
    case 'turn': {
      // Rotate to face the opposite direction over the whole scene, eased.
      const progress = Math.max(0, Math.min(1, frame / Math.max(1, durationInFrames)));
      const eased = progress * progress * (3 - 2 * progress);
      rig.object.rotation.y = Math.PI * eased;
      break;
    }

    case 'talk': {
      // Gentle nodding while speaking (two nods per second, small amplitude).
      if (head) head.rotation.x = 0.08 * Math.sin(time * Math.PI * 2 * 1.1);
      if (chest) chest.rotation.y = 0.03 * Math.sin(time * Math.PI * 2 * 0.55);
      break;
    }

    case 'gesture': {
      // One arm rises and lowers on a seeded 2.4 s rhythm (deterministic
      // phase offset derived from the seed).
      const phase = (time / 2.4 + (seed % 7) / 7) % 1;
      const lift = Math.max(0, Math.sin(phase * Math.PI * 2));
      if (rightArm) rightArm.rotation.x = -lift * 1.9; // negative X raises the arm
      if (rightArm) rightArm.rotation.z = -lift * 0.35;
      if (head) head.rotation.y = 0.15 * lift;
      break;
    }

    case 'react': {
      // A quick startle dip at a seeded moment (25-50% into the scene),
      // then a recovery breath.
      const tStart = sceneDur * (0.25 + (seed % 5) / 20);
      const dt = time - tStart;
      if (dt >= 0) {
        // Sharp dip (0-0.25 s), eased recovery (0.25-0.9 s).
        const dip = dt < 0.25 ? dt / 0.25 : Math.max(0, 1 - (dt - 0.25) / 0.65);
        if (head) head.rotation.x = 0.35 * dip;
        if (chest) chest.rotation.x = 0.12 * dip;
        if (leftArm) leftArm.rotation.z = 0.5 * dip;
        if (rightArm) rightArm.rotation.z = -0.5 * dip;
      }
      break;
    }

    case 'idle':
    case 'walk':
    default:
      // Base clip only.
      break;
  }
}
