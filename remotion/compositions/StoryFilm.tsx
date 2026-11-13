/**
 * @fileoverview StoryFilm: Data-driven 3D animation composition that renders any story JSON
 * and voiceData via inputProps and calculateMetadata.
 * @module remotion/compositions/StoryFilm
 */

import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, Audio, staticFile } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { PerspectiveCamera } from '@react-three/drei';
import { resolveMood } from '../../src/render/moods.js';
import { getCameraPose, lookAtQuaternion } from '../lib/camera.ts';
import { buildStoryTimeline, type TimedScene, type TimedLine } from '../lib/story-timing.ts';
import { AnimaCharacter } from './AnimaCharacter';
import { DustParticles } from './DustParticles';

export interface StoryFilmProps {
  story?: any;
  voiceData?: any;
  /** Set by make.mjs in --mock mode; stamps a visible MOCK VOICE label. */
  isMock?: boolean;
}

export const StoryFilm: React.FC<StoryFilmProps> = ({
  story,
  voiceData,
  isMock
}) => {
  const { fps } = useVideoConfig();

  if (!story || !voiceData) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#111', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '28px', flexDirection: 'column' }}>
        <div>StoryFilm needs inputProps: story + voiceData</div>
        <div style={{ opacity: 0.6, fontSize: '18px' }}>Render it with: node scripts/make.mjs --story src/stories/&lt;story&gt;.json</div>
      </AbsoluteFill>
    );
  }

  // Timeline is a pure function of voiceData + fps (see remotion/lib/story-timing.ts).
  const timeline = buildStoryTimeline(voiceData, fps);
  const sceneSpecs = story.scenes || [];

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {isMock && (
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 40,
            zIndex: 100,
            padding: '10px 24px',
            backgroundColor: 'rgba(180, 20, 20, 0.85)',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: '34px',
            fontWeight: 700,
            letterSpacing: 2,
            border: '3px solid #fff',
            borderRadius: 6,
          }}
        >
          MOCK VOICE
        </div>
      )}
      {timeline.scenes.map((scene: TimedScene, sIdx: number) => {
        const sceneSpec = sceneSpecs[sIdx] || {};
        const mood = sceneSpec.mood || 'warm dawn';
        const rig = sceneSpec.camera || 'dolly';
        const preset = resolveMood(mood);

        return (
          <Sequence
            key={scene.id || sIdx}
            from={scene.startFrame}
            durationInFrames={scene.durationInFrames}
          >
            <SceneRenderer
              scene={scene}
              spec={sceneSpec}
              preset={preset}
              rig={rig}
              fps={fps}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

interface SceneRendererProps {
  scene: TimedScene;
  spec: any;
  preset: any;
  rig: string;
  fps: number;
}

const SceneRenderer: React.FC<SceneRendererProps> = ({
  scene,
  spec,
  preset,
  rig,
  fps
}) => {
  // Frames inside a <Sequence> are LOCAL to that sequence.
  const frame = useCurrentFrame();
  const durationInFrames = scene.durationInFrames;
  const pose = getCameraPose(rig as any, frame, fps, durationInFrames);
  const cameraRotation = lookAtQuaternion(pose.position, pose.lookAt);

  // Convert absolute line frames to sequence-local frames.
  const localLines = scene.lines.map((line: TimedLine) => ({
    ...line,
    localStart: line.startFrame - scene.startFrame,
  }));

  let activeLine = localLines[0];
  for (const line of localLines) {
    if (frame >= line.localStart && frame < line.localStart + line.durationInFrames) {
      activeLine = line;
      break;
    }
  }

  return (
    <AbsoluteFill>
      <ThreeCanvas width={1920} height={1080}>
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
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#414c3e" roughness={0.9} />
        </mesh>

        <AnimaCharacter
          position={[0, 0, 0]}
          seed={13}
          speed={0.8}
          narration={activeLine ? activeLine.text : ''}
          lookAtTarget={[0, 2, -5]}
          scale={1}
          env={activeLine ? activeLine.env : undefined}
          lineStartFrame={activeLine ? activeLine.localStart : 0}
        />

        <DustParticles count={25} />
      </ThreeCanvas>

      {localLines.map((line: any, lIdx: number) => (
        <Sequence
          key={lIdx}
          from={line.localStart}
          durationInFrames={line.durationInFrames}
        >
          <Audio src={staticFile(line.file)} />
        </Sequence>
      ))}

      {activeLine && activeLine.subtitle && (
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            color: '#fff',
            padding: '16px 32px',
            borderRadius: '8px',
            fontFamily: '"Hanuman", "Khmer OS Battambang", "Noto Sans Khmer", sans-serif',
            fontSize: '32px',
            textAlign: 'center',
            maxWidth: '80%',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.2)'
          }}
        >
          {activeLine.subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};

export const calculateStoryMetadata = ({ props }: { props: Record<string, any> }) => {
  if (!props || !props.voiceData) {
    throw new Error(
      'StoryFilm requires inputProps.voiceData (and inputProps.story). ' +
      'Generate them with: node scripts/make.mjs --story src/stories/<story>.json'
    );
  }
  if (!props.story) {
    throw new Error('StoryFilm requires inputProps.story.');
  }
  // Total duration = sum of real decoded voice durations + inter-scene padding.
  const timeline = buildStoryTimeline(props.voiceData, 30);
  const fps = 30;
  return {
    durationInFrames: Math.max(1, timeline.durationInFrames),
    fps,
    width: 1920,
    height: 1080,
    props
  };
};
