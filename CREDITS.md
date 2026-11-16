# CREDITS — Asset Sources & Licenses

Every file listed here was **actually downloaded** by the Kuanimation asset
pipeline on **2026-11-14** from the official source named below. Nothing in
`public/models/`, `public/textures/` or `public/fonts/` is credited from memory
or guesswork: each entry records the pack name, the real URL that returned the
file, the license as stated on the source, and the download date.

- Poly Haven downloads were verified against the `md5` returned by
  `https://api.polyhaven.com/files/<id>` (all 7 files match).
- Kenney zips were fetched through the official signed-link endpoint
  `https://kenney.nl/download-link/<id>` (invoked by the "Download" button on
  the pack page) and verified to unzip (PK magic bytes).
- Quaternius files came from the official Google Drive folder linked by the
  pack page; file sizes match the folder listing exactly, and the pack's own
  `License.txt` was downloaded and read (text reproduced below).

---

## 1. Quaternius — Ultimate Animated Character (CC0 1.0)

| Field | Value |
|---|---|
| Pack page | https://quaternius.com/packs/ultimatedanimatedcharacter.html |
| Source folder | https://drive.google.com/drive/folders/1sNi1AfenfPRrvRt5yfaj5QMMd6KKcUJ5 |
| License | **CC0 1.0 Universal (Public Domain Dedication)** — verified from the pack's own `License.txt`: "LowPoly Models by @Quaternius … License: CC0 1.0 Universal (CC0 1.0) Public Domain Dedication https://creativecommons.org/publicdomain/zero/1.0/" |
| Downloaded | `Casual_Male.gltf` (2,048,792 B), `Casual_Female.gltf` (2,058,883 B), `License.txt` (364 B) — 2026-11-14 |
| Used as | `public/models/characters/casual_male.glb` (805 KB), `public/models/characters/casual_female.glb` (813 KB) |
| Processing | `gltf-transform optimize` 4.5.1 (`--compress false`): 2.05 MB → 824 KB / 2.06 MB → 833 KB; **all 17 animation clips preserved and verified** (incl. `Idle`, `Walk`) |
| Clips missing | The pack has **no Talk/Gesture clip and no jaw/viseme morph targets** (verified by parsing the GLB). Lip-sync therefore uses the bone-nod fallback (Head/Neck nodes) — see Phase B notes. |

## 2. Kenney — Nature Kit (CC0)

| Field | Value |
|---|---|
| Pack page | https://kenney.nl/assets/nature-kit |
| License | **CC0** — pack page states "Creative Commons CC0" |
| Downloaded | `kenney_nature-kit.zip` (10,291 KB) via the page's official signed download link — 2026-11-14; verified to unzip (3,618 files) |
| Used as | `public/models/props/kenney-nature-*.glb` (18 files, optimised with `gltf-transform optimize --compress false`) |

Files used: `kenney-nature-tree_palm.glb`, `kenney-nature-tree_palmTall.glb`,
`kenney-nature-tree_oak.glb`, `kenney-nature-tree_detailed.glb`,
`kenney-nature-rock_largeA.glb`, `kenney-nature-rock_smallC.glb`,
`kenney-nature-stone_largeB.glb`, `kenney-nature-plant_bushLarge.glb`,
`kenney-nature-statue_column.glb`, `kenney-nature-statue_columnDamaged.glb`,
`kenney-nature-statue_head.glb`, `kenney-nature-path_stone.glb`,
`kenney-nature-ground_riverTile.glb`, `kenney-nature-ground_riverStraight.glb`,
`kenney-nature-lily_large.glb`, `kenney-nature-grass_large.glb`,
`kenney-nature-cliff_steps_stone.glb`, `kenney-nature-bridge_stone.glb`.

## 3. Kenney — Castle Kit (CC0)

| Field | Value |
|---|---|
| Pack page | https://kenney.nl/assets/castle-kit |
| License | **CC0** — pack page states "Creative Commons CC0" |
| Downloaded | `kenney_castle-kit.zip` (2,180 KB) via the page's official signed download link — 2026-11-14; verified to unzip (397 files) |
| Used as | `public/models/props/kenney-castle-*.glb` (15 files, optimised with `gltf-transform optimize --compress false`) |

