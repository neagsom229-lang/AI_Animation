/**
 * @fileoverview Phase 5 QA for the illustrated film style.
 *
 * Covers: story schema validation, missing-file failures, depth-path presence,
 * parallax math purity, timeline length, ducking, year-chip timing, caption
 * safe area, CREDITS license coverage, and IllustratedFilm frame-hash
 * determinism with a committed tiny fixture.
 */
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

import { validateIllustratedStory, isIllustratedStory } from '../src/core/illustrated-story.js';
import { checkIllustratedAssets, depthPathFor, formatManifest } from '../scripts/illustrated-manifest.mjs';
import { publicAssetPath, depthPathFor as webDepthPath } from '../remotion/lib/illustrated-assets.ts';
import { illustratedSceneHash, ILLUSTRATED_CODE_VERSION } from '../scripts/lib/illustrated-scene-cache.mjs';
import {
  parallaxPose, musicVolume, DUCK_GAIN, yearChipOpacity, crossfadeOpacity, dipToBlack,
  dustParticle, OVERSCAN, MAX_PARALLAX,
} from '../remotion/lib/illustrated-motion.ts';
import { depthToOffset, depthToZ, smoothDepth, MAX_OFFSET, MAX_Z, PLANE_SEGMENTS_X, PLANE_SEGMENTS_Y } from '../remotion/lib/illustrated-depth.ts';
import { buildIllustratedTimeline, meetsMinimumDuration, SCENE_PAD_SEC, MIN_SCENE_SEC } from '../remotion/lib/illustrated-timing.ts';
import { SUBTITLE_LAYOUT } from '../remotion/lib/subtitles.ts';

const ROOT = path.resolve('.');
const STORY_PATH = 'src/stories/khmer-empire.json';
const story = JSON.parse(fs.readFileSync(STORY_PATH, 'utf8'));

// --- 1. Story validator ----------------------------------------------------
test('illustrated story: shipped story validates; schema is detected', () => {
  assert.equal(isIllustratedStory(story), true);
  assert.equal(validateIllustratedStory(story), true);
  assert.equal(story.scenes.length, 18);
});

test('illustrated story validator: rejects missing narration / bad fields', () => {
  const base = JSON.parse(JSON.stringify(story));
  delete base.scenes[0].narration.km;
  assert.throws(() => validateIllustratedStory(base), /narration\.km/);
  const bad = JSON.parse(JSON.stringify(story));
  bad.scenes[0].camera = 'zoom';
  assert.throws(() => validateIllustratedStory(bad), /unknown camera/);
  const badFx = JSON.parse(JSON.stringify(story));
  badFx.scenes[0].fx = ['teleport'];
  assert.throws(() => validateIllustratedStory(badFx), /unknown fx/);
  const badTrans = JSON.parse(JSON.stringify(story));
  badTrans.scenes[0].transition = 'wipe';
  assert.throws(() => validateIllustratedStory(badTrans), /unknown transition/);
});

// --- 2. Missing-file failures ---------------------------------------------
test('asset manifest: fails loudly by default, reports with --allow-missing', () => {
  assert.throws(() => checkIllustratedAssets(story), /Missing \d+ illustrated asset/);
  const report = checkIllustratedAssets(story, { allowMissing: true });
  assert.equal(report.allowMissing, true);
  assert.equal(report.scenes.length, 18);
  assert.ok(report.missing > 0);
  assert.ok(formatManifest(report).some((l) => l.includes('allow-missing')));
});

// --- 3. Depth file presence / path mapping --------------------------------
test('depth path mapping matches between Python, Node and web helpers', () => {
  const img = 'assets-src/illustrations/scene-01.png';
  assert.equal(depthPathFor(img), 'assets-src/illustrations/scene-01-depth.png');
  assert.equal(webDepthPath(img), depthPathFor(img));
  assert.equal(publicAssetPath(img), 'illustrated/illustrations/scene-01.png');
  assert.equal(publicAssetPath(depthPathFor(img)), 'illustrated/illustrations/scene-01-depth.png');
});

