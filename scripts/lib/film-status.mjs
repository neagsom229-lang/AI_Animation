/**
 * @fileoverview Status dashboard computation + wrong-folder detection.
 * Reads the filesystem but returns a deterministic, printable report object.
 * @module scripts/lib/film-status
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sourceResolutionGate } from './image-check.mjs';

const IMG_RE = /^(scene[-_ ]?\d+|\d+)\.(png|jpe?g)$/i;

/** Find files that look like source illustrations inside OUTPUT folders. Pure-ish (fs). */
export function findWrongFolderImages(root, cfg) {
  const hits = [];
  for (const dir of [cfg.paths.build, 'out']) {
    const base = path.resolve(root, dir);
    if (!fs.existsSync(base)) continue;
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        const rel = path.relative(path.resolve(root), p).replace(/\\/g, '/');
        if (e.isDirectory()) {
          if (e.name === 'node_modules') continue;
          // Factory-managed staging/preview dirs are NOT user drops.
          if (/^(ingest|preview)$/.test(e.name)) continue;
          walk(p);
        } else if (IMG_RE.test(e.name)) {
          // Generated previews carry the prefix; only flag source-looking names.
          hits.push(rel);
        }
      }
    };
    walk(base);
  }
  return hits;
}

/** Exact fix commands for wrong-folder images. */
export function wrongFolderFixCommands(hits, cfg) {
  const inbox = cfg.paths.inbox;
  const lines = hits.map((h) => `Copy-Item '${h}' '${inbox}/${path.basename(h)}'`);
  lines.push(`node scripts/film.mjs ingest --story ${cfg.story}`);
  return lines;
}

/** Compute per-scene status rows + overall verdict. */
export async function computeStatus({ root, cfg, story, voiceData, timeline, configHashValue }) {
  const rows = [];
  const reasons = [];
  const scenes = story.scenes || [];
  const illDir = path.resolve(root, cfg.paths.illustrations);
  const depthOf = (img) => {
    if (!img) return null;
    const ext = path.extname(img); return `${img.slice(0, -ext.length)}-depth${ext}`;
  };
  const voiceSceneById = new Map((voiceData?.scenes || []).map((s) => [s.id, s]));

  scenes.forEach((spec, i) => {
    const t = timeline.scenes[i] || {};
    const mediaType = (spec.media && spec.media.type) || (spec.clip ? 'clip' : 'illustration');
    const imageRel = spec.image || null;
    const image = imageRel && fs.existsSync(path.resolve(root, imageRel));
    const depthRel = depthOf(imageRel);
    const depth = depthRel && fs.existsSync(path.resolve(root, depthRel));
    const manifestPath = path.resolve(root, cfg.paths.illustrations, 'manifest.json');
    let entry = null;
    if (fs.existsSync(manifestPath)) {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      entry = (m.scenes || []).find((e) => e.scene === i + 1 || e.id === spec.id);
    }
    const reviewed = Boolean(entry && entry.reviewed === true);
    const v = voiceSceneById.get(spec.id);
    const voice = Boolean(v && (v.lines || []).some((l) => l.file));
    const duration = t.durationInFrames ? Number((t.durationInFrames / cfg.fps).toFixed(2)) : null;
    const warnings = [];
    if (mediaType === 'illustration' && !image) warnings.push('missing image');
    if (mediaType === 'illustration' && image && !depth) warnings.push('missing depth');
    if (mediaType !== 'world3d' && !reviewed) warnings.push('not reviewed');
    if (!voice) warnings.push('no voice');
    if (entry && entry.qualityWarnings) warnings.push(...entry.qualityWarnings);
    if (entry && entry.watermarkCheck === false) warnings.push('watermark check required');
    if (entry && entry.matchesNarration === false && mediaType !== 'world3d') warnings.push('matches-narration check required');
    // Round 9 item 1: source resolution gate surfaced in status.
    const srcW = entry && entry.sourceWidth;
    const gate = srcW !== undefined ? sourceResolutionGate(srcW, cfg.quality.minSourceWidth, { draft: false }) : null;
    if (gate && gate.hardFail) warnings.push(gate.warning);
    rows.push({
      scene: spec.id, index: i + 1, mediaType, image, depth, reviewed, voice,
      sourceWidth: srcW ?? null,
      upscaled: entry ? Boolean(entry.upscaled) : false,
      matchesNarration: entry ? Boolean(entry.matchesNarration) : false,
      duration, cache: entry ? 'manifest' : 'none', warnings,
    });
    if (warnings.length) reasons.push(`${spec.id}: ${warnings.join(', ')}`);
  });

  const wrongFolder = findWrongFolderImages(root, cfg);
  if (wrongFolder.length) reasons.push(`${wrongFolder.length} source image(s) in OUTPUT folders (run the printed copy+ingest commands)`);

  // Round 9 item 2: exact + near-duplicate detection across scenes (blocking).
  let duplicateGroups = [];
  let requeue = [];
  try {
    const { buildImageRecords, groupDuplicates, requeueBlock } = await import('./film-duplicates.mjs');
    const promptPath = path.resolve(root, cfg.intake.promptFile);
    const promptsText = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : '';
    const records = buildImageRecords({ story, promptsDoc: promptsText, root });
    duplicateGroups = groupDuplicates(records);
    if (duplicateGroups.length) {
      requeue = duplicateGroups.map(requeueBlock);
      reasons.push(`${duplicateGroups.length} duplicate group(s) — BLOCKING for final render (see REQUEUE)`);
    }
  } catch (e) {
    reasons.push(`duplicate check failed: ${e.message}`);
  }

  // Stale preview sheet check.
  const sheetMeta = path.resolve(root, cfg.paths.preview, 'contact.meta.json');
  let sheetStale = null;
  if (fs.existsSync(sheetMeta)) {
    const meta = JSON.parse(fs.readFileSync(sheetMeta, 'utf8'));
    const current = requireCurrentInputHash(root, cfg, scenes);
    sheetStale = meta.inputHash !== current;
    if (sheetStale) reasons.push(`preview contact sheet is stale (${meta.inputHash} != ${current})`);
  } else {
    reasons.push('no preview contact sheet built');
  }

  const releasable = reasons.length === 0;
  return {
    configHash: configHashValue,
    scenes: rows,
    wrongFolder,
    wrongFolderFixes: wrongFolderFixCommands(wrongFolder, cfg),
    duplicateGroups,
    requeue,
    sheetStale,
    releasable,
    reasons,
    verdict: releasable ? 'releasable: yes' : 'releasable: no',
  };
}

/** Hash of current normalized inputs (for stale-sheet detection). */
export function requireCurrentInputHash(root, cfg, scenes) {
  // Avoid a circular import; compute a compact hash from the normalized files + story.
  const parts = [];
  for (const s of scenes || []) {
    const rel = s.image;
    const abs = path.resolve(root, rel || 'none');
    if (rel && fs.existsSync(abs)) {
      parts.push(`${rel}|${fs.statSync(abs).size}|${crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')}`);
    }
  }
  const storyAbs = path.resolve(root, cfg.story);
  if (fs.existsSync(storyAbs)) parts.push(`story|${crypto.createHash('sha256').update(fs.readFileSync(storyAbs)).digest('hex')}`);
  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
}
