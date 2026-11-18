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
import { isUpscaled, sourceResolutionGate, aspectCropPercent } from './image-check.mjs';
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

/** Quality warnings for an image (final render warns; intake normalizes with a logged crop). */
export function qualityWarnings({ width, height, pixFmt }, cfg) {
  const w = [];
  const ratio = width / height;
  const target = 16 / 9;
  if (!(Math.abs(ratio - target) / target <= cfg.quality.aspectTolerance)) {
    const crop = aspectCropPercent(width, height);
    w.push(`aspect ${ratio.toFixed(3)} outside 16:9 ±${(cfg.quality.aspectTolerance * 100).toFixed(0)}% — final-render WARNING: crops ${crop.percent}% ${crop.axis} (quality unverified)`);
  }
  if (width < cfg.quality.minWidth || height < cfg.quality.minHeight) {
    w.push(`${width}x${height} below ${cfg.quality.minWidth}x${cfg.quality.minHeight} — will upscale (quality unverified)`);
  }
  if (/a|alpha|yuva/i.test(pixFmt) && pixFmt.includes('a') && !pixFmt.startsWith('yuv')) {
    w.push(`alpha channel (${pixFmt}) — will flatten`);
  }
  return w;
}

/** List candidate images in a drop folder (never recurses, skips _originals). */
export function listDropImages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f) && !f.startsWith('_')).sort();
}

/**
 * Round 13 item 2: ONE drop folder. Inbox only; if it is empty, fall back to
 * the legacy build/ingest/<story> staging path with a deprecation warning.
 * @returns {{dir: string, files: string[], deprecated: boolean}}
 */
export function resolveDropFolder({ root, inbox, staging, storyName }) {
  const inboxFiles = listDropImages(inbox);
  if (inboxFiles.length > 0) return { dir: path.resolve(inbox), files: inboxFiles, deprecated: false };
  // Legacy staging path (pre-Round-13). Read-only fallback, never the default.
  const legacy = path.join(path.resolve(root, 'build', 'ingest'), storyName);
  const legacyFiles = listDropImages(legacy);
  if (legacyFiles.length > 0) {
    return { dir: legacy, files: legacyFiles, deprecated: true };
  }
  return { dir: path.resolve(inbox), files: [], deprecated: false };
}

/** Timestamped backup folder name (filesystem-safe). */
export function backupDirName(ts = new Date()) {
  return String(ts.toISOString()).replace(/[:.]/g, '-');
}

/**
 * Copy (never move/delete) every normalized file that ingest is about to
 * replace into assets-src/backup/<timestamp>/.
 * @returns {{dir: string, files: string[]}}
 */
export function backupReplaced({ root, cfg, mappedScenes }) {
  const stamp = backupDirName();
  const dir = path.join(path.resolve(root, 'assets-src', 'backup'), stamp);
  const files = [];
  for (const scene of mappedScenes) {
    const dest = path.resolve(root, cfg.paths.illustrations, targetDestName(scene));
    if (!fs.existsSync(dest)) continue;
    fs.mkdirSync(dir, { recursive: true });
    const copy = path.join(dir, path.basename(dest));
    fs.copyFileSync(dest, copy);
    files.push(path.basename(dest));
  }
  return { dir, files };
}

function targetDestName(sceneNo) {
  return `scene-${String(sceneNo).padStart(2, '0')}.png`;
}

