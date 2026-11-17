/**
 * @fileoverview PER-SCENE RENDER CACHE (Round 5, Item 5).
 *
 * Renders each story scene to its OWN MP4, keyed by a content hash of
 *   (scene spec + its voice lines + assets/code bundle hash + pipeline version)
 * and stitches the per-scene files with Remotion's ffmpeg. Only scenes whose
 * hash changed are re-rendered; the rest are served from out/.scene-cache/.
 *
 * This is the "only changed scenes re-render" requirement. A one-line caption
 * edit in scene k2 re-renders k2 only (a few seconds) instead of the whole
 * film (minutes on this Intel UHD box).
 *
 * Usage:
 *   node scripts/render-scenes.mjs --story src/stories/khmer-temple.json \
 *       --voice public/voice.json --out out/khmer-temple.mp4 [--draft] [--gl angle]
 *
 * Windows note: use the direct node form (npm run -- flag passing breaks).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { getOrCreateBundle, computeBundleHash } from './lib/bundle-cache.mjs';
import { validateCharacterLibrary } from '../src/characters/library.js';
import { buildStoryTimeline } from '../remotion/lib/story-timing.ts';
import {
  runPreflight,
  formatPreflight,
  snapshotChromePids,
  reapNewRemotionChrome,
  DEFAULT_CONCURRENCY
} from './preflight.mjs';
import { resolveBrowser } from './lib/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** Bump when the renderer changes so every scene cache invalidates. */
export const PIPELINE_VERSION = 'round5-scene-cache-v1';

