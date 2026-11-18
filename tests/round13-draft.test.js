/** Round 13 item 8: real labelled 720p draft, stills, report, estimate comparison. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseArgs, resolveScenes, draftOutputDir, draftVideoName, probeVideo,
  compareEstimate, honestyNotes, DRAFT_LABEL, DRAFTS_ROOT,
} from '../scripts/film-draft.mjs';

const timeline = { scenes: Array.from({ length: 18 }, () => ({ startFrame: 0, durationInFrames: 240, id: 'sc-01' })) };

function group(list) { return list.map((n) => ({ scene: n })); }

test('draft CLI: defaults 2,7,15; --scenes; --all; conflicts fail loudly', () => {
  assert.deepEqual(parseArgs([]).scenes, [2, 7, 15]);
  assert.equal(parseArgs([]).all, false);
  assert.deepEqual(parseArgs(['--scenes', '4,9,4']).scenes, [4, 9]);
  assert.equal(parseArgs(['--all']).all, true);
  assert.throws(() => parseArgs(['--scenes', '0,2']), /positive scene numbers/);
  assert.throws(() => parseArgs(['--scenes', 'a']), /positive scene numbers/);
  assert.throws(() => parseArgs(['--scenes', '2', '--all']), /conflicts/);
  assert.throws(() => parseArgs(['--nope']), /Unknown/);
});

test('resolveScenes: --all covers the whole timeline; bad numbers throw', () => {
  assert.deepEqual(resolveScenes({ scenes: [2, 7, 15], all: false }, timeline), [2, 7, 15]);
  assert.deepEqual(resolveScenes({ scenes: [], all: true }, timeline), Array.from({ length: 18 }, (_, i) => i + 1));
  assert.throws(() => resolveScenes({ scenes: [19], all: false }, timeline), /not in timeline/);
  assert.throws(() => resolveScenes({ scenes: [0], all: false }, timeline), /not in timeline/);
});

test('output path is timestamped under out/drafts and the filename says NOT RELEASABLE', () => {
  const dir = draftOutputDir({ root: '.', storyName: 'khmer-empire', timestamp: new Date('2026-11-18T02:03:04.005Z') });
  assert.equal(path.relative('.', dir).replace(/\\/g, '/'), `${DRAFTS_ROOT}/2026-11-18T02-03-04-005Z`);
  assert.equal(draftVideoName('khmer-empire'), `khmer-empire-${DRAFT_LABEL}.mp4`);
  assert.match(draftVideoName('khmer-empire'), /NOT-RELEASABLE/);
  assert.equal(parseArgs(['--out-dir', 'build/cache/x']).outDir, 'build/cache/x');
});

test('probeVideo reads a REAL mp4 with the bundled ffprobe', () => {
  // The old cache was deleted by film clean; a real draft scene MP4 is the
  // current source of truth for this probe test.
  const drafts = fs.readdirSync('out/drafts').filter((d) => /^\d{4}-/.test(d)).sort();
  const dir = path.join('out/drafts', drafts[drafts.length - 1]);
  const file = fs.readdirSync(dir).find((f) => /^scene-\d+\.mp4$/.test(f));
  assert.ok(file, 'a real draft scene render must exist');
  const p = probeVideo(path.join(dir, file));
  assert.equal(p.ok, true);
  assert.equal(p.width, 1280);
  assert.equal(p.height, 720);
  assert.equal(p.codec, 'h264');
  assert.ok(p.duration > 0);
});

test('compareEstimate: actual vs predicted ms/frame, measured total, no fake numbers', () => {
  const timing = [
    { scene: 2, frames: 100, ms: 5700, msPerFrame: 57.0 },
    { scene: 7, frames: 200, ms: 20000, msPerFrame: 100.0 },
  ];
  const est = { rows: [
    { index: 1, msPerFrame: 600 },
    { index: 2, msPerFrame: 50 },
    { index: 3, msPerFrame: 57 },
  ] };
  const c = compareEstimate({ timing, est });
  assert.equal(c.rows.length, 2);
  assert.equal(c.rows[0].estimatedMsPerFrame, 50);
  assert.equal(c.rows[0].ratio, 1.14);
  assert.equal(c.measuredMsPerFrame, 85.7);
  assert.equal(c.totalMeasuredSeconds, 25.7);
  assert.deepEqual(compareEstimate({ timing: [], est: { rows: [] } }).rows, []);
});

test('honestyNotes: lists what CANNOT be judged and never claims release', () => {
  const notes = honestyNotes({
    story: { scenes: [{}, {}] },
    manifest: { scenes: [
      { scene: 1, reviewed: false, licenseTermsUrl: '' },
      { scene: 2, reviewed: false, licenseTermsUrl: '' },
    ] },
    voiceData: { provider: 'edge-tts' },
    metrics: { scenes: [{ depthSource: 'gradient' }], duplicateGroups: [group([9, 10])] },
    sceneNumbers: [2, 7, 15],
  });
  assert.match(notes, /NOT RELEASABLE/);
  assert.match(notes, /NOT judged/);
  assert.match(notes, /2\/2 scenes are unreviewed/);
  assert.match(notes, /2 scene\(s\) have no licenseTermsUrl/);
  assert.match(notes, /9=10/);
  assert.match(notes, /2\.5D/);
  assert.match(notes, /NEVER true 3D/);
  assert.match(notes, /PREDICTION/);
  assert.match(notes, /Scenes rendered in this draft: 2, 7, 15/);
  assert.match(notes, /edge-tts/);
});

test('a MOCK voice is called out, not silently accepted', () => {
  const notes = honestyNotes({
    story: { scenes: [] }, manifest: { scenes: [] },
    voiceData: { provider: 'mock' }, metrics: {}, sceneNumbers: [1],
  });
  assert.match(notes, /MOCK — not acceptable for final/);
});

test('draft script writes real stills + report and keeps the label in source', () => {
  const src = fs.readFileSync('scripts/film-draft.mjs', 'utf8');
  assert.ok(src.includes('out/drafts'), 'timestamped drafts folder');
  assert.ok(src.includes('DRAFT-NOT-RELEASABLE'), 'labelled output');
  assert.ok(src.includes("['early', 'mid', 'late']"), 'three stills per scene');
  assert.ok(src.includes("cols: 3, cellWidth: 480"), 'contact sheet');
  assert.ok(src.includes("runMedia('ffprobe'"), 'real ffprobe');
  assert.ok(src.includes('compareEstimate({ timing, est: estimateResult })'), 'estimate comparison');
  assert.ok(src.includes('honestyNotes('), 'what cannot be judged');
  assert.ok(src.includes('releasable: false'), 'never claims releasable');
  assert.ok(src.includes('voiceData.provider === \'mock\''), 'mock voice refused');
});

test('film draft --help works through the film CLI', () => {
  const r = spawnSync(process.execPath, ['scripts/film.mjs', 'draft', '--help'], { encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  assert.equal(r.status, 0, out.slice(-600));
  assert.match(out, /--scenes 2,7,15 \| --all/);
});
