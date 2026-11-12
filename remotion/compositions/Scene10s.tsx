/**
 * @fileoverview Phase 2 verification composition: 10-second scene with a
 * walking anima3d character that turns its head, blinks, and lip-syncs to
 * narration. All motion is a pure function of `useCurrentFrame()` — scrubbable
 * and frame-deterministic.
 *
 * Verification:
 *   npx remotion render Scene10s out/scene10s.mp4
 *   Render twice, compare SHA-256 → byte-identical.
 * @module remotion/compositions/Scene10s
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { PerspectiveCamera } from '@react-three/drei';
import { resolveMood } from '../../src/render/moods.js';
import { getCameraPose, lookAtQuaternion, type CameraRigType } from '../lib/camera';
import { AnimaCharacter } from './AnimaCharacter';
import { DustParticles } from './DustParticles';

export interface Scene10sProps {
  rig?: CameraRigType;
  mood?: string;
}

export const Scene10s: React.FC<Scene10sProps> = ({
  rig = 'handheld',
  mood = 'gold dust',
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  const preset = resolveMood(mood);
  const pose = getCameraPose(rig as any, frame, fps, durationInFrames);
  const cameraRotation = lookAtQuaternion(pose.position, pose.lookAt);

  return (
    <ThreeCanvas width={width} height={height}>
      <color attach="background" args={[preset.fog]} />
      <fogExp2 attach="fog" args={[preset.fog, 0.015]} />

      <ambientLight color={preset.ambient} intensity={preset.intensity} />
      <directionalLight
        color={preset.directional}
        intensity={preset.intensity * 1.2}
        position={[10, 20, 10]}
        castShadow
      />

      <PerspectiveCamera
        makeDefault
        fov={45}
        near={0.1}
        far={1000}
        position={pose.position}
        quaternion={cameraRotation}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#4b5d4a" roughness={1} />
      </mesh>

      {/* Hero character walks, turns head, blinks, lip-syncs. */}
      <AnimaCharacter
        position={[-3, 0, 2]}
        seed={7}
        speed={1.4}
        narration="hello this is a demonstration of procedural character animation in remotion"
        lookAtTarget={[8, 2, 0]}
        scale={1}
      />

      {/* Secondary character idles with a different seed. */}
      <AnimaCharacter
        position={[4, 0, -1]}
        seed={42}
        speed={0}
        narration=""
        lookAtTarget={[-3, 2, 2]}
        scale={0.9}
      />

      <DustParticles count={20} />
    </ThreeCanvas>
  );
};

// 10 seconds @ 30 fps = 300 frames.
Scene10s.defaultProps = { rig: 'handheld', mood: 'gold dust' };

// Register as a standalone composition via Root.tsx instead.
export const durationInFrames = 300;
export const fps = 30;
export const width = 1920;
export const height = 1080;
