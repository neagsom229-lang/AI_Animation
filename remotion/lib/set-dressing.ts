/**
 * @fileoverview Pure, deterministic set-dressing (prop placement) for the
 * Phase C 3D worlds.
 *
 * Every layout here is a pure function of its inputs: calling `buildWorld()`
 * twice returns deeply identical results — no `Math.random()`, no wall-clock,
 * no scene state (the Phase 1 contract). Pseudo-random scatter comes from
 * `mulberry32()` with a fixed seed, so the same story always renders the
 * same forest.
 *
 * Placements are authored against the measured bounding boxes of the shipped
 * Kenney GLBs; `tests/scene.test.js` re-measures every model from disk and
 * enforces the bounds (scatter below 5.5 units, nothing inside the temple /
 * pond / camera corridors).
 *
 * Model paths are written as full string literals on purpose so that
 * `tests/assets.test.js` picks every one of them up and verifies the file
 * exists and has a CREDITS.md entry.
 * @module remotion/lib/set-dressing
 */

import { mulberry32 } from './randomness.ts';

export type Vec3 = [number, number, number];

export type PropGroup = 'temple' | 'pond' | 'scatter';

export interface PropPlacement {
  /** Repo-root-relative GLB path (literal — scanned by tests/assets.test.js). */
  model: string;
  position: Vec3;
  /** Yaw in radians. */
  rotationY: number;
  scale: number;
  /** Which subsystem placed it (tests apply per-group rules). */
  group: PropGroup;
}

export interface WorldLayout {
  name: string;
  /** Stone platform the temple stands on (rendered as a textured box). */
  platform: { size: Vec3; position: Vec3; textureRepeat: [number, number] };
  /** Pond surface (rendered as a plane). */
  water: { position: Vec3; size: [number, number] };
  /** Soft sun glow behind the temple (additive sprite). */
  glow: { position: Vec3; scale: number; color: string; opacity: number };
  props: PropPlacement[];
}

export const KNOWN_WORLDS = ['khmer-temple'];

/** Kenney kit pieces are authored at ~1 unit; the temple uses 2x for human scale. */
const TEMPLE_SCALE = 2;

// ---------------------------------------------------------------------------
// World: khmer-temple
// ---------------------------------------------------------------------------

/**
 * Hardcoded temple layout (all coordinates in metres, +z toward the camera).
 *
 *  - platform: 16 x 1.4 x 11 box centred at [0, 0.7, -16.5]
 *    (footprint x ∈ [-8, 8], z ∈ [-22, -11], top at y = 1.4)
 *  - stairs climb from the ground (z = -11.8) to the platform top
 *  - back wall at z = -21, side walls at x = ±7, entrance pillars in front
 *  - a five-piece tower rises to ~12 m at [0, ·, -19]
 *  - a pond sits to the left at [-11, 0, 2]
 */
