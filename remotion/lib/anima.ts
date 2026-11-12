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
  const originalRandom = Math.random;
  let s = seed;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ s >>> 15, s | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  try {
    return createHumanoid({ seed });
  } finally {
    Math.random = originalRandom;
  }
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

/** Compute blink factor 0 (open) → 1 (closed) at a given frame. */
export function computeBlink(frame: number, fps: number): number {
  const time = frame / fps;
  const phase = (time * BLINK_RATE) % 1;
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
  const head = rig.bones['head'];
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
  const head = rig.bones['head'];
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
