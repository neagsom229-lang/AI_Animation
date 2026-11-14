/**
 * @fileoverview Mood lighting presets shared by the legacy ThreeSceneManager
 * (src/render/three3d.js) and the deterministic Remotion pipeline (remotion/).
 * Keeping them in one module guarantees the interactive studio and the
 * frame-deterministic renderer light scenes identically.
 * @module src/render/moods
 */

'use strict';

export const MoodLightingPresets = {
  'warm dawn': { ambient: 0xffe8d6, directional: 0xffb347, fog: 0xffe8d6, intensity: 1.2 },
  'gold dust': { ambient: 0xfff0c2, directional: 0xffc857, fog: 0xfff0c2, intensity: 1.4 },
  'night storm': { ambient: 0x1a233a, directional: 0x4a6fa5, fog: 0x0b132b, intensity: 0.6 },
  'paper': { ambient: 0xfffcf5, directional: 0xffffff, fog: 0xfffcf5, intensity: 1.0 },
  'green': { ambient: 0xd8f3dc, directional: 0x52b788, fog: 0xd8f3dc, intensity: 1.1 }
};

/**
 * Resolve a mood by name.
 * @param {string} moodName
 * @returns {{ ambient: number, directional: number, fog: number, intensity: number }}
 * @throws {Error} When moodName is not a known preset. There is deliberately no
 *   silent fallback: an unknown mood must fail loudly (with the valid list in
 *   the message) instead of quietly rendering 'warm dawn'.
 */
export function resolveMood(moodName) {
  if (!Object.hasOwn(MoodLightingPresets, moodName)) {
    throw new Error(
      `unknown mood "${moodName}". Valid moods: ${Object.keys(MoodLightingPresets).join(', ')}.`
    );
  }
  return MoodLightingPresets[moodName];
}
