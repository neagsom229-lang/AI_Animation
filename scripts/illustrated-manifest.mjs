#!/usr/bin/env node
/**
 * @fileoverview Illustrated asset manifest — lists which files are present or
 * missing per scene of an illustrated story. Pure Node, deterministic output.
 *
 * No silent fallbacks: `checkIllustratedAssets()` throws by default when a
 * required asset is missing. Pass `{ allowMissing: true }` to get a report of
 * missing files instead (the film then renders labeled placeholder cards).
 *
 * Usage:
 *   node scripts/illustrated-manifest.mjs
 *   node scripts/illustrated-manifest.mjs --allow-missing
 *   node scripts/illustrated-manifest.mjs --story <path> [--json] [--allow-missing]
 *
 * Windows note: use the direct node form (npm run -- flag passing breaks).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DEFAULT_ILLUSTRATED_STORY = 'src/stories/khmer-empire.json';

/** Depth map filename derived from an illustration path: scene-XX-depth.png */
export function depthPathFor(imagePath) {
  if (!imagePath) return null;
  const dir = path.dirname(imagePath);
  const ext = path.extname(imagePath);
  const base = path.basename(imagePath, ext);
  return path.join(dir, `${base}-depth${ext || '.png'}`).split(path.sep).join('/');
}

/**
 * Check every scene's image / clip / depth files.
 *
 * @param {object} story the parsed illustrated story
 * @param {{repoRoot?: string, allowMissing?: boolean}} [opts]
 * @returns {{scenes: object[], present: number, missing: number, allowMissing: boolean}}
 * @throws {Error} listing missing files when allowMissing is false
 */
export function checkIllustratedAssets(story, opts = {}) {
  const root = opts.repoRoot || ROOT;
  const allowMissing = Boolean(opts.allowMissing);
  if (!story || !Array.isArray(story.scenes)) {
    throw new Error('checkIllustratedAssets: story must have a scenes array.');
  }
  const exists = (rel) => typeof rel === 'string' && rel.length > 0 && fs.existsSync(path.resolve(root, rel));

  const scenes = story.scenes.map((scene, i) => {
    const mediaType = (scene.media && scene.media.type) || (scene.clip ? 'clip' : 'illustration');
    // world3d scenes render the 3D set — they need no illustration/depth/clip.
    if (mediaType === 'world3d') {
      return {
        index: i + 1, id: scene.id, mediaType,
        image: true, depth: true, clip: true,
        imagePath: null, depthPath: null, clipPath: null,
        missing: [],
      };
    }
    const image = scene.image || null;
    const clip = scene.clip || null;
    const depth = depthPathFor(image);
    const entry = {
      index: i + 1,
      id: scene.id,
      mediaType,
      image: image && exists(image),
      imagePath: image,
      depth: depth && exists(depth),
      depthPath: depth,
      clip: clip && exists(clip),
      clipPath: clip,
    };
    entry.missing = [
      !entry.image && entry.imagePath ? `image:${entry.imagePath}` : null,
      !entry.depth && entry.depthPath ? `depth:${entry.depthPath}` : null,
      !entry.clip && entry.clipPath ? `clip:${entry.clipPath}` : null,
    ].filter(Boolean);
    return entry;
  });

  const missingCount = scenes.reduce((n, s) => n + s.missing.length, 0);
  const presentCount = scenes.reduce(
    (n, s) => n + [s.image, s.depth, s.clip].filter(Boolean).length,
    0
  );

  if (missingCount > 0 && !allowMissing) {
    const lines = scenes
      .filter((s) => s.missing.length > 0)
      .map((s) => `  scene ${s.id}: ${s.missing.join(', ')}`);
    throw new Error(
      `Missing ${missingCount} illustrated asset(s); re-run with --allow-missing ` +
        `to render labeled placeholder cards:\n${lines.join('\n')}`
    );
  }
  return { scenes, present: presentCount, missing: missingCount, allowMissing };
}

/** Human-readable manifest lines. */
export function formatManifest(report) {
  const lines = [];
  lines.push('scene      image  depth  clip   status');
  lines.push('-'.repeat(52));
  for (const s of report.scenes) {
    const mark = (v, required) => (v ? 'yes' : required ? 'MISS' : '-');
    lines.push(
      `${String(s.id).padEnd(10)} ${mark(s.image, true).padEnd(6)} ` +
        `${mark(s.depth, true).padEnd(6)} ${mark(s.clip, Boolean(s.clipPath)).padEnd(6)} ` +
        `${s.missing.length === 0 ? 'OK' : `missing: ${s.missing.length}`}`
    );
  }
  lines.push('-'.repeat(52));
  lines.push(`present: ${report.present}  missing: ${report.missing}`);
  if (report.allowMissing && report.missing > 0) {
    lines.push(`NOTE: --allow-missing is ON; ${report.missing} placeholder card(s) will be rendered.`);
  }
  return lines;
}

export function parseArgs(argv) {
  const args = { story: DEFAULT_ILLUSTRATED_STORY, json: false, allowMissing: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--story' && argv[i + 1]) args.story = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--allow-missing') args.allowMissing = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown or incomplete argument: ${a}`);
  }
  return args;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: node scripts/illustrated-manifest.mjs [--story <path>] [--json] [--allow-missing]');
    return 0;
  }
  const story = JSON.parse(fs.readFileSync(path.resolve(ROOT, args.story), 'utf8'));
  const report = checkIllustratedAssets(story, { allowMissing: args.allowMissing });
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const line of formatManifest(report)) console.log(line);
  }
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error('Manifest check failed:', err.message);
    process.exit(1);
  }
}
