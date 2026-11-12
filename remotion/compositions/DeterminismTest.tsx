/**
 * @fileoverview Three-second verification composition for the Phase 1
 * Deterministic Frame Contract.
 *
 * It exercises every contract rule in one shot:
 * - camera motion as a pure function of the frame (`dolly` rig),
 * - eased overlays via Remotion `interpolate()`,
 * - seeded randomness (`DustParticles`),
 * - `ThreeCanvas` with explicit width/height,
 * - a live frame counter that makes drift visible to the naked eye.
 *
 * Verification: `node scripts/verify-determinism.mjs` renders this composition
 * twice and proves byte-identical video + pixel-identical stills per frame.
 * @module remotion/compositions/DeterminismTest
 */

import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { KuanimationScene } from './KuanimationScene';

export const DeterminismTest: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Eased title overlay: fade in, hold, fade out — pure function of frame.
  const titleOpacity = interpolate(
    frame,
    [0, Math.round(fps * 0.6), durationInFrames - Math.round(fps * 0.6), durationInFrames - 1],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const titleRise = interpolate(frame, [0, Math.round(fps * 0.8)], [36, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#050505' }}>
      <KuanimationScene rig="dolly" mood="gold dust" />

      <AbsoluteFill
        style={{
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: 96,
          pointerEvents: 'none'
        }}
      >
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleRise}px)`,
            textAlign: 'center',
            fontFamily:
              "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
            color: '#fff8e7',
            textShadow: '0 2px 12px rgba(0, 0, 0, 0.65)'
          }}
        >
          <h1 style={{ fontSize: 64, margin: 0, letterSpacing: 6, fontWeight: 700 }}>
            KUANIMATION · REMOTION
          </h1>
          <p style={{ fontSize: 28, margin: '12px 0 0', opacity: 0.85 }}>
            Determinism test — frame {frame} / {durationInFrames} · {fps} fps · 3.0 s
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
