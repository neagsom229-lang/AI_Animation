/**
 * @fileoverview Preview stage: contact sheet + animatic built from REAL images
 * when present; placeholders only for missing scenes (clearly badged). Stamps
 * the sheet with an input hash for stale detection.
 * @module scripts/lib/film-preview-stage
 */
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { tileContactSheet } from '../lib/contact-sheet.mjs';
import { requireCurrentInputHash } from './film-status.mjs';
import { stampSheet, isSheetStale } from './film-preview.mjs';
import { encodePng } from '../lib/png.mjs';

/** Generate a FLAT (no parallax) labeled depth PNG for a real image lacking depth. */
export function ensureFlatDepth(imageRel) {
  const ext = path.extname(imageRel);
  const depthRel = `${imageRel.slice(0, -ext.length)}-depth${ext}`;
  const depthAbs = path.resolve(process.cwd(), depthRel);
  if (fs.existsSync(depthAbs)) return { depthRel, generated: false };
  const imgAbs = path.resolve(process.cwd(), imageRel);
  if (!fs.existsSync(imgAbs)) return { depthRel: null, generated: false };
  // Read source dimensions from PNG header or ffprobe; use a tiny flat texture
  // (parallax is 0 at depth 0.5 so dimensions only need to cover UV [0,1]).
  const w = 64, h = 36;
  const data = Buffer.alloc(w * h * 4, 128);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  fs.writeFileSync(depthAbs, encodePng({ width: w, height: h, data }));
  fs.writeFileSync(`${depthAbs}.mode.txt`,
    'mode: flat-preview (no parallax; depth=0.5). NOT a learned depth map. Run film depth for real parallax.\n');
  return { depthRel, generated: true };
}

export async function preview({ cfg, args, graph, data, force, only }) {
  const root = process.cwd();
  const { story, voiceData, timeline } = data;
  if (!voiceData || !timeline) throw new Error(`Preview needs voice data. FIX: node scripts/film.mjs voice --story ${cfg.story}`);
  const previewDir = path.resolve(root, cfg.paths.preview);
  fs.mkdirSync(previewDir, { recursive: true });

  // Asset status from REAL normalized files.
  const status = {};
  let realCount = 0;
  for (const spec of story.scenes) {
    const image = Boolean(spec.image && fs.existsSync(path.resolve(root, spec.image)));
    const ext = spec.image ? path.extname(spec.image) : '';
    let depth = Boolean(spec.image && fs.existsSync(path.resolve(root, spec.image.slice(0, -ext.length) + `-depth${ext}`)));
    if (image && !depth) {
      const flat = ensureFlatDepth(spec.image);
      if (flat.generated) graph.log(`  scene ${spec.id}: generated FLAT preview depth (labeled; no parallax)`);
      depth = Boolean(flat.depthRel);
    }
    status[spec.id] = { image, depth, clip: false };
    if (image) realCount += 1;
  }
  graph.log(`preview: ${realCount}/${story.scenes.length} real images present; others are badged placeholders`);

  // Stage real assets into public/illustrated/ so staticFile() can serve them.
  // (Mirrors make-illustrated's stageAssets, not a rewrite of the renderer.)
  const { publicAssetPath } = await import('../../remotion/lib/illustrated-assets.ts');
  for (const spec of story.scenes) {
    for (const rel of [spec.image, spec.image ? `${spec.image.replace(/\.[^.]+$/, '')}-depth${path.extname(spec.image)}` : null]) {
      if (!rel || !fs.existsSync(path.resolve(root, rel))) continue;
      const dest = path.resolve(root, 'public', publicAssetPath(rel));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.resolve(root, rel), dest);
    }
  }

  const inputHash = requireCurrentInputHash(root, cfg, story.scenes);
  const sheet = path.join(previewDir, `${data.storyName}-contact.png`);
  if (!force && !isSheetStale(sheet, inputHash)) {
    graph.log(`preview: sheet fresh (${inputHash}) — skip`);
    return { skipped: true, inputHash, sheet };
  }

  const inputProps = { story, voiceData, assetStatus: status, allowMissing: true, isDraft: true };
  const serveUrl = await bundle({ entryPoint: path.resolve(root, 'remotion/index.ts'), publicDir: path.resolve(root, 'public'), onProgress: () => {} });
  const composition = await selectComposition({ serveUrl, id: 'IllustratedFilm', inputProps });

  const stills = [];
  for (const [i, scene] of timeline.scenes.entries()) {
    if (only && only !== i + 1) continue;
    const frame = scene.startFrame + Math.floor(scene.durationInFrames / 2);
    const f = path.join(previewDir, `${data.storyName}-preview-${String(i + 1).padStart(2, '0')}.png`);
    await renderStill({ composition, serveUrl, output: f, frame, inputProps, timeoutInMilliseconds: 60000 });
    stills.push(f);
  }
  const result = tileContactSheet({ inputs: stills, output: sheet, cols: 3, cellWidth: 480 });
  const stamped = stampSheet(sheet, inputHash, {
    scenes: timeline.scenes.length, realImages: realCount, cols: result.cols, rows: result.rows,
  });
  graph.log(`preview: wrote ${path.relative(root, sheet)} (${stills.length} stills, hash ${inputHash})`);
  return { skipped: false, inputHash, sheet: stamped.sheetPath, meta: stamped.metaPath, realImages: realCount };
}
