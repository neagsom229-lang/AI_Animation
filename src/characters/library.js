/**
 * @fileoverview Character library — the single source of truth for who is in
 * the film and what they are made of.
 *
 * A story references characters by ID only. The renderer resolves the ID
 * against `src/characters/characters.json`, so a character can be swapped
 * (or re-costumed) without editing a single story.
 *
 * Pure Node (`node:fs` + the sibling GLB parser) — no npm dependency, so a
 * fresh clone works offline. Every function is deterministic.
 *
 * @module src/characters/library
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGlb } from '../../scripts/lib/vrm-shrink.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

/** The library file (repo-root relative). */
export const CHARACTER_LIBRARY_PATH = 'src/characters/characters.json';

/** Model types the renderer knows how to load. */
export const MODEL_TYPES = ['vrm', 'glb', 'none'];
/** Face rig kinds the renderer knows how to drive. */
export const FACE_RIGS = ['visemes', 'jaw', 'none'];
/** Rendering styles. `relief` overrides the model's own materials with the
 *  carved-sandstone material of the Angkor Wat bas-reliefs. */
export const CHARACTER_STYLES = ['default', 'relief'];
/** The four actions a character can be asked to perform. */
export const CLIP_ACTIONS = ['idle', 'talk', 'gesture', 'walk'];

/** Human heights a film character may have (metres). */
export const MIN_CHARACTER_HEIGHT_M = 1.5;
export const MAX_CHARACTER_HEIGHT_M = 1.8;

/**
 * Read and parse the library.
 *
 * @param {string} [repoRoot] repository root (defaults to this file's root)
 * @returns {{version: number, characters: object[]}} the raw library
 * @throws {Error} when the file is missing or malformed
 */
export function loadCharacterLibrary(repoRoot = ROOT) {
  const file = path.join(repoRoot, CHARACTER_LIBRARY_PATH);
  if (!fs.existsSync(file)) {
    throw new Error(`Character library not found: ${file}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Character library is not valid JSON: ${file} (${err.message})`);
  }
  if (!parsed || !Array.isArray(parsed.characters)) {
    throw new Error(`Character library must have a characters array: ${file}`);
  }
  return parsed;
}

/**
 * Index the library by id.
 *
 * @returns {Map<string, object>}
 * @throws {Error} on a duplicate id (a silent overwrite would make the
 *   wrong character appear in the film)
 */
export function indexCharacters(library) {
  const index = new Map();
  for (const entry of library.characters) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) {
      throw new Error('Every library character needs a non-empty id.');
    }
    if (index.has(entry.id)) {
      throw new Error(`Duplicate character id in the library: "${entry.id}".`);
    }
    index.set(entry.id, entry);
  }
  return index;
}

/**
 * Validate one library entry.
 *
 * @param {object} entry
 * @param {object} [opts]
 * @param {string} [opts.repoRoot] for resolving modelUrl
 * @throws {Error} with an actionable message
 */
