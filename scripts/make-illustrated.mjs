#!/usr/bin/env node
/**
 * @fileoverview Pipeline CLI for the "illustrated" film style.
 *
 * Flow: story JSON -> edge-tts Khmer voice -> real durations -> per-scene MP4
 * (cached by image+depth hash+voice+code version) -> ffmpeg stitch -> final film.
 * Also supports --draft (720p), --vertical (9:16), --min-duration (fail if the
 * film is shorter), --allow-missing (labeled placeholder cards), and a
 * storyboard animatic via --storyboard.
 *
 * No silent fallbacks: missing assets fail loudly unless --allow-missing.
 *
 * Usage:
 *   node scripts/make-illustrated.mjs --story src/stories/khmer-empire.json --min-duration 120
 *   node scripts/make-illustrated.mjs --story ... --draft --allow-missing
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildSlideshowList, buildAudioList } from './storyboard.mjs';
import { LOUDNESS_TARGET, parseLoudnessI, parseSilences, hasLongSilence, loudnormFilter } from './lib/loudness.mjs';
import { renderMedia, selectComposition, renderStill } from '@remotion/renderer';
import { getOrCreateBundle } from './lib/bundle-cache.mjs';
import { resolveBrowser } from './lib/browser.mjs';
import { validateIllustratedStory } from '../src/core/illustrated-story.js';
import { buildIllustratedTimeline, meetsMinimumDuration } from '../remotion/lib/illustrated-timing.ts';
import { checkIllustratedAssets, formatManifest, depthPathFor } from './illustrated-manifest.mjs';
import { publicAssetPath } from '../remotion/lib/illustrated-assets.ts';
import { illustratedSceneHash } from './lib/illustrated-scene-cache.mjs';
import { stitchScenes } from './render-scenes.mjs';
import { pickContactFrames, tileContactSheet } from './lib/contact-sheet.mjs';
import {
  runPreflight, formatPreflight, snapshotChromePids, reapNewRemotionChrome, DEFAULT_CONCURRENCY,
} from './preflight.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_STORY = 'src/stories/khmer-empire.json';

export function parseArgs(argv) {
  const args = {
    story: DEFAULT_STORY,
    lang: 'km',
    voice: 'km-KH-PisethNeural',
    mock: false,
    draft: false,
    vertical: false,
    minDuration: 120,
    allowMissing: false,
    storyboard: false,
    englishSubtitles: false,
    tts: 'edge',
    rate: null,
    noPronunciation: false,
    gpu: true,
    software: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--story' && argv[i + 1]) args.story = argv[++i];
    else if (a === '--lang' && argv[i + 1]) args.lang = argv[++i];
    else if (a === '--voice' && argv[i + 1]) args.voice = argv[++i];
    else if (a === '--mock') args.mock = true;
    else if (a === '--draft') args.draft = true;
    else if (a === '--vertical') args.vertical = true;
    else if (a === '--min-duration' && argv[i + 1]) args.minDuration = Number(argv[++i]);
    else if (a === '--allow-missing') args.allowMissing = true;
    else if (a === '--storyboard') args.storyboard = true;
    else if (a === '--english-subtitles') args.englishSubtitles = true;
    else if (a === '--tts' && argv[i + 1]) {
      args.tts = argv[++i];
      if (!['edge', 'azure'].includes(args.tts)) throw new Error('--tts must be edge or azure');
    }
    else if (a === '--rate' && argv[i + 1]) { args.rate = Number(argv[++i]); }
    else if (a === '--no-pronunciation') args.noPronunciation = true;
    else if (a === '--gpu') { args.gpu = true; args.software = false; }
    else if (a === '--software') { args.software = true; args.gpu = false; }
    else throw new Error(`Unknown or incomplete argument: ${a}`);
  }
  if (!fs.existsSync(args.story)) throw new Error(`Story not found: ${args.story}`);
  if (!Number.isFinite(args.minDuration) || args.minDuration < 0) throw new Error('bad --min-duration');
  return args;
}

/** Stage story assets into public/illustrated/ so staticFile() can serve them. */
function stageAssets(story, report) {
  for (const s of report.scenes) {
    for (const rel of [s.imagePath, s.depthPath, s.clipPath]) {
      if (!rel || !fs.existsSync(rel)) continue;
      const dest = path.join(ROOT, 'public', publicAssetPath(rel));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(rel, dest);
    }
  }
  // Music + SFX (single files, optional).
  for (const rel of [story.music, ...Object.values(story.sfx || {})]) {
    if (typeof rel !== 'string' || !fs.existsSync(rel)) continue;
    const dest = path.join(ROOT, 'public', publicAssetPath(rel));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(rel, dest);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const story = JSON.parse(fs.readFileSync(args.story, 'utf8'));
  validateIllustratedStory(story);
  console.log('[Assert] Illustrated story schema valid.');

  // Asset manifest — fail loudly unless --allow-missing.
  const report = checkIllustratedAssets(story, { allowMissing: args.allowMissing });
  for (const line of formatManifest(report)) console.log(line);

  // Intake manifest gate: real renders require a reviewed, fully-logged manifest.
  // --allow-missing is the explicit escape hatch for fixture/dry runs.
  const intakeManifestPath = path.join(ROOT, 'assets-src/illustrations/manifest.json');
  if (!args.allowMissing) {
    if (!fs.existsSync(intakeManifestPath)) {
      throw new Error(
        `Missing ${intakeManifestPath}. Run: node scripts/intake-illustrations.mjs <folder> ` +
        `--tool "<tool>" --license-terms-url <url> --prompt-file docs/ILLUSTRATION_PROMPTS.md, ` +
        `then review each scene (docs/IMAGE_REVIEW_CHECKLIST.md). Or pass --allow-missing for fixtures.`
      );
    }
    const im = JSON.parse(fs.readFileSync(intakeManifestPath, 'utf8'));
    const { isManifestEntryReady, REQUIRED_MANIFEST_FIELDS } = await import('./lib/image-check.mjs');
    const bad = (im.scenes || []).filter((e) => !isManifestEntryReady(e));
    if (bad.length > 0) {
      const detail = bad.slice(0, 5).map((e) =>
        `scene ${e.scene}: reviewed=${e.reviewed}, missing=[${REQUIRED_MANIFEST_FIELDS.filter((k) => !e[k] || !String(e[k]).trim()).join(', ')}]`
      ).join('\n  ');
      throw new Error(`Intake manifest incomplete for ${bad.length} scene(s); final render refuses:\n  ${detail}`);
    }
    console.log('[Assert] Intake manifest complete and all scenes reviewed:true.');

    // Round 9 item 1: SOURCE resolution gate (measured on source, not output).
    const { sourceResolutionGate } = await import('./lib/image-check.mjs');
    const minSrc = 1600;
    const low = (im.scenes || []).filter((e) =>
      e.sourceWidth !== undefined && sourceResolutionGate(e.sourceWidth, minSrc, { draft: args.draft }).hardFail);
    if (low.length) {
      const detail = low.slice(0, 6).map((e) => `scene ${e.scene}: source ${e.sourceWidth}px < ${minSrc}px`).join('\n  ');
      throw new Error(`FINAL RENDER BLOCKED: ${low.length} scene(s) have source width < ${minSrc}px:\n  ${detail}\nFIX: regenerate larger illustrations or run: node scripts/film.mjs upscale --scene N (Real-ESRGAN, BSD-3). Drafts allow it with --draft.`);
    }
    console.log(`[Assert] Source-resolution gate OK (>= ${minSrc}px or draft).`);

    // Round 9 item 2: exact + near-duplicate images are blocking.
    const { buildImageRecords, groupDuplicates, requeueBlock } = await import('./lib/film-duplicates.mjs');
    const promptText = fs.existsSync('docs/ILLUSTRATION_PROMPTS.md') ? fs.readFileSync('docs/ILLUSTRATION_PROMPTS.md', 'utf8') : '';
    const records = buildImageRecords({ story, promptsDoc: promptText });
    const dupGroups = groupDuplicates(records);
    if (dupGroups.length) {
      throw new Error(`FINAL RENDER BLOCKED: ${dupGroups.length} duplicate group(s):\n  ${dupGroups.map(requeueBlock).join('\n\n')}`);
    }
    console.log('[Assert] Duplicate check OK (no exact/near-duplicate scenes).');
  } else {
    console.log('[warn] --allow-missing: intake manifest review + source/duplicate gates skipped (fixture/dry run).');
  }
  stageAssets(story, report);

  // Generate voice into a style-specific file (never clobbers the 3D voice).
  const storyName = path.basename(args.story, '.json');
  const voiceJson = `public/voice-${storyName}.json`;
  const genArgs = ['scripts/generate-voice.py', '--story', args.story, '--lang', args.lang,
    '--voice', args.voice, '--out', `public/voice/${storyName}`, '--json', voiceJson,
    '--tts', args.tts];
  if (args.rate !== null && Number.isFinite(args.rate)) genArgs.push('--rate', String(args.rate));
  if (args.noPronunciation) genArgs.push('--no-pronunciation');
  if (args.mock) genArgs.push('--mock');
  console.log(`[voice] ${genArgs.join(' ')}`);
  execFileSync('python', genArgs, { stdio: 'inherit', cwd: ROOT });
  const voiceData = JSON.parse(fs.readFileSync(path.resolve(ROOT, voiceJson), 'utf8'));

  // Duration gate.
  const fps = 30;
  const timeline = buildIllustratedTimeline(voiceData, fps);
  const seconds = timeline.durationInFrames / fps;
  console.log(`[duration] ${timeline.scenes.length} scenes, ${seconds.toFixed(1)} s (${timeline.durationInFrames} frames).`);
  if (!meetsMinimumDuration(timeline, args.minDuration, fps)) {
    throw new Error(`Film is ${seconds.toFixed(1)} s < required ${args.minDuration} s (--min-duration).`);
  }

  // Asset status map for the composition.
  const assetStatus = {};
  for (const s of report.scenes) {
    assetStatus[s.id] = { image: s.image, depth: s.depth, clip: s.clip };
  }
  // Music is optional but must not silently disappear: fail unless allowed.
  const musicPresent = Boolean(story.music && fs.existsSync(story.music));
  if (story.music && !musicPresent && !args.allowMissing) {
    throw new Error(`Declared music file is missing: ${story.music} (use --allow-missing to render without it).`);
  }
  if (story.music && !musicPresent) console.log(`[warn] Music missing (--allow-missing): ${story.music} — rendering without music.`);
  // Load parallax safety metrics if depth.py produced them.
  const metricsPath = path.join(ROOT, 'out/review/parallax-metrics.json');
  const parallaxMetrics = {};
  const limitFactors = {};
  if (fs.existsSync(metricsPath)) {
    try {
      const pm = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
      for (const s of pm.scenes || []) {
        parallaxMetrics[s.scene] = s.depthEdgeMetric;
        if (s.limitFactor !== undefined) limitFactors[s.scene] = s.limitFactor;
      }
      console.log(`[parallax] loaded ${Object.keys(parallaxMetrics).length} metric(s), ${Object.keys(limitFactors).length} rank-based limit factor(s) — motion auto-limited.`);
    } catch { console.log('[warn] parallax-metrics.json unreadable; using full parallax (no limit).'); }
  }
  const inputProps = {
    story, voiceData, assetStatus, musicPresent, allowMissing: args.allowMissing,
    isMock: args.mock, isDraft: args.draft, isVertical: args.vertical,
    englishSubtitles: args.englishSubtitles, parallaxMetrics, limitFactors,
  };

  // Preflight + browser + bundle.
  const preflight = runPreflight({ kill: true });
  for (const line of formatPreflight(preflight)) console.log(line);
  const concurrency = Math.min(DEFAULT_CONCURRENCY, preflight.suggestedConcurrency);
  const chromeBefore = snapshotChromePids();
  const browser = resolveBrowser(process.env.CHROME);
  const { serveUrl } = await getOrCreateBundle({
    root: ROOT,
    cacheFile: path.join(ROOT, 'out/.bundle-cache.json'),
    publicDir: path.join(ROOT, 'public'),
    entryPoint: path.join(ROOT, 'remotion/index.ts'),
  });
  const composition = await selectComposition({
    serveUrl, id: 'IllustratedFilm', inputProps,
    ...(browser.executable ? { browserExecutable: browser.executable } : {}),
  });
  const fpsFinal = composition.fps;
  const glMode = args.software ? undefined : 'angle';

  if (args.storyboard) {
    // Storyboard animatic: one low-res still per scene + voice (reuse stills).
    const sbDir = path.resolve(ROOT, `out/${storyName}-storyboard`);
    fs.mkdirSync(sbDir, { recursive: true });
    const stills = [];
    for (const [i, scene] of timeline.scenes.entries()) {
      const frame = scene.startFrame + Math.floor(scene.durationInFrames / 2);
      const out = path.join(sbDir, `scene-${i + 1}.png`);
      await renderStill({ composition, serveUrl, output: out, frame, inputProps, timeoutInMilliseconds: 60000,
        ...(glMode ? { gl: glMode } : {}), ...(browser.executable ? { browserExecutable: browser.executable } : {}) });
      stills.push(out);
    }
    tileContactSheet({ inputs: stills, output: path.join(sbDir, 'contact.png'), cols: 3, cellWidth: 480 });

    // Voice animatic: hold each still for its scene's audio duration + voice.
    const slides = timeline.scenes.map((sc, i) => ({ file: stills[i], seconds: sc.audioDurationInFrames / 30 }));
    const listFile = path.join(sbDir, 'slides.txt');
    fs.writeFileSync(listFile, buildSlideshowList(slides), 'utf8');
    const silentVideo = path.join(sbDir, 'stills-video.mp4');
    const ff = (args) => execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['remotion', 'ffmpeg', ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
        shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      ff(['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
        '-vf', 'scale=640:360', '-vsync', 'vfr', '-pix_fmt', 'yuv420p', silentVideo]);
      const audioFiles = voiceData.scenes.flatMap((sc) => (sc.lines || []).map((l) => path.resolve(ROOT, 'public', l.file)))
        .filter((f) => fs.existsSync(f));
      const animatic = path.join(sbDir, 'storyboard-animatic.mp4');
      if (audioFiles.length > 0) {
        const audioList = path.join(sbDir, 'audio.txt');
        fs.writeFileSync(audioList, buildAudioList(audioFiles), 'utf8');
        const voiceTrack = path.join(sbDir, 'voice-track.mp4');
        ff(['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', audioList, '-c:a', 'aac', '-f', 'mp4', voiceTrack]);
        ff(['-y', '-v', 'error', '-i', silentVideo, '-i', voiceTrack, '-c:v', 'copy', '-c:a', 'aac', '-shortest', animatic]);
        for (const f of [audioList, voiceTrack]) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
      } else {
        fs.copyFileSync(silentVideo, animatic);
      }
      console.log(`[storyboard] animatic: ${animatic}`);
      try { fs.unlinkSync(silentVideo); } catch { /* best effort */ }
    } catch (err) {
      console.log(`[storyboard] note: animatic ffmpeg step skipped (${String(err.message).split('\n')[0]}).`);
    }
    console.log(`[storyboard] wrote ${stills.length} stills + contact.png in ${sbDir}`);
    const reaped = reapNewRemotionChrome(chromeBefore);
    if (reaped.killed > 0) console.log(`[preflight] reaped ${reaped.killed} browser(s).`);
    return;
  }

  // Per-scene cached render + stitch, with a state file for crash/OOM resume.
  const cacheDir = path.resolve(ROOT, 'out/.illustrated-scene-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const stateFile = path.join(cacheDir, `${storyName}.state.json`);
  const resumeState = {
    story: args.story, scenes: timeline.scenes.length,
    started: new Date().toISOString(), finished: {}, lastHash: null,
  };
  const hadState = fs.existsSync(stateFile);
  if (hadState) {
    try { Object.assign(resumeState.finished, JSON.parse(fs.readFileSync(stateFile, 'utf8')).finished || {}); }
    catch { /* ignore unreadable state */ }
    console.log(`[resume] found state file with ${Object.keys(resumeState.finished).length} finished scene(s).`);
  }
  const saveState = () => fs.writeFileSync(stateFile, JSON.stringify(resumeState, null, 2) + '\n', 'utf8');
  const outFile = path.resolve(ROOT, `out/${storyName}${args.draft ? '-draft' : ''}${args.vertical ? '-vertical' : ''}.mp4`);
  const sceneFiles = [];
  let rendered = 0;
  let cached = 0;
  const t0 = Date.now();

  for (const [i, scene] of timeline.scenes.entries()) {
    const spec = story.scenes[i] || {};
    const voiceScene = voiceData.scenes[i] || {};
    const hash = illustratedSceneHash({
      image: spec.image, depth: depthPathFor(spec.image), voiceScene,
      extra: `${args.draft ? 'draft' : 'final'}|${args.vertical ? 'v' : 'h'}|${args.allowMissing ? 'am' : ''}|${args.englishSubtitles ? 'en' : 'km'}`,
    });
    const file = path.join(cacheDir, `${scene.id}-${hash}.mp4`);
    sceneFiles.push(file);
    if (fs.existsSync(file) && fs.statSync(file).size > 0) {
      console.log(`[scene-cache] ${scene.id}: HIT ${hash}`);
      cached += 1;
      resumeState.finished[scene.id] = hash;
      saveState();
      continue;
    }
    const start = scene.startFrame;
    const end = scene.startFrame + scene.durationInFrames - 1;
    console.log(`[scene-cache] ${scene.id}: MISS ${hash} — frames ${start}..${end}`);
    const s0 = Date.now();
    await renderMedia({
      composition, serveUrl, codec: 'h264', outputLocation: file,
      frameRange: [start, end], inputProps, concurrency, timeoutInMilliseconds: 60000,
      ...(glMode ? { gl: glMode } : {}), ...(browser.executable ? { browserExecutable: browser.executable } : {}),
      onProgress: ({ progress }) => process.stdout.write(`[scene-cache]   ${scene.id} ${Math.round(progress * 100)}%\r`),
    });
    console.log(`\n[scene-cache]   ${scene.id} in ${((Date.now() - s0) / 1000).toFixed(1)}s`);
    rendered += 1;
    resumeState.finished[scene.id] = hash;
    resumeState.lastHash = hash;
    saveState(); // checkpoint after every scene so a crash resumes cleanly
  }

  console.log('[stitch] joining scene MP4s…');
  stitchScenes(sceneFiles, outFile);

  // Phase 5: measure loudness (loudnorm print_format=json) + flag silent gaps.
  // The ducking itself is frame-pure in the composition; here we only REPORT.
  const targetLufs = args.vertical ? LOUDNESS_TARGET.vertical : LOUDNESS_TARGET.web;
  try {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const ln = execFileSync(npx, ['remotion', 'ffmpeg', '-hide_banner', '-nostats', '-i', outFile,
      '-af', loudnormFilter(targetLufs), '-f', 'null', '-'], {
      cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const i = parseLoudnessI(`${ln.stdout || ''}${ln.stderr || ''}`);
    console.log(`[loudness] target ${targetLufs} LUFS; measured input I=${i === null ? 'n/a' : `${i} LUFS`} (${targetLufs === LOUDNESS_TARGET.vertical ? 'vertical/TikTok' : 'web'}).`);
  } catch (e) { console.log(`[loudness] measurement skipped: ${String(e.message).split('\n')[0]}`); }
  try {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const sd = execFileSync(npx, ['remotion', 'ffmpeg', '-hide_banner', '-nostats', '-i', outFile,
      '-af', 'silencedetect=noise=-40dB:d=0.1', '-f', 'null', '-'], {
      cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const silences = parseSilences(`${sd.stdout || ''}${sd.stderr || ''}`);
    const long = silences.filter((s) => s.duration > 1.5);
    console.log(`[silencedetect] ${silences.length} silence(s); ${long.length} gap(s) > 1.5 s${long.length ? `: ${long.slice(0, 5).map((s) => `${s.start.toFixed(1)}-${s.end.toFixed(1)}(${s.duration.toFixed(1)}s)`).join(', ')}` : ''}.`);
  } catch (e) { console.log(`[silencedetect] skipped: ${String(e.message).split('\n')[0]}`); }

  const wall = Date.now() - t0;
  const reaped = reapNewRemotionChrome(chromeBefore);
  if (reaped.killed > 0) console.log(`[preflight] reaped ${reaped.killed} browser(s).`);

  console.log('');
  console.log(`[done] ${timeline.scenes.length} scenes (${seconds.toFixed(1)} s, ${fpsFinal} fps).`);
  console.log(`[done] rendered ${rendered}, cached ${cached}, wall ${(wall / 1000).toFixed(1)}s, ` +
    `${(wall / timeline.durationInFrames).toFixed(1)} ms/frame.`);
  console.log(`[done] film: ${outFile}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => { console.error('Illustrated make failed:', err); process.exit(1); });
}
