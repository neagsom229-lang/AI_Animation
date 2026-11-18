/** Round 11 item 3: render cost estimate (pure math + CLI). */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleMs, estimate, MEASURED_MS_PER_FRAME } from '../scripts/film-estimate.mjs';

const cfg = { resolutions: { draft: [1280, 720], master: [1920, 1080] } };
const story = { scenes: [
  { id: 'a', media: { type: 'illustration' } },
  { id: 'b', media: { type: 'world3d' } },
] };
const timeline = { scenes: [
  { id: 'a', durationInFrames: 300 },
  { id: 'b', durationInFrames: 300 },
], durationInFrames: 600 };

test('scaleMs: 1080p = 2.25x 720p by pixel count', () => {
  assert.ok(Math.abs(scaleMs(100, 1280, 720, 1920, 1080) - 225) < 1e-9);
  assert.equal(scaleMs(100, 1280, 720, 1280, 720), 100);
});

test('estimate: world3d scenes dominate, slowest flagged', () => {
  const e = estimate({ story, timeline, cfg, baselines: MEASURED_MS_PER_FRAME, resolution: [1280, 720] });
  assert.equal(e.rows.length, 2);
  assert.ok(e.rows[1].seconds > e.rows[0].seconds, 'world3d slower than illustration');
  assert.equal(e.slowest[0].scene, 'b');
  assert.equal(e.totalSeconds, e.rows.reduce((s, r) => s + r.seconds, 0).toFixed(1) * 1);
});

test('estimate scales total for 1080p', () => {
  const lo = estimate({ story, timeline, cfg, baselines: MEASURED_MS_PER_FRAME, resolution: [1280, 720] });
  const hi = estimate({ story, timeline, cfg, baselines: MEASURED_MS_PER_FRAME, resolution: [1920, 1080] });
  assert.ok(hi.totalSeconds > lo.totalSeconds);
});

test('baselines carry provenance (not fabricated)', () => {
  assert.ok(MEASURED_MS_PER_FRAME.illustration.source.includes('out/drafts/2026-11-18T03-58-14-790Z/report.json'));
  assert.ok(MEASURED_MS_PER_FRAME.world3d.source.includes('out/drafts/2026-11-18T03-58-14-790Z/report.json'));
});

test('Round 15 item 7: illustration baseline re-baselined to ~62 ms/frame', () => {
  assert.ok(MEASURED_MS_PER_FRAME.illustration.ms720 >= 60 && MEASURED_MS_PER_FRAME.illustration.ms720 <= 65,
    `illustration baseline ${MEASURED_MS_PER_FRAME.illustration.ms720} must be ~62`);
  assert.ok(MEASURED_MS_PER_FRAME.illustration.source.includes('Round 15'), 'source must cite the latest measurements');
  assert.ok(MEASURED_MS_PER_FRAME.world3d.ms720 >= 440 && MEASURED_MS_PER_FRAME.world3d.ms720 <= 570);
});

test('cold start is separate, not folded into scene ms/frame', async () => {
  const m = await import('../scripts/film-estimate.mjs');
  assert.match(m.COLD_START_NOTE, /EXCLUDED from these baselines/);
});
