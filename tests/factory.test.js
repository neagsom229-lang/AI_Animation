/** Film factory QA: mapping, layout, config, graph, stale sheet, debounce, status. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  sceneFromFilename, mapFilenames, missingScenes,
} from '../scripts/lib/film-map.mjs';
import { validateConfig, configHash } from '../scripts/lib/film-config.mjs';
import { decideSkip, hashInputs } from '../scripts/lib/film-graph.mjs';
import { embedPngText, readPngText, isSheetStale } from '../scripts/lib/film-preview.mjs';
import { debounceReady, affectedScenes } from '../scripts/lib/film-watch.mjs';
import { findWrongFolderImages, wrongFolderFixCommands } from '../scripts/lib/film-status.mjs';
import { parseArgs as filmArgs } from '../scripts/film.mjs';
import { costGuard } from '../scripts/lib/film-cost.mjs';
import { buildStamp } from '../scripts/lib/film-stamp.mjs';

// --- filename mapping (the exact variants from the brief) ---
test('sceneFromFilename: all required variants', () => {
  assert.equal(sceneFromFilename('scene-1.png'), 1);
  assert.equal(sceneFromFilename('scene16.png'), 16);
  assert.equal(sceneFromFilename('Scene 16.png'), 16);
  assert.equal(sceneFromFilename('scene_16.png'), 16);
  assert.equal(sceneFromFilename('16.png'), 16);
  assert.equal(sceneFromFilename('no-digits.png'), null);
});

test('mapFilenames: map.json handles no-digit names; duplicates + missing reported', () => {
  const files = ['scene-1.png', 'scene16.png', 'Scene 2.png', 'dawn.png'];
  const map = { '3': 'dawn.png' };
  const r = mapFilenames(files, map, 18);
  assert.deepEqual(r.mapped.map((m) => m.scene).sort((a, b) => a - b), [1, 2, 3, 16]);
  assert.equal(r.unmapped.length, 0);
  assert.deepEqual(missingScenes(r.mapped, 4), [4]);
  const dup = mapFilenames(['scene-4.png', 'scene4.png', '04.png'], {}, 4);
  assert.deepEqual(dup.duplicates['4'].sort(), ['04.png', 'scene-4.png', 'scene4.png']);
});

// --- config validation ---
test('config validation: valid config passes; bad fields fail with names', () => {
  const cfg = JSON.parse(fs.readFileSync('film.config.json', 'utf8'));
  assert.deepEqual(validateConfig(cfg), []);
  const bad = JSON.parse(JSON.stringify(cfg));
  bad.fps = 0; bad.tts.provider = 'bogus'; delete bad.paths.inbox;
  const errs = validateConfig(bad);
  assert.ok(errs.some((e) => e.includes('fps')));
  assert.ok(errs.some((e) => e.includes('tts.provider')));
  assert.ok(errs.some((e) => e.includes('paths.inbox')));
  assert.equal(configHash(cfg), configHash(JSON.parse(JSON.stringify(cfg))));
});

// --- stage graph skip / partial rebuild ---
test('decideSkip: skip only when hash unchanged + outputs exist (unless force)', () => {
  assert.equal(decideSkip({ hash: 'a', outputsExist: true, stateHash: 'a' }).skip, true);
  assert.equal(decideSkip({ hash: 'a', outputsExist: true, stateHash: 'a', force: true }).skip, false);
  assert.equal(decideSkip({ hash: 'a', outputsExist: false, stateHash: 'a' }).skip, false);
  assert.equal(decideSkip({ hash: 'b', outputsExist: true, stateHash: 'a' }).skip, false);
  assert.equal(decideSkip({ hash: 'a', outputsExist: true, stateHash: 'a' }).reason, 'unchanged');
});

// --- stale sheet detection (PNG tEXt metadata + sidecar) ---
test('sheet metadata embed/read + stale detection', () => {
  const png = fs.readFileSync('public/illustrated/illustrations/tiny.png');
  const withMeta = embedPngText(png, 'KuanimationInputHash', 'abc123');
  assert.equal(readPngText(withMeta, 'KuanimationInputHash'), 'abc123');
  const tmp = 'build/cache/test-sheet.png';
  fs.mkdirSync('build/cache', { recursive: true });
  fs.writeFileSync(tmp, withMeta);
  assert.equal(isSheetStale(tmp, 'abc123'), false);
  assert.equal(isSheetStale(tmp, 'changed'), true);
  fs.unlinkSync(tmp);
});

// --- watch debounce ---
test('watch debounce gate + affected scene classification', () => {
  assert.equal(debounceReady(1000, 1200, 500), false);
  assert.equal(debounceReady(1000, 1600, 500), true);
  assert.equal(debounceReady(undefined, 10, 500), true);
  assert.deepEqual(affectedScenes('scene-7.png'), [7]);
  assert.deepEqual(affectedScenes('Scene 9.png'), [9]);
  assert.deepEqual(affectedScenes('dawn.png', { '3': 'dawn.png' }), [3]);
  assert.deepEqual(affectedScenes('random.png'), []);
});

// --- CLI parse + status exit codes ---
test('film CLI parseArgs: commands + flags', () => {
  assert.equal(filmArgs(['status']).command, 'status');
  const a = filmArgs(['ingest', '--only', 'scene=3', '--force', '--draft', '--strict', '--verbose']);
  assert.equal(a.only, 3);
  assert.equal(a.force, true);
  assert.equal(a.draft, true);
  assert.equal(a.strict, true);
  assert.equal(a.verbose, true);
  assert.throws(() => filmArgs(['bogus']), /Unknown command/);
  assert.throws(() => filmArgs([]), /Command required/);
});

// --- wrong-folder detection ---
test('wrong-folder detection finds out/ images and prints exact fix', () => {
  const cfg = JSON.parse(fs.readFileSync('film.config.json', 'utf8'));
  const dir = 'out/wrong-folder-test';
  const file = `${dir}/scene-99.png`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, 'fixture');
  try {
    const hits = findWrongFolderImages('.', cfg);
    assert.ok(hits.includes(file), `hits: ${hits.join(',')}`);
    const fixes = wrongFolderFixCommands(hits.slice(-1), cfg);
    assert.ok(fixes[0].startsWith('Copy-Item'));
    assert.ok(fixes.some((f) => f.includes('film.mjs ingest')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- cost guard ---
test('cost guard warns when world3d > 25% of duration', () => {
  const cfg = JSON.parse(fs.readFileSync('film.config.json', 'utf8'));
  const story = JSON.parse(fs.readFileSync('src/stories/khmer-empire.json', 'utf8'));
  const timeline = { durationInFrames: 360, scenes: [
    { id: 'a', durationInFrames: 300 }, // world3d 10s
    { id: 'b', durationInFrames: 60 },  // illustration 2s
  ] };
  const cg = costGuard({ story: { scenes: [
    { id: 'a', media: { type: 'world3d' } }, { id: 'b', media: { type: 'illustration' } },
  ] }, timeline, fps: 30, cfg });
  assert.equal(cg.warn, true);
  assert.ok(cg.world3dFraction > 0.25);
  assert.ok(cg.reasons[0].includes('world3d'));
});

// --- stamp ---
test('stamp includes git commit, config hash, versions, per-scene hashes, licenses', () => {
  const cfg = JSON.parse(fs.readFileSync('film.config.json', 'utf8'));
  const story = JSON.parse(fs.readFileSync('src/stories/khmer-empire.json', 'utf8'));
  const stamp = buildStamp({ root: '.', cfg, configHashValue: 'abc', story, voiceData: { scenes: [] }, storyName: 'x', durationSeconds: 10 });
  assert.ok(stamp.gitCommit);
  assert.equal(stamp.configHash, 'abc');
  assert.ok(stamp.toolVersions.remotion);
  assert.equal(Object.keys(stamp.perSceneInputHashes).length, 18);
  assert.ok(stamp.licenses.outsideAllowList.some((s) => s.includes('Remotion')));
});