function khmerTemple(): WorldLayout {
  const props: PropPlacement[] = [];
  /**
   * Elevated pieces are sunk 2 cm into whatever they stand on. Exactly
   * coplanar faces (a wall's underside flush with the platform top) make the
   * shadow-map depth test tie, and the winner can flip between runs — that
   * showed up as 8 drifting edge pixels on the temple. A small overlap makes
   * the depth order unambiguous.
   */
  const EMBED = 0.02;
  const add = (
    model: string,
    position: Vec3,
    scale: number,
    rotationY = 0,
    group: PropGroup = 'temple'
  ) => {
    const y = position[1] > 0.5 ? position[1] - EMBED : position[1];
    props.push({ model, position: [position[0], y, position[2]], rotationY, scale, group });
  };

  // --- platform + stairs ---------------------------------------------------
  // Stairs: the piece is only 0.2 wide, so it is tiled 8x into a 3.2 m stair.
  for (let i = 0; i < 8; i++) {
    const x = -1.4 + i * 0.4;
    add('public/models/props/kenney-castle-stairs-stone.glb', [x, 0, -11.8], TEMPLE_SCALE);
  }

  // Gate posts flanking the stair approach (ground level).
  add('public/models/props/kenney-castle-gate.glb', [-2.8, 0, -9.4], 2.2);
  add('public/models/props/kenney-castle-gate.glb', [2.8, 0, -9.4], 2.2, Math.PI);

  // Back wall (z = -21): doorway pair in the middle, walls out to x = ±6.
  add('public/models/props/kenney-castle-wall-doorway.glb', [-0.5, 1.4, -21], TEMPLE_SCALE);
  add('public/models/props/kenney-castle-wall-doorway.glb', [0.5, 1.4, -21], TEMPLE_SCALE, Math.PI);
  for (const x of [-6, -4, -2, 2, 4, 6]) {
    add('public/models/props/kenney-castle-wall.glb', [x, 1.4, -21], TEMPLE_SCALE);
  }

  // Side walls (x = ±7) and the front corners that close them off.
  for (const side of [-1, 1]) {
    for (const z of [-19, -17, -15]) {
      add(
        'public/models/props/kenney-castle-wall.glb',
        [side * 7, 1.4, z],
        TEMPLE_SCALE,
        Math.PI / 2
      );
    }
    add('public/models/props/kenney-castle-wall-corner.glb', [side * 7, 1.4, -13], TEMPLE_SCALE);
    // Entrance pillars flanking the top of the stairs.
    add('public/models/props/kenney-castle-wall-pillar.glb', [side * 2.4, 1.4, -12.2], TEMPLE_SCALE);
  }

  // Tower: base/mid/mid/top/roof stacked to ~12 m.
  add('public/models/props/kenney-castle-tower-square-base.glb', [0, 1.4, -19], TEMPLE_SCALE);
  add('public/models/props/kenney-castle-tower-square-mid.glb', [0, 3.4, -19], TEMPLE_SCALE);
  add('public/models/props/kenney-castle-tower-square-mid.glb', [0, 5.4, -19], TEMPLE_SCALE);
  add('public/models/props/kenney-castle-tower-square-top.glb', [0, 7.4, -19], TEMPLE_SCALE);
  add('public/models/props/kenney-castle-tower-square-roof.glb', [0, 8.0, -19], TEMPLE_SCALE);

  // Statues on the platform: two standing columns + a head on a broken plinth.
  add('public/models/props/kenney-nature-statue_column.glb', [-4.5, 1.4, -14], TEMPLE_SCALE);
  add('public/models/props/kenney-nature-statue_column.glb', [4.5, 1.4, -14], TEMPLE_SCALE, Math.PI);
  add('public/models/props/kenney-nature-statue_columnDamaged.glb', [0, 1.4, -13.6], TEMPLE_SCALE);
  add('public/models/props/kenney-nature-statue_head.glb', [0, 2.8, -13.6], 1.4);

  // --- ground-level ruins around the temple --------------------------------
  add('public/models/props/kenney-nature-cliff_steps_stone.glb', [-9.5, 0, -8.5], 1.5, 0.4);
  add('public/models/props/kenney-nature-cliff_steps_stone.glb', [9.2, 0, -7.0], 1.5, -0.7);
  add('public/models/props/kenney-castle-rocks-large.glb', [8.5, 0, -10.5], 1.4, 0.9);
  add('public/models/props/kenney-castle-rocks-small.glb', [-8.8, 0, -11.5], 1.4, -0.3);

  // Stone path from the characters to the stair.
  for (const z of [-2.5, -4.5, -6.5, -8.5]) {
    add('public/models/props/kenney-nature-path_stone.glb', [0, 0.01, z], 1.4, 0, 'temple');
  }

  // --- pond at [-11, 0, 2] -------------------------------------------------
  const pondTiles: Vec3[] = [];
  for (const x of [-13, -11, -9]) {
    // Raised to y = 0.06 so the tile tops (local +0.05) form a visible
    // riverbed rim 0.09 above the water — at y = -0.05 the whole tile field
    // sat below the ground plane and was invisible.
    for (const z of [0, 2, 4]) pondTiles.push([x, 0.06, z]);
  }
  for (const p of pondTiles) {
    add('public/models/props/kenney-nature-ground_riverTile.glb', p, 2, 0, 'pond');
  }
  add('public/models/props/kenney-nature-lily_large.glb', [-12.4, 0.05, 1.0], 1.6, 0.3, 'pond');
  add('public/models/props/kenney-nature-lily_large.glb', [-10.2, 0.05, 3.2], 1.6, -0.8, 'pond');
  add('public/models/props/kenney-nature-lily_large.glb', [-11.8, 0.05, 4.0], 1.6, 1.7, 'pond');
  add('public/models/props/kenney-nature-bridge_stone.glb', [-11, 0, 6.2], 2.2, 0, 'pond');
  add('public/models/props/kenney-nature-rock_largeA.glb', [-14.8, 0, -0.8], 1.6, 0.5, 'pond');
  add('public/models/props/kenney-nature-stone_largeB.glb', [-7.6, 0, 4.8], 1.5, -0.6, 'pond');
  add('public/models/props/kenney-nature-rock_smallC.glb', [-14.2, 0, 5.2], 1.4, 1.1, 'pond');
  add('public/models/props/kenney-nature-plant_bushLarge.glb', [-15.2, 0, 3.0], 1.5, 0.2, 'pond');
  add('public/models/props/kenney-nature-grass_large.glb', [-7.4, 0, 0.5], 2, 0, 'pond');
  add('public/models/props/kenney-nature-grass_large.glb', [-13.6, 0, 6.2], 2, 1.2, 'pond');

  return {
    name: 'khmer-temple',
    platform: {
      size: [16, 1.4, 11],
      position: [0, 0.7, -16.5],
      textureRepeat: [6, 2]
    },
    // Sits inside the 6x6 tile field, below the riverbed rim.
    water: { position: [-11, 0.02, 2], size: [5.4, 5.4] },
    glow: { position: [0, 9, -55], scale: 14, color: '#ffd9a0', opacity: 0.35 },
    props
  };
}

