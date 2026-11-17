/**
 * @fileoverview IllustratedFilm: a painterly 2.5D narrated film.
 *
 * Same inputProps/calculateMetadata contract as StoryFilm. Each scene shows a
 * depth-displaced illustration with a frame-pure camera move, seeded ambient
 * FX, Khmer captions (Hanuman), year chips and crossfade/dip-to-black
 * transitions. A scene with a clip file uses <OffthreadVideo> (muted) instead
 * of parallax. Missing assets render a clearly labeled placeholder card only
 * when `allowMissing` is true — otherwise make.mjs fails before rendering.
 *
 * DETERMINISM: frame-pure only. No useFrame, no Math.random, no wall-clock —
 * all motion/FX come from remotion/lib/illustrated-motion.ts pure functions.
 * @module remotion/compositions/IllustratedFilm
 */

import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  Audio,
  OffthreadVideo,
  staticFile,
  delayRender,
  continueRender,
} from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useLoader } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import {
  buildIllustratedTimeline,
  type IllustratedTimeline,
  type IllustratedTimedScene,
} from '../lib/illustrated-timing.ts';
import {
  parallaxPose,
  dustParticle,
  godRays,
  waterShimmer,
  grassSway,
  bird,
  firefly,
  grainOffset,
  smokeDrift,
  crossfadeOpacity,
  dipToBlack,
  yearChipOpacity,
  musicVolume,
  type CameraMove,
} from '../lib/illustrated-motion.ts';
import { publicAssetPath, depthPathFor } from '../lib/illustrated-assets.ts';
import { limitParallax, type MotionOverride } from '../lib/parallelax-safety.ts';
import {
  DEPTH_STRENGTH,
  PLANE_SEGMENTS_X,
  PLANE_SEGMENTS_Y,
  depthToZ,
} from '../lib/illustrated-depth.ts';
import { getSubtitleText, SUBTITLE_LAYOUT } from '../lib/subtitles.ts';
import { SceneWorld } from './SceneWorld';
import { getShotPose, shotFov, lookAtQuaternion, type ShotType, type CameraRigType } from '../lib/camera.ts';
import { resolveMood } from '../../src/render/moods.js';

const VERT = `
  uniform sampler2D uDepth;
  uniform vec2 uOffset;
  uniform float uScale;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    float d = texture2D(uDepth, uv).r;
    float z = (d - 0.5) * 2.0 * ${DEPTH_STRENGTH.toFixed(4)} * uStrength;
    vec3 p = position;
    p.z += z;
    p.x *= uScale; p.y *= uScale;
    p.xy += uOffset * vec2(1.0, 0.5625);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const FRAG = `
  uniform sampler2D uImage;
  uniform float uTint;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(uImage, vUv);
    c.rgb = mix(c.rgb, c.rgb * vec3(1.02, 0.99, 0.94), uTint);
    gl_FragColor = c;
  }
