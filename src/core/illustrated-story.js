/**
 * @fileoverview Validator for the "illustrated" story schema.
 *
 * An illustrated story is narration-first: each scene carries a `narration`
 * object with `km` and `en`, an illustration image path, optional clip / depth,
 * a camera move, an FX list and a transition. The 3D story schema (src/core/
 * story.js) stays valid and untouched — the two styles coexist.
 *
 * Pure Node, deterministic, no dependencies. Fails loudly with actionable
 * messages (no silent fallbacks).
 * @module src/core/illustrated-story
 */

'use strict';

/** Camera moves understood by the parallax renderer. */
export const ILLUSTRATED_CAMERA_MOVES = ['push-in', 'push-out', 'truck-left', 'truck-right', 'crane-up', 'static'];
/** Ambient FX understood by the composition. */
export const ILLUSTRATED_FX = ['dust', 'god-rays', 'water', 'grass', 'smoke', 'birds', 'fireflies', 'grain', 'vignette', 'fire'];
/** Transitions understood by the composition. */
export const ILLUSTRATED_TRANSITIONS = ['crossfade', 'dip-to-black', 'none'];
/** Media types a scene can use (Phase 4 hybrid). */
export const ILLUSTRATED_MEDIA_TYPES = ['illustration', 'clip', 'world3d'];

/**
 * Validate an illustrated story.
 * @param {object} story
 * @returns {boolean} true when valid
 * @throws {Error} on the first violation
 */
export function validateIllustratedStory(story) {
  if (!story || typeof story !== 'object') throw new Error('Illustrated story must be a non-null object.');
  if (story.style !== 'illustrated') {
    throw new Error(`Illustrated story must declare style "illustrated" (got "${story.style}").`);
  }
  if (typeof story.title !== 'string' || !story.title.trim()) throw new Error('Illustrated story missing title.');
  if (story.language !== 'km') {
    throw new Error(`Illustrated story language must be "km" (got "${story.language}").`);
  }
  if (!Array.isArray(story.scenes) || story.scenes.length === 0) {
    throw new Error('Illustrated story must have at least one scene.');
  }
  // If the story declares vocabularies, scenes must stay within them.
  const cameras = Array.isArray(story.cameraMoves) ? story.cameraMoves : ILLUSTRATED_CAMERA_MOVES;
  const fxs = Array.isArray(story.fxVocabulary) ? story.fxVocabulary : ILLUSTRATED_FX;
  const transitions = Array.isArray(story.transitionVocabulary) ? story.transitionVocabulary : ILLUSTRATED_TRANSITIONS;

  const seen = new Set();
  for (const [i, scene] of story.scenes.entries()) {
    const where = `illustrated scene ${i + 1}`;
    if (!scene || typeof scene.id !== 'string' || !scene.id.trim()) {
      throw new Error(`${where} missing id.`);
    }
    if (seen.has(scene.id)) throw new Error(`${where}: duplicate id "${scene.id}".`);
    seen.add(scene.id);

    const n = scene.narration;
    if (!n || typeof n !== 'object') throw new Error(`${where} (${scene.id}) missing narration object.`);
    if (typeof n.km !== 'string' || !n.km.trim()) throw new Error(`${where} (${scene.id}) narration.km must be non-empty.`);
    if (typeof n.en !== 'string' || !n.en.trim()) throw new Error(`${where} (${scene.id}) narration.en must be non-empty.`);

    // media.type decides which renderer the scene uses (Phase 4 hybrid).
    const mediaType = (scene.media && scene.media.type) || (scene.clip ? 'clip' : 'illustration');
    if (!ILLUSTRATED_MEDIA_TYPES.includes(mediaType)) {
      throw new Error(`${where} (${scene.id}) unknown media.type "${mediaType}". Valid: ${ILLUSTRATED_MEDIA_TYPES.join(', ')}.`);
    }
    if (mediaType === 'illustration' && (typeof scene.image !== 'string' || !scene.image.trim())) {
      throw new Error(`${where} (${scene.id}) media.type illustration requires an image path.`);
    }
    if (mediaType === 'clip' && !(scene.clip && String(scene.clip).trim())) {
      throw new Error(`${where} (${scene.id}) media.type clip requires a clip path.`);
    }
    if (mediaType === 'world3d' && scene.world && typeof scene.world !== 'string') {
      throw new Error(`${where} (${scene.id}) media.world3d world name must be a string.`);
    }
    if (scene.clip !== undefined && scene.clip !== null && (typeof scene.clip !== 'string' || !scene.clip.trim())) {
      throw new Error(`${where} (${scene.id}) clip must be a path or null.`);
    }
    if (typeof scene.camera !== 'string' || !cameras.includes(scene.camera)) {
      throw new Error(`${where} (${scene.id}) unknown camera "${scene.camera}". Valid: ${cameras.join(', ')}.`);
    }
    if (!Array.isArray(scene.fx)) throw new Error(`${where} (${scene.id}) fx must be an array.`);
    for (const fx of scene.fx) {
      if (!fxs.includes(fx)) throw new Error(`${where} (${scene.id}) unknown fx "${fx}". Valid: ${fxs.join(', ')}.`);
    }
    if (typeof scene.transition !== 'string' || !transitions.includes(scene.transition)) {
      throw new Error(`${where} (${scene.id}) unknown transition "${scene.transition}". Valid: ${transitions.join(', ')}.`);
    }
    if (scene.years !== undefined && scene.years !== null && typeof scene.years !== 'string') {
      throw new Error(`${where} (${scene.id}) years must be a string chip or null.`);
    }
  }
  return true;
}

/** True when a story object uses the illustrated schema. */
export function isIllustratedStory(story) {
  return Boolean(story && story.style === 'illustrated');
}
