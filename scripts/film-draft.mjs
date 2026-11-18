#!/usr/bin/env node
/**
 * @fileoverview Round 13 item 8: REAL draft render of selected scenes.
 *
 * One command gives one timestamped, clearly-labelled deliverable:
 *   out/drafts/<timestamp>/khmer-empire-DRAFT-NOT-RELEASABLE.mp4
 *   .../scene-NN-early|mid|late.png  (3 stills per scene)
 *   .../contact.png                  (3 x scenes contact sheet)
 *   .../report.json + REPORT.txt     (ms/frame, duration, size, ffprobe, estimate)
 *   .../honesty.txt                  (what CANNOT be judged from this draft)
 *
 * It uses the same real assets as film-render-select.mjs (normalized images,
 * real depth maps, real parallax metrics, real voice). The output is 720p and
 * is NEVER releasable — the final render has its own gates.
 *
 * Usage: node scripts/film-draft.mjs [--scenes 2,7,15 | --all] [--story <path>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { loadConfig, configHash } from './lib/film-config.mjs';
import { buildIllustratedTimeline } from '../remotion/lib/illustrated-timing.ts';
import { publicAssetPath } from '../remotion/lib/illustrated-assets.ts';
import { tileContactSheet } from './lib/contact-sheet.mjs';
import { stitchScenes } from './render-scenes.mjs';
import { runMedia } from './lib/media-bin.mjs';
import { buildImageRecords, groupDuplicates } from './lib/film-duplicates.mjs';
import { cachedPhash, loadCache, saveCache, pruneCache, newStats } from './lib/probe-cache.mjs';
import { estimate, MEASURED_MS_PER_FRAME } from './film-estimate.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DRAFT_LABEL = 'DRAFT-NOT-RELEASABLE';
export const DRAFTS_ROOT = 'out/drafts';

/** Parse draft CLI arguments. Throws with exact usage on bad input. */
export function parseArgs(argv) {
  const a = { scenes: [2, 7, 15], all: false, story: null, outDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--scenes' && argv[i + 1]) {
      const raw = String(argv[++i]).split(',').map((n) => Number(n.trim()));
      if (!raw.length || raw.some((n) => !Number.isInteger(n) || n < 1)) {
        throw new Error('--scenes needs a comma list of positive scene numbers (e.g. 2,7,15)');
      }
      a.scenes = [...new Set(raw)];
      a.all = false;
    } else if (argv[i] === '--all') {
      a.all = true;
    } else if (argv[i] === '--story' && argv[i + 1]) {
      a.story = argv[++i];
    } else if (argv[i] === '--out-dir' && argv[i + 1]) {
      a.outDir = argv[++i]; // Escape hatch for tests; production uses the timestamped path.
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      a.help = true;
    } else {
      throw new Error(`Unknown: ${argv[i]}. Usage: node scripts/film-draft.mjs [--scenes 2,7,15 | --all] [--story path]`);
    }
  }
  if (a.all && a.scenes.length !== 3 && argv.includes('--scenes')) {
    throw new Error('--all conflicts with --scenes');
  }
  return a;
}

/** Resolve the scene list against the real timeline, failing loudly on bad numbers. */
export function resolveScenes({ scenes, all }, timeline) {
  const total = timeline.scenes.length;
  const list = all ? Array.from({ length: total }, (_, i) => i + 1) : scenes;
  const bad = list.filter((n) => !Number.isInteger(n) || n < 1 || n > total);
  if (bad.length) throw new Error(`Scene(s) ${bad.join(', ')} not in timeline (1-${total}).`);
  return list;
}

/** Timestamped output directory: out/drafts/<timestamp>/. */
export function draftOutputDir({ root, storyName, timestamp = new Date(), outDir = null }) {
  if (outDir) return path.resolve(root, outDir);
  const ts = (timestamp instanceof Date ? timestamp : new Date(timestamp)).toISOString().replace(/[:.]/g, '-');
  return path.resolve(root, DRAFTS_ROOT, ts);
}

/** Labelled video filename — the word NOT RELEASABLE is part of the artifact. */
export function draftVideoName(storyName) {
  return `${storyName}-${DRAFT_LABEL}.mp4`;
}

