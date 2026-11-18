/** Round 15 item 6: film all = one chain, one action, no force/loop. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { freeRamGb, draftDecision, oneAction, MIN_RENDER_FREE_GB } from '../scripts/film-all.mjs';

test('freeRamGb reports FREE RAM, never disk space', () => {
  const gb = freeRamGb();
  assert.ok(Number.isFinite(gb) && gb > 0);
  assert.ok(Math.abs(gb - os.freemem() / 1e9) < 0.02, 'must be os.freemem(), not statfs bavail');
  assert.ok(gb < 16, 'this machine has 15.7 GB total; 559 GB was a disk-space bug');
});

test('draft is gated by flag, blockers and >= 4 GB RAM', () => {
  assert.equal(draftDecision({ draft: false, blockers: 0, ramGb: 9 }).render, false);
  assert.match(draftDecision({ draft: false, blockers: 0, ramGb: 9 }).reason, /no --draft/);
  assert.equal(draftDecision({ draft: true, blockers: 2, ramGb: 9 }).render, false);
  assert.match(draftDecision({ draft: true, blockers: 2, ramGb: 9 }).reason, /2 blocker/);
  assert.equal(draftDecision({ draft: true, blockers: 0, ramGb: 3.9 }).render, false);
  assert.match(draftDecision({ draft: true, blockers: 0, ramGb: 3.9 }).reason, /3.9 GB < 4 GB/);
  const ok = draftDecision({ draft: true, blockers: 0, ramGb: 4.1 });
  assert.equal(ok.render, true);
  assert.equal(MIN_RENDER_FREE_GB, 4);
});

test('oneAction counts every blocker and returns exactly one action', () => {
  const gates = [
    { name: 'duplicates', status: 'BLOCK', detail: '3 groups', fix: 'REQUEUE (regenerate only these 6):\n  scene 10 -> save as assets-src/inbox/scene-10.png | target >= 1920x1080, 16:9 | prompt: docs/prompts/scene-10.txt' },
    { name: 'resolution', status: 'BLOCK', detail: '18 low', fix: 'upscale' },
  ];
  const a = oneAction(gates, { profile: 'final', context: {} });
  assert.equal(a.blockers, 2);
  assert.equal(a.gate, 'duplicates');
  assert.match(a.action, /regenerate scene 10/);
});

test('film all source has no loop, no --force and no inbox writes', () => {
  const src = fs.readFileSync('scripts/film-all.mjs', 'utf8');
  assert.match(src, /probeEnvironment\(root\)/);
  assert.match(src, /stage \$\{name\} START/);
  assert.match(src, /\['ingest'/);
  assert.match(src, /\['depth'/);
  assert.match(src, /stopOnBlock: false/);
  assert.match(src, /draftDecision\(/);
  assert.ok(!/for \(const c of \[/.test(src), 'the old looping all is gone');
  assert.ok(!/force: true/.test(src));
  assert.ok(!/assets-src\/inbox.*writeFile/.test(src));
});

test('film all --help goes through the CLI without running stages', () => {
  const r = spawnSync(process.execPath, ['scripts/film.mjs', '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Film factory commands:[\s\S]*\ball\b/);
});
