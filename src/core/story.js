/**
 * @fileoverview Data-driven story format, validation, and generation engine with offline fallback.
 * @module src/core/story
 */

'use strict';

import { MoodLightingPresets } from '../render/moods.js';

/**
 * @typedef {Object} Character
 * @property {string} id
 * @property {string} name
 * @property {string} role
 * @property {string} [color]
 */

/**
 * @typedef {Object} DialogueLine
 * @property {string} speaker
 * @property {string} text
 * @property {string} [subtitle]
 */

/**
 * @typedef {Object} Scene
 * @property {string} id
 * @property {string} name
 * @property {string} mood
 * @property {number} dur - duration in seconds
 * @property {string} [camera] - camera rig type (e.g. 'dolly', 'orbit', 'crane')
 * @property {string} [renderer] - '2d' or '3d'
 * @property {DialogueLine[]} [dialogue]
 * @property {Object[]} [actions]
 */

/**
 * @typedef {Object} Story
 * @property {string} title
 * @property {string} genre
 * @property {string} theme
 * @property {string} tone
 * @property {string} language
 * @property {Character[]} characters
 * @property {Scene[]} scenes
 */

/** Known story vocabulary — unknown values are hard errors (see validateStory). */
export const KNOWN_ACTIONS = ['idle', 'walk', 'talk', 'turn', 'gesture', 'react'];
export const KNOWN_CAMERAS = ['dolly', 'orbit', 'crane', 'handheld', 'static'];
export const KNOWN_LANGUAGES = ['km', 'en'];

/** Moods come from the shared lighting presets (single source of truth). */
export function knownMoods() {
  return Object.keys(MoodLightingPresets);
}

/**
 * Validates a story object against the required schema.
 * Throws an Error with an exact, actionable message on the first violation.
 * @param {Story} story
 * @returns {boolean} true if valid
 */
export function validateStory(story) {
  if (!story || typeof story !== 'object') {
    throw new Error('Story must be a non-null object.');
  }
  if (typeof story.title !== 'string' || !story.title.trim()) {
    throw new Error('Story missing valid string property: title');
  }
  if (typeof story.genre !== 'string') {
    throw new Error('Story missing valid string property: genre');
  }
  if (typeof story.theme !== 'string') {
    throw new Error('Story missing valid string property: theme');
  }
  if (story.language !== undefined && !KNOWN_LANGUAGES.includes(story.language)) {
    throw new Error(`Story language "${story.language}" is unknown. Valid languages: ${KNOWN_LANGUAGES.join(', ')}.`);
  }
  if (!Array.isArray(story.characters) || story.characters.length === 0) {
    throw new Error('Story must have at least one character in characters array.');
  }
  for (const [idx, char] of story.characters.entries()) {
    if (!char.id || !char.name) {
      throw new Error(`Character at index ${idx} missing id or name.`);
    }
  }
  if (!Array.isArray(story.scenes) || story.scenes.length === 0) {
    throw new Error('Story must have at least one scene in scenes array.');
  }
  const characterIds = new Set(story.characters.map((c) => c.id));
  for (const [idx, scene] of story.scenes.entries()) {
    if (!scene.id || !scene.name || typeof scene.dur !== 'number' || scene.dur <= 0) {
      throw new Error(`Scene at index ${idx} missing id, name, or valid positive dur.`);
    }
    if (scene.mood !== undefined && !knownMoods().includes(scene.mood)) {
      throw new Error(
        `Scene "${scene.id}" has unknown mood "${scene.mood}". Valid moods: ${knownMoods().join(', ')}.`
      );
    }
    if (scene.camera !== undefined && !KNOWN_CAMERAS.includes(scene.camera)) {
      throw new Error(
        `Scene "${scene.id}" has unknown camera "${scene.camera}". Valid cameras: ${KNOWN_CAMERAS.join(', ')}.`
      );
    }
    for (const [aIdx, actionSpec] of (scene.actions || []).entries()) {
      if (!actionSpec || !KNOWN_ACTIONS.includes(actionSpec.action)) {
        throw new Error(
          `Scene "${scene.id}" has unknown action "${actionSpec && actionSpec.action}". ` +
          `Valid actions: ${KNOWN_ACTIONS.join(', ')}.`
        );
      }
      if (!actionSpec.character || !characterIds.has(actionSpec.character)) {
        throw new Error(
          `Scene "${scene.id}" action at index ${aIdx} references unknown character ` +
          `"${actionSpec && actionSpec.character}". Known characters: ${[...characterIds].join(', ')}.`
        );
      }
    }
    for (const [dIdx, dlg] of (scene.dialogue || []).entries()) {
      if (!dlg || typeof dlg.text !== 'string' || !dlg.text.trim()) {
        throw new Error(
          `Scene "${scene.id}" dialogue line at index ${dIdx} has empty or missing text.`
        );
      }
      if (dlg.speaker !== undefined && !characterIds.has(dlg.speaker)) {
        throw new Error(
          `Scene "${scene.id}" dialogue line at index ${dIdx} references unknown speaker ` +
          `"${dlg.speaker}". Known characters: ${[...characterIds].join(', ')}.`
        );
      }
    }
  }
  return true;
}

