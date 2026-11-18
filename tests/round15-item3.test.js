/** Round 15 item 3: read-only scene-type audit, no story edits. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { auditSceneTypes, auditText } from '../scripts/film-scene-audit.mjs';

const story = JSON.parse(fs.readFileSync('src/stories/khmer-empire.json', 'utf8'));

test('auditSceneTypes finds the world3d field and treats the rest as painted 2.5D', () => {
  const types = auditSceneTypes(story);
  assert.equal(types.length, 18);
  assert.deepEqual(types.filter((t) => t.type === 'world3d').map((t) => t.scene), [1, 7, 13, 18]);
  assert.match(types[12].field, /media\.type=world3d/);
  assert.equal(types[1].type, 'illustration');
});

test('auditText reports scene 13 and the exact cost guard values', () => {
  const before = fs.readFileSync('src/stories/khmer-empire.json', 'utf8');
  const { lines, guard } = auditText();
  const text = lines.join('\n');
  assert.match(text, /world3d scenes \(4\): 1 \(sc-01\), 7 \(sc-07\), 13 \(sc-13\), 18 \(sc-18\)/);
  assert.match(text, /2\.5D parallax, NOT true 3D/);
  assert.match(text, /Scene 13 .*measured 572 ms\/frame/);
  assert.match(text, /11=61\.9, 12=57\.4, 14=69\.2/);
  assert.match(text, /FLAG FOR USER CONFIRMATION/);
  assert.match(text, /delete s\.scenes\[12\]\.media/);
  assert.match(text, /COST GUARD: world3d 23\.6% of duration; limit 25%/);
  assert.equal(guard.warn, false);
  assert.equal(fs.readFileSync('src/stories/khmer-empire.json', 'utf8'), before, 'audit must not edit the story');
});

test('CLI runs read-only', () => {
  const before = fs.readFileSync('src/stories/khmer-empire.json', 'utf8');
  const r = spawnSync(process.execPath, ['scripts/film-scene-audit.mjs'], { encoding: 'utf8' });
  assert.equal(r.status, 0, (r.stderr || '').slice(-400));
  assert.match(r.stdout, /SCENE TYPE AUDIT/);
  assert.equal(fs.readFileSync('src/stories/khmer-empire.json', 'utf8'), before);
});
