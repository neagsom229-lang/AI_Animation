#!/usr/bin/env node
/**
 * @fileoverview Round 10 item 6: film doctor — runs gates in order, stops at the
 * FIRST blocker, prints the exact fix command, one summary table, non-zero exit.
 *
 * Gate order: ingest -> duplicates -> resolution -> manual review -> depth ->
 * parallax metrics -> draft render. Each gate reports PASS/BLOCK/SKIP.
 *
 * Usage: node scripts/film-doctor.mjs [--story <path>] [--allow-missing]
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, configHash } from './lib/film-config.mjs';
import { checkIllustratedAssets } from './illustrated-manifest.mjs';
import { buildImageRecords, groupDuplicates, requeuePlan } from './lib/film-duplicates.mjs';
import { isManifestEntryReady, REQUIRED_MANIFEST_FIELDS, REQUIRED_MANIFEST_FLAGS, sourceResolutionGate } from './lib/image-check.mjs';
import { probeEnvironment } from './lib/film-env.mjs';
import { cachedPhash, loadCache, saveCache, pruneCache, newStats, cacheReport } from './lib/probe-cache.mjs';

const ROOT = process.cwd();

function parseArgs(argv) {
  const a = { story: null, allowMissing: false, profile: 'final' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--story' && argv[i + 1]) a.story = argv[++i];
    else if (argv[i] === '--allow-missing') a.allowMissing = true;
    else if (argv[i] === '--profile' && argv[i + 1]) {
      const v = String(argv[++i]).toLowerCase();
      if (!['draft', 'final'].includes(v)) throw new Error('--profile must be draft or final');
      a.profile = v;
    } else throw new Error(`Unknown: ${argv[i]}`);
  }
  return a;
}

/** A gate result: {name, status:'PASS'|'BLOCK'|'SKIP', detail, fix}. */
export function runGates({ cfg, story, allowMissing = false, profile = 'final', stopOnBlock = true }) {
  const gates = [];
  const draft = profile === 'draft' || allowMissing;
  const add = (name, status, detail, fix = '') => gates.push({ name, status, detail, fix });
  const illDir = path.resolve(ROOT, cfg.paths.illustrations);
  const manifestPath = path.join(illDir, 'manifest.json');

  // 0) environment (Round 13 item 1) — the ONE Python env + ffmpeg + node.
  const env = probeEnvironment(ROOT);
  add('environment', env.ok ? 'PASS' : 'BLOCK', env.summary, env.fix);
  if (!env.ok) return gates;

  // 1) ingest — normalized images present for illustration scenes.
  try {
    const report = checkIllustratedAssets(story, { allowMissing: true });
    const missingIll = report.scenes.filter((s) => s.missing.length > 0);
    if (!allowMissing && missingIll.length) {
      add('ingest', 'BLOCK', `${missingIll.length} scene(s) missing assets`,
        'Copy images into assets-src/inbox/, then: node scripts/film.mjs ingest');
      if (stopOnBlock) return gates; // stop at first blocker
    }
    add('ingest', allowMissing && missingIll.length ? 'SKIP' : 'PASS',
      allowMissing && missingIll.length ? `${missingIll.length} missing (--allow-missing)` : `${report.scenes.length} scenes present`);
  } catch (e) {
    add('ingest', 'BLOCK', e.message.slice(0, 100), 'Copy images into assets-src/inbox/, then: node scripts/film.mjs ingest');
    if (stopOnBlock) return gates;
  }

  // 2) duplicates (exact + near), pHash results cached by (path, mtime, size).
  const promptText = fs.existsSync(path.resolve(ROOT, cfg.intake.promptFile))
    ? fs.readFileSync(path.resolve(ROOT, cfg.intake.promptFile), 'utf8') : '';
  const probeCache = loadCache(ROOT);
  const probeStats = newStats();
  const records = buildImageRecords({
    story, promptsDoc: promptText, root: ROOT,
    phashFn: (file) => cachedPhash(file, { root: ROOT, cache: probeCache, stats: probeStats }),
  });
  saveCache(pruneCache(probeCache, ROOT), ROOT);
  gates.probeCache = cacheReport(probeStats);
  const groups = groupDuplicates(records);
  if (groups.length) {
    // Final render blocks; drafts (draft profile / --allow-missing) warn only.
    add('duplicates', draft ? 'SKIP' : 'BLOCK',
      `${groups.length} duplicate group(s): ${groups.map((g) => g.map((r) => r.scene).join('=')).join('; ')}${draft ? ' (draft: warn only)' : ''}`,
      `Regenerate distinct images, then: node scripts/film.mjs ingest\n${requeuePlan(groups)}`);
    if (!draft && stopOnBlock) return gates; // stop at first blocker
  } else {
    add('duplicates', 'PASS', `${records.length} unique image(s)`);
  }

  // 3) resolution (SOURCE width, never resized copy).
  if (fs.existsSync(manifestPath)) {
    const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    // Count against the FINAL threshold; the profile decides block vs skip.
    const low = (man.scenes || []).filter((e) => e.sourceWidth !== undefined &&
      sourceResolutionGate(e.sourceWidth, cfg.quality.minSourceWidth, { draft: false }).hardFail);
    if (low.length && !draft) {
      add('resolution', 'BLOCK', `${low.length} scene(s) source < ${cfg.quality.minSourceWidth}px`,
        'node scripts/film.mjs upscale --scene N (Real-ESRGAN BSD-3) or regenerate larger sources');
      if (stopOnBlock) return gates;
    }
    add('resolution', low.length ? 'SKIP' : 'PASS', low.length ? `${low.length} scene(s) source < ${cfg.quality.minSourceWidth}px (draft: warn only)` : `all >= ${cfg.quality.minSourceWidth}px`);

    // 4) manual review.
    const bad = (man.scenes || []).filter((e) => !isManifestEntryReady(e));
    if (bad.length && !draft) {
      add('manual-review', 'BLOCK', `${bad.length} scene(s) incomplete: ${bad.slice(0, 2).map((e) =>
        `scene ${e.scene} missing [${[...REQUIRED_MANIFEST_FIELDS, ...REQUIRED_MANIFEST_FLAGS].filter((k) =>
          e[k] !== true && !(typeof e[k] === 'string' && e[k].trim())).join(',')}]`).join('; ')}`,
        'Review each image with: node scripts/film.mjs review --scene N --matches-narration yes --watermark clear --reviewed yes (and review --license-url). NEVER auto-fill.');
      if (stopOnBlock) return gates;
    }
    add('manual-review', bad.length ? 'SKIP' : 'PASS', bad.length ? `${bad.length} unreviewed (draft: warn only)` : 'all reviewed');
  } else {
    add('manual-review', 'BLOCK', 'no manifest.json', 'node scripts/film.mjs ingest');
    if (stopOnBlock) return gates;
  }

  // 5) depth (files present + source labeled).
  const depthFiles = records.filter((r) => fs.existsSync(path.resolve(ROOT, r.image.replace(/\.[^.]+$/, '') + '-depth' + path.extname(r.image))));
  if (depthFiles.length < records.length && !allowMissing) {
    add('depth', 'BLOCK', `${depthFiles.length}/${records.length} depth maps`,
      'node scripts/film.mjs depth --depth gradient (or model if torch available)');
    if (stopOnBlock) return gates;
  }
  add('depth', 'PASS', `${depthFiles.length}/${records.length} depth maps present`);

  // 6) parallax metrics present with real fields.
  const metricsPath = path.resolve(ROOT, 'out/review/parallax-metrics.json');
  const addDraftRenderGate = () => {
    const draftScript = fs.existsSync(path.resolve(ROOT, 'scripts/film-render-select.mjs'));
    add('draft-render', draftScript ? 'PASS' : 'BLOCK',
      draftScript ? 'script available (run: node scripts/film-render-select.mjs --scenes 1,4,7)' : 'missing',
      'node scripts/film-render-select.mjs --scenes 1,4,7');
  };
  if (!fs.existsSync(metricsPath)) {
    add('parallax-metrics', 'BLOCK', 'no parallax-metrics.json', 'node scripts/film.mjs depth --depth gradient');
    if (stopOnBlock) return gates;
    addDraftRenderGate();
    return gates;
  }
  const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  const badMetrics = (metrics.scenes || []).filter((s) =>
    typeof s.depthEdgeMetric !== 'number' || typeof s.depthRange !== 'number' || typeof s.flatDepth !== 'boolean' || !s.depthSource);
  if (badMetrics.length) {
    add('parallax-metrics', 'BLOCK', `${badMetrics.length} scene(s) missing stats`,
      'python scripts/depth.py --story <story> --depth gradient  (regenerates metrics)');
    if (stopOnBlock) return gates;
    addDraftRenderGate();
    return gates;
  }
  const allZero = (metrics.scenes || []).every((s) => s.depthEdgeMetric === 0);
  add('parallax-metrics', 'PASS',
    `${(metrics.scenes || []).length} scenes; edge min/median/max = ${
      (() => { const e = (metrics.scenes || []).map((s) => s.depthEdgeMetric).sort((a, b) => a - b);
        return e.length ? `${e[0]}/${e[Math.floor(e.length / 2)]}/${e[e.length - 1]}` : 'n/a'; })()}${allZero ? ' — ALL ZERO (gradient depth; see report)' : ''}`);

  // 7) draft render (report-only here; the real render is item 7).
  addDraftRenderGate();
  return gates;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cfg = loadConfig(ROOT);
  if (args.story) cfg.story = args.story;
  const story = JSON.parse(fs.readFileSync(path.resolve(ROOT, cfg.story), 'utf8'));
  console.log(`[film doctor] config=${configHash(cfg)} story=${cfg.story} profile=${args.profile}${args.allowMissing ? ' --allow-missing' : ''}`);
  const envProbe = probeEnvironment(ROOT);
  for (const w of envProbe.warnings || []) console.log(`[WARN] ${w}`);
  const gates = runGates({ cfg, story, allowMissing: args.allowMissing, profile: args.profile });

  console.log('\ngate                  status   detail');
  console.log('-'.repeat(96));
  for (const g of gates) {
    console.log(`${g.name.padEnd(21)} ${g.status.padEnd(8)} ${g.detail}`);
    if (g.fix) console.log(`  FIX: ${g.fix.split('\n')[0]}`);
  }
  console.log('-'.repeat(96));
  if (gates.probeCache) console.log(gates.probeCache);
  const blocker = gates.find((g) => g.status === 'BLOCK');
  if (blocker) {
    console.error(`\nFILM DOCTOR: BLOCKED at "${blocker.name}". Fix:\n${blocker.fix}`);
    return 1;
  }
  console.log('\nFILM DOCTOR: all gates PASS/SKIP.');
  return 0;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('film doctor crashed:', e); process.exit(1); });
