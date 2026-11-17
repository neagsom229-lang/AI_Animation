# Kuanimation Studio

A frame-deterministic film factory: turn a story JSON + real Khmer TTS narration
into a reproducible MP4 with subtitles, and publish masters. Two styles share
the same pipeline: **3D** (`StoryFilm`, real-time Three.js) and **illustrated**
(`IllustratedFilm`, painterly 2.5D depth parallax). Software GL is the
determinism reference; the GPU path is for fast production renders.

> Platform: Windows 11 + PowerShell. No `&&` (use `;`), no `pip.exe` (use
> `python -m pip`), no system ffmpeg (use `npx remotion ffmpeg|ffprobe`).
> Hardware here: Intel UHD, ~4 GB free RAM of 16 GB.

## Flow diagram

```
                          ┌──────────────────────────────────────────┐
                          │ 1. story JSON  (3d OR illustrated)       │
                          └───────────────┬──────────────────────────┘
                                          │
              ┌───────────────────────────┴────────────────────────────┐
              │                                                        │
     ┌────────▼─────────┐                                   ┌──────────▼──────────┐
     │ 3d: characters   │                                   │ illustrated:        │
     │ char library     │                                   │ 18 illustrations    │
     │ + Angkor set     │                                   │ intake → depth →    │
     └────────┬─────────┘                                   │ manifest (reviewed) │
              │                                             └──────────┬──────────┘
              └───────────────────────────┬────────────────────────────┘
                                          │
                          ┌───────────────▼──────────────────────────┐
                          │ 2. voice: edge-tts (km) / azure           │
                          │    → voice.json (real dur + 20Hz env)     │
                          └───────────────┬──────────────────────────┘
                                          │
                          ┌───────────────▼──────────────────────────┐
                          │ 3. Remotion composition                   │
                          │    StoryFilm | IllustratedFilm            │
                          │    + Hanuman subtitles + year chips        │
                          └───────────────┬──────────────────────────┘
                                          │
              ┌───────────────────────────┴────────────────────────────┐
              │ per-scene MP4 (content-hash cache) → ffmpeg stitch     │
              └───────────────────────────┬────────────────────────────┘
                                          │
              ┌───────────────────────────▼────────────────────────────┐
              │ 4. publish pack: 16:9 + 9:16 masters, SRT km/en,       │
              │    cover, chapters, checksums, manifest.json           │
              └────────────────────────────────────────────────────────┘
```

## Ten commands — empty folder to final MP4 (illustrated film)

Run from the repo root in PowerShell. Use the **direct node form** (npm's
`--flag` passing is unreliable here).

```powershell
# 1. Install JS deps
npm install

# 2. One-command setup (Node/Python venv, deps, Chrome, ffmpeg, RAM preflight)
node scripts/setup.mjs

# 3. Health check incl. live 1-word edge-tts call
node scripts/doctor.mjs

# 4. Generate the 18 illustration prompts (read docs/ILLUSTRATION_PROMPTS.md)
#    Then generate the images yourself into a folder, e.g. my-art/

# 5. Intake: validate/crop/normalize images -> assets-src/illustrations/scene-XX.png
#    (writes manifest.json with tool/date/prompt/license URL)
node scripts/intake-illustrations.mjs my-art

# 6. Mark each scene reviewed in assets-src/illustrations/manifest.json
#    (docs/IMAGE_REVIEW_CHECKLIST.md) — final render fails if not reviewed:true

# 7. Generate depth maps (Apache-2.0 model; --depth gradient for labeled fallback)
python scripts/depth.py --story src/stories/khmer-empire.json --depth model

# 8. Verify environment + determinism before a big render
npm run qa

# 9. Build the film + publish pack (min 120 s gate; fails loudly if assets missing)
node scripts/make.mjs --story src/stories/khmer-empire.json --style illustrated --min-duration 120

# 10. Inspect outputs, then the dry-run QA contact sheets
#     final masters in out/publish/khmer-empire/ ; QA sheets in out/review/
node scripts/dry-run.mjs --story src/stories/khmer-empire.json
```

Without real assets you can exercise the whole chain with fixtures:
add `--allow-missing` to command 9 (renders clearly labeled placeholder cards).

## Styles & flags

- `--style illustrated` (or auto-detected from `story.style`) → `IllustratedFilm`.
- `--style 3d` → the original `StoryFilm` (unchanged).
- `--draft` 720p, `--vertical` 9:16, `--min-duration N` duration gate.
- `--allow-missing` placeholder cards; `--english-subtitles` opt-in English captions.
- `--tts edge|azure`, `--rate` pacing (Phase 5); Azure key from env, never in repo.
- `--software` SwiftShader determinism reference; default render is GPU (`--gpu`).

## Invariants

Frame-pure animation only (`useCurrentFrame`/`useVideoConfig().fps`); no
`useFrame`, `THREE.Clock`, `performance.now`, `Date.now`, or unseeded
`Math.random` in compositions — see `docs/INVARIANTS.md`.

## Docs

- `docs/RUNBOOK.md` — one-page operator runbook (daily use, recovery, QA gates).
- `docs/ARCHITECTURE.md`, `docs/INVARIANTS.md`, `docs/ILLUSTRATION_PROMPTS.md`,
  `docs/IMAGE_REVIEW_CHECKLIST.md`, `docs/ILLUSTRATED_QA.md`.
- `CREDITS.md` (assets) and `THIRD_PARTY_LICENSES.md` (quoted dependency licenses).

## Licensing note (for the rights-holder)

Remotion is licensed under a two-tier Free/Company license (NOT MIT/Apache/CC0);
edge-tts is LGPLv3. Both are quoted, not interpreted, in `THIRD_PARTY_LICENSES.md`.
Confirm the Remotion Company-License question for your entity before commercial
distribution.
