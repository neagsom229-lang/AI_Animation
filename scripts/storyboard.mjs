/**
 * @fileoverview STORYBOARD MODE (Round 5, Item 5).
 *
 * Produces an approval package without a full 1080p render:
 *   1. one low-resolution still per scene (the dialogue midpoint),
 *   2. a contact sheet of those stills,
 *   3. a "voice animatic" MP4: the stills held for each scene's real audio
 *      duration, with the actual voice track muxed in.
 *
 * The animatic lets a producer approve timing / blocking / captions before
 * spending minutes on the final software-GL render. All frame picks come from
 * the same timeline the film uses, so the animatic cannot drift from the film.
 *
 * Usage:
 *   node scripts/storyboard.mjs --story src/stories/khmer-temple.json \
 *       --voice public/voice.json --out out/khmer-temple-storyboard
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { renderStill, selectComposition } from '@remotion/renderer';
import { getOrCreateBundle } from './lib/bundle-cache.mjs';
import { tileContactSheet } from './lib/contact-sheet.mjs';
import { validateCharacterLibrary } from '../src/characters/library.js';
import { buildStoryTimeline } from '../remotion/lib/story-timing.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function parseArgs(argv) {
  const args = {
    story: 'src/stories/khmer-temple.json',
    voice: 'public/voice.json',
    out: 'out/storyboard',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--story' && argv[i + 1]) args.story = argv[++i];
    else if (a === '--voice' && argv[i + 1]) args.voice = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.out = argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${a}`);
  }
  if (!fs.existsSync(args.story)) throw new Error(`Story not found: ${args.story}`);
  return args;
}

/**
 * Frame picked for a scene's still: the midpoint of its first dialogue line,
 * clamped inside the scene. Pure function of the timed scene.
 */
export function stillFrameForScene(scene) {
  const line = scene.lines[0];
  const mid = line
    ? line.startFrame + Math.floor(line.durationInFrames / 2)
    : scene.startFrame + Math.floor(scene.durationInFrames / 2);
  return Math.min(
    scene.startFrame + scene.durationInFrames - 1,
    Math.max(scene.startFrame, mid)
  );
}

/**
 * Build the ffmpeg concat-demuxer list for the still slideshow. Each still is
 * held for its scene's audio seconds; the last entry is repeated because the
 * concat demuxer assigns a file's duration to the gap before the NEXT file.
 */
export function buildSlideshowList(entries) {
  const lines = [];
  for (const { file, seconds } of entries) {
    lines.push(`file '${file.replaceAll('\\', '/')}'`);
    lines.push(`duration ${Number(seconds).toFixed(3)}`);
  }
  if (entries.length > 0) {
    lines.push(`file '${entries[entries.length - 1].file.replaceAll('\\', '/')}'`);
  }
  return lines.join('\n') + '\n';
}

/** Build the ffmpeg concat list for the voice audio (one entry per line). */
export function buildAudioList(files) {
  return files.map((f) => `file '${path.resolve(f).replaceAll('\\', '/')}'`).join('\n') + '\n';
}

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

export async function runStoryboard({ story: storyPath, voice: voicePath, out }) {
  const args = { story: storyPath, voice: voicePath, out };
  const story = JSON.parse(fs.readFileSync(args.story, 'utf8'));
  validateCharacterLibrary();
  const voiceData = JSON.parse(fs.readFileSync(path.resolve(args.voice), 'utf8'));
  const timeline = buildStoryTimeline(voiceData, 30);

  const outDir = path.resolve(args.out);
  const stillsDir = path.join(outDir, 'stills');
  fs.mkdirSync(stillsDir, { recursive: true });

  // Draft rasters at 1280x720 — the low-res stills the brief asks for.
  const inputProps = { story, voiceData, isMock: false, isDraft: true };
  console.log('[storyboard] Bundling Remotion project…');
  const { serveUrl } = await getOrCreateBundle({
    root: process.cwd(),
    cacheFile: path.resolve('./out/.bundle-cache.json'),
    publicDir: path.resolve('./public'),
    entryPoint: path.resolve('./remotion/index.ts'),
  });
  const composition = await selectComposition({
    serveUrl,
    id: 'StoryFilm',
    inputProps,
    ...(process.env.CHROME ? { browserExecutable: process.env.CHROME } : {}),
  });

  const stillFiles = [];
  const slideEntries = [];
  const audioFiles = [];

  for (const [i, scene] of timeline.scenes.entries()) {
    const frame = stillFrameForScene(scene);
    const still = path.join(stillsDir, `scene-${scene.id}-f${frame}.png`);
    await renderStill({
      composition,
      serveUrl,
      output: still,
      frame,
      inputProps,
      timeoutInMilliseconds: 60000,
      ...(process.env.CHROME ? { browserExecutable: process.env.CHROME } : {}),
    });
    stillFiles.push(still);
    const seconds = scene.audioDurationInFrames / 30;
    slideEntries.push({ file: still, seconds });
    for (const line of scene.lines) {
      if (line.file) audioFiles.push(path.resolve('public', line.file));
    }
    console.log(
      `[storyboard] scene ${scene.id}: still @ ${frame}, held ${seconds.toFixed(1)}s`
    );
  }

  // 1) Contact sheet for visual approval.
  const sheetPath = path.join(outDir, 'storyboard-sheet.png');
  tileContactSheet({
    inputs: stillFiles,
    output: sheetPath,
    cols: Math.min(3, stillFiles.length),
    cellWidth: 480,
  });
  console.log(`[storyboard] contact sheet: ${sheetPath}`);

  // 2) Voice animatic: still slideshow + real voice track.
  const slidesList = path.join(outDir, 'slides-list.txt');
  fs.writeFileSync(slidesList, buildSlideshowList(slideEntries), 'utf8');
  const silentVideo = path.join(outDir, 'stills-video.mp4');
  try {
    ffmpeg([
      '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', slidesList,
      '-vf', 'scale=640:360', '-vsync', 'vfr', '-pix_fmt', 'yuv420p',
      silentVideo,
    ]);

    let animatic = null;
    const presentAudio = audioFiles.filter((f) => fs.existsSync(f));
    if (presentAudio.length > 0) {
      const audioList = path.join(outDir, 'audio-list.txt');
      fs.writeFileSync(audioList, buildAudioList(presentAudio), 'utf8');
      const voiceTrack = path.join(outDir, 'voice-track.mp4');
      ffmpeg(['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', audioList,
        '-c:a', 'aac', '-f', 'mp4', voiceTrack]);
      animatic = path.join(outDir, 'storyboard-animatic.mp4');
      ffmpeg(['-y', '-v', 'error', '-i', silentVideo, '-i', voiceTrack,
        '-c:v', 'copy', '-c:a', 'aac', '-shortest', animatic]);
      try { fs.unlinkSync(audioList); } catch { /* best effort */ }
      try { fs.unlinkSync(voiceTrack); } catch { /* best effort */ }
    } else {
      animatic = path.join(outDir, 'storyboard-animatic.mp4');
      fs.copyFileSync(silentVideo, animatic);
    }
    console.log(`[storyboard] voice animatic: ${animatic}`);
  } finally {
    for (const f of [slidesList, silentVideo]) {
      try { fs.unlinkSync(f); } catch { /* best effort */ }
    }
  }

  console.log(`[storyboard] ${timeline.scenes.length} scenes; approval package in ${outDir}`);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  await runStoryboard({ story: args.story, voice: args.voice, out: args.out });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error('Storyboard failed:', err);
    process.exit(1);
  });
}
