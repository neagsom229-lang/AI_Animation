/** Round 14b item 2: explicit cleanup plan, tier rules, Tier B hard block. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseArgs, isInside, assertSafe, statsFor, draftKeepSet, detectGhosts,
  planText, applyPlan, PINNED_DRAFT, ARCHIVE_DATE,
} from '../scripts/film-clean.mjs';

const TMP = path.join('build', 'cache', 'round14b-clean');

function reset() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
}
function touch(rel, bytes = 16) {
  const p = path.join(TMP, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, 'x'.repeat(bytes));
  return p;
}

test('clean CLI: plan is the default; apply needs an explicit confirm', () => {
  assert.deepEqual(parseArgs([]), { mode: 'plan', confirm: null, restore: null });
  assert.equal(parseArgs(['--dry-run']).mode, 'plan');
  assert.equal(parseArgs(['--apply']).mode, 'apply');
  assert.equal(parseArgs(['--apply', '--confirm', 'DELETE']).confirm, 'DELETE');
  assert.equal(parseArgs(['--restore', '_archive/x']).restore, '_archive/x');
  assert.throws(() => parseArgs(['--boom']), /Unknown/);
});

test('isInside / assertSafe refuse paths outside the root', () => {
  assert.equal(isInside(TMP, path.join(TMP, 'build')), true);
  assert.equal(isInside(TMP, path.join(TMP, '..', 'outside')), false);
  assert.equal(isInside(TMP, 'C:\\Windows'), false);
  assert.throws(() => assertSafe(TMP, '../outside'), /outside repo root/);
});

test('statsFor measures bytes and newest mtime', () => {
  reset();
  touch('build/a.bin', 100);
  touch('build/sub/b.bin', 25);
  const s = statsFor(TMP, 'build');
  assert.equal(s.bytes, 125);
  assert.ok(s.modified > 0);
  assert.equal(statsFor(TMP, 'missing').bytes, 0);
});

test('draftKeepSet always keeps the pinned comparison draft', () => {
  reset();
  for (const n of ['d1', 'd2', 'd3', 'd4', PINNED_DRAFT]) touch(`out/drafts/${n}/video.mp4`, 8);
  const base = path.join(TMP, 'out/drafts');
  for (const [i, n] of ['d1', 'd2', 'd3', 'd4', PINNED_DRAFT].entries()) {
    const t = new Date(2026, 0, i + 1);
    fs.utimesSync(path.join(base, n), t, t);
  }
  const keep = draftKeepSet(TMP);
  // Newest 3 = d2,d3,pinned; plus the pinned rule. d1/d4 are droppable.
  assert.ok(keep.has(`out/drafts/${PINNED_DRAFT}`));
  assert.ok(keep.has('out/drafts/d3'));
  assert.ok(!keep.has('out/drafts/d1'));
});

test('detectGhosts classifies A/B/C and keeps the manifest + protected paths out', () => {
  reset();
  touch('build/cache/x', 40);
  touch('out/.scene-cache/x', 10);
  touch('out/.illustrated-scene-cache/x', 20);
  touch('out/khmer-empire-storyboard/x', 30);
  for (const n of ['old', 'd2', 'd3', 'd4']) touch(`out/drafts/${n}/video.mp4`, 50);
  touch(`out/drafts/${PINNED_DRAFT}/video.mp4`, 60);
  const draftsBase = path.join(TMP, 'out/drafts');
  for (const [i, n] of ['old', 'd2', 'd3', 'd4', PINNED_DRAFT].entries()) {
    const t = new Date(2026, 0, i + 1);
    fs.utimesSync(path.join(draftsBase, n), t, t);
  }
  touch('public/voice-khmer-empire.json', 70);
  touch('assets-src/backup/old.png', 80);
  touch('angkor-built/out/x', 90);
  touch('demo-film/node_modules/x', 100);
  touch('out/e9/f.png', 110);
  touch('out/voice-test/v.json', 120);
  // A live staged copy is NOT a ghost.
  touch('public/illustrated/illustrations/scene-01.png', 130);
  const manifest = { scenes: [{ scene: 1, file: 'assets-src/illustrations/scene-01.png' }] };
  const ghosts = detectGhosts({ root: TMP, cfg: {}, manifest, tracked: () => false });

  const byPath = Object.fromEntries(ghosts.map((g) => [g.path, g]));
  assert.equal(byPath['build'].tier, 'A');
  assert.equal(byPath['out/drafts/old'].tier, 'A');
  assert.equal(byPath['out/drafts/old'].action, 'delete');
  assert.equal(byPath[`out/drafts/${PINNED_DRAFT}`], undefined, 'pinned draft must not be a ghost');
  assert.equal(byPath['assets-src/backup'].tier, 'B');
  assert.equal(byPath['angkor-built/out'].tier, 'C');
  assert.equal(byPath['out/e9'].action, 'archive');
  assert.equal(byPath['public/illustrated/illustrations/scene-01.png'], undefined, 'manifest copy is LIVE');
  const text = planText(ghosts);
  assert.match(text, /TIER B total:.*\[BLOCKED: not actionable\]/);
  assert.match(text, /ACTIONABLE TOTAL:/);
});

test('applyPlan refuses anything but DELETE and never touches Tier B', () => {
  reset();
  touch('build/x', 10);
  touch('assets-src/backup/old.png', 20);
  touch('out/e9/f.png', 30);
  const cfg = {};
  const manifest = { scenes: [] };
  const ghosts = detectGhosts({ root: TMP, cfg, manifest, tracked: () => false });

  assert.throws(() => applyPlan({ root: TMP, ghosts, confirmation: 'delete' }), /requires typing the word DELETE/);
  assert.ok(fs.existsSync(path.join(TMP, 'build/x')), 'a refused apply deletes nothing');

  const r = applyPlan({ root: TMP, ghosts, confirmation: 'DELETE' });
  assert.ok(r.deleted.some((g) => g.path === 'build'));
  assert.ok(r.moved.some((g) => g.path === 'out/e9'));
  assert.ok(fs.existsSync(path.join(TMP, 'assets-src/backup/old.png')), 'Tier B must survive');
  assert.ok(fs.existsSync(path.join(TMP, '_archive', ARCHIVE_DATE, 'out/e9/f.png')));
  const moved = fs.readFileSync(path.join(TMP, '_archive', ARCHIVE_DATE, 'MOVED.md'), 'utf8');
  assert.match(moved, /out\/e9/);
  assert.match(moved, /original path/);
  const log = fs.readFileSync(path.join(TMP, 'out/review/clean-log.md'), 'utf8');
  assert.match(log, /DELETED \| build/);
  assert.match(log, /MOVED \| out\/e9/);
  assert.match(log, /Tier B was never actioned/);
});