`;

/** The depth-displaced illustration plane. Textures load via useLoader/Suspense. */
const ParallaxPlane: React.FC<{
  imageUrl: string;
  depthUrl: string;
  move: CameraMove;
  seed: string;
  frame: number;
  fps: number;
  durationInFrames: number;
  /** Safety-limited amplitude in [0,1] from depth edge metric + override. */
  amplitude?: number;
}> = ({ imageUrl, depthUrl, move, seed, frame, fps, durationInFrames, amplitude = 1 }) => {
  const [image, depth] = useLoader(THREE.TextureLoader, [imageUrl, depthUrl]);
  const pose = parallaxPose(move, frame, fps, durationInFrames, seed);
  const material = React.useMemo(() => {
    // Depth texture must not be color-managed; clamp to edges to avoid smearing.
    depth.wrapS = THREE.ClampToEdgeWrapping;
    depth.wrapT = THREE.ClampToEdgeWrapping;
    image.colorSpace = THREE.SRGBColorSpace;
    image.wrapS = THREE.ClampToEdgeWrapping;
    image.wrapT = THREE.ClampToEdgeWrapping;
    return new THREE.ShaderMaterial({
      uniforms: {
        uImage: { value: image },
        uDepth: { value: depth },
        uOffset: { value: new THREE.Vector2(0, 0) },
        uScale: { value: 1 },
        uStrength: { value: 1 },
        uTint: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });
  }, [image, depth]);

  // Set uniforms synchronously in the render body (NOT useEffect): effects run
  // after commit and can land on a different frame during continuous rendering,
  // which breaks byte-level determinism even when isolated stills match.
  material.uniforms.uOffset.value.set(pose.offsetX * amplitude, pose.offsetY * amplitude);
  material.uniforms.uScale.value = 1 + (pose.scale - 1) * amplitude;
  material.uniforms.uStrength.value = amplitude;

  return (
    <mesh material={material} frustumCulled={false}>
      <planeGeometry args={[PLANE_W, PLANE_H, PLANE_SEGMENTS_X, PLANE_SEGMENTS_Y]} />
    </mesh>
  );
};

/** 16:9 plane (width/height) framed exactly by the camera below. */
const PLANE_W = 3.56;
const PLANE_H = 2.0;
/** Camera distance so the plane fills the frame at fov 45 (2 * tan(22.5°) ≈ 0.828). */
const CAMERA_Z = PLANE_H / 2 / Math.tan((45 / 2) * (Math.PI / 180));

interface IllustratedFilmProps {
  story?: any;
  voiceData?: any;
  isMock?: boolean;
  isDraft?: boolean;
  isVertical?: boolean;
  allowMissing?: boolean;
  /** Per-scene asset presence, from scripts/illustrated-manifest.mjs. */
  assetStatus?: Record<string, { image: boolean; depth: boolean; clip: boolean }>;
  /** True when the declared music file exists (else skipped/logged). */
  musicPresent?: boolean;
  englishSubtitles?: boolean;
  /** Per-scene depth-edge metric from scripts/depth.py (parallax-metrics.json). */
  parallaxMetrics?: Record<string, number>;
}

export const IllustratedFilm: React.FC<IllustratedFilmProps> = ({
  story,
  voiceData,
  isMock,
  isDraft,
  isVertical,
  allowMissing,
  assetStatus,
  musicPresent,
  englishSubtitles,
  parallaxMetrics,
}) => {
  const { fps } = useVideoConfig();
  const [fontHandle] = React.useState(() => delayRender('Loading Hanuman subtitle font'));
  React.useEffect(() => {
    const finish = () => continueRender(fontHandle);
    if (!document.fonts || !document.fonts.load) { finish(); return; }
    Promise.all([
      document.fonts.load(`400 ${SUBTITLE_LAYOUT.fontSizePx}px Hanuman`),
      document.fonts.load(`700 ${SUBTITLE_LAYOUT.fontSizePx}px Hanuman`),
    ]).then(finish, finish);
  }, [fontHandle]);

  if (!story || !voiceData) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#111', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
        <div>IllustratedFilm needs inputProps: story + voiceData</div>
        <div style={{ opacity: 0.6, fontSize: 18 }}>node scripts/make.mjs --story src/stories/khmer-empire.json --style illustrated</div>
      </AbsoluteFill>
    );
  }

  const timeline = buildIllustratedTimeline(voiceData, fps);
  const sceneSpecs = story.scenes || [];
  const captionLanguage = (story.subtitleLanguage && englishSubtitles) ? 'en' : 'km';
  const musicPath = story.music && musicPresent ? publicAssetPath(story.music) : null;
  const voiceSpans = timeline.scenes.flatMap((s) =>
    s.lines.map((l) => ({ start: l.startFrame, end: l.startFrame + l.durationInFrames }))
  );
  const durationInFrames = timeline.durationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <style dangerouslySetInnerHTML={{ __html: `
@font-face { font-family:'Hanuman'; font-style:normal; font-weight:400; font-display:block;
  src: url('${staticFile('fonts/Hanuman-Regular.ttf')}') format('truetype'); }
