#!/usr/bin/env node
/**
 * @fileoverview Round 11 item 3: film estimate — predict render time for all 18
 * scenes at 720p and 1080p from measured ms/frame per media type. Flags slowest.
 *
 * Measured ms/frame (from out/review/draft-frames/MEASUREMENTS.md, real output):
 *   illustration 1280x720 ~223; world3d 1280x720 ~550-650.
 * 1080p is scaled by the pixel-count ratio (1920*1080)/(1280*720) = 2.25.
 * No metric is hardcoded into a result — these are inputs with provenance, and
 * the estimate is explicitly labelled as a prediction, not a measurement.
 *
 * Usage: node scripts/film-estimate.mjs [--story <path>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/film-config.mjs';
import { buildIllustratedTimeline } from '../remotion/lib/illustrated-timing.ts';

const ROOT = process.cwd();

/** Measured baselines with provenance. */
export const MEASURED_MS_PER_FRAME = {
  illustration: { ms720: 223, source: 'out/review/draft-frames/MEASUREMENTS.md (scene 4, real render)' },
  world3d: { ms720: 600, source: 'out/review/draft-frames/MEASUREMENTS.md (scenes 1/7, 646/552, midpoint 600)' },
  clip: { ms720: 40, source: 'cost.msPerFrame.clip in film.config.json (placeholder, unverified)' },
};

/** Scale ms/frame from 720p to a target resolution by pixel count. Pure. */
export function scaleMs(ms720, fromW, fromH, toW, toH) {
  return ms720 * ((toW * toH) / (fromW * fromH));
}

/** Estimate per-scene + total render seconds. Pure given inputs. */
export function estimate({ story, timeline, cfg, baselines, resolution }) {
  const [toW, toH] = resolution;
  const [fromW, fromH] = cfg.resolutions.draft;
  const rows = [];
  for (let i = 0; i < timeline.scenes.length; i += 1) {
    const t = timeline.scenes[i];
    const spec = story.scenes[i] || {};
    const media = (spec.media && spec.media.type) || (spec.clip ? 'clip' : 'illustration');
    const base = baselines[media] || baselines.illustration;
    const msPerFrame = scaleMs(base.ms720, fromW, fromH, toW, toH);
    rows.push({
      scene: spec.id, index: i + 1, media, frames: t.durationInFrames,
      msPerFrame: Number(msPerFrame.toFixed(1)),
      seconds: Number(((t.durationInFrames * msPerFrame) / 1000).toFixed(1)),
    });
  }
  const totalSeconds = rows.reduce((s, r) => s + r.seconds, 0);
  const slowest = [...rows].sort((a, b) => b.seconds - a.seconds).slice(0, 5);
  return { resolution: `${toW}x${toH}`, rows, totalSeconds: Number(totalSeconds.toFixed(1)), slowest };
}

function parseArgs(argv) {
  const a = { story: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--story' && argv[i + 1]) a.story = argv[++i];
    else throw new Error(`Unknown: ${argv[i]}`);
  }
  return a;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cfg = loadConfig(ROOT);
  if (args.story) cfg.story = args.story;
  const story = JSON.parse(fs.readFileSync(path.resolve(ROOT, cfg.story), 'utf8'));
  const voicePath = path.resolve(ROOT, `public/voice-${path.basename(cfg.story, '.json')}.json`);
  if (!fs.existsSync(voicePath)) throw new Error(`Voice data missing: ${voicePath}. Run film voice first.`);
  const voiceData = JSON.parse(fs.readFileSync(voicePath, 'utf8'));
  const timeline = buildIllustratedTimeline(voiceData, cfg.fps);

  console.log('film estimate — PREDICTION from measured ms/frame (not a measurement):');
  for (const [k, v] of Object.entries(MEASURED_MS_PER_FRAME)) {
    console.log(`  ${k}: ${v.ms720} ms/frame @720p — ${v.source}`);
  }
  const results = {};
  for (const [label, res] of [['720p draft', cfg.resolutions.draft], ['1080p master', cfg.resolutions.master]]) {
    const e = estimate({ story, timeline, cfg, baselines: MEASURED_MS_PER_FRAME, resolution: res });
    results[label] = e;
    console.log(`\n=== ${label} (${e.resolution}) ===`);
    console.log('scene     media          frames  ms/frame  est.s');
    for (const r of e.rows) {
      console.log(`${r.scene.padEnd(9)} ${r.media.padEnd(14)} ${String(r.frames).padEnd(7)} ${String(r.msPerFrame).padEnd(9)} ${r.seconds}`);
    }
    console.log(`TOTAL predicted: ${e.totalSeconds}s (${(e.totalSeconds / 60).toFixed(1)} min)`);
    console.log('SLOWEST 5: ' + e.slowest.map((r) => `${r.scene}=${r.seconds}s`).join(', '));
  }
  return 0;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('estimate failed:', e.message); process.exit(1); });
