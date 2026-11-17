/**
 * @fileoverview Cost guard (pure): estimate render time per media type and warn
 * when world3d exceeds a fraction of total film duration.
 * @module scripts/lib/film-cost
 */

/** Estimate seconds per scene from measured ms/frame and scene duration. */
export function estimateSceneCost(spec, durationFrames, fps, msPerFrame) {
  const type = (spec.media && spec.media.type) || (spec.clip ? 'clip' : 'illustration');
  const ms = msPerFrame[type] || msPerFrame.illustration;
  return { type, frames: durationFrames, seconds: Number(((durationFrames * ms) / 1000).toFixed(1)) };
}

/**
 * Evaluate the cost guard. Returns { estimateSeconds, world3dFraction, warn, reasons }.
 */
export function costGuard({ story, timeline, fps, cfg }) {
  const costs = [];
  let totalMs = 0;
  let world3dMs = 0;
  timeline.scenes.forEach((t, i) => {
    const spec = story.scenes[i] || {};
    const c = estimateSceneCost(spec, t.durationInFrames, fps, cfg.cost.msPerFrame);
    costs.push({ scene: spec.id, ...c });
    totalMs += c.seconds * 1000;
    if (c.type === 'world3d') world3dMs += c.seconds * 1000;
  });
  const totalDurationMs = timeline.durationInFrames / fps * 1000;
  const world3dDurationMs = timeline.scenes.reduce((s, t, i) => {
    const spec = story.scenes[i] || {};
    const type = (spec.media && spec.media.type) || (spec.clip ? 'clip' : 'illustration');
    return type === 'world3d' ? s + t.durationInFrames / fps * 1000 : s;
  }, 0);
  const world3dFraction = totalDurationMs > 0 ? world3dDurationMs / totalDurationMs : 0;
  const reasons = [];
  if (world3dFraction > cfg.cost.world3dMaxFraction) {
    reasons.push(`world3d scenes are ${(world3dFraction * 100).toFixed(0)}% of duration (> ${(cfg.cost.world3dMaxFraction * 100).toFixed(0)}% limit)`);
  }
  return {
    estimateSeconds: Number((totalMs / 1000).toFixed(1)),
    world3dFraction: Number(world3dFraction.toFixed(3)),
    warn: reasons.length > 0,
    reasons,
    costs,
  };
}
