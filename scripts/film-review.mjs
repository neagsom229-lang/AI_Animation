#!/usr/bin/env node
/**
 * @fileoverview Round 13 item 5: review without editing JSON by hand.
 *
 * Commands:
 *   node scripts/film-review.mjs sheet [--out out/review/review.html]
 *     Build out/review/review.html: each scene image next to its narration,
 *     sha256, source size, duplicate flag, watermark note and current flags.
 *
 *   node scripts/film-review.mjs --scene N --matches-narration yes|no \
 *     --watermark clear|visible --reviewed yes [--reviewer name]
 *     Set the manual flags for THAT SCENE ONLY and log who/when in the manifest.
 *
 *   node scripts/film-review.mjs --license-url <url>
 *     Set intake.licenseTermsUrl in film.config.json. Validates that it is an
 *     http(s) URL; it does not judge the licence content.
 *
 * This is the ONLY code path allowed to set reviewed / matchesNarration /
 * watermarkCheck / licenseTermsUrl. Nothing is ever auto-filled elsewhere.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/film-config.mjs';
import { buildImageRecords, groupDuplicates } from './lib/film-duplicates.mjs';
import { cachedPhash, loadCache, saveCache, pruneCache, newStats } from './lib/probe-cache.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const YES = new Set(['yes', 'y', 'true', '1']);
const NO = new Set(['no', 'n', 'false', '0']);

/** Parse review CLI arguments. Throws with exact usage on bad input. */
export function parseArgs(argv) {
  const a = {
    mode: null, scene: null, matchesNarration: null, watermarkCheck: null,
    reviewed: null, licenseUrl: null, out: 'out/review/review.html',
    reviewer: null, story: null, verbose: false,
  };
  const rest = [...argv];
  if (rest.length && !rest[0].startsWith('-')) a.mode = rest.shift();
  for (let i = 0; i < rest.length; i += 1) {
    const x = rest[i];
    if (x === '--scene' && rest[i + 1]) {
      const m = String(rest[++i]).match(/(\d+)/);
      if (!m) throw new Error(`--scene needs a number (got "${x}")`);
      a.scene = Number(m[1]);
    } else if (x === '--matches-narration' && rest[i + 1]) {
      const v = String(rest[++i]).toLowerCase();
      if (!YES.has(v) && !NO.has(v)) throw new Error('--matches-narration must be yes or no');
      a.matchesNarration = YES.has(v);
    } else if (x === '--watermark' && rest[i + 1]) {
      const v = String(rest[++i]).toLowerCase();
      if (!['clear', 'visible', 'yes', 'no'].includes(v)) throw new Error('--watermark must be clear or visible');
      a.watermarkCheck = v === 'clear' || v === 'yes';
    } else if (x === '--reviewed' && rest[i + 1]) {
      const v = String(rest[++i]).toLowerCase();
      if (!YES.has(v) && !NO.has(v)) throw new Error('--reviewed must be yes or no');
      a.reviewed = YES.has(v);
    } else if (x === '--license-url' && rest[i + 1]) {
      a.licenseUrl = rest[++i];
    } else if (x === '--out' && rest[i + 1]) {
      a.out = rest[++i];
    } else if (x === '--reviewer' && rest[i + 1]) {
      a.reviewer = rest[++i];
    } else if (x === '--story' && rest[i + 1]) {
      a.story = rest[++i];
    } else if (x === '--verbose') {
      a.verbose = true;
    } else if (x === '--help' || x === '-h') {
      a.help = true;
    } else {
      throw new Error(`Unknown argument: ${x}. Usage:
  node scripts/film-review.mjs sheet [--out out/review/review.html]
  node scripts/film-review.mjs --scene N --matches-narration yes|no --watermark clear|visible --reviewed yes
  node scripts/film-review.mjs --license-url <url>`);
    }
  }
  if (!a.help && !a.mode && a.scene === null && !a.licenseUrl) {
    throw new Error('Nothing to do. Use "sheet", --scene N ..., or --license-url <url> (see --help).');
  }
  return a;
}

/** Validate an http(s) URL without judging its content. */
export function validateLicenseUrl(value) {
  let u;
  try { u = new URL(String(value)); } catch { throw new Error(`--license-url is not a valid URL: ${value}`); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`--license-url must be http(s), got ${u.protocol}`);
  return u.toString();
}

