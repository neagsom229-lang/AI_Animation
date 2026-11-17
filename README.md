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
- `out/<story>-contact.png` — contact sheet: 6 frames evenly spread across the
  whole film (3x2 grid, first and last frame included)

### Mock mode

`node scripts/make.mjs --story <story.json> --mock` uses offline mock TTS and
stamps a `MOCK VOICE` label on the film. Mock audio uses a `mock-` filename prefix
and is never reused for real generation.

### Render path, GPU and RAM (Round 4)

`node scripts/make.mjs` renders with the **GPU path by default**:
`gl: 'angle'` (hardware ANGLE) on a **full Chrome/Edge** install, which is
auto-detected (`CHROME=<path>` overrides it). Remotion's bundled
`chrome-headless-shell` only speaks SwiftShader, so it can never reach the
GPU — "default = software" meant "default = no GPU".

| flag | GL backend | use for |
|---|---|---|
| *(none)* | `angle` (GPU) | **production renders** |
| `--software` | SwiftShader | the determinism reference |
| `--gpu` | `angle` (GPU) | explicit alias of the default |

`npm run verify:determinism` is pinned to `gl: 'swiftshader'` on purpose: the
determinism reference must be the same on every machine.

**RAM.** This machine has 16 GB total and ~4–5 GB free, and every Remotion
tab holds a WebGL context plus the bundle. Four tabs is the proven-stable
number (`concurrency: 4`, `timeoutInMilliseconds: 60000`).

A pre-flight runs before every render (`scripts/preflight.mjs`):

```powershell
node scripts/preflight.mjs          # report only
node scripts/preflight.mjs --kill   # report + reap stale Remotion browsers
node scripts/preflight.mjs --json   # machine-readable
```

It prints free RAM, **warns below 4 GB**, picks the concurrency (4 at ≥4 GB,
2 below it) and kills the headless Chrome processes that *this pipeline*
started (their command line carries Remotion's user-data-dir marker) — a
leaked browser holds hundreds of MB and starves the next render. The render
scripts reap their own browsers again afterwards.

## Story JSON format

Required: `title`, `genre`, `theme`, `characters[]` (≥1), `scenes[]` (≥1).
Each scene requires `id`, `name`, positive numeric `dur`, and `dialogue[]`; each
line requires non-empty `text`. Optional per scene: `mood`, `camera`, `shot`,
`renderer`, `actions`. Optional per story: `language` and `world` — `world`
names a dressed 3D set (e.g. `"khmer-temple"`); unknown world names are hard
errors, never a silent substitute set. Optional per story:
`subtitleLanguage` — the language the CAPTIONS are in (defaults to the
narration language).

Camera rigs: `dolly`, `dolly-drift` (a slow push-in **plus** a drifting
bearing and a vertical settle — the two-shot move), `orbit`, `crane`,
`handheld`, `static`.
Shot types: `close-up`, `medium`, `wide` (a monument shot aimed at the
temple), `over-shoulder`.

**Caption language.** The caption text follows the *script* of the caption
language: with `--lang km` the shipped Khmer story shows the Khmer narration
line, and the English `subtitle` field (an authored gloss) is used only when
the caption language is English. Set `"subtitleLanguage": "en"` in the story
to force English captions under Khmer narration.

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
      "shot": "wide",
      "renderer": "2d",
      "actions": [
        { "character": "jaya", "action": "talk" }
      ],
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

Valid shots (per scene — framing from `remotion/lib/camera.ts`, with the rig
adding the motion on top):

| Shot | Distance | Look-at | Framing |
|---|---|---|---|
| `close-up` | 2.5 m | head (y 1.7) | tight on the speaker, ~55% of frame height |
| `medium` | 4.0 m | head (y 1.7) | the talk shot — speaker holds 40–60% of frame height |
| `wide` | 11 m | y 3.9 | establishing: horizon on the lower third, temple + sky above |
| `over-shoulder` | 3.9 m, behind the listener | speaker's head | two-hander; needs ≥2 characters with `modelUrl` (validator enforces) |

`dolly` pushes in along the shot bearing, `orbit` sweeps ±arc around it
(never behind the set), `crane` rises 2.5 m into the shot height,
`handheld` adds seeded simplex shake, `static` holds. All poses are pure
functions of the frame index — no wall-clock, no `Math.random`.

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