// ---------------------------------------------------------------------------
// Seeded scatter (trees / rocks / undergrowth around the set)
// ---------------------------------------------------------------------------

/** Fixed seed → the same forest in every process, on every machine. */
export const SCATTER_SEED = 0x51ea5e1;
export const SCATTER_COUNT = 46;

/** Radius band the scatter may occupy (metres from the world origin). */
export const SCATTER_RADIUS: [number, number] = [8, 42];

interface ScatterKind {
  model: string;
  minScale: number;
  maxScale: number;
  /** Relative frequency. */
  weight: number;
}

/**
 * Pool of scatter models with their scale ranges. Measured heights (units at
 * scale 1) are listed so the test can prove everything stays below the
 * 5.5-unit ceiling imposed by the orbit camera (y = 6).
 */
const SCATTER_POOL: ScatterKind[] = [
  { model: 'public/models/props/kenney-nature-tree_oak.glb', minScale: 1.4, maxScale: 2.2, weight: 3 },
  { model: 'public/models/props/kenney-nature-tree_detailed.glb', minScale: 1.4, maxScale: 2.2, weight: 3 },
  { model: 'public/models/props/kenney-nature-tree_palm.glb', minScale: 1.3, maxScale: 2.0, weight: 2 },
  { model: 'public/models/props/kenney-nature-tree_palmTall.glb', minScale: 1.3, maxScale: 2.0, weight: 2 },
  { model: 'public/models/props/kenney-castle-tree-large.glb', minScale: 1.2, maxScale: 1.8, weight: 2 },
  { model: 'public/models/props/kenney-castle-tree-small.glb', minScale: 1.3, maxScale: 2.0, weight: 2 },
  { model: 'public/models/props/kenney-nature-rock_largeA.glb', minScale: 1.2, maxScale: 2.4, weight: 3 },
  { model: 'public/models/props/kenney-nature-stone_largeB.glb', minScale: 1.2, maxScale: 2.4, weight: 3 },
  { model: 'public/models/props/kenney-castle-rocks-large.glb', minScale: 1.2, maxScale: 2.2, weight: 2 },
  { model: 'public/models/props/kenney-castle-rocks-small.glb', minScale: 1.2, maxScale: 2.2, weight: 2 },
  { model: 'public/models/props/kenney-nature-rock_smallC.glb', minScale: 1.5, maxScale: 3.0, weight: 2 },
  { model: 'public/models/props/kenney-nature-grass_large.glb', minScale: 1.8, maxScale: 3.2, weight: 4 },
  { model: 'public/models/props/kenney-nature-plant_bushLarge.glb', minScale: 1.6, maxScale: 3.0, weight: 4 },
  { model: 'public/models/props/kenney-nature-statue_columnDamaged.glb', minScale: 1.2, maxScale: 2.0, weight: 1 },
  { model: 'public/models/props/kenney-nature-cliff_steps_stone.glb', minScale: 1.2, maxScale: 2.0, weight: 1 }
];

