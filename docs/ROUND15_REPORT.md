# Round 15 report — fix leaks, speed up, one command

Branch `factory`. One commit per item; nothing pushed. All numbers are from real
commands. Free RAM at each item start: step 0 **2.06 GB**, item 1 **2.31 GB**,
item 2 **2.50 GB**, item 3 **2.21 GB**, item 4 **1.41 GB -> 5.05 GB at render**,
item 5 **1.76 GB**, item 6 **1.39 GB**, item 7 **2.42 GB**, item 8 **1.98 GB**,
item 9 **1.87 GB**. No render was ever started while another was running.

## Step 0 — read-only check

`branch=factory`, clean tree, no node/ffmpeg render process.
`film next --profile final` → `BLOCKERS: 3 (duplicates, resolution, manual-review)`,
one action: regenerate scene 10.

## Item 1 — backup leak FIXED

Before: ingest logged `backed up 18 replaced file(s)` then `0 new, 0 replaced, 18 unchanged`.
Existing backup folders: **8 folders, 706,519,200 bytes total, all 8 byte-identical**
(aggregate hash `1f319a3e27fe`); none were deleted.

After the fix (`backupReplaced` compares incoming source sha256 with the source
sha256 recorded by the previous ingest, and skips copies when they match and when
no destination exists to preserve): two consecutive `film ingest --profile draft`
runs printed **no backup line** and the folder count stayed **8 -> 8 -> 8**. Both
reports were `0 new, 0 replaced, 18 unchanged`. Unit test:
`tests/round15-item1.test.js` (zero NEW folders on an unchanged second ingest).

## Item 2 — honest draft report

Real selected-scene draft `out/drafts/2026-11-18T05-24-15-825Z/`:

- **COLD START separate:** setup 138 ms + bundle **15,368 ms** — not charged to scene 1.
- Voice actually used: `km-KH-PisethNeural` (every scene line).
- Overall: **249.2 ms/frame**, 28.565667 s, 20.87 MB, 1280x720; estimate 208 ms/frame (PREDICTION).

| scene | type | frames | ms/frame | seconds | % of total |
|--:|---|---:|---:|---:|---:|
| 2 | illustration | 258 | 99.0 | 8.60 | 12.0% |
| 7 | world3d | 318 | 529.4 | 10.60 | 79.0% |
| 15 | illustration | 279 | 68.6 | 9.30 | 9.0% |

Painted scenes are **2.5D parallax**, not true 3D; painted people are not
limb-animated. Only world3d scenes have limb animation.

## Item 3 — scene-type audit (read-only)

world3d scenes: **1, 7, 13, 18**, set by `media.type: "world3d"` (with
`media.world: "khmer-temple"`) in `src/stories/khmer-empire.json`. All other
scenes are painted illustration = 2.5D parallax.

- Scene 13 (Angkor Thom / Bayon) measured **572 ms/frame** while its painted
  duplicates ran **11=61.9, 12=57.4, 14=69.2 ms/frame**. Flagged for user
  confirmation; the one-line edit printed by `film-scene-audit.mjs` deletes
  `scenes[12].media`. **NOT applied.**
- Cost guard: world3d **23.6%** of duration vs the **25%** limit — `warn=false`.
  Film duration 146.0 s.

## Item 4 — fast preview + cache proof

- Normal 18-scene draft (baseline `out/drafts/2026-11-18T03-58-14-790Z/`):
  **213.9 ms/frame**, 120.9 MB, 146.24 s.
- Fast draft `out/drafts/2026-11-18T05-32-06-193Z/`
  (`khmer-empire-DRAFT-FAST-NOT-RELEASABLE.mp4`): **157.9 ms/frame**, 61.9 MB,
  146.24 s, ffprobe **852x480** h264. **1.35x faster / 48.8% smaller**.
  Honest limitation: world3d **half-frame-rate is NOT enabled** — Remotion's
  `validateEveryNthFrame` accepts only `1`; no frame skipping was faked.

Per-scene cache proof (stable `out/drafts/scene-cache/<key>/`):
- run 1 (scenes 2,7,15): **3 rendered, 0 reused**;
- run 2 unchanged: **0 rendered, 3 reused** (`CACHED (0 rendered)` for each);
- temp fixture with a modified COPY of scene 2's image (real inbox untouched):
  scene 2 rendered with new key `57dc07c1` (was `9c34c55f`), scene 7 stayed cached
  with key `adda13d0` → **1 rendered, 1 reused**. Only the changed scene re-rendered.

## Item 5 — voice consistency

`film.config.json` pins `voice=km-KH-PisethNeural, rate=0`. `generate-voice.py`
now retries the pinned voice exactly **3 times** with 0.5/1 s backoff, then STOPS
with a clear message; alternates are tried only with explicit `--allow-fallback`
and are logged per scene in `fallbackScenes`.

Real run: `voice: pinned=km-KH-PisethNeural rate=0 elapsed=29,791 ms
fallbackAllowed=false`; all 18 audio lines reused cached audio. Manifest now
records `voiceId`, `rate`, `allowFallback`, `fallbackScenes: []`, and per-scene
`duration`. Distinct `voiceUsed` values: **only km-KH-PisethNeural** — no silent
gender switch.

## Item 6 — one command

`film all` = environment check -> ingest -> depth -> next; stops at the first
blocker and prints exactly ONE action. Real run (`--depth gradient`):
`freeRam=2.26 GB` (after fixing an initial statfs/disk bug — now `os.freemem()`),
`environment PASS`, `stage ingest DONE (0 blockers)` with
`0 new, 0 replaced, 18 unchanged`, `stage depth DONE (0 blockers)`,
`draft NOT rendered: no --draft flag`, `NEXT: node scripts/film.mjs draft`.
Model depth metrics were restored afterwards with `film depth --depth model`.

## Item 7 — estimate re-baseline

From the real full draft: illustration **62 ms/frame** (painted mean 65.4, median
66.1, trimmed warm value), world3d **500 ms/frame** (scenes 7/13/18 =
439.8/572.0/486.4), cold start reported separately and scene 1's 1369.2 excluded.
1080p **PREDICTION**: **1,629.3 s (27.2 min)** expected final render.

## Item 8 — remaining FINAL blockers

`film next --profile final`: `BLOCKERS: 3 (duplicates, resolution, manual-review)`.
Exact actions are in `docs/ROUND15_BLOCKERS.md`. Tier B stays blocked: sha match is
18/18 but duplicate groups = 3. No review flag or licence URL was set.

## Item 9 — verification

First full test run exposed 4 failures, reported honestly:
1. `factory.test.js` expected a storyboard folder deleted by `film clean`;
2/3. gradient depth from `film all` overwrote committed model metrics
(`depthSource`/varied `limitFactor` assertions).

Fixes: wrong-folder test now creates its own fixture and `findWrongFolderImages`
skips `build/cache`; model metrics regenerated with `film depth --depth model`.

Final verification (real output):

| gate | result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm test` (offline) | **419 pass, 0 fail** |
| `npm run test:network` | **1 pass** (live edge-tts) |
| `npm run verify:determinism` | PASS, identical video sha256 and frames |
| `npm run qa` | **9/9 gates PASS** |

`START_HERE.md` now leads with `film setup` -> `film all` -> `film all --draft`.