export function validateCharacterEntry(entry, opts = {}) {
  const repoRoot = opts.repoRoot || ROOT;
  const where = `character "${entry && entry.id}"`;
  if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) {
    throw new Error('Every library character needs a non-empty id.');
  }
  if (typeof entry.displayName !== 'string' || !entry.displayName.trim()) {
    throw new Error(`${where}: displayName must be a non-empty string.`);
  }
  if (!MODEL_TYPES.includes(entry.modelType)) {
    throw new Error(
      `${where}: modelType "${entry.modelType}" is unknown. Valid: ${MODEL_TYPES.join(', ')}.`
    );
  }
  if (!FACE_RIGS.includes(entry.faceRig)) {
    throw new Error(
      `${where}: faceRig "${entry.faceRig}" is unknown. Valid: ${FACE_RIGS.join(', ')}.`
    );
  }
  if (!CHARACTER_STYLES.includes(entry.style)) {
    throw new Error(
      `${where}: style "${entry.style}" is unknown. Valid: ${CHARACTER_STYLES.join(', ')}.`
    );
  }
  if (
    typeof entry.heightM !== 'number' ||
    !Number.isFinite(entry.heightM) ||
    entry.heightM < MIN_CHARACTER_HEIGHT_M ||
    entry.heightM > MAX_CHARACTER_HEIGHT_M
  ) {
    throw new Error(
      `${where}: heightM must be a number between ${MIN_CHARACTER_HEIGHT_M} and ` +
        `${MAX_CHARACTER_HEIGHT_M} m (got ${entry.heightM}).`
    );
  }
  if (typeof entry.scale !== 'number' || !Number.isFinite(entry.scale) || entry.scale <= 0) {
    throw new Error(`${where}: scale must be a positive number (got ${entry.scale}).`);
  }
  if (typeof entry.voice !== 'string' || !entry.voice.trim()) {
    throw new Error(`${where}: voice must be a non-empty TTS voice name.`);
  }
  if (typeof entry.era !== 'string' || !entry.era.trim()) {
    throw new Error(`${where}: era must be a non-empty tag.`);
  }
  if (!entry.clipMap || typeof entry.clipMap !== 'object') {
    throw new Error(`${where}: clipMap must map idle/talk/gesture/walk to clip names.`);
  }
  for (const action of CLIP_ACTIONS) {
    const clip = entry.clipMap[action];
    if (typeof clip !== 'string' || !clip.trim()) {
      throw new Error(`${where}: clipMap.${action} must be a non-empty clip name.`);
    }
  }
  if (!entry.costume || !Array.isArray(entry.costume.variants) || entry.costume.variants.length === 0) {
    throw new Error(`${where}: costume.variants must list at least one variant.`);
  }
  for (const variant of entry.costume.variants) {
    if (!variant || typeof variant.id !== 'string' || !variant.id.trim()) {
      throw new Error(`${where}: every costume variant needs an id.`);
    }
  }
  if (entry.modelType === 'none') {
    if (entry.modelUrl) {
      throw new Error(`${where}: modelType "none" must not declare a modelUrl.`);
    }
    return;
  }
  if (typeof entry.modelUrl !== 'string' || !entry.modelUrl.trim()) {
    throw new Error(`${where}: modelType "${entry.modelType}" needs a modelUrl.`);
  }
  const rel = entry.modelUrl.startsWith('public/')
    ? entry.modelUrl
    : `public/${entry.modelUrl}`;
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    throw new Error(`${where}: model file does not exist: ${abs}`);
  }
  const ext = path.extname(entry.modelUrl).toLowerCase();
  if (entry.modelType === 'vrm' && ext !== '.vrm') {
    throw new Error(`${where}: modelType "vrm" needs a .vrm file (got ${entry.modelUrl}).`);
  }
  if (entry.modelType === 'glb' && ext !== '.glb' && ext !== '.gltf') {
    throw new Error(`${where}: modelType "glb" needs a .glb/.gltf file (got ${entry.modelUrl}).`);
  }
}

/**
 * Validate the whole library.
 *
 * @param {object} [opts] `{repoRoot}`
 * @returns {{version: number, characters: object[]}} the library
 * @throws {Error} on the first violation
 */
export function validateCharacterLibrary(opts = {}) {
  const library = loadCharacterLibrary(opts.repoRoot);
  indexCharacters(library);
  for (const entry of library.characters) {
    validateCharacterEntry(entry, opts);
  }
  return library;
}

/**
 * Resolve a character id to its library entry.
 *
 * @param {string} id
 * @param {object} [opts] `{repoRoot, library}` — pass a library to avoid re-reading the file
 * @returns {object} the library entry
 * @throws {Error} when the id is unknown (never a silent substitute)
 */
export function resolveCharacter(id, opts = {}) {
  const library = opts.library || validateCharacterLibrary(opts);
  const index = opts.index || indexCharacters(library);
  const entry = index.get(id);
  if (!entry) {
    throw new Error(
      `Unknown character id "${id}". Known characters: ${[...index.keys()].join(', ')}.`
    );
  }
  return entry;
}

/**
 * Resolve the costume variant for a character.
 *
 * @param {object} entry library entry
 * @param {string} [variantId] requested variant (defaults to the first)
 * @returns {object} the variant
 * @throws {Error} when the variant does not exist
 */
export function resolveCostume(entry, variantId) {
  const variants = (entry.costume && entry.costume.variants) || [];
  if (!variantId) {
    if (variants.length === 0) {
      throw new Error(`Character "${entry.id}" has no costume variants.`);
    }
    return variants[0];
  }
  const hit = variants.find((v) => v.id === variantId);
  if (!hit) {
    throw new Error(
      `Unknown costume "${variantId}" for character "${entry.id}". ` +
        `Known: ${variants.map((v) => v.id).join(', ')}.`
    );
  }
  return hit;
}

/**
 * The clips a character model actually ships.
 *
 * @param {string} modelUrl repo-root relative path
 * @param {object} [opts] `{repoRoot}`
 * @returns {string[]} clip names (empty when the model cannot be parsed)
 */
export function modelClipNames(modelUrl, opts = {}) {
  const repoRoot = opts.repoRoot || ROOT;
  const rel = modelUrl.startsWith('public/') ? modelUrl : `public/${modelUrl}`;
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return [];
  try {
    const { json } = parseGlb(fs.readFileSync(abs));
    return (json.animations || []).map((a) => a.name).filter(Boolean);
  } catch {
    return [];
  }
}
