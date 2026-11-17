/**
 * @fileoverview Output stamping (item 9): git commit, config hash, tool versions,
 * per-scene input hashes, license table. Pure assembly helpers + git reader.
 * @module scripts/lib/film-stamp
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

/** Read git commit safely (returns 'unknown' when not a repo, no throw). */
export function gitCommit(root = '.') {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return 'unknown'; }
}

/** Tool versions from installed package.json files. Pure given a reader. */
export function toolVersions(root = '.', packages = ['remotion', 'three', 'react', 'typescript', 'vite']) {
  const out = {};
  for (const p of packages) {
    try { out[p] = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', p, 'package.json'), 'utf8')).version; }
    catch { out[p] = 'unknown'; }
  }
  return out;
}

/** Per-scene input hash (image + depth + voice line) for a story. */
export function perSceneHashes(root, story, voiceData) {
  const out = {};
  const vById = new Map((voiceData?.scenes || []).map((s) => [s.id, s]));
  (story.scenes || []).forEach((spec, i) => {
    const parts = [];
    for (const rel of [spec.image, spec.image ? `${spec.image.replace(/\.[^.]+$/, '')}-depth${path.extname(spec.image)}` : null, spec.clip]) {
      if (!rel) continue;
      const abs = path.resolve(root, rel);
      parts.push(fs.existsSync(abs)
        ? `${rel}|${fs.statSync(abs).size}|${crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')}`
        : `${rel}|MISSING`);
    }
    const v = vById.get(spec.id);
    if (v) parts.push(`voice|${JSON.stringify(v.lines || [])}`);
    out[spec.id] = crypto.createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
  });
  return out;
}

/** Build a license table summary from THIRD_PARTY_LICENSES.md (quoted lines kept in file). */
export function licenseTable(root = '.') {
  const text = fs.readFileSync(path.join(root, 'THIRD_PARTY_LICENSES.md'), 'utf8');
  const rows = [];
  const re = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1].trim() === 'Package' || m[1].startsWith('---')) continue;
    rows.push({ name: m[1].trim(), version: m[2].trim(), license: m[3].trim() });
  }
  const outside = [];
  if (/two-tier/.test(text)) outside.push('Remotion (two-tier Free/Company)');
  if (/LGPLv3/.test(text)) outside.push('edge-tts (LGPLv3)');
  return { rows, outsideAllowList: outside, reference: 'THIRD_PARTY_LICENSES.md' };
}

/** Assemble the full manifest stamp. */
export function buildStamp({ root, cfg, configHashValue, story, voiceData, storyName, durationSeconds }) {
  return {
    schema: 1,
    story: cfg.story,
    storyName,
    generated: new Date().toISOString(),
    gitCommit: gitCommit(root),
    configHash: configHashValue,
    toolVersions: toolVersions(root),
    durationSeconds,
    scenes: story.scenes.length,
    perSceneInputHashes: perSceneHashes(root, story, voiceData),
    licenses: licenseTable(root),
  };
}
