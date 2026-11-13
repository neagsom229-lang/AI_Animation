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

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function parseArgs(argv) {
  const args = { composition: null, out: null, inputProps: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--composition' && argv[i + 1]) { args.composition = argv[++i]; }
    else if (a === '--out' && argv[i + 1]) { args.out = argv[++i]; }
    else if (a === '--inputProps' && argv[i + 1]) { args.inputProps = JSON.parse(argv[++i]); }
    else {
      console.error(`[Error] Unknown or incomplete argument: ${a}`);
      console.error('Usage: node scripts/render.mjs --composition <id> --out <file.mp4> [--inputProps <json>]');
      process.exit(1);
    }
  }
  if (!args.composition) { console.error('[Error] --composition is required.'); process.exit(1); }
  if (!args.out) { console.error('[Error] --out is required.'); process.exit(1); }
  if (!fs.existsSync(path.join(ROOT, 'remotion', 'index.ts'))) { console.error('[Error] Remotion entry not found: remotion/index.ts'); process.exit(1); }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const browserExecutable = process.env.CHROME || undefined;

  console.log(`[Render] Composition: ${args.composition} -> ${args.out}`);
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, 'remotion', 'index.ts'),
    publicDir: path.join(ROOT, 'public'),
    onProgress: () => {},
  });
  const composition = await selectComposition({
    serveUrl,
    id: args.composition,
    ...(args.inputProps ? { inputProps: args.inputProps } : {}),
    ...(browserExecutable ? { browserExecutable } : {}),
  });
  console.log(`Rendering ${args.composition} (${composition.width}x${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} frames)...`);
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: path.resolve(process.cwd(), args.out),
    ...(args.inputProps ? { inputProps: args.inputProps } : {}),
    ...(browserExecutable ? { browserExecutable } : {}),
    onProgress: ({ progress }) => { process.stdout.write(`Rendering progress: ${Math.round(progress * 100)}%\r`); },
  });
  console.log(`\nSuccessfully rendered film to: ${path.resolve(process.cwd(), args.out)}`);
}

main().catch((error) => {
  console.error('Error during render execution:', error);
  process.exit(1);
});
