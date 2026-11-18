/** Round 15 item 5: pinned voice, 3 retries, explicit fallback only. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseArgs } from '../scripts/film.mjs';

const py = fs.readFileSync('scripts/generate-voice.py', 'utf8');

test('film CLI parses --allow-fallback', () => {
  assert.equal(parseArgs(['voice']).allowFallback, false);
  assert.equal(parseArgs(['voice', '--allow-fallback']).allowFallback, true);
});

test('primary voice gets exactly 3 attempts with backoff before STOP', () => {
  assert.match(py, /def generate_edge_with_retry\(text, voice, out_path, rate=None, attempts=3,/);
  assert.match(py, /for attempt in range\(attempts\)/);
  assert.match(py, /time\.sleep\(0\.5 \* \(2 \*\* attempt\)\)/);
  assert.match(py, /if not allow_fallback:\s*raise RuntimeError/);
  assert.match(py, /STOPPING — narrator would change silently/);
});

test('alternate voices are tried ONLY with explicit --allow-fallback and are logged', () => {
  assert.match(py, /allow_fallback=args\.allow_fallback/);
  assert.match(py, /\[FALLBACK\] scene \{scene_id\}: pinned/);
  assert.match(py, /"fallbackScenes": \[\]/);
  assert.match(py, /for alt in alternate_voices\(voice\)/);
  assert.match(py, /--allow-fallback', action='store_true'/);
});

test('voice manifest stores pinned voice, rate and per-scene duration', () => {
  assert.match(py, /"voiceId": voice, *# pinned narrator/);
  assert.match(py, /"allowFallback": bool\(args\.allow_fallback\)/);
  assert.match(py, /"duration": round\(scene_total_dur, 3\)/);
  assert.match(py, /"voiceId": voice,\s*"rate": args\.rate,/);
});

test('film.config.json pins the narrator voice and rate', () => {
  const cfg = JSON.parse(fs.readFileSync('film.config.json', 'utf8'));
  assert.equal(cfg.tts.voice, 'km-KH-PisethNeural');
  assert.equal(cfg.tts.rate, 0);
});

test('film voice command times the step and reports pin/fallback state', () => {
  const src = fs.readFileSync('scripts/film.mjs', 'utf8');
  assert.match(src, /const voiceStarted = Date\.now\(\)/);
  assert.match(src, /elapsed=\$\{Date\.now\(\) - voiceStarted\} ms/);
  assert.match(src, /pinned=\$\{cfg\.tts\.voice\}/);
  assert.match(src, /--allow-fallback/);
});