test('committed tiny fixture has both image and depth present', () => {
  const tiny = { scenes: [{ id: 'x', image: 'assets-src/illustrations/tiny.png' }] };
  // The tiny fixture is staged in public/illustrated, not assets-src; check web path.
  assert.ok(fs.existsSync(path.join(ROOT, 'public', publicAssetPath('assets-src/illustrations/tiny.png'))));
  assert.ok(fs.existsSync(path.join(ROOT, 'public', publicAssetPath(depthPathFor('assets-src/illustrations/tiny.png')))));
  assert.equal(tiny.scenes.length, 1);
});

// --- 4. Parallax / depth math purity --------------------------------------
test('parallaxPose is deterministic and bounded by MAX_PARALLAX', () => {
  for (const move of ['push-in', 'push-out', 'truck-left', 'truck-right', 'crane-up', 'static']) {
    for (const f of [0, 30, 120, 299]) {
      const a = parallaxPose(move, f, 30, 300, 'sc-01');
      const b = parallaxPose(move, f, 30, 300, 'sc-01');
      assert.deepEqual(a, b, `${move}@${f} not deterministic`);
      assert.ok(Math.abs(a.offsetX) <= MAX_PARALLAX, `${move}: offsetX out of range`);
      assert.ok(Math.abs(a.offsetY) <= MAX_PARALLAX, `${move}: offsetY out of range`);
      assert.ok(a.scale >= 1 + OVERSCAN - 1e-9, `${move}: scale below overscan`);
    }
  }
});

test('depth displacement helpers are clamped and NaN-free', () => {
  for (const d of [-1, 0, 0.25, 0.5, 0.75, 1, 2, NaN]) {
    const o = depthToOffset(d);
    const z = depthToZ(d);
    assert.ok(Number.isFinite(o) && Number.isFinite(z), 'non-finite output');
    assert.ok(Math.abs(o) <= MAX_OFFSET + 1e-9, 'offset not clamped');
    assert.ok(Math.abs(z) <= MAX_Z + 1e-9, 'z not clamped');
  }
  assert.equal(depthToOffset(0.5), 0);
  assert.equal(smoothDepth([[0, 0], [1, 1]], 0, 0), 0.5);
  assert.equal(PLANE_SEGMENTS_X, 192);
  assert.equal(PLANE_SEGMENTS_Y, 108);
});

test('ambient FX are deterministic frame-pure functions', () => {
  const a = dustParticle('sc-01', 3, 90, 30);
  const b = dustParticle('sc-01', 3, 90, 30);
  assert.deepEqual(a, b);
  for (const k of ['x', 'y', 'opacity']) assert.ok(Number.isFinite(a[k]) && a[k] >= 0 && a[k] <= 1, `${k} out of range`);
});

// --- 5. Timeline length ----------------------------------------------------
test('timeline: scene length = max(voice + 0.6s, 5s); 18 scenes reach >=120s', () => {
  const voice = { scenes: Array.from({ length: 18 }, (_, i) => ({
    id: `sc-${i + 1}`, lines: [{ dur: 6.6, file: 'x.mp3', text: 'x' }],
  })) };
  const tl = buildIllustratedTimeline(voice, 30);
  assert.equal(tl.scenes.length, 18);
  // 6.6 + 0.6 = 7.2 s = 216 frames per scene.
  assert.equal(tl.scenes[0].durationInFrames, Math.round((6.6 + SCENE_PAD_SEC) * 30));
  assert.equal(meetsMinimumDuration(tl, 120, 30), true);
  assert.ok(tl.durationInFrames / 30 > 120);
  // Short lines clamp to the 5 s floor.
  const short = { scenes: [{ id: 's', lines: [{ dur: 0.5, file: 'x' }] }] };
  assert.equal(buildIllustratedTimeline(short, 30).scenes[0].durationInFrames, Math.round(MIN_SCENE_SEC * 30));
});

// --- 6. Ducking ------------------------------------------------------------
test('music ducking: ~-14dB under voice, unity outside, smooth ramps', () => {
  const spans = [{ start: 30, end: 90 }];
  assert.equal(musicVolume(60, 30, spans), DUCK_GAIN);
  assert.equal(musicVolume(200, 30, spans), 1);
  assert.ok(DUCK_GAIN < 0.25 && DUCK_GAIN > 0.15, 'DUCK_GAIN should be ~-14dB');
  assert.ok(musicVolume(20, 30, spans) < 1 && musicVolume(20, 30, spans) > DUCK_GAIN, 'fade-in');
  assert.ok(musicVolume(100, 30, spans) > DUCK_GAIN && musicVolume(100, 30, spans) < 1, 'fade-out');
});

