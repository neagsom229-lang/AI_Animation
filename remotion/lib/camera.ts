/**
 * @fileoverview Pure camera rig evaluation for the Remotion pipeline.
 *
 * Ported 1:1 from `src/render/three3d.js` `ThreeSceneManager.applyCameraRig()`.
 * The legacy rig mutated `camera.position` inside a wall-clock render loop;
 * here every pose is a pure mathematical function of the Remotion frame index:
 *
 *   pose = getCameraPose(rig, useCurrentFrame(), fps, durationInFrames)
 *
 * No THREE.Clock, no requestAnimationFrame, no wall-clock time — rendering N
 * times with the same frame index yields the identical pose (Phase 1 contract).
 * @module remotion/lib/camera
 */

import { Easing, interpolate } from 'remotion';
import { createNoise2D } from 'simplex-noise';
import * as THREE from 'three';
import { mulberry32 } from './randomness.ts';

export type CameraRigType = 'dolly' | 'orbit' | 'crane' | 'handheld' | 'static';

export type Vec3 = [number, number, number];

export interface CameraPose {
  position: Vec3;
  /** World-space point the camera must look at (converted to a quaternion by `lookAtQuaternion`). */
  lookAt: Vec3;
}

/** Reusable scratch matrix (three.js camera convention: -Z axis points at the target). */
const _lookAtMatrix = new THREE.Matrix4();
const _eye = new THREE.Vector3();
const _target = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Seeded simplex-noise generator for organic, cinematic handheld shake.
 *  The PRNG is mulberry32 with a fixed seed, so the noise field is identical
 *  in every process and every render — the Phase 1 contract requires
 *  identical frames for identical inputs. (createNoise2D() with no argument
 *  would silently use Math.random() and break cross-run determinism.) */
const _noise2D = createNoise2D(mulberry32(0x5eed1234));

/** Sample 1D simplex noise at a given time, mapped to [-1, 1]. */
function noise1(t: number): number {
  return _noise2D(t, 0);
}

/**
 * Equivalent of `camera.lookAt(target)` expressed as a declarative quaternion,
 * so the camera never needs imperative mutation inside the render loop.
 */
export function lookAtQuaternion(position: Vec3, target: Vec3): THREE.Quaternion {
  _lookAtMatrix.lookAt(
    _eye.set(position[0], position[1], position[2]),
    _target.set(target[0], target[1], target[2]),
    _up
  );
  return new THREE.Quaternion().setFromRotationMatrix(_lookAtMatrix);
}

/**
 * Evaluate a camera rig at an exact frame index.
 *
 * @param rig - Rig name, matching the legacy `applyCameraRig` rigType values.
 * @param frame - Remotion frame index (`useCurrentFrame()`), never seconds-from-clock.
 * @param fps - Frames per second (`useVideoConfig().fps`).
 * @param durationInFrames - Shot length, used to ease motion so it settles within the composition.
 * @returns The deterministic camera pose for this frame.
 */
export function getCameraPose(
  rig: CameraRigType,
  frame: number,
  fps: number,
  durationInFrames: number
): CameraPose {
  // tau = scene seconds, derived from the frame contract: tau === frame / fps.
  const tau = frame / fps;

  switch (rig) {
    case 'dolly': {
      // Legacy: z = 15 - tau * 3 (linear). Now eased so the push completes
      // exactly at the end of the shot, using Remotion's interpolate().
      const z = interpolate(frame, [0, durationInFrames], [15, 12], {
        easing: Easing.inOut(Easing.cubic),
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp'
      });
      const y = 5 + Math.sin(tau * 0.5) * 0.5;
      return { position: [0, y, z], lookAt: [0, 2, 0] };
    }

    case 'orbit': {
      const angle = tau * 0.8;
      return {
        position: [Math.sin(angle) * 12, 6, Math.cos(angle) * 12],
        lookAt: [0, 2, 0]
      };
    }

    case 'crane': {
      const rise = interpolate(frame, [0, durationInFrames], [0, 4], {
        easing: Easing.inOut(Easing.quad),
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp'
      });
      const z = interpolate(frame, [0, durationInFrames], [12, 8], {
        easing: Easing.inOut(Easing.quad),
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp'
      });
      return { position: [0, 2 + rise, z], lookAt: [0, 1, 0] };
    }

    case 'handheld': {
      // Organic handheld shake from Simplex noise — deterministic because the
      // noise generator has a fixed seed and the input is purely frame-derived.
      const shakeX = noise1(tau * 2.7) * 0.12 + noise1(tau * 5.3 + 100) * 0.04;
      const shakeY = noise1(tau * 3.1 + 50) * 0.1 + noise1(tau * 4.7 + 200) * 0.03;
      const shakeZ = noise1(tau * 2.1 + 300) * 0.02;
      return { position: [shakeX, 5 + shakeY, 12 + shakeZ], lookAt: [0, 2, 0] };
    }

    case 'static':
    default:
      return { position: [0, 5, 15], lookAt: [0, 2, 0] };
  }
}

