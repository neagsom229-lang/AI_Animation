/**
 * @fileoverview StoryFilm: Data-driven 3D animation composition that renders any story JSON
 * and voiceData via inputProps and calculateMetadata.
 * @module remotion/compositions/StoryFilm
 */

import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  Audio,
  staticFile,
  delayRender,
  continueRender
} from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { resolveMood } from '../../src/render/moods.js';
import {
  getCameraPose,
  getShotPose,
  lookAtQuaternion,
  shotFov,
  SPEAKER_POSITION,
  SPEAKER_YAW,
  LISTENER_POSITION,
  LISTENER_YAW,
  type CameraRigType,
  type ShotType
} from '../lib/camera.ts';
import { buildStoryTimeline, type TimedScene, type TimedLine, type RhubarbCue } from '../lib/story-timing.ts';
import { getSubtitleFont, getSubtitleText, SUBTITLE_LAYOUT } from '../lib/subtitles.ts';
import { AnimaCharacter } from './AnimaCharacter';
import { GlbCharacter } from './GlbCharacter';
import { VrmCharacter } from './VrmCharacter';
import { SceneWorld } from './SceneWorld';
import { DustParticles } from './DustParticles';

/**
 * Eye height used as the gaze fixpoint between characters (metres). The
 * VRM heads sit near 1.5 m (Vita) / 1.5 m after Vivi's 1.27 scale, and the
 * camera frames heads at camera.ts's HEAD_HEIGHT — this is the shared
 * eye line for both, not a per-model exact value.
 */
const GAZE_HEAD_HEIGHT = 1.5;

interface StoryCharacterProps {
  spec: any;
  position: [number, number, number];
  rotationY: number;
  action?: string;
  env?: number[];
  lineStartFrame?: number;
  mouthCues?: RhubarbCue[];
  gazeTarget: [number, number, number];
}

/**
 * Per-character model dispatch: `vrmUrl` → the Goal 3 VRM path (facial
 * animation, solved never-T-pose, gaze), `modelUrl` → the Phase B GLB path
 * as fallback. Returns null only if the spec has neither (the caller then
 * falls back to the legacy anima3d rig).
 */
const StoryCharacter: React.FC<StoryCharacterProps> = ({
  spec,
  position,
  rotationY,
  action,
  env,
  lineStartFrame,
  mouthCues,
  gazeTarget
}) => {
  if (spec && spec.vrmUrl) {
    return (
      <VrmCharacter
        modelUrl={spec.vrmUrl}
        position={position}
        rotationY={rotationY}
        scale={typeof spec.vrmScale === 'number' ? spec.vrmScale : 1}
        action={action}
        env={env}
        lineStartFrame={lineStartFrame}
        mouthCues={mouthCues}
        seed={spec.id || 'vrm'}
        gazeTarget={gazeTarget}
      />
    );
  }
  if (spec && spec.modelUrl) {
    return (
      <GlbCharacter
        modelUrl={spec.modelUrl}
        position={position}
        rotationY={rotationY}
        action={action}
        env={env}
        lineStartFrame={lineStartFrame}
      />
    );
  }
  return null;
};

export interface StoryFilmProps {
  story?: any;
  voiceData?: any;
  /** Set by make.mjs in --mock mode; stamps a visible MOCK VOICE label. */
  isMock?: boolean;
  /** Set by make.mjs in --draft mode: 720p layout, low shadows, no post. */
  isDraft?: boolean;
}

export const StoryFilm: React.FC<StoryFilmProps> = ({
  story,
  voiceData,
  isMock,
  isDraft
}) => {
  const { fps } = useVideoConfig();

  // Khmer captions need a font that a fresh clone may not have installed, so
  // the film ships Hanuman itself (public/fonts — SIL OFL 1.1, CREDITS.md).
  // Hold the render until it is decoded: capturing mid-load would render a
  // fallback typeface, which is both wrong-looking and non-deterministic.
  const [fontHandle] = React.useState(() =>
    delayRender('Loading Hanuman subtitle font')
  );
  React.useEffect(() => {
    const finish = () => continueRender(fontHandle);
    if (!document.fonts || !document.fonts.load) {
      finish();
      return;
    }
    Promise.all([
      document.fonts.load(`400 ${SUBTITLE_LAYOUT.fontSizePx}px Hanuman`),
      document.fonts.load(`700 ${SUBTITLE_LAYOUT.fontSizePx}px Hanuman`)
    ]).then(finish, finish);
  }, [fontHandle]);

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

  // Subtitle layer is language-aware (--lang): font + text come from the same
  // resolved narration language that drove the voice.
  const subtitleLanguage = (voiceData && voiceData.language) || (story && story.language) || 'km';
  const subtitleFont = getSubtitleFont(subtitleLanguage);

  // Draft mode lays the film out at the final 1920×1080 coordinates and
  // renders the whole thing scaled — layout math never diverges between
  // draft and final, only the rasteriser workload does.
  const rootScale = isDraft ? 720 / 1080 : 1;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000',
        width: 1920,
        height: 1080,
        transform: `scale(${rootScale})`,
        transformOrigin: 'top left',
      }}
    >
      {/* @font-face for the bundled Khmer caption font (Hanuman, SIL OFL 1.1
          — downloaded from Google Fonts, see CREDITS.md). font-display:block
          plus the delayRender gate above keeps captions out of fallback
          typefaces. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@font-face {
  font-family: 'Hanuman';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url('${staticFile('fonts/Hanuman-Regular.ttf')}') format('truetype');
}
@font-face {
  font-family: 'Hanuman';
  font-style: normal;
  font-weight: 700;
  font-display: block;
  src: url('${staticFile('fonts/Hanuman-Bold.ttf')}') format('truetype');
}
`
        }}
      />
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
              subtitleFont={subtitleFont}
              characters={story.characters || []}
              world={story.world}
              draft={Boolean(isDraft)}
            />
          </Sequence>
        );
      })}

      {/* Cinematic vignette: darkens the corners of every shot (above the 3D
          layer, below the subtitles). Skipped in draft. */}
      {!isDraft && (
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          zIndex: 10,
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%)'
        }}
      />
      )}
    </AbsoluteFill>
  );
};

