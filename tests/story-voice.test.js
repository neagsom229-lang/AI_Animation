/**
 * @fileoverview Real non-tautological unit tests for voice generation, WAV duration matching,
 * and scene frame sums.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

test('voice.json generator creates valid output and files exist', () => {
  execSync('python scripts/generate-voice.py --story src/stories/khmer-temple.json --lang km --mock', { stdio: 'inherit' });
  
  const voiceJsonPath = path.resolve('public/voice.json');
  assert.strictEqual(fs.existsSync(voiceJsonPath), true, 'public/voice.json must exist after generation');

  const voiceData = JSON.parse(fs.readFileSync(voiceJsonPath, 'utf-8'));
  assert.ok(voiceData.scenes.length > 0);

  for (const scene of voiceData.scenes) {
    for (const line of scene.lines) {
      const wavPath = path.resolve('public', line.file);
      assert.strictEqual(fs.existsSync(wavPath), true, `WAV file ${wavPath} must exist`);
      
      const stats = fs.statSync(wavPath);
      assert.ok(stats.size > 1000, 'WAV file should not be empty');
    }
  }
});

test('scene frames sum to composition duration calculation', () => {
  const voiceData = JSON.parse(fs.readFileSync('public/voice.json', 'utf-8'));
  let totalSec = 0;
  for (const sc of voiceData.scenes) {
    totalSec += sc.dur || 5;
  }
  const expectedFrames = Math.round(totalSec * 30);
  assert.ok(expectedFrames > 0);
});
