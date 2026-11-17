/**
 * @fileoverview SubRip (SRT) subtitle builder from voiceData timings.
 *
 * Pure function module: no fs, no React, no Remotion — unit-testable in Node.
 * Timings come from the SAME data the film uses (real decoded durations).
 *
 * SRT time format: HH:MM:SS,mmm (note the comma before milliseconds).
 * @module scripts/lib/srt
 */

/**
 * Format seconds as SRT timestamp "HH:MM:SS,mmm".
 * @param {number} seconds
 * @returns {string}
 */
export function srtTimestamp(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`srtTimestamp: invalid seconds ${seconds}`);
  }
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  const pad = (n, w) => String(n).padStart(w, '0');
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(milli, 3)}`;
}

/**
 * Resolve the caption text of one voice line.
 *
 * Mirrors remotion/lib/subtitles.ts `getSubtitleText`: the SPOKEN text wins
 * when it is written in the caption language's script; otherwise the
 * authored gloss wins. Without any language information the historical
 * behaviour applies (gloss first, spoken text as the fallback).
 *
 * @param {{ subtitle?: string, text?: string }} line
 * @param {string} caption caption language (may be empty)
 */
export function resolveCaptionText(line, caption) {
  const spoken = typeof line.text === 'string' ? line.text : '';
  const gloss = typeof line.subtitle === 'string' ? line.subtitle : '';
  if (caption) {
    const khmer = /[\u1780-\u17ff]/;
    const latin = /[A-Za-z]/;
    const matches = (text) =>
      caption === 'km' ? khmer.test(text) : caption === 'en' ? latin.test(text) : false;
    if (matches(gloss)) return gloss.trim();
    if (matches(spoken)) return spoken.trim();
  }
  return gloss.trim() || spoken.trim();
}

/**
 * Build the full SRT document from voiceData.
 * Line start times are cumulative within scenes; an inter-scene gap of
 * `gapSec` (default 0.75 s, matching remotion/lib/story-timing.ts) is added
 * after each scene's audio except the last, so SRT timings match the film.
 * @param {{ language?: string, scenes: Array<{ id: string, dur: number, lines: Array<{ subtitle?: string, text?: string, dur: number }> }> }} voiceData
 * @param {number} [gapSec=0.75]
 * @param {{ captionLanguage?: string }} [options]
 * @returns {string} complete SRT file content (ends with a newline)
 */
export function buildSrt(voiceData, gapSec = 0.75, options = {}) {
  if (!voiceData || !Array.isArray(voiceData.scenes)) {
    throw new Error('buildSrt: voiceData must contain a scenes array');
  }
  const narration = (voiceData.language || '').trim().toLowerCase();
  const caption = (options.captionLanguage || narration || '').trim().toLowerCase();
  const blocks = [];
  let index = 1;
  let cursor = 0;
  voiceData.scenes.forEach((scene, sceneIdx) => {
    for (const line of scene.lines || []) {
      const start = cursor;
      const end = cursor + line.dur;
      const text = resolveCaptionText(line, caption);
      if (line.silent === true) {
        // Silent establishing filler: contributes time but no caption cue.
        cursor = end;
        continue;
      }
      if (!text) {
        throw new Error(`buildSrt: empty subtitle text for scene ${scene.id}`);
      }
      blocks.push(`${index}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${text}\n`);
      index += 1;
      cursor = end;
    }
    const isLast = sceneIdx === voiceData.scenes.length - 1;
    if (!isLast) cursor += gapSec;
  });
  if (blocks.length === 0) {
    throw new Error('buildSrt: no subtitle lines found in voiceData');
  }
  return blocks.join('\n') + '\n';
}