Files used: `kenney-castle-stairs-stone.glb`, `kenney-castle-wall.glb`,
`kenney-castle-wall-pillar.glb`, `kenney-castle-wall-doorway.glb`,
`kenney-castle-wall-corner.glb`, `kenney-castle-gate.glb`,
`kenney-castle-ground.glb`, `kenney-castle-tower-square-base.glb`,
`kenney-castle-tower-square-mid.glb`, `kenney-castle-tower-square-top.glb`,
`kenney-castle-tower-square-roof.glb`, `kenney-castle-rocks-large.glb`,
`kenney-castle-rocks-small.glb`, `kenney-castle-tree-large.glb`,
`kenney-castle-tree-small.glb`.

## 4. Poly Haven — qwantani_sunset_puresky (HDRI, CC0)

| Field | Value |
|---|---|
| Asset ID | `qwantani_sunset_puresky` (from `https://api.polyhaven.com/info/qwantani_sunset_puresky` — "calm, partly cloudy sunset with warm sun glow … great for exterior lighting") |
| Download URL | https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/qwantani_sunset_puresky_1k.hdr (exact URL returned by `https://api.polyhaven.com/files/qwantani_sunset_puresky`) |
| Integrity | 1,061,624 B, **MD5 `fe79b1b213166a70871eaddf7fce8c4e` matches the API** |
| License | **CC0** — https://polyhaven.com/license states "CC0 means absolute freedom" / Public Domain. *Note: the Poly Haven API itself returns no license field (probed `/license/<id>`, `/licenses`, `/info/<id>` —404 / no such key); the license is taken from the official license page.* |
| Downloaded | 2026-11-14 |
| Used as | `public/textures/qwantani_sunset_puresky_1k.hdr` (1k, ≤2048 ✓) |

## 5. Poly Haven — dry_ground_01 (ground texture, CC0)

| Field | Value |
|---|---|
| Asset ID | `dry_ground_01` (from `https://api.polyhaven.com/info/dry_ground_01` — "dry, cracked ground … sandy-brown tones") |
| License | **CC0** — https://polyhaven.com/license (see note in §4 about the API having no license field) |
| Downloaded | 2026-11-14, all **1k** JPGs, MD5-verified against `api.polyhaven.com/files/dry_ground_01` |

| File (in `public/textures/`) | Size | MD5 |
|---|---|---|
| `dry_ground_01_diff_1k.jpg` | 604,799 B | `f928726e24cf06765877ae77b9a04b4a` ✓ |
| `dry_ground_01_nor_gl_1k.jpg` | 243,523 B | `6088d590e646993784228156696e9948` ✓ |
| `dry_ground_01_rough_1k.jpg` | 336,234 B | `63b583296c606971ce605e5b160a21bc` ✓ |

## 6. Poly Haven — old_stone_wall (wall texture, CC0)

| Field | Value |
|---|---|
| Asset ID | `old_stone_wall` (from `https://api.polyhaven.com/info/old_stone_wall` — "weathered stone wall … beige-brown stones") |
| License | **CC0** — https://polyhaven.com/license (see note in §4) |
| Downloaded | 2026-11-14, all **1k** JPGs, MD5-verified against `api.polyhaven.com/files/old_stone_wall` |

| File (in `public/textures/`) | Size | MD5 |
|---|---|---|
| `old_stone_wall_diff_1k.jpg` | 880,453 B | `6cc7415f446cd7a04d86461ddbac0a28` ✓ |
| `old_stone_wall_nor_gl_1k.jpg` | 1,186,893 B | `e4f02b4c5956e69719d2dafa002085e5` ✓ |
| `old_stone_wall_rough_1k.jpg` | 233,946 B | `f707aa4f2052cd6e8523937f85700d88` ✓ |

## 7. Hanuman — Khmer caption font (SIL OFL 1.1)

| Field | Value |
|---|---|
| Font | Hanuman (Khmer + Latin), weights 400 and 700 |
| Source | Google Fonts official CSS API `https://fonts.googleapis.com/css2?family=Hanuman:wght@400;700`, which returned the exact `fonts.gstatic.com` TTF URLs used (no URL was guessed) |
| License | **SIL Open Font License 1.1** — verified from the official repo copy `https://raw.githubusercontent.com/google/fonts/main/ofl/hanuman/OFL.txt`: "Copyright 2019 The Hanuman Project Authors … This Font Software is licensed under the SIL Open Font License, Version 1.1." The OFL explicitly permits bundling/redistribution with software. |
| Downloaded | `Hanuman-Regular.ttf` (57,404 B), `Hanuman-Bold.ttf` (57,584 B) — 2026-11-14; TrueType magic bytes `00 01 00 00` verified on both |
| Used as | `public/fonts/Hanuman-Regular.ttf`, `public/fonts/Hanuman-Bold.ttf` — first face of the `km` subtitle stack (`remotion/lib/subtitles.ts`), registered via `@font-face` and gated with `delayRender` in StoryFilm so captions never capture in a fallback typeface |

