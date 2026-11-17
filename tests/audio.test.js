/** Phase 5 QA: loudness math, silence parse, TTS provider/pronunciation. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LOUDNESS_TARGET, parseLoudnessI, parseSilences, hasLongSilence, loudnormFilter,
} from '../scripts/lib/loudness.mjs';
import { parseArgs as makeArgs } from '../scripts/make-illustrated.mjs';

test('loudness targets: web -16, vertical -14', () => {
  assert.equal(LOUDNESS_TARGET.web, -16);
  assert.equal(LOUDNESS_TARGET.vertical, -14);
  assert.ok(loudnormFilter('web').includes('I=-16'));
  assert.ok(loudnormFilter('vertical').includes('I=-14'));
  assert.ok(loudnormFilter(-16).includes('linear=true') === false); // no measured I -> one pass
  assert.ok(loudnormFilter(-16, -15).includes('measured_I=-15'));
});

test('parseLoudnessI extracts integrated I', () => {
  assert.equal(parseLoudnessI('{"input_i": "-16.7", "input_tp": "-1.2"}'), -16.7);
  assert.equal(parseLoudnessI('no json here'), null);
});

test('silencedetect parse + long-gap flag', () => {
  const txt = 'silence_start: 2.00\nsilence_end: 4.10 | silence_duration: 2.10\nsilence_start: 9.0\nsilence_end: 9.5 | silence_duration: 0.5';
  const s = parseSilences(txt);
  assert.equal(s.length, 2);
  assert.equal(s[0].duration, 2.1);
  assert.equal(hasLongSilence(s), true);
  assert.equal(hasLongSilence([{ duration: 0.5 }]), false);
});

test('TTS provider + rate + pronunciation flags parse through make-illustrated', () => {
  const a = makeArgs(['--story', 'src/stories/khmer-empire.json', '--tts', 'azure', '--rate', '-10', '--no-pronunciation']);
  assert.equal(a.tts, 'azure');
  assert.equal(a.rate, -10);
  assert.equal(a.noPronunciation, true);
  assert.throws(() => makeArgs(['--tts', 'bogus']), /edge or azure/);
  assert.equal(makeArgs([]).tts, 'edge');
});

test('pronunciation substitution table exists for all required Khmer names', () => {
  // Read the source (Python) without executing it — check names present.
  const src = fs.readFileSync('scripts/generate-voice.py', 'utf8');
  for (const name of ['Jayavarman', 'Yasodharapura', 'Suryavarman', 'Bayon', 'Roluos', 'Kulen']) {
    assert.ok(src.includes(`"${name}"`), `missing pronunciation entry for ${name}`);
  }
  assert.ok(src.includes('def apply_pronunciation'));
  assert.ok(src.includes('def generate_azure_tts'));
  assert.ok(src.includes("AZURE_SPEECH_KEY"), 'Azure key must come from env');
});