// ---------------------------------------------------------------------------
// Shot types (Phase D)
// ---------------------------------------------------------------------------

/**
 * Framing vocabulary for a scene (`shot` in the story JSON):
 *
 *  - close-up      — 2.5 m from the head; the speaker fills ~55% of the frame
 *  - medium        — 4.0 m; the classic talk shot, ~53% frame height
 *  - wide          — 11 m, eye-tilted up so the horizon sits on the lower
 *                    third and the temple/sky own the frame (~20% character)
 *  - over-shoulder — behind the listener, looking at the speaker's head
 *
 * Talk shots (close-up / medium / over-shoulder) keep the speaking character
 * between 40% and 60% of the frame height — enforced in tests/camera.test.js
 * from the fov 45° used by StoryFilm's PerspectiveCamera.
 */
export type ShotType = 'close-up' | 'medium' | 'wide' | 'over-shoulder';

export interface ShotSpec {
  /** Horizontal distance from the look-at target to the camera (metres). */
  distance: number;
  /** Camera height in metres (world y). */
  height: number;
  /** World-space look-at point — head height for talk shots. */
  target: Vec3;
  /** Yaw of the camera around the target: 0 = camera on the +z side. */
  azimuth: number;
  /** Distance multiplier at frame 0 of a dolly push (1 = no push-in). */
  dollyStart: number;
  /** Orbit half-arc in radians — swings ±arc around `azimuth`. */
  arc: number;
}

// --- Blocking (single source of truth for StoryFilm and the shots) ----------

/** The speaking character stands at the origin and faces the listener. */
export const SPEAKER_POSITION: Vec3 = [0, 0, 0];
/** The listener stands here — close enough to fill the near field of an OTS. */
export const LISTENER_POSITION: Vec3 = [-1.1, 0, 1.5];
/** Head height of the shipped 1.8 m character: the talk-shot look-at. */
export const HEAD_HEIGHT = 1.7;
/** Yaw making the speaker face the listener (facing = (sin yaw, 0, cos yaw)). */
export const SPEAKER_YAW = Math.atan2(
  LISTENER_POSITION[0] - SPEAKER_POSITION[0],
  LISTENER_POSITION[2] - SPEAKER_POSITION[2]
);
/** Yaw making the listener face the speaker. */
export const LISTENER_YAW = Math.atan2(
  SPEAKER_POSITION[0] - LISTENER_POSITION[0],
  SPEAKER_POSITION[2] - LISTENER_POSITION[2]
);

/**
 * Over-shoulder geometry: the camera sits behind the listener on the
 * speaker→listener line (azimuth of that line), pulled back far enough that
 * the speaker holds ~56% of the frame, then swung clear of that line so the
 * listener's head reads at the edge of frame instead of covering the
 * speaker. The offset must keep the whole orbit arc on one side of the
 * speaker→listener line: with the old ±0.25 arc and 0.16 offset the sweep
 * crossed it and the two heads were 1 px apart at f41 (full occlusion).
 */
const OTS_AZIMUTH =
  Math.atan2(LISTENER_POSITION[0], LISTENER_POSITION[2]) + 0.5;
const OTS_DISTANCE = 3.86;

