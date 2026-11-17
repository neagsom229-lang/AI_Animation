/**
 * @fileoverview CLI automation script for Kuanimation Studio.
 *
 * Windows note: `npm run make -- --flag value` breaks on some npm versions
 * ("Unknown cli flag"). Always use the direct node form:
 *
 *   node scripts/make.mjs --story src/stories/khmer-temple.json --lang km
 *   node scripts/make.mjs --story src/stories/historical-angkor.json --lang en
 *   node scripts/make.mjs --story src/stories/khmer-temple.json --mock
 *   node scripts/make.mjs --story src/stories/khmer-temple.json --gpu
 *
 * --gpu renders with Remotion's `gl: 'angle'` (hardware ANGLE/GPU) for
 * production. NOTE: Remotion renders with its bundled chrome-headless-shell,
 * which only speaks SwiftShader — set CHROME to a full Chrome/Edge install to
 * actually reach hardware ANGLE (Intel/NVIDIA/AMD).
 *
 * Round 4: the GPU path is now the DEFAULT (production), and the full browser
 * is auto-detected when CHROME is not set — Remotion's bundled shell cannot
 * reach the GPU at all, so "default = software" meant "default = no GPU".
 * Use --software for the software-GL path that scripts/verify-determinism.mjs
 * uses as the determinism reference.
 *
 * A pre-flight runs before the render: it reports free RAM, warns below
 *   4 GB, reaps stale Remotion browser processes left behind by earlier
 *   runs, and picks the concurrency (4 on this hardware). After the render
 *   the browsers this run started are reaped too. See scripts/preflight.mjs.
 *
 * --draft renders 720p with low shadows and no post overlays for iteration;
 * final quality stays 1080p. The bundle is cached between runs
 * (out/.bundle-cache.json) — delete it to force a rebuild.
 *
 * Flow: story JSON -> edge-tts voice (or --mock) -> voice.json (real durations
 * + 20 Hz envelopes) -> Remotion render -> out/<story>.mp4 + contact sheet.
 * --draft renders 720p to out/<story>-draft.mp4 (+ <story>-draft-contact.png)
 * so it never clobbers the shipped 1080p artifact.
 * There is NO automatic mock fallback: if real TTS fails, the script exits 1.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'node:url';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { getOrCreateBundle } from './lib/bundle-cache.mjs';
import { validateStory, KNOWN_LANGUAGES } from '../src/core/story.js';
import { validateCharacterLibrary } from '../src/characters/library.js';
import { buildSrt } from './lib/srt.mjs';
import { resolveBrowser } from './lib/browser.mjs';
import {
  runPreflight,
  formatPreflight,
  snapshotChromePids,
  reapNewRemotionChrome,
  MIN_FREE_RAM_MB,
  DEFAULT_CONCURRENCY
} from './preflight.mjs';
import {
  pickContactFrames,
  tileContactSheet,
  CONTACT_FRAME_COUNT,
  CONTACT_SHEET_COLS,
  CONTACT_CELL_WIDTH,
} from './lib/contact-sheet.mjs';

export function parseArgs(argv) {
  const args = {
    story: 'src/stories/khmer-temple.json',
    lang: 'km',
    voice: undefined,
    mock: false,
    gpu: true,
    software: false,
    draft: false,
    storyboard: false,
    style: 'auto',
    vertical: false,
    minDuration: 120,
    allowMissing: false,
    englishSubtitles: false,
    tts: 'edge',
    rate: null,
    noPronunciation: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--story' && argv[i + 1]) { args.story = argv[++i]; }
    else if (a === '--lang' && argv[i + 1]) { args.lang = argv[++i]; }
    else if (a === '--voice' && argv[i + 1]) { args.voice = argv[++i]; }
    else if (a === '--mock') { args.mock = true; }
    else if (a === '--gpu') { args.gpu = true; args.software = false; }
    else if (a === '--software') { args.software = true; args.gpu = false; }
    else if (a === '--draft') { args.draft = true; }
    else if (a === '--storyboard') { args.storyboard = true; }
    else if (a === '--style' && argv[i + 1]) { args.style = argv[++i]; }
    else if (a === '--vertical') { args.vertical = true; }
    else if (a === '--min-duration' && argv[i + 1]) { args.minDuration = Number(argv[++i]); }
    else if (a === '--allow-missing') { args.allowMissing = true; }
    else if (a === '--english-subtitles') { args.englishSubtitles = true; }
    else if (a === '--tts' && argv[i + 1]) { args.tts = argv[++i]; }
    else if (a === '--rate' && argv[i + 1]) { args.rate = Number(argv[++i]); }
    else if (a === '--no-pronunciation') { args.noPronunciation = true; }
    else { throw new Error(`Unknown or incomplete argument: ${a}`); }
  }
  if (!['auto', '3d', 'illustrated'].includes(args.style)) {
    throw new Error(`--style "${args.style}" is unknown. Valid: auto, 3d, illustrated.`);
  }
  if (!KNOWN_LANGUAGES.includes(args.lang)) {
    throw new Error(`--lang "${args.lang}" is unknown. Valid languages: ${KNOWN_LANGUAGES.join(', ')}.`);
  }
  if (!fs.existsSync(args.story)) {
    throw new Error(`Story file not found: ${args.story}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { story: storyPath, lang, mock } = args;
  const voice = args.voice || (lang === 'en' ? 'en-US-AriaNeural' : 'km-KH-PisethNeural');

  console.log(`[Kuanimation Studio] Making film from story: ${storyPath} (lang: ${lang}, voice: ${voice}, mock: ${mock}, draft: ${args.draft})`);

  // Style dispatch: --style illustrated, or auto-detect the illustrated schema.
  // The 3D style remains the default for all existing stories.
  const storyForStyle = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));
  const wantIllustrated =
    args.style === 'illustrated' || (args.style === 'auto' && storyForStyle.style === 'illustrated');
  if (wantIllustrated) {
    const { main: illustratedMain } = await import('./make-illustrated.mjs');
    const delegated = ['--story', storyPath, '--lang', lang, '--voice', voice];
    if (mock) delegated.push('--mock');
    if (args.draft) delegated.push('--draft');
    if (args.vertical) delegated.push('--vertical');
    if (args.allowMissing) delegated.push('--allow-missing');
    if (args.storyboard) delegated.push('--storyboard');
    if (args.englishSubtitles) delegated.push('--english-subtitles');
    if (args.tts !== 'edge') delegated.push('--tts', args.tts);
    if (args.rate !== null) delegated.push('--rate', String(args.rate));
    if (args.noPronunciation) delegated.push('--no-pronunciation');
    if (args.software) delegated.push('--software');
    delegated.push('--min-duration', String(args.minDuration));
    await illustratedMain(delegated);
    return;
  }

  // Validate the story BEFORE spending any time on TTS/render.
  const story = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));
  // The character library is validated first: a broken library entry must
  // fail loudly before any network call.
  const library = validateCharacterLibrary();
  console.log(`[Assert] Character library OK (${library.characters.length} characters).`);
  validateStory(story, { library });
  console.log('[Assert] Story schema validation passed.');

  try {
    execFileSync('python', ['--version'], { stdio: 'ignore' });
  } catch (e) {
    console.error('[Error] Python is not installed or not in PATH. Fix: install Python 3.10+ and ensure `python --version` works in PowerShell.');
    process.exit(1);
  }

  // Step 1: Generate voice and voice.json (exits 1 if edge-tts fails unless --mock)
  console.log('[1/4] Generating voiceover and lip-sync envelopes...');
  const genArgs = ['scripts/generate-voice.py', '--story', storyPath, '--lang', lang, '--voice', voice];
  if (mock) genArgs.push('--mock');

  try {
    execFileSync('python', genArgs, { stdio: 'inherit' });
  } catch (e) {
    console.error(`[Error] Voice generation failed (exit code ${e.status}). If network/edge-tts is unavailable, re-run with --mock to use mock audio synthesis.`);
    process.exit(1);
  }

  // Assertions after voice generation: extension agreement (real=.mp3, mock=mock-*.wav),
  // no "mock" in real voice file paths, every file exists, durations > 0.
  const voiceData = JSON.parse(fs.readFileSync('public/voice.json', 'utf-8'));
  for (const scene of voiceData.scenes) {
    for (const line of scene.lines) {
      if (!mock) {
        if (line.file.includes('mock')) {
          console.error(`[Error] Found 'mock' in voice file path '${line.file}' during real voice generation.`);
          process.exit(1);
        }
        if (!line.file.endsWith('.mp3')) {
          console.error(`[Error] Real voice file '${line.file}' must be .mp3 (edge-tts outputs MP3; never renamed).`);
          process.exit(1);
        }
      } else {
        if (!path.basename(line.file).startsWith('mock-') || !line.file.endsWith('.wav')) {
          console.error(`[Error] Mock voice file '${line.file}' must be named mock-*.wav.`);
          process.exit(1);
        }
      }
      const fullPath = path.resolve('public', line.file);
      if (!fs.existsSync(fullPath)) {
        console.error(`[Error] Voice file missing: ${fullPath}`);
        process.exit(1);
      }
      if (line.dur <= 0) {
        console.error(`[Error] Invalid voice duration (${line.dur}) for line: ${line.text}`);
        process.exit(1);
      }
    }
  }
  console.log('[Assert] Voice generation assertions passed successfully.');

  // --storyboard: low-res stills + voice animatic for approval. Reuses the
  // voice generated above, then exits before any 1080p render (Round 5).
  if (args.storyboard) {
    const { runStoryboard } = await import('./storyboard.mjs');
    const storyName = path.basename(storyPath, '.json');
    await runStoryboard({
      story: storyPath,
      voice: 'public/voice.json',
      out: path.join('./out', `${storyName}-storyboard`),
    });
    return;
  }

  const inputProps = { story, voiceData, isMock: mock, isDraft: args.draft };

  // Chrome/Edge selection: CHROME wins, otherwise a full browser is
  // auto-detected. Remotion's bundled chrome-headless-shell only speaks
  // SwiftShader, so the GPU path REQUIRES a full browser.
  const browser = resolveBrowser(process.env.CHROME);
  const browserExecutable = browser.executable;
  // Round 4: the GPU path is the production default. Software GL stays
  // available (--software) as the determinism reference that
  // scripts/verify-determinism.mjs compares against.
  const glMode = args.software ? undefined : 'angle';
  const glLabel = args.software ? 'software (determinism reference)' : 'angle (GPU)';
  console.log(`[Perf] GL backend for this run: ${glLabel}`);
  console.log(`[Perf] Browser: ${browser.label}`);
  if (!args.software && !browser.isFull) {
    console.warn(
      '[Warn] No full Chrome/Edge found — the GPU path needs one (Remotion\'s bundled ' +
        'headless shell is software-GL only). Set CHROME=<path to chrome.exe>.'
    );
  }

  // Pre-flight: free RAM, stale-browser reaping, concurrency.
  const preflight = runPreflight({ kill: true });
  for (const line of formatPreflight(preflight)) console.log(line);
  if (preflight.lowMemory) {
    console.warn(
      `[Warn] Free RAM is ${preflight.freeMb} MB (< ${MIN_FREE_RAM_MB} MB). ` +
        'The render may stall or OOM; close other apps or lower the concurrency.'
    );
  }
  // Four tabs keep the run stable on this VM (see the note below).
  const concurrency = Math.min(DEFAULT_CONCURRENCY, preflight.suggestedConcurrency);
  console.log(`[Perf] Concurrency: ${concurrency}`);
  const chromeBefore = snapshotChromePids();

  // Step 2: Bundle Remotion project (reused across runs when inputs are
  // unchanged — see scripts/lib/bundle-cache.mjs)
  console.log('[2/4] Bundling Remotion project...');
  const { serveUrl: bundled } = await getOrCreateBundle({
    root: process.cwd(),
    cacheFile: path.resolve('./out/.bundle-cache.json'),
    publicDir: path.resolve('./public'),
    entryPoint: path.resolve('./remotion/index.ts'),
  });

  // Step 3: Select composition and render media with inputProps
  console.log('[3/4] Rendering StoryFilm composition to MP4...');
  const composition = await selectComposition({
    serveUrl: bundled,
    id: 'StoryFilm',
    inputProps,
    ...(browserExecutable ? { browserExecutable } : {}),
  });

  const storyName = path.basename(storyPath, '.json');
  const outDir = path.resolve('./out');
  fs.mkdirSync(outDir, { recursive: true });
  // Draft renders go to <story>-draft.mp4 so they never clobber the shipped
  // final render at <story>.mp4 (the draft's purpose is a fast iteration loop).
  const outSuffix = mock ? '-MOCK.mp4' : args.draft ? '-draft.mp4' : '.mp4';
  const outVideoPath = path.join(outDir, `${storyName}${outSuffix}`);

  const renderStart = Date.now();
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outVideoPath,
    inputProps,
    // Generous page-load budget: on this VM the first frame lands ~30 s
    // after a cold bundle build; the margin absorbs CPU contention, it does
    // not mask logic errors.
    timeoutInMilliseconds: 60000,
    // This VM has ~3.6 GB free RAM after OS + tooling; Remotion's default
    // concurrency (half the cores = 8) spawns enough Chromium tabs to OOM
    // them and they die mid-render, stalling the frame counter.
    // Four tabs keep the run stable with headroom.
    concurrency,
    ...(glMode ? { gl: glMode } : {}),
    ...(browserExecutable ? { browserExecutable } : {}),
    onProgress: ({ progress }) => {
      process.stdout.write(`Rendering progress: ${Math.round(progress * 100)}%\r`);
    },
  });
  const renderMs = Date.now() - renderStart;
  const msPerFrame = renderMs / composition.durationInFrames;
  console.log(
    `\n[Perf] ${composition.durationInFrames} frames in ${(renderMs / 1000).toFixed(1)}s ` +
      `(${msPerFrame.toFixed(1)} ms/frame, gl=${glLabel})`
  );

  // Reap the browsers this run started — a leftover headless Chrome holds
  // hundreds of MB and would starve the next render.
  const reaped = reapNewRemotionChrome(chromeBefore);
  if (reaped.killed > 0) {
    console.log(`[Perf] Reaped ${reaped.killed} Remotion browser process(es) after the render.`);
  }

  console.log(`\nSuccessfully rendered film to: ${outVideoPath}`);

  // Subtitles built from the same data the film is timed with. The caption
  // language follows the narration unless the story overrides it.
  const srtPath = path.join(outDir, `${storyName}.srt`);
  fs.writeFileSync(
    srtPath,
    buildSrt(voiceData, undefined, { captionLanguage: story.subtitleLanguage }),
    'utf-8'
  );
  console.log(`Wrote subtitles: ${srtPath}`);

  // Step 4: render evenly spaced stills across the WHOLE clip and tile them
  // into a real contact sheet (the old version rendered a single frame and
  // called it a sheet). Frame picks are pure arithmetic on the clip length,
  // so the sheet is deterministic like everything else.
  console.log('[4/4] Generating contact sheet...');
  const contactFrames = pickContactFrames(composition.durationInFrames, CONTACT_FRAME_COUNT);
  const stillsDir = path.join(outDir, `.contact-${storyName}`);
  fs.mkdirSync(stillsDir, { recursive: true });
  const contactSheetPath = path.join(outDir, `${storyName}${args.draft ? '-draft' : ''}-contact.png`);
  let sheet;
  try {
    const inputs = [];
    for (const frame of contactFrames) {
      const stillPath = path.join(stillsDir, `frame-${String(frame).padStart(4, '0')}.png`);
      await renderStill({
        composition,
        serveUrl: bundled,
        output: stillPath,
        frame,
        imageFormat: 'png',
        inputProps,
        timeoutInMilliseconds: 60000,
        ...(glMode ? { gl: glMode } : {}),
        ...(browserExecutable ? { browserExecutable } : {}),
      });
      inputs.push(stillPath);
    }
    sheet = tileContactSheet({
      inputs,
      output: contactSheetPath,
      cols: CONTACT_SHEET_COLS,
      cellWidth: CONTACT_CELL_WIDTH,
    });
  } finally {
    fs.rmSync(stillsDir, { recursive: true, force: true });
  }
  console.log(
    `Generated contact sheet (${sheet.frames} frames ${contactFrames.join(',')}) ` +
      `at ${sheet.output} (${sheet.width}x${sheet.height}, ${sheet.cols}x${sheet.rows})`
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error('Error during make execution:', err);
    process.exit(1);
  });
}
