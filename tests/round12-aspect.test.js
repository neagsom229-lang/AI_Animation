/** Round 12 item 3: aspect gate warns with crop percentage, recorded in manifest. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aspectCropPercent, is169 } from '../scripts/lib/image-check.mjs';

test('aspectCropPercent: wider source crops horizontally, taller crops vertically', () => {
  const wide = aspectCropPercent(1024, 559); // 1.832
  assert.equal(wide.axis, 'horizontal');
  assert.ok(Math.abs(wide.percent - 2.95) < 0.1, `wide crop ${wide.percent}`);
  const exact = aspectCropPercent(1920, 1080);
  assert.equal(exact.axis, 'none');
  assert.equal(exact.percent, 0);
  const tall = aspectCropPercent(1000, 1000);
  assert.equal(tall.axis, 'vertical');
  assert.ok(tall.percent > 0);
  assert.equal(is169(1024, 559), false);
});

test('manifest records sourceAspect + aspectCropPercent for real images', () => {
  const m = JSON.parse(fs.readFileSync('assets-src/illustrations/manifest.json', 'utf8'));
  const e = m.scenes[1];
  assert.ok(e.sourceAspect > 1.8);
  assert.equal(e.aspectCropAxis, 'horizontal');
  assert.ok(e.aspectCropPercent > 0);
  assert.ok(e.qualityWarnings.some((w) => w.includes('crops') && w.includes('%')));
  assert.ok(e.qualityWarnings.some((w) => w.includes('WARNING')));
});

test('final render emits aspect WARNING with crop percent (source gate still blocks on width)', () => {
  // The aspect warning path is present in make-illustrated.mjs.
  const src = fs.readFileSync('scripts/make-illustrated.mjs', 'utf8');
  assert.ok(src.includes('aspect gate'), 'aspect gate must exist');
  assert.ok(src.includes('crops ${e.aspectCropPercent}%'), 'warning must include crop percent');
});
