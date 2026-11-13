/**
 * @fileoverview Subtitle (SRT) builder tests (Phase 5).
 *
 * - srtTimestamp formats seconds as SRT "HH:MM:SS,mmm".
 * - buildSrt builds cumulative line timings from the same voiceData the film
 *   uses, plus the inter-scene gap that matches remotion/lib/story-timing.ts.
 * - buildSrt fails loudly on empty subtitle text.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSrt, srtTimestamp } from '../scripts/lib/srt.mjs';

test('srtTimestamp formats seconds as SRT HH:MM:SS,mmm', () => {
  assert.equal(srtTimestamp(0), '00:00:00,000');
  assert.equal(srtTimestamp(1), '00:00:01,000');
  assert.equal(srtTimestamp(3661.5), '01:01:01,500');
  assert.equal(srtTimestamp(59.999), '00:00:59,999');
});

test('buildSrt produces cumulative line timings with the inter-scene gap', () => {
  const voiceData = JSON.parse(fs.readFileSync('tests/fixtures/tiny-voice.json', 'utf8'));
  const srt = buildSrt(voiceData, 0.75);
  const blocks = srt.trim().split(/\n\n+/);
  assert.equal(blocks.length, 2);

  // Scene 1: single line, 0.0s -> 1.0s.
  assert.equal(blocks[0], '1\n00:00:00,000 --> 00:00:01,000\nSTONE TEMPLES RISE');
  // Scene 2 starts after scene 1 audio (1.0s) + gap (0.75s) -> 1.75s -> 2.75s.
  assert.equal(blocks[1], '2\n00:00:01,750 --> 00:00:02,750\nWATER IS LIFE');
});

test('buildSrt fails loudly on empty subtitle text', () => {
  const voiceData = { scenes: [{ id: 's1', lines: [{ dur: 1, subtitle: '   ', text: '' }] }] };
  assert.throws(() => buildSrt(voiceData, 0.75), /empty subtitle text/);
});
