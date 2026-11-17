/**
 * @fileoverview Pure timeline math for the illustrated film.
 *
 * Contract (per brief): scene length = max(voice duration + 0.6 s, 5.0 s).
 * There is NO inter-scene gap — the 0.6 s narration tail is part of the scene.
 * Frames are absolute composition frames; pure function of (voiceData, fps).
 * @module remotion/lib/illustrated-timing
 */

export interface IllustratedTimedLine {
  file: string;
  text: string;
  subtitle?: string;
  env?: number[];
  startFrame: number;
  durationInFrames: number;
}
export interface IllustratedTimedScene {
  id: string;
  name?: string;
  startFrame: number;
  durationInFrames: number;
  audioDurationInFrames: number;
  lines: IllustratedTimedLine[];
}
export interface IllustratedTimeline {
  scenes: IllustratedTimedScene[];
  durationInFrames: number;
}

/** Narration tail kept inside every scene (seconds). */
export const SCENE_PAD_SEC = 0.6;
/** Minimum length of any scene (seconds). */
export const MIN_SCENE_SEC = 5.0;

export interface VoiceSceneLike {
  id?: string;
  name?: string;
  lines?: Array<{ file?: string; text?: string; subtitle?: string; env?: number[]; dur?: number }>;
}
export interface IllustratedVoiceData { scenes?: VoiceSceneLike[] }

/**
 * Build the illustrated timeline from real voice durations.
 * Pure: same (voiceData, fps) -> identical timeline.
 */
export function buildIllustratedTimeline(
  voiceData: IllustratedVoiceData,
  fps: number
): IllustratedTimeline {
  if (!voiceData || !Array.isArray(voiceData.scenes) || voiceData.scenes.length === 0) {
    throw new Error('buildIllustratedTimeline: voiceData must contain a non-empty scenes array.');
  }
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('buildIllustratedTimeline: fps must be positive.');

  const audioPadFrames = Math.round(SCENE_PAD_SEC * fps);
  const minFrames = Math.round(MIN_SCENE_SEC * fps);
  let cursor = 0;
  const scenes: IllustratedTimedScene[] = [];

  voiceData.scenes.forEach((sceneVoice, idx) => {
    let lineCursor = 0;
    const lines: IllustratedTimedLine[] = (sceneVoice.lines || []).map((line) => {
      const durationInFrames = Math.max(1, Math.round((line.dur || 0) * fps));
      const timed: IllustratedTimedLine = {
        file: line.file || '',
        text: line.text || '',
        subtitle: line.subtitle,
        env: line.env,
        startFrame: cursor + lineCursor,
        durationInFrames,
      };
      lineCursor += durationInFrames;
      return timed;
    });
    const audioDurationInFrames = lineCursor;
    const durationInFrames = Math.max(
      audioDurationInFrames + audioPadFrames,
      minFrames
    );
    scenes.push({
      id: sceneVoice.id || `scene${idx + 1}`,
      name: sceneVoice.name || '',
      startFrame: cursor,
      durationInFrames,
      audioDurationInFrames,
      lines,
    });
    cursor += durationInFrames;
  });

  return { scenes, durationInFrames: cursor };
}

/** True when a timeline meets the minimum film duration (seconds). */
export function meetsMinimumDuration(timeline: IllustratedTimeline, minSeconds: number, fps: number): boolean {
  return timeline.durationInFrames / fps >= minSeconds;
}