@font-face { font-family:'Hanuman'; font-style:normal; font-weight:700; font-display:block;
  src: url('${staticFile('fonts/Hanuman-Bold.ttf')}') format('truetype'); }
` }} />
      {isMock && (
        <div style={{ position:'absolute', top:30, left:30, zIndex:100, padding:'8px 18px',
          background:'rgba(180,20,20,.85)', color:'#fff', fontFamily:'monospace', fontSize:26,
          border:'3px solid #fff', borderRadius:6 }}>MOCK VOICE</div>
      )}

      {/* Title card over the first 1.6 s */}
      {story.titleCard && (
        <Sequence from={0} durationInFrames={Math.round(1.6 * fps)}>
          <TitleCard text={story.titleCard.text} textKm={story.titleCard.textKm} fps={fps} />
        </Sequence>
      )}

      {timeline.scenes.map((scene, idx) => {
        const spec = sceneSpecs[idx] || {};
        const status = (assetStatus && assetStatus[scene.id]) || { image: false, depth: false, clip: false };
        return (
          <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationInFrames}>
            <IllustratedScene
              scene={scene}
              spec={spec}
              status={status}
              fps={fps}
              isDraft={Boolean(isDraft)}
              captionLanguage={captionLanguage}
              englishSubtitles={Boolean(englishSubtitles)}
              allowMissing={Boolean(allowMissing)}
              depthEdge={parallaxMetrics ? parallaxMetrics[scene.id] : undefined}
            />
          </Sequence>
        );
      })}

      {/* Narration audio */}
      {timeline.scenes.flatMap((scene) =>
        scene.lines.map((line, li) => (
          <Sequence key={`${scene.id}-${li}`} from={line.startFrame} durationInFrames={line.durationInFrames}>
            {line.file ? <Audio src={staticFile(line.file.replace(/^public\//, ''))} /> : null}
          </Sequence>
        ))
      )}

      {/* Music with frame-pure ducking under the voice */}
      {musicPath && (
        <Audio src={staticFile(musicPath)} volume={(f) => musicVolume(f, fps, voiceSpans)} />
      )}

      {/* End card over the last 2.2 s */}
      {story.endCard && (
        <Sequence from={Math.max(0, durationInFrames - Math.round(2.2 * fps))} durationInFrames={Math.round(2.2 * fps)}>
          <TitleCard text={story.endCard.text} textKm={story.endCard.textKm} fps={fps} ending />
        </Sequence>
      )}

      {/* Global film vignette */}
      <AbsoluteFill style={{ pointerEvents:'none', zIndex:30,
        background:'radial-gradient(ellipse at center, rgba(0,0,0,0) 58%, rgba(0,0,0,0.34) 100%)' }} />
      {isMock && null}
    </AbsoluteFill>
  );
};

/** Phase 4 hybrid: an establishing/aerial shot using the existing Angkor 3D set (no characters). */
const World3DScene: React.FC<{
  frame: number;
  fps: number;
  durationInFrames: number;
  shot: ShotType;
  rig: CameraRigType;
  mood: string;
  isDraft: boolean;
}> = ({ frame, fps, durationInFrames, shot, rig, mood, isDraft }) => {
  const pose = getShotPose(shot, rig, frame, fps, durationInFrames);
  const rot = lookAtQuaternion(pose.position, pose.lookAt);
  const preset = React.useMemo(() => resolveMood(mood), [mood]);
  const w = isDraft ? 1280 : 1920;
  const h = isDraft ? 720 : 1080;
  return (
    <ThreeCanvas width={w} height={h} shadows gl={{ antialias: false }}>
      <SceneWorld preset={preset} world="khmer-temple" quality={isDraft ? 'draft' : 'final'} />
      <PerspectiveCamera makeDefault fov={shotFov(shot)} near={0.1} far={1000}
        position={pose.position} quaternion={rot} />
    </ThreeCanvas>
  );
};

const IllustratedScene: React.FC<{
  scene: IllustratedTimedScene;
  spec: any;
  status: { image: boolean; depth: boolean; clip: boolean };
  fps: number;
  isDraft: boolean;
  captionLanguage: string;
  englishSubtitles: boolean;
  allowMissing: boolean;
  depthEdge?: number;
}> = ({ scene, spec, status, fps, isDraft, captionLanguage, englishSubtitles, allowMissing, depthEdge }) => {
  // Local frames inside <Sequence>.
  const frame = useCurrentFrame();
  const dur = scene.durationInFrames;
  const seed = scene.id;
  const fx: string[] = spec.fx || [];
  const w = isDraft ? 1280 : 1920;
  const h = isDraft ? 720 : 1080;

  const mediaType = (spec.media && spec.media.type) || (spec.clip ? 'clip' : 'illustration');
  const clipPath = spec.clip ? publicAssetPath(spec.clip) : null;
  const useClip = mediaType === 'clip' && Boolean(clipPath && status.clip);
  const isWorld3d = mediaType === 'world3d';
  const imagePath = spec.image ? publicAssetPath(spec.image) : null;
  const depthPath = spec.image ? publicAssetPath(depthPathFor(spec.image)) : null;
  const canParallax = mediaType === 'illustration' && Boolean(imagePath && status.image && status.depth);
  const isPlaceholder = !useClip && !canParallax && !isWorld3d;
  // Safety-limited parallax amplitude: depth edges + per-scene motion override.
  const safety = limitParallax(depthEdge ?? 0, spec.motion as MotionOverride | undefined);
  const amplitude = safety.factor > 0 ? (safety.amplitude / Math.max(0.0001, 0.10)) * (spec.motion?.amplitude ?? 1) : 0;
  // Clamp to [0,1]; the limitParallax ceiling guarantees no over-stretch.
  const safeAmplitude = Math.min(1, Math.max(0, amplitude));

  // Subtitle text from narration (km spoken, gloss in English).
  const line = scene.lines[0];
  const narration = spec.narration || {};
  const subtitleText = englishSubtitles && captionLanguage === 'en' && narration.en
    ? narration.en
    : getSubtitleText({ text: narration.km || (line && line.text) || '', subtitle: narration.en }, { captionLanguage });

  // Transition overlays.
  const trans = spec.transition || 'none';
  const fadeOpacity = trans === 'crossfade' ? crossfadeOpacity(frame, fps) : 1;
  const black = trans === 'dip-to-black' ? dipToBlack(frame, fps, dur) : 0;

  return (
    <AbsoluteFill style={{ opacity: fadeOpacity }}>
      <AbsoluteFill style={{ backgroundColor: '#1a1712' }}>
        {isWorld3d ? (
          <World3DScene
            frame={frame}
            fps={fps}
            durationInFrames={dur}
            shot={(spec.shot || 'wide') as ShotType}
            rig={(spec.camera === 'crane' || spec.camera === 'orbit' || spec.camera === 'dolly' ? spec.camera : 'crane') as CameraRigType}
            mood={spec.mood || 'warm dawn'}
            isDraft={isDraft}
          />
        ) : useClip ? (
          <OffthreadVideo muted src={staticFile(clipPath!)} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        ) : canParallax ? (
          <ThreeCanvas width={w} height={h} gl={{ antialias: false }}>
            <color attach="background" args={['#1a1712']} />
            <PerspectiveCamera makeDefault position={[0, 0, CAMERA_Z]} fov={45} near={0.1} far={100} />
            <ParallaxPlane
              imageUrl={staticFile(imagePath!)}
              depthUrl={staticFile(depthPath!)}
              move={(spec.camera || 'static') as CameraMove}
              seed={seed}
              frame={frame}
              fps={fps}
              durationInFrames={dur}
              amplitude={safeAmplitude}
            />
          </ThreeCanvas>
        ) : (
          <PlaceholderCard sceneId={scene.id} image={spec.image} allowMissing={allowMissing} narration={narration.en || ''} />
        )}

        {/* Ambient FX (seeded, frame-pure DOM overlays) */}
        <AmbientFx fx={fx} seed={seed} frame={frame} fps={fps} width={w} height={h} />
      </AbsoluteFill>

      {/* Year chip lower-third */}
      {spec.yearChip && (
        <div style={{ position:'absolute', left:'50%', bottom: SUBTITLE_LAYOUT.bottomPx + 96,
          transform:'translateX(-50%)', zIndex:12, opacity: yearChipOpacity(frame, fps),
          fontFamily:'Hanuman', fontWeight:700, fontSize: isDraft ? 40 : 58, color:'#f7e7b4',
          textShadow:'0 2px 12px rgba(0,0,0,.9)', letterSpacing:4 }}>
          {spec.yearChip}
        </div>
      )}

      {/* Caption inside title-safe */}
      {subtitleText && frame >= 0 && (
        <div style={{ position:'absolute', zIndex:14, bottom: SUBTITLE_LAYOUT.bottomPx,
          left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,.72)', color:'#fff',
          padding:`${SUBTITLE_LAYOUT.paddingYPx}px ${SUBTITLE_LAYOUT.paddingXPx}px`, borderRadius:8,
          fontFamily:'Hanuman', fontSize: SUBTITLE_LAYOUT.fontSizePx, lineHeight: SUBTITLE_LAYOUT.lineHeight,
          textAlign:'center', maxWidth:`${SUBTITLE_LAYOUT.maxWidthPercent}%`,
          boxShadow:'0 4px 20px rgba(0,0,0,.5)', border:'1px solid rgba(255,255,255,.2)' }}>
          {subtitleText}
        </div>
      )}

      {/* Dip-to-black overlay */}
      {black > 0 && <AbsoluteFill style={{ background:'#000', opacity:black, zIndex:20, pointerEvents:'none' }} />}
    </AbsoluteFill>
  );
};

const PlaceholderCard: React.FC<{ sceneId: string; image: string; allowMissing: boolean; narration: string }> = ({ sceneId, image, allowMissing, narration }) => (
  <AbsoluteFill style={{ display:'flex', alignItems:'center', justifyContent:'center',
    background:'repeating-linear-gradient(45deg,#2a2a2a,#2a2a2a 24px,#343434 24px,#343434 48px)' }}>
    <div style={{ textAlign:'center', color:'#ffd166', fontFamily:'monospace', padding:40,
      background:'rgba(0,0,0,.6)', border:'4px dashed #ffd166', maxWidth:'80%' }}>
      <div style={{ fontSize:44, fontWeight:700 }}>PLACEHOLDER — {allowMissing ? 'MISSING ASSET' : 'ASSET'}</div>
      <div style={{ fontSize:28, marginTop:16 }}>scene {sceneId}</div>
      <div style={{ fontSize:22, marginTop:8, wordBreak:'break-all', color:'#fff' }}>{image}</div>
      <div style={{ fontSize:20, marginTop:16, color:'#ccc', fontFamily:'Hanuman' }}>{narration}</div>
    </div>
  </AbsoluteFill>
);

const AmbientFx: React.FC<{ fx: string[]; seed: string; frame: number; fps: number; width: number; height: number }> = ({ fx, seed, frame, fps }) => {
  const items: React.ReactNode[] = [];
  if (fx.includes('god-rays')) {
    const g = godRays(seed, frame, fps);
    items.push(<AbsoluteFill key="gr" style={{ pointerEvents:'none', opacity:g.strength,
      background:`linear-gradient(${g.angle}rad, rgba(255,240,190,.55), transparent 60%)`, mixBlendMode:'screen' }} />);
  }
  if (fx.includes('water') || fx.includes('fireflies') || fx.includes('grass') || fx.includes('smoke')) {
    const sway = fx.includes('grass') ? grassSway(seed, frame, fps) : 0;
    const shimmer = fx.includes('water') ? waterShimmer(seed, frame, fps) : 0;
    items.push(<div key="band" style={{ position:'absolute', bottom:0, left:0, right:0, height:'32%',
      pointerEvents:'none', background:`linear-gradient(rgba(120,170,190,${0.05 + 0.10*shimmer}), transparent)`,
      transform:`rotate(${sway}rad)`, transformOrigin:'bottom' }} />);
  }
  if (fx.includes('dust')) {
    for (let i = 0; i < 24; i += 1) {
      const p = dustParticle(seed, i, frame, fps);
      items.push(<div key={`d${i}`} style={{ position:'absolute', left:`${p.x*100}%`, top:`${p.y*100}%`,
        width:5, height:5, borderRadius:'50%', background:'rgba(255,240,200,.9)', opacity:p.opacity,
        pointerEvents:'none', filter:'blur(1px)' }} />);
    }
  }
  if (fx.includes('birds')) {
    for (let i = 0; i < 5; i += 1) {
      const b = bird(seed, i, frame, fps);
      items.push(<div key={`b${i}`} style={{ position:'absolute', left:`${b.x*100}%`, top:`${b.y*100}%`,
        width:14, height:4, borderTop:'2px solid rgba(30,30,30,.7)', borderRadius:'50%', pointerEvents:'none' }} />);
    }
  }
  if (fx.includes('fireflies')) {
    for (let i = 0; i < 14; i += 1) {
      const f = firefly(seed, i, frame, fps);
      items.push(<div key={`f${i}`} style={{ position:'absolute', left:`${f.x*100}%`, top:`${f.y*100}%`,
        width:6, height:6, borderRadius:'50%', background:'#fff3a0', opacity:f.brightness,
        boxShadow:'0 0 10px 4px rgba(255,240,120,.8)', pointerEvents:'none' }} />);
    }
  }
  if (fx.includes('smoke')) {
    const dx = smokeDrift(seed, frame, fps);
    items.push(<div key="sm" style={{ position:'absolute', left:`${48 + dx*100}%`, top:'12%', width:'20%', height:'60%',
      pointerEvents:'none', background:'radial-gradient(ellipse,rgba(90,90,90,.35),transparent 70%)', filter:'blur(18px)' }} />);
  }
  if (fx.includes('grain')) {
    const o = grainOffset(frame, fps);
    items.push(<AbsoluteFill key="grain" style={{ pointerEvents:'none', opacity:0.06, mixBlendMode:'overlay',
      backgroundImage:`repeating-conic-gradient(#fff 0% 25%, #000 0% 50%)`, backgroundSize:'4px 4px',
      backgroundPosition:`${o.x}px ${o.y}px` }} />);
  }
  return <>{items}</>;
};

