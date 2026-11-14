/**
 * @fileoverview Subtitle text + font resolution for the StoryFilm pipeline.
 *
 * Pure functions of (language | line) — no React, no Remotion, no fs — so they
 * are unit-testable directly in Node (same pattern as remotion/lib/camera.ts).
 *
 * The --lang flag of `node scripts/make.mjs` must "really change" the subtitle
 * layer of the film, not just the voice: the font family follows the resolved
 * narration language and the displayed text prefers the human-authored subtitle
 * and falls back to the spoken text.
 * @module remotion/lib/subtitles
 */

/** Font stacks per narration language (single source of truth for the film). */
export const SUBTITLE_FONTS: Record<string, string> = {
  km: '"Hanuman", "Khmer OS Battambang", "Noto Sans Khmer", sans-serif',
  en: '"Roboto", "Helvetica Neue", Arial, sans-serif',
};

/** Language used when neither the voice data nor the story declares one. */
export const DEFAULT_SUBTITLE_LANGUAGE = 'km';

/**
 * Title-safe subtitle geometry for the 1920×1080 film frame.
 *
 *  - `bottomPx` keeps the caption box at least 54 px (5% of 1080) clear of
 *    the bottom edge — the box's padding sits inside the box, so the visible
 *    text never leaves the title-safe area.
 *  - `maxWidthPercent` caps the box at 80% of the width, leaving 192 px per
 *    side — double the 96 px (5% of 1920) title-safe margin.
 *  - `lineHeight` leaves headroom for Khmer ascenders/descenders (សំពះ ស្រុះ ស្រួល)
 *    so two-line captions do not collide or clip.
 *
 * tests/subtitle.test.js enforces the 5% rules against these constants, and
 * StoryFilm's <Subtitle> must consume them (grep-guarded).
 */
export const SUBTITLE_LAYOUT = {
  bottomPx: 60,
  maxWidthPercent: 80,
  fontSizePx: 32,
  paddingXPx: 32,
  paddingYPx: 16,
  lineHeight: 1.5
} as const;

/** Title-safe margin as a fraction of the frame (5% on every edge). */
export const TITLE_SAFE_FRACTION = 0.05;

/**
 * Resolve the subtitle font for a narration language.
 * Fails loudly on unknown languages (no silent fallback).
 */
export function getSubtitleFont(language?: string): string {
  const lang = (language ?? DEFAULT_SUBTITLE_LANGUAGE).trim().toLowerCase();
  if (lang !== 'km' && lang !== 'en') {
    throw new Error(`getSubtitleFont: unknown language "${language}". Valid languages: km, en.`);
  }
  return SUBTITLE_FONTS[lang];
}

/**
 * Resolve the subtitle text of a dialogue line.
 * Prefers a non-empty human subtitle, falls back to the spoken text.
 * Fails loudly when the resolved text is empty.
 */
export function getSubtitleText(line: { subtitle?: string; text?: string }): string {
  const text =
    (typeof line?.subtitle === 'string' && line.subtitle.trim().length > 0
      ? line.subtitle
      : typeof line?.text === 'string'
        ? line.text
        : '') || '';
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('getSubtitleText: subtitle text must be a non-empty string.');
  }
  return trimmed;
}
