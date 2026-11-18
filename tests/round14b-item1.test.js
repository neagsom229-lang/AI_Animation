/** Round 14b item 1: inbox truth, text-only CHECK BY EYE heuristic, no auto-flags. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contentWords, keywordOverlap, checkByEyeFlags, buildReviewSheet } from '../scripts/film-review.mjs';

const story = JSON.parse(fs.readFileSync('src/stories/khmer-empire.json', 'utf8'));

test('contentWords strips punctuation and stopwords', () => {
  const w = contentWords('In 802, King Jayavarman II proclaimed himself a universal monarch on Mount Kulen.');
  assert.ok(w.includes('jayavarman'));
  assert.ok(w.includes('kulen'));
  assert.ok(!w.includes('the'));
  assert.ok(!w.includes('and'));
});

test('keywordOverlap is text-only and measurable', () => {
  const good = keywordOverlap(
    'In 802, King Jayavarman II proclaimed himself a universal monarch on Mount Kulen, and the Khmer Empire was born.',
    'Detailed illustration of King Jayavarman II on Mount Kulen, Khmer empire coronation crowd.'
  );
  assert.ok(good.score > 0.3);
  assert.ok(good.shared.includes('kulen'));
  assert.deepEqual(keywordOverlap('', ''), { score: 0, shared: [] });
});

test('checkByEyeFlags flags duplicates + low text overlap, never claims picture judgement', () => {
  const groups = [[{ scene: 9 }, { scene: 10 }], [{ scene: 11 }, { scene: 12 }]];
  const flags = checkByEyeFlags({ story, groups });
  assert.ok(flags.has(9), 'duplicate scenes are CHECK BY EYE');
  assert.match(flags.get(11).join(' '), /duplicate group/);
  assert.ok(flags.has(1), 'scene 1 has low narration/prompt overlap');
  assert.ok(!flags.has(2), 'scene 2 has good overlap and no duplicate');
  for (const reasons of flags.values()) {
    assert.ok(!/looks like|matches the picture|judge/.test(reasons.join(' ')));
  }
});

test('review sheet renders CHECK BY EYE without setting any review flag', () => {
  const before = JSON.parse(fs.readFileSync('assets-src/illustrations/manifest.json', 'utf8'));
  const sheet = buildReviewSheet({ outFile: 'out/review/round14b-sheet.test.html' });
  assert.ok(sheet.checkByEye >= 9);
  assert.ok(sheet.checkByEyeScenes.includes(9));
  const html = fs.readFileSync('out/review/round14b-sheet.test.html', 'utf8');
  assert.match(html, /CHECK BY EYE/);
  assert.match(html, /text-only heuristic/);
  assert.match(html, /look at pixels/);
  const after = JSON.parse(fs.readFileSync('assets-src/illustrations/manifest.json', 'utf8'));
  assert.deepEqual(after.scenes.map((s) => [s.reviewed, s.matchesNarration, s.watermarkCheck, s.licenseTermsUrl]),
    before.scenes.map((s) => [s.reviewed, s.matchesNarration, s.watermarkCheck, s.licenseTermsUrl]),
    'building the sheet must never set a review flag or licence');
});
