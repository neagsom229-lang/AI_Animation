/** Round 15 item 1: no backup for unchanged sources (leak fix). */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { backupReplaced, priorSourceHashes } from '../scripts/lib/film-ingest.mjs';

const TMP = path.join('build', 'cache', 'round15-backup');

function reset() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(path.join(TMP, 'assets-src', 'illustrations'), { recursive: true });
}
function sha(buf) { return requireCrypto().createHash('sha256').update(buf).digest('hex'); }
function requireCrypto() { return crypto; }
import crypto from 'node:crypto';

function fixture() {
  reset();
  const cfg = { paths: { illustrations: 'assets-src/illustrations' } };
  for (const n of [1, 2, 3]) {
    fs.writeFileSync(path.join(TMP, 'assets-src/illustrations', `scene-0${n}.png`), `dest-${n}`);
  }
  const sourceHashes = new Map([
    [1, sha('src-1-changed')],
    [2, sha('src-2-same')],
    [3, sha('src-3')],
  ]);
  const priorSha = new Map([
    [1, sha('src-1-old')],
    [2, sha('src-2-same')], // identical -> must NOT be backed up
  ]);
  // scene 3 has no prior hash and no dest change marker -> still backed up safely.
  return { cfg, sourceHashes, priorSha };
}

function backupFolders() {
  const base = path.join(TMP, 'assets-src', 'backup');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}

test('priorSourceHashes reads the source sha256 recorded by the last ingest', () => {
  reset();
  const p = path.join(TMP, 'assets-src/illustrations/manifest.json');
  fs.writeFileSync(p, JSON.stringify({ scenes: [
    { scene: 1, sourceSha256: 'abc' }, { scene: 2, sourceSha256: 'def' }, { scene: 3 },
  ] }));
  const cfg = { paths: { illustrations: 'assets-src/illustrations' } };
  const m = priorSourceHashes(TMP, cfg);
  assert.equal(m.get(1), 'abc');
  assert.equal(m.get(2), 'def');
  assert.equal(m.has(3), false);
  fs.rmSync(p);
  assert.equal(priorSourceHashes(TMP, cfg).size, 0);
});

test('backupReplaced copies ONLY changed sources and creates no folder when none change', () => {
  const { cfg, sourceHashes, priorSha } = fixture();
  const r1 = backupReplaced({ root: TMP, cfg, mappedScenes: [1, 2, 3], sourceHashes, priorSha });
  assert.deepEqual(r1.files.sort(), ['scene-01.png', 'scene-03.png']);
  assert.ok(!r1.files.includes('scene-02.png'), 'unchanged source must not be backed up');
  assert.equal(backupFolders().length, 1);

  // Second ingest with the SAME incoming sha values: prior manifest now records
  // those shas for every scene, so nothing should change and no folder is made.
  const priorAfter = new Map([[1, sourceHashes.get(1)], [2, sourceHashes.get(2)], [3, sourceHashes.get(3)]]);
  const before = backupFolders();
  const r2 = backupReplaced({ root: TMP, cfg, mappedScenes: [1, 2, 3], sourceHashes, priorSha: priorAfter });
  assert.deepEqual(r2.files, [], 'zero backed up on an unchanged second ingest');
  assert.deepEqual(backupFolders(), before, 'zero NEW backup folders');
});

test('backupReplaced skips new scenes (nothing exists to preserve)', () => {
  const { cfg } = fixture();
  const r = backupReplaced({ root: TMP, cfg, mappedScenes: [99], sourceHashes: new Map([[99, 'x']]), priorSha: new Map() });
  assert.deepEqual(r.files, []);
  assert.equal(backupFolders().length, 0);
});
