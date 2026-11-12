#!/usr/bin/env node
/**
 * Phase 1 verification (step 4): proves the Deterministic Frame Contract.
 *
 * Renders the `DeterminismTest` composition (3 s, 1920x1080 @ 30 fps) TWICE,
 * fully independently, then compares:
 *
 *   1. VIDEO  — SHA-256 of both MP4s must match (byte-identical renders).
 *   2. FRAMES — per-frame PNG stills rendered in two independent passes at
 *               sampled frame indices; SHA-256 of each pair must match
 *               (pixel-identical frames, the "frame-hash" check).
 *
 * Exit code 0 = deterministic; 1 = frame drift detected.
 *
 * Usage: node scripts/verify-determinism.mjs [--composition DeterminismTest]
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = path.join(ROOT, 'out');
const ENTRY_POINT = path.join(ROOT, 'remotion', 'index.ts');
const FRAMES = [0, 15, 30, 45, 60, 75, 89];

const sha256 = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');

const argComposition = (() => {
  const idx = process.argv.indexOf('--composition');
  const value = idx !== -1 ? process.argv[idx + 1] : undefined;
  return value && value.length > 0 ? value : 'DeterminismTest';
})();

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('[1/5] Bundling Remotion project...');
  const serveUrl = await bundle({
    entryPoint: ENTRY_POINT,
    onProgress: () => {}
  });

  console.log(`[2/5] Selecting composition "${argComposition}"...`);
  const composition = await selectComposition({ serveUrl, id: argComposition });
  console.log(
    `      ${composition.width}x${composition.height} @ ${composition.fps} fps, ` +
      `${composition.durationInFrames} frames ` +
      `(${(composition.durationInFrames / composition.fps).toFixed(1)} s)`
  );

  console.log('[3/5] Rendering the full video twice (independent runs)...');
  const run1 = path.join(OUT_DIR, 'determinism-run1.mp4');
  const run2 = path.join(OUT_DIR, 'determinism-run2.mp4');
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: run1,
    onProgress: () => {}
  });
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: run2,
    onProgress: () => {}
  });
  const videoHash1 = sha256(run1);
  const videoHash2 = sha256(run2);
  const videoIdentical = videoHash1 === videoHash2;

  console.log('[4/5] Rendering per-frame stills in two independent passes...');
  const pass1 = [];
  const pass2 = [];
  for (const frame of FRAMES) {
    const stills = [];
    for (const pass of [1, 2]) {
      const file = path.join(
        OUT_DIR,
        `determinism-frame-${String(frame).padStart(3, '0')}-pass${pass}.png`
      );
      await renderStill({ composition, serveUrl, frame, output: file });
      stills.push(sha256(file));
    }
    pass1.push(stills[0]);
    pass2.push(stills[1]);
    const frameHash = stills[0].slice(0, 12);
    console.log(
      `      frame ${String(frame).padStart(3, ' ')}  hash ${frameHash}  ` +
        (stills[0] === stills[1] ? 'MATCH' : 'DRIFT')
    );
  }
  const framesIdentical = pass1.every((hash, i) => hash === pass2[i]);

  console.log('[5/5] Verdict');
  console.log(`      video  sha256 run1: ${videoHash1}`);
  console.log(`             sha256 run2: ${videoHash2}`);
  const table = [];
  for (let i = 0; i < FRAMES.length; i += 1) {
    table.push(`frame ${FRAMES[i]}: ${pass1[i] === pass2[i] ? 'identical' : 'DIFFERENT'}`);
  }
  console.log(`      frames: ${table.join(', ')}`);

  if (videoIdentical && framesIdentical) {
    console.log(
      `\nPASS — rendering is fully deterministic: identical bytes across two ` +
        `independent video renders and identical pixels for every sampled frame.`
    );
    return;
  }

  if (!videoIdentical && framesIdentical) {
    console.error(
      '\nFAIL — every sampled frame is pixel-identical, but the two MP4 ' +
        'files differ at byte level (encoder-level variance). Frame content is ' +
        'deterministic; investigate encoder settings.'
    );
  } else {
    console.error(
      '\nFAIL — frame drift detected. Check for wall-clock time, ' +
        'Math.random(), or unseeded WebGL state in the composition.'
    );
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error('Verification crashed:', error);
  process.exit(1);
});