// --- 7. Year-chip timing ---------------------------------------------------
test('year chips: appear after crossfade, hold, then retire; transitions bounded', () => {
  assert.equal(yearChipOpacity(0, 30), 0);
  assert.ok(yearChipOpacity(30, 30) > 0);
  assert.equal(yearChipOpacity(60, 30), 1);
  assert.equal(yearChipOpacity(200, 30), 0);
  assert.equal(crossfadeOpacity(0, 30), 0);
  assert.equal(crossfadeOpacity(30, 30), 1);
  const black = dipToBlack(0, 30, 90);
  assert.ok(black >= 0 && black <= 1);
});

// --- 8. Caption safe area --------------------------------------------------
test('illustrated captions use the title-safe SUBTITLE_LAYOUT', () => {
  const src = fs.readFileSync(path.join(ROOT, 'remotion/compositions/IllustratedFilm.tsx'), 'utf8');
  assert.ok(/SUBTITLE_LAYOUT/.test(src), 'caption geometry must come from SUBTITLE_LAYOUT');
  assert.ok(SUBTITLE_LAYOUT.bottomPx >= 1080 * 0.05);
  assert.ok(SUBTITLE_LAYOUT.maxWidthPercent <= 80);
});

// --- 9. CREDITS license coverage ------------------------------------------
test('CREDITS records the depth model license and no non-permissive license', () => {
  const credits = fs.readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
  assert.ok(/Depth Anything V2 Small/.test(credits));
  assert.ok(/apache-2\.0/i.test(credits));
  assert.ok(!/non-commercial\s+license\s+only/i.test(credits));
});

// --- 10. Scene cache hash --------------------------------------------------
test('illustratedSceneHash keys on code version, image/depth and voice', () => {
  assert.ok(ILLUSTRATED_CODE_VERSION.startsWith('illustrated'));
  const args = { image: 'public/illustrated/illustrations/tiny.png', depth: 'public/illustrated/illustrations/tiny-depth.png', voiceScene: { dur: 1 } };
  const a = illustratedSceneHash(args);
  assert.equal(a, illustratedSceneHash(args));
  assert.notEqual(a, illustratedSceneHash({ ...args, voiceScene: { dur: 2 } }));
  assert.notEqual(a, illustratedSceneHash({ ...args, codeVersion: 'different' }));
});

// --- 11. Frame-hash determinism (render-based) -----------------------------
let serveUrlPromise = null;
function getServeUrl() {
  if (!serveUrlPromise) {
    serveUrlPromise = bundle({ entryPoint: path.resolve('remotion/index.ts'), publicDir: path.resolve('public'), onProgress: () => {} });
  }
  return serveUrlPromise;
}
async function renderHash(frame, tag) {
  const serveUrl = await getServeUrl();
  const storyFix = JSON.parse(fs.readFileSync('tests/fixtures/tiny-illustrated-story.json', 'utf8'));
  const voiceFix = JSON.parse(fs.readFileSync('tests/fixtures/tiny-illustrated-voice.json', 'utf8'));
  const assetStatus = {};
  for (const s of storyFix.scenes) assetStatus[s.id] = { image: true, depth: true, clip: false };
  const inputProps = { story: storyFix, voiceData: voiceFix, assetStatus, allowMissing: false };
  const composition = await selectComposition({ serveUrl, id: 'IllustratedFilm', inputProps });
  const out = path.join(ROOT, 'out', `illustrated-det-${tag}.png`);
  await renderStill({ composition, serveUrl, output: out, frame, inputProps, timeoutInMilliseconds: 60000 });
  return createHash('sha256').update(fs.readFileSync(out)).digest('hex');
}
test('IllustratedFilm: identical inputs produce identical frame hashes', async () => {
  const h1 = await renderHash(30, 'a');
  const h2 = await renderHash(30, 'b');
  assert.equal(h1, h2, 'identical inputs must render identical frames');
});