/** Probe an MP4 with the bundled ffprobe (never throws). */
export function probeVideo(file) {
  const r = runMedia('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,codec_name,nb_frames:format=duration', '-of', 'json', file]);
  try {
    const o = r.out || '';
    const j = JSON.parse(o.slice(o.indexOf('{'), o.lastIndexOf('}') + 1));
    const s = (j.streams || [])[0] || {};
    return {
      ok: r.ok,
      width: Number(s.width), height: Number(s.height), codec: s.codec_name || '',
      frames: Number(s.nb_frames) || null, duration: j.format?.duration ? Number(j.format.duration) : null,
    };
  } catch { return { ok: false, error: 'ffprobe failed' }; }
}

/**
 * Compare measured ms/frame with the film estimate (a PREDICTION, not a result).
 * Pure. `timing` rows are {scene,frames,ms,msPerFrame,bytes,...}.
 */
export function compareEstimate({ timing, est }) {
  const byIndex = new Map((est?.rows || []).map((r) => [r.index, r]));
  const rows = timing.map((t) => {
    const e = byIndex.get(t.scene);
    const expected = e ? e.msPerFrame : null;
    return {
      scene: t.scene,
      frames: t.frames,
      measuredMsPerFrame: t.msPerFrame,
      estimatedMsPerFrame: expected,
      ratio: expected ? Number((t.msPerFrame / expected).toFixed(2)) : null,
    };
  });
  const frames = rows.reduce((s, r) => s + r.frames, 0);
  const ms = timing.reduce((s, t) => s + t.ms, 0);
  return {
    rows,
    measuredMsPerFrame: frames ? Number((ms / frames).toFixed(1)) : null,
    estimatedMsPerFrame: rows.length
      ? Number((rows.reduce((s, r) => s + (r.estimatedMsPerFrame || 0), 0) / rows.length).toFixed(1))
      : null,
    totalMeasuredSeconds: Number((ms / 1000).toFixed(1)),
  };
}

/**
 * Honest list of what this draft CANNOT prove. Built from real manifest/metrics.
 */
export function honestyNotes({ story, manifest, voiceData, metrics, sceneNumbers, label = DRAFT_LABEL }) {
  const scenes = manifest?.scenes || [];
  const unreviewed = scenes.filter((e) => e.reviewed !== true).map((e) => Number(e.scene));
  const noLicense = scenes.filter((e) => !e.licenseTermsUrl || !String(e.licenseTermsUrl).trim()).length;
  const dupes = (metrics?.duplicateGroups || []).map((g) => g.map((r) => r.scene).join('='));
  const depthSources = [...new Set((metrics?.scenes || []).map((m) => m.depthSource).filter(Boolean))];
  return [
    `${label} — this file is NOT RELEASABLE. Final render keeps every block.`,
    `- Art quality, faces, hands, anachronisms and watermark: NOT judged. ${unreviewed.length}/${scenes.length || story.scenes.length} scenes are unreviewed (matchesNarration / watermarkCheck are false).`,
    `- Licence: ${noLicense} scene(s) have no licenseTermsUrl in the manifest. The draft profile downgrades this to a warning; final blocks it.`,
    dupes.length ? `- Duplicate groups (${dupes.join('; ')}) are still present; these images are provisional.` : '- Duplicate check: no duplicate groups recorded.',
    `- Parallax is 2.5D (depth-based camera movement), NEVER true 3D. Depth sources in metrics: ${depthSources.join(', ') || 'unknown'}.`,
    '- The 3 stills per scene (early / mid / late) show a movement sample only; they cannot prove motion is smooth between them. View the MP4.',
    `- Voice: ${voiceData?.provider || 'unknown'} (${voiceData?.provider === 'mock' ? 'MOCK — not acceptable for final' : 'real TTS output'}). Music: not judged (no score gate in the draft).`,
    '- `film estimate` is a PREDICTION from measured ms/frame (not a result); the numbers here are the real render of these exact scenes, so a difference is expected and is not a failure.',
    `- Scenes rendered in this draft: ${sceneNumbers.join(', ')}. Unrendered scenes are not reviewed here.`,
  ].join('\n') + '\n';
}

