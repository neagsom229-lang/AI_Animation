/**
 * @fileoverview The migrated Kuanimation 3D scene as a deterministic Remotion
 * composition.
 *
 * Migration map (legacy → Remotion):
 * - `ThreeSceneManager` constructor + `setMood()`  → declarative `<color>`, `<fogExp2>`, lights
 *   driven by the shared `MoodLightingPresets` (src/render/moods.js).
 * - `applyCameraRig()` (wall-clock tau)            → pure `getCameraPose(frame, fps)` (remotion/lib/camera)
 *   applied declaratively via drei's `<PerspectiveCamera>` + `lookAtQuaternion()`.
 * - `addProceduralCharacter()` / `update()`        → `<ProceduralCharacter>` (frame-driven).
 * - `addProceduralProp()`                          → `<TempleSet>`.
 * - raw WebGL canvas sizing                        → `<ThreeCanvas width height>` (explicit, from
 *   `useVideoConfig()` — required by the Phase 1 frame contract).
 *
 * RULES enforced in this file:
 * - `useFrame` from @react-three/fiber is never used inside a composition.
 * - All motion is a pure function of `useCurrentFrame()` and `useVideoConfig().fps`.
 * - All randomness flows through Remotion's seeded `random()`.
 * @module remotion/compositions/KuanimationScene
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { PerspectiveCamera } from '@react-three/drei';
import { resolveMood } from '../../src/render/moods.js';
import { getCameraPose, lookAtQuaternion, type CameraRigType } from '../lib/camera';
import { DustParticles } from './DustParticles';
import { ProceduralCharacter } from './ProceduralCharacter';
import { TempleSet } from './TempleSet';

export interface KuanimationSceneProps {
  /** Camera rig name, matching the legacy `applyCameraRig` rigType values. */
  rig?: CameraRigType;
  /** Mood lighting preset name (src/render/moods.js). */
  mood?: string;
}

export const KuanimationScene: React.FC<KuanimationSceneProps> = ({
  rig = 'dolly',
  mood = 'warm dawn'
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  const preset = resolveMood(mood);
  const pose = getCameraPose(rig, frame, fps, durationInFrames);
  const cameraRotation = lookAtQuaternion(pose.position, pose.lookAt);

  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height}>
        <color attach="background" args={[preset.fog]} />
        <fogExp2 attach="fog" args={[preset.fog, 0.015]} />

        {/* Legacy setMood(): shared preset drives ambient + directional light. */}
        <ambientLight color={preset.ambient} intensity={preset.intensity} />
        <directionalLight
          color={preset.directional}
          intensity={preset.intensity * 1.2}
          position={[10, 20, 10]}
          castShadow
        />

        {/* Declarative camera rig: pose recomputed per frame from the frame index. */}
        <PerspectiveCamera
          makeDefault
          fov={45}
          near={0.1}
          far={1000}
          position={pose.position}
          quaternion={cameraRotation}
        />

        {/* Stage floor receiving shadows. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[80, 80]} />
          <meshStandardMaterial color="#4b5d4a" roughness={1} />
        </mesh>

        <TempleSet />
        <ProceduralCharacter position={[-3, 0, 2]} color="#4a90e2" />
        <ProceduralCharacter position={[4, 0, -1]} color="#d97742" turnRate={0.35} />
        <DustParticles count={26} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
