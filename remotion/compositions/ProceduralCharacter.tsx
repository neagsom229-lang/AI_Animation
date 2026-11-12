/**
 * @fileoverview Procedural character, ported from
 * `src/render/three3d.js` `ThreeSceneManager.addProceduralCharacter()` and the
 * secondary motion inside `update()` (breathing, head sway).
 *
 * The legacy version animated via `THREE.Clock.getElapsedTime()` (wall-clock).
 * Here every transform is a pure function of `useCurrentFrame()` / fps, and the
 * entrance pop uses Remotion's `interpolate()` easing (Phase 1 contract).
 * @module remotion/compositions/ProceduralCharacter
 */

import React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export interface ProceduralCharacterProps {
  position?: [number, number, number];
  color?: string;
  /** Slow yaw turn rate [rad/s], applied as rotation.y = tau * turnRate. */
  turnRate?: number;
}

export const ProceduralCharacter: React.FC<ProceduralCharacterProps> = ({
  position = [0, 0, 0],
  color = '#4a90e2',
  turnRate = 0.5
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tau = frame / fps;

  // Ported secondary motion (was `Math.sin(time * 3) * 0.02` on wall-clock `time`).
  const breath = 1 + Math.sin(tau * 3) * 0.02;
  // Ported head micro-movement (`Math.sin(time * 1.5) * 0.015`).
  const headSway = Math.sin(tau * 1.5) * 0.015;

  // Eased entrance: grow from nothing in the first 0.7s of the shot.
  const grow = interpolate(frame, [0, Math.round(fps * 0.7)], [0.001, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  return (
    <group position={position} scale={grow} rotation={[0, tau * turnRate, 0]}>
      <mesh position={[0, 1 * breath, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.4, 2, 16]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[headSway, 2.4 * breath, 0]} castShadow>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </group>
  );
};
