/**
 * @fileoverview The Angkor Wat set (Phase 2): moat + causeway + gopura + three
 * gallery tiers + five lotus-bud prangs + instanced colonnades/palms, built
 * entirely from the pure layout in remotion/lib/angkor.ts.
 *
 * Determinism: everything static is derived from the layout module; the only
 * frame-driven motion is (a) the water ripple normal scroll and (b) the mist
 * drift and (c) the birds â€” all pure functions of `useCurrentFrame()`.
 * No Math.random, no wall-clock, no useFrame.
 *
 * Performance: columns, stair treads, naga finials and palms are
 * `<instancedMesh>` â€” the whole set is a few dozen draw calls.
 * @module remotion/compositions/AngkorWorld
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig, staticFile } from 'remotion';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  buildAngkorLayout,
  type Vec3,
  CENTRAL_PRANG_APEX_M,
} from '../lib/angkor.ts';

const B = (staticFile as (p: string) => string);

/** One-off canvases (bas-relief bump + palm silhouette + ripple normal). */
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
 * Procedural bas-relief band: a row of rosette faces between vertical
 * fluting â€” read from a distance as a carved tympanum, not as noise.
 */
function makeBasReliefBump(): THREE.CanvasTexture {
  return makeCanvas(512, 64, (ctx) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 64);
    // Fluting
    for (let x = 0; x < 512; x += 32) {
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(x, 4, 3, 56);
      ctx.fillStyle = '#a8a8a8';
      ctx.fillRect(x + 3, 4, 2, 56);
    }
    // Rosette faces
    for (let x = 16; x < 512; x += 64) {
      const g = ctx.createRadialGradient(x, 32, 2, x, 32, 13);
      g.addColorStop(0, '#b4b4b4');
      g.addColorStop(0.55, '#8f8f8f');
      g.addColorStop(1, '#4f4f4f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, 32, 13, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      // brow line + two eye dots
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(x - 6, 27, 12, 2);
      ctx.beginPath(); ctx.ellipse(x - 4.5, 32, 1.8, 1.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 4.5, 32, 1.8, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Top + bottom border rails
    ctx.fillStyle = '#b9b9b9';
    ctx.fillRect(0, 0, 512, 5);
    ctx.fillRect(0, 59, 512, 5);
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

/** Palm silhouette: a dome of drooping fronds + light trunk gap for cut-outs. */
function makePalmAlpha(): THREE.CanvasTexture {
  const tex = makeCanvas(128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    const cx = 64;
    const top = 26;
    // Fronds: 9 arcing strokes from the crown in two tones (seeded by index).
    const fronds = [
      [-58, 26], [-45, 14], [-28, 6], [-12, 1], [0, -1], [12, 1], [28, 6], [45, 14], [58, 26],
    ];
    fronds.forEach(([dx, dy], i) => {
      ctx.strokeStyle = i % 2 === 0 ? '#3a5232' : '#4a6040';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, top + 18);
      ctx.quadraticCurveTo(cx + dx * 0.55, top + 18 + dy * 0.25, cx + dx, top + 30 + dy);
      ctx.stroke();
    });
    // Crown dome
    ctx.fillStyle = '#33492f';
    ctx.beginPath();
    ctx.ellipse(cx, top + 22, 15, 10, 0, 0, Math.PI * 2);
    ctx.fill();
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
  mossDiff: THREE.Texture; mossNor: THREE.Texture; mossRough: THREE.Texture;
  grassDiff: THREE.Texture; grassNor: THREE.Texture; grassRough: THREE.Texture;
  lateriteDiff: THREE.Texture; lateriteNor: THREE.Texture; lateriteRough: THREE.Texture;
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

const Prang: React.FC<{ position: Vec3; height: number; radius: number; mats: AngkorMaps; draft?: boolean }> = ({
  position,
  height,
  radius,
  mats,
  draft = false,
}) => {
  const corbelMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: mats.mossDiff,
        normalMap: draft ? null : mats.mossNor,
        roughnessMap: mats.mossRough,
        color: '#8e867a',
        roughness: 1,
        bumpMap: draft ? null : mats.mossNor,
        bumpScale: 0.02,
      }),
    [mats]
  );
  const bodyMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: mats.wallDiff,
        normalMap: draft ? null : mats.wallNor,
        roughnessMap: mats.wallRough,
        color: '#857a6a',
        roughness: 0.95,
      }),
    [mats]
  );
  // Corbelled slabs (5 rings, square plan, alternating rotation), then a
  // tapered shaft, then the lotus bud lathe.
  const rings = [1.0, 0.78, 0.58, 0.42, 0.3];
  const budProfile = React.useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const budH = height * 0.36;
    const steps = 11;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // lotus-bud silhouette: slow swell, tight point
      const r = Math.sin(Math.PI * Math.pow(t, 0.72)) * 0.42 + 0.02;
      pts.push(new THREE.Vector2(Math.max(0.02, r * radius * 1.15), t * budH));
    }
    return pts;
  }, [height, radius]);
  const slabH = height * 0.075;
  return (
    <group position={position}>
      {rings.map((s, i) => (
        <mesh
          key={i}
          position={[0, slabH * (i + 0.5), 0]}
          rotation={[0, (i % 2) * (Math.PI / 4), 0]}
          castShadow
          receiveShadow
          material={i >= 3 ? corbelMat : bodyMat}
          renderOrder={30 + i}
        >
          <boxGeometry args={[radius * 2 * s, slabH, radius * 2 * s]} />
        </mesh>
      ))}
      <mesh position={[0, height * 0.485, 0]} castShadow material={bodyMat} renderOrder={36}>
        <cylinderGeometry args={[radius * 0.52, radius * 0.68, height * 0.24, 10]} />
      </mesh>
      <mesh position={[0, height * 0.60, 0]} castShadow material={corbelMat} renderOrder={37}>
        <latheGeometry args={[budProfile, 12]} />
      </mesh>
      {/* finial */}
      <mesh position={[0, height * 0.99, 0]} castShadow material={corbelMat} renderOrder={38}>
        <coneGeometry args={[radius * 0.16, height * 0.09, 8]} />
      </mesh>
    </group>
  );
};

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
    wallDiff: useTex('old_sandstone_02_diff_1k.jpg', [4, 1.6], true),
    wallNor: useTex('old_sandstone_02_nor_gl_1k.jpg', [4, 1.6]),
    wallRough: useTex('old_sandstone_02_rough_1k.jpg', [4, 1.6]),
    blockDiff: useTex('large_sandstone_blocks_01_diff_1k.jpg', [5, 1.4], true),
    blockNor: useTex('large_sandstone_blocks_01_nor_gl_1k.jpg', [5, 1.4]),
    blockRough: useTex('large_sandstone_blocks_01_rough_1k.jpg', [5, 1.4]),
    mossDiff: useTex('mossy_sandstone_diff_1k.jpg', [3, 1.2], true),
    mossNor: useTex('mossy_sandstone_nor_gl_1k.jpg', [3, 1.2]),
    mossRough: useTex('mossy_sandstone_rough_1k.jpg', [3, 1.2]),
    grassDiff: useTex('grass_ground_diff_1k.jpg', [34, 34], true),
    grassNor: useTex('grass_ground_nor_gl_1k.jpg', [34, 34]),
    grassRough: useTex('grass_ground_rough_1k.jpg', [34, 34]),
    lateriteDiff: useTex('red_laterite_soil_stones_diff_1k.jpg', [5, 5], true),
    lateriteNor: useTex('red_laterite_soil_stones_nor_gl_1k.jpg', [5, 5]),
    lateriteRough: useTex('red_laterite_soil_stones_rough_1k.jpg', [5, 5]),
    barkDiff: useTex('palm_bark_diff_1k.jpg', [1, 3], true),
    barkNor: useTex('palm_bark_nor_gl_1k.jpg', [1, 3]),
    barkRough: useTex('palm_bark_rough_1k.jpg', [1, 3]),
  };

  const basRelief = React.useMemo(() => makeBasReliefBump(), []);
  const ripple = React.useMemo(() => makeRippleNormal(), []);
  const palmAlpha = React.useMemo(() => makePalmAlpha(), []);
  const mistAlpha = React.useMemo(() => makeMistAlpha(), []);
  const birdAlpha = React.useMemo(() => makeBirdAlpha(), []);

  // Frame-driven: water ripple scroll and mist drift are pure functions of t.
  ripple.offset.set((t * 0.012) % 1, (t * 0.03) % 1);
  const waterMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#26333a',
        metalness: 0.92,
        roughness: 0.06,
        normalMap: ripple,
        normalScale: new THREE.Vector2(0.32, 0.32),
        transparent: true,
        opacity: 0.97,
        envMapIntensity: 1.15,
      }),
    [ripple]
  );

  const groundMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: maps.grassDiff,
        normalMap: draft ? null : maps.grassNor,
        roughnessMap: maps.grassRough,
        color: '#49563e',
        roughness: 1,
        metalness: 0,
      }),
    [maps]
  );
  const lateriteMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: maps.lateriteDiff,
        normalMap: draft ? null : maps.lateriteNor,
        roughnessMap: maps.lateriteRough,
        color: '#bfb0a0',
        roughness: 1,
      }),
    [maps]
  );
  const blockMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: maps.blockDiff,
        normalMap: draft ? null : maps.blockNor,
        roughnessMap: maps.blockRough,
        color: '#8f867a',
        roughness: 1,
      }),
    [maps]
  );
  const wallMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: maps.wallDiff,
        normalMap: draft ? null : maps.wallNor,
        roughnessMap: maps.wallRough,
        bumpMap: draft ? null : basRelief,
        bumpScale: 2.6,
        color: '#8e867a',
        roughness: 0.98,
      }),
    [maps, basRelief]
  );
  const mossMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: maps.mossDiff,
        normalMap: draft ? null : maps.mossNor,
        roughnessMap: maps.mossRough,
        color: '#66744f',
        roughness: 1,
      }),
    [maps]
  );

  // Instanced meshes
  const columnGeo = React.useMemo(() => new THREE.CylinderGeometry(0.34, 0.42, 2.6, 8), []);
  const columnsRef = useInstanced(layout.colonnades.length, (d, i) => {
    const c = layout.colonnades[i];
    d.position.set(c.position[0], c.position[1], c.position[2]);
    d.rotation.set(0, c.rotationY, 0);
    d.scale.setScalar(c.scale);
  });

  const stairGeo = React.useMemo(() => new THREE.BoxGeometry(4.4, 0.34, 0.46), []);
  const stairsRef = useInstanced(layout.stairs.length, (d, i) => {
    const c = layout.stairs[i];
    d.position.set(c.position[0], c.position[1], c.position[2]);
    d.rotation.set(0, 0, 0);
    d.scale.setScalar(1);
  });

  const nagaGeo = React.useMemo(() => new THREE.ConeGeometry(0.22, 0.72, 6), []);
  const nagaRef = useInstanced(layout.nagas.length, (d, i) => {
    const c = layout.nagas[i];
    d.position.set(c.position[0], c.position[1], c.position[2]);
    d.rotation.set(0.35, 0, 0); // heads flick up the rails
    d.scale.setScalar(1);
  });

  const trunkGeo = React.useMemo(() => new THREE.CylinderGeometry(0.16, 0.26, 4.6, 7), []);
  const trunksRef = useInstanced(layout.palms.length, (d, i) => {
    const c = layout.palms[i];
    d.position.set(c.position[0], 2.3 * c.scale, c.position[2]);
    d.rotation.set(0, c.rotationY, 0);
    d.scale.setScalar(c.scale);
  });

  const canopyGeo = React.useMemo(() => {
    const p1 = new THREE.PlaneGeometry(4.4, 4.4);
    const p2 = p1.clone().rotateY(Math.PI / 2);
    return mergeGeometries([p1, p2])!;
  }, []);
  const canopyRef = useInstanced(layout.palms.length, (d, i) => {
    const c = layout.palms[i];
    d.position.set(c.position[0], 4.6 * c.scale, c.position[2]);
    d.rotation.set(0, c.rotationY, 0);
    d.scale.setScalar(c.scale);
  });
  const canopyMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: palmAlpha,
        transparent: true,
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        color: '#49623c',
        roughness: 1,
      }),
    [palmAlpha]
  );
  const trunkMat = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: maps.barkDiff,
        normalMap: draft ? null : maps.barkNor,
        roughnessMap: maps.barkRough,
        color: '#867768',
        roughness: 1,
      }),
    [maps]
  );

  const birdMat = React.useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: birdAlpha,
        transparent: true,
        alphaTest: 0.3,
        color: '#141414',
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [birdAlpha]
  );

  // Deterministic bird paths (seeded by index, frame-pure).
  const birds = [0, 1, 2, 3, 4].map((i) => {
    const seed = 0.173 + i * 0.131;
    const speed = 3.1 + (i % 3) * 0.8;
    const x = -46 + ((t * speed + i * 23.7) % 96);
    const y = 24 + Math.sin(i * 2.3) * 3.5 + Math.sin(t * 0.7 + i) * 0.6;
    const z = -30 - i * 6;
    void seed;
    return { x, y, z, i };
  });

  // Mist planes drift slowly; opacity breathes on a slow sine (frame-pure).
  const mist = [0, 1, 2, 3].map((i) => {
    const x = Math.sin(t * 0.11 + i * 1.7) * 6 + (i - 1.5) * 9;
    const y = 0.8 + i * 0.35;
    const z = -6 - i * 3.4;
    const opacity = 0.5 + 0.28 * Math.sin(t * 0.23 + i * 2.1);
    return { x, y, z, opacity, i };
  });

  return (
    <>
      {/* Forest floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={0} receiveShadow material={groundMat}>
        <planeGeometry args={[300, 300]} />
      </mesh>

      {/* Approach path: flush laterite the characters stand on */}
      <mesh position={layout.causewayPath.position} renderOrder={2} receiveShadow material={lateriteMat}>
        <boxGeometry args={layout.causewayPath.size} />
      </mesh>

      {/* Bridge segment raised over the moat */}
      <mesh position={layout.causewayBridge.position} renderOrder={2} castShadow receiveShadow material={lateriteMat}>
        <boxGeometry args={layout.causewayBridge.size} />
      </mesh>

      {/* Moat: water + laterite rim */}
      <mesh position={layout.water.position} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} material={waterMat}>
        <planeGeometry args={layout.water.size} />
      </mesh>
      {/* moat bank walls (dark laterite, not pale slabs) */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[0, 0.42, layout.water.position[2] + (s * layout.water.size[1]) / 2]}
          renderOrder={2}
          material={lateriteMat}
        >
          <boxGeometry args={[layout.water.size[0], 0.85, 0.9]} />
        </mesh>
      ))}

      {/* Great outer wall with the central gopura */}
      <mesh position={[layout.wall.position[0], layout.wall.position[1], layout.wall.position[2]]} renderOrder={3} castShadow receiveShadow material={wallMat}>
        <boxGeometry args={[layout.wall.length, layout.wall.height, layout.wall.thickness]} />
      </mesh>
      {/* wall end pavilions */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (layout.wall.length / 2), 2.1, -17.2]} renderOrder={3} castShadow material={blockMat}>
          <boxGeometry args={[2.6, 4.2, 2.2]} />
        </mesh>
      ))}
      {/* gopura (west entrance pavilion): corbelled cap + dark doorway recess */}
      <mesh position={layout.gopura.position} renderOrder={4} castShadow receiveShadow material={blockMat}>
        <boxGeometry args={layout.gopura.size} />
      </mesh>
      <mesh position={[layout.gopura.position[0], layout.gopura.position[1] + layout.gopura.size[1] / 2 + 0.45, layout.gopura.position[2]]} renderOrder={4} castShadow material={blockMat}>
        <boxGeometry args={[layout.gopura.size[0] * 0.82, 0.9, layout.gopura.size[2] * 0.82]} />
      </mesh>
      <mesh position={[layout.gopura.position[0], layout.gopura.position[1] + layout.gopura.size[1] / 2 + 1.35, layout.gopura.position[2]]} renderOrder={4} castShadow material={mossMat}>
        <boxGeometry args={[layout.gopura.size[0] * 0.55, 0.9, layout.gopura.size[2] * 0.55]} />
      </mesh>
      {/* doorway recess faces the camera (+z) */}
      <mesh position={[layout.gopura.position[0], 1.55, layout.gopura.position[2] + layout.gopura.size[2] / 2 + 0.06]} renderOrder={5}>
        <boxGeometry args={[2.5, 3.1, 0.24]} />
        <meshStandardMaterial color="#211a14" roughness={1} />
      </mesh>

      {/* Laterite terrace */}
      <mesh position={layout.terrace.position} renderOrder={2} castShadow receiveShadow material={lateriteMat}>
        <boxGeometry args={layout.terrace.size} />
      </mesh>

      {/* Three gallery tiers with bas-relief bands */}
      {layout.tiers.map((tier, i) => (
        <group key={i} position={[0, 0, -33]}>
          <mesh position={[0, tier.floor + tier.size[1] / 2, 0]} renderOrder={5 + i} castShadow receiveShadow material={wallMat}>
            <boxGeometry args={tier.size} />
          </mesh>
          {/* moss-soaked plinth course at each gallery foot */}
          <mesh position={[0, tier.floor + 0.35, 0]} renderOrder={5 + i} material={mossMat}>
            <boxGeometry args={[tier.size[0] + 0.35, 0.9, tier.size[2] + 0.35]} />
          </mesh>
        </group>
      ))}

      {/* Five prangs, quincunx */}
      {layout.prangs.map((p) => (
        <Prang key={p.id} position={p.position} height={p.height} radius={p.radius} mats={maps} draft={draft} />
      ))}

      {/* Colonnades (instanced) */}
      <instancedMesh args={[columnGeo, blockMat, layout.colonnades.length]} ref={columnsRef} renderOrder={9} castShadow receiveShadow />
      {/* Stair treads (instanced) */}
      <instancedMesh args={[stairGeo, blockMat, layout.stairs.length]} ref={stairsRef} renderOrder={8} castShadow receiveShadow />
      {/* Naga finials (instanced) */}
      <instancedMesh args={[nagaGeo, mossMat, layout.nagas.length]} ref={nagaRef} renderOrder={9} castShadow />

      {/* Tropical forest (instanced trunks + crossed canopies) */}
      <instancedMesh args={[trunkGeo, trunkMat, layout.palms.length]} ref={trunksRef} renderOrder={10} castShadow />
      <instancedMesh args={[canopyGeo, canopyMat, layout.palms.length]} ref={canopyRef} renderOrder={11} />

      {/* Ground mist: 4 drifting noise planes */}
      {mist.map((m) => (
        <mesh key={m.i} position={[m.x, m.y, m.z]} renderOrder={20}>
          <planeGeometry args={[26, 5.5]} />
          <meshBasicMaterial map={mistAlpha} transparent opacity={m.opacity * 0.55} depthWrite={false} color="#e8ddc8" />
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





