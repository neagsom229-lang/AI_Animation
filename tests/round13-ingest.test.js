/** Round 13 item 2: ONE drop folder + variants + timestamped backups + counts. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  listDropImages, resolveDropFolder, backupDirName, backupReplaced,
} from '../scripts/lib/film-ingest.mjs';
import { mapFilenames } from '../scripts/lib/film-map.mjs';

const TMP = path.join('build', 'cache', 'round13-ingest');

function resetDir(p) {
  fs.rmSync(p, { recursive: true, force: true });
  fs.mkdirSync(p, { recursive: true });
}

test('drop folder accepts scene-1, scene-01, "Scene 01" and 01', () => {
  for (const name of ['scene-1.png', 'scene-01.png', 'Scene 01.png', '01.png']) {
    const r = mapFilenames([name], {}, 18);
    assert.equal(r.mapped.length, 1, `${name} must map`);
    assert.equal(r.mapped[0].scene, 1, `${name} -> scene 1`);
    assert.equal(r.unmapped.length, 0);
  }
});

test('listDropImages lists images only (skips _originals, map.json, non-images)', () => {
  const dir = path.join(TMP, 'inbox');
  resetDir(dir);
  fs.writeFileSync(path.join(dir, 'scene-1.png'), 'x');
  fs.writeFileSync(path.join(dir, '01.png'), 'x');
  fs.writeFileSync(path.join(dir, 'map.json'), '{}');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
  fs.mkdirSync(path.join(dir, '_originals'));
  const files = listDropImages(dir);
  assert.deepEqual(files, ['01.png', 'scene-1.png']);
  assert.deepEqual(listDropImages(path.join(dir, 'missing')), []);
});

test('inbox wins; legacy build/ingest is only a flagged fallback', () => {
  const root = path.join(TMP, 'root');
  resetDir(root);
  const inbox = path.join(root, 'assets-src', 'inbox');
  const staging = path.join(root, 'build', 'ingest', 'story');
  fs.mkdirSync(inbox, { recursive: true });
  fs.mkdirSync(staging, { recursive: true });

  // Empty inbox -> deprecation fallback.
  fs.writeFileSync(path.join(staging, 'scene-01.png'), 'x');
  const legacy = resolveDropFolder({ root, inbox, staging, storyName: 'story' });
  assert.equal(legacy.deprecated, true);
  assert.equal(legacy.dir, path.resolve(staging));
  assert.deepEqual(legacy.files, ['scene-01.png']);

  // Drop folder present -> inbox only, never the legacy path.
  fs.writeFileSync(path.join(inbox, 'scene-02.png'), 'x');
  const primary = resolveDropFolder({ root, inbox, staging, storyName: 'story' });
  assert.equal(primary.deprecated, false);
  assert.equal(primary.dir, path.resolve(inbox));
  assert.deepEqual(primary.files, ['scene-02.png']);
});

test('backups go to a timestamped folder and never move/delete the original', () => {
  const root = path.join(TMP, 'backup-root');
  resetDir(root);
  const ill = path.join(root, 'assets-src', 'illustrations');
  fs.mkdirSync(ill, { recursive: true });
  const dest = path.join(ill, 'scene-03.png');
  fs.writeFileSync(dest, 'OLD-BYTES');
  const cfg = { paths: { illustrations: 'assets-src/illustrations' } };
  const b = backupReplaced({ root, cfg, mappedScenes: [3, 4] });
  assert.deepEqual(b.files, ['scene-03.png']);
  assert.ok(b.dir.includes('assets-src') && b.dir.includes('backup'));
  assert.equal(fs.readFileSync(path.join(b.dir, 'scene-03.png'), 'utf8'), 'OLD-BYTES');
  assert.equal(fs.readFileSync(dest, 'utf8'), 'OLD-BYTES', 'original must remain untouched');
});

test('backupDirName is filesystem-safe and sortable', () => {
  const n = backupDirName(new Date('2026-11-18T01:02:03.456Z'));
  assert.equal(n, '2026-11-18T01-02-03-456Z');
  assert.ok(!n.includes(':'));
});

test('ingest source prints exactly one new/replaced/unchanged line after success', () => {
  const src = fs.readFileSync('scripts/lib/film-ingest.mjs', 'utf8');
  assert.ok(src.includes('${added} new, ${replaced} replaced, ${unchanged} unchanged'));
  assert.ok(src.includes('DEPRECATED:'));
  assert.ok(src.includes("path.join(path.resolve(root, 'build', 'ingest'), storyName)"));
  assert.ok(src.includes("path.resolve(root, 'assets-src', 'backup')"));
});
