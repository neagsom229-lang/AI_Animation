/**
 * @fileoverview CLI automation script for Kuanimation Studio.
 *
 * Windows note: `npm run make -- --flag value` breaks on some npm versions
 * ("Unknown cli flag"). Always use the direct node form:
 *
 *   node scripts/make.mjs --story src/stories/khmer-temple.json --lang km
 *   node scripts/make.mjs --story src/stories/historical-angkor.json --lang en
 *   node scripts/make.mjs --story src/stories/khmer-temple.json --mock
 *
 * Flow: story JSON -> edge-tts voice (or --mock) -> voice.json (real durations
 * + 20 Hz envelopes) -> Remotion render -> out/<story>.mp4 + contact sheet.
 * There is NO automatic mock fallback: if real TTS fails, the script exits 1.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { validateStory, KNOWN_LANGUAGES } from '../src/core/story.js';
import { buildSrt } from './lib/srt.mjs';

export function parseArgs(argv) {
  const args = {
    story: 'src/stories/khmer-temple.json',
    lang: 'km',
    voice: undefined,
    mock: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--story' && argv[i + 1]) { args.story = argv[++i]; }
    else if (a === '--lang' && argv[i + 1]) { args.lang = argv[++i]; }
    else if (a === '--voice' && argv[i + 1]) { args.voice = argv[++i]; }
    else if (a === '--mock') { args.mock = true; }
    else { throw new Error(`Unknown or incomplete argument: ${a}`); }
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

  console.log(`[Kuanimation Studio] Making film from story: ${storyPath} (lang: ${lang}, voice: ${voice}, mock: ${mock})`);

  // Validate the story BEFORE spending any time on TTS/render.
  const story = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));
  validateStory(story);
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

  const inputProps = { story, voiceData, isMock: mock };

  // Chrome/Edge selection: set CHROME to a browser executable to override
  // Remotion's auto-detection (Remotion otherwise uses its bundled headless
  // shell, which it downloads on first use).
  const browserExecutable = process.env.CHROME || undefined;

  // Step 2: Bundle Remotion project
  console.log('[2/4] Bundling Remotion project...');
  const bundled = await bundle({
    entryPoint: path.resolve('./remotion/index.ts'),
    publicDir: path.resolve('./public'),
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
  const outSuffix = mock ? '-MOCK.mp4' : '.mp4';
  const outVideoPath = path.join(outDir, `${storyName}${outSuffix}`);

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outVideoPath,
    inputProps,
    ...(browserExecutable ? { browserExecutable } : {}),
    onProgress: ({ progress }) => {
      process.stdout.write(`Rendering progress: ${Math.round(progress * 100)}%\r`);
    },
  });

  console.log(`\nSuccessfully rendered film to: ${outVideoPath}`);

  // Subtitles built from the same data the film is timed with.
  const srtPath = path.join(outDir, `${storyName}.srt`);
  fs.writeFileSync(srtPath, buildSrt(voiceData), 'utf-8');
  console.log(`Wrote subtitles: ${srtPath}`);

  // Step 4: Render contact-sheet preview (still at frame 30)
  console.log('[4/4] Generating contact-sheet preview image...');
  const contactSheetPath = path.join(outDir, `${storyName}-contact.jpg`);
  await renderStill({
    composition,
    serveUrl: bundled,
    output: contactSheetPath,
    frame: 30,
    inputProps,
    ...(browserExecutable ? { browserExecutable } : {}),
  });
  console.log(`Generated contact-sheet preview at: ${contactSheetPath}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error('Error during make execution:', err);
    process.exit(1);
  });
}
