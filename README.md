# Kuanimation Studio

Professional, frame-deterministic 3D animation and motion graphics studio powered by **Remotion**, **Three.js**, and **AI Agent Skills**.

Turns a **story JSON + real TTS narration** into a deterministic 3D animated
**MP4** with lip-synced audio, subtitles, and a contact sheet.

---

## What it does

```
story JSON ──► edge-tts voice ──► voice.json (20 Hz RMS envelope)
                              │
                              ▼
                 StoryFilm (Remotion + Three.js)
                              │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
      out/<story>.mp4   out/<story>.srt   contact sheet
```

## Quick start (Windows PowerShell) — 5 commands

```powershell
# 1. Install dependencies
npm install

# 2. Run the environment doctor (node, python, edge-tts, ffmpeg decode, live TTS)
node scripts/doctor.mjs

# 3. Make a Khmer-language film from the default story
node scripts/make.mjs --story src/stories/khmer-temple.json

# 4. Make an English film (different voice, subtitle font, subtitle text)
node scripts/make.mjs --story src/stories/historical-angkor.json --lang en

# 5. Verify the deterministic frame contract (render twice, compare hashes)
npm run verify:determinism
```

Outputs land in `out/`:

- `out/<story>.mp4` — final film (h264, 1920x1080 @ 30 fps)
- `out/<story>.srt` — subtitles timed from the same voice data as the film
- `out/<story>-contact.jpg` — contact-sheet preview (frame 30)

### Mock mode

`node scripts/make.mjs --story <story.json> --mock` uses offline mock TTS and
stamps a `MOCK VOICE` label on the film. Mock audio uses a `mock-` filename prefix
and is never reused for real generation.

## Story JSON format

Required: `title`, `genre`, `theme`, `characters[]` (≥1), `scenes[]` (≥1).
Each scene requires `id`, `name`, positive numeric `dur`, and `dialogue[]`; each
line requires non-empty `text`. Optional per scene: `mood`, `camera`, `renderer`,
`actions`.

```json
{
  "title": "Echoes of Angkor",
  "genre": "historical",
  "theme": "Rise of water management and great temples",
  "tone": "epic",
  "language": "en",
  "characters": [
    { "id": "jaya", "name": "King Jayavarman VII", "role": "Builder King" }
  ],
  "scenes": [
    {
      "id": "s1",
      "name": "Forest Dawn",
      "mood": "warm dawn",
      "dur": 6,
      "camera": "dolly",
      "renderer": "2d",
      "dialogue": [
        { "speaker": "jaya", "text": "In the heart of the great forest, stone temples rise to touch the clouds.", "subtitle": "Stone temples rise in the forest." }
      ]
    }
  ]
}
```

Valid moods: `warm dawn`, `gold dust`, `night storm`, `paper`, `green`.
Valid cameras: `dolly`, `orbit`, `crane`, `handheld`, `static`.
Valid actions: `idle`, `walk`, `talk`, `turn`, `gesture`, `react`.

## Adding voices / characters / models

- **Voices:** pass `--voice <edge-tts-voice>` or rely on `--lang km|en`
  (defaults: `km-KH-PisethNeural`, `en-US-AriaNeural`). Add new voices to
  `KNOWN_VOICES` in `scripts/generate-voice.py` after verifying with edge-tts.
- **Characters / models:** add characters to the story; drop a `.glb` into
  `public/models/` and point the scene at it via the character `modelUrl`.

## Troubleshooting

- **edge-tts 503 / timeouts:** transient. Re-run; `node scripts/doctor.mjs` runs
  a live 1-word TTS call to confirm.
- **Blocked executables (`pip.exe`, `ffprobe.exe`, system `ffmpeg`):** use
  `python -m pip`, Remotion's bundled tools (`npx remotion ffmpeg`,
  `npx remotion ffprobe`), and `node scripts/<name>.mjs --flag value` instead of
  `npm run <name> -- --flag value`.
- **npm flag issue:** `npm run x -- --flag value` may fail with
  "Unknown cli flag" — always use the direct node form:
  `node scripts/make.mjs --story <story.json> --lang km`.

## Invariants & docs

- `docs/INVARIANTS.md` — non-negotiable frame-determinism rules.
- `docs/ARCHITECTURE.md` — pipeline diagram + data contracts.

## Prompting the Agent

Example prompts to generate new scenes:
- *"Generate a 15-second explainer composition with a crane-down camera move and warm dawn mood."*
- *"Add a new walking character composition with custom narration and seeded procedural gait."*
- *"Create a 5-second orbit shot with glowing dust particles and cinematic handheld shake."*
