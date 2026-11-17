/**
 * @fileoverview The Angkor Wat set (Round 4): moat + lotus pads + causeway +
 * gopura with a recessed doorway + three colonnaded gallery tiers + five
 * lotus-bud prangs (central 3× the corners) + continuous naga balustrade with
 * hooded heads + a dense forest line behind the monument.
 *
 * Determinism: everything static is derived from the layout module; the only
 * frame-driven motion is (a) the water ripple normal scroll, (b) the mist
 * drift and (c) the birds — all pure functions of `useCurrentFrame()`.
 * No Math.random, no wall-clock, no useFrame.
 *
 * PERFORMANCE: columns, stair treads, lotus pads, trunks and canopies are
 * `<instancedMesh>` — the whole set is a few dozen draw calls.
 * @module remotion/compositions/AngkorWorld
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig, staticFile } from 'remotion';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  buildAngkorLayout,
  nagaRailPath,
  type Vec3,
  GALLERY_Z,
  GALLERY_RECESS_M,
  MOAT_WATER_Y,
  MOAT_DEPTH,
  MOAT_FRONT_Z,
  MOAT_BACK_Z,
  MOAT_WIDTH_X,
} from '../lib/angkor.ts';

const B = (staticFile as (p: string) => string);

/** One-off canvases (bas-relief bump + palm crown + ripple normal). */
const makeCanvas = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('AngkorWorld: 2D canvas unavailable');
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

/**
 * Procedural bas-relief band: a carved gallery wall read from a distance.
 *
 * Round 4: the old version was fluting + rosettes, which read as "noise".
 * A Khmer gallery wall reads as *horizontal registers* separated by a heavy
 * cornice, with a carved niche between — so the bump map is built from
 * stacked registers with pilasters and a corbelled arch niche.
 */
function makeBasReliefBump(): THREE.CanvasTexture {
  return makeCanvas(512, 128, (ctx) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 128);
    // Heavy cornice at the top and bottom of the band.
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(0, 0, 512, 10);
    ctx.fillStyle = '#3c3c3c';
    ctx.fillRect(0, 10, 512, 5);
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(0, 113, 512, 10);
    ctx.fillStyle = '#3c3c3c';
    ctx.fillRect(0, 108, 512, 5);
    // Two carved registers separated by a mid string course.
    ctx.fillStyle = '#5e5e5e';
    ctx.fillRect(0, 60, 512, 4);
    // Corbelled niches: an arch head over a recessed panel.
    for (let x = 32; x < 512; x += 96) {
      for (const top of [18, 68]) {
        ctx.fillStyle = '#3f3f3f';
        ctx.fillRect(x, top + 14, 56, 30);
        ctx.fillStyle = '#d0d0d0';
        ctx.beginPath();
        ctx.moveTo(x - 4, top + 16);
        ctx.lineTo(x + 28, top - 4);
        ctx.lineTo(x + 60, top + 16);
        ctx.lineTo(x + 60, top + 20);
        ctx.lineTo(x + 28, top + 1);
        ctx.lineTo(x - 4, top + 20);
        ctx.closePath();
        ctx.fill();
        // Recessed figure inside the niche.
        ctx.fillStyle = '#9a9a9a';
        ctx.beginPath();
        ctx.ellipse(x + 28, top + 30, 9, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(x + 22, top + 40, 12, 4);
      }
    }
    // Pilasters between the niches.
    for (let x = 0; x < 512; x += 96) {
      ctx.fillStyle = '#b4b4b4';
      ctx.fillRect(x, 15, 12, 93);
      ctx.fillStyle = '#4c4c4c';
      ctx.fillRect(x + 12, 15, 4, 93);
    }
  });
}

/** Ripple normal map: horizontal soft bands, scroll-driven by the frame. */
function makeRippleNormal(): THREE.CanvasTexture {
  const tex = makeCanvas(128, 128, (ctx) => {
    ctx.fillStyle = 'rgb(128,128,255)';
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      ctx.fillStyle = 'rgb(150,128,255)';
      ctx.fillRect(0, y, 128, 5);
      ctx.fillStyle = 'rgb(106,128,255)';
      ctx.fillRect(0, y + 8, 128, 5);
    }
  });
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/**
 * Sugar-palm crown: a dense rosette of arching fronds with a cluster of
 * nuts under it. The trunk is a separate instanced cylinder, so this texture
 * is the crown only (drawn on crossed planes).
 */
