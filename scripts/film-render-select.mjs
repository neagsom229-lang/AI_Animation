#!/usr/bin/env node
/**
 * @fileoverview Round 9 item 5: REAL draft render of selected scenes.
 *
 * Uses real images (normalized), real (labeled gradient) depth, and real
 * edge-tts voice. Renders each selected scene's exact frame range, times it,
 * stitches an MP4, and extracts 3 frames per scene for a before/after parallax
 * contact sheet (before = motion suppressed via parallaxMetrics=1; after =
 * real depth-edge-limited parallax). Reports ms/frame, size, and honesty notes.
 *
 * Usage: node scripts/film-render-select.mjs --scenes 1,4,7
 */
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { loadConfig, configHash } from './lib/film-config.mjs';
import { buildIllustratedTimeline } from '../remotion/lib/illustrated-timing.ts';
import { publicAssetPath } from '../remotion/lib/illustrated-assets.ts';
import { tileContactSheet } from './lib/contact-sheet.mjs';
import { stitchScenes } from './render-scenes.mjs';

const ROOT = process.cwd();

function parseArgs(argv) {
  const a = { scenes: [1, 4, 7], draft: true, story: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--scenes' && argv[i + 1]) a.scenes = argv[++i].split(',').map((n) => Number(n.trim()));
    else if (argv[i] === '--story' && argv[i + 1]) a.story = argv[++i];
    else if (argv[i] === '--final') a.draft = false;
    else throw new Error(`Unknown: ${argv[i]}`);
  }
  return a;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cfg = loadConfig(ROOT);
  if (args.story) cfg.story = args.story;
  const story = JSON.parse(fs.readFileSync(path.resolve(ROOT, cfg.story), 'utf8'));
  const storyName = path.basename(cfg.story, '.json');
  const voicePath = path.resolve(ROOT, `public/voice-${storyName}.json`);
  if (!fs.existsSync(voicePath)) throw new Error(`Real voice missing: ${voicePath}. Run film voice (without --draft).`);
  const voiceData = JSON.parse(fs.readFileSync(voicePath, 'utf8'));
  if (voiceData.provider === 'mock') throw new Error('voice.json is MOCK. Generate real voice first: python scripts/generate-voice.py ... (no --mock).');
  const timeline = buildIllustratedTimeline(voiceData, cfg.fps);
  console.log(`[render-select] voice=${voiceData.provider} scenes=${timeline.scenes.length} total=${(timeline.durationInFrames / cfg.fps).toFixed(1)}s`);

  // Stage real assets into public/illustrated/ for staticFile().
  for (const spec of story.scenes) {
    for (const rel of [spec.image, spec.image ? `${spec.image.replace(/\.[^.]+$/, '')}-depth${path.extname(spec.image)}` : null]) {
      if (!rel || !fs.existsSync(path.resolve(ROOT, rel))) continue;
      const dest = path.resolve(ROOT, 'public', publicAssetPath(rel));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.resolve(ROOT, rel), dest);
    }
  }

  const manifestPath = path.resolve(ROOT, cfg.paths.illustrations, 'manifest.json');
  const man = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { scenes: [] };
  const assetStatus = {};
  for (const spec of story.scenes) {
    const e = (man.scenes || []).find((x) => x.scene === story.scenes.indexOf(spec) + 1);
    const ext = spec.image ? path.extname(spec.image) : '';
    const depthRel = spec.image ? `${spec.image.slice(0, -ext.length)}-depth${ext}` : null;
    assetStatus[spec.id] = {
      image: Boolean(spec.image && fs.existsSync(path.resolve(ROOT, spec.image))),
      depth: Boolean(depthRel && fs.existsSync(path.resolve(ROOT, depthRel))),
      clip: false,
    };
    void e;
  }
  const metricsPath = path.resolve(ROOT, 'out/review/parallax-metrics.json');
  const realMetrics = fs.existsSync(metricsPath) ? JSON.parse(fs.readFileSync(metricsPath, 'utf8')) : { scenes: [] };
  const parallaxMetrics = {};
  for (const m of realMetrics.scenes || []) parallaxMetrics[m.scene] = m.depthEdgeMetric;

  const outDir = path.resolve(ROOT, 'build/preview/round9');
  fs.mkdirSync(outDir, { recursive: true });

  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'remotion/index.ts'), publicDir: path.join(ROOT, 'public'), onProgress: () => {} });
  const sceneFiles = [];
  const timing = [];
  const stillsBefore = [];
  const stillsAfter = [];

  for (const sceneNo of args.scenes) {
    const t = timeline.scenes[sceneNo - 1];
    if (!t) throw new Error(`Scene ${sceneNo} not in timeline.`);
    const spec = story.scenes[sceneNo - 1] || {};
    const inputProps = {
      story, voiceData, assetStatus, allowMissing: false,
      isDraft: args.draft, parallaxMetrics, musicPresent: false,
    };
    const composition = await selectComposition({ serveUrl, id: 'IllustratedFilm', inputProps });
    const start = t.startFrame;
    const end = t.startFrame + t.durationInFrames - 1;
    const mp4 = path.join(outDir, `scene-${String(sceneNo).padStart(2, '0')}.mp4`);
    let ms = 0;
    if (fs.existsSync(mp4) && fs.statSync(mp4).size > 0) {
      console.log(`[render-select] scene ${sceneNo}: VIDEO cached (resume)`);
    } else {
      const t0 = Date.now();
      await renderMedia({
        composition, serveUrl, codec: 'h264', outputLocation: mp4,
        frameRange: [start, end], inputProps, concurrency: cfg.concurrency, timeoutInMilliseconds: 60000,
        onProgress: () => {},
      });
      ms = Date.now() - t0;
    }
    const mspf = ms / t.durationInFrames;
    const bytes = fs.statSync(mp4).size;
    sceneFiles.push(mp4);
    timing.push({ scene: sceneNo, media: (spec.media && spec.media.type) || 'illustration', frames: t.durationInFrames, seconds: Number((t.durationInFrames / cfg.fps).toFixed(2)), ms: Math.round(ms), msPerFrame: Number(mspf.toFixed(1)), bytes, sizeMB: Number((bytes / 1e6).toFixed(2)) });
    console.log(`[render-select] scene ${sceneNo}: ${t.durationInFrames} frames in ${(ms / 1000).toFixed(1)}s = ${mspf.toFixed(1)} ms/frame, ${(bytes / 1e6).toFixed(2)} MB, media=${(spec.media && spec.media.type) || 'illustration'}`);

    // 3 frames each: before (parallax suppressed) and after (real parallax).
    const picks = [start, start + Math.floor(t.durationInFrames / 2), end];
    for (const [label, pm] of [['before', { ...parallaxMetrics, [t.id]: 1 }], ['after', parallaxMetrics]]) {
      const p = { ...inputProps, parallaxMetrics: pm };
      const c = await selectComposition({ serveUrl, id: 'IllustratedFilm', inputProps: p });
      for (let k = 0; k < picks.length; k += 1) {
        const f = path.join(outDir, `s${sceneNo}-${label}-${k}.png`);
        if (!fs.existsSync(f)) {
          await renderStill({ composition: c, serveUrl, output: f, frame: picks[k], inputProps: p, timeoutInMilliseconds: 60000 });
        }
        (label === 'before' ? stillsBefore : stillsAfter).push(f);
      }
    }
  }

  const merged = path.join(outDir, 'draft-scenes.mp4');
  stitchScenes(sceneFiles, merged);
  console.log(`[render-select] stitched: ${merged} (${(fs.statSync(merged).size / 1e6).toFixed(2)} MB)`);

  // Interleave before/after per scene: [b0,a0,b1,a1,...] per scene, cols=2.
  const cells = [];
  for (let s = 0; s < args.scenes.length; s += 1) {
    for (let k = 0; k < 3; k += 1) {
      cells.push(stillsBefore[s * 3 + k], stillsAfter[s * 3 + k]);
    }
  }
  const sheet = path.join(outDir, 'before-after-contact.png');
  tileContactSheet({ inputs: cells, output: sheet, cols: 2, cellWidth: 480 });
  fs.writeFileSync(path.join(outDir, 'timing.json'), JSON.stringify({ configHash: configHash(cfg), timing }, null, 2) + '\n', 'utf8');

  const honesty = [
    'REAL DRAFT RENDER — what I could NOT judge:',
    '- Parallax smearing on faces/hands: the sheet shows before (suppressed) vs after (real, gradient-limited) frames, but fine artifacts need human inspection at full resolution.',
    '- Faces/art quality/anachronisms/watermark: NOT judged; images are user-generated and unreviewed (matchesNarration/watermarkCheck false).',
    '- Scene 1 and 7 are world3d (3D Angkor set), NOT illustrations — per the story JSON; scene 4 is an illustration with labeled gradient depth.',
    '- Depth is a horizon-based gradient fallback (labeled), not a learned Depth Anything map (torch unavailable on Python 3.14).',
    '- No music present in assets-src/music/ — render is voice-only (honest).',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(outDir, 'honesty.txt'), honesty, 'utf8');
  console.log(`[render-select] before/after sheet: ${sheet}`);
  console.log(honesty);
  return 0;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().catch((e) => { console.error('render-select failed:', e.message); process.exit(1); });
