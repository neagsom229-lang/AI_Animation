/**
 * @fileoverview CLI wrapper around @remotion/renderer: render any registered
 * Remotion composition to an MP4 through a plain Node script (npm-flag-safe).
 *
 * Usage (always the direct node form — `npm run render -- --flag value` breaks
 * on some npm versions with "Unknown cli flag"):
 *
 *   node scripts/render.mjs --composition StoryFilm --out out/film.mp4
 *   node scripts/render.mjs --composition DeterminismTest --out out/determinism-test.mp4
 *
 * Environment:
 *   CHROME - optional absolute path to a Chrome/Chromium executable. When unset,
 *           Remotion falls back to its own bundled headless browser (recommended).
 *
 * Exits 0 on success, 1 on any failure — no silent fallbacks.
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveBrowser } from './lib/browser.mjs';
import {
  runPreflight,
  formatPreflight,
  snapshotChromePids,
  reapNewRemotionChrome,
  DEFAULT_CONCURRENCY
} from './preflight.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function parseArgs(argv) {
  const args = { composition: null, out: null, inputProps: undefined, story: null, voice: 'public/voice.json' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--composition' && argv[i + 1]) { args.composition = argv[++i]; }
    else if (a === '--out' && argv[i + 1]) { args.out = argv[++i]; }
    else if (a === '--inputProps' && argv[i + 1]) { args.inputProps = JSON.parse(argv[++i]); }
    else if (a === '--story' && argv[i + 1]) { args.story = argv[++i]; }
    else if (a === '--voice' && argv[i + 1]) { args.voice = argv[++i]; }
    else {
      console.error(`[Error] Unknown or incomplete argument: ${a}`);
      console.error('Usage: node scripts/render.mjs --composition <id> --out <file.mp4> [--inputProps <json>]');
      console.error('       node scripts/render.mjs --story <story.json> --out <file.mp4>   (re-render without re-running the TTS)');
      process.exit(1);
    }
  }
  if (!args.composition && !args.story) { console.error('[Error] --composition or --story is required.'); process.exit(1); }
  if (!args.out) { console.error('[Error] --out is required.'); process.exit(1); }
  if (!fs.existsSync(path.join(ROOT, 'remotion', 'index.ts'))) { console.error('[Error] Remotion entry not found: remotion/index.ts'); process.exit(1); }
  return args;
}

/**
 * Build the StoryFilm input props from a story JSON + an existing voice.json.
 *
 * This is the "re-render without re-running the TTS" path: the voice data on
 * disk carries the real durations and the 20 Hz envelopes, so a re-render is
 * reproducible without a network round-trip.
 */
function storyInputProps(storyPath, voicePath) {
  const story = JSON.parse(fs.readFileSync(path.resolve(storyPath), 'utf8'));
  const voiceFile = path.resolve(voicePath);
  if (!fs.existsSync(voiceFile)) {
    throw new Error(
      `voice data not found: ${voiceFile} — generate it with: node scripts/make.mjs --story ${storyPath}`
    );
  }
  const voiceData = JSON.parse(fs.readFileSync(voiceFile, 'utf8'));
  return { story, voiceData, isMock: false, isDraft: false };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const browser = resolveBrowser(process.env.CHROME);
  const browserExecutable = browser.executable;

  // Pre-flight: free RAM, stale-browser reaping, concurrency.
  const preflight = runPreflight({ kill: true });
  for (const line of formatPreflight(preflight)) console.log(line);
  const concurrency = Math.min(DEFAULT_CONCURRENCY, preflight.suggestedConcurrency);
  console.log(`[Render] Concurrency: ${concurrency}  Browser: ${browser.label}`);
  const chromeBefore = snapshotChromePids();

  console.log(`[Render] Composition: ${args.composition || 'StoryFilm (from story)'} -> ${args.out}`);
  const inputProps = args.story
    ? storyInputProps(args.story, args.voice)
    : args.inputProps;
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, 'remotion', 'index.ts'),
    publicDir: path.join(ROOT, 'public'),
    onProgress: () => {},
  });
  const composition = await selectComposition({
    serveUrl,
    id: args.composition || 'StoryFilm',
    ...(inputProps ? { inputProps } : {}),
    ...(browserExecutable ? { browserExecutable } : {}),
  });
  console.log(`Rendering ${args.composition || 'StoryFilm'} (${composition.width}x${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} frames)...`);
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: path.resolve(process.cwd(), args.out),
    ...(inputProps ? { inputProps } : {}),
    ...(browserExecutable ? { browserExecutable } : {}),
    concurrency,
    onProgress: ({ progress }) => { process.stdout.write(`Rendering progress: ${Math.round(progress * 100)}%\r`); },
  });
  const reaped = reapNewRemotionChrome(chromeBefore);
  if (reaped.killed > 0) {
    console.log(`[Render] Reaped ${reaped.killed} Remotion browser process(es) after the render.`);
  }
  console.log(`\nSuccessfully rendered film to: ${path.resolve(process.cwd(), args.out)}`);
}

main().catch((error) => {
  console.error('Error during render execution:', error);
  process.exit(1);
});
