/**
 * @fileoverview Pure loudness / silence helpers for Phase 5 audio QA.
 * No subprocess here — parse ffmpeg loudnorm/silencedetect output deterministically.
 * @module scripts/lib/loudness
 */

/** Loudness targets (LUFS): web masters -16, vertical/TikTok -14. */
export const LOUDNESS_TARGET = { web: -16, vertical: -14 };
export const SILENCE_GAP_WARN_SEC = 1.5;

/**
 * Extract the integrated loudness (I) from ffmpeg loudnorm JSON output.
 * Returns null when absent. Pure string parse.
 */
export function parseLoudnessI(text) {
  const m = String(text).match(/"input_i"\s*:\s*"(-?[\d.]+)"/);
  return m ? Number(m[1]) : null;
}

/**
 * Extract silence intervals from ffmpeg silencedetect output.
 * Lines look like: "silence_start: 2.34" / "silence_end: 4.10 | silence_duration: 1.76".
 * Returns [{start,end,duration}]. Pure string parse.
 */
export function parseSilences(text) {
  const lines = String(text).split('\n');
  const out = [];
  let start = null;
  for (const line of lines) {
    const s = line.match(/silence_start:\s*([\d.]+)/);
    if (s) { start = Number(s[1]); continue; }
    const e = line.match(/silence_end:\s*([\d.]+)(?:\s*\|\s*silence_duration:\s*([\d.]+))?/);
    if (e && start !== null) {
      const end = Number(e[1]);
      const dur = e[2] !== undefined ? Number(e[2]) : end - start;
      out.push({ start, end, duration: dur });
      start = null;
    }
  }
  return out;
}

/** True when any silence gap exceeds the warn threshold. Pure. */
export function hasLongSilence(silences, threshold = SILENCE_GAP_WARN_SEC) {
  return (silences || []).some((s) => s.duration > threshold);
}

/** Build the ffmpeg loudnorm filter string for a target. */
export function loudnormFilter(targetLufs, measuredI = null) {
  const t = LOUDNESS_TARGET[targetLufs] ?? targetLufs ?? LOUDNESS_TARGET.web;
  // One-pass measurement mode when no measured I; two-pass linear when present.
  if (measuredI === null) {
    return `loudnorm=I=${t}:TP=-1.5:LRA=11:print_format=json`;
  }
  // In two-pass we still emit the target; Remotion applies on render.
  return `loudnorm=I=${t}:TP=-1.5:LRA=11:measured_I=${measuredI}:linear=true`;
}
