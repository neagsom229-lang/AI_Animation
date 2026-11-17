/**
 * @fileoverview Film factory config: load, validate, hash. Pure + fs read.
 * Fails loudly with an exact fix message — no silent defaults for bad config.
 * @module scripts/lib/film-config
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const CONFIG_PATH = 'film.config.json';
export const CONFIG_VERSION = 1;

/** Validate a parsed config object. Returns array of human-readable errors. */
export function validateConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object') return ['config must be an object'];
  if (cfg.version !== CONFIG_VERSION) errors.push(`version must be ${CONFIG_VERSION} (got ${cfg.version})`);
  if (typeof cfg.story !== 'string' || !cfg.story.trim()) errors.push('story path required');
  if (!Number.isInteger(cfg.fps) || cfg.fps <= 0) errors.push('fps must be a positive integer');
  const p = cfg.paths || {};
  for (const k of ['inbox', 'originals', 'illustrations', 'music', 'build', 'preview', 'logs', 'state', 'publish']) {
    if (typeof p[k] !== 'string' || !p[k].trim()) errors.push(`paths.${k} required`);
  }
  const r = cfg.resolutions || {};
  for (const k of ['master', 'draft', 'vertical']) {
    if (!Array.isArray(r[k]) || r[k].length !== 2 || r[k].some((n) => !Number.isInteger(n) || n <= 0)) {
      errors.push(`resolutions.${k} must be [width, height] positive integers`);
    }
  }
  if (!['edge', 'azure'].includes(cfg.tts?.provider)) errors.push('tts.provider must be edge or azure');
  if (typeof cfg.tts?.voice !== 'string' || !cfg.tts.voice.trim()) errors.push('tts.voice required');
  if (!['model', 'gradient'].includes(cfg.depth?.mode)) errors.push('depth.mode must be model or gradient');
  if (!Number.isInteger(cfg.concurrency) || cfg.concurrency < 1 || cfg.concurrency > 16) errors.push('concurrency must be 1..16');
  if (typeof cfg.gpu !== 'boolean') errors.push('gpu must be boolean');
  const q = cfg.quality || {};
  if (!(q.aspectTolerance > 0 && q.aspectTolerance < 0.2)) errors.push('quality.aspectTolerance must be 0..0.2');
  if (!Number.isInteger(q.minWidth) || q.minWidth <= 0 || !Number.isInteger(q.minHeight) || q.minHeight <= 0) errors.push('quality minWidth/minHeight required');
  if (typeof q.noAlpha !== 'boolean') errors.push('quality.noAlpha must be boolean');
  if (!Number.isInteger(q.minSourceWidth) || q.minSourceWidth <= 0) errors.push('quality.minSourceWidth must be a positive integer');
  const c = cfg.cost || {};
  if (!(c.world3dMaxFraction > 0 && c.world3dMaxFraction <= 1)) errors.push('cost.world3dMaxFraction must be 0..1');
  for (const k of ['illustration', 'world3d', 'clip']) {
    if (!(c.msPerFrame?.[k] > 0)) errors.push(`cost.msPerFrame.${k} must be positive`);
  }
  return errors;
}

/** Load + validate config. Throws with exact fix command on failure. */
export function loadConfig(root = '.') {
  const file = path.resolve(root, CONFIG_PATH);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${CONFIG_PATH}. Fix: create it from the factory template (node scripts/film.mjs status shows the required keys).`);
  }
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`${CONFIG_PATH} is not valid JSON: ${e.message}`); }
  const errors = validateConfig(cfg);
  if (errors.length) {
    throw new Error(`${CONFIG_PATH} invalid:\n  - ${errors.join('\n  - ')}\nFix: edit ${CONFIG_PATH} and re-run.`);
  }
  return cfg;
}

/** Deterministic hash of the config's meaningful content. */
export function configHash(cfg) {
  return crypto.createHash('sha256').update(JSON.stringify(cfg)).digest('hex').slice(0, 16);
}
