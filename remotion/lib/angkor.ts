/**
 * @fileoverview Procedural Angkor Wat layout (Phase 2).
 *
 * Everything is computed from the constants below plus one seeded scatter —
 * no `Math.random`, no wall-clock, identical on every render of every frame
 * (the Phase 1 contract). This module is deliberately THREE-free so the
 * layout can be unit-tested in pure node (see tests/angkor.test.js): the
 * renderer (compositions/AngkorWorld.tsx) maps these numbers onto meshes.
 *
 * Scale note: the real Angkor Wat central prang rises ~65 m. A literal 1:1
 * temple cannot share a frame with 1.7 m characters (the tower would fill
 * every wide shot wall-to-sky), so the vertical scale is condensed ~1:2.7 —
 * the massing, the quincunx, the three galleries and the moat/causeway
 * relationships are all true to the original. Humans are 1.7 m; the central
 * prang apex is ~24 m (~14× human height — monumental, still framed whole).
 *
 * Axes: +z toward the camera, x to the right. The temple complex is centred
 * on x = 0; the characters stand at z ∈ [-2, +2] in front of the causeway.
 * @module remotion/lib/angkor
 */

import { mulberry32 } from './randomness.ts';

export type Vec3 = [number, number, number];

// ---------------------------------------------------------------------------
// Ground axis plan (metres)
// ---------------------------------------------------------------------------

/** Water moat: a full-width channel across the site, z ∈ [MOAT_FRONT, MOAT_BACK]. */
export const MOAT_FRONT_Z = -2.5;
export const MOAT_BACK_Z = -16.5;
export const MOAT_WIDTH_X = 92;
export const MOAT_Y = 0.02;

/** Laterite terrace the temple stands on (top == outer-gallery floor). */
export const TERRACE = { size: [50, 2.2, 30] as Vec3, position: [0, 1.1, -33] as Vec3 };

/** Nested gallery tiers: bottom → top. y is the gallery floor height. */
export const TIERS = [
  { size: [40, 2.9, 24] as Vec3, floor: 2.2, name: 'outer gallery' },
  { size: [28, 2.6, 16.5] as Vec3, floor: 5.1, name: 'middle gallery' },
  { size: [16.5, 2.4, 9.5] as Vec3, floor: 7.7, name: 'inner gallery' },
] as const;

/** Five prangs in a quincunx on the inner gallery roof. */
export const PRANGS = [
  { id: 'central', position: [0, 10.1, -33] as Vec3, height: 13.5, radius: 2.7 },
  { id: 'nw', position: [-5.3, 10.1, -36.2] as Vec3, height: 7.2, radius: 1.75 },
  { id: 'ne', position: [5.3, 10.1, -36.2] as Vec3, height: 7.2, radius: 1.75 },
  { id: 'sw', position: [-5.3, 10.1, -29.8] as Vec3, height: 7.2, radius: 1.75 },
  { id: 'se', position: [5.3, 10.1, -29.8] as Vec3, height: 7.2, radius: 1.75 },
] as const;

/** Total apex height of the central prang (m). */
export const CENTRAL_PRANG_APEX_M = PRANGS[0].position[1] + PRANGS[0].height;

/** West gopura (entrance pavilion) astride the causeway axis. */
export const GOPURA = { size: [8.5, 5.6, 6.5] as Vec3, position: [0, 2.8, -17.2] as Vec3 };

/** Perimeter enclosure wall: x ∈ [-36, 36], from the gopura back to the terrace. */
export const WALL = { length: 72, height: 3.4, thickness: 1.1, position: [0, 1.7, -17.2] as Vec3 };

/** Causeway from the foreground to the gopura, crossing the moat. */
export const CAUSEWAY = { size: [3.6, 0.8, 60] as Vec3, position: [0, 0.4, 9] as Vec3 };
export const CAUSEWAY_LENGTH_M = CAUSEWAY.size[2];

/** Naga balustrade pair flanking the causeway. */
export interface NagaRail { start: number; end: number; z0: number; z1: number }
export const NAGA_RAILS: NagaRail[] = [
  { start: -1.9, end: -1.9, z0: -14.0, z1: CAUSEWAY.position[2] + CAUSEWAY.size[2] / 2 },
  { start: 1.9, end: 1.9, z0: -14.0, z1: CAUSEWAY.position[2] + CAUSEWAY.size[2] / 2 },
];
export const NAGA_RAIL_SEGMENTS = 14;

/** West stair up the terrace to the outer gallery (12 corbelled steps). */
export const STAIR = { width: 4.4, steps: 12, position: [0, 0.0, -10.9] as Vec3, rise: 0.19, run: 0.42 };

/** Colonnade rhythm: bay width (m) for gallery colonnades. */
export const COLUMN_SPACING_M = 2.0;

// ---------------------------------------------------------------------------
// Instanced palms (tropical forest)
// ---------------------------------------------------------------------------

export const PALM_SEED = 0xa4c0de11;
export const PALM_COUNT = 96;

