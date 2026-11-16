/**
 * @fileoverview Phase C world: HDRI sky, sun with shadows, PBR ground,
 * textured platform, Kenney set dressing, pond, sun glow.
 *
 * Everything that can be static is derived once from `buildWorld()` (a pure
 * function — see remotion/lib/set-dressing.ts); everything that moves is a
 * pure function of `useCurrentFrame()`.
 *
 * Loading uses R3F's suspense `useLoader`: @remotion/three's <ThreeCanvas>
 * wraps its children in a Suspense boundary that holds the render until the
 * assets are decoded, then mounts the canvas *with* them so the per-frame
 * `advance()` draws a complete frame (the same mechanism GlbCharacter uses).
 *
 * RULES: no useFrame, no Math.random, no wall-clock time.
 *
 * DETERMINISM NOTE: three sorts opaque meshes by `renderOrder` → `material.id`
 * → `z`. Material ids are assigned when a GLB parses, and parse order follows
 * network completion — so it differs between runs. Where two props meet in a
 * coincident face (wall corners, stair joints, doorway/wall overlaps) the
 * depth test ties and the winner followed that unstable order, flipping ~10
 * edge pixels between renders. Every mesh here therefore carries an explicit
 * renderOrder derived from the layout (ground 0, platform/characters 1,
 * props index+2), which sorts first and makes draw order layout-defined.
 * @module remotion/compositions/SceneWorld
 */