function nowIso() { return new Date().toISOString(); }

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

/** Escape text for HTML output. */
export function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Set intake.licenseTermsUrl in film.config.json (URL validated). */
export function setLicenseUrl({ root = ROOT, url }) {
  const clean = validateLicenseUrl(url);
  const cfgPath = path.resolve(root, 'film.config.json');
  const cfg = readJson(cfgPath);
  cfg.intake = cfg.intake || {};
  cfg.intake.licenseTermsUrl = clean;
  writeJson(cfgPath, cfg);
  return { path: 'film.config.json', licenseTermsUrl: clean };
}

/**
 * Set the manual flags for ONE scene. Every other scene is untouched.
 * Logs who/when in the manifest entry.
 * @returns {{scene:number, changed:string[], by:string, at:string}}
 */
export function reviewScene({ root = ROOT, scene, matchesNarration, watermarkCheck, reviewed, reviewer }) {
  const n = Number(scene);
  if (!Number.isInteger(n) || n < 1) throw new Error('--scene needs a positive scene number');
  const cfg = loadConfig(root);
  const manifestPath = path.resolve(root, cfg.paths.illustrations, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing ${manifestPath}. FIX: node scripts/film.mjs ingest`);
  const man = readJson(manifestPath);
  const entry = (man.scenes || []).find((e) => Number(e.scene) === n);
  if (!entry) throw new Error(`Scene ${n} not found in ${path.relative(root, manifestPath)}`);
  if (matchesNarration === null && watermarkCheck === null && reviewed === null) {
    throw new Error('No flags given. Pass --matches-narration yes|no, --watermark clear|visible, --reviewed yes|no');
  }
  const changed = [];
  if (matchesNarration !== null) { entry.matchesNarration = matchesNarration; changed.push('matchesNarration'); }
  if (watermarkCheck !== null) { entry.watermarkCheck = watermarkCheck; changed.push('watermarkCheck'); }
  if (reviewed !== null) { entry.reviewed = reviewed; changed.push('reviewed'); }
  const by = reviewer || os.userInfo().username || 'unknown';
  const at = nowIso();
  entry.review = { ...(entry.review || {}), by, at, changed };
  man.reviewedUpdatedAt = at;
  writeJson(manifestPath, man);
  return { scene: n, changed, by, at };
}

/** Group records -> Map scene -> group index (1-based) for duplicate flags. */
export function duplicateMap(records) {
  const groups = groupDuplicates(records);
  const map = new Map();
  groups.forEach((g, i) => { for (const r of g) map.set(Number(r.scene), i + 1); });
  return { groups, map };
}

const STOPWORDS = new Set(('the a an and or but if in on at to of for from by with as is are was were be been being this that these those its it his her their our your not no has have had he she they them we you into over under about after before during while when where which who whom whose what how all any both each few more most other some such only own same so than too very can will just should now did does do').split(' '));

/** Lowercase content words (length > 3) without common stopwords. Pure. */
export function contentWords(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

/** Text-only overlap between narration and the scene prompt. Never judges an image. */
export function keywordOverlap(narration, prompt) {
  const a = new Set(contentWords(narration));
  const b = new Set(contentWords(prompt));
  if (!a.size || !b.size) return { score: 0, shared: [] };
  const shared = [...a].filter((w) => b.has(w));
  return { score: Number((shared.length / a.size).toFixed(2)), shared };
}

function promptForScene(root, n) {
  const f = path.resolve(root, 'docs', 'prompts', `scene-${String(n).padStart(2, '0')}.txt`);
  if (!fs.existsSync(f)) return '';
  const txt = fs.readFileSync(f, 'utf8');
  const i = txt.indexOf('PROMPT:');
  return i >= 0 ? txt.slice(i + 7) : txt;
}

/**
 * Scenes to CHECK BY EYE. This is a TEXT-ONLY heuristic (narration vs prompt)
 * plus duplicate detection; it does not look at pixels and does not claim to
 * judge whether an image matches its narration.
 * @returns {Map<number, string[]>} scene -> reasons
 */
export function checkByEyeFlags({ root = ROOT, story, groups = [], threshold = 0.12 } = {}) {
  const map = new Map();
  const dup = new Map();
  groups.forEach((g, i) => { for (const r of g) dup.set(Number(r.scene), i + 1); });
  (story.scenes || []).forEach((s, i) => {
    const n = Number(String(s.id).match(/(\d+)/)?.[0] || i + 1);
    const reasons = [];
    const narration = (s.narration && s.narration.en) || '';
    const overlap = keywordOverlap(narration, promptForScene(root, n));
    if (overlap.score < threshold) reasons.push(`text overlap ${(overlap.score * 100).toFixed(0)}%`);
    if (dup.has(n)) reasons.push(`duplicate group ${dup.get(n)} — one image cannot match two narrations`);
    if (reasons.length) map.set(n, reasons);
  });
  return map;
}

/** Build out/review/review.html from the real manifest + story + images. */
export function buildReviewSheet({ root = ROOT, storyPath, outFile = 'out/review/review.html', now = new Date() } = {}) {
  const cfg = loadConfig(root);
  const storyRel = storyPath || cfg.story;
  const story = readJson(path.resolve(root, storyRel));
  const manifestPath = path.resolve(root, cfg.paths.illustrations, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing ${manifestPath}. FIX: node scripts/film.mjs ingest`);
  const man = readJson(manifestPath);
  const promptsDoc = fs.existsSync(path.resolve(root, cfg.intake.promptFile))
    ? fs.readFileSync(path.resolve(root, cfg.intake.promptFile), 'utf8') : '';
  const cache = loadCache(root);
  const stats = newStats();
  const records = buildImageRecords({
    story, promptsDoc, root,
    phashFn: (file) => cachedPhash(file, { root, cache, stats }),
  });
  saveCache(pruneCache(cache, root), root);
  const { groups, map } = duplicateMap(records);
  const byEye = checkByEyeFlags({ root, story, groups });
  const outPath = path.resolve(root, outFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const rows = (man.scenes || []).map((e) => {
    const n = Number(e.scene);
    const storyScene = (story.scenes || [])[n - 1] || {};
    const narration = storyScene.narration || {};
    const dupe = map.get(n) || null;
    const eyeReasons = byEye.get(n) || null;
    const eyeHtml = eyeReasons
      ? `<span class="no">CHECK BY EYE</span> — ${esc(eyeReasons.join('; '))}`
      : '<span class="yes">text overlap ok</span>';
    const imgPath = path.relative(path.dirname(outPath), path.resolve(root, e.file)).replace(/\\/g, '/');
    const flag = (v) => (v === true ? '<span class="yes">yes</span>' : '<span class="no">NO</span>');
    const wm = e.watermarkCheck === true
      ? '<span class="yes">clear / checked</span>'
      : '<span class="no">visible or unchecked</span>';
    return `<tr id="scene-${n}">
  <td class="num">${n}</td>
  <td class="img"><img src="${esc(imgPath)}" alt="scene ${n}" loading="lazy"><div class="file">${esc(e.file)}</div></td>
  <td class="meta">
    <div class="en">${esc(narration.en || '')}</div>
    <div class="km">${esc(narration.km || '')}</div>
    <dl>
      <dt>sha256</dt><dd class="mono">${esc(e.sha256 || '-')}</dd>
      <dt>source</dt><dd>${esc(e.sourceWidth ?? '-')} x ${esc(e.sourceHeight ?? '-')} px${e.upscaled ? ' (upscaled copy)' : ''}</dd>
      <dt>aspect</dt><dd>${esc(e.sourceAspect ?? '-')} — crops ${esc(e.aspectCropPercent ?? 0)}% ${esc(e.aspectCropAxis ?? '')}</dd>
      <dt>duplicate</dt><dd>${dupe ? `<span class="no">group ${dupe} (${groups[dupe - 1].length} scenes)</span>` : '<span class="yes">none</span>'}</dd>
      <dt>check by eye</dt><dd>${eyeHtml}</dd>
      <dt>watermark</dt><dd>${wm}</dd>
      <dt>reviewed</dt><dd>${flag(e.reviewed)}</dd>
      <dt>matches narration</dt><dd>${flag(e.matchesNarration)}</dd>
      <dt>license URL</dt><dd>${e.licenseTermsUrl ? esc(e.licenseTermsUrl) : '<span class="no">empty</span>'}</dd>
      <dt>review log</dt><dd>${e.review ? `${esc(e.review.by)} ${esc(e.review.at)}` : '<span class="no">not reviewed yet</span>'}</dd>
    </dl>
  </td>
</tr>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Kuanimation review sheet — ${esc(path.basename(storyRel))}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.45 system-ui, sans-serif; margin: 24px; max-width: 1400px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { opacity: .75; margin-bottom: 20px; }
  table { border-collapse: collapse; width: 100%; }
  tr { border-top: 1px solid #8884; vertical-align: top; }
  td { padding: 12px 10px; }
  td.num { font-size: 22px; font-weight: 700; width: 36px; }
  td.img { width: 360px; }
  img { width: 340px; aspect-ratio: 16/9; object-fit: cover; border-radius: 4px; display: block; }
  .file { font: 11px ui-monospace, monospace; opacity: .6; margin-top: 4px; }
  .mono { font-family: ui-monospace, monospace; font-size: 11px; word-break: break-all; }
  .en { font-weight: 600; margin-bottom: 6px; }
  .km { opacity: .85; margin-bottom: 8px; }
  dl { display: grid; grid-template-columns: 130px 1fr; gap: 2px 10px; margin: 0; font-size: 13px; }
  dt { opacity: .65; }
  dd { margin: 0; }
  .yes { color: #167d3a; font-weight: 600; }
  .no { color: #b3261e; font-weight: 600; }
  .hint { background: #8881; padding: 10px 14px; border-radius: 6px; margin-bottom: 18px; }
  code { font-family: ui-monospace, monospace; }
</style>
</head>
<body>
<h1>Review sheet — ${esc(path.basename(storyRel))}</h1>
<div class="sub">Generated ${esc(now.toISOString())} from ${esc(path.relative(root, manifestPath).replace(/\\/g, '/'))}.
Manifest profile: <b>${esc(man.factory?.profile || man.profile || 'missing')}</b>.</div>
<div class="hint">Review one scene at a time, then run the command shown under <b>How to record</b>.
Nothing is auto-set — these flags are only written by <code>film review</code>.
<b>CHECK BY EYE</b> is a text-only heuristic (narration vs prompt) plus duplicate
detection; it does <i>not</i> look at pixels and does not judge the picture.</div>
<table>
<thead><tr><th>#</th><th>image</th><th>narration + checks</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<h2>How to record a decision (one scene at a time)</h2>
<pre><code>node scripts/film.mjs review --scene N --matches-narration yes|no --watermark clear|visible --reviewed yes
node scripts/film.mjs review --license-url https://example.com/terms</code></pre>
</body>
</html>
`;
  fs.writeFileSync(outPath, html, 'utf8');
  return {
    out: path.relative(root, outPath).replace(/\\/g, '/'), scenes: (man.scenes || []).length,
    duplicateGroups: groups.length,
    checkByEye: byEye.size,
    checkByEyeScenes: [...byEye.keys()].sort((a, b) => a - b),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  if (a.help) {
    console.log(`review commands:
  sheet                      build out/review/review.html
  --scene N ...              set flags for one scene
  --license-url <url>        set intake.licenseTermsUrl in film.config.json`);
    return 0;
  }
  if (a.licenseUrl) {
    const r = setLicenseUrl({ root: ROOT, url: a.licenseUrl });
    console.log(`licenseTermsUrl set to ${r.licenseTermsUrl} (${r.path}). Content is NOT judged.`);
    return 0;
  }
  if (a.scene !== null) {
    const r = reviewScene({
      root: ROOT, scene: a.scene, matchesNarration: a.matchesNarration,
      watermarkCheck: a.watermarkCheck, reviewed: a.reviewed, reviewer: a.reviewer,
    });
    console.log(`scene ${r.scene}: set ${r.changed.join(', ')} by ${r.by} at ${r.at}`);
    return 0;
  }
  const sheet = buildReviewSheet({ root: ROOT, storyPath: a.story, outFile: a.out });
  console.log(`wrote ${sheet.out} (${sheet.scenes} scenes, ${sheet.duplicateGroups} duplicate group(s))`);
  console.log(`CHECK BY EYE (text-only, not a picture judgement): ${sheet.checkByEye} scene(s) — ${sheet.checkByEyeScenes.join(', ') || 'none'}`);
  console.log('NEXT: open it, then record decisions with: node scripts/film.mjs review --scene N --matches-narration yes --watermark clear --reviewed yes');
  return 0;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('film review failed:', e.message); process.exit(1); });