/** Forest floor band around the complex; camera corridor is kept clear. */
export const PALM_RING: [number, number] = [26, 46];

// ---------------------------------------------------------------------------
// Derived instanced transforms (pure; unit-test friendly)
// ---------------------------------------------------------------------------

export interface InstanceTransform { position: Vec3; rotationY: number; scale: number }

/**
 * Perimeter columns for the galleries (instanced). Columns stand 0.35 m in
 * from each gallery edge, on the gallery floor, full height of the gallery.
 */
export function colonnadeTransforms(): InstanceTransform[] {
  const out: InstanceTransform[] = [];
  for (const tier of TIERS) {
    const [w, h, d] = tier.size;
    const y = tier.floor;
    const height = h;
    const inset = 0.55;
    const hx = w / 2 - inset;
    const hz = d / 2 - inset;
    const cz = -33; // gallery centre-z
    const xs: Array<[number, number]> = [];
    for (let x = -hx; x <= hx + 1e-6; x += COLUMN_SPACING_M) xs.push([x, hz]);
    for (let x = -hx; x <= hx + 1e-6; x += COLUMN_SPACING_M) xs.push([x, -hz]);
    for (let z = -hz; z <= hz + 1e-6; z += COLUMN_SPACING_M) xs.push([-hx, z]);
    for (let z = -hz; z <= hz + 1e-6; z += COLUMN_SPACING_M) xs.push([hx, z]);
    for (const [x, zOff] of xs) {
      out.push({ position: [x, y + height / 2, cz + zOff], rotationY: 0, scale: 1 });
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
        STAIR.position[0],
        STAIR.position[1] + i * STAIR.rise + STAIR.rise / 2,
        STAIR.position[2] - i * STAIR.run,
      ],
      rotationY: 0,
      scale: 1,
    });
  }
  return out;
}

/** Naga balustrade finial transforms along both rails. */
export function nagaTransforms(): InstanceTransform[] {
  const out: InstanceTransform[] = [];
  for (const rail of NAGA_RAILS) {
    const z0 = rail.z0;
    const z1 = rail.z1;
    for (let i = 0; i <= NAGA_RAIL_SEGMENTS; i++) {
      const t = i / NAGA_RAIL_SEGMENTS;
      const z = z0 + (z1 - z0) * t;
      const y = 0.8 + (z > 4 ? (z - 4) * 0.028 : 0); // gentle rise toward the moat bridge
      out.push({ position: [rail.start, y, z], rotationY: 0, scale: 1 });
    }
  }
  return out;
}

/** Seeded palm transforms around the complex; camera sight-corridor kept clear. */
export function palmTransforms(): InstanceTransform[] {
  const rng = mulberry32(PALM_SEED);
  const out: InstanceTransform[] = [];
  let attempts = 0;
  while (out.length < PALM_COUNT && attempts < 4000) {
    attempts += 1;
    const angle = rng() * Math.PI * 2;
    const radius = PALM_RING[0] + rng() * (PALM_RING[1] - PALM_RING[0]);
    const x = Math.cos(angle) * radius;
    const z = -28 + Math.sin(angle) * radius;
    // Keep the west view corridor and the moat open for the camera.
    if (Math.abs(x) < 8 && z > -12) continue;
    if (z > MOAT_FRONT_Z && z < MOAT_BACK_Z && Math.abs(x) < MOAT_WIDTH_X / 2) continue;
    out.push({
      position: [x, 0, z],
      rotationY: rng() * Math.PI * 2,
      scale: 0.75 + rng() * 0.8,
    });
  }
  if (out.length < PALM_COUNT) {
    throw new Error(`palmTransforms: only placed ${out.length}/${PALM_COUNT} palms`);
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
  causeway: typeof CAUSEWAY;
  nagaRails: typeof NAGA_RAILS;
  stair: typeof STAIR;
  water: { position: Vec3; size: [number, number] };
  laterite: { position: Vec3; size: [number, number] };
  colonnades: InstanceTransform[];
  palms: InstanceTransform[];
  stairs: InstanceTransform[];
  nagas: InstanceTransform[];
}

/** Build the complete layout; deterministic. */
export function buildAngkorLayout(): AngkorLayout {
  return {
    terrace: TERRACE,
    tiers: TIERS,
    prangs: PRANGS,
    gopura: GOPURA,
    wall: WALL,
    causeway: CAUSEWAY,
    nagaRails: NAGA_RAILS,
    stair: STAIR,
    water: {
      position: [0, MOAT_Y, (MOAT_FRONT_Z + MOAT_BACK_Z) / 2],
      size: [MOAT_WIDTH_X, MOAT_FRONT_Z - MOAT_BACK_Z],
    },
    // laterite apron in front of the gopura (walkable laterite, not cracked tan)
    laterite: { position: [0, 0.01, -1.2], size: [16, 3.0] },
    colonnades: colonnadeTransforms(),
    palms: palmTransforms(),
    stairs: stairTransforms(),
    nagas: nagaTransforms(),
  };
}
