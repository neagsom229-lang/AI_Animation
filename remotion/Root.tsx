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
import { KhmerEmpireExtended, durationInFrames, fps, width, height } from './compositions/KhmerEmpireExtended';
import { StoryFilm, calculateStoryMetadata } from './compositions/StoryFilm';

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
      <Composition
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

      {/* 2.5-minute Khmer Empire Extended vertical composition (1080x1920 @ 30fps, 4500 frames). */}
      <Composition
        id="KhmerEmpireExtended"
        component={KhmerEmpireExtended}
        durationInFrames={durationInFrames}
        fps={fps}
        width={width}
        height={height}
      />

      {/* Phase 3 StoryFilm composition driven by story JSON and voice JSON via calculateMetadata. */}
      <Composition
        id="StoryFilm"
        component={StoryFilm}
        calculateMetadata={calculateStoryMetadata}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
