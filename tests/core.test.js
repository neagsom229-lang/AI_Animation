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
