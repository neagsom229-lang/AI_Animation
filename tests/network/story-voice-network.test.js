/**
 * LIVE NETWORK test — runs ONLY with `npm run test:network`.
 *
 * `npm test` deliberately does not include tests/network/*.test.js: the offline
 * suite must never depend on edge-tts reaching Microsoft. This file makes one
 * real edge-tts call and fails loudly if the network or the service is down.
 */
'use strict';
import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, execSync } from 'child_process';
import { checkVoiceContract } from '../check-voice-data.mjs';

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
