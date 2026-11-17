/**
 * @fileoverview Procedural Angkor Wat layout (Round 4 — human-scaled).
 *
 * Everything is computed from the constants below plus seeded scatters — no
 * `Math.random`, no wall-clock, identical on every render of every frame
 * (the Phase 1 contract). This module is deliberately THREE-free so the
 * layout can be unit-tested in pure node (see tests/angkor.test.js): the
 * renderer (compositions/AngkorWorld.tsx) maps these numbers onto meshes.
 *
 * SCALE (Round 4): the monument is sized from the human, not the other way
 * round. The film's figures are 1.70 m; the outer gallery's colonnade is
 * 4.2 m (≈2.5× a person) and the central prang tops out at 37.5 m
 * (≈22× a person). The central prang is exactly 3× the corner prangs, which
 * is what makes the silhouette read as Angkor Wat instead of a stepped
 * pyramid: the eye needs one dominant vertical, not five equal ones.
 *
 * Axes: +z toward the camera, x to the right. The temple complex is centred
 * on x = 0; the characters stand at z ∈ [-1, +2] on the causeway approach.
 * @module remotion/lib/angkor
 */

import { mulberry32 } from './randomness.ts';

export type Vec3 = [number, number, number];

// ---------------------------------------------------------------------------
// Scale reference
// ---------------------------------------------------------------------------

/** The film's human scale reference (metres). Every size derives from it. */
export const HUMAN_HEIGHT_M = 1.7;

// ---------------------------------------------------------------------------
// Ground axis plan (metres)
// ---------------------------------------------------------------------------

/** Water moat: a full-width channel across the site, z ∈ [MOAT_FRONT_Z, MOAT_BACK_Z]. */
export const MOAT_FRONT_Z = -3;
export const MOAT_BACK_Z = -17;
export const MOAT_WIDTH_X = 260;
/** Water surface height (below the bank lip, so the moat reads as a cut). */
export const MOAT_WATER_Y = -0.3;
/** How far the bank walls drop below the water surface. */
export const MOAT_DEPTH = 1.3;

/** Laterite terrace the temple stands on (top == outer-gallery floor). */
export const TERRACE = { size: [58, 2.4, 38] as Vec3, position: [0, 1.2, -46] as Vec3 };

/** Centre-z of the gallery stack (the temple's spine). */
export const GALLERY_Z = -44;

/**
 * Nested gallery tiers: bottom → top.
 *
 * Each tier is a *colonnade*, not a solid box: `colonnade` metres of open
 * column rhythm in front of a recessed (shadowed) gallery wall, capped by a
 * `roof` slab that reads as the cornice of the tier below. `size[1]` is the
 * total tier height (colonnade + roof).
 */
export const TIERS = [
  { size: [46, 5.7, 27] as Vec3, floor: 2.4, colonnade: 4.2, roof: 1.5, name: 'outer gallery' },
  { size: [32, 5.2, 18.5] as Vec3, floor: 8.1, colonnade: 3.8, roof: 1.4, name: 'middle gallery' },
  { size: [19.5, 4.7, 11.5] as Vec3, floor: 13.3, colonnade: 3.4, roof: 1.3, name: 'inner gallery' },
] as const;

/** Top surface of the innermost gallery — the prangs stand here. */
export const INNER_ROOF_Y = TIERS[TIERS.length - 1].floor + TIERS[TIERS.length - 1].size[1];

/**
 * Five prangs in a quincunx on the inner gallery roof.
 *
 * The central prang is exactly 3× the corner prangs in height (and 1.7× in
 * radius) — that ratio is the difference between "Angkor Wat" and "brown
 * pyramid".
 */
