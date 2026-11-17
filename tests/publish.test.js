/** Phase 6 QA: publish SRT/chapters + resume state helpers. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildIllustratedSrt, buildChapters, parseArgs as publishArgs } from '../scripts/publish-pack.mjs';
import { buildIllustratedTimeline } from '../remotion/lib/illustrated-timing.ts';

const story = JSON.parse(fs.readFileSync('src/stories/khmer-empire.json', 'utf8'));
const voice = JSON.parse(fs.readFileSync('public/voice-khmer-empire.json', 'utf8'));
const timeline = buildIllustratedTimeline(voice, 30);

test('publish args parse', () => {
  const a = publishArgs(['--story', 'x.json', '--voice', 'v.json']);
  assert.equal(a.story, 'x.json');
  assert.equal(a.voice, 'v.json');
  assert.equal(a.allowMissing, false);
});

test('illustrated SRT uses km/en narration and real timeline times', () => {
  const km = buildIllustratedSrt(story, timeline, 'km');
  const en = buildIllustratedSrt(story, timeline, 'en');
  assert.ok(km.includes('00:00:00,000'));
  assert.ok(en.includes('Twelve centuries ago'));
  assert.ok(km.includes('កាលពី'));
  const kmBlocks = km.trim().split('\n\n').length;
  assert.equal(kmBlocks, 18);
  assert.throws(() => buildIllustratedSrt({ scenes: [] }, timeline, 'km'), /no .* narration/i);
});

test('chapters come from year chips with m:ss timestamps', () => {
  const ch = buildChapters(story, timeline);
  const lines = ch.trim().split('\n');
  assert.equal(lines.length, 7);
  assert.ok(lines[0].startsWith('0:') && lines[0].includes('802'));
  assert.ok(lines.some((l) => l.includes('1113-1150')));
  assert.ok(lines.some((l) => l.includes('1431')));
});

test('resume state structure is checkpoint-friendly (pure shape check)', () => {
  // Resume state is JSON-serializable and keyed by scene id -> content hash.
  const state = { story: 'src/stories/khmer-empire.json', scenes: 18, finished: {}, lastHash: null };
  state.finished['sc-01'] = 'abc123';
  const round = JSON.parse(JSON.stringify(state));
  assert.equal(round.finished['sc-01'], 'abc123');
  assert.equal(round.scenes, 18);
  // The make-illustrated source must save state after each scene.
  const src = fs.readFileSync('scripts/make-illustrated.mjs', 'utf8');
  assert.ok(src.includes('saveState()'), 'resume state must be saved during the scene loop');
  assert.ok(src.includes('.state.json'), 'state file path must be defined');
});
