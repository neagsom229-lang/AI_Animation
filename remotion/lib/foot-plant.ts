/**
 * @fileoverview Foot planting for procedurally animated walk cycles.
 *
 * A procedural walk swings the legs sinusoidally, which is *close* to right
 * but never exactly right: the foot sinks below the floor on the down-swing
 * and lifts off it early on the up-swing, so the figure slides and floats.
 * Real walk cycles plant the stance foot and keep it planted while the body
 * passes over it.
 *
 * This module implements the cheap, deterministic half of that: after the
 * clip (or the procedural swing) has posed the leg, the foot's height is
 * clamped to the floor and the DEFICIT is reported as the amount the leg has
 * to be shortened by. The component applies it to the leg bone, which pulls
 * the foot back up onto the ground without touching the clip.
 *
 * It is a *contact clamp*, not a full IK solve: it removes the slide and
 * the sink, which is what reads at 24 fps. A real two-bone IK pass is the
 * upgrade path (documented in docs/CHARACTER_PIPELINE.md).
 *
 * Every export is a pure function — no state, no clock (the Phase 1
 * contract).
 * @module remotion/lib/foot-plant
 */

/** How far above the floor a planted foot may sit (a small lift avoids
 *  z-fighting with the ground plane). */
export const FOOT_LIFT_M = 0.012;

/** Maximum length correction the leg may absorb (beyond this the foot is
 *  allowed to float rather than tear the leg apart). */
export const MAX_LEG_CORRECTION_M = 0.06;

export interface FootPlantResult {
  /** How much the leg must be shortened (m) to keep the foot on the floor. */
  correction: number;
  /** True when the foot was below the floor and has just been planted. */
  planted: boolean;
  /** The foot's height after the correction. */
  y: number;
}

/**
 * Clamp one foot to the floor.
 *
 * @param footY world height of the foot bone
 * @param floorY world height of the ground
 * @param lift how far above the floor the contact point sits
 * @returns the leg correction to apply (0 when the foot is already above
 *   the floor) and the corrected height
 */
export function plantFoot(
  footY: number,
  floorY: number,
  lift: number = FOOT_LIFT_M
): FootPlantResult {
  const target = floorY + lift;
  if (!Number.isFinite(footY) || !Number.isFinite(floorY)) {
    return { correction: 0, planted: false, y: footY };
  }
  if (footY >= target) {
    return { correction: 0, planted: false, y: footY };
  }
  const deficit = target - footY;
  const correction = Math.min(deficit, MAX_LEG_CORRECTION_M);
  return { correction, planted: true, y: footY + correction };
}

/**
 * Which foot is planted at a given point of the stride cycle.
 *
 * The stride phase is in turns (1.0 = one full left-right cycle). The
 * stance foot is the one whose swing has finished: the left foot carries
 * the weight through the first half of the cycle, the right through the
 * second.
 *
 * @param stridePhase stride phase in turns, wrapped to [0, 1)
 * @returns 'left' | 'right' | 'both' (the pass-through moment)
 */
export function stanceFoot(stridePhase: number): 'left' | 'right' | 'both' {
  const p = ((stridePhase % 1) + 1) % 1;
  if (p < 0.06 || p > 0.94) return 'both';
  return p < 0.5 ? 'left' : 'right';
}
