/**
 * @fileoverview Smart ingest stage: map filenames -> scenes, keep originals,
 * quality-gate, and wrap the existing intake-illustrations.mjs normalizer.
 * @module scripts/lib/film-ingest
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mapFilenames, missingScenes } from './film-map.mjs';
import { hashInputs } from './film-graph.mjs';
import { isUpscaled, sourceResolutionGate } from './image-check.mjs';
import { imageToGray32, perceptualHash } from './film-duplicates.mjs';

/** Probe an image with Remotion ffprobe (returns width/height/pix_fmt). */
export function probeImage(file) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const r = requireSpawn(npx, ['remotion', 'ffprobe', '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,pix_fmt', '-of', 'json', file]);
  try {
    const j = JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1));
    const s = (j.streams || [])[0] || {};
    return { width: Number(s.width), height: Number(s.height), pixFmt: s.pix_fmt || '' };
  } catch { return { width: NaN, height: NaN, pixFmt: '' }; }
}
function requireSpawn(cmd, args) {
  // eslint-disable-next-line no-undef
  return execFileSync(cmd, args, { cwd: process.cwd(), encoding: 'utf8', shell: process.platform === 'win32',
    maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Quality warnings for an image (does not reject — intake normalizes). */
export function qualityWarnings({ width, height, pixFmt }, cfg) {
  const w = [];
  const ratio = width / height;
  const target = 16 / 9;
  if (!(Math.abs(ratio - target) / target <= cfg.quality.aspectTolerance)) {
    w.push(`aspect ${ratio.toFixed(3)} outside 16:9 ±${(cfg.quality.aspectTolerance * 100).toFixed(0)}% — will crop`);
  }
  if (width < cfg.quality.minWidth || height < cfg.quality.minHeight) {
    w.push(`${width}x${height} below ${cfg.quality.minWidth}x${cfg.quality.minHeight} — will upscale (quality unverified)`);
  }
  if (/a|alpha|yuva/i.test(pixFmt) && pixFmt.includes('a') && !pixFmt.startsWith('yuv')) {
    w.push(`alpha channel (${pixFmt}) — will flatten`);
  }
  return w;
}

/** The ingest stage runner. */
export async function ingest({ cfg, args, graph, data, force, only, verbose }) {
  const root = process.cwd();
  const inbox = path.resolve(root, cfg.paths.inbox);
  const originals = path.resolve(root, cfg.paths.originals);
  const staging = path.resolve(root, cfg.paths.build, 'ingest', data.storyName);
  fs.mkdirSync(inbox, { recursive: true });
  fs.mkdirSync(originals, { recursive: true });
  fs.mkdirSync(staging, { recursive: true });

  const mapPath = path.join(inbox, 'map.json');
  const mapObject = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, 'utf8')) : {};
  const files = fs.readdirSync(inbox).filter((f) => /\.(png|jpe?g)$/i.test(f) && !f.startsWith('_'));
  const result = mapFilenames(files, mapObject, data.story.scenes.length);
  graph.log(`ingest: ${files.length} inbox file(s) -> ${result.mapped.length} scenes, ${result.unmapped.length} unmapped, ${Object.keys(result.duplicates).length} duplicate scene(s)`);

  if (result.unmapped.length) {
    for (const f of result.unmapped) graph.log(`  UNMAPPED: ${f} — add to ${cfg.paths.inbox}/map.json (e.g. {"3": "${f}"})`);
  }
  if (Object.keys(result.duplicates).length) {
    for (const [scene, fs2] of Object.entries(result.duplicates)) graph.log(`  DUPLICATE scene ${scene}: ${fs2.join(', ')} — using ${fs2[0]}`);
  }
  const missing = missingScenes(result.mapped, data.story.scenes.length);
  if (missing.length) graph.log(`  MISSING scenes: ${missing.join(', ')}`);

  // Keep originals + stage renamed copies for the existing intake wrapper.
  // IMPORTANT: probe the SOURCE (inbox) file, never the resized output.
  const warningsByScene = {};
  const sourceByScene = {};
  const resolutionByScene = {};
  const hashByScene = {};
  for (const m of result.mapped) {
    if (only && only !== m.scene) continue;
    const src = path.join(inbox, m.file);
    const destOrig = path.join(originals, m.file);
    fs.copyFileSync(src, destOrig);
    const q = probeImage(src);
    const warns = qualityWarnings(q, cfg);
    if (warns.length) warningsByScene[m.scene] = warns;
    sourceByScene[m.scene] = { sourceWidth: q.width, sourceHeight: q.height, upscaled: isUpscaled(q.width, cfg.resolutions.master[0]) };
    // Perceptual hash of the SOURCE image (exact SHA-256 is written by intake on the normalized copy).
    try {
      hashByScene[m.scene] = { sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex'),
        phash: perceptualHash(imageToGray32(src)) };
    } catch { /* phash is advisory; status recomputes from normalized images */ }
    const gate = sourceResolutionGate(q.width, cfg.quality.minSourceWidth, { draft: args.draft });
    resolutionByScene[m.scene] = gate;
    if (gate.warning) {
      warningsByScene[m.scene] = [...(warningsByScene[m.scene] || []), gate.warning];
      graph.log(`  scene ${m.scene}: SOURCE GATE ${gate.hardFail ? 'BLOCK' : 'WARN'}: ${gate.warning}`);
    }
    const staged = path.join(staging, `scene-${String(m.scene).padStart(2, '0')}.png`);
    fs.copyFileSync(src, staged);
    graph.log(`  scene ${m.scene}: SOURCE ${q.width}x${q.height} ${q.pixFmt}${warns.length ? ` [${warns.join('; ')}]` : ''}`);
  }

  // Wrap the existing normalizer. Force allows provisional license for dry runs.
  const intakeArgs = ['scripts/intake-illustrations.mjs', staging,
    '--tool', cfg.intake.tool, '--prompt-file', cfg.intake.promptFile];
  if (cfg.intake.licenseTermsUrl) intakeArgs.push('--license-terms-url', cfg.intake.licenseTermsUrl);
  else if (force) {
    intakeArgs.push('--allow-missing-fields');
    graph.log('  WARN: --force with empty licenseTermsUrl — provisional license, NOT releasable');
  } else {
    throw new Error(`intake licenseTermsUrl is empty in film.config.json. FIX: set intake.licenseTermsUrl to the tool's license URL (or pass --force for a provisional dry run).`);
  }
  graph.log('  wrapping: node ' + intakeArgs.join(' '));
  execFileSync('node', intakeArgs, { cwd: root, stdio: 'inherit' });

  // Enrich the produced manifest with factory checklist fields (never hide marks).
  const manifestPath = path.resolve(root, cfg.paths.illustrations, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const e of man.scenes || []) {
      const src = sourceByScene[e.scene] || {};
      const prevUpscaled = e.upscaled === true; // preserve a previous film upscale
      // SOURCE resolution (measured on the inbox file), never the resized output.
      if (Number.isFinite(src.sourceWidth)) {
        e.sourceWidth = src.sourceWidth;
        e.sourceHeight = src.sourceHeight;
      }
      e.upscaled = prevUpscaled || src.upscaled === true;
      const h = hashByScene[e.scene] || {};
      if (h.sourceSha256) e.sourceSha256 = h.sourceSha256;
      if (h.phash) e.phash = h.phash;
      e.watermarkCheck = false; // required checklist item: check tool terms
      e.matchesNarration = false; // required checklist item: content check (item 3)
      e.qualityWarnings = warningsByScene[e.scene] || [];
      e.reviewed = false;
    }
    man.factory = { story: cfg.story, ingested: new Date().toISOString(), provisionalLicense: !cfg.intake.licenseTermsUrl };
    fs.writeFileSync(manifestPath, JSON.stringify(man, null, 2) + '\n', 'utf8');
  }
  graph.log(`ingest done. ACTION: review each image (docs/IMAGE_REVIEW_CHECKLIST.md); check watermark vs tool terms; set reviewed:true.`);
  return { mapped: result.mapped.length, unmapped: result.unmapped.length, duplicates: Object.keys(result.duplicates).length, missing };
}
