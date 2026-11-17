/**
 * @fileoverview Cast resolution: story character references → library entries.
 *
 * Round 5: a story references characters by ID only. The library
 * (`src/characters/characters.json`) owns the model, the face rig, the
 * height, the clip map, the costume variants and the rendering style, so a
 * character can be swapped without touching a story.
 *
 * Pure and deterministic — no clock, no randomness.
 * @module remotion/lib/cast
 */

import characterLibrary from '../../src/characters/characters.json';

export interface LibraryCostumeVariant {
  id: string;
  label?: string;
  material?: { color?: string; roughness?: number; metalness?: number } | null;
}

export interface LibraryCharacter {
  id: string;
  displayName: string;
  role?: string;
  modelUrl?: string | null;
  modelType: 'vrm' | 'glb' | 'none';
  faceRig: 'visemes' | 'jaw' | 'none';
  heightM: number;
  scale: number;
  voice?: string;
  clipMap?: Record<string, string>;
  costume?: { variants: LibraryCostumeVariant[] };
  era?: string;
  style?: 'default' | 'relief';
}

export interface CastMember extends LibraryCharacter {
  /** The costume variant selected for this story. */
  costumeVariant: LibraryCostumeVariant;
}

/** The library as parsed from disk (bundled at build time). */
export const CHARACTERS = (characterLibrary as { characters: LibraryCharacter[] }).characters;

/**
 * Resolve a story's character references into library entries.
 *
 * Accepts both the Round-5 form (an array of ids) and the legacy form
 * (an array of inline `{id, name, role}` objects — the inline fields win
 * for the display name only, the model always comes from the library).
 *
 * @param {Array<string|{id: string, name?: string, role?: string}>} refs
 * @param {Record<string, string>} [variantById] costume variant per character id
 * @returns {CastMember[]} the resolved cast, in story order
 * @throws {Error} on an unknown id or an unknown costume variant — never a
 *   silent substitute, because a substitute character in the film is a
 *   silent lie about who is speaking
 */
export function resolveLibraryCast(
  refs: Array<string | { id: string; name?: string; role?: string }>,
  variantById: Record<string, string> = {}
): CastMember[] {
  if (!Array.isArray(refs)) {
    throw new Error('resolveLibraryCast: story.characters must be an array.');
  }
  const index = new Map(CHARACTERS.map((c) => [c.id, c]));
  return refs.map((ref) => {
    const id = typeof ref === 'string' ? ref : ref && ref.id;
    if (!id) {
      throw new Error('resolveLibraryCast: every character reference needs an id.');
    }
    const entry = index.get(id);
    if (!entry) {
      throw new Error(
        `resolveLibraryCast: unknown character id "${id}". ` +
          `Known characters: ${[...index.keys()].join(', ')}.`
      );
    }
    const variants = (entry.costume && entry.costume.variants) || [];
    const wanted = variantById[id];
    const variant = wanted
      ? variants.find((v) => v.id === wanted)
      : variants[0];
    if (!variant) {
      throw new Error(
        `resolveLibraryCast: unknown costume "${wanted}" for character "${id}". ` +
          `Known: ${variants.map((v) => v.id).join(', ')}.`
      );
    }
    return {
      ...entry,
      displayName:
        typeof ref === 'string' ? entry.displayName : (ref.name || entry.displayName),
      role: typeof ref === 'string' ? entry.role : (ref.role || entry.role),
      costumeVariant: variant
    };
  });
}
