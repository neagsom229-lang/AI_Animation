/**
 * @fileoverview CLI automation script for Kuanimation Studio.
 * Usage: npm run make -- --story src/stories/khmer-temple.json --lang km
 * Runs TTS generation -> Remotion rendering with inputProps -> MP4 output + contact-sheet preview.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

async function main() {
  const args = process.argv.slice(2);
  let storyPath = 'src/stories/khmer-temple.json';
  let lang = 'km';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--story' && args[i + 1]) {
      storyPath = args[i + 1];
      i++;
    } else if (args[i] === '--lang' && args[i + 1]) {
      lang = args[i + 1];
      i++;
    }
  }

  console.log(`[Kuanimation Studio] Making film from story: ${storyPath} (lang: ${lang})`);

  // Check python and edge-tts / mock requirement
  try {
    execSync('python --version', { stdio: 'ignore' });
  } catch (e) {
    console.error('[Error] Python is not installed or not in PATH.');
    process.exit(1);
  }

  // Step 1: Generate voice and voice.json (try edge-tts, fall back to mock with warning if needed)
  console.log('[1/4] Generating voiceover and lip-sync envelopes...');
  try {
    execSync(`python scripts/generate-voice.py --story ${storyPath} --lang ${lang}`, { stdio: 'inherit' });
  } catch (e) {
    console.log('[Notice] edge-tts encountered network restriction. Retrying with --mock fallback...');
    execSync(`python scripts/generate-voice.py --story ${storyPath} --lang ${lang} --mock`, { stdio: 'inherit' });
  }

  // Load story and voice data for inputProps
  const story = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));
  const voiceData = JSON.parse(fs.readFileSync('public/voice.json', 'utf-8'));
  const inputProps = { story, voiceData };

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
  });

  const storyName = path.basename(storyPath, '.json');
  const outDir = path.resolve('./out');
  fs.mkdirSync(outDir, { recursive: true });
  const outVideoPath = path.join(outDir, `${storyName}.mp4`);

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outVideoPath,
    inputProps,
    onProgress: ({ progress }) => {
      process.stdout.write(`Rendering progress: ${Math.round(progress * 100)}%\r`);
    },
  });

  console.log(`\nSuccessfully rendered film to: ${outVideoPath}`);

  // Step 4: Render contact-sheet preview (still at frame 30)
  console.log('[4/4] Generating contact-sheet preview image...');
  const contactSheetPath = path.join(outDir, `${storyName}-contact.jpg`);
  await renderStill({
    composition,
    serveUrl: bundled,
    output: contactSheetPath,
    frame: 30,
    inputProps,
  });
  console.log(`Generated contact-sheet preview at: ${contactSheetPath}`);
}

main().catch((err) => {
  console.error('Error during make execution:', err);
  process.exit(1);
});