interface SceneRendererProps {
  scene: TimedScene;
  spec: any;
  preset: any;
  rig: string;
  fps: number;
  subtitleFont: string;
  characters: any[];
  /** Optional world name from the story JSON (e.g. "khmer-temple"). */
  world?: string;
  /** Draft mode: 720p raster, low shadows, no post overlays. */
  draft?: boolean;
}

const SceneRenderer: React.FC<SceneRendererProps> = ({
  scene,
  spec,
  preset,
  rig,
  fps,
  subtitleFont,
  characters,
  world,
  draft
}) => {
  // Frames inside a <Sequence> are LOCAL to that sequence.
  const frame = useCurrentFrame();
  const durationInFrames = scene.durationInFrames;
  // A scene may declare a shot (close-up | medium | wide | over-shoulder);
  // without one it falls back to the legacy rig framing.
  const pose = spec.shot
    ? getShotPose(spec.shot as ShotType, rig as CameraRigType, frame, fps, durationInFrames)
    : getCameraPose(rig as any, frame, fps, durationInFrames);
  const cameraRotation = lookAtQuaternion(pose.position, pose.lookAt);

  // Convert absolute line frames to sequence-local frames.
  const localLines = scene.lines.map((line: TimedLine) => ({
    ...line,
    localStart: line.startFrame - scene.startFrame,
  }));

  // The active dialogue line (sequence-local frames). Index-based so the
  // speaker can be resolved from spec.dialogue — voice lines are generated
  // 1:1 in dialogue order by scripts/generate-voice.py.
  let activeIdx = 0;
  for (let i = 0; i < localLines.length; i++) {
    const line = localLines[i];
    if (frame >= line.localStart && frame < line.localStart + line.durationInFrames) {
      activeIdx = i;
      break;
    }
  }
  const activeLine = localLines[activeIdx];

  // Which character speaks, and what is it doing this scene.
  const dialogue = spec.dialogue || [];
  const speakerId = dialogue[activeIdx] ? dialogue[activeIdx].speaker : undefined;
  const charSpec =
    (speakerId && characters.find((c: any) => c.id === speakerId)) || characters[0];
  const sceneAction: string | undefined = (
    (spec.actions || []).find((a: any) => !speakerId || a.character === speakerId) || {}
  ).action;
  const charAction = sceneAction || (activeLine ? 'talk' : 'idle');
  const charUrl = charSpec && charSpec.modelUrl;
  const charVrmUrl = charSpec && charSpec.vrmUrl;
  // Conversation blocking: when the story has a second character they stand
  // on the listener mark facing the speaker (camera.ts owns the layout), so
  // two-person shots — especially over-the-shoulder — have someone to frame.
  const listenerSpec = characters.find((c: any) => c.id !== (charSpec && charSpec.id));
  const hasListener = Boolean(listenerSpec && (listenerSpec.vrmUrl || listenerSpec.modelUrl));

  return (
    <AbsoluteFill>
      <ThreeCanvas
        width={draft ? 1280 : 1920}
        height={draft ? 720 : 1080}
        shadows
        gl={{ toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
      >
        {world ? (
          // Phase C: fully dressed world (HDRI sky, sun + shadows, PBR ground,
          // temple, pond, seeded scatter) — it owns fog and the lights.
          <SceneWorld preset={preset} world={world} quality={draft ? 'draft' : 'final'} />
        ) : (
          <>
            <color attach="background" args={[preset.fog]} />
            <fogExp2 attach="fog" args={[preset.fog, 0.015]} />

            <ambientLight color={preset.ambient} intensity={preset.intensity} />
            <directionalLight
              color={preset.directional}
              intensity={preset.intensity * 1.2}
              position={[10, 20, 10]}
              castShadow
            />

            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[100, 100]} />
              <meshStandardMaterial color="#414c3e" roughness={0.9} />
            </mesh>
          </>
        )}

        <PerspectiveCamera
          makeDefault
          fov={shotFov(spec.shot)}
          near={0.1}
          far={1000}
          position={pose.position}
          quaternion={cameraRotation}
        />

        {/* Character dispatch: a spec with `vrmUrl` renders the VRM path
            (Goal 3), `modelUrl` keeps the Phase B GLB path as fallback, and
            stories with neither get the legacy anima3d rig below. */}
        {charUrl || charVrmUrl ? (
          <>
            <StoryCharacter
              spec={charSpec}
              position={SPEAKER_POSITION}
              // Face the listener mark for a real conversation; a solo
              // character keeps facing the camera.
              rotationY={hasListener ? SPEAKER_YAW : 0}
              action={charAction}
              env={activeLine ? activeLine.env : undefined}
              lineStartFrame={activeLine ? activeLine.localStart : 0}
              mouthCues={activeLine ? activeLine.mouthCues : undefined}
              // Eyes: speaker watches the listener, listener watches the
              // speaker; a solo character watches the camera lens.
              gazeTarget={
                hasListener
                  ? [LISTENER_POSITION[0], GAZE_HEAD_HEIGHT, LISTENER_POSITION[2]]
                  : [pose.position[0], pose.position[1], pose.position[2]]
              }
            />
            {hasListener && (
              <StoryCharacter
                spec={listenerSpec}
                position={LISTENER_POSITION}
                rotationY={LISTENER_YAW}
                action="idle"
                gazeTarget={[SPEAKER_POSITION[0], GAZE_HEAD_HEIGHT, SPEAKER_POSITION[2]]}
              />
            )}
          </>
        ) : (
          // Legacy fallback for stories without a character modelUrl:
          // the procedural anima3d rig (still frame-deterministic).
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
        )}

        {/* Soft depth of field on wide shots only: characters stay sharp,
            the temple backdrop melts. Computed from the live camera pose so
            the chest/head line is always the focal plane. */}
        {/* Dust motes — sparse and faint against the sunset sky. */}
        <DustParticles count={14} />
      </ThreeCanvas>

      {/* Soft depth-of-field emulation (Goal 3, widened in Phase 4):
          wides get the full split-focus falloff (sharp centre / blurred
          rim); over-the-shoulder shots get a gentler one that softens the
          listener's foreground shoulder without losing the speaker.
          True circle-of-confusion DoF draws black in this pipeline
          (verified), so this deterministic backdrop blur is used.
          Skipped in draft (backdrop-filter is compositor-expensive). */}
      {!draft && (spec.shot === 'wide' || spec.shot === 'over-shoulder') && (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            zIndex: 5,
            backdropFilter: spec.shot === 'wide' ? 'blur(6px)' : 'blur(4px)',
            WebkitBackdropFilter: spec.shot === 'wide' ? 'blur(6px)' : 'blur(4px)',
            maskImage:
              'radial-gradient(ellipse 60% 55% at 50% 44%, rgba(0,0,0,0) 42%, rgba(0,0,0,1) 96%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 60% 55% at 50% 44%, rgba(0,0,0,0) 42%, rgba(0,0,0,1) 96%)'
          }}
        />
      )}

      {localLines.map((line: any, lIdx: number) => (
        <Sequence
          key={lIdx}
          from={line.localStart}
          durationInFrames={line.durationInFrames}
        >
          <Audio src={staticFile(line.file)} />
        </Sequence>
      ))}

      {activeLine && (activeLine.text || activeLine.subtitle ? true : false) && (
        <Subtitle
          key={`${scene.id}-${activeLine.startFrame}`}
          text={getSubtitleText(activeLine)}
          fontFamily={subtitleFont}
        />
      )}
    </AbsoluteFill>
  );
};

