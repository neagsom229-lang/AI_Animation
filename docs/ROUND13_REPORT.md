# Round 13 report — "Make it simple"

Branch `factory`. One commit per item; nothing pushed. All numbers below are
measured on this machine from real commands, not estimates (except where the
`film estimate` prediction is explicitly labelled as such).

## Before → after

| Area | Before Round 13 | After Round 13 (measured) |
|---|---|---|
| Python env | `.venv` (Python 3.14, no working depth stack) + ad-hoc probes | ONE `.venv-depth` (Python 3.12.10; torch 2.15.0, transformers 5.23.0, Pillow 13.0.0, numpy 2.5.5, edge-tts). `film doctor`: `environment PASS … all 5 imports ok`. Legacy `.venv` only warns; nothing deleted. |
| Drop folder | legacy build staging + scattered sources | one `assets-src/inbox/`, timestamped `assets-src/backup/<ts>/` copies before any replacement (never move/delete user images). |
| Ingest time | **265.0 s** (per-image `npx remotion` probes) | **11.19 s cold** (36 probes computed), **8.69 s warm** (36/36 cached) — ~32x faster than baseline. Remaining time is real intake re-encoding. |
| Ingest output | one line per scene + raw warnings | grouped warnings (`18 scenes: source 1024 px (< 1600)  scenes 1-18`), `--verbose` for every scene. |
| Doctor output | repeated per-scene lines + 3 long REQUEUE blocks | one `REQUEUE (regenerate only these 6)` list: scene → save-as filename → target → prompt file; `probe cache: 18/18 cached`. |
| `film next` | did not exist | `BLOCKERS: 3 (duplicates, resolution, manual-review)` + exactly one `NEXT: regenerate scene 10 -> … ; prompt: docs/prompts/scene-10.txt`. |
| Review | hand-edit `manifest.json` | `film review sheet` → `out/review/review.html` (18 scenes, 26 KB); `film review --scene N …` writes flags+`{by,at,changed}` for ONE scene; `--license-url` only path that sets it. Nothing auto-set. |
| Prompts | stale 12th-century line on 9th/13th/15th/present-day scenes | 18 `docs/prompts/scene-NN.txt` files, era-correct; `generate-prompts --check` → `18 prompt files are up to date.` |
| Status | JSON + several commands to correlate | `STATUS.md` (generated, do not edit): image, source size, duplicate group, depth source, review flags, limitFactor, last render. |
| Draft render | no labelled selected-scene deliverable | `film draft --scenes 2,7,15` → `out/drafts/<ts>/khmer-empire-DRAFT-NOT-RELEASABLE.mp4`, 9 stills, contact sheet, `report.json`, `REPORT.txt`, `honesty.txt`. |
| Tests | 310 pass (~63.5 s), live edge-tts inside `npm test` | 383 pass / 0 fail (~21 s), strictly offline; live test only in `npm run test:network` (1 pass, ~9.7 s). |

## Verification (final run)

- `npx tsc --noEmit` — **0 errors**.
- `npm test` — **383 pass, 0 fail**.
- `npm run test:network` — **1 pass** (real edge-tts; needs connectivity).
- `npm run verify:determinism` — **PASS** (two independent renders, identical video
  sha256 `ab3e4a33…` and identical sampled frames).
- `npm run qa` — **9/9 gates PASS** (tsc, tests, StoryFilm + IllustratedFilm
  determinism, manifest, licence coverage, 146.3 s duration, loudness, captions).

## Real draft deliverable (item 8)

`out/drafts/2026-11-18T02-04-01-751Z/khmer-empire-DRAFT-NOT-RELEASABLE.mp4`

- ffprobe: **1280×720, h264, 862 frames, 28.800667 s, 21.01 MB**.
- measured **252.2 ms/frame** across 3 scenes vs `film estimate` **238 ms/frame**
  (a prediction, not a result). Per scene: 2 = 53.8, 7 = 580.6 (world3d shot),
  15 = 66.0 ms/frame.
- 3 real stills per scene at 15%/50%/85% (the exact scene start is a crossfade to
  black), `contact.png` 3×3 / 1440×810.
- `honesty.txt` states what cannot be judged: art quality, anachronisms,
  watermark, unreviewed scenes, empty licence, duplicate groups, motion between
  stills, music; parallax is **2.5D**, never true 3D.

## Expected final blockers (unchanged on purpose — no silent pass)

`film doctor` (final profile) still stops at **duplicates**; `film next --profile final`
counts three blockers. Nothing was auto-reviewed to make this green:

1. **duplicates** — groups 9=10, 11=12=13=14, 15=16=17; regenerate scenes
   10, 12, 13, 14, 16, 17 from `docs/prompts/scene-NN.txt`, save into
   `assets-src/inbox/`, then `film ingest`.
2. **resolution** — 18 sources are 1024×559 (< 1600 px); upscale or regenerate
   at ≥1920×1080.
3. **manual-review** — 18 scenes have `reviewed:false`, empty `licenseTermsUrl`,
   and empty recorded prompt from the provisional draft ingest. Set the licence
   with `film review --license-url`, re-ingest with `--profile final` to fill the
   prompt, then review each scene with `film review --scene N …`.

`environment`, `ingest`, `depth`, `parallax-metrics` and `draft-render` all PASS.
A draft-profile manifest can never satisfy a final render
(`manifestCanSatisfyFinal`); `--profile final` has **no `--force`** escape hatch.
