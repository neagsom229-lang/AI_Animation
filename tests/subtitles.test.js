/**
 * @fileoverview Tests for the subtitle text + font resolution (Phase 2).
 *
 * getSubtitleFont must follow the narration language (km -> Khmer font stack,
 * en -> Latin font stack) and fail loudly on unknown languages.
 * getSubtitleText must prefer a human subtitle and fall back to spoken text,
 * and fail loudly on empty text.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { getSubtitleFont, getSubtitleText, SUBTITLE_FONTS } from '../remotion/lib/subtitles.ts';

test('getSubtitleFont returns the Khmer font stack for km', async () => {
  const { getSubtitleFont } = await import('../remotion/lib/subtitles.ts');
  assert.equal(getSubtitleFont('km'), '"Hanuman", "Khmer OS Battambang", "Noto Sans Khmer", sans-serif');
});

test('getSubtitleFont returns the Latin font stack for en', async () => {
  const { getSubtitleFont } = await import('../remotion/lib/subtitles.ts');
  assert.ok(getSubtitleFont('en').includes('Roboto') || getSubtitleFont('en').includes('Arial'));
  assert.notEqual(getSubtitleFont('en'), getSubtitleFont('km'));
});

test('getSubtitleFont fails loudly on an unknown language', async () => {
  const { getSubtitleFont } = await import('../remotion/lib/subtitles.ts');
  assert.throws(() => getSubtitleFont('xx'), /unknown language "xx"/);
});

test('getSubtitleText prefers the human subtitle over the spoken text', async () => {
  const { getSubtitleText } = await import('../remotion/lib/subtitles.ts');
  assert.equal(getSubtitleText({ text: 'Stone temples rise in the forest.', subtitle: 'STONE TEMPLES RISE' }), 'STONE TEMPLES RISE');
});

test('getSubtitleText falls back to spoken text and trims', async () => {
  const { getSubtitleText } = await import('../remotion/lib/subtitles.ts');
  assert.equal(getSubtitleText({ text: '  Water is life for the empire. ' }), 'Water is life for the empire.');
});

test('getSubtitleText fails loudly on empty text', async () => {
  const { getSubtitleText } = await import('../remotion/lib/subtitles.ts');
  assert.throws(() => getSubtitleText({ text: '   ' }), /non-empty string/);
});

test('SUBTITLE_FONTS covers the known narration languages', () => {
  assert.ok('km' in SUBTITLE_FONTS);
  assert.ok('en' in SUBTITLE_FONTS);
});