export const PRANGS = [
  { id: 'central', position: [0, INNER_ROOF_Y, GALLERY_Z] as Vec3, height: 19.5, radius: 3.4 },
  { id: 'nw', position: [-6.3, INNER_ROOF_Y, GALLERY_Z - 3.3] as Vec3, height: 6.5, radius: 2.0 },
  { id: 'ne', position: [6.3, INNER_ROOF_Y, GALLERY_Z - 3.3] as Vec3, height: 6.5, radius: 2.0 },
  { id: 'sw', position: [-6.3, INNER_ROOF_Y, GALLERY_Z + 3.3] as Vec3, height: 6.5, radius: 2.0 },
  { id: 'se', position: [6.3, INNER_ROOF_Y, GALLERY_Z + 3.3] as Vec3, height: 6.5, radius: 2.0 },
] as const;

/** Total apex height of the central prang (m). */
export const CENTRAL_PRANG_APEX_M = PRANGS[0].position[1] + PRANGS[0].height;

/** Ratio between the central prang and the corner prangs (Round 4 target: 3). */
export const CENTRAL_TO_CORNER_RATIO = PRANGS[0].height / PRANGS[1].height;

/** West gopura (entrance pavilion) astride the causeway axis. */
export const GOPURA = { size: [9.5, 7.2, 7] as Vec3, position: [0, 3.6, -18] as Vec3 };

/** Perimeter enclosure wall: x ∈ [-46, 46], from the gopura back to the terrace. */
export const WALL = { length: 92, height: 3.4, thickness: 1.4, position: [0, 1.7, -18] as Vec3 };
/** Spacing of the wall's buttress pilasters (m) — they give the long wall
 *  a rhythm that reads at 50 m, where the carved relief cannot. */
export const WALL_PILASTER_SPACING_M = 6.15;

/** Causeway: flush approach path (characters stand on it at y≈0) plus the
 *  raised bridge segment over the moat. */
export const CAUSEWAY_PATH = { size: [4.6, 0.08, 44] as Vec3, position: [0, 0.04, 19] as Vec3 };
export const CAUSEWAY_BRIDGE = { size: [4.6, 1.0, 14] as Vec3, position: [0, 0.5, -10] as Vec3 };
export const CAUSEWAY_LENGTH_M = CAUSEWAY_PATH.size[2] + CAUSEWAY_BRIDGE.size[2];

/** Naga balustrade: a continuous serpent rail flanking the causeway. */
export interface NagaRail { x: number; z0: number; z1: number; y: number }
export const NAGA_RAILS: NagaRail[] = [
  // Bridge segment — the rail rides the raised deck (deck top at y = 1.0).
  { x: -2.1, z0: -16.4, z1: -3.6, y: 1.37 },
  { x: 2.1, z0: -16.4, z1: -3.6, y: 1.37 },
  // Approach segment — flush with the path (path top at y = 0.08).
  { x: -2.1, z0: -2.4, z1: 40.0, y: 0.45 },
  { x: 2.1, z0: -2.4, z1: 40.0, y: 0.45 },
];
/** How many undulations the serpent rail makes along its length. */
export const NAGA_RAIL_WAVES = 12;
/** Vertical amplitude of the rail's undulation (m). */
export const NAGA_RAIL_AMPLITUDE = 0.07;

/** Number of hooded naga heads that terminate the balustrade. */
export const NAGA_HOOD_COUNT = 5;
/** How far the hood cluster sits from the far end of the bridge rail. */
export const NAGA_HOOD_Z = -15.6;

/** West stair up the terrace to the outer gallery (10 corbelled steps). */
export const STAIR = { width: 5.4, steps: 10, startZ: -22.0, rise: 0.24, run: 0.5 };

/** Colonnade rhythm: bay width (m) for gallery colonnades. */
export const COLUMN_SPACING_M = 2.0;

/** Inset of the recessed gallery wall behind the colonnade (m). */
export const GALLERY_RECESS_M = 1.9;

// ---------------------------------------------------------------------------
// Instanced palms (tropical forest)
// ---------------------------------------------------------------------------

export const PALM_SEED = 0xa4c0de11;
export const PALM_COUNT = 88;