function fileSha(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch { return null; }
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

  // Round 12 item 4: state the license requirement FIRST, before scanning any
  // image — the operator must know up front that a license URL is mandatory.
  graph.log('ingest REQUIREMENT: each image must have a licenseTermsUrl (tool license URL) recorded in film.config.json → intake.licenseTermsUrl.');
  const licenseUrl = cfg.intake?.licenseTermsUrl || '';
  if (licenseUrl) {
    graph.log(`  licenseTermsUrl = ${licenseUrl}`);
  } else if (force) {
    graph.log('  WARN: licenseTermsUrl is EMPTY — --force grants a PROVISIONAL license only; final render will BLOCK until filled.');
  } else {
    throw new Error(
      `ingest: licenseTermsUrl is required in film.config.json (intake.licenseTermsUrl). ` +
      `FIX: set it to the generating tool's license terms URL, then re-run. ` +
      `Use --force only for a provisional dry run (final render blocked).`
    );
  }

  const mapPath = path.join(inbox, 'map.json');
  const mapObject = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, 'utf8')) : {};
  const drop = resolveDropFolder({ root, inbox, staging, storyName: data.storyName });
  if (drop.deprecated) {
    graph.log(`  DEPRECATED: ${cfg.paths.inbox}/ has no images — reading the legacy staging path ${path.relative(root, drop.dir)}/.`);
    graph.log(`  FIX: copy the images into ${cfg.paths.inbox}/ (the one drop folder). Nothing is moved or deleted.`);
  }
  const files = drop.files;
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

  // Round 13 item 2: copy every file that ingest is about to replace into a
  // timestamped backup BEFORE any write. Never move, never delete.
  const processedScenes = result.mapped.filter((m) => !only || only === m.scene).map((m) => m.scene);
  const beforeHashes = new Map();
  for (const scene of processedScenes) {
    const dest = path.resolve(root, cfg.paths.illustrations, targetDestName(scene));
    beforeHashes.set(scene, fs.existsSync(dest) ? fileSha(dest) : null);
  }
  const backup = backupReplaced({ root, cfg, mappedScenes: processedScenes });
  if (backup.files.length) graph.log(`ingest: backed up ${backup.files.length} replaced file(s) -> ${path.relative(root, backup.dir).replace(/\\/g, '/')}`);

  // Keep originals + stage renamed copies for the existing intake wrapper.
  // IMPORTANT: probe the SOURCE (inbox) file, never the resized output.
  const warningsByScene = {};
  const sourceByScene = {};
  const resolutionByScene = {};
  const hashByScene = {};
  for (const m of result.mapped) {
    if (only && only !== m.scene) continue;
    const src = path.join(drop.dir, m.file);
    const destOrig = path.join(originals, m.file);
    fs.copyFileSync(src, destOrig);
    const q = probeImage(src);
    const warns = qualityWarnings(q, cfg);
    if (warns.length) warningsByScene[m.scene] = warns;
    const cropInfo = aspectCropPercent(q.width, q.height);
    sourceByScene[m.scene] = {
      sourceWidth: q.width, sourceHeight: q.height,
      sourceAspect: Number((q.width / q.height).toFixed(4)),
      aspectCropPercent: cropInfo.percent,
      aspectCropAxis: cropInfo.axis,
      upscaled: isUpscaled(q.width, cfg.resolutions.master[0]),
    };
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
        e.sourceAspect = src.sourceAspect;
        e.aspectCropPercent = src.aspectCropPercent;
        e.aspectCropAxis = src.aspectCropAxis;
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
  // Round 13 item 2: exactly one summary line after a successful ingest.
  let added = 0; let replaced = 0; let unchanged = 0;
  for (const scene of processedScenes) {
    const dest = path.resolve(root, cfg.paths.illustrations, targetDestName(scene));
    const before = beforeHashes.get(scene);
    const after = fs.existsSync(dest) ? fileSha(dest) : null;
    if (before === null) added += 1;
    else if (after && after !== before) replaced += 1;
    else unchanged += 1;
  }
  console.log(`${added} new, ${replaced} replaced, ${unchanged} unchanged`);
  graph.log(`ingest done. ACTION: review each image (docs/IMAGE_REVIEW_CHECKLIST.md); check watermark vs tool terms; set reviewed:true.`);
  return { mapped: result.mapped.length, unmapped: result.unmapped.length, duplicates: Object.keys(result.duplicates).length, missing, added, replaced, unchanged };
}
