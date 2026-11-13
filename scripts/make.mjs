/**
 * @fileoverview CLI automation script for Kuanimation Studio.
 * Usage: npm run make -- --story src/stories/khmer-temple.json --lang km
 * Runs TTS generation -> Remotion rendering -> MP4 output + contact-sheet preview.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

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

  // Step 1: Generate voice and voice.json (cached by text hash)
  console.log('[1/3] Generating voiceover and lip-sync envelopes...');
  execSync(`python scripts/generate-voice.py --story ${storyPath}`, { stdio: 'inherit' });

  // Step 2: Bundle Remotion project
  console.log('[2/3] Bundling Remotion project...');
  const bundled = await bundle({
    entryPoint: path.resolve('./remotion/index.ts'),
    publicDir: path.resolve('./public'),
  });

  // Step 3: Select composition and render media
  console.log('[3/3] Rendering StoryFilm composition to MP4...');
  const composition = await selectComposition({
    serveUrl: bundled,
    id: 'StoryFilm',
  });

  const storyName = path.basename(storyPath, '.json');
  const outDir = path.resolve('./out');
  fs.makedirsSync ? fs.mkdirSync(outDir, { recursive: true }) : fs.mkdirSync(outDir, { recursive: true });
  const outVideoPath = path.join(outDir, `${storyName}.mp4`);

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outVideoPath,
    onProgress: ({ progress }) => {
      process.stdout.write(`Rendering progress: ${Math.round(progress * 100)}%\r`);
    },
  });

  console.log(`\nSuccessfully rendered film to: ${outVideoPath}`);
}

main().catch((err) => {
  console.error('Error during make execution:', err);
  process.exit(1);
});