/** Render the selected scenes for real and write the whole deliverable. */
export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('node scripts/film-draft.mjs [--scenes 2,7,15 | --all] [--story path]');
    return 0;
  }
  const cfg = loadConfig(ROOT);
  if (args.story) cfg.story = args.story;
  const story = JSON.parse(fs.readFileSync(path.resolve(ROOT, cfg.story), 'utf8'));
  const storyName = path.basename(cfg.story, '.json');
  const voicePath = path.resolve(ROOT, `public/voice-${storyName}.json`);
  if (!fs.existsSync(voicePath)) throw new Error(`Real voice missing: ${voicePath}. Run: node scripts/film.mjs voice`);
  const voiceData = JSON.parse(fs.readFileSync(voicePath, 'utf8'));
  if (voiceData.provider === 'mock') throw new Error('voice.json is MOCK. Generate real voice first: node scripts/film.mjs voice (no --draft).');
  const timeline = buildIllustratedTimeline(voiceData, cfg.fps);
  const scenes = resolveScenes(args, timeline);
  const outDir = draftOutputDir({ root: ROOT, storyName, outDir: args.outDir });
  fs.mkdirSync(outDir, { recursive: true });

  const estimateResult = estimate({
    story, timeline, cfg,
    baselines: MEASURED_MS_PER_FRAME,
    resolution: cfg.resolutions.draft,
  });

  // Stage the real normalized images + depth maps for Remotion staticFile().
  for (const spec of story.scenes) {
    for (const rel of [spec.image, spec.image ? `${spec.image.replace(/\.[^.]+$/, '')}-depth${path.extname(spec.image)}` : null]) {
      if (!rel || !fs.existsSync(path.resolve(ROOT, rel))) continue;
      const dest = path.resolve(ROOT, 'public', publicAssetPath(rel));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.resolve(ROOT, rel), dest);
    }
  }

  const manifestPath = path.resolve(ROOT, cfg.paths.illustrations, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { scenes: [] };
  const metricsPath = path.resolve(ROOT, 'out/review/parallax-metrics.json');
  const metrics = fs.existsSync(metricsPath) ? JSON.parse(fs.readFileSync(metricsPath, 'utf8')) : { scenes: [] };
  // Honesty note needs the REAL duplicate groups, not a guessed "none".
  const promptText = fs.existsSync(path.resolve(ROOT, cfg.intake.promptFile))
    ? fs.readFileSync(path.resolve(ROOT, cfg.intake.promptFile), 'utf8') : '';
  const probeCache = loadCache(ROOT);
  const probeStats = newStats();
  const records = buildImageRecords({
    story, promptsDoc: promptText, root: ROOT,
    phashFn: (file) => cachedPhash(file, { root: ROOT, cache: probeCache, stats: probeStats }),
  });
  saveCache(pruneCache(probeCache, ROOT), ROOT);
  const duplicateGroups = groupDuplicates(records);
  const parallaxMetrics = {};
  const limitFactors = {};
  for (const m of metrics.scenes || []) {
    parallaxMetrics[m.scene] = m.depthEdgeMetric;
    if (m.limitFactor !== undefined) limitFactors[m.scene] = m.limitFactor;
  }
  const assetStatus = {};
  story.scenes.forEach((spec, i) => {
    const ext = spec.image ? path.extname(spec.image) : '';
    const depthRel = spec.image ? `${spec.image.slice(0, -ext.length)}-depth${ext}` : null;
    assetStatus[spec.id] = {
      image: Boolean(spec.image && fs.existsSync(path.resolve(ROOT, spec.image))),
      depth: Boolean(depthRel && fs.existsSync(path.resolve(ROOT, depthRel))),
      clip: false,
    };
    void i;
  });

  console.log(`[film draft] ${DRAFT_LABEL} story=${cfg.story} profile=draft resolution=${estimateResult.resolution} scenes=${scenes.join(',')}`);
  console.log(`[film draft] output: ${path.relative(ROOT, outDir).replace(/\\/g, '/')}`);
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, 'remotion/index.ts'),
    publicDir: path.join(ROOT, 'public'),
    onProgress: () => {},
  });

  const inputProps = {
    story, voiceData, assetStatus, allowMissing: false,
    isDraft: true, parallaxMetrics, limitFactors, musicPresent: false,
  };
  const sceneFiles = [];
  const timing = [];
  const stills = [];
  const labels = ['early', 'mid', 'late'];

  for (const sceneNo of scenes) {
    const t = timeline.scenes[sceneNo - 1];
    const composition = await selectComposition({ serveUrl, id: 'IllustratedFilm', inputProps });
    const start = t.startFrame;
    const end = t.startFrame + t.durationInFrames - 1;
    const mp4 = path.join(outDir, `scene-${String(sceneNo).padStart(2, '0')}.mp4`);
    const t0 = Date.now();
    await renderMedia({
      composition, serveUrl, codec: 'h264', outputLocation: mp4,
      frameRange: [start, end], inputProps, concurrency: cfg.concurrency,
      timeoutInMilliseconds: 60000, onProgress: () => {},
    });
    const ms = Date.now() - t0;
    const bytes = fs.statSync(mp4).size;
    const msPerFrame = Number((ms / t.durationInFrames).toFixed(1));
    sceneFiles.push(mp4);
    timing.push({
      scene: sceneNo, id: t.id,
      media: (story.scenes[sceneNo - 1]?.media || {}).type || 'illustration',
      frames: t.durationInFrames,
      seconds: Number((t.durationInFrames / cfg.fps).toFixed(2)),
      ms, msPerFrame, bytes, sizeMB: Number((bytes / 1e6).toFixed(2)),
      limitFactor: limitFactors[t.id] ?? null,
    });
    console.log(`[film draft] scene ${sceneNo}: ${t.durationInFrames}f in ${(ms / 1000).toFixed(1)}s = ${msPerFrame} ms/frame, ${(bytes / 1e6).toFixed(2)} MB`);

    // 3 real stills per scene: 15% / 50% / 85% through the scene. The exact
    // start/end frames are crossfade-to-black, so they make useless stills.
    const picks = [0.15, 0.5, 0.85].map((f) => start + Math.floor(t.durationInFrames * f));
    for (let k = 0; k < picks.length; k += 1) {
      const f = path.join(outDir, `scene-${String(sceneNo).padStart(2, '0')}-${labels[k]}.png`);
      await renderStill({ composition, serveUrl, output: f, frame: picks[k], inputProps, timeoutInMilliseconds: 60000 });
      stills.push(f);
    }
  }

  const video = path.join(outDir, draftVideoName(storyName));
  stitchScenes(sceneFiles, video);
  const probe = probeVideo(video);
  const videoBytes = fs.statSync(video).size;
  const sheet = path.join(outDir, 'contact.png');
  const sheetInfo = tileContactSheet({ inputs: stills, output: sheet, cols: 3, cellWidth: 480 });
  const comparison = compareEstimate({ timing, est: estimateResult });

  const report = {
    label: DRAFT_LABEL,
    releasable: false,
    configHash: configHash(cfg),
    story: cfg.story,
    profile: 'draft',
    resolution: estimateResult.resolution,
    scenes,
    output: path.relative(ROOT, video).replace(/\\/g, '/'),
    videoBytes,
    videoSizeMB: Number((videoBytes / 1e6).toFixed(2)),
    ffprobe: probe,
    durationSeconds: probe.duration,
    msPerFrame: comparison.measuredMsPerFrame,
    estimateMsPerFrame: comparison.estimatedMsPerFrame,
    timing,
    estimateComparison: comparison.rows,
    contactSheet: { path: path.relative(ROOT, sheet).replace(/\\/g, '/'), ...sheetInfo },
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const honesty = honestyNotes({
    story, manifest, voiceData, sceneNumbers: scenes,
    metrics: { ...metrics, duplicateGroups },
  });
  fs.writeFileSync(path.join(outDir, 'honesty.txt'), honesty, 'utf8');
  const text = [
    `${DRAFT_LABEL} — NOT RELEASABLE`,
    `output: ${report.output}`,
    `scenes: ${scenes.join(', ')} (${estimateResult.resolution})`,
    `duration: ${probe.duration ?? 'unknown'} s; size: ${report.videoSizeMB} MB; bytes: ${videoBytes}`,
    `ffprobe: ${JSON.stringify(probe)}`,
    `measured: ${comparison.measuredMsPerFrame} ms/frame — film estimate: ${comparison.estimatedMsPerFrame} ms/frame (PREDICTION)`,
    ...comparison.rows.map((r) => `  scene ${r.scene}: ${r.measuredMsPerFrame} measured vs ${r.estimatedMsPerFrame} estimated (${r.ratio}x)`),
    `still contact sheet: ${path.relative(ROOT, sheet).replace(/\\/g, '/')} (${sheetInfo.frames} stills, ${sheetInfo.cols}x${sheetInfo.rows})`,
    '',
    honesty,
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'REPORT.txt'), text, 'utf8');

  console.log(`[film draft] DONE ${report.output} — ${report.durationSeconds ?? '?'}s, ${report.videoSizeMB} MB, ${comparison.measuredMsPerFrame} ms/frame`);
  console.log(`[film draft] compare to film estimate: ${comparison.estimatedMsPerFrame} ms/frame predicted`);
  console.log(`[film draft] stills: ${stills.length}; contact: ${path.relative(ROOT, sheet).replace(/\\/g, '/')}`);
  console.log(honesty);
  return 0;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('film draft failed:', e.message); process.exit(1); });
}