function makePalmAlpha(): THREE.CanvasTexture {
  const tex = makeCanvas(256, 256, (ctx) => {
    ctx.clearRect(0, 0, 256, 256);
    const cx = 128;
    const cy = 112;
    // Fronds: a dense rosette of arching blades that droop at the tips.
    const fronds = 16;
    for (let i = 0; i < fronds; i += 1) {
      const a = (i / fronds) * Math.PI * 2 + 0.12;
      const dx = Math.cos(a);
      const dy = Math.sin(a) * 0.58;
      const len = 82 + ((i * 41) % 30);
      ctx.strokeStyle = i % 3 === 0 ? '#46603a' : i % 3 === 1 ? '#38512e' : '#54703f';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(
        cx + dx * len * 0.5,
        cy + dy * len * 0.5 - 30,
        cx + dx * len,
        cy + dy * len + 34
      );
      ctx.stroke();
    }
    // A second, shorter inner ring fills the centre so the crown reads as a
    // solid mass instead of a spider.
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2 + 0.5;
      const dx = Math.cos(a);
      const dy = Math.sin(a) * 0.5;
      ctx.strokeStyle = i % 2 === 0 ? '#4d6740' : '#3d5732';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(
        cx + dx * 40,
        cy + dy * 40 - 18,
        cx + dx * 62,
        cy + dy * 62 + 20
      );
      ctx.stroke();
    }
    // Crown boss.
    ctx.fillStyle = '#3a5230';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 24, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    // Sugar-palm nuts.
    ctx.fillStyle = '#6f5c38';
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 17, cy + 17 + Math.sin(a) * 8, 6.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Grass tuft: a fan of blades on transparent background. */
function makeGrassAlpha(): THREE.CanvasTexture {
  const tex = makeCanvas(64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    for (let i = 0; i < 14; i += 1) {
      const x0 = 12 + (i % 7) * 6;
      const lean = ((i * 37) % 21) - 10;
      const h = 34 + ((i * 53) % 26);
      ctx.strokeStyle = i % 2 === 0 ? '#6c7f47' : '#596b3c';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, 64);
      ctx.quadraticCurveTo(x0 + lean * 0.4, 64 - h * 0.6, x0 + lean, 64 - h);
      ctx.stroke();
    }
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Lotus pad: a notched disc with a radial vein pattern. */
function makeLotusAlpha(): THREE.CanvasTexture {
  const tex = makeCanvas(128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#4c6b3a';
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.arc(64, 64, 58, 0.32, Math.PI * 2 + 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5e7f46';
    ctx.lineWidth = 3;
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(64, 64);
      ctx.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56);
      ctx.stroke();
    }
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft noise for ground mist (one octave value noise, deterministic). */
function makeMistAlpha(): THREE.CanvasTexture {
  let s = 0x9e3779b9;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const tex = makeCanvas(256, 64, (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0)';
    ctx.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * 256;
      const y = 20 + rnd() * 40;
      const r = 3 + rnd() * 10;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = 0.05 + rnd() * 0.09;
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return tex;
}

/** Bird silhouette: a shallow "m" stroke, dark, no animation frames. */
function makeBirdAlpha(): THREE.CanvasTexture {
  const tex = makeCanvas(64, 32, (ctx) => {
    ctx.clearRect(0, 0, 64, 32);
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(6, 12);
    ctx.quadraticCurveTo(20, 2, 32, 14);
    ctx.quadraticCurveTo(44, 2, 58, 12);
    ctx.stroke();
  });
  return tex;
}

// ---------------------------------------------------------------------------
// Textures / materials (loaded once)
// ---------------------------------------------------------------------------

interface AngkorMaps {
  wallDiff: THREE.Texture; wallNor: THREE.Texture; wallRough: THREE.Texture;
  blockDiff: THREE.Texture; blockNor: THREE.Texture; blockRough: THREE.Texture;
  blockFineDiff: THREE.Texture; blockFineNor: THREE.Texture; blockFineRough: THREE.Texture;
  mossDiff: THREE.Texture; mossNor: THREE.Texture; mossRough: THREE.Texture;
  earthDiff: THREE.Texture; earthNor: THREE.Texture; earthRough: THREE.Texture;
  barkDiff: THREE.Texture; barkNor: THREE.Texture; barkRough: THREE.Texture;
}

const useTex = (name: string, repeat: [number, number], srgb = false): THREE.Texture => {
  const t = useLoader(THREE.TextureLoader, B(`textures/${name}`));
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const useInstanced = (count: number, place: (dummy: THREE.Object3D, i: number) => void) => {
  const ref = React.useRef<THREE.InstancedMesh>(null);
  React.useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      place(dummy, i);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count]); // layout is static; frame-pure
  return ref;
};

// ---------------------------------------------------------------------------
// Prang (lotus-bud tower)
// ---------------------------------------------------------------------------

/**
 * A Khmer prang: a stepped square plinth, a tapering shaft broken by
 * projecting cornice bands, a lotus-bud crown and a finial.
 *
 * The cornice bands are what make it read as a *tower*: without them the
 * shaft is a smooth pyramid. The upper third uses the lighter stone so the
 * silhouette separates from the weathered base.
 */
const Prang: React.FC<{
  position: Vec3;
  height: number;
  radius: number;
  mats: AngkorMaps;
  draft?: boolean;
}> = ({ position, height, radius, mats, draft = false }) => {
  const bodyMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: mats.blockDiff,
        normalMap: draft ? null : mats.blockNor,
        roughnessMap: mats.blockRough,
        color: '#8c8578',
        roughness: 0.97,
        metalness: 0,
      }),
    [mats, draft]
  );
  const upperMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: mats.wallDiff,
        normalMap: draft ? null : mats.wallNor,
        roughnessMap: mats.wallRough,
        color: '#a49c8d',
        roughness: 0.95,
        metalness: 0,
      }),
    [mats, draft]
  );
  const mossMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: mats.mossDiff,
        normalMap: draft ? null : mats.mossNor,
        roughnessMap: mats.mossRough,
        color: '#67744f',
        roughness: 1,
        metalness: 0,
      }),
    [mats, draft]
  );

  const SEGMENTS = 6;
  const plinthH = height * 0.1;
  const bodyH = height * 0.56;
  const budH = height * 0.28;
  const finialH = height * 0.06;
  const segH = bodyH / SEGMENTS;

  // Segment i: half-width shrinks linearly (a tapered square shaft).
  const segHalf = (i: number) => radius * (1 - 0.42 * (i / SEGMENTS));

  const budProfile = React.useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const steps = 13;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      // Lotus-bud silhouette: a slow swell, then a tight point.
      const r = Math.sin(Math.PI * Math.pow(t, 0.62)) * 0.44 + 0.015;
      pts.push(new THREE.Vector2(Math.max(0.02, r * radius * 1.05), t * budH));
    }
    return pts;
  }, [budH, radius]);

  const corniceH = Math.max(0.14, height * 0.022);

  return (
    <group position={position}>
      {/* Stepped plinth */}
      {[0, 1].map((i) => (
        <mesh
          key={`plinth${i}`}
          position={[0, plinthH * (i + 0.5), 0]}
          castShadow
          receiveShadow
          material={i === 0 ? mossMat : bodyMat}
          renderOrder={20 + i}
        >
          <boxGeometry args={[radius * 2 * (1.45 - i * 0.22), plinthH, radius * 2 * (1.45 - i * 0.22)]} />
        </mesh>
      ))}
      {/* Tapered shaft: stacked square courses */}
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const half = segHalf(i);
        const y = plinthH * 2 + segH * (i + 0.5);
        return (
          <mesh
            key={`seg${i}`}
            position={[0, y, 0]}
            castShadow
            receiveShadow
            material={i >= 4 ? upperMat : bodyMat}
            renderOrder={30 + i}
          >
            <boxGeometry args={[half * 2, segH, half * 2]} />
          </mesh>
        );
      })}
      {/* Projecting cornice bands — the horizontal rhythm that reads as a tower */}
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const half = segHalf(i);
        const y = plinthH * 2 + segH * (i + 1);
        return (
          <mesh
            key={`corn${i}`}
            position={[0, y + corniceH / 2, 0]}
            castShadow
            receiveShadow
            material={i >= 3 ? upperMat : bodyMat}
            renderOrder={36 + i}
          >
            <boxGeometry args={[half * 2 + radius * 0.42, corniceH, half * 2 + radius * 0.42]} />
          </mesh>
        );
      })}
      {/* Transition ring above the shaft */}
      <mesh position={[0, plinthH * 2 + bodyH + corniceH * 0.6, 0]} castShadow material={upperMat} renderOrder={44}>
        <cylinderGeometry args={[radius * 0.72, radius * 0.86, height * 0.035, 12]} />
      </mesh>
      {/* Lotus-bud crown */}
      <mesh
        position={[0, plinthH * 2 + bodyH + corniceH * 0.6 + height * 0.017, 0]}
        castShadow
        material={upperMat}
        renderOrder={45}
      >
        <latheGeometry args={[budProfile, 12]} />
      </mesh>
      {/* Finial */}
      <mesh
        position={[0, plinthH * 2 + bodyH + budH + height * 0.05, 0]}
        castShadow
        material={upperMat}
        renderOrder={46}
      >
        <coneGeometry args={[radius * 0.14, finialH, 8]} />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// Naga balustrade
