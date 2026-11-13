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
