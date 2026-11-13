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
