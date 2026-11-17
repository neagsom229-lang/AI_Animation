/**
 * @fileoverview Pure helpers for the illustrated parallax renderer.
 *
 * The composition displaces a subdivided plane by a depth texture in a vertex
 * shader. These helpers compute the geometry parameters and the clamped offset
 * deterministically; the GLSL itself lives in IllustratedFilm.tsx.
 * @module remotion/lib/illustrated-depth
 */

/** Plane segment counts (~192x108 per brief). */
export const PLANE_SEGMENTS_X = 192;
export const PLANE_SEGMENTS_Y = 108;

/** Vertex-shader depth displacement strength (world units). */
export const DEPTH_STRENGTH = 0.06;

/**
 * Map a normalized depth sample [0,1] to a bounded shader offset.
 * Near depth (1) moves toward the camera more than far depth (0). Clamped so
 * edges never stretch beyond MAX_OFFSET (fraction of plane width).
 */
export const MAX_OFFSET = 0.12;
export function depthToOffset(depth01: number, strength = 1): number {
  if (!Number.isFinite(depth01)) return 0;
  const d = Math.min(1, Math.max(0, depth01));
  const centred = d - 0.5;
  const scaled = centred * 2 * MAX_OFFSET * strength;
  return Math.min(MAX_OFFSET, Math.max(-MAX_OFFSET, scaled));
}

/** Vertex shader displacement (z), bounded to avoid perspective stretching. */
export const MAX_Z = 0.18;
export function depthToZ(depth01: number, strength = 1): number {
  if (!Number.isFinite(depth01)) return 0;
  const d = Math.min(1, Math.max(0, depth01));
  return (d - 0.5) * 2 * MAX_Z * strength;
}

/** Smooth a 3x3 depth neighborhood (box blur) to soften hard depth edges. */
export function smoothDepth(pixels: number[][], y: number, x: number): number {
  const h = pixels.length;
  const w = h > 0 ? pixels[0].length : 0;
  let sum = 0;
  let n = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const yy = y + dy;
      const xx = x + dx;
      if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
      sum += pixels[yy][xx];
      n += 1;
    }
  }
  return n > 0 ? sum / n : 0.5;
}
