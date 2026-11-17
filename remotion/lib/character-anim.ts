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

import { envelopeAmplitude } from './anima.ts';
import { seeded } from './randomness.ts';

/** Story actions a scene can request for a character. */
export type StoryAction = 'idle' | 'walk' | 'talk' | 'turn' | 'react';

/** Clips available in the shipped GLB models (see CREDITS.md). */
export type ClipName = 'Idle' | 'Walk';

/**
 * Clips a Mixamo-rigged character is expected to ship (docs/CHARACTER_PIPELINE.md).
 *
 * The shipped Quaternius pack only has `Idle` and `Walk`; the preferred list
 * is ordered so a richer rig (Mixamo / VRMA / Blender bake) gets the right
 * clip while the fallback pack still resolves to `Idle`.
 */
export const MIXAMO_CLIPS = ['Idle', 'Talk', 'Gesture', 'Walk'] as const;
export type MixamoClip = (typeof MIXAMO_CLIPS)[number];

/** Preferred clip per action, most specific first. */
export const PREFERRED_CLIP: Record<StoryAction, MixamoClip[]> = {
  idle: ['Idle'],
  walk: ['Walk'],
  talk: ['Talk', 'Gesture', 'Idle'],
  turn: ['Talk', 'Idle'],
  react: ['Idle']
};

/**
 * Resolve the clip to play for an action against the clips a model actually
 * ships.
 *
 * @param available clip names present in the GLB
 * @param action the story action
 * @returns the clip name to play, or null when nothing matches (the caller
 *   then keeps the procedural fallback)
 */
export function resolveClip(available: string[], action: string): string | null {
  const wanted = PREFERRED_CLIP[(action as StoryAction) ?? 'idle'] ?? PREFERRED_CLIP.idle;
  for (const name of wanted) {
    const hit = available.find((a) => a.toLowerCase() === name.toLowerCase());
    if (hit) return hit;
  }
  // Anything at all beats a frozen pose.
  return available[0] ?? null;
}

/**
 * Four-way clip blend weights.
 *
 * Every clip's weight is a pure function of (action, frame, fps): the
 * action's clip fades in over `CROSS_FADE_SECONDS` while `Idle` fades out,
 * and the weights always sum to 1. `gesture` is 0 here — the component adds
 * the gesture layer on top from the speech-peak envelope.
 */
export interface ClipWeights {
  idle: number;
  talk: number;
  gesture: number;
  walk: number;
}

export function clipWeights(action: string, frame: number, fps: number): ClipWeights {
  const out: ClipWeights = { idle: 1, talk: 0, gesture: 0, walk: 0 };
  const key = (action as StoryAction) ?? 'idle';
  if (key === 'idle') return out;
  const fadeFrames = Math.max(1, CROSS_FADE_SECONDS * fps);
  const t = Math.min(1, Math.max(0, frame / fadeFrames));
  const eased = t * t * (3 - 2 * t); // smoothstep
  out.idle = 1 - eased;
  if (key === 'walk') out.walk = eased;
  else out.talk = eased;
  return out;
}

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

// ---------------------------------------------------------------------------
// Lip sync — shared by the VRM (expression) and GLB (morph / jaw) paths
// ---------------------------------------------------------------------------

/** The five mouth shapes the pipeline drives. */
export type VisemeName = 'aa' | 'ih' | 'ou' | 'ee' | 'oh';

/** Viseme weights for one frame; all in [0, 1]. */
export type VisemeWeights = Record<VisemeName, number>;

/** The viseme cycle, in order. */
export const VISEME_CYCLE: VisemeName[] = ['aa', 'ih', 'ou', 'ee', 'oh'];

/** How many 20 Hz samples one viseme is held (2 = 100 ms). */
export const VISEME_HOLD_SAMPLES = 2;

/**
 * Common morph-target / expression names that map onto a viseme. Mixamo,
 * ARKit and MPFB rigs all spell them differently, so the GLB path matches
 * case-insensitively against this table.
 */
export const VISEME_ALIASES: Record<string, VisemeName> = {
  aa: 'aa',
  a: 'aa',
  ah: 'aa',
  ih: 'ih',
  i: 'ih',
  ee: 'ee',
  e: 'ee',
  ou: 'ou',
  u: 'ou',
  oh: 'oh',
  o: 'oh',
  pp: 'aa',
  ff: 'ih',
  th: 'ih',
  kk: 'aa',
  dd: 'aa',
  kk2: 'aa',
  ss: 'ih',
  nn: 'ih',
  rr: 'ou',
};

/**
 * Map a morph-target name onto a viseme, or null when it is not a mouth
 * shape. Strips the common prefixes (`viseme_`, `v_`, `mouth_`) first.
 */
export function visemeFromMorphName(name: string): VisemeName | null {
  const key = String(name || '')
    .toLowerCase()
    .replace(/^(viseme_|v_|mouth_|mouthshape_|shape_)/, '')
    .replace(/[^a-z]/g, '');
  if (!key) return null;
  return VISEME_ALIASES[key] ?? null;
}

/**
 * Envelope-driven viseme weights — the shared fallback for any rig without
 * Rhubarb mouth cues.
 *
 * The 20 Hz envelope selects both WHETHER the mouth is open (weight =
 * amplitude) and WHICH shape (a seeded viseme cycle held for 100 ms,
 * cross-faded over the last 40% of each hold so shapes do not pop).
 *
 * Exactly 0 outside the line's audio span → the mouth closes the moment the
 * voice stops. Pure function of the inputs.
 */
export function lipSyncVisemes(
  env: number[] | undefined,
  frame: number,
  fps: number,
  lineStartFrame: number,
  seed: string
): VisemeWeights {
  const closed: VisemeWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) return closed;
  const t = (frame - lineStartFrame) / fps;
  if (t < 0) return closed;
  const amp = envelopeAmplitude(env, frame, fps, lineStartFrame);
  if (amp <= 0.005) return closed;

  const sample = Math.floor(t * 20);
  const idx = Math.floor(sample / VISEME_HOLD_SAMPLES);
  const progress = (sample % VISEME_HOLD_SAMPLES) / VISEME_HOLD_SAMPLES;
  const now = visemeAt(seed, lineStartFrame, idx);
  const next = visemeAt(seed, lineStartFrame, idx + 1);
  const fade = progress > 0.6 ? (progress - 0.6) / 0.4 : 0;
  closed[now] = amp * (1 - fade);
  if (fade > 0) closed[next] += amp * fade;
  return closed;
}

function visemeAt(seed: string, lineStartFrame: number, index: number): VisemeName {
  const r = seeded(`vowel:${seed}:${lineStartFrame}`, `${index}`);
  return VISEME_CYCLE[Math.min(VISEME_CYCLE.length - 1, Math.floor(r * VISEME_CYCLE.length))];
}
