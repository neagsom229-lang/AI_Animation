/**
 * @fileoverview Pure story-timeline math for StoryFilm.
 *
 * Converts voiceData (real decoded durations + envelopes) into absolute frame
 * positions. This module is React-free and Remotion-free so it can be unit
 * tested directly in Node (same pattern as remotion/lib/camera.ts).
 *
 * Contract:
 *   - scene audio length = sum(round(line.dur * fps)) for its lines
 *   - padding (SCENE_GAP_SEC, default 0.75 s) is inserted AFTER each scene's
 *     audio except the last scene (no trailing gap)
 *   - composition duration = sum of all scene durations
 *   - line.startFrame / line.durationInFrames are ABSOLUTE composition frames
 *     (SceneRenderer converts to local frames by subtracting scene.startFrame)
 * @module remotion/lib/story-timing
 */

export interface TimedLine {
  file: string;
  text: string;
  subtitle?: string;
  env?: number[];
  /** Absolute start frame in the composition. */
  startFrame: number;
  durationInFrames: number;
}

export interface TimedScene {
  id: string;
  name: string;
  /** Absolute start frame in the composition. */
  startFrame: number;
  durationInFrames: number;
  /** Frames of actual audio (before the inter-scene gap). */
  audioDurationInFrames: number;
  lines: TimedLine[];
}

export interface StoryTimeline {
  scenes: TimedScene[];
  durationInFrames: number;
}

/** Breathing room after each scene's narration, in seconds. */
export const SCENE_GAP_SEC = 0.75;

export interface VoiceLineLike {
  file?: string;
  text?: string;
  subtitle?: string;
  env?: number[];
  dur?: number;
}

export interface VoiceSceneLike {
  id?: string;
  name?: string;
  dur?: number;
  lines?: VoiceLineLike[];
}

export interface VoiceDataLike {
  scenes?: VoiceSceneLike[];
}

/**
 * Build the full composition timeline from real voice durations.
 * Pure function: same (voiceData, fps, gapSec) → identical timeline.
 */
export function buildStoryTimeline(
  voiceData: VoiceDataLike,
  fps: number,
  gapSec: number = SCENE_GAP_SEC
): StoryTimeline {
  if (!voiceData || !Array.isArray(voiceData.scenes) || voiceData.scenes.length === 0) {
    throw new Error(
      'buildStoryTimeline: voiceData must contain a non-empty scenes array ' +
      '(generate it with: node scripts/make.mjs --story <story.json>)'
    );
  }

  const gapFrames = Math.round(gapSec * fps);
  let cursor = 0;
  const scenes: TimedScene[] = [];

  voiceData.scenes.forEach((sceneVoice: VoiceSceneLike, sceneIdx: number) => {
    let lineCursor = 0;
    const lines: TimedLine[] = (sceneVoice.lines || []).map((line: VoiceLineLike) => {
      const durationInFrames = Math.round((line.dur || 0) * fps);
      const timed: TimedLine = {
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
    const isLast = sceneIdx === voiceData.scenes!.length - 1;
    const durationInFrames = audioDurationInFrames + (isLast ? 0 : gapFrames);

    scenes.push({
      id: sceneVoice.id || `scene${sceneIdx + 1}`,
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