---

## 8. VRM characters — `Vita.vrm` / `Vivi.vrm` (CC0)

| Field | Value |
|---|---|
| Assets | `Vita.vrm` (9,173,504 B) and `Vivi.vrm` (10,532,636 B), shipped in `public/models/characters/` |
| Source | `https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/Vita.vrm` and same path for `Vivi.vrm` — madjin/vrm-samples, the "VRoid Studio CC0 sample avatars" pack (downloaded 2026-11-15; originals kept in `assets-src/vrm/`, gitignored) |
| License | **CC0 (public domain)** — `extensions.VRM.meta.licenseName` is `"CC0"` in both source and shipped files, verified programmatically; madjin/vrm-samples distributes these VRoid-generated avatars as CC0. No attribution required; credited here for provenance. |
| Shrink | Originals re-encoded by the in-repo tool `scripts/shrink-vrm.mjs` (wraps `scripts/lib/vrm-shrink.mjs`): embedded PNG textures > 1024 px area-averaged down to ≤ 1024 px, JSON rounded-trip is byte-preserving for everything except `bufferViews[].byteOffset/byteLength` and `buffers[0].byteLength`. Post-shrink verification (file, before → after): `extensions.VRM` intact — licenseName `CC0` unchanged, 15 blendshape groups, 54 humanoid bones unchanged. |
| Looks (verified by isolated single-character renders, 2026-11-16) | `Vita.vrm` renders the **white/silver-hair cat-ear avatar** (heterochromia: yellow left / green right eye, cheek markings, black + teal coat). `Vivi.vrm` renders the **brown-bob avatar** (orange hair ribbon, green eyes, cream + green dress). The file names themselves do not indicate appearance — this was confirmed by rendering each file alone, not by assumption. |
| Used as | Story cast, `src/stories/khmer-temple.json`: `reach` (k2 speaker) → `Vivi.vrm`, `vrmScale` 1.27 (equal head heights across the pair); `minea` (k1 speaker) → `Vita.vrm`, `vrmScale` 1. Facial animation (blink/visemes/gaze), solved never-T-pose arm stance and lip-sync all run on the VRM path with the Phase B GLB path kept as fallback (`modelUrl`). |
| Provenance note | Attribution of *which* file renders *which* avatar is recorded here because both files come from the same URL pattern; the mapping is load-bearing for the cast layout. |

**Library note:** `@pixiv/three-vrm` 3.5.5 (MIT License, © pixiv Inc.) is used as the VRM loader/rig driver — it ships no artwork. `three` 0.160.1 (MIT) is already in use since Phase B.

---

## Also downloaded (staging copies in `assets-src/`, not shipped)

Kept for provenance/inspection only — none of these are referenced by the film:

- Quaternius *Ultimate Animated Character*: `BaseCharacter.gltf`,
  `BlueSoldier_Male.gltf`, `Casual_Bald.gltf`, `Elf.gltf`, `Soldier_Female.gltf`,
  `Viking_Female.gltf`, `Wizard.gltf`, `Preview.png` (clip/format inspection).
- Quaternius *RPG Characters*: `License.txt` (CC0 1.0, confirmed),
  `Monk.gltf` (clip inventory: Attack/Death/Idle/PickUp/RecieveHit/Roll/Run/Walk —
  no Talk/Gesture, so this pack was not used).
- Quaternius *Modular Ruins*: `License.txt` (CC0 1.0, confirmed).
- Quaternius *Ultimate Animated Character* source files that were superseded by
  the optimised GLBs above.

## Channels that failed and were NOT silently substituted

- **itch.io Quaternius pages** (e.g. https://quaternius.itch.io/universal-base-characters):
  the download checkout requires a payment-method step (PayPal/Card; the free
  `$0` path could not be completed headlessly). **Not used.**
- **Google Drive quota**: `Casual_Male.gltf` / `Casual_Female.gltf` /
  `License.txt` returned the "Too many users have downloaded this file" page on
  the first attempt and succeeded on retry — same official URLs, no substitute
  was needed. **No manual download is required.**
