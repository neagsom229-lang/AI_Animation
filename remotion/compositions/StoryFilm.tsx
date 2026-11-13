/**
 * @fileoverview StoryFilm: Data-driven 3D animation composition that renders any story JSON
 * with dynamic voiceover, lip-sync, subtitles, camera rigs, and moods.
 * @module remotion/compositions/StoryFilm
 */

import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, Audio, staticFile } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { PerspectiveCamera } from '@react-three/drei';
import { resolveMood } from '../../src/render/moods.js';
import { getCameraPose, lookAtQuaternion } from '../lib/camera';
import { AnimaCharacter } from './AnimaCharacter';
import { DustParticles } from './DustParticles';

import storyData from '../../src/stories/khmer-temple.json';
import voiceData from '../../public/voice.json';

export const StoryFilm: React.FC = () => {
  const { fps } = useVideoConfig();

  // Calculate total duration in frames from voiceData
  let currentFrame = 0;
  const scenesWithFrames = voiceData.scenes.map((sceneVoice, sIdx) => {
    const sceneSpec = storyData.scenes[sIdx] || {};
    const durSec = sceneVoice.dur || 5;
    const durFrames = Math.round(durSec * fps);
    const startFrame = currentFrame;
    currentFrame += durFrames;

    let lineCurrentFrame = 0;
    const linesWithFrames = sceneVoice.lines.map((line) => {
      const lineDurFrames = Math.round(line.dur * fps);
      const lStart = lineCurrentFrame;
      lineCurrentFrame += lineDurFrames;
      return {
        ...line,
        startFrame: lStart,
        durationInFrames: lineDurFrames
      };
    });

    return {
      ...sceneVoice,
      spec: sceneSpec,
      startFrame,
      durationInFrames: durFrames,
      lines: linesWithFrames
    };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {scenesWithFrames.map((scene, sIdx) => {
        const mood = scene.spec.mood || 'warm dawn';
        const rig = scene.spec.camera || 'dolly';
        const preset = resolveMood(mood);

        return (
          <Sequence
            key={scene.id || sIdx}
            from={scene.startFrame}
            durationInFrames={scene.durationInFrames}
          >
            <SceneRenderer
              scene={scene}
              preset={preset}
              rig={rig}
              fps={fps}
              durationInFrames={scene.durationInFrames}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

interface SceneRendererProps {
  scene: any;
  preset: any;
  rig: string;
  fps: number;
  durationInFrames: number;
}

const SceneRenderer: React.FC<SceneRendererProps> = ({
  scene,
  preset,
  rig,
  fps,
  durationInFrames
}) => {
  const frame = useCurrentFrame();
  const pose = getCameraPose(rig as any, frame, fps, durationInFrames);
  const cameraRotation = lookAtQuaternion(pose.position, pose.lookAt);

  // Find active dialogue line for lip-sync and subtitles
  let activeLine = scene.lines[0];
  let lineRelativeFrame = frame;
  for (const line of scene.lines) {
    if (frame >= line.startFrame && frame < line.startFrame + line.durationInFrames) {
      activeLine = line;
      lineRelativeFrame = frame - line.startFrame;
      break;
    }
  }

  // Compute mouth envelope value from line.env (20Hz sampling)
  const envIndex = Math.floor((lineRelativeFrame / fps) * 20);
  const envVal = (activeLine && activeLine.env && activeLine.env[envIndex]) || 0;

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

        {/* Hero Character */}
        <AnimaCharacter
          position={[0, 0, 0]}
          seed={13}
          speed={0.8}
          narration={activeLine ? activeLine.text : ''}
          lookAtTarget={[0, 2, -5]}
          scale={1}
        />

        <DustParticles count={25} />
      </ThreeCanvas>

      {/* Audio Playback for Dialogue Lines */}
      {scene.lines.map((line: any, lIdx: number) => (
        <Sequence
          key={lIdx}
          from={line.startFrame}
          durationInFrames={line.durationInFrames}
        >
          <Audio src={staticFile(line.file)} />
        </Sequence>
      ))}

      {/* Subtitles Overlay with Khmer Font Support */}
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

// Calculate total duration in frames for Root registration
export const getStoryDurationInFrames = () => {
  let totalSec = 0;
  if (voiceData && voiceData.scenes) {
    for (const sc of voiceData.scenes) {
      totalSec += sc.dur || 5;
    }
  }
  return Math.round(totalSec * 30);
};
