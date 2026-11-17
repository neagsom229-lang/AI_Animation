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
import { renderStill, selectComposition } from '@remotion/renderer';
import { getOrCreateBundle } from './lib/bundle-cache.mjs';
import { validateCharacterLibrary } from '../src/characters/library.js';

export function parseArgs(argv) {
  const args = {
    story: 'src/stories/khmer-temple.json',
    frames: '30',
    tag: 'still',
    voice: 'public/voice.json',
    draft: false,
    gl: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--story' && argv[i + 1]) args.story = argv[++i];
    else if (a === '--frames' && argv[i + 1]) args.frames = argv[++i];
    else if (a === '--tag' && argv[i + 1]) args.tag = argv[++i];
    else if (a === '--voice' && argv[i + 1]) args.voice = argv[++i];
    else if (a === '--draft') args.draft = true;
    else if (a === '--gl' && argv[i + 1]) args.gl = argv[++i];
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
  validateCharacterLibrary();
  // --voice lets QA render the same frame against an alternate envelope
  // (e.g. a zeroed copy) for a controlled mouth open/closed A/B test.
  const voicePath = path.resolve(args.voice);
  if (!fs.existsSync(voicePath)) {
    throw new Error(
      'public/voice.json not found — generate it first: node scripts/make.mjs --story <story>'
    );
  }
  const voiceData = JSON.parse(fs.readFileSync(voicePath, 'utf-8'));
  const inputProps = { story, voiceData, isMock: false, isDraft: args.draft };
  const browserExecutable = process.env.CHROME || undefined;
  // --gl selects Chromium's GL backend (angle | swiftshader | ...) — used to
  // probe the full-Chrome hardware path; omit for Remotion's default.
  const glMode = args.gl && args.gl !== 'default' ? args.gl : undefined;
  console.log(`[still] GL backend: ${glMode ?? 'default (Chrome decides)'}`);

  console.log(`[still] Bundling Remotion project...`);
  const { serveUrl: bundled } = await getOrCreateBundle({
    root: process.cwd(),
    cacheFile: path.resolve('./out/.bundle-cache.json'),
    publicDir: path.resolve('./public'),
    entryPoint: path.resolve('./remotion/index.ts'),
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
      timeoutInMilliseconds: 60000,
      ...(glMode ? { gl: glMode } : {}),
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