const TitleCard: React.FC<{ text: string; textKm?: string; fps: number; ending?: boolean }> = ({ text, textKm, fps, ending }) => {
  const frame = useCurrentFrame();
  const opacity = crossfadeOpacity(frame, fps, 0.4) * (1 - crossfadeOpacity(frame - Math.round(1.2 * fps), fps, 0.4));
  return (
    <AbsoluteFill style={{ display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column',
      background: ending ? 'rgba(0,0,0,.72)' : 'rgba(0,0,0,.55)', opacity, zIndex:40 }}>
      <div style={{ color:'#f7e7b4', fontFamily:'Georgia, serif', fontSize:96, letterSpacing:6 }}>{text}</div>
      {textKm && <div style={{ color:'#fff', fontFamily:'Hanuman', fontSize:56, marginTop:12 }}>{textKm}</div>}
    </AbsoluteFill>
  );
};

export const calculateIllustratedMetadata = ({ props }: { props: Record<string, any> }) => {
  if (!props || !props.voiceData || !props.story) {
    throw new Error('IllustratedFilm requires inputProps.story and inputProps.voiceData.');
  }
  const fps = 30;
  const timeline: IllustratedTimeline = buildIllustratedTimeline(props.voiceData, fps);
  const draft = Boolean(props.isDraft);
  const vertical = Boolean(props.isVertical);
  return {
    durationInFrames: Math.max(1, timeline.durationInFrames),
    fps,
    width: vertical ? (draft ? 720 : 1080) : (draft ? 1280 : 1920),
    height: vertical ? (draft ? 1280 : 1920) : (draft ? 720 : 1080),
    props,
  };
};
