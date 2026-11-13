/**
 * @fileoverview Unit tests for story validation, story generation, and timeline scheduler.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert';
import { validateStory, generateStory } from '../src/core/story.js';
import { TimelineScheduler, keyframes, Easing } from '../src/core/engine.js';

test('validateStory validates correct story', () => {
  const validStory = {
    title: 'Test Story',
    genre: 'historical',
    theme: 'Testing',
    tone: 'epic',
    language: 'en',
    characters: [{ id: 'hero', name: 'Hero' }],
    scenes: [{ id: 's1', name: 'Scene 1', dur: 5 }]
  };
  assert.strictEqual(validateStory(validStory), true);
});

test('validateStory throws on invalid story', () => {
  assert.throws(() => validateStory(null), /object/);
  assert.throws(() => validateStory({ title: '', genre: 'a', theme: 'b', characters: [{id: '1', name: 'A'}], scenes: [] }), /title/);
  assert.throws(() => validateStory({ title: 'A', genre: 'a', theme: 'b', characters: [{id: '1', name: 'A'}], scenes: [{ id: '1', name: 'S', dur: 0 }] }), /positive dur/);
});

test('validateStory rejects unknown camera with the valid list in the message', () => {
  const story = {
    title: 'T', genre: 'g', theme: 'th', language: 'en',
    characters: [{ id: 'n', name: 'N' }],
    scenes: [{ id: 's1', name: 'S', dur: 3, camera: 'spiral' }]
  };
  assert.throws(() => validateStory(story), (err) => {
    return /unknown camera "spiral"/.test(err.message) && err.message.includes('dolly, orbit, crane, handheld, static');
  });
});

test('validateStory rejects unknown mood with the valid list in the message', () => {
  const story = {
    title: 'T', genre: 'g', theme: 'th', language: 'en',
    characters: [{ id: 'n', name: 'N' }],
    scenes: [{ id: 's1', name: 'S', dur: 3, mood: 'sunset' }]
  };
  assert.throws(() => validateStory(story), (err) => {
    return /unknown mood "sunset"/.test(err.message) && err.message.includes('warm dawn');
  });
});

test('validateStory rejects unknown action and unknown action character', () => {
  const base = {
    title: 'T', genre: 'g', theme: 'th', language: 'en',
    characters: [{ id: 'hero', name: 'H' }],
  };
  const badAction = { ...base, scenes: [{ id: 's1', name: 'S', dur: 3, actions: [{ character: 'hero', action: 'fly' }] }] };
  assert.throws(() => validateStory(badAction), (err) => {
    return /has unknown action "fly"/.test(err.message) && err.message.includes('idle, walk, talk, turn, gesture, react');
  });
  const badChar = { ...base, scenes: [{ id: 's1', name: 'S', dur: 3, actions: [{ character: 'ghost', action: 'walk' }] }] };
  assert.throws(() => validateStory(badChar), /unknown character "ghost"/);
});

test('validateStory rejects empty dialogue text and unknown speaker', () => {
  const base = {
    title: 'T', genre: 'g', theme: 'th', language: 'en',
    characters: [{ id: 'hero', name: 'H' }],
  };
  const emptyText = { ...base, scenes: [{ id: 's1', name: 'S', dur: 3, dialogue: [{ speaker: 'hero', text: '   ' }] }] };
  assert.throws(() => validateStory(emptyText), /empty or missing text/);
  const badSpeaker = { ...base, scenes: [{ id: 's1', name: 'S', dur: 3, dialogue: [{ speaker: 'nobody', text: 'hello' }] }] };
  assert.throws(() => validateStory(badSpeaker), /unknown speaker "nobody"/);
});

test('validateStory rejects unknown language', () => {
  const story = {
    title: 'T', genre: 'g', theme: 'th', language: 'fr',
    characters: [{ id: 'n', name: 'N' }],
    scenes: [{ id: 's1', name: 'S', dur: 3 }]
  };
  assert.throws(() => validateStory(story), (err) => /language "fr" is unknown/.test(err.message) && err.message.includes('km, en'));
});

test('generateStory offline fallback produces valid story', async () => {
  const story = await generateStory({ genre: 'historical', theme: 'Water and empire' });
  assert.strictEqual(validateStory(story), true);
  assert.strictEqual(story.genre, 'historical');
  assert.strictEqual(story.theme, 'Water and empire');
  assert.ok(story.scenes.length > 0);
});

test('keyframes interpolation works correctly', () => {
  const frames = [
    [0, 0, 'linear'],
    [10, 100, 'linear']
  ];
  assert.strictEqual(keyframes(0, frames), 0);
  assert.strictEqual(keyframes(5, frames), 50);
  assert.strictEqual(keyframes(10, frames), 100);
});

test('TimelineScheduler handles seek and scene lookup', () => {
  const scenes = [
    { id: 's1', dur: 5 },
    { id: 's2', dur: 10 }
  ];
  const scheduler = new TimelineScheduler({ scenes, fps: 60 });
  assert.strictEqual(scheduler.duration, 15);

  let timeUpdated = false;
  scheduler.on('timeupdate', (data) => {
    timeUpdated = true;
    assert.strictEqual(data.currentTime, 7);
    assert.strictEqual(data.scene.index, 1);
    assert.strictEqual(data.scene.scene.id, 's2');
    assert.strictEqual(data.scene.localTime, 2);
  });

  scheduler.seek(7);
  assert.strictEqual(timeUpdated, true);
});
