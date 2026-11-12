/**
 * @fileoverview Deterministic anima3d character for Remotion.
 *
 * Combines anima3d's procedural locomotion + viseme lip-sync into a single
 * Remotion component driven purely by `useCurrentFrame()` / fps.
 *
 * RULES (Phase 1 contract):
 * - No useFrame, no Math.random, no wall-clock time.
 * - All motion derives from useCurrentFrame() and useVideoConfig().fps.
 * - The character is seeded: same seed → identical body, gait, and face.
 * @module remotion/compositions/AnimaCharacter
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { primitive } from '@react-three/drei';
import * as THREE from 'three';
import {
  createCharacter,
  createGaitClips,
  applyLocomotion,
  computeMouthShape,
  computeBlink,
  applyFacialAnimation,
  parseNarration,
  type PhonemeSegment,
  type AnimaCharacterProps,
} from '../lib/anima';

/**
 * Default 10-second narration phoneme track.
 * Keys map to anima3d phonemes understood by `mouthOf`.
 */
const DEFAULT_NARRATION =
  'hello this is a demonstration of procedural character animation in remotion';

export const AnimaCharacter: React.FC<AnimaCharacterProps> = ({
  position = [0, 0, 0],
  seed = 1,
  speed = 1.5,
  narration = DEFAULT_NARRATION,
  lookAtTarget = [8, 2, 0],
  scale = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;

  // ------------------------------------------------------------------
  // Memoized character data (seeded → deterministic, created once).
  // ------------------------------------------------------------------
  const rig = React.useMemo(() => createCharacter(seed), [seed]);
  const clips = React.useMemo(() => createGaitClips(rig), [rig]);
  const segments = React.useMemo(() => parseNarration(narration), [narration]);

  // ------------------------------------------------------------------
  // Locomotion: apply walk/idle/run clip at this exact frame.
  // ------------------------------------------------------------------
  applyLocomotion(rig, clips, frame, fps, speed);

  // ------------------------------------------------------------------
  // Facial animation: lip-sync + blink (pure functions of frame).
  // ------------------------------------------------------------------
  const mouth = computeMouthShape(frame, fps, segments);
  const blink = computeBlink(frame, fps);
  applyFacialAnimation(rig, mouth, blink);

  // ------------------------------------------------------------------
  // Head turn: pure interpolate of frame, clamped to a natural range.
  // Character turns head toward lookAtTarget over the first 3 seconds,
  // holds, then turns back.
  // ------------------------------------------------------------------
  const headYaw = interpolate(
    frame,
    [0, Math.round(fps * 3), Math.round(fps * 7), Math.round(fps * 10)],
    [0, 0.7, 0.7, 0],
    { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const head = rig.bones['head'];
  if (head) {
    head.rotation.y = headYaw;
  }

  // ------------------------------------------------------------------
  // Place the rig in the scene.
  // ------------------------------------------------------------------
  rig.object.position.set(position[0], position[1], position[2]);
  rig.object.scale.set(scale, scale, scale);

  return <primitive object={rig.object} />;
};
