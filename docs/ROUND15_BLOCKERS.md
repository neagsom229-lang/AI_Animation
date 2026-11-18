# Round 15 — remaining FINAL blockers (honest, no changes applied)

`film next --profile final` (real output, this machine):

```
BLOCKERS: 3 (duplicates, resolution, manual-review)
NEXT: regenerate scene 10 -> assets-src/inbox/scene-10.png (>= 1920x1080, 16:9); prompt: docs/prompts/scene-10.txt; then: node scripts/film.mjs ingest
```

No review flag and no licence URL was set by this report. `film.config.json` still
has an empty licence URL; every manifest scene remains `reviewed:false`,
`matchesNarration:false`, `watermarkCheck:false`.

## 1. Duplicates — 3 groups

- group 1: 9 = **10**
- group 2: 11 = **12** = **13** = **14**
- group 3: 15 = **16** = **17**

Scenes to regenerate with distinct images: **10, 12, 13, 14, 16, 17**.
For each: use `docs/prompts/scene-NN.txt`, 16:9, **>= 1920 px wide**, save into
`assets-src/inbox/` under the exact `scene-N.png` name, then run `film ingest --profile final`.
Scene 13 is currently `world3d` in the story (`media.type=world3d`) but ran at
572 ms/frame like its painted duplicates — see `docs/ROUND15_REPORT.md`/item 3
for the one-line edit to make it painted (not applied here).

## 2. Resolution — all 18 below the 1600 px minimum

Measured source size for every scene: **1024 x 559** (>= 1600 px count: 0; below: 18).

Two options, no silent upscale:
1. regenerate at **>= 1920 px wide** (preferred; keeps source detail);
2. install **Real-ESRGAN** (BSD-3 licence — verify the licence before use) and run
   `film upscale`. **Warning: upscalers invent detail**; the result is not the
   original image and must be reviewed by eye.

## 3. Manual review — 18 scenes

After checking each image against its narration, record ONE scene at a time:

```
node scripts/film.mjs review --scene N --matches-narration yes|no --watermark clear|visible --reviewed yes|no
```

Nothing auto-fills these fields. `review sheet` shows a text-only CHECK BY EYE
hint, not a picture judgement.

## 4. Licence URL

```
node scripts/film.mjs review --license-url <the image tool's licence URL>
```

Only this command writes `licenseTermsUrl`. It validates the URL syntax; it does
not judge the licence terms.

## Tier B cleanup stays blocked

`assets-src/backup` and `assets-src/inbox/_originals` remain untouched. Tier B
may only be actioned after `film ingest --profile final` reports **0 duplicate
groups** and all **18 inbox sha256 values match the manifest**. Current check:
`sha_match=18/18` but **duplicate groups = 3**, so the gate is still closed.

## Final profile rules (unchanged)

`--profile final` has **no `--force`**. A draft-profile manifest can never satisfy
a final render. Draft output stays `DRAFT-NOT-RELEASABLE`. Painted scenes are 2.5D
parallax, never true 3D; only `world3d` scenes have limb animation.