/** Forest floor band around the complex; camera corridor is kept clear. */
export const PALM_RING: [number, number] = [36, 66];
/** Centre of the palm ring (the temple's spine, not the world origin). */
export const PALM_CENTRE_Z = -42;
/** Half-width of the clear corridor in front of the monument (camera side). */
export const PALM_CORRIDOR_X = 15;
/** Palms closer to the camera than this are dropped (they would fill frame). */
export const PALM_NEAR_Z = -16;

/** Dense forest line behind the temple (the "jungle" the monument sits in). */
export const FOREST_SEED = 0x0f0e57;
export const FOREST_COUNT = 240;
export const FOREST_BAND: { z0: number; z1: number; halfWidth: number } = {
  z0: -80,
  z1: -165,
  halfWidth: 165,
};

// ---------------------------------------------------------------------------
// Lotus pads on the moat
// ---------------------------------------------------------------------------

export const LOTUS_SEED = 0x10405;
export const LOTUS_COUNT = 54;

// ---------------------------------------------------------------------------
// Derived instanced transforms (pure; unit-test friendly)
// ---------------------------------------------------------------------------

export interface InstanceTransform { position: Vec3; rotationY: number; scale: number }

/**
 * Perimeter columns for the galleries (instanced). Columns stand on the
 * gallery floor and are as tall as the colonnade, so the gallery reads as an
 * open rhythm of shafts with a shadowed wall behind it.
 */
export function colonnadeTransforms(): InstanceTransform[] {
  const out: InstanceTransform[] = [];
  for (const tier of TIERS) {
    const [w, , d] = tier.size;
    const y = tier.floor;
    const height = tier.colonnade;
    const inset = 0.35;
    const hx = w / 2 - inset;
    const hz = d / 2 - inset;
    const xs: Array<[number, number]> = [];
    for (let x = -hx; x <= hx + 1e-6; x += COLUMN_SPACING_M) xs.push([x, hz]);
    for (let x = -hx; x <= hx + 1e-6; x += COLUMN_SPACING_M) xs.push([x, -hz]);
    for (let z = -hz; z <= hz + 1e-6; z += COLUMN_SPACING_M) xs.push([-hx, z]);
    for (let z = -hz; z <= hz + 1e-6; z += COLUMN_SPACING_M) xs.push([hx, z]);
    for (const [x, zOff] of xs) {
      out.push({
        position: [x, y + height / 2, GALLERY_Z + zOff],
        rotationY: 0,
        scale: height / 4.2,
      });
    }
  }
  return out;
}

/** Stair tread transforms for the west stair (instanced boxes). */
export function stairTransforms(): InstanceTransform[] {
  const out: InstanceTransform[] = [];
  for (let i = 0; i < STAIR.steps; i++) {
    out.push({
      position: [
        0,
        i * STAIR.rise + STAIR.rise / 2,
        STAIR.startZ - i * STAIR.run,
      ],
      rotationY: 0,
      scale: 1,
    });
  }
  return out;
}

/**
 * Naga hood transforms: the multi-headed serpent that terminates the
 * balustrade. One big central hood plus two flanking pairs, fanned out
 * along the rail so the cluster reads as a hooded cobra rather than a
 * row of spikes.
 */
export function nagaHoodTransforms(): InstanceTransform[] {
  const out: InstanceTransform[] = [];
  for (const side of [-1, 1]) {
    const railX = side * NAGA_RAILS[0].x;
    const railY = NAGA_RAILS[0].y;
    // Central hood, on the rail's own axis.
    out.push({ position: [railX, railY - 0.08, NAGA_HOOD_Z], rotationY: 0, scale: 1 });
    // Two flanking pairs, fanning back along the rail.
    const flanks = [
      { dx: 0.78, dz: 0.85, scale: 0.8 },
      { dx: 1.34, dz: 1.62, scale: 0.62 },
    ];
    for (const flank of flanks) {
      for (const s of [-1, 1]) {
        out.push({
          position: [railX + s * flank.dx, railY - 0.12, NAGA_HOOD_Z + flank.dz],
          rotationY: 0,
          scale: flank.scale,
        });
      }
    }
  }
  return out;
}

