/**
 * @fileoverview Pure action→clip mapping and cross-fade weights for the GLB
 * character (Phase B).
 *
 * The Quaternius "Ultimate Animated Character" pack ships 17 clips but has
 * **no Talk/Gesture clip and no jaw/viseme morph targets** (verified by
 * parsing the GLB — see CREDITS.md). The mapping below therefore falls back
 * to `Idle` for talk/turn/react and the component drives those actions with
 * bone gestures (head/neck nod from the voice envelope).
 *
 * Every function here is a pure function of (action, frame, fps): identical
 * inputs → identical outputs, no state, no clock — the Phase 1 contract.
 * @module remotion/lib/character-anim
 */

/** Story actions a scene can request for a character. */
export type StoryAction = 'idle' | 'walk' | 'talk' | 'turn' | 'react';

/** Clips available in the shipped GLB models (see CREDITS.md). */
export type ClipName = 'Idle' | 'Walk';

/**
 * Map a story action to an animation clip.
 *
 * `walk` → Walk; everything else → Idle (the pack has no Talk/Turn/React
 * clip — the missing motion is added procedurally as bone gestures so the
 * character never freezes in a bind/T-pose).
 */
export const CLIP_FOR_ACTION: Record<StoryAction, ClipName> = {
  idle: 'Idle',
  walk: 'Walk',
  talk: 'Idle',
  turn: 'Idle',
  react: 'Idle'
};

export interface CrossFadeWeights {
  /** Weight of the Idle clip (always present — the never-T-pose guarantee). */
  idle: number;
  /** Weight of the Walk clip (0 when the action is not a walk). */
  walk: number;
}

/** Cross-fade duration in seconds between Idle and Walk. */
export const CROSS_FADE_SECONDS = 0.4;

/**
 * Weight the Idle/Walk clips for a given action at an exact frame.
 *
 * - At `frame === 0` the Idle weight is always 1 (a freshly mounted scene
 *   starts in the Idle pose — never a T-pose / bind pose).
 * - Walking scenes smoothstep from Idle to Walk over `CROSS_FADE_SECONDS`
 *   so the transition has no pop.
 * - Weights always sum to 1 and stay in [0, 1].
 *
 * Pure function of (action, frame, fps).
 */
export function crossFadeWeights(
  action: string | undefined,
  frame: number,
  fps: number
): CrossFadeWeights {
  const clip = CLIP_FOR_ACTION[(action as StoryAction) ?? 'idle'] ?? 'Idle';
  if (clip !== 'Walk') return { idle: 1, walk: 0 };

  const fadeFrames = Math.max(1, CROSS_FADE_SECONDS * fps);
  const t = Math.min(1, Math.max(0, frame / fadeFrames));
  const eased = t * t * (3 - 2 * t); // smoothstep
  return { idle: 1 - eased, walk: eased };
}

/**
 * Head-nod amplitude (radians) for the bone-based lip-sync fallback.
 *
 * The voice envelope (0..1, 20 Hz RMS) is mapped to a forward nod of up to
 * ~12.6°. Returns exactly 0 when the envelope is 0, so the head visibly
 * stops moving the moment the voice stops (Phase B contract).
 *
 * Pure function of envAmp.
 */
export function headNodRadians(envAmp: number): number {
  const a = Math.min(1, Math.max(0, envAmp));
  return a * 0.22;
}
