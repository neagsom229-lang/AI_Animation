/**
 * @fileoverview Pure validation helpers for illustration intake.
 * No filesystem / no subprocess here — deterministic and unit-testable.
 * @module scripts/lib/image-check
 */

/** Allowed source extensions. */
export const ALLOWED_EXT = ['.png', '.jpg', '.jpeg'];
/** Target frame size. */
export const TARGET_W = 1920;
export const TARGET_H = 1080;
/** Aspect tolerance ±2%. */
export const ASPECT_TOL = 0.02;
export const TARGET_ASPECT = 16 / 9;

/** Parse a filename into a 1-based scene number (scene-01, scene_3, 07.png). */
export function sceneNumberFromName(name) {
  const m = String(name).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Normalize a scene number to the canonical target filename. */
export function targetName(n, ext = '.png') {
  return `scene-${String(n).padStart(2, '0')}${ext}`;
}

/** True when w/h is 16:9 within tolerance. */
export function is169(width, height, tol = ASPECT_TOL) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return Math.abs(ratio - TARGET_ASPECT) / TARGET_ASPECT <= tol;
}

/** Does an ffprobe pix_fmt indicate an alpha channel? */
export function hasAlpha(pixFmt) {
  const p = String(pixFmt || '').toLowerCase();
  if (!p) return false;
  if (/^(rgba|argb|bgra|abgr|ya|ay)\d*$/.test(p)) return true;
  if (/yuva\d+/.test(p)) return true;
  if (p.includes('pal8') ) return true; // may carry alpha; treat conservatively
  return false;
}

/** Big-enough check: >= 1920x1080. */
export function isLargeEnough(width, height) {
  return Number.isFinite(width) && Number.isFinite(height) && width >= TARGET_W && height >= TARGET_H;
}

/**
 * Validate a probed image. Returns { ok, errors, needsCrop, needsResize, needsFlatten }.
 */
export function validateImage({ width, height, pixFmt, format }) {
  const errors = [];
  const raw = String(format || '').toLowerCase();
  const ext = raw.startsWith('.') ? raw : (raw ? `.${raw}` : '');
  if (ext && !ALLOWED_EXT.includes(ext === '.jpeg' ? '.jpg' : ext)) errors.push(`unsupported format ${ext}`);
  if (!Number.isFinite(width) || !Number.isFinite(height)) errors.push('could not read dimensions');
  if (!isLargeEnough(width, height)) errors.push(`too small ${width}x${height} (< ${TARGET_W}x${TARGET_H})`);
  if (!is169(width, height)) errors.push(`aspect ${width}x${height} not 16:9 ±2%`);
  const alpha = hasAlpha(pixFmt);
  const needsCrop = !is169(width, height);
  const needsResize = Number.isFinite(width) && (width !== TARGET_W || height !== TARGET_H);
  return {
    ok: errors.length === 0,
    errors,
    alpha,
    needsCrop,
    needsResize,
    needsFlatten: alpha,
  };
}

/** Fields that the manifest requires to be non-empty before final render. */
export const REQUIRED_MANIFEST_FIELDS = ['tool', 'date', 'prompt', 'licenseTermsUrl'];
/** Boolean checklist flags required true (in addition to the string fields). */
export const REQUIRED_MANIFEST_FLAGS = ['reviewed', 'watermarkCheck', 'matchesNarration'];

/** True when a manifest entry is complete and reviewed. */
export function isManifestEntryReady(entry) {
  if (!entry || entry.reviewed !== true) return false;
  const stringsOk = REQUIRED_MANIFEST_FIELDS.every((k) => typeof entry[k] === 'string' && entry[k].trim().length > 0);
  const flagsOk = REQUIRED_MANIFEST_FLAGS.every((k) => entry[k] === true);
  return stringsOk && flagsOk;
}

/** Detect whether Real-ESRGAN is installed (optional upscale hook). */
export function realEsrganAvailable(executable = 'realesrgan-ncnn-vulkan') {
  // Kept as a pure predicate on a detected path; intake passes the resolved path.
  return typeof executable === 'string' && executable.trim().length > 0;
}

// --- Round 9 item 1: SOURCE resolution gate -------------------------------

/** Was a source upscaled to the target width? Pure. */
export function isUpscaled(sourceWidth, targetWidth = TARGET_W) {
  return Number.isFinite(sourceWidth) && sourceWidth < targetWidth;
}

/**
 * Evaluate the source-resolution gate. Final render fails when sourceWidth <
 * minSourceWidth; drafts allow it with a warning. Pure.
 * Returns { ok, hardFail, warning }.
 */
export function sourceResolutionGate(sourceWidth, minSourceWidth, { draft = false } = {}) {
  if (!Number.isFinite(sourceWidth)) {
    return { ok: false, hardFail: true, warning: 'unknown source width (could not measure SOURCE resolution)' };
  }
  if (sourceWidth < minSourceWidth) {
    return {
      ok: Boolean(draft),
      hardFail: !draft,
      warning: `source width ${sourceWidth}px < ${minSourceWidth}px minimum` + (draft ? ' (draft: allowed with warning)' : ' (FINAL RENDER BLOCKED — supply a larger source or run film upscale)'),
    };
  }
  return { ok: true, hardFail: false, warning: null };
}

/** Manifest fields required for the source-resolution gate. */
export const SOURCE_RESOLUTION_FIELDS = ['sourceWidth', 'sourceHeight', 'upscaled'];
