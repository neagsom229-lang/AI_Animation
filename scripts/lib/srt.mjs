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
 * Build the full SRT document from voiceData.
 * Line start times are cumulative within scenes; an inter-scene gap of
 * `gapSec` (default 0.75 s, matching remotion/lib/story-timing.ts) is added
 * after each scene's audio except the last, so SRT timings match the film.
 * @param {{ scenes: Array<{ id: string, dur: number, lines: Array<{ subtitle?: string, text?: string, dur: number }> }> }} voiceData
 * @param {number} [gapSec=0.75]
 * @returns {string} complete SRT file content (ends with a newline)
 */
export function buildSrt(voiceData, gapSec = 0.75) {
  if (!voiceData || !Array.isArray(voiceData.scenes)) {
    throw new Error('buildSrt: voiceData must contain a scenes array');
  }
  const blocks = [];
  let index = 1;
  let cursor = 0;
  voiceData.scenes.forEach((scene, sceneIdx) => {
    for (const line of scene.lines || []) {
      const start = cursor;
      const end = cursor + line.dur;
      const text = (line.subtitle || line.text || '').trim();
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
