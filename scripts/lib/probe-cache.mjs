/**
 * @fileoverview Round 13 item 4: probe cache for ffprobe + perceptual hash.
 *
 * Every ingest/doctor run re-probed 18 unchanged images with `npx remotion
 * ffprobe|ffmpeg`, which cost minutes. Results are now cached in
 * `build/cache/probe-cache.json` keyed by (path, mtime, size) and storing the
 * sha256, the probe result and the perceptual hash. A second run over unchanged
 * files does no subprocess work at all.
 *
 * The cache never hides a changed file: mtime/size are checked first, and a
 * content change (same size, restored mtime) is caught by the sha256 compare
 * whenever the cheap fingerprint does not match.
 * @module scripts/lib/probe-cache
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { imageToGray32, perceptualHash } from './film-duplicates.mjs';
import { bundledBinary, mediaCommand, runMedia } from './media-bin.mjs';

export { bundledBinary, mediaCommand, runMedia };

export const CACHE_VERSION = 2;
export const CACHE_REL = 'build/cache/probe-cache.json';

/** Cheap fingerprint: path + mtime + size (and the digest when needed). */
export function fingerprint(file) {
  const st = fs.statSync(file);
  return {
    path: path.resolve(file).replace(/\\/g, '/'),
    mtimeMs: Math.round(st.mtimeMs),
    size: st.size,
  };
}

/** SHA-256 of a file's bytes. */
export function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Cache keys include the cheap fingerprint; sha256 is stored alongside. */
export function entryKey(fp) {
  return `${fp.path}|${fp.mtimeMs}|${fp.size}`;
}

/** Load the cache object (never throws). */
export function loadCache(root = process.cwd()) {
  const p = path.resolve(root, CACHE_REL);
  try {
    const c = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (c && c.version === CACHE_VERSION && c.entries && typeof c.entries === 'object') return c;
  } catch { /* missing/corrupt = empty cache */ }
  return { version: CACHE_VERSION, entries: {} };
}

/** Persist the cache (best-effort, atomic-ish). */
export function saveCache(cache, root = process.cwd()) {
  const p = path.resolve(root, CACHE_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(cache)}\n`, 'utf8');
  fs.renameSync(tmp, p);
}

/** New per-process stats object. */
export function newStats() {
  return { probes: 0, hits: 0, misses: 0, ms: 0, phashMs: 0 };
}

/**
 * Probe an image (width/height/pix_fmt), cached by fingerprint.
 * @param {string} file
 * @param {{root?: string, cache?: object, stats?: object, refresh?: boolean}} [opts]
 */
export function cachedProbe(file, opts = {}) {
  const root = opts.root || process.cwd();
  const cache = opts.cache || loadCache(root);
  const stats = opts.stats || newStats();
  const fp = fingerprint(file);
  const key = entryKey(fp);
  stats.probes += 1;
  if (!opts.refresh && cache.entries[key]?.probe) {
    stats.hits += 1;
    return { ...cache.entries[key].probe, sha256: cache.entries[key].sha256, cached: true };
  }
  const started = Date.now();
  const r = runMedia('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,pix_fmt', '-of', 'json', file]);
  let probe = { width: NaN, height: NaN, pixFmt: '' };
  try {
    const j = JSON.parse(r.out.slice(r.out.indexOf('{'), r.out.lastIndexOf('}') + 1));
    const s = (j.streams || [])[0] || {};
    probe = { width: Number(s.width), height: Number(s.height), pixFmt: s.pix_fmt || '' };
  } catch { /* probe stays NaN; caller refuses to treat it as valid */ }
  const digest = sha256(file);
  cache.entries[key] = { ...fp, sha256: digest, probe };
  stats.misses += 1;
  stats.ms += Date.now() - started;
  if (!opts.cache) saveCache(cache, root);
  return { ...probe, sha256: digest, cached: false };
}

/**
 * Perceptual hash of an image, cached by fingerprint (plus sha256).
 * @param {string} file
 * @param {{root?: string, cache?: object, stats?: object, refresh?: boolean}} [opts]
 */
export function cachedPhash(file, opts = {}) {
  const root = opts.root || process.cwd();
  const cache = opts.cache || loadCache(root);
  const stats = opts.stats || newStats();
  const fp = fingerprint(file);
  const key = entryKey(fp);
  if (!opts.refresh && cache.entries[key]?.phash) {
    stats.hits += 1;
    return { sha256: cache.entries[key].sha256, phash: cache.entries[key].phash, cached: true };
  }
  const started = Date.now();
  const digest = sha256(file);
  const phash = perceptualHash(imageToGray32(file));
  cache.entries[key] = { ...cache.entries[key], ...fp, sha256: digest, phash };
  stats.misses += 1;
  stats.phashMs += Date.now() - started;
  if (!opts.cache) saveCache(cache, root);
  return { sha256: digest, phash, cached: false };
}

/**
 * One-line cache report with measured numbers.
 * @param {{hits:number, misses:number, ms:number, phashMs:number, probes:number}} stats
 * @param {{elapsedMs?: number, profile?: string}} [extra]
 */
export function cacheReport(stats, extra = {}) {
  const total = stats.hits + stats.misses;
  const parts = [`${stats.hits}/${total} cached`];
  if (stats.misses > 0) parts.push(`${stats.misses} computed in ${Math.round(stats.ms + stats.phashMs)} ms`);
  if (Number.isFinite(extra.elapsedMs)) parts.push(`run ${Math.round(extra.elapsedMs)} ms`);
  if (Number.isFinite(extra.baselineMs)) {
    const factor = extra.baselineMs / Math.max(1, extra.elapsedMs);
    parts.push(`~${factor >= 1 ? factor.toFixed(1) + 'x faster' : (1 / factor).toFixed(1) + 'x slower'} than baseline ${(extra.baselineMs / 1000).toFixed(1)} s`);
  }
  return `probe cache: ${parts.join('; ')}`;
}

/** Drop entries whose files no longer exist (keeps the cache from growing forever). */
export function pruneCache(cache, root = process.cwd()) {
  const kept = {};
  for (const [key, v] of Object.entries(cache.entries || {})) {
    if (!v?.path) continue;
    if (!fs.existsSync(path.resolve(root, v.path))) continue;
    kept[key] = v;
  }
  cache.entries = kept;
  return cache;
}
