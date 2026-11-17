/** Phase 2 QA: pure intake validation helpers + intake CLI arg parsing. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  is169, hasAlpha, isLargeEnough, validateImage, sceneNumberFromName,
  targetName, isManifestEntryReady, REQUIRED_MANIFEST_FIELDS, realEsrganAvailable,
} from '../scripts/lib/image-check.mjs';
import { parseArgs as intakeArgs } from '../scripts/intake-illustrations.mjs';

test('is169: 16:9 within ±2% accepted, others rejected', () => {
  assert.equal(is169(1920, 1080), true);
  assert.equal(is169(1920, 1060), true);  // ~1.8% off
  assert.equal(is169(1920, 900), false);  // 6% off
  assert.equal(is169(0, 0), false);
  assert.equal(is169(NaN, 1080), false);
});

test('hasAlpha: detects common alpha pix_fmts', () => {
  assert.equal(hasAlpha('rgba'), true);
  assert.equal(hasAlpha('argb'), true);
  assert.equal(hasAlpha('yuva420p'), true);
  assert.equal(hasAlpha('rgb24'), false);
  assert.equal(hasAlpha('yuv420p'), false);
  assert.equal(hasAlpha(''), false);
});

test('isLargeEnough: >=1920x1080', () => {
  assert.equal(isLargeEnough(1920, 1080), true);
  assert.equal(isLargeEnough(1919, 1080), false);
  assert.equal(isLargeEnough(3840, 2160), true);
});

test('validateImage aggregates errors + fix flags', () => {
  const good = validateImage({ width: 1920, height: 1080, pixFmt: 'yuv420p', format: '.png' });
  assert.equal(good.ok, true);
  const small = validateImage({ width: 800, height: 450, pixFmt: 'rgba', format: '.jpg' });
  assert.equal(small.ok, false);
  assert.ok(small.errors.some((e) => /too small/.test(e)));
  assert.equal(small.alpha, true);
  assert.equal(small.needsFlatten, true);
  const odd = validateImage({ width: 1000, height: 1000, pixFmt: 'rgb24', format: '.bmp' });
  assert.ok(odd.errors.some((e) => /unsupported format/.test(e)));
  assert.ok(odd.errors.some((e) => /aspect/.test(e)));
});

test('sceneNumberFromName + targetName', () => {
  assert.equal(sceneNumberFromName('scene-07.png'), 7);
  assert.equal(sceneNumberFromName('illustration_3.jpg'), 3);
  assert.equal(sceneNumberFromName('no-number.png'), null);
  assert.equal(targetName(7), 'scene-07.png');
  assert.equal(targetName(1), 'scene-01.png');
});

test('manifest readiness requires all fields + reviewed:true', () => {
  const complete = {
    scene: 1, reviewed: true, tool: 'X', date: '2026-11-17',
    prompt: 'p', licenseTermsUrl: 'https://x',
    watermarkCheck: true, matchesNarration: true, // Round 9 required checklist flags
  };
  assert.equal(isManifestEntryReady(complete), true);
  assert.equal(isManifestEntryReady({ ...complete, reviewed: false }), false);
  for (const k of REQUIRED_MANIFEST_FIELDS) {
    const bad = { ...complete }; bad[k] = '';
    assert.equal(isManifestEntryReady(bad), false, `empty ${k} must fail`);
  }
  assert.equal(realEsrganAvailable(''), false);
  assert.equal(realEsrganAvailable('C:/tools/realesrgan.exe'), true);
});

test('intake parseArgs enforces folder + flags', () => {
  const a = intakeArgs(['art', '--tool', 'X', '--license-terms-url', 'url', '--prompt-file', 'p.md']);
  assert.equal(a.folder, 'art');
  assert.equal(a.tool, 'X');
  assert.equal(a.allowMissingFields, false);
  assert.throws(() => intakeArgs([]), /Usage/);
  assert.throws(() => intakeArgs(['art', '--bogus']), /Unknown/);
});