// ---------------------------------------------------------------------------

/** One hooded naga head: a flared cobra hood, a head and a short neck. */
const NagaHood: React.FC<{ position: Vec3; scale: number; mat: THREE.Material }> = ({
  position,
  scale,
  mat,
}) => (
  <group position={position} scale={scale}>
    {/* Hood: a flattened, flared cone that widens upward — the silhouette of
        a cobra with its hood spread, not a ball on a stick. */}
    <mesh position={[0, 0.85, -0.05]} rotation={[0.12, 0, 0]} castShadow material={mat} renderOrder={52}>
      <coneGeometry args={[0.72, 1.5, 9, 1, true]} />
    </mesh>
    <mesh position={[0, 0.85, -0.06]} rotation={[0.12, 0, 0]} castShadow material={mat} renderOrder={52}>
      <coneGeometry args={[0.5, 1.2, 9]} />
    </mesh>
    {/* Head + neck */}
    <mesh position={[0, 1.02, 0.34]} castShadow material={mat} renderOrder={53}>
      <sphereGeometry args={[0.22, 8, 6]} />
    </mesh>
    <mesh position={[0, 0.62, 0.2]} castShadow material={mat} renderOrder={54}>
      <cylinderGeometry args={[0.14, 0.24, 0.62, 8]} />
    </mesh>
  </group>
);

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

