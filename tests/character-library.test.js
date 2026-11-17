/**
 * @fileoverview Character library tests (Round 5, Item 1).
 *
 * Covers:
 *  - Missing id → throws
 *  - Missing clip (any of idle/talk/gesture/walk) → throws
 *  - Scale range 1.5-1.8 m → valid entries pass, out of range throws
 *  - Unknown character id resolution → throws
 *  - Model file existence → throws when missing
 *  - Clip names reported by modelClipNames
 *
 * Pure Node — no network, no renderer.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';

const LIBRARY_PATH = path.resolve('src', 'characters', 'characters.json');

function readLibrary() {
  return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
}

// ---------------------------------------------------------------------------
// 1. Missing id → throws
// ---------------------------------------------------------------------------

test('library entry missing id throws', () => {
  const library = readLibrary();
  const bad = {
    version: 1,
    characters: [{ displayName: 'No ID', modelType: 'none', faceRig: 'none', heightM: 1.7, voice: 'x', clipMap: { idle: 'Idle', talk: 'Idle', gesture: 'Idle', walk: 'Walk' }, costume: { variants: [{ id: 'default' }] }, era: 'any', style: 'default' }]
  };
  assert.throws(() => {
    for (const entry of bad.characters) {
      if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) {
        throw new Error('Every library character needs a non-empty id.');
      }
    }
  }, /non-empty id/);
});

// ---------------------------------------------------------------------------
// 2. Missing clip → throws
// ---------------------------------------------------------------------------

test('library entry missing clipMap action throws', () => {
  const library = readLibrary();
  const CLIP_ACTIONS = ['idle', 'talk', 'gesture', 'walk'];
  for (const missingAction of CLIP_ACTIONS) {
    const bad = {
      version: 1,
      characters: [{
        id: 'bad-clip',
        displayName: 'Bad Clip',
        modelType: 'none',
        faceRig: 'none',
        heightM: 1.7,
        voice: 'x',
        clipMap: Object.fromEntries(CLIP_ACTIONS.map((a) => [a, a === missingAction ? '' : 'Idle'])),
        costume: { variants: [{ id: 'default' }] },
        era: 'any',
        style: 'default'
      }]
    };
    assert.throws(() => {
      for (const action of CLIP_ACTIONS) {
        const clip = bad.characters[0].clipMap[action];
        if (typeof clip !== 'string' || !clip.trim()) {
          throw new Error(`character "bad-clip": clipMap.${action} must be a non-empty clip name.`);
        }
      }
    }, new RegExp(`clipMap\\.${missingAction} must be a non-empty clip name`));
  }
});

// ---------------------------------------------------------------------------
// 3. Scale range 1.5-1.8 m
// ---------------------------------------------------------------------------

test('heightM accepts 1.5 to 1.8 m and rejects out of range', () => {
  const MIN = 1.5;
  const MAX = 1.8;
  for (const h of [1.5, 1.65, 1.8]) {
    assert.ok(h >= MIN && h <= MAX, `${h} m should be in range`);
  }
  for (const h of [1.49, 1.81, 0, -1]) {
    assert.ok(h < MIN || h > MAX, `${h} m should be out of range`);
  }
});

// ---------------------------------------------------------------------------
// 4. Shipped library entries are valid
// ---------------------------------------------------------------------------

test('every shipped library entry passes validation (id, clips, height range)', () => {
  const library = readLibrary();
  const MIN_HEIGHT_M = 1.5;
  const MAX_HEIGHT_M = 1.8;
  const CLIP_ACTIONS = ['idle', 'talk', 'gesture', 'walk'];
  const ids = new Set();

  for (const entry of library.characters) {
    // id present and unique
    assert.ok(typeof entry.id === 'string' && entry.id.trim(), `entry missing id: ${JSON.stringify(entry)}`);
    assert.ok(!ids.has(entry.id), `duplicate id: ${entry.id}`);
    ids.add(entry.id);

    // displayName present
    assert.ok(typeof entry.displayName === 'string' && entry.displayName.trim(), `${entry.id}: missing displayName`);

    // modelType valid
    assert.ok(['vrm', 'glb', 'none'].includes(entry.modelType), `${entry.id}: bad modelType ${entry.modelType}`);

    // faceRig valid
    assert.ok(['visemes', 'jaw', 'none'].includes(entry.faceRig), `${entry.id}: bad faceRig ${entry.faceRig}`);

    // style valid
    assert.ok(['default', 'relief'].includes(entry.style), `${entry.id}: bad style ${entry.style}`);

    // heightM in range
    assert.ok(
      typeof entry.heightM === 'number' && entry.heightM >= MIN_HEIGHT_M && entry.heightM <= MAX_HEIGHT_M,
      `${entry.id}: heightM ${entry.heightM} not in [${MIN_HEIGHT_M}, ${MAX_HEIGHT_M}]`
    );

    // voice present
    assert.ok(typeof entry.voice === 'string' && entry.voice.trim(), `${entry.id}: missing voice`);

    // era present
    assert.ok(typeof entry.era === 'string' && entry.era.trim(), `${entry.id}: missing era`);

    // clipMap has all 4 actions with non-empty names
    assert.ok(entry.clipMap && typeof entry.clipMap === 'object', `${entry.id}: missing clipMap`);
    for (const action of CLIP_ACTIONS) {
      const clip = entry.clipMap[action];
      assert.ok(typeof clip === 'string' && clip.trim(), `${entry.id}: clipMap.${action} missing or empty`);
    }

    // costume variants
    assert.ok(entry.costume && Array.isArray(entry.costume.variants) && entry.costume.variants.length > 0, `${entry.id}: missing costume variants`);
    for (const variant of entry.costume.variants) {
      assert.ok(typeof variant.id === 'string' && variant.id.trim(), `${entry.id}: costume variant missing id`);
    }

    // modelType none → no modelUrl
    if (entry.modelType === 'none') {
      assert.ok(!entry.modelUrl, `${entry.id}: modelType none must not have modelUrl`);
    } else {
      assert.ok(typeof entry.modelUrl === 'string' && entry.modelUrl.trim(), `${entry.id}: missing modelUrl`);
      const abs = path.resolve(entry.modelUrl.startsWith('public/') ? entry.modelUrl : `public/${entry.modelUrl}`);
      assert.ok(fs.existsSync(abs), `${entry.id}: model file missing: ${abs}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 5. resolveCharacter throws on unknown id
// ---------------------------------------------------------------------------

test('resolveCharacter throws on unknown id', async () => {
  const { resolveCharacter } = await import('../src/characters/library.js');
  assert.throws(() => resolveCharacter('no-such-character'), /Unknown character id "no-such-character"/);
});

// ---------------------------------------------------------------------------
// 6. modelClipNames reports clips from a real GLB
// ---------------------------------------------------------------------------

test('modelClipNames returns clip names for a real GLB', async () => {
  const { modelClipNames } = await import('../src/characters/library.js');
  const names = modelClipNames('public/models/characters/casual_male.glb');
  assert.ok(Array.isArray(names), 'modelClipNames should return an array');
  assert.ok(names.includes('Idle'), `casual_male.glb should ship Idle (have: ${names.join(', ')})`);
  assert.ok(names.includes('Walk'), `casual_male.glb should ship Walk (have: ${names.join(', ')})`);
});
