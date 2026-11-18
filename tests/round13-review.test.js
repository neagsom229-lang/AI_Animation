/** Round 13 item 5: review sheet + per-scene flags, never auto-filled. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseArgs, validateLicenseUrl, setLicenseUrl, reviewScene, buildReviewSheet, esc,
} from '../scripts/film-review.mjs';

const TMP = path.join('build', 'cache', 'round13-review');

function makeRoot() {
  fs.rmSync(TMP, { recursive: true, force: true });
  const ill = path.join(TMP, 'assets-src', 'illustrations');
  fs.mkdirSync(ill, { recursive: true });
  // Real config shape (validated by loadConfig), with an empty licence so the
  // review command is the only thing that can fill it.
  const cfg = JSON.parse(fs.readFileSync('film.config.json', 'utf8'));
  cfg.intake = { ...(cfg.intake || {}), licenseTermsUrl: '' };
  fs.writeFileSync(path.join(TMP, 'film.config.json'), JSON.stringify(cfg, null, 2));
  fs.writeFileSync(path.join(TMP, 'assets-src', 'illustrations', 'manifest.json'), JSON.stringify({
    profile: 'draft',
    scenes: [
      { scene: 1, file: 'assets-src/illustrations/scene-01.png', reviewed: false, matchesNarration: false, watermarkCheck: false, licenseTermsUrl: '' },
      { scene: 2, file: 'assets-src/illustrations/scene-02.png', reviewed: false, matchesNarration: false, watermarkCheck: false, licenseTermsUrl: '' },
      { scene: 3, file: 'assets-src/illustrations/scene-03.png', reviewed: false, matchesNarration: false, watermarkCheck: false, licenseTermsUrl: '' },
    ],
  }, null, 2));
  return { root: TMP, ill };
}

function readManifest(ill) {
  return JSON.parse(fs.readFileSync(path.join(ill, 'manifest.json'), 'utf8'));
}

test('review CLI parses sheet, scene flags, and license URL', () => {
  assert.equal(parseArgs(['sheet']).mode, 'sheet');
  const a = parseArgs(['--scene', '7', '--matches-narration', 'yes', '--watermark', 'clear', '--reviewed', 'yes']);
  assert.equal(a.scene, 7);
  assert.equal(a.matchesNarration, true);
  assert.equal(a.watermarkCheck, true);
  assert.equal(a.reviewed, true);
  assert.equal(parseArgs(['--scene', '2', '--watermark', 'visible']).watermarkCheck, false);
  assert.equal(parseArgs(['--license-url', 'https://example.com/terms']).licenseUrl, 'https://example.com/terms');
  assert.throws(() => parseArgs(['--matches-narration', 'yes']), /Nothing to do/);
  assert.throws(() => parseArgs(['--wat']), /Unknown argument/);
});

test('license URL must be a real http(s) URL (content not judged)', () => {
  assert.equal(validateLicenseUrl('https://example.com/t'), 'https://example.com/t');
  assert.equal(validateLicenseUrl('http://example.com'), 'http://example.com/');
  assert.throws(() => validateLicenseUrl('not a url'), /not a valid URL/);
  assert.throws(() => validateLicenseUrl('ftp://example.com/x'), /http\(s\)/);
});

test('--license-url writes intake.licenseTermsUrl only', () => {
  const { root } = makeRoot();
  const r = setLicenseUrl({ root, url: 'https://tool.example/licence' });
  assert.equal(r.licenseTermsUrl, 'https://tool.example/licence');
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'film.config.json'), 'utf8'));
  assert.equal(cfg.intake.licenseTermsUrl, 'https://tool.example/licence');
  assert.equal(cfg.story, 'src/stories/khmer-empire.json', 'other config untouched');
});

test('flags are set for THAT SCENE ONLY and the decision is logged', () => {
  const { root, ill } = makeRoot();
  const before = readManifest(ill);
  const r = reviewScene({ root, scene: 2, matchesNarration: true, watermarkCheck: true, reviewed: true, reviewer: 'tester' });
  assert.equal(r.scene, 2);
  assert.deepEqual(r.changed, ['matchesNarration', 'watermarkCheck', 'reviewed']);
  const after = readManifest(ill);
  const s2 = after.scenes.find((e) => e.scene === 2);
  assert.equal(s2.reviewed, true);
  assert.equal(s2.matchesNarration, true);
  assert.equal(s2.watermarkCheck, true);
  assert.equal(s2.review.by, 'tester');
  assert.ok(s2.review.at);
  assert.deepEqual(s2.review.changed, ['matchesNarration', 'watermarkCheck', 'reviewed']);
  for (const n of [1, 3]) {
    const e = after.scenes.find((x) => x.scene === n);
    const old = before.scenes.find((x) => x.scene === n);
    assert.deepEqual(e, old, `scene ${n} must be untouched`);
  }
  assert.equal(before.scenes.find((e) => e.scene === 2).reviewed, false, 'nothing pre-filled');
});

test('a false answer is recorded as false (no silent pass)', () => {
  const { root, ill } = makeRoot();
  reviewScene({ root, scene: 1, matchesNarration: false, watermarkCheck: false, reviewed: false, reviewer: 't' });
  const e = readManifest(ill).scenes.find((x) => x.scene === 1);
  assert.equal(e.matchesNarration, false);
  assert.equal(e.watermarkCheck, false);
  assert.equal(e.reviewed, false);
});

test('review of an unknown scene fails loudly', () => {
  const { root } = makeRoot();
  assert.throws(() => reviewScene({ root, scene: 99, reviewed: true }), /Scene 99 not found/);
});

test('review sheet is real HTML with narration, hash, source size, duplicate flag', () => {
  const out = path.join(TMP, 'review.html');
  const sheet = buildReviewSheet({ root: '.', outFile: out });
  assert.ok(sheet.scenes >= 18);
  assert.ok(fs.existsSync(out));
  const html = fs.readFileSync(out, 'utf8');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('Review sheet'));
  assert.ok(html.includes('sha256'));
  assert.ok(html.includes('source'));
  assert.ok(html.includes('duplicate'));
  assert.ok(html.includes('watermark'));
  assert.ok(/group \d+ \(\d+ scenes\)/.test(html), 'duplicate groups must be flagged');
  assert.ok(html.includes('narrative') === false);
  // Narration comes from the story file, not a hardcoded string.
  const story = JSON.parse(fs.readFileSync('src/stories/khmer-empire.json', 'utf8'));
  assert.ok(html.includes(esc(story.scenes[1].narration.en)), 'scene 2 narration must appear');
  assert.ok(html.includes('assets-src/illustrations/scene-02.png'), 'image path must be linked');
});

test('only film-review.mjs may set the manual flags to true', () => {
  const files = fs.readdirSync('scripts').filter((f) => f.endsWith('.mjs'));
  for (const f of files) {
    if (f === 'film-review.mjs') continue;
    const src = fs.readFileSync(path.join('scripts', f), 'utf8');
    assert.ok(!/\.(reviewed|matchesNarration|watermarkCheck)\s*=\s*true/.test(src), `${f} must not set review flags true`);
    assert.ok(!/intake\.licenseTermsUrl\s*=/.test(src), `${f} must not set licenseTermsUrl`);
  }
  const libFiles = fs.readdirSync('scripts/lib').filter((f) => f.endsWith('.mjs'));
  for (const f of libFiles) {
    const src = fs.readFileSync(path.join('scripts', 'lib', f), 'utf8');
    assert.ok(!/\.(reviewed|matchesNarration|watermarkCheck)\s*=\s*true/.test(src), `scripts/lib/${f} must not set review flags true`);
    assert.ok(!/intake\.licenseTermsUrl\s*=/.test(src), `scripts/lib/${f} must not set licenseTermsUrl`);
  }
});
