/**
 * @fileoverview Phase 1 voice-data contract tests.
 *
 * These tests run the voice generator FRESHLY (never on stored files):
 *   - mock mode: exercises the full decode/envelope pipeline offline.
 *   - real mode: makes one live edge-tts call (network required; fails loudly).
 *
 * Contract per line (Phase 1):
 *   abs(len(env) - ceil(dur*20)) <= 2, unique values > 10, max === 1,
 *   real files are .mp3 with no "mock-" in the name, mock files are mock-*.wav,
 *   and ffprobe agrees with voice.json dur (real mode).
 *
 * The tests never write into public/ — all output goes to a temp dir.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, execSync } from 'child_process';
import { checkVoiceContract } from './check-voice-data.mjs';

function freshOutDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `kuan-voice-${tag}-`));
}

function runGenerator(extraArgs, outDir) {
  const jsonPath = path.join(outDir, 'voice.json');
  execFileSync('python', [
    'scripts/generate-voice.py',
    '--story', 'tests/fixtures/one-line-story.json',
    '--out', outDir,
    '--json', jsonPath,
    ...extraArgs,
  ], { stdio: 'inherit' });
  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
}

test('mock generation (fresh run) satisfies the Phase 1 voice contract', () => {
  const outDir = freshOutDir('mock');
  const voiceData = runGenerator(['--mock', '--lang', 'km', '--voice', 'km-KH-PisethNeural'], outDir);

  assert.equal(voiceData.provider, 'mock');
  assert.equal(voiceData.voice, 'km-KH-PisethNeural');
  assert.ok(voiceData.scenes.length > 0);

  const violations = checkVoiceContract(voiceData, outDir);
  assert.deepEqual(violations, [], 'mock data must satisfy the contract');

  for (const scene of voiceData.scenes) {
    for (const line of scene.lines) {
      assert.ok(path.basename(line.file).startsWith('mock-'), 'mock files must use the mock- prefix');
      assert.ok(line.file.endsWith('.wav'), 'mock files are genuine WAV files');
      assert.ok(!line.file.endsWith('.mp3'), 'mock WAV data must never be named .mp3');
    }
  }
});

test('real edge-tts generation (fresh run, network) satisfies the Phase 1 voice contract', () => {
  const outDir = freshOutDir('real');
  const voiceData = runGenerator(['--lang', 'km', '--voice', 'km-KH-PisethNeural'], outDir);

  assert.equal(voiceData.provider, 'edge-tts');
  const violations = checkVoiceContract(voiceData, outDir);
  assert.deepEqual(violations, [], 'real data must satisfy the contract');

  for (const scene of voiceData.scenes) {
    for (const line of scene.lines) {
      assert.ok(!line.file.includes('mock'), 'real files must never carry the mock prefix');
      assert.ok(line.file.endsWith('.mp3'), 'edge-tts outputs MP3; real voice files must be .mp3');

      // ffprobe must agree with voice.json dur (ffprobe prints seconds with 2 decimals).
      // ffprobe writes its report to stderr, so capture both streams.
      const full = path.resolve(outDir, line.file);
      const probe = execSync(`npx remotion ffprobe "${full}" 2>&1`, { encoding: 'utf8' });
      const match = probe.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      assert.ok(match, `ffprobe output missing Duration for ${line.file}`);
      const probeDur = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      assert.ok(
        Math.abs(probeDur - line.dur) <= 0.05,
        `ffprobe duration ${probeDur}s must match voice.json dur ${line.dur}s for ${line.file}`
      );
    }
  }
});

test('contract checker FAILS on the reported bug shape: 102 env samples for a 7.632s line', () => {
  // Exactly the shape reported for the time-compression bug:
  // 102 samples over a 7.632 s line = 13.4 Hz instead of 20 Hz (needs ceil(152.64)=153).
  const broken = {
    scenes: [{
      id: 'b1',
      lines: [{
        file: 'does-not-matter.mp3',
        dur: 7.632,
        env: Array.from({ length: 102 }, (_, i) => (i === 101 ? 1 : Math.abs(Math.sin(i / 7)))),
      }],
    }],
  };
  const violations = checkVoiceContract(broken, os.tmpdir());
  assert.equal(
    violations.filter((v) => v.includes('time-compressed')).length,
    1,
    `checker must flag time-compression exactly once, got: ${JSON.stringify(violations)}`
  );
});

test('contract checker FAILS on non-peak-normalised and flat envelopes', () => {
  // max !== 1 (not normalised by peak)
  const unnormalised = {
    scenes: [{ id: 'b1', lines: [{ file: 'x.mp3', dur: 1, env: Array.from({ length: 20 }, (_, i) => 0.5) }] }],
  };
  assert.ok(checkVoiceContract(unnormalised, os.tmpdir()).some((v) => v.includes('peak normalisation')));

  // flat envelope (1 unique value)
  const flat = {
    scenes: [{ id: 'b1', lines: [{ file: 'x.mp3', dur: 1, env: Array.from({ length: 20 }, () => (0)) }] }],
  };
  assert.ok(checkVoiceContract(flat, os.tmpdir()).some((v) => v.includes('unique values')));
});

test('scene frame math: frames = round(sum of real durations * fps) stays positive and consistent', () => {
  const outDir = freshOutDir('frames');
  const voiceData = runGenerator(['--mock', '--lang', 'km'], outDir);
  const fps = 30;
  let totalSec = 0;
  for (const scene of voiceData.scenes) {
    let lineSum = 0;
    for (const line of scene.lines) lineSum += line.dur;
    // Scene dur must equal the sum of its line durations (rounded to ms).
    assert.ok(
      Math.abs(scene.dur - lineSum) <= 0.002,
      `scene ${scene.id} dur ${scene.dur} must equal sum of lines ${lineSum}`
    );
    totalSec += scene.dur;
  }
  const totalFrames = Math.round(totalSec * fps);
  assert.ok(totalFrames > 0);
  assert.equal(totalFrames, Math.round(voiceData.scenes.reduce((n, s) => n + Math.round(s.dur * fps), 0)));
});
