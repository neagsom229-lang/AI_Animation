/**
 * @fileoverview Tests for the `node scripts/make.mjs` CLI argument handling
 * (Phase 5). parseArgs is exported purely so it can be unit tested; the script
 * only executes the pipeline when run directly.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../scripts/make.mjs';

test('make.mjs parseArgs defaults: Khmer story, km lang, real voice, no mock', () => {
  const args = parseArgs([]);
  assert.equal(args.story, 'src/stories/khmer-temple.json');
  assert.equal(args.lang, 'km');
  assert.equal(args.mock, false);
  assert.equal(args.voice, undefined);
});

test('make.mjs parseArgs accepts --story / --lang / --voice', () => {
  const args = parseArgs([
    '--story', 'src/stories/historical-angkor.json',
    '--lang', 'en',
    '--voice', 'km-KH-SreymomNeural',
  ]);
  assert.equal(args.story, 'src/stories/historical-angkor.json');
  assert.equal(args.lang, 'en');
  assert.equal(args.voice, 'km-KH-SreymomNeural');
  assert.equal(args.mock, false);
});

test('make.mjs parseArgs --mock sets mock mode', () => {
  const args = parseArgs(['--mock']);
  assert.equal(args.mock, true);
  assert.equal(args.lang, 'km');
});

test('make.mjs parseArgs rejects unknown arguments', () => {
  assert.throws(() => parseArgs(['--bogus']), /Unknown or incomplete argument/);
});

test('make.mjs parseArgs rejects an unknown language', () => {
  assert.throws(() => parseArgs(['--lang', 'xx']), /unknown/i);
});

test('make.mjs parseArgs rejects a missing story file', () => {
  assert.throws(() => parseArgs(['--story', 'does-not-exist.json']), /not found/i);
});
