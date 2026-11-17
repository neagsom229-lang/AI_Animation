/** Round 12 item 2: inline REQUEUE hint + only scenes-to-regenerate. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { requeueTargets, inlineRequeueHint } from '../scripts/lib/film-duplicates.mjs';

const groups = [
  [{ scene: 9 }, { scene: 10, narration: 'N10', prompt: 'P10' }],
  [{ scene: 11 }, { scene: 12, narration: 'N12', prompt: 'P12' }, { scene: 13, narration: 'N13', prompt: 'P13' }, { scene: 14, narration: 'N14', prompt: 'P14' }],
  [{ scene: 15 }, { scene: 16, narration: 'N16', prompt: 'P16' }, { scene: 17, narration: 'N17', prompt: 'P17' }],
];

test('requeueTargets: all but first of each group', () => {
  const t = requeueTargets(groups).map((r) => r.scene);
  assert.deepEqual(t, [10, 12, 13, 14, 16, 17]);
});

test('inlineRequeueHint: non-empty, lists only targets, includes narration+prompt', () => {
  const hint = inlineRequeueHint(groups);
  assert.ok(hint.startsWith('REQUEUE'), 'must start with REQUEUE');
  assert.ok(!hint.endsWith('REQUEUE:'), 'must not be an empty REQUEUE:');
  assert.ok(hint.includes('scene 10') && hint.includes('scene 17'));
  assert.ok(!hint.includes('scene 9 ') && !hint.includes('scene 11 ') && !hint.includes('scene 15 '), 'kept scenes must not be listed');
  assert.ok(hint.includes('narration="N10"') && hint.includes('prompt="P10"'));
});

test('doctor FIX line is inline (not empty REQUEUE) in real output', () => {
  const r = spawnSync(process.execPath, ['scripts/film.mjs', 'doctor'], { encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const fix = out.split('\n').find((l) => l.includes('FIX: Regenerate distinct images'));
  assert.ok(fix, 'FIX line must exist');
  assert.ok(fix.includes('REQUEUE (regenerate only these 6)'), 'FIX line must carry the inline hint');
  assert.ok(fix.includes('scene 10') && fix.includes('scene 17'));
  assert.ok(!fix.trimEnd().endsWith('REQUEUE:'), 'must not end in empty REQUEUE:');
});
