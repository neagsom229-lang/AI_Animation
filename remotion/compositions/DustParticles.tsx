/**
 * @fileoverview Floating dust-mote atmosphere layer.
 * Positions come from Remotion's seeded `random()` via `makeDust()`
 * (remotion/lib/randomness) — never `Math.random()` — and the vertical drift
 * is a pure function of `useCurrentFrame()` (Phase 1 contract).
 * @module remotion/compositions/DustParticles
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { makeDust } from '../lib/randomness.ts';

export interface DustParticlesProps {
  count?: number;
}

export const DustParticles: React.FC<DustParticlesProps> = ({ count = 24 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tau = frame / fps;

  // Deterministic seed data — identical for every render of the same frame.
  const dust = React.useMemo(() => makeDust(count), [count]);

  return (
    <>
      {dust.map((mote) => {
        // Rise slowly and wrap within [0.4, 7.4] m — pure function of frame.
        const y = 0.4 + ((mote.y + tau * mote.speed) % 7);
        return (
          <mesh key={mote.id} position={[mote.x, y, mote.z]}>
            <sphereGeometry args={[mote.size, 6, 6]} />
            {/* Warm, additive sunlit motes, deliberately sparse and faint:
                against the bright sky they should be glints, never snow. */}
            <meshBasicMaterial
              color="#ffcf8f"
              transparent
              opacity={0.15}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        );
      })}
    </>
  );
};
