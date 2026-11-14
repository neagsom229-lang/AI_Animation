/**
 * @fileoverview Render one or more StoryFilm stills without re-generating
 * the voice (reuses the existing public/voice.json).
 *
 * Usage:
 *   node scripts/still.mjs --story src/stories/khmer-temple.json --frames 30
 *   node scripts/still.mjs --story src/stories/khmer-temple.json --frames 10,90,180 --tag before
 *
 * Output: out/<story>-<tag>-f<frame>.png
 *
 * Windows note: use the direct node form (npm run -- flag passing breaks).
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

export function parseArgs(argv) {
  const args = {
    story: 'src/stories/khmer-temple.json',
    frames: '30',
    tag: 'still',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--story' && argv[i + 1]) args.story = argv[++i];
    else if (a === '--frames' && argv[i + 1]) args.frames = argv[++i];
    else if (a === '--tag' && argv[i + 1]) args.tag = argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${a}`);
  }
  const frames = args.frames.split(',').map((s) => {
    const n = Number(s.trim());
    if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid frame: "${s}"`);
    return n;
  });
  if (!fs.existsSync(args.story)) throw new Error(`Story file not found: ${args.story}`);
  return { ...args, frames };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const story = JSON.parse(fs.readFileSync(args.story, 'utf-8'));
  const voicePath = path.resolve('public', 'voice.json');
  if (!fs.existsSync(voicePath)) {
    throw new Error(
      'public/voice.json not found — generate it first: node scripts/make.mjs --story <story>'
    );
  }
  const voiceData = JSON.parse(fs.readFileSync(voicePath, 'utf-8'));
  const inputProps = { story, voiceData, isMock: false };
  const browserExecutable = process.env.CHROME || undefined;

  console.log(`[still] Bundling Remotion project...`);
  const bundled = await bundle({
    entryPoint: path.resolve('./remotion/index.ts'),
    publicDir: path.resolve('./public'),
  });
  const composition = await selectComposition({
    serveUrl: bundled,
    id: 'StoryFilm',
    inputProps,
    ...(browserExecutable ? { browserExecutable } : {}),
  });

  const storyName = path.basename(args.story, '.json');
  const outDir = path.resolve('./out');
  fs.mkdirSync(outDir, { recursive: true });

  for (const frame of args.frames) {
    const out = path.join(outDir, `${storyName}-${args.tag}-f${frame}.png`);
    await renderStill({
      composition,
      serveUrl: bundled,
      output: out,
      frame,
      inputProps,
      ...(browserExecutable ? { browserExecutable } : {}),
    });
    console.log(`[still] wrote ${out}`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error('Error during still render:', err);
    process.exit(1);
  });
}