export const SHOT_SPECS: Record<ShotType, ShotSpec> = {
  'close-up': {
    distance: 2.5,
    height: 1.62,
    target: [0, HEAD_HEIGHT, 0],
    azimuth: 0,
    dollyStart: 1.1,
    arc: 0.3
  },
  'medium': {
    distance: 4.0,
    height: 1.65,
    target: [0, HEAD_HEIGHT, 0],
    azimuth: 0,
    dollyStart: 1.12,
    // ±0.4 rad keeps the sweep clear of the listener's bearing (-0.637 rad):
    // a wider arc crosses the speaker→listener line and the camera lines the
    // two heads up (the old ±1.0 put them 4 px apart at f41).
    arc: 0.4
  },
  wide: {
    // Eye-level-ish, tilted up: horizon lands at ~65% from the top (the lower
    // third), the character stands fully inside the bottom band, and the
    // temple + sky own the upper two thirds.
    distance: 11,
    height: 2.55,
    target: [0, 3.9, 0],
    azimuth: 0,
    dollyStart: 1.18,
    // Narrow sweep: at ±0.5 the start of the arc grazed the listener's
    // bearing and their heads overlapped by ~7 px at distance.
    arc: 0.3
  },
  'over-shoulder': {
    distance: OTS_DISTANCE,
    height: 1.55,
    target: [0, 1.62, 0],
    azimuth: OTS_AZIMUTH,
    dollyStart: 1.08,
    arc: 0.25
  }
};

/**
 * Evaluate a shot + rig at an exact frame index.
 *
 * The shot fixes the framing (distance / height / look-at / bearing); the rig
 * adds deterministic motion on top of it:
 *
 *  - dolly     — push from `distance × dollyStart` in to `distance`
 *  - orbit     — sweep ±`arc` around the shot bearing (never behind the set)
 *  - crane     — rise 2.5 m into the shot height
 *  - handheld  — seeded simplex shake around the shot position
 *  - static    — the shot position, unmoving
 *
 * Pure function of (shot, rig, frame, fps, duration) — Phase 1 contract.
 *
 * @throws {Error} When the shot name is unknown (no silent substitute).
 */
export function getShotPose(
  shot: ShotType,
  rig: CameraRigType,
  frame: number,
  fps: number,
  durationInFrames: number
): CameraPose {
  const spec = SHOT_SPECS[shot];
  if (!spec) {
    throw new Error(
      `Unknown shot "${shot}". Known shots: ${Object.keys(SHOT_SPECS).join(', ')}.`
    );
  }

  const t = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  let azimuth = spec.azimuth;
  let distance = spec.distance;
  let height = spec.height;
  let shakeX = 0;
  let shakeY = 0;
  let shakeZ = 0;

  switch (rig) {
    case 'dolly': {
      distance =
        spec.distance *
        interpolate(t, [0, 1], [spec.dollyStart, 1], {
          easing: Easing.inOut(Easing.cubic)
        });
      break;
    }
    case 'orbit': {
      azimuth =
        spec.azimuth +
        interpolate(t, [0, 1], [-spec.arc, spec.arc], {
          easing: Easing.inOut(Easing.quad)
        });
      break;
    }
    case 'crane': {
      // Rise 2.5 m into the shot height, but never start below ~0.4 m: a talk
      // shot at 1.6 m would otherwise begin underground, and the ground plane
      // is single-sided, so the frame would show through the set.
      const startHeight = Math.max(0.4, spec.height - 2.5);
      height =
        startHeight +
        (spec.height - startHeight) *
          interpolate(t, [0, 1], [0, 1], { easing: Easing.inOut(Easing.quad) });
      break;
    }
    case 'handheld': {
      const tau = frame / fps;
      shakeX = noise1(tau * 2.7) * 0.12 + noise1(tau * 5.3 + 100) * 0.04;
      shakeY = noise1(tau * 3.1 + 50) * 0.1 + noise1(tau * 4.7 + 200) * 0.03;
      shakeZ = noise1(tau * 2.1 + 300) * 0.02;
      break;
    }
    case 'static':
    default:
      break;
  }

  return {
    position: [
      spec.target[0] + Math.sin(azimuth) * distance + shakeX,
      height + shakeY,
      spec.target[2] + Math.cos(azimuth) * distance + shakeZ
    ],
    lookAt: spec.target
  };
}
