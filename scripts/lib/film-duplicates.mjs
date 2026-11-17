/**
 * @fileoverview Round 9 item 2: exact (SHA-256) + near-duplicate (perceptual hash)
 * detection across scenes. Pure helpers for grouping and requeue output.
 *
 * pHash is computed from a 32x32 grayscale downsample; Hamming distance <=
 * threshold means near-duplicate. The image -> pixels step is injected so the
 * grouping logic stays pure and unit-testable.
 * @module scripts/lib/film-duplicates
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { decodePng } from './png.mjs';

/** SHA-256 of a file's bytes (exact-duplicate key). */
export function exactHash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Extract a 32x32 grayscale pixel array via Remotion ffmpeg (image2 muxer),
 * decoded with the in-repo PNG codec. No third-party image lib needed.
 */
export function imageToGray32(file, size = 32) {
  const tmp = path.join(os.tmpdir(), `kuan-phash-${crypto.randomBytes(6).toString('hex')}.png`);
  try {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    execFileSync(npx, ['remotion', 'ffmpeg', '-y', '-v', 'error', '-i', file,
      '-vf', `scale=${size}:${size},format=gray`, '-frames:v', '1', '-f', 'image2', tmp], {
      cwd: process.cwd(), encoding: 'utf8', shell: process.platform === 'win32',
      maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const img = decodePng(fs.readFileSync(tmp));
    const gray = [];
    for (let i = 0; i < img.data.length; i += 4) gray.push(img.data[i]); // R=G=B for gray
    return gray.slice(0, size * size);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* best effort */ }
  }
}

/** Build duplicate-detection records for a story from normalized images. */
export function buildImageRecords({ story, promptsDoc, root = process.cwd() }) {
  const prompts = parsePrompts(promptsDoc, root);
  return (story.scenes || []).filter((s) => s.image).map((s, idx) => {
    const file = path.resolve(root, s.image);
    if (!fs.existsSync(file)) return null;
    const pixels = imageToGray32(file);
    const num = String(idx + 1).padStart(2, '0'); // fallback; caller can pass scene number
    const sceneNo = Number(String(s.id).match(/\d+/)?.[0] || idx + 1);
    const key = String(sceneNo).padStart(2, '0');
    return {
      scene: sceneNo,
      sceneId: s.id,
      image: s.image,
      narration: (s.narration && s.narration.en) || '',
      prompt: prompts[key] || prompts[String(sceneNo)] || '',
      exactHash: exactHash(file),
      phash: perceptualHash(pixels),
    };
  }).filter(Boolean);
}

/** Parse docs/ILLUSTRATION_PROMPTS.md into { '01': promptText, ... }. */
export function parsePrompts(text, root = process.cwd()) {
  const out = {};
  if (!text) return out;
  const re = /^##\s*scene[-\s]?(\d+)[^\n]*\n+([^\n]+)/gim;
  let m;
  while ((m = re.exec(text)) !== null) {
    out[String(m[1]).padStart(2, '0')] = m[2].trim();
  }
  return out;
}

/**
 * Perceptual hash of a grayscale 32x32 pixel array (row-major, 0..255).
 * DCT-based pHash: keep the low 8x8 frequencies, threshold at the median.
 * Returns a 64-bit string of '0'/'1'. Pure.
 */
export function perceptualHash(pixels, size = 32, lowFreq = 8) {
  if (!pixels || pixels.length < size * size) return null;
  // Forward DCT (naive but 32x32 is cheap and deterministic).
  const dct = [];
  for (let v = 0; v < lowFreq; v += 1) {
    for (let u = 0; u < lowFreq; u += 1) {
      let sum = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const px = pixels[y * size + x] - 128;
          sum += px * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size)) * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size));
        }
      }
      dct.push(sum);
    }
  }
  const sorted = [...dct].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return dct.map((d) => (d > median ? '1' : '0')).join('');
}

/** Hamming distance between two pHash strings. Pure. */
export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) d += 1;
  return d;
}

/**
 * Group scene image records into duplicate groups.
 * Each record: { scene, narration, prompt, exactHash, phash }.
 * Same exactHash OR hamming(phash) <= threshold => same group. Pure.
 */
export function groupDuplicates(records, threshold = 10) {
  const groups = [];
  const used = new Set();
  for (let i = 0; i < records.length; i += 1) {
    if (used.has(i)) continue;
    const group = [records[i]];
    used.add(i);
    for (let j = i + 1; j < records.length; j += 1) {
      if (used.has(j)) continue;
      const a = records[i]; const b = records[j];
      const exact = a.exactHash && a.exactHash === b.exactHash;
      const near = a.phash && b.phash && hamming(a.phash, b.phash) <= threshold;
      if (exact || near) { group.push(records[j]); used.add(j); }
    }
    if (group.length > 1) groups.push(group);
  }
  return groups;
}

/**
 * Scenes to REQUEUE = all but the first (kept) member of each duplicate group.
 * The first scene in a group is retained; the rest must be regenerated.
 * Returns flat records with scene number, narration, prompt.
 */
export function requeueTargets(groups) {
  const out = [];
  for (const g of groups || []) {
    for (const r of g.slice(1)) out.push(r);
  }
  return out;
}

/**
 * Render a paste-ready requeue block for a duplicate group.
 * Each line: scene number + narration + prompt from docs/ILLUSTRATION_PROMPTS.md.
 */
export function requeueBlock(group) {
  const lines = [];
  lines.push(`REQUEUE ${group.length} scene(s) — distinct images required (duplicate/blocking):`);
  for (const r of group) {
    lines.push(`  --- scene ${r.scene} (${r.sceneId || ''}) ---`);
    if (r.narration) lines.push(`  NARRATION: ${r.narration}`);
    if (r.prompt) lines.push(`  PROMPT: ${r.prompt}`);
    if (r.image) lines.push(`  CURRENT: ${r.image}`);
  }
  lines.push('  ACTION: regenerate a DISTINCT image per scene, then: node scripts/film.mjs ingest');
  return lines.join('\n');
}

/**
 * Round 12 item 2: compact INLINE requeue hint for the doctor FIX line.
 * Lists ONLY the scenes to regenerate (all but the first per group) with a
 * short narration+prompt excerpt, so the FIX line is never an empty "REQUEUE:".
 */
export function inlineRequeueHint(groups) {
  const targets = requeueTargets(groups);
  if (targets.length === 0) return 'REQUEUE: none';
  const items = targets.map((r) => {
    const nar = r.narration ? ` narration="${r.narration.slice(0, 60)}${r.narration.length > 60 ? '…' : ''}"` : '';
    const pr = r.prompt ? ` prompt="${r.prompt.slice(0, 60)}${r.prompt.length > 60 ? '…' : ''}"` : '';
    return `scene ${r.scene}${nar}${pr}`;
  });
  return `REQUEUE (regenerate only these ${targets.length}): ${items.join(' | ')} — prompt from docs/ILLUSTRATION_PROMPTS.md`;
}