/**
 * Centreline of a naga rail: a continuous undulating serpent, sampled
 * uniformly along z. The renderer sweeps a tube/box along this path so the
 * balustrade reads as one continuous body instead of a row of spikes.
 */
export function nagaRailPath(rail: NagaRail, samples = 64): Array<{ z: number; y: number }> {
  const out: Array<{ z: number; y: number }> = [];
  const span = rail.z1 - rail.z0;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const z = rail.z0 + span * t;
    const phase = t * NAGA_RAIL_WAVES * Math.PI * 2;
    // Amplitude tapers to zero at the far end so the rail settles into the
    // hood cluster instead of ending mid-wave.
    const taper = 1 - 0.55 * Math.pow(t, 3);
    out.push({ z, y: rail.y + Math.sin(phase) * NAGA_RAIL_AMPLITUDE * taper });
  }
  return out;
}

/** Seeded palm transforms around the complex; camera sight-corridor kept clear. */
export function palmTransforms(): InstanceTransform[] {
  const rng = mulberry32(PALM_SEED);
  const out: InstanceTransform[] = [];
  let attempts = 0;
  while (out.length < PALM_COUNT && attempts < 9000) {
    attempts += 1;
    const angle = rng() * Math.PI * 2;
    const radius = PALM_RING[0] + rng() * (PALM_RING[1] - PALM_RING[0]);
    const x = Math.cos(angle) * radius;
    const z = PALM_CENTRE_Z + Math.sin(angle) * radius;
    // Keep the west view corridor and the moat open for the camera.
    if (Math.abs(x) < PALM_CORRIDOR_X && z > PALM_NEAR_Z) continue;
    if (z > MOAT_FRONT_Z && z < MOAT_BACK_Z && Math.abs(x) < MOAT_WIDTH_X / 2) continue;
    out.push({
      position: [x, 0, z],
      rotationY: rng() * Math.PI * 2,
      scale: 0.85 + rng() * 0.85,
    });
  }
  if (out.length < PALM_COUNT) {
    throw new Error(`palmTransforms: only placed ${out.length}/${PALM_COUNT} palms`);
  }
  return out;
}

/** Dry grass tufts scattered over the earth (the ground must not read as mud). */
export const GRASS_SEED = 0x9a5511;
export const GRASS_COUNT = 620;

/**
 * Seeded grass tufts. They fill the dry earth with green so the ground
 * reads as a savanna floor rather than a brick-red slab.
 */
export function grassTransforms(): InstanceTransform[] {
  const rng = mulberry32(GRASS_SEED);
  const out: InstanceTransform[] = [];
  let attempts = 0;
  while (out.length < GRASS_COUNT && attempts < 20000) {
    attempts += 1;
    const x = (rng() * 2 - 1) * 78;
    const z = -78 + rng() * 128;
    // Keep the causeway, the moat and the temple terrace clear.
    if (Math.abs(x) < 3.4 && z > -25) continue;
    if (z < MOAT_BACK_Z && z > MOAT_FRONT_Z) continue;
    if (z < -26 && Math.abs(x) < 30) continue;
    out.push({
      position: [x, 0, z],
      rotationY: rng() * Math.PI * 2,
      scale: 0.7 + rng() * 0.9,
    });
  }
  if (out.length < GRASS_COUNT) {
    throw new Error(`grassTransforms: only placed ${out.length}/${GRASS_COUNT} tufts`);
  }
  return out;
}

/**
 * The dense forest line behind the temple — the jungle the monument was
 * reclaimed from. Without it the temple stands against bare sky and reads
 * as a model on a table.
 */
