/**
 * @fileoverview Round 13 item 3: DRAFT vs FINAL profiles.
 *
 * Draft is the default for ingest/depth/render: missing license URL, sources
 * below 1600 px, duplicate images and aspect crops become WARNINGS grouped in
 * ONE summary. Final applies every block, with no --force escape hatch.
 *
 * A manifest records the profile used by ingest. A draft ingest can never
 * satisfy a final render (see `manifestCanSatisfyFinal`).
 * @module scripts/lib/film-profile
 */
import fs from 'node:fs';
import path from 'node:path';
import { aspectCropPercent } from './image-check.mjs';

export const PROFILE_DRAFT = 'draft';
export const PROFILE_FINAL = 'final';
export const PROFILES = [PROFILE_DRAFT, PROFILE_FINAL];

/** Commands whose default profile is draft. */
export const DRAFT_DEFAULT_COMMANDS = ['ingest', 'depth', 'render', 'draft'];

/** Validate a profile name. Pure. Throws with exact usage. */
export function resolveProfile(value, fallback = PROFILE_DRAFT) {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).toLowerCase();
  if (!PROFILES.includes(v)) throw new Error(`--profile must be draft or final (got "${value}")`);
  return v;
}

/** Default profile for a command (null = command has no profile). */
export function profileForCommand(command, explicit) {
  if (explicit) return resolveProfile(explicit);
  return DRAFT_DEFAULT_COMMANDS.includes(command) ? PROFILE_DRAFT : null;
}

/** Profile recorded by the last ingest, if any. */
export function readManifestProfile(root, cfg) {
  const p = path.resolve(root, cfg.paths.illustrations, 'manifest.json');
  if (!fs.existsSync(p)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    return m.factory?.profile || m.profile || null;
  } catch { return null; }
}

/** Current profile = explicit flag, else last ingest, else draft. */
export function currentProfile({ root, cfg, explicit }) {
  if (explicit) return resolveProfile(explicit);
  return readManifestProfile(root, cfg) || PROFILE_DRAFT;
}

/** A draft-profile manifest can never satisfy a final render. */
export function manifestCanSatisfyFinal(manifest) {
  if (!manifest) return false;
  const profile = manifest.factory?.profile || manifest.profile;
  return profile === PROFILE_FINAL;
}

/**
 * Aspect gate: <=2% off 16:9 is OK, 2-5% is a NOTE, beyond 5% is a WARNING
 * with the exact crop percentage. Never a block (the final render keeps the
 * existing warning behaviour).
 */
export function classifyAspect(width, height) {
  const ok = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  if (!ok) return { level: 'warn', aspect: null, deviationPercent: null, cropPercent: 0, cropAxis: 'unknown' };
  const aspect = width / height;
  const target = 16 / 9;
  const deviationPercent = Number((Math.abs(aspect - target) / target * 100).toFixed(2));
  const crop = aspectCropPercent(width, height);
  const level = deviationPercent <= 2 ? 'ok' : deviationPercent <= 5 ? 'note' : 'warn';
  return {
    level, aspect: Number(aspect.toFixed(4)), deviationPercent,
    cropPercent: crop.percent, cropAxis: crop.axis,
  };
}

/** Compact scene ranges: [1,2,3,5,6] -> "1-3,5-6". Pure. */
export function compactRanges(nums) {
  const sorted = [...new Set(nums)].filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  const out = [];
  let start = null; let prev = null;
  for (const n of sorted) {
    if (start === null) { start = n; prev = n; continue; }
    if (n === prev + 1) { prev = n; continue; }
    out.push(start === prev ? String(start) : `${start}-${prev}`);
    start = n; prev = n;
  }
  if (start !== null) out.push(start === prev ? String(start) : `${start}-${prev}`);
  return out.join(',');
}

/**
 * A finding is { kind, value, scene, detail? }.
 * Group repeated per-scene messages into ONE line; --verbose lists every scene.
 * @returns {string[]} lines (empty when there are no findings)
 */
export function summarizeFindings(findings, { verbose = false } = {}) {
  const list = (findings || []).filter(Boolean);
  if (list.length === 0) return [];
  if (verbose) {
    return list.map((f) => `scene ${f.scene}: ${f.value}${f.detail ? ` — ${f.detail}` : ''}`);
  }
  const groups = new Map();
  for (const f of list) {
    const key = `${f.kind}\u0000${f.value}`;
    if (!groups.has(key)) groups.set(key, { ...f, scenes: [] });
    groups.get(key).scenes.push(f.scene);
  }
  return [...groups.values()].map((g) => {
    const n = g.scenes.length;
    return `${n} scene${n === 1 ? '' : 's'}: ${g.value}  scenes ${compactRanges(g.scenes)}`;
  });
}

/** Build the shared source/license/aspect findings for a set of scenes. */
export function buildGateFindings({ sources, licenseUrl, minSourceWidth }) {
  const findings = [];
  for (const s of sources || []) {
    if (Number.isFinite(s.sourceWidth) && s.sourceWidth < minSourceWidth) {
      findings.push({
        kind: 'source', scene: s.scene,
        value: `source ${s.sourceWidth} px (< ${minSourceWidth})`,
      });
    }
    const a = classifyAspect(s.sourceWidth, s.sourceHeight);
    if (a.level !== 'ok') {
      findings.push({
        kind: 'aspect', scene: s.scene,
        value: `aspect ${a.aspect} (±${a.deviationPercent}% from 16:9, crops ${a.cropPercent}% ${a.cropAxis})`,
        detail: a.level,
      });
    }
    if (!licenseUrl) {
      findings.push({ kind: 'license', scene: s.scene, value: 'licenseTermsUrl empty (provisional)' });
    }
  }
  return findings;
}

/** Duplicate-group findings from records ({scene, exactHash, phash}). */
export function duplicateFindings(groups) {
  const findings = [];
  (groups || []).forEach((g, i) => {
    for (const r of g) {
      findings.push({
        kind: 'duplicates', scene: r.scene,
        value: `duplicate group ${i + 1} (${g.length} scenes) — regenerate distinct images`,
      });
    }
  });
  return findings;
}
