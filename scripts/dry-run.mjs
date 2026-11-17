#!/usr/bin/env node
/**
 * @fileoverview Phase 8 dry run with fixtures (no real illustrations required).
 *
 * Runs the whole chain against the committed tiny fixtures / placeholder cards,
 * producing out/review/ artifacts:
 *   - 18-scene contact sheet, 3 frames each (start/middle/end),
 *   - timing table (per-scene frames + seconds),
 *   - ms/frame (draft + final) from a small timed render,
 *   - an explicit "what I could not judge" honesty note.
 *
 * Uses --allow-missing semantics; never claims visual quality of placeholders.
 *
 * Usage: node scripts/dry-run.mjs [--story src/stories/khmer-empire.json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, renderMedia, selectComposition } from '@remotion/renderer';
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

  // 18 scenes × 3 frames (start / middle / end of each scene).
  const status = {};
  for (const s of story.scenes) status[s.id] = { image: false, depth: false, clip: false };
  const inputProps = { story, voiceData, assetStatus: status, allowMissing: true, isDraft: true };
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'remotion/index.ts'), publicDir: path.join(ROOT, 'public'), onProgress: () => {} });
  const composition = await selectComposition({ serveUrl, id: 'IllustratedFilm', inputProps });
  const outDir = path.join(ROOT, 'out/review');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('[dry-run] rendering 3 frames per scene (start/mid/end)...');
  const stills = [];
  const timing = [];
  for (const [i, scene] of timeline.scenes.entries()) {
    const picks = [
      scene.startFrame,
      scene.startFrame + Math.floor(scene.durationInFrames / 2),
      scene.startFrame + scene.durationInFrames - 1,
    ];
    for (const frame of picks) {
      const f = path.join(outDir, `dryrun-s${String(i + 1).padStart(2, '0')}-f${frame}.png`);
      await renderStill({ composition, serveUrl, output: f, frame, inputProps, timeoutInMilliseconds: 60000 });
      stills.push(f);
    }
    timing.push({
      scene: scene.id,
      startFrame: scene.startFrame,
      durationFrames: scene.durationInFrames,
      seconds: Number((scene.durationInFrames / 30).toFixed(2)),
    });
  }

  // Tile each scene's 3 frames as a row → 18-row sheet (cols=3).
  const sheet = path.join(outDir, 'dryrun-18scene-3frames.png');
  tileContactSheet({ inputs: stills, output: sheet, cols: 3, cellWidth: 320 });
  console.log(`[dry-run] contact sheet: ${sheet} (${stills.length} cells)`);

  // Timing table.
  const timingFile = path.join(outDir, 'dryrun-timing.json');
  fs.writeFileSync(timingFile, JSON.stringify({ totalSeconds: timeline.durationInFrames / 30, scenes: timing }, null, 2) + '\n', 'utf8');
  console.log(`[dry-run] timing table: ${timingFile} (${timing.length} scenes, ${(timeline.durationInFrames / 30).toFixed(1)} s)`);

  // ms/frame on a short slice (draft 720p + final 1080p) with tiny fixtures.
  const ms = {};
  for (const draft of [true, false]) {
    const p = { ...inputProps, isDraft: draft };
    const comp = await selectComposition({ serveUrl, id: 'IllustratedFilm', inputProps: p });
    const t0 = Date.now();
    await renderMedia({ composition: comp, serveUrl, codec: 'h264',
      outputLocation: path.join(ROOT, `out/dryrun-perf-${draft ? 'draft' : 'final'}.mp4`),
      inputProps: p, frameRange: [0, 59], concurrency: 2, onProgress: () => {} });
    ms[draft ? 'draft720p' : 'final1080p'] = Number(((Date.now() - t0) / 60).toFixed(1));
  }
  const perfFile = path.join(outDir, 'dryrun-ms-per-frame.json');
  fs.writeFileSync(perfFile, JSON.stringify(ms, null, 2) + '\n', 'utf8');
  console.log(`[dry-run] ms/frame: draft 720p ${ms.draft720p}, final 1080p ${ms.final1080p}`);

  const honesty = [
    'DRY RUN — what I could NOT judge (fixtures/placeholders, no real illustrations):',
    '- Art quality, anachronisms, face/clothing detail: UNVERIFIED (placeholder cards rendered).',
    '- Depth-map quality and parallax smear on real faces/hands: UNVERIFIED.',
    '- Actual voice quality (mock TTS used if voice.json provider=mock): UNVERIFIED.',
    '- Whether year chips / captions look elegant over real art: UNVERIFIED.',
    '- Full-res ms/frame with 18 real illustrations: NOT measured (tiny fixture measured).',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(outDir, 'dryrun-honesty.txt'), honesty, 'utf8');
  console.log('[dry-run] honesty note: out/review/dryrun-honesty.txt');
  console.log(honesty);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('Dry run failed:', e); process.exit(1); });