export function parseArgs(argv) {
  const args = {
    story: 'src/stories/khmer-temple.json',
    voice: 'public/voice.json',
    out: null,
    draft: false,
    gl: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--story' && argv[i + 1]) args.story = argv[++i];
    else if (a === '--voice' && argv[i + 1]) args.voice = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (a === '--draft') args.draft = true;
    else if (a === '--gl' && argv[i + 1]) args.gl = argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${a}`);
  }
  if (!args.out) throw new Error('--out is required (final stitched MP4).');
  if (!fs.existsSync(args.story)) throw new Error(`Story not found: ${args.story}`);
  return args;
}

/**
 * Content hash for one scene. Keys on everything that can change the pixels:
 * the scene's own spec, its voice lines (durations + envelopes), the bundle
 * hash (sources + public assets), and the pipeline version.
 */
export function sceneContentHash({ sceneSpec, sceneVoice, bundleHash }) {
  const payload = JSON.stringify({
    version: PIPELINE_VERSION,
    sceneSpec: sceneSpec || {},
    sceneVoice: sceneVoice || {},
    bundleHash,
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/** Run Remotion's bundled ffmpeg with the given args (no shell quoting games). */
function ffmpeg(args) {
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return execFileSync(cmd, ['remotion', 'ffmpeg', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Stitch scene MP4s into one file with the concat demuxer (stream copy). */
export function stitchScenes(sceneFiles, outFile) {
  if (sceneFiles.length === 0) throw new Error('stitchScenes: no scene files');
  if (sceneFiles.length === 1) {
    fs.copyFileSync(sceneFiles[0], outFile);
    return;
  }
  const listFile = path.join(path.dirname(outFile), '.scene-concat.txt');
  const lines = sceneFiles.map((f) => `file '${f.replaceAll('\\', '/')}'`);
  fs.writeFileSync(listFile, lines.join('\n') + '\n', 'utf8');
  try {
    ffmpeg(['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outFile]);
  } finally {
    try { fs.unlinkSync(listFile); } catch { /* best effort */ }
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const story = JSON.parse(fs.readFileSync(args.story, 'utf8'));
  validateCharacterLibrary();
  const voiceData = JSON.parse(fs.readFileSync(path.resolve(args.voice), 'utf8'));
  const timeline = buildStoryTimeline(voiceData, 30);

  // Pre-flight + bundle reuse (same policy as make.mjs).
  const preflight = runPreflight({ kill: true });
  for (const line of formatPreflight(preflight)) console.log(line);
  const concurrency = Math.min(DEFAULT_CONCURRENCY, preflight.suggestedConcurrency);
  const chromeBefore = snapshotChromePids();
  const { serveUrl } = await getOrCreateBundle({
    root: process.cwd(),
    cacheFile: path.resolve('./out/.bundle-cache.json'),
    publicDir: path.resolve('./public'),
    entryPoint: path.resolve('./remotion/index.ts'),
  });
  const bundleHash = computeBundleHash(ROOT);

  const inputProps = { story, voiceData, isMock: false, isDraft: args.draft };
  const composition = await selectComposition({
    serveUrl,
    id: 'StoryFilm',
    inputProps,
    ...(process.env.CHROME ? { browserExecutable: process.env.CHROME } : {}),
  });

  const cacheDir = path.resolve('./out/.scene-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(path.resolve(path.dirname(args.out)), { recursive: true });
  const browser = resolveBrowser(process.env.CHROME);
  const glMode = args.gl && args.gl !== 'default' ? args.gl : undefined;

  const sceneFiles = [];
  let rendered = 0;
  let cached = 0;
  let savedMs = 0;
  const totalStart = Date.now();

  for (let i = 0; i < timeline.scenes.length; i += 1) {
    const scene = timeline.scenes[i];
    const sceneSpec = (story.scenes || [])[i] || {};
    const sceneVoice = (voiceData.scenes || [])[i] || {};
    const hash = sceneContentHash({ sceneSpec, sceneVoice, bundleHash });
    const file = path.join(cacheDir, `${story.title ? 'story' : 'scene'}-${scene.id}-${hash}.mp4`);
    sceneFiles.push(file);

    if (fs.existsSync(file) && fs.statSync(file).size > 0) {
      console.log(`[scene-cache] ${scene.id}: HIT ${hash} — reusing ${path.basename(file)}`);
      cached += 1;
      continue;
    }

    const start = scene.startFrame;
    const end = scene.startFrame + scene.durationInFrames - 1;
    console.log(`[scene-cache] ${scene.id}: MISS ${hash} — rendering frames ${start}..${end}`);
    const t0 = Date.now();
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: file,
      frameRange: [start, end],
      inputProps,
      concurrency,
      timeoutInMilliseconds: 60000,
      ...(glMode ? { gl: glMode } : {}),
      ...(browser.executable ? { browserExecutable: browser.executable } : {}),
      onProgress: ({ progress }) => {
        process.stdout.write(`[scene-cache]   ${scene.id} ${Math.round(progress * 100)}%\r`);
      },
    });
    const ms = Date.now() - t0;
    savedMs += ms; // time that a second run would skip
    rendered += 1;
    console.log(`\n[scene-cache]   ${scene.id} rendered in ${(ms / 1000).toFixed(1)}s`);
  }

  console.log(`[scene-cache] Stitching ${sceneFiles.length} scenes with Remotion ffmpeg…`);
  stitchScenes(sceneFiles, path.resolve(args.out));

  const reaped = reapNewRemotionChrome(chromeBefore);
  if (reaped.killed > 0) console.log(`[scene-cache] Reaped ${reaped.killed} browser process(es).`);

  const wallMs = Date.now() - totalStart;
  console.log('');
  console.log(`[scene-cache] Scenes rendered: ${rendered}, cached: ${cached}, total: ${timeline.scenes.length}`);
  console.log(`[scene-cache] Time skipped by cache: ${(savedMs / 1000).toFixed(1)}s`);
  console.log(`[scene-cache] Wall time this run: ${(wallMs / 1000).toFixed(1)}s`);
  console.log(`[scene-cache] Final film: ${path.resolve(args.out)}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error('Scene render failed:', err);
    process.exit(1);
  });
}