/**
 * Offline fallback story templates categorized by genre/theme.
 */
const FALLBACK_TEMPLATES = {
  historical: {
    title: 'Echoes of Angkor',
    genre: 'historical',
    theme: 'Rise and water management of a great empire',
    tone: 'epic',
    language: 'en',
    characters: [
      { id: 'jaya', name: 'King Jayavarman VII', role: 'Builder King' },
      { id: 'zhou', name: 'Zhou Daguan', role: 'Diplomatic Chronicler' }
    ],
    scenes: [
      {
        id: 'intro',
        name: 'Forest Dawn',
        mood: 'warm dawn',
        dur: 6,
        camera: 'dolly',
        renderer: '2d',
        dialogue: [{ speaker: 'zhou', text: 'In the heart of the great forest, stone temples rise to touch the clouds.', subtitle: 'Stone temples rise in the forest.' }]
      },
      {
        id: 'build',
        name: 'Reservoir Construction',
        mood: 'gold dust',
        dur: 8,
        camera: 'orbit',
        renderer: '3d',
        dialogue: [{ speaker: 'jaya', name: 'jaya', text: 'We carve the baray so living waters sustain our people through every season.', subtitle: 'Carving the baray for living waters.' }]
      }
    ]
  },
  science: {
    title: 'The Living Sunflower',
    genre: 'science',
    theme: 'Botanical growth and heliotropism',
    tone: 'educational',
    language: 'en',
    characters: [
      { id: 'seed', name: 'Little Seed', role: 'Protagonist' },
      { id: 'sun', name: 'Golden Sun', role: 'Guide' }
    ],
    scenes: [
      {
        id: 'germination',
        name: 'Underground Awakening',
        mood: 'paper',
        dur: 5,
        camera: 'crane',
        renderer: '2d',
        dialogue: [{ speaker: 'seed', text: 'Beneath the dark soil, a tiny root stretches downward while a shoot reaches up.', subtitle: 'Roots and shoots emerge.' }]
      },
      {
        id: 'bloom',
        name: 'Facing the Sun',
        mood: 'warm dawn',
        dur: 7,
        camera: 'orbit',
        renderer: '3d',
        dialogue: [{ speaker: 'sun', text: 'I guide the golden petals to track my journey across the sky.', subtitle: 'Tracking the sun across the sky.' }]
      }
    ]
  }
};

/**
 * Generates a valid story object based on parameters, with an offline fallback generator.
 * @param {Object} options
 * @param {string} [options.genre='historical']
 * @param {string} [options.theme='Exploration and discovery']
 * @param {Array} [options.characters]
 * @param {number} [options.length=2] - number of scenes
 * @param {string} [options.tone='epic']
 * @param {string} [options.language='en']
 * @param {Function} [options.aiProvider] - optional async (prompt) => JSON string
 * @returns {Promise<Story>}
 */
export async function generateStory({
  genre = 'historical',
  theme = 'Exploration and discovery',
  characters = [],
  length = 2,
  tone = 'epic',
  language = 'en',
  aiProvider = null
} = {}) {
  let story = null;

  if (aiProvider && typeof aiProvider === 'function') {
    try {
      const prompt = `Generate a JSON story with genre "${genre}", theme "${theme}", tone "${tone}", language "${language}", having ${length} scenes and characters ${JSON.stringify(characters)}. Schema: {title, genre, theme, tone, language, characters: [{id, name, role}], scenes: [{id, name, mood, dur, camera, renderer, dialogue: [{speaker, text, subtitle}]}]}`;
      const raw = await aiProvider(prompt);
      story = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (err) {
      console.warn('AI provider failed, falling back to template generator:', err);
    }
  }

  if (!story) {
    const template = FALLBACK_TEMPLATES[genre.toLowerCase()] || FALLBACK_TEMPLATES.historical;
    story = JSON.parse(JSON.stringify(template));
    story.theme = theme;
    story.tone = tone;
    story.language = language;
    if (characters.length > 0) {
      story.characters = characters;
    }
  }

  validateStory(story);
  return story;
}
