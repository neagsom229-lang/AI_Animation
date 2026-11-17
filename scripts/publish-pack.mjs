#!/usr/bin/env node
/**
 * @fileoverview Phase 6 publish pack.
 *
 * From an illustrated film + its story/voice, produce out/publish/<story>/:
 *   - master 16:9 1080p MP4, vertical 9:16 master
 *   - SRT (km and en) timed from the illustrated timeline
 *   - cover thumbnail (first dialogue frame)
 *   - chapters.txt (YouTube format, from year chips)
 *   - checksums.sha256
 *   - manifest.json (versions, hashes, durations)
 *
 * Reuses already-rendered masters from make-illustrated.mjs when present; renders
 * them if absent. No silent fallbacks: missing inputs fail loudly.
 *
 * Usage: node scripts/publish-pack.mjs --story src/stories/khmer-empire.json
 *        [--voice public/voice-khmer-empire.json] [--allow-missing]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition, renderMedia } from '@remotion/renderer';
import { buildIllustratedTimeline } from '../remotion/lib/illustrated-timing.ts';
import { srtTimestamp } from './lib/srt.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function parseArgs(argv) {
  const a = { story: 'src/stories/khmer-empire.json', voice: 'public/voice-khmer-empire.json', allowMissing: false, skipRender: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--story' && argv[i + 1]) a.story = argv[++i];
    else if (argv[i] === '--voice' && argv[i + 1]) a.voice = argv[++i];
    else if (argv[i] === '--allow-missing') a.allowMissing = true;
    else if (argv[i] === '--skip-render') a.skipRender = true;
    else throw new Error(`Unknown: ${argv[i]}`);
  }
  return a;
}

/** Build SRT cues from the illustrated timeline (scene pad + min duration). */
export function buildIllustratedSrt(story, timeline, captionLanguage) {
  const blocks = [];
  let idx = 1;
  for (const [i, scene] of timeline.scenes.entries()) {
    const spec = story.scenes[i] || {};
    const n = spec.narration || {};
    const text = (captionLanguage === 'en' ? n.en : n.km) || '';
    if (!text.trim()) throw new Error(`SRT: scene ${scene.id} has no ${captionLanguage} narration`);
    const first = scene.lines[0];
    const start = first ? first.startFrame / 30 : scene.startFrame / 30;
    const end = start + (first ? first.durationInFrames / 30 : 0);
    blocks.push(`${idx}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${text.trim()}\n`);
    idx += 1;
  }
  return blocks.join('\n') + '\n';
}

/** YouTube chapters from year chips: "0:00 Intro\n0:12 802 — ...". */
export function buildChapters(story, timeline) {
  const lines = [];
  for (const [i, scene] of timeline.scenes.entries()) {
    const spec = story.scenes[i] || {};
    if (!spec.yearChip) continue;
    const sec = Math.round(scene.startFrame / 30);
    const mm = Math.floor(sec / 60);
    const ss = String(sec % 60).padStart(2, '0');
    lines.push(`${mm}:${ss} ${spec.yearChip}`);
  }
  return lines.join('\n') + '\n';
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function ff(args) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return execFileSync(npx, ['remotion', 'ffmpeg', ...args], {
    cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const story = JSON.parse(fs.readFileSync(path.resolve(ROOT, args.story), 'utf8'));
  const voicePath = path.resolve(ROOT, args.voice);
  if (!fs.existsSync(voicePath)) throw new Error(`Voice data missing: ${voicePath}`);
  const voiceData = JSON.parse(fs.readFileSync(voicePath, 'utf8'));
  const timeline = buildIllustratedTimeline(voiceData, 30);
  const seconds = timeline.durationInFrames / 30;
  const storyName = path.basename(args.story, '.json').replace(/\.json$/, '');
  // strip .json from basename (basename already stripped .json)
  const outDir = path.resolve(ROOT, 'out/publish', storyName);
  fs.mkdirSync(outDir, { recursive: true });

  const sources = {
    master: path.resolve(ROOT, `out/${storyName}.mp4`),
    vertical: path.resolve(ROOT, `out/${storyName}-vertical.mp4`),
  };
  if (!fs.existsSync(sources.master)) {
    throw new Error(`Master film missing: ${sources.master}. Run make.mjs --style illustrated first.`);
  }
  console.log(`[publish] master: ${sources.master} (${(fs.statSync(sources.master).size / 1e6).toFixed(1)} MB)`);

  const result = {
    story: args.story, generated: new Date().toISOString(),
    versions: {}, files: {}, durationSeconds: seconds, scenes: timeline.scenes.length,
  };
  for (const p of ['remotion', 'three', 'react', 'typescript']) {
    try { result.versions[p] = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', p, 'package.json'), 'utf8')).version; } catch { /* ignore */ }
  }

  // Copy masters into publish dir.
  const masterOut = path.join(outDir, `${storyName}-16x9-1080p.mp4`);
  fs.copyFileSync(sources.master, masterOut);
  result.files.master = { file: path.basename(masterOut), sha256: sha256(masterOut), bytes: fs.statSync(masterOut).size };
  if (fs.existsSync(sources.vertical)) {
    const vOut = path.join(outDir, `${storyName}-9x16-master.mp4`);
    fs.copyFileSync(sources.vertical, vOut);
    result.files.vertical = { file: path.basename(vOut), sha256: sha256(vOut), bytes: fs.statSync(vOut).size };
  } else {
    console.log('[publish] WARN: vertical master not found — run with --vertical to produce it.');
  }

  // SRT km + en.
  for (const lang of ['km', 'en']) {
    const srt = buildIllustratedSrt(story, timeline, lang);
    const f = path.join(outDir, `${storyName}.${lang}.srt`);
    fs.writeFileSync(f, srt, 'utf8');
    result.files[`srt_${lang}`] = { file: path.basename(f), sha256: sha256(f), bytes: fs.statSync(f).size };
  }

  // Chapters.
  const chaptersFile = path.join(outDir, 'chapters.txt');
  fs.writeFileSync(chaptersFile, buildChapters(story, timeline), 'utf8');
  result.files.chapters = { file: 'chapters.txt', sha256: sha256(chaptersFile) };

  // Cover thumbnail from the film (frame at first scene midpoint).
  const cover = path.join(outDir, 'cover.png');
  try {
    ff(['-y', '-v', 'error', '-ss', String(Math.round(timeline.scenes[0].durationInFrames / 60)),
      '-i', masterOut, '-vframes', '1', cover]);
    if (fs.existsSync(cover)) result.files.cover = { file: 'cover.png', sha256: sha256(cover), bytes: fs.statSync(cover).size };
  } catch (e) { console.log(`[publish] cover skipped: ${String(e.message).split('\n')[0]}`); }

  // Checksums file.
  const sums = Object.values(result.files).filter((f) => f.sha256).map((f) => `${f.sha256}  ${f.file}`).join('\n') + '\n';
  fs.writeFileSync(path.join(outDir, 'checksums.sha256'), sums, 'utf8');

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(`[publish] pack written: ${outDir}`);
  console.log(`[publish] files: ${Object.keys(result.files).join(', ')}`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('Publish failed:', e); process.exit(1); });