export const AngkorWorld: React.FC<{ quality?: 'draft' | 'final' }> = ({ quality }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const layout = React.useMemo(() => buildAngkorLayout(), []);
  // Draft mode: drop normal maps (they are the priciest fragment work).
  const draft = quality === 'draft';

  const maps: AngkorMaps = {
    // The wall's relief registers must repeat often enough to read as carved
    // stone at wall scale (a band every ~1.3 m), not as horizontal planking.
    wallDiff: useTex('old_sandstone_02_diff_1k.jpg', [7, 3.2], true),
    wallNor: useTex('old_sandstone_02_nor_gl_1k.jpg', [7, 3.2]),
    wallRough: useTex('old_sandstone_02_rough_1k.jpg', [7, 3.2]),
    // Block courses must be roughly square on the masonry, otherwise the
    // horizontal courses stretch into planks. Two repeats are needed: one
    // for the big masses (terrace, roofs) and one for the small pieces
    // (pilasters, gopura jambs), because a single repeat cannot serve both
    // a 7 m tall jamb and a 5 m wide roof slab.
    blockDiff: useTex('large_sandstone_blocks_01_diff_1k.jpg', [3, 2], true),
    blockNor: useTex('large_sandstone_blocks_01_nor_gl_1k.jpg', [3, 2]),
    blockRough: useTex('large_sandstone_blocks_01_rough_1k.jpg', [3, 2]),
    blockFineDiff: useTex('large_sandstone_blocks_01_diff_1k.jpg', [8, 8], true),
    blockFineNor: useTex('large_sandstone_blocks_01_nor_gl_1k.jpg', [8, 8]),
    blockFineRough: useTex('large_sandstone_blocks_01_rough_1k.jpg', [8, 8]),
    mossDiff: useTex('mossy_sandstone_diff_1k.jpg', [3, 1.2], true),
    mossNor: useTex('mossy_sandstone_nor_gl_1k.jpg', [3, 1.2]),
    mossRough: useTex('mossy_sandstone_rough_1k.jpg', [3, 1.2]),
    earthDiff: useTex('dry_ground_01_diff_1k.jpg', [40, 40], true),
    earthNor: useTex('dry_ground_01_nor_gl_1k.jpg', [40, 40]),
    earthRough: useTex('dry_ground_01_rough_1k.jpg', [40, 40]),
    barkDiff: useTex('palm_bark_diff_1k.jpg', [1, 3], true),
    barkNor: useTex('palm_bark_nor_gl_1k.jpg', [1, 3]),
    barkRough: useTex('palm_bark_rough_1k.jpg', [1, 3]),
  };

  const basRelief = React.useMemo(() => makeBasReliefBump(), []);
  const ripple = React.useMemo(() => makeRippleNormal(), []);
  const palmAlpha = React.useMemo(() => makePalmAlpha(), []);
  const grassAlpha = React.useMemo(() => makeGrassAlpha(), []);
  const lotusAlpha = React.useMemo(() => makeLotusAlpha(), []);
  const mistAlpha = React.useMemo(() => makeMistAlpha(), []);
  const birdAlpha = React.useMemo(() => makeBirdAlpha(), []);

  // Frame-driven: water ripple scroll and mist drift are pure functions of t.
  ripple.offset.set((t * 0.012) % 1, (t * 0.03) % 1);

  // --- Materials ------------------------------------------------------------
  // Round 4 palette: the sandstone is desaturated toward grey-brown and the
  // tiers separate by VALUE (weathered base / lighter upper courses) rather
  // than by hue, which is how the real monument reads through the jungle.
  const waterMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        // Dark, slightly reflective water. A near-mirror (metalness 0.9,
        // roughness 0.05) turns the moat into a strip of white sky at the
        // grazing angle the wide shot sees it from — it has to stay DARK.
        color: '#16262a',
        metalness: 0.35,
        roughness: 0.3,
        normalMap: ripple,
        normalScale: new THREE.Vector2(0.6, 0.6),
        transparent: true,
        opacity: 0.97,
        envMapIntensity: 0.5,
      }),
    [ripple]
  );

  const groundMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: maps.earthDiff,
        normalMap: draft ? null : maps.earthNor,
        roughnessMap: maps.earthRough,
        color: '#ab9d80',
        roughness: 1,
        metalness: 0,
      }),
    [maps, draft]
  );

  const lateriteMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: maps.blockDiff,
        normalMap: draft ? null : maps.blockNor,
        roughnessMap: maps.blockRough,
        color: '#ab9c86',
        roughness: 1,
        metalness: 0,
      }),
    [maps, draft]
  );

  const stoneLowerMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: maps.wallDiff,
        normalMap: draft ? null : maps.wallNor,
        roughnessMap: maps.wallRough,
        bumpMap: draft ? null : basRelief,
        bumpScale: 3.4,
        color: '#82837b',
        roughness: 0.98,
        metalness: 0,
      }),
    [maps, basRelief, draft]
  );

  const stoneUpperMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: maps.wallDiff,
        normalMap: draft ? null : maps.wallNor,
        roughnessMap: maps.wallRough,
        color: '#9d9d94',
        roughness: 0.94,
        metalness: 0,
      }),
    [maps, draft]
  );

  const blockMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: maps.blockDiff,
        normalMap: draft ? null : maps.blockNor,
        roughnessMap: maps.blockRough,
        color: '#8a877e',
        roughness: 1,
        metalness: 0,
      }),
    [maps, draft]
  );

  /** Fine-coursed stone for small pieces (pilasters, jambs, treads). */
  const blockFineMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: maps.blockFineDiff,
        normalMap: draft ? null : maps.blockFineNor,
        roughnessMap: maps.blockFineRough,
        color: '#8a877e',
        roughness: 1,
        metalness: 0,
      }),
    [maps, draft]
  );

  const mossMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: maps.mossDiff,
        normalMap: draft ? null : maps.mossNor,
        roughnessMap: maps.mossRough,
        color: '#66744e',
        roughness: 1,
        metalness: 0,
      }),
    [maps, draft]
  );

  /** The shadowed gallery interior behind the colonnade. */
  const recessMat = React.useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#241f1a', roughness: 1, metalness: 0 }),
    []
  );

  const trunkMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: maps.barkDiff,
        normalMap: draft ? null : maps.barkNor,
        roughnessMap: maps.barkRough,
        color: '#7d7161',
        roughness: 1,
        metalness: 0,
      }),
    [maps, draft]
  );

  const canopyMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: palmAlpha,
        transparent: true,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        color: '#4a6440',
        roughness: 1,
      }),
    [palmAlpha]
  );

  const lotusMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: lotusAlpha,
        transparent: true,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
        color: '#6d8a52',
        roughness: 0.85,
      }),
    [lotusAlpha]
  );

  const grassMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: grassAlpha,
        transparent: true,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
        color: '#8b9a63',
        roughness: 1,
      }),
    [grassAlpha]
  );

  const birdMat = React.useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: birdAlpha,
        transparent: true,
        alphaTest: 0.3,
        color: '#191919',
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [birdAlpha]
  );

  // --- Instanced meshes -----------------------------------------------------
  const columnGeo = React.useMemo(() => new THREE.CylinderGeometry(0.42, 0.5, 4.2, 8), []);
  const columnsRef = useInstanced(layout.colonnades.length, (d, i) => {
    const c = layout.colonnades[i];
    d.position.set(c.position[0], c.position[1], c.position[2]);
    d.rotation.set(0, c.rotationY, 0);
    d.scale.set(c.scale, c.scale, c.scale);
  });

  const stairGeo = React.useMemo(() => new THREE.BoxGeometry(5.4, 0.34, 0.54), []);
  const stairsRef = useInstanced(layout.stairs.length, (d, i) => {
    const c = layout.stairs[i];
    d.position.set(c.position[0], c.position[1], c.position[2]);
    d.rotation.set(0, 0, 0);
    d.scale.setScalar(1);
  });

  const lotusGeo = React.useMemo(() => new THREE.PlaneGeometry(1.5, 1.5), []);
  const lotusRef = useInstanced(layout.lotus.length, (d, i) => {
    const c = layout.lotus[i];
    d.position.set(c.position[0], c.position[1], c.position[2]);
    d.rotation.set(-Math.PI / 2, 0, c.rotationY);
    d.scale.setScalar(c.scale);
  });

  // Trees: mid-ground palms + the dense forest line behind the monument.
  const trees = React.useMemo(() => [...layout.palms, ...layout.forest], [layout]);
  const trunkGeo = React.useMemo(() => new THREE.CylinderGeometry(0.15, 0.28, 7.6, 6), []);
  const trunksRef = useInstanced(trees.length, (d, i) => {
    const c = trees[i];
    d.position.set(c.position[0], 3.8 * c.scale, c.position[2]);
    d.rotation.set(0, c.rotationY, 0);
    d.scale.set(c.scale, c.scale, c.scale);
  });
  const canopyGeo = React.useMemo(() => {
    const p1 = new THREE.PlaneGeometry(6.2, 5.4);
    const p2 = p1.clone().rotateY(Math.PI / 2);
    return mergeGeometries([p1, p2])!;
  }, []);
  const canopyRef = useInstanced(trees.length, (d, i) => {
    const c = trees[i];
    d.position.set(c.position[0], (7.6 + 1.1) * c.scale, c.position[2]);
    d.rotation.set(0, c.rotationY, 0);
    d.scale.setScalar(c.scale);
  });

  // Grass tufts (instanced cross-planes) over the dry earth.
  const grassGeo = React.useMemo(() => {
    const p1 = new THREE.PlaneGeometry(1.1, 1.1);
    const p2 = p1.clone().rotateY(Math.PI / 2);
    return mergeGeometries([p1, p2])!;
  }, []);
  const grassRef = useInstanced(layout.grass.length, (d, i) => {
    const c = layout.grass[i];
    d.position.set(c.position[0], 0.5 * c.scale, c.position[2]);
    d.rotation.set(0, c.rotationY, 0);
    d.scale.setScalar(c.scale);
  });

  // --- Naga balustrade ------------------------------------------------------
  // A continuous serpent rail: a straight stone plinth with the naga's
  // undulating body riding on top of it. (A chain of boxes under a waving
  // tube read as a plaited rope at close range — the plinth is a single
  // strip, the tube is the only thing that moves.)
  const nagaGeometries = React.useMemo(() => {
    const tubes: THREE.BufferGeometry[] = [];
    const plinths: THREE.BufferGeometry[] = [];
    for (const rail of layout.nagaRails) {
      const path = nagaRailPath(rail, 72);
      const pts = path.map((p) => new THREE.Vector3(rail.x, p.y, p.z));
      const curve = new THREE.CatmullRomCurve3(pts);
      tubes.push(new THREE.TubeGeometry(curve, 96, 0.15, 6, false));
      // One straight plinth strip per rail.
      const length = Math.abs(rail.z1 - rail.z0);
      const g = new THREE.BoxGeometry(0.42, 0.3, length);
      g.translate(rail.x, rail.y - 0.27, (rail.z0 + rail.z1) / 2);
      plinths.push(g);
    }
    return {
      tube: mergeGeometries(tubes)!,
      plinth: mergeGeometries(plinths)!,
    };
  }, [layout]);

  // --- Frame-driven atmospherics -------------------------------------------
  // Deterministic bird paths (seeded by index, frame-pure).
  const birds = [0, 1, 2, 3, 4].map((i) => {
    const speed = 3.1 + (i % 3) * 0.8;
    const x = -52 + ((t * speed + i * 23.7) % 104);
    const y = 28 + Math.sin(i * 2.3) * 4.5 + Math.sin(t * 0.7 + i) * 0.6;
    const z = -34 - i * 7;
    return { x, y, z, i };
  });

  // Mist planes drift slowly; opacity breathes on a slow sine (frame-pure).
  const mist = [0, 1, 2, 3].map((i) => {
    const x = Math.sin(t * 0.11 + i * 1.7) * 7 + (i - 1.5) * 11;
    const y = 0.9 + i * 0.45;
    const z = -12 - i * 4.2;
    const opacity = 0.5 + 0.28 * Math.sin(t * 0.23 + i * 2.1);
    return { x, y, z, opacity, i };
  });

  return (
    <>
      {/* Dry earth forest floor — built as four pieces with the moat cut OUT.
          A single ground plane would bury the water: the moat surface sits
          0.3 m below grade, so the plane has to have a hole in it. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, (MOAT_FRONT_Z + 210) / 2]}
        renderOrder={0}
        receiveShadow
        material={groundMat}
      >
        <planeGeometry args={[420, 210 - MOAT_FRONT_Z]} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, (-210 + MOAT_BACK_Z) / 2]}
        renderOrder={0}
        receiveShadow
        material={groundMat}
      >
        <planeGeometry args={[420, MOAT_BACK_Z + 210]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[s * (MOAT_WIDTH_X / 2 + (210 - MOAT_WIDTH_X / 2) / 2), 0, (MOAT_FRONT_Z + MOAT_BACK_Z) / 2]}
          renderOrder={0}
          receiveShadow
          material={groundMat}
        >
          <planeGeometry args={[210 - MOAT_WIDTH_X / 2, MOAT_FRONT_Z - MOAT_BACK_Z]} />
        </mesh>
      ))}
      {/* Grass tufts scattered over the earth */}
      <instancedMesh args={[grassGeo, grassMat, layout.grass.length]} ref={grassRef} renderOrder={1} />

      {/* Approach path: flush laterite the characters stand on */}
      <mesh position={layout.causewayPath.position} renderOrder={2} receiveShadow material={lateriteMat}>
        <boxGeometry args={layout.causewayPath.size} />
      </mesh>

      {/* Bridge segment raised over the moat */}
      <mesh position={layout.causewayBridge.position} renderOrder={2} castShadow receiveShadow material={lateriteMat}>
        <boxGeometry args={layout.causewayBridge.size} />
      </mesh>

      {/* Moat: dark water + cut banks */}
      <mesh position={layout.water.position} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} material={waterMat}>
        <planeGeometry args={layout.water.size} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[
            0,
            0.02 - MOAT_DEPTH / 2,
            layout.water.position[2] + (s * layout.water.size[1]) / 2
          ]}
          renderOrder={2}
          receiveShadow
          material={lateriteMat}
        >
          <boxGeometry args={[layout.water.size[0], MOAT_DEPTH, 0.9]} />
        </mesh>
      ))}
      {/* Lotus pads floating on the moat */}
      <instancedMesh args={[lotusGeo, lotusMat, layout.lotus.length]} ref={lotusRef} renderOrder={12} />

      {/* Great outer wall with the central gopura */}
      <mesh position={[layout.wall.position[0], layout.wall.position[1], layout.wall.position[2]]} renderOrder={3} castShadow receiveShadow material={stoneLowerMat}>
        <boxGeometry args={[layout.wall.length, layout.wall.height, layout.wall.thickness]} />
      </mesh>
      {/* Coping course: a lighter projecting band that breaks the wall's flat
          top edge (a 92 m blank wall reads as a painted backdrop). */}
      <mesh position={[0, layout.wall.height + 0.16, layout.wall.position[2]]} renderOrder={3} castShadow material={stoneUpperMat}>
        <boxGeometry args={[layout.wall.length + 0.5, 0.32, layout.wall.thickness + 0.5]} />
      </mesh>
      {/* Buttress pilasters: the wall's rhythm at 50 m, where the carved
          relief of the bump map is already sub-pixel. */}
      {Array.from({ length: 15 }, (_, i) => -45 + i * 6.15)
        .filter((x) => Math.abs(x) > 5.6)
        .map((x) => (
          <mesh key={`pil${x}`} position={[x, layout.wall.height / 2, layout.wall.position[2] + layout.wall.thickness / 2 + 0.18]} renderOrder={3} castShadow receiveShadow material={blockFineMat}>
            <boxGeometry args={[1.3, layout.wall.height, 0.5]} />
          </mesh>
        ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (layout.wall.length / 2), 2.2, -18]} renderOrder={3} castShadow material={blockMat}>
          <boxGeometry args={[3.0, 4.4, 2.6]} />
        </mesh>
      ))}

      {/* --- Gopura: a real recessed doorway (jambs + lintel + columns) --- */}
      {(() => {
        const g = layout.gopura;
        const [gw, gh, gd] = g.size;
        const openW = 4.4;
        const openH = 4.7;
        const jambW = (gw - openW) / 2;
        const frontZ = g.position[2] + gd / 2;
        return (
          <group>
            {/* left + right jambs */}
            {[-1, 1].map((s) => (
              <mesh
                key={s}
                position={[s * (openW / 2 + jambW / 2), g.position[1], g.position[2]]}
                renderOrder={4}
                castShadow
                receiveShadow
                material={blockFineMat}
              >
                <boxGeometry args={[jambW, gh, gd]} />
              </mesh>
            ))}
            {/* lintel block over the opening */}
            <mesh
              position={[0, openH + (gh - openH) / 2, g.position[2]]}
              renderOrder={4}
              castShadow
              receiveShadow
              material={blockFineMat}
            >
              <boxGeometry args={[gw, gh - openH, gd]} />
            </mesh>
            {/* dark interior behind the opening */}
            <mesh position={[0, openH / 2, g.position[2] - 0.4]} renderOrder={4}>
              <boxGeometry args={[openW - 0.1, openH, 0.5]} />
              <meshStandardMaterial color="#1d1913" roughness={1} />
            </mesh>
            {/* projecting lintel slab + flanking columns */}
            <mesh position={[0, openH + 0.25, frontZ - 0.25]} renderOrder={5} castShadow material={stoneUpperMat}>
              <boxGeometry args={[openW + 1.3, 0.5, 1.1]} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * (openW / 2 + 0.45), openH / 2, frontZ - 0.3]} renderOrder={5} castShadow material={stoneUpperMat}>
                <cylinderGeometry args={[0.38, 0.44, openH, 10]} />
              </mesh>
            ))}
            {/* cornice + tiered cap */}
            <mesh position={[0, gh + 0.35, g.position[2]]} renderOrder={5} castShadow material={stoneUpperMat}>
              <boxGeometry args={[gw + 1.0, 0.7, gd + 1.0]} />
            </mesh>
            <mesh position={[0, gh + 1.15, g.position[2]]} renderOrder={5} castShadow material={stoneUpperMat}>
              <boxGeometry args={[gw * 0.7, 0.9, gd * 0.7]} />
            </mesh>
          </group>
        );
      })()}

      {/* Laterite terrace */}
      <mesh position={layout.terrace.position} renderOrder={2} castShadow receiveShadow material={lateriteMat}>
        <boxGeometry args={layout.terrace.size} />
      </mesh>

      {/* --- Three gallery tiers: open colonnade + shadowed gallery + roof --- */}
      {layout.tiers.map((tier, i) => {
        const [w, h, d] = tier.size;
        const recessW = w - GALLERY_RECESS_M * 2;
        const recessD = d - GALLERY_RECESS_M * 2;
        const recessH = tier.colonnade + 0.8;
        return (
          <group key={i}>
            {/* shadowed gallery interior behind the columns */}
            <mesh
              position={[0, tier.floor + recessH / 2, GALLERY_Z]}
              renderOrder={5 + i}
              receiveShadow
              material={recessMat}
            >
              <boxGeometry args={[recessW, recessH, recessD]} />
            </mesh>
            {/* mossy course at the foot of each tier */}
            <mesh position={[0, tier.floor + 0.3, GALLERY_Z]} renderOrder={5 + i} material={mossMat}>
              <boxGeometry args={[w + 0.3, 0.6, d + 0.3]} />
            </mesh>
            {/* corniced roof slab (the tier above stands on it) */}
            <mesh
              position={[0, tier.floor + tier.colonnade + tier.roof / 2, GALLERY_Z]}
              renderOrder={5 + i}
              castShadow
              receiveShadow
              material={i >= 1 ? stoneUpperMat : stoneLowerMat}
            >
              <boxGeometry args={[w, tier.roof, d]} />
            </mesh>
            {/* projecting cornice lip on the roof edge */}
            <mesh
              position={[0, tier.floor + tier.colonnade + tier.roof - 0.18, GALLERY_Z]}
              renderOrder={5 + i}
              castShadow
              material={stoneUpperMat}
            >
              <boxGeometry args={[w + 0.8, 0.36, d + 0.8]} />
            </mesh>
          </group>
        );
      })}

      {/* Five prangs, quincunx — the central one dominates */}
      {layout.prangs.map((p) => (
        <Prang key={p.id} position={p.position} height={p.height} radius={p.radius} mats={maps} draft={draft} />
      ))}

      {/* Colonnades (instanced) */}
      <instancedMesh args={[columnGeo, blockMat, layout.colonnades.length]} ref={columnsRef} renderOrder={9} castShadow receiveShadow />
      {/* Stair treads (instanced) */}
      <instancedMesh args={[stairGeo, blockFineMat, layout.stairs.length]} ref={stairsRef} renderOrder={8} castShadow receiveShadow />

      {/* Naga balustrade: continuous serpent rail + hooded heads */}
      <mesh geometry={nagaGeometries.plinth} renderOrder={50} castShadow receiveShadow material={blockMat} />
      <mesh geometry={nagaGeometries.tube} renderOrder={51} castShadow material={stoneUpperMat} />
      {layout.nagaHoods.map((h, i) => (
        <NagaHood key={i} position={h.position} scale={h.scale} mat={mossMat} />
      ))}

      {/* Tropical forest: mid-ground palms + dense forest line behind */}
      <instancedMesh args={[trunkGeo, trunkMat, trees.length]} ref={trunksRef} renderOrder={10} castShadow />
      <instancedMesh args={[canopyGeo, canopyMat, trees.length]} ref={canopyRef} renderOrder={11} />

      {/* Ground mist: 4 drifting noise planes */}
      {mist.map((m) => (
        <mesh key={m.i} position={[m.x, m.y, m.z]} renderOrder={20}>
          <planeGeometry args={[30, 6.5]} />
          <meshBasicMaterial map={mistAlpha} transparent opacity={m.opacity * 0.5} depthWrite={false} color="#e8ddc8" />
        </mesh>
      ))}

      {/* Birds (seeded, frame-driven) */}
      {birds.map((b) => (
        <mesh key={b.i} position={[b.x, b.y, b.z]} rotation={[0, Math.PI / 2.6, 0]}>
          <planeGeometry args={[2.1, 1.05]} />
          <meshBasicMaterial map={birdAlpha} transparent alphaTest={0.3} depthWrite={false} color="#191919" />
        </mesh>
      ))}
    </>
  );
};