import React from 'react';
import { staticFile } from 'remotion';
import { useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { buildWorld, type PropPlacement, type WorldLayout } from '../lib/set-dressing.ts';
import { AngkorWorld } from './AngkorWorld';

/** Resolved mood preset (see src/render/moods.js). */
export interface MoodPreset {
  ambient: number;
  directional: number;
  fog: number;
  intensity: number;
}

export interface SceneWorldProps {
  preset: MoodPreset;
  /** World name from the story JSON, e.g. "khmer-temple". */
  world: string;
}

/** Exponential fog density — hazy depth without washing the prangs out. */
const FOG_DENSITY = 0.010;

/** Ground plane size and texture tiling. */
const GROUND_SIZE = 600;
const GROUND_REPEAT = 150;

/** Sun position: low behind-left of the temple — golden-hour elevation ~16°,
 *  shadows rake long toward the camera. */
const SUN_POSITION: [number, number, number] = [-22, 10.5, -34];

/**
 * Warm-sand multiplier for every prop material (Goal 3 palette re-grade).
 * The Kenney kits' cream albedo read cool against the sunset ground; this
 * drops the blue channel so stone and wood sit in the same warm envelope.
 */
const PROP_TINT = new THREE.Color('#eee3c8');

// ---------------------------------------------------------------------------
// Sky + image-based lighting from the Poly Haven sunset HDRI
// ---------------------------------------------------------------------------

const Sky: React.FC<{ hdrUrl: string }> = ({ hdrUrl }) => {
  const hdr = useLoader(RGBELoader, hdrUrl);
  const scene = useThree((state) => state.scene);

  React.useLayoutEffect(() => {
    // RGBELoader leaves mapping unset; equirect is required for both the
    // background (sky) and for three's automatic PMREM of scene.environment.
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = hdr;
    scene.environment = hdr;
    return () => {
      scene.background = null;
      scene.environment = null;
    };
  }, [hdr, scene]);

  return null;
};

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------

const Sun: React.FC<{ preset: MoodPreset }> = ({ preset }) => (
  <>
    {/* Warm fill from the mood preset; the HDRI environment supplies the rest.
        Kept low on purpose: ambient + sun + image-based lighting stack, and
        the Kenney props have bright albedo that clips easily. */}
    <ambientLight color={preset.ambient} intensity={preset.intensity * 0.25} />
    <directionalLight
      color={preset.directional}
      intensity={preset.intensity * 1.05}
      position={SUN_POSITION}
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-left={-35}
      shadow-camera-right={35}
      shadow-camera-top={35}
      shadow-camera-bottom={-35}
      shadow-camera-near={1}
      shadow-camera-far={140}
      shadow-bias={-0.0004}
      shadow-normalBias={0.03}
    />
    {/* Camera-side fill: the sun sits behind the temple, so without this the
        speakers' faces would render as silhouettes. Low intensity, no
        shadows — it only lifts the shadow side. */}
    <directionalLight
      color={preset.ambient}
      intensity={preset.intensity * 0.6}
      position={[6, 8, 18]}
    />
  </>
);

// ---------------------------------------------------------------------------
// PBR ground (Poly Haven dry_ground_01: albedo + normal + roughness)
// ---------------------------------------------------------------------------

const Ground: React.FC = () => {
  const [diff, nor, rough] = useLoader(THREE.TextureLoader, [
    staticFile('textures/dry_ground_01_diff_1k.jpg'),
    staticFile('textures/dry_ground_01_nor_gl_1k.jpg'),
    staticFile('textures/dry_ground_01_rough_1k.jpg')
  ]);

  React.useMemo(() => {
    for (const tex of [diff, nor, rough]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(GROUND_REPEAT, GROUND_REPEAT);
      tex.anisotropy = 4;
    }
    diff.colorSpace = THREE.SRGBColorSpace;
  }, [diff, nor, rough]);

  return (
    // renderOrder 0 = drawn first: everything else resolves its coincident
    // faces against the ground in a fixed, layout-defined order.
    <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={0} receiveShadow>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <meshStandardMaterial
        map={diff}
        normalMap={nor}
        roughnessMap={rough}
        roughness={1}
        metalness={0}
        color="#f3e9d2"
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Textured stone platform
// ---------------------------------------------------------------------------

const Platform: React.FC<{ layout: WorldLayout }> = ({ layout }) => {
  const [diff, nor, rough] = useLoader(THREE.TextureLoader, [
    staticFile('textures/old_stone_wall_diff_1k.jpg'),
    staticFile('textures/old_stone_wall_nor_gl_1k.jpg'),
    staticFile('textures/old_stone_wall_rough_1k.jpg')
  ]);

  React.useMemo(() => {
    for (const tex of [diff, nor, rough]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(layout.platform.textureRepeat[0], layout.platform.textureRepeat[1]);
    }
    diff.colorSpace = THREE.SRGBColorSpace;
  }, [diff, nor, rough, layout.platform.textureRepeat]);

  return (
    <mesh position={layout.platform.position} renderOrder={1} castShadow receiveShadow>
      <boxGeometry args={layout.platform.size} />
      <meshStandardMaterial
        map={diff}
        normalMap={nor}
        roughnessMap={rough}
        roughness={1}
        metalness={0}
        color="#eae0c6"
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Pond surface
// ---------------------------------------------------------------------------

const Water: React.FC<{ layout: WorldLayout }> = ({ layout }) => (
  <mesh position={layout.water.position} rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={layout.water.size} />
    <meshStandardMaterial
      color="#2f6f8f"
      transparent
      opacity={0.82}
      roughness={0.12}
      metalness={0.05}
    />
  </mesh>
);

// ---------------------------------------------------------------------------
// Soft sun glow behind the temple
// ---------------------------------------------------------------------------

/**
 * Radial-gradient sprite texture, rasterised once with Canvas2D.
 *
 * A plain-coloured <spriteMaterial> renders as a hard-edged quad (visible as
 * a white box), so the glow needs a texture that fades to transparent at the
 * edges. The gradient is a fixed formula — no randomness — so the rasterised
 * result is identical on every render of the same machine.
 */
function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('SceneWorld: 2D canvas context unavailable for the sun glow');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(0.65, 'rgba(255,255,255,0.12)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const SunGlow: React.FC<{ layout: WorldLayout }> = ({ layout }) => {
  const texture = React.useMemo(() => makeGlowTexture(), []);
  return (
    <sprite position={layout.glow.position} scale={[layout.glow.scale, layout.glow.scale, 1]}>
      <spriteMaterial
        map={texture}
        color={layout.glow.color}
        transparent
        opacity={layout.glow.opacity}
        fog={false}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </sprite>
  );
};

/** Phase 2 afterglow behind the prangs (opacity-capped, art direction §2). */
const AngkorGlow: React.FC = () => {
  const texture = React.useMemo(() => makeGlowTexture(), []);
  return (
    <sprite position={[0, 20, -52]} scale={[34, 22, 1]}>
      <spriteMaterial
        map={texture}
        color="#ffdfae"
        transparent
        opacity={0.16}
        fog={false}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </sprite>
  );
};

// ---------------------------------------------------------------------------
// One placed prop: load once (suspense cache), clone per instance
// ---------------------------------------------------------------------------

const PropInstance: React.FC<PropPlacement & { renderOrder: number }> = ({
  model,
  position,
  rotationY,
  scale,
  renderOrder
}) => {
  const url = staticFile(model.replace(/^public\//, ''));
  const gltf = useLoader(GLTFLoader, url);

  const object = React.useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Deterministic draw order (see header): three sorts opaque meshes by
        // renderOrder BEFORE material.id, and material ids depend on the order
        // the GLBs happen to finish parsing — which varies run to run.
        mesh.renderOrder = renderOrder;
        // Palette re-grade (Goal 3): the Kenney kits ship a cool, pale
        // cream that read flat against the warm sunset ground/HDRI. Every
        // material is multiplied toward the same warm-sand tone the ground
        // uses. Materials are cloned first so instances sharing a GLB do
        // not double-apply the tint.
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((mat) => {
            const m = mat.clone();
            const maybeColor = (m as THREE.MeshStandardMaterial).color;
            if (maybeColor && maybeColor.isColor) maybeColor.multiply(PROP_TINT);
            return m;
          });
        } else if (mesh.material) {
          const m = mesh.material.clone();
          const maybeColor = (m as THREE.MeshStandardMaterial).color;
          if (maybeColor && maybeColor.isColor) maybeColor.multiply(PROP_TINT);
          mesh.material = m;
        }
      }
    });
    return clone;
  }, [gltf, renderOrder]);

  object.position.set(position[0], position[1], position[2]);
  object.rotation.y = rotationY;
  object.scale.setScalar(scale);

  return <primitive object={object} />;
};

// ---------------------------------------------------------------------------
// World root
// ---------------------------------------------------------------------------

export const SceneWorld: React.FC<SceneWorldProps> = ({ preset, world }) => {
  // Pure function → identical layout every render of the same world.
  const layout = React.useMemo(() => buildWorld(world), [world]);

  if (world === 'khmer-temple') {
    // Phase 2: Angkor Wat set — moat, causeway, gopura, three galleries,
    // five prangs, instanced colonnade + palms, ground mist, birds.
    return (
      <>
        <fogExp2 attach="fog" args={[preset.fog, FOG_DENSITY]} />
        <Sky hdrUrl={staticFile('textures/qwantani_sunset_puresky_1k.hdr')} />
        <Sun preset={preset} />
        <AngkorWorld />
        {/* Soft pre-dawn afterglow behind the prangs — capped at 0.16 so it
            never reads as a nuclear flash. */}
        <AngkorGlow />
      </>
    );
  }

  return (
    <>
      <fogExp2 attach="fog" args={[preset.fog, FOG_DENSITY]} />
      <Sky hdrUrl={staticFile('textures/qwantani_sunset_puresky_1k.hdr')} />
      <Sun preset={preset} />
      <Ground />
      <Platform layout={layout} />
      <Water layout={layout} />
      <SunGlow layout={layout} />
      {/* Unique renderOrder per placement (2..N+1): ties between coincident
          faces then resolve by layout index instead of by parse-dependent
          material ids. Ground = 0, platform = 1, characters = 1. */}
      {layout.props.map((placement, index) => (
        <PropInstance
          key={`${placement.model}-${index}`}
          {...placement}
          renderOrder={index + 2}
        />
      ))}
    </>
  );
};
