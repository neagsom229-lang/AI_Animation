# Architecture

Kuanimation Studio converts a **story JSON + real TTS narration** into a
**frame-deterministic 3D animated MP4** with subtitles and a contact sheet.

## Pipeline Overview

```
story JSON ──► scripts/generate-voice.py (edge-tts | --mock)
                     │        │
                     │        ├──► public/voice/<scene>-<line>-<hash>.mp3   (real)
                     │        └──► public/voice/mock-<hash>.wav                (mock)
                     ▼
            public/voice.json  (per-line: dur + 20 Hz RMS env + text + subtitle)
                     │
                     ▼
   remotion/lib/story-timing.ts  (buildStoryTimeline: durations + padding)
                     │
                     ▼
            remotion/compositions/StoryFilm.tsx  (ThreeCanvas + AnimaCharacter + Audio + Subtitle)
                     │
        ┌────────────┼────────────────┐
        ▼            ▼                ▼
  out/<story>.mp4  out/<story>.srt   contact sheet
   (renderMedia)   (buildSrt)       (renderStill frame 30)

scripts/doctor.mjs        scripts/verify-determinism.mjs
(health checks)          (determinism proof)
```

## Data Contracts

### 1. Story JSON (`src/stories/*.json`)

```json
{
  "title": "string",
  "genre": "string",
  "theme": "string",
  "tone": "string",
  "language": "km | en",
  "characters": [{ "id": "string", "name": "string", "role": "string" }],
  "scenes": [
    {
      "id": "string",
      "name": "string",
      "mood": "warm dawn | gold dust | night storm | paper | green",
      "dur": "positive number (seconds)",
      "camera": "dolly | orbit | crane | handheld | static",
      "renderer": "2d | 3d",
      "actions": [{ "character": "string", "action": "idle | walk | talk | turn | gesture | react" }],
      "dialogue": [{ "speaker": "string", "text": "string", "subtitle": "string" }]
    }
  ]
}
```

Validation lives in `src/core/story.js` (`validateStory`) — unknown action,
camera, mood, speaker, language or empty dialogue text are hard errors with
actionable messages.

### 2. Voice Data (`public/voice.json` — generated, gitignored)

```json
{
  "story": "src/stories/khmer-temple.json",
  "title": "string",
  "language": "km | en",
  "voice": "km-KH-PisethNeural | km-KH-SreymomNeural | en-US-AriaNeural",
  "provider": "edge-tts | mock",
  "scenes": [
    {
      "id": "string",
      "name": "string",
      "dur": "number (sum of line durations)",
      "lines": [
        {
          "file": "relative audio path",
          "dur": "number (seconds, ffprobe-verified)",
          "text": "string",
          "subtitle": "string",
          "env": [number]  // 20 Hz RMS envelope, peak-normalised to max == 1
        }
      ]
    }
  ]
}
```

### 3. Composition Input (`inputProps` for `StoryFilm`)

```ts
{ story, voiceData, isMock?: boolean }
```

`calculateStoryMetadata` derives the composition duration from the timeline.

## Frame Contract (invariants)

See `docs/INVARIANTS.md`. Summary:

- No `useFrame` from R3F; motion = pure function of `useCurrentFrame()` + `useVideoConfig().fps`.
- No wall-clock time (`THREE.Clock`, `performance.now`, `Date.now`).
- No `Math.random()`; seeded randomness only (`remotion/lib/randomness.ts`).
- Every `<ThreeCanvas>` has explicit `width`/`height`.

## Determinism Proof

`node scripts/verify-determinism.mjs [--composition StoryFilm] [--frames 0,41,82]`

Renders twice and compares video SHA-256 + per-frame PNG SHA-256.
