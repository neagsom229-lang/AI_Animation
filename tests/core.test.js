/**
 * @fileoverview Unit tests for story validation, story generation, and timeline scheduler.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert';
import { validateStory, generateStory, KNOWN_SHOTS } from '../src/core/story.js';
import { TimelineScheduler, keyframes, Easing } from '../src/core/engine.js';
import { resolveMood, MoodLightingPresets } from '../src/render/moods.js';
import fs from 'node:fs';
import path from 'node:path';

test('validateStory validates correct story', () => {
  const validStory = {
    title: 'Test Story',
    genre: 'historical',
    theme: 'Testing',
    tone: 'epic',
    language: 'en',
    characters: ['reach'],
    scenes: [{ id: 's1', name: 'Scene 1', dur: 5 }]
  };
  assert.strictEqual(validateStory(validStory), true);
});

test('validateStory throws on invalid story', () => {
  assert.throws(() => validateStory(null), /object/);
  assert.throws(() => validateStory({ title: '', genre: 'a', theme: 'b', characters: [{id: '1', name: 'A'}], scenes: [] }), /title/);
  assert.throws(() => validateStory({ title: 'A', genre: 'a', theme: 'b', characters: [{ id: 'reach', name: 'Reach' }], scenes: [{ id: 's1', name: 'S', dur: 0 }] }), /positive dur/);
});

test('validateStory rejects unknown camera with the valid list in the message', () => {
  const story = {
    title: 'T', genre: 'g', theme: 'th', language: 'en',
    characters: [{ id: 'reach', name: 'Reach' }],
    scenes: [{ id: 's1', name: 'S', dur: 3, camera: 'spiral' }]
  };
  assert.throws(() => validateStory(story), (err) => {
    return /unknown camera "spiral"/.test(err.message) && err.message.includes('dolly, dolly-drift, orbit, crane, handheld, static');
  });
});

test('validateStory rejects unknown mood with the valid list in the message', () => {
  const story = {
    title: 'T', genre: 'g', theme: 'th', language: 'en',
    characters: [{ id: 'reach', name: 'Reach' }],
    scenes: [{ id: 's1', name: 'S', dur: 3, mood: 'sunset' }]
  };
  assert.throws(() => validateStory(story), (err) => {
    return /unknown mood "sunset"/.test(err.message) && err.message.includes('warm dawn');
  });
});

test('resolveMood returns the exact preset for every known mood', () => {
  for (const name of Object.keys(MoodLightingPresets)) {
    assert.strictEqual(resolveMood(name), MoodLightingPresets[name]);
  }
});

test('resolveMood throws on unknown moods (no silent warm-dawn fallback)', () => {
  assert.throws(() => resolveMood('sunset'), (err) => {
    return /unknown mood "sunset"/.test(err.message) && err.message.includes('warm dawn');
  });
  assert.throws(() => resolveMood('constructor'), /unknown mood "constructor"/);
  assert.throws(() => resolveMood(undefined), /unknown mood/);
  assert.throws(() => resolveMood(''), /unknown mood ""/);
});

test('validateStory rejects unknown action and unknown action character', () => {
  const base = {
    title: 'T', genre: 'g', theme: 'th', language: 'en',
    characters: [{ id: 'reach', name: 'Reach' }],
  };
  const badAction = { ...base, scenes: [{ id: 's1', name: 'S', dur: 3, actions: [{ character: 'reach', action: 'fly' }] }] };
  assert.throws(() => validateStory(badAction), (err) => {
    return /has unknown action "fly"/.test(err.message) && err.message.includes('idle, walk, talk, turn, gesture, react');
  });
  const badChar = { ...base, scenes: [{ id: 's1', name: 'S', dur: 3, actions: [{ character: 'ghost', action: 'walk' }] }] };
  assert.throws(() => validateStory(badChar), /unknown character "ghost"/);
});

test('validateStory rejects empty dialogue text and unknown speaker', () => {
  const base = {
    title: 'T', genre: 'g', theme: 'th', language: 'en',
    characters: [{ id: 'reach', name: 'Reach' }],
  };
  const emptyText = { ...base, scenes: [{ id: 's1', name: 'S', dur: 3, dialogue: [{ speaker: 'reach', text: '   ' }] }] };
  assert.throws(() => validateStory(emptyText), /empty or missing text/);
  const badSpeaker = { ...base, scenes: [{ id: 's1', name: 'S', dur: 3, dialogue: [{ speaker: 'nobody', text: 'hello' }] }] };
  assert.throws(() => validateStory(badSpeaker), /unknown speaker "nobody"/);
});

test('validateStory rejects unknown language', () => {
  const story = {
    title: 'T', genre: 'g', theme: 'th', language: 'fr',
    characters: [{ id: 'reach', name: 'Reach' }],
    scenes: [{ id: 's1', name: 'S', dur: 3 }]
  };
  assert.throws(() => validateStory(story), (err) => /language "fr" is unknown/.test(err.message) && err.message.includes('km, en'));
});

test('validateStory rejects unknown shot with the valid list in the message', () => {
  const story = {
    title: 'T', genre: 'g', theme: 'th', language: 'en',
    characters: [{ id: 'reach', name: 'Reach' }],
    scenes: [{ id: 's1', name: 'S', dur: 3, shot: 'extreme-wide' }]
  };
  assert.throws(() => validateStory(story), (err) => {
    return /unknown shot "extreme-wide"/.test(err.message) &&
      err.message.includes('close-up, medium, wide, over-shoulder');
  });
});

test('validateStory requires a second modelled character for over-shoulder', () => {
  const solo = {
    title: 'T', genre: 'g', theme: 'th', language: 'en',
    characters: [{ id: 'reach', name: 'Reach' }],
    scenes: [{ id: 's1', name: 'S', dur: 3, shot: 'over-shoulder' }]
  };
  assert.throws(() => validateStory(solo), (err) => {
    return /over-shoulder/.test(err.message) && err.message.includes('second 3D character');
  });
  // Two characters WITHOUT a 3D model (modelType "none") still cannot stage it.
  const noModels = {
    ...solo,
    characters: [{ id: 'jaya', name: 'Jaya' }, { id: 'zhou', name: 'Zhou' }]
  };
  assert.throws(() => validateStory(noModels), /only 0 character\(s\) have a 3D model\./);
  // Two modelled characters (VRMs from the library, Round-5 string form) → valid.
  const duo = { ...solo, characters: ['reach', 'minea'] };
  assert.strictEqual(validateStory(duo), true);
});

test('every shipped story validates, including its shot vocabulary', () => {
  const storiesDir = path.resolve('src', 'stories');
  const files = fs.readdirSync(storiesDir).filter((f) => f.endsWith('.json')).sort();
  assert.ok(files.length > 0, 'no story JSON files found in src/stories');
  for (const f of files) {
    const story = JSON.parse(fs.readFileSync(path.join(storiesDir, f), 'utf8'));
    assert.strictEqual(validateStory(story), true, `${f} failed validation`);
    for (const scene of story.scenes) {
      if (scene.shot !== undefined) {
        assert.ok(KNOWN_SHOTS.includes(scene.shot), `${f}: unknown shot "${scene.shot}"`);
      }
    }
  }
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

test('every character modelUrl in shipped stories exists on disk', () => {
  const storiesDir = path.resolve('src', 'stories');
  const files = fs.readdirSync(storiesDir).filter((f) => f.endsWith('.json')).sort();
  assert.ok(files.length > 0, 'no story JSON files found in src/stories');
  let checked = 0;
  for (const f of files) {
    const story = JSON.parse(fs.readFileSync(path.join(storiesDir, f), 'utf8'));
    for (const c of story.characters || []) {
      if (c.modelUrl) {
        assert.ok(
          fs.existsSync(c.modelUrl),
          `modelUrl "${c.modelUrl}" for character "${c.id}" in ${f} does not exist on disk`
        );
        checked += 1;
      }
    }
  }
  assert.ok(checked > 0, 'no character modelUrl found in shipped stories');
});
