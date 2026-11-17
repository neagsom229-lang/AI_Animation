/**
 * @fileoverview Pure parallax-safety math (Phase 3).
 *
 * A depth map with hard edges can smear faces/hands when the camera travels.
 * From a depth-edge metric (0..1, fraction of large adjacent depth jumps) we
 * auto-limit camera travel and parallax amplitude. Per-scene overrides in the
 * story (`motion.amplitude`, `motion.direction`) are respected but still capped.
 * @module remotion/lib/parallelax-safety
 */

/**
 * Round 11 item 2: clamp world3d camera travel by the same limitFactor.
 * Given the full pose and the pose at the shot's start frame, interpolate the
 * camera position toward the start position by (1 - limitFactor): factor 1 =>
 * full travel, factor 0.4 => only 40% of the travel. Pure.
 */
export function clampCameraTravel(
  full: readonly [number, number, number],
  start: readonly [number, number, number],
  limitFactor: number
): [number, number, number] {
  const f = Math.min(1, Math.max(0, Number.isFinite(limitFactor) ? limitFactor : 1));
  return [
    start[0] + (full[0] - start[0]) * f,
    start[1] + (full[1] - start[1]) * f,
    start[2] + (full[2] - start[2]) * f,
  ];
}

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

/** Minimum limit factor (Round 10 item 1): never fully suppress motion. */
export const MIN_LIMIT_FACTOR = 0.25;

/** Safety factor: clamp(1 - edgeMetric/0.35, 0.25, 1). Unknown edge → 0.25. */
export function safetyFactor(depthEdgeMetric: number): number {
  if (!Number.isFinite(depthEdgeMetric)) return MIN_LIMIT_FACTOR;
  const m = clamp01(depthEdgeMetric);
  return Math.min(1, Math.max(MIN_LIMIT_FACTOR, 1 - clamp01(m / EDGE_LIMIT)));
}

/** Round 10 item 3: direction derived from a camera move string. No hardcoded default. */
export function directionFromCamera(camera?: string): NonNullable<MotionOverride['direction']> | 'none' {
  const c = String(camera || 'static').toLowerCase();
  if (c.includes('truck-left') || c.includes('truck_left')) return 'left';
  if (c.includes('truck-right') || c.includes('truck_right')) return 'right';
  return 'none'; // push/crane/static: no lateral travel
}

/** Direction to signed unit-ish vector. 'none' -> zero (no lateral offset). */
export function directionVector(direction?: MotionOverride['direction'] | 'none'): { x: number; y: number } {
  switch (direction) {
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
    case 'none': return { x: 0, y: 0 };
    default: return { x: 0, y: 0 }; // unknown -> no motion (never assume a direction)
  }
}

/**
 * Compute the effective, safety-limited parallax for a scene.
 * Pure: same (metric, override) -> identical result.
 */
export function limitParallax(
  depthEdgeMetric: number,
  override?: MotionOverride,
  camera?: string
): SafetyResult {
  const factor = safetyFactor(depthEdgeMetric);
  const requested = clamp01(override && override.amplitude !== undefined ? override.amplitude : 1);
  const amplitude = Math.min(ABSOLUTE_MAX_AMPLITUDE, requested * factor * ABSOLUTE_MAX_AMPLITUDE);
  const offset = Math.min(ABSOLUTE_MAX_OFFSET, amplitude * ABSOLUTE_MAX_OFFSET / Math.max(ABSOLUTE_MAX_AMPLITUDE, 1e-9));
  // Explicit override wins; otherwise derive from the camera move (no hardcoded "left").
  const direction = (override && override.direction) || directionFromCamera(camera);
  const dir = directionVector(direction);
  return { factor, amplitude, offset, dirX: dir.x, dirY: dir.y };
}
