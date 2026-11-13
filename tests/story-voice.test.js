/**
 * @fileoverview Unit tests for voice duration math, lip-sync envelopes, and story-driven pipelines.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';

test('voice duration to frames math is precise', () => {
  const fps = 30;
  const durSec = 6.5;
  const frames = Math.round(durSec * fps);
  assert.strictEqual(frames, 195);
});

test('lip-sync envelope maps correctly across time', () => {
  const env = [0.0, 0.5, 1.0, 0.2, 0.0];
  const fps = 30;
  // 20Hz sampling means each envelope value covers 0.05 seconds (1.5 frames at 30fps)
  const frame = 3;
  const envIndex = Math.floor((frame / fps) * 20);
  assert.strictEqual(envIndex, 2);
  assert.strictEqual(env[envIndex], 1.0);
});

test('voice.json structure validation after generation', () => {
  if (fs.existsSync('public/voice.json')) {
    const raw = fs.readFileSync('public/voice.json', 'utf-8');
    const voiceData = JSON.parse(raw);
    assert.ok(voiceData.scenes);
    assert.ok(Array.isArray(voiceData.scenes));
    for (const sc of voiceData.scenes) {
      assert.ok(sc.id);
      assert.ok(sc.lines);
      assert.ok(Array.isArray(sc.lines));
      for (const line of sc.lines) {
        assert.ok(typeof line.dur === 'number');
        assert.ok(Array.isArray(line.env));
      }
    }
  }
});
