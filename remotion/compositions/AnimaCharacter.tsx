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
import * as THREE from 'three';
import {
  createCharacter,
  createGaitClips,
  applyLocomotion,
  applyAction,
  actionSpeed,
  computeMouthShape,
  computeBlink,
  envelopeAmplitude,
  applyFacialAnimation,
  parseNarration,
  type PhonemeSegment,
  type AnimaCharacterProps,
  type CharacterAction,
} from '../lib/anima.ts';

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
  action = 'idle',
  durationInFrames = 300,
  env,
  lineStartFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ------------------------------------------------------------------
  // Memoized character data (seeded → deterministic, created once).
  // ------------------------------------------------------------------
  const rig = React.useMemo(() => createCharacter(seed), [seed]);
  const clips = React.useMemo(() => createGaitClips(rig), [rig]);
  const segments = React.useMemo(() => parseNarration(narration), [narration]);

  // ------------------------------------------------------------------
  // Locomotion: the gait clip follows the story action. The `speed` prop is
  // honoured when given, but the action decides the default.
  // ------------------------------------------------------------------
  const gaitSpeed = speed !== 1.5 ? speed : actionSpeed(action);
  applyLocomotion(rig, clips, frame, fps, gaitSpeed);

  // ------------------------------------------------------------------
  // Story action on top of the base clip (talk/turn/gesture/react).
  // ------------------------------------------------------------------
  applyAction(rig, action as CharacterAction, frame, fps, durationInFrames, seed);

  // ------------------------------------------------------------------
  // Facial animation: lip-sync + blink (pure functions of frame).
  // With an envelope present, mouth open = env sample at this exact frame
  // (clamped 0-1, lightly smoothed by interpolation); the mouth is closed
  // outside the line's audio span. Viseme round/spread still come from the
  // narration phonemes so vowels keep their shape.
  // ------------------------------------------------------------------
  const envAmp = envelopeAmplitude(env, frame, fps, lineStartFrame);
  let mouth = computeMouthShape(frame, fps, segments);
  mouth = {
    ...mouth,
    open: env ? envAmp : Math.max(mouth.open, envAmp),
  };
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
  const head = rig.bones['Head'];
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