/**
 * Keep-out rules for the seeded scatter.
 *
 *  - temple footprint + apron (so the set never clips through the building),
 *  - pond footprint + apron,
 *  - the sight corridor down the middle (dolly / static / handheld cameras),
 *  - the orbit lane (the orbit rig travels at radius 12 — a tree there would
 *    put the camera inside the trunk).
 *
 * Pure function of (x, z).
 */
export function isScatterExcluded(x: number, z: number): boolean {
  if (x >= -10 && x <= 10 && z >= -24 && z <= -9) return true; // temple
  if (x >= -16.5 && x <= -5.5 && z >= -1.5 && z <= 7.5) return true; // pond
  if (Math.abs(x) < 5 && z > -1) return true; // sight corridor
  const r = Math.hypot(x, z);
  if (r >= 11 && r <= 14.5) return true; // orbit lane
  return false;
}

/**
 * Seeded scatter ring around the set. Pure function of the seed and count:
 * identical inputs → identical placements, forever.
 */
export function scatterProps(
  seed: number = SCATTER_SEED,
  count: number = SCATTER_COUNT
): PropPlacement[] {
  const rng = mulberry32(seed);
  const totalWeight = SCATTER_POOL.reduce((sum, k) => sum + k.weight, 0);
  const out: PropPlacement[] = [];
  let attempts = 0;

  while (out.length < count && attempts < 4000) {
    attempts += 1;
    const angle = rng() * Math.PI * 2;
    const radius = SCATTER_RADIUS[0] + rng() * (SCATTER_RADIUS[1] - SCATTER_RADIUS[0]);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isScatterExcluded(x, z)) continue;

    // Weighted pick from the pool.
    let roll = rng() * totalWeight;
    let kind = SCATTER_POOL[SCATTER_POOL.length - 1];
    for (const k of SCATTER_POOL) {
      roll -= k.weight;
      if (roll <= 0) {
        kind = k;
        break;
      }
    }

    const scale = kind.minScale + rng() * (kind.maxScale - kind.minScale);
    out.push({
      model: kind.model,
      position: [x, 0, z],
      rotationY: rng() * Math.PI * 2,
      scale,
      group: 'scatter'
    });
  }

  if (out.length < count) {
    throw new Error(
      `scatterProps: only placed ${out.length}/${count} props — check the keep-out rules.`
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Build the full layout for a named world.
 *
 * @throws {Error} When the world name is unknown — deliberately loud, there
 *   is no silent substitute world.
 */
export function buildWorld(name: string): WorldLayout {
  switch (name) {
    case 'khmer-temple': {
      const layout = khmerTemple();
      return { ...layout, props: [...layout.props, ...scatterProps()] };
    }
    default:
      throw new Error(
        `Unknown world "${name}". Known worlds: ${KNOWN_WORLDS.join(', ')}.`
      );
  }
}
