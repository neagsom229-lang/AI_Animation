/**
 * @fileoverview Pure parallax-safety math (Phase 3).
 *
 * A depth map with hard edges can smear faces/hands when the camera travels.
 * From a depth-edge metric (0..1, fraction of large adjacent depth jumps) we
 * auto-limit camera travel and parallax amplitude. Per-scene overrides in the
 * story (`motion.amplitude`, `motion.direction`) are respected but still capped.
 * @module remotion/lib/parallelax-safety
 */

/** Hard ceiling on camera move amplitude regardless of override. */
export const ABSOLUTE_MAX_AMPLITUDE = 0.10;
/** Absolute ceiling on texture-offset amplitude. */
export const ABSOLUTE_MAX_OFFSET = 0.12;
/** Depth-edge metric above which motion is fully suppressed. */
export const EDGE_LIMIT = 0.35;

export interface MotionOverride {
  amplitude?: number;
  direction?: 'left' | 'right' | 'up' | 'down';
}

export interface SafetyResult {
  /** Multiplier in [0,1] applied to all camera travel / parallax. */
  factor: number;
  /** Effective amplitude (fraction) after metric + override + ceiling. */
  amplitude: number;
  /** Effective texture offset after ceiling. */
  offset: number;
  /** Direction signed x/y components. */
  dirX: number;
  dirY: number;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
}

/** Safety factor from a depth-edge metric: 1 at 0 edges, 0 at EDGE_LIMIT. */
export function safetyFactor(depthEdgeMetric: number): number {
  if (!Number.isFinite(depthEdgeMetric)) return 0; // unknown edge metric → suppress motion
  const m = clamp01(depthEdgeMetric);
  return 1 - clamp01(m / EDGE_LIMIT);
}

/** Direction to signed unit-ish vector. */
export function directionVector(direction?: MotionOverride['direction']): { x: number; y: number } {
  switch (direction) {
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
    default: return { x: 1, y: 0 };
  }
}

/**
 * Compute the effective, safety-limited parallax for a scene.
 * Pure: same (metric, override) -> identical result.
 */
export function limitParallax(depthEdgeMetric: number, override?: MotionOverride): SafetyResult {
  const factor = safetyFactor(depthEdgeMetric);
  const requested = clamp01(override && override.amplitude !== undefined ? override.amplitude : 1);
  const amplitude = Math.min(ABSOLUTE_MAX_AMPLITUDE, requested * factor * ABSOLUTE_MAX_AMPLITUDE);
  const offset = Math.min(ABSOLUTE_MAX_OFFSET, amplitude * ABSOLUTE_MAX_OFFSET / Math.max(ABSOLUTE_MAX_AMPLITUDE, 1e-9));
  const dir = directionVector(override && override.direction);
  return { factor, amplitude, offset, dirX: dir.x, dirY: dir.y };
}
