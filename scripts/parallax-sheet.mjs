#!/usr/bin/env node
/**
 * @fileoverview Phase 3 deliverable: 18-scene before/after parallax contact sheet.
 *
 * 'before' = full parallax (no depth-edge limiter, parallaxMetrics={}).
 * 'after'  = safety-limited parallax (metrics from out/review/parallax-metrics.json).
 * Renders one still per scene at the same frame for both settings and tiles them
 * into a 2-column sheet (rows = scenes). Uses --allow-missing placeholders when
 * real illustrations are absent, and says so in the output.
 *
 * Usage: node scripts/parallax-sheet.mjs [--story <path>] [--voice <path>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { buildIllustratedTimeline } from '../remotion/lib/illustrated-timing.ts';
import { tileContactSheet } from './lib/contact-sheet.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function parseArgs(argv) {
  const a = { story: 'src/stories/khmer-empire.json', voice: 'public/voice-khmer-empire.json' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--story' && argv[i + 1]) a.story = argv[++i];
    else if (argv[i] === '--voice' && argv[i + 1]) a.voice = argv[++i];
    else throw new Error(`Unknown: ${argv[i]}`);
  }
  return a;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const story = JSON.parse(fs.readFileSync(path.resolve(ROOT, args.story), 'utf8'));
  const voicePath = path.resolve(ROOT, args.voice);
  if (!fs.existsSync(voicePath)) throw new Error(`Voice data missing: ${voicePath} (run make-illustrated first).`);
  const voiceData = JSON.parse(fs.readFileSync(voicePath, 'utf8'));
  const timeline = buildIllustratedTimeline(voiceData, 30);

  const status = {};
  for (const s of story.scenes) status[s.id] = { image: false, depth: false, clip: false };
  const metricsPath = path.join(ROOT, 'out/review/parallax-metrics.json');
  const metrics = fs.existsSync(metricsPath) ? JSON.parse(fs.readFileSync(metricsPath, 'utf8')) : null;
  const afterMetrics = {};
  for (const s of (metrics?.scenes || [])) afterMetrics[s.scene] = s.depthEdgeMetric;

  console.log(`[parallax-sheet] ${timeline.scenes.length} scenes; ${metrics ? `loaded ${Object.keys(afterMetrics).length} metrics` : 'NO metrics (after = before)'}`);
  const hasRealAssets = fs.existsSync(path.join(ROOT, 'assets-src/illustrations/scene-01.png'));
  console.log(`[parallax-sheet] ${hasRealAssets ? 'real assets present' : 'NO real illustrations — rendering labeled PLACEHOLDER cards (visual quality unverified)'}`);

  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'remotion/index.ts'), publicDir: path.join(ROOT, 'public'), onProgress: () => {} });
  const outDir = path.join(ROOT, 'out/review');
  fs.mkdirSync(outDir, { recursive: true });
  const stills = [];

  for (const [label, pm] of [['before', {}], ['after', afterMetrics]]) {
    const inputProps = { story, voiceData, assetStatus: status, allowMissing: true, parallaxMetrics: pm, isDraft: true };
    const composition = await selectComposition({ serveUrl, id: 'IllustratedFilm', inputProps });
    for (const [i, scene] of timeline.scenes.entries()) {
      const frame = scene.startFrame + Math.floor(scene.durationInFrames / 2);
      const file = path.join(outDir, `parallax-${label}-${String(i + 1).padStart(2, '0')}.png`);
      await renderStill({ composition, serveUrl, output: file, frame, inputProps, timeoutInMilliseconds: 60000 });
      stills.push(file);
    }
  }

  // Interleave before/after per scene: [b1,a1,b2,a2,...] with cols=2.
  const interleaved = [];
  for (let i = 0; i < timeline.scenes.length; i += 1) {
    interleaved.push(stills[i], stills[timeline.scenes.length + i]);
  }
  const sheet = path.join(outDir, 'parallax-before-after-contact.png');
  tileContactSheet({ inputs: interleaved, output: sheet, cols: 2, cellWidth: 480 });
  console.log(`[parallax-sheet] wrote ${sheet} (${interleaved.length} cells, 2 columns: before | after)`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('Parallax sheet failed:', e); process.exit(1); });