export function forestTransforms(): InstanceTransform[] {
  const rng = mulberry32(FOREST_SEED);
  const out: InstanceTransform[] = [];
  let attempts = 0;
  while (out.length < FOREST_COUNT && attempts < 12000) {
    attempts += 1;
    const x = (rng() * 2 - 1) * FOREST_BAND.halfWidth;
    const z = FOREST_BAND.z0 + rng() * (FOREST_BAND.z1 - FOREST_BAND.z0);
    // Keep the axial corridor behind the temple readable (the prangs are the
    // subject; a tree in front of the central tower would kill the
    // silhouette).
    if (Math.abs(x) < 9 && z > -95) continue;
    out.push({
      position: [x, 0, z],
      rotationY: rng() * Math.PI * 2,
      scale: 1.0 + rng() * 1.5,
    });
  }
  if (out.length < FOREST_COUNT) {
    throw new Error(`forestTransforms: only placed ${out.length}/${FOREST_COUNT} trees`);
  }
  return out;
}

/** Seeded lotus pads floating on the moat. */
export function lotusTransforms(): InstanceTransform[] {
  const rng = mulberry32(LOTUS_SEED);
  const out: InstanceTransform[] = [];
  let attempts = 0;
  while (out.length < LOTUS_COUNT && attempts < 6000) {
    attempts += 1;
    const x = (rng() * 2 - 1) * (MOAT_WIDTH_X / 2 - 4);
    // Between the far bank (MOAT_BACK_Z) and the near bank (MOAT_FRONT_Z),
    // keeping 1.5 m clear of each lip.
    const z =
      MOAT_BACK_Z + 1.5 + rng() * (MOAT_FRONT_Z - MOAT_BACK_Z - 3);
    // Keep the causeway bridge clear.
    if (Math.abs(x) < 3.6) continue;
    out.push({
      position: [x, MOAT_WATER_Y + 0.04, z],
      rotationY: rng() * Math.PI * 2,
      scale: 0.55 + rng() * 0.85,
    });
  }
  if (out.length < LOTUS_COUNT) {
    throw new Error(`lotusTransforms: only placed ${out.length}/${LOTUS_COUNT} pads`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Layout invariants (unit-tested)
// ---------------------------------------------------------------------------

export interface AngkorLayout {
  terrace: typeof TERRACE;
  tiers: typeof TIERS;
  prangs: typeof PRANGS;
  gopura: typeof GOPURA;
  wall: typeof WALL;
  causewayPath: typeof CAUSEWAY_PATH;
  causewayBridge: typeof CAUSEWAY_BRIDGE;
  causewayLengthM: number;
  nagaRails: typeof NAGA_RAILS;
  stair: typeof STAIR;
  water: { position: Vec3; size: [number, number] };
  colonnades: InstanceTransform[];
  palms: InstanceTransform[];
  forest: InstanceTransform[];
  grass: InstanceTransform[];
  lotus: InstanceTransform[];
  stairs: InstanceTransform[];
  nagaHoods: InstanceTransform[];
}

/** Build the complete layout; deterministic. */
export function buildAngkorLayout(): AngkorLayout {
  return {
    terrace: TERRACE,
    tiers: TIERS,
    prangs: PRANGS,
    gopura: GOPURA,
    wall: WALL,
    causewayPath: CAUSEWAY_PATH,
    causewayBridge: CAUSEWAY_BRIDGE,
    causewayLengthM: CAUSEWAY_LENGTH_M,
    nagaRails: NAGA_RAILS,
    stair: STAIR,
    water: {
      position: [0, MOAT_WATER_Y, (MOAT_FRONT_Z + MOAT_BACK_Z) / 2],
      // NOTE: the depth MUST be positive — a negative PlaneGeometry dimension
      // renders the water as a back-face and the moat vanishes.
      size: [MOAT_WIDTH_X, MOAT_FRONT_Z - MOAT_BACK_Z],
    },
    colonnades: colonnadeTransforms(),
    palms: palmTransforms(),
    forest: forestTransforms(),
    grass: grassTransforms(),
    lotus: lotusTransforms(),
    stairs: stairTransforms(),
    nagaHoods: nagaHoodTransforms(),
  };
}
