/**
 * @fileoverview Remotion root: registers all compositions of the studio.
 * @module remotion/Root
 */

import React from 'react';
import { Composition } from 'remotion';
import { DeterminismTest } from './compositions/DeterminismTest';
import { KuanimationScene } from './compositions/KuanimationScene';
import type { KuanimationSceneProps } from './compositions/KuanimationScene';
import { Scene10s } from './compositions/Scene10s';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Phase 1 verification composition: exactly 3 seconds, 1920x1080 @ 30fps. */}
      <Composition
        id="DeterminismTest"
        component={DeterminismTest}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* Reusable full scene with configurable rig + mood. */}
      <Composition<KuanimationSceneProps>
        id="KuanimationScene"
        component={KuanimationScene}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ rig: 'dolly', mood: 'warm dawn' }}
      />

      {/* Phase 2 verification: 10-second walking character scene. */}
      <Composition
        id="Scene10s"
        component={Scene10s}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ rig: 'handheld', mood: 'gold dust' }}
      />
    </>
  );
};