/** Language-aware caption overlay rendered for the active dialogue line.
 *  Geometry comes from SUBTITLE_LAYOUT so the box stays inside the
 *  title-safe area (tests/subtitle.test.js enforces the 5% rules). */
const Subtitle: React.FC<{ text: string; fontFamily: string }> = ({ text, fontFamily }) => (
  <div
    style={{
      position: 'absolute',
      zIndex: 20,
      bottom: `${SUBTITLE_LAYOUT.bottomPx}px`,
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      color: '#fff',
      padding: `${SUBTITLE_LAYOUT.paddingYPx}px ${SUBTITLE_LAYOUT.paddingXPx}px`,
      borderRadius: '8px',
      fontFamily,
      fontSize: `${SUBTITLE_LAYOUT.fontSizePx}px`,
      lineHeight: SUBTITLE_LAYOUT.lineHeight,
      textAlign: 'center',
      maxWidth: `${SUBTITLE_LAYOUT.maxWidthPercent}%`,
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      border: '1px solid rgba(255,255,255,0.2)'
    }}
  >
    {text}
  </div>
);

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
  // Recompute the timeline for the metadata frames (pure function of props).
  const timeline = buildStoryTimeline(props.voiceData, 30);
  const fps = 30;
  // Draft rasters at half resolution.
  const draft = Boolean(props.isDraft);
  return {
    durationInFrames: Math.max(1, timeline.durationInFrames),
    fps,
    width: draft ? 1280 : 1920,
    height: draft ? 720 : 1080,
    props
  };
};
