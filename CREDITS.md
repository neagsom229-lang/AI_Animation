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

## 9. Angkor Wat set — Poly Haven PBR textures (CC0)

Downloaded 2026-11-16 via the official API (`https://api.polyhaven.com/files/<id>`), every file MD5-verified against the checksum the API publishes. `nor_gl` = OpenGL-orientation normal (the pose this pipeline uses), 1k JPG, designed for `MeshStandardMaterial`. Used by `remotion/compositions/AngkorWorld.tsx` / `SceneWorld.tsx`. All Poly Haven assets are CC0 (https://polyhaven.com/license) — no attribution required; credited for provenance. `large_sandstone_blocks_01` is used for the gallery tier bodies, `old_sandstone_02` for walls/gopura/prangs, `mossy_sandstone` for moss accents + corbel courses, `red_laterite_soil_stones` for the laterite terrace/causeway, `dry_ground_01` (�5) for the dry-earth forest floor, `palm_bark` for procedural palm trunks. (`grass_ground` was the floor before Round 4 and is no longer referenced.)

| Asset | File (1k JPG) | MD5 | Used as |
|---|---|---|---|
| old_sandstone_02 | old_sandstone_02_diff_1k.jpg / old_sandstone_02_nor_gl_1k.jpg / old_sandstone_02_rough_1k.jpg | 45235f7669057df7cdbb24cac89beede / 896ccd3108b5376f3ffa9f141e2086fb / 4c01a032f589b5dbe1156bb1968f35ef | wall/gopura/prang albedo+normal+rough; also the "relief" character style (remotion/lib/relief.ts) |
| large_sandstone_blocks_01 | large_sandstone_blocks_01_diff_1k.jpg / _nor_gl_1k.jpg / _rough_1k.jpg | 78dd6175efd141c63bf19cc40f97cb9a / cb9717ae6a54990c0bc57b1e10f674a8 / 86bbd9600437cdcacc989423a8d49b1d | gallery tier bodies, moat banks |
| mossy_sandstone | mossy_sandstone_diff_1k.jpg / _nor_gl_1k.jpg / _rough_1k.jpg | c5fecb142f49694839236182d2449deb / cc30004b15373b0f42ad26bdc232673e / 791f76663a4e483b4e8605f75e9436d8 | moss courses, corbel rings, gopura cap, naga finials |
| grass_ground | grass_ground_diff_1k.jpg / _nor_gl_1k.jpg / _rough_1k.jpg | 299047258586c762735b7284d3c662c3 / d518c5b2af6f2c0297bc807b351f511f / 2e6afca246cf6b80bdb53f46fe7e5ce5 | staged (floor texture before Round 4; not referenced by the current compositions) |
| red_laterite_soil_stones | red_laterite_soil_stones_diff_1k.jpg / _nor_gl_1k.jpg / _rough_1k.jpg | f5d483e42da0c704f320b8c159ebca5e / 08737e3b461efa2583c648fbb3472e84 / 564a0faa8182a6cdb0fcff8e357dc064 | terrace, causeway, apron, banks |
| palm_bark | palm_bark_diff_1k.jpg / _nor_gl_1k.jpg / _rough_1k.jpg | 89e6474313f1547e3c12c4b68410ee39 / 47c13a26ef585fbb0d93f5593f8f711f / 8ce664df74d422a570ed97cc9cffc2bf | palm trunks |

Generated procedurally in-canvas (no external assets, no licenses): palm canopy silhouette, naga finial cones, bas-relief bump band (`AngkorWorld.tsx`).

### 9b. Round 4 rebuild of the Angkor Wat set — no new external assets

The Round-4 rebuild (human-scaled layout, colonnaded galleries, 3:1 prang
ratio, sugar-palm forest line, dry earth + grass, dark moat with lotus pads,
continuous naga rail with hooded heads) introduced **no new third-party
assets**. Everything new is generated in code:

- **sugar-palm crown**, **grass tuft** and **lotus pad** silhouettes —
  drawn with Canvas2D at runtime (`makePalmAlpha`, `makeGrassAlpha`,
  `makeLotusAlpha` in `remotion/compositions/AngkorWorld.tsx`);
- **bas-relief bump band** — a carved Khmer gallery wall drawn in Canvas2D
  (`makeBasReliefBump`), used as a bump map on the gallery and enclosure
  walls;
- **ripple normal map** for the moat (`makeRippleNormal`);
- the layout itself (`remotion/lib/angkor.ts`) — pure numbers, no assets.

The Poly Haven textures of §9 are reused as before; the ground switched from
`grass_ground` to `dry_ground_01` (§5) for the dry-earth floor.

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

## 10. Illustrated film — depth model & tooling (added on `illustrated` branch)

- **Depth Anything V2 Small** (`depth-anything/Depth-Anything-V2-Small-hf`) —
  used by `scripts/depth.py --depth model` to generate 16-bit depth maps.
  **License: Apache-2.0** (permissive, commercial use allowed), verified from
  the model card https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf
  on **2026-11-17** (card shows "License: apache-2.0"). NOT a non-commercial
  checkpoint. `scripts/depth.py --license-check` re-asserts the allow-list.
  Installed via `python -m pip install torch transformers Pillow numpy` (CPU).
- **OpenCV** (`opencv-python-headless`, Apache-2.0) — optional `--layers`
  inpainting for parallax masks. Installed via `python -m pip`.
- **Gradient depth fallback** — no third-party asset, pure Python; produces a
  labeled horizon-based depth map (`--depth gradient`), never passed off as a
  learned map.
- **Illustrations** (`assets-src/illustrations/scene-XX.png`) are user-generated
  from `docs/ILLUSTRATION_PROMPTS.md`; the generating tool/model, its license,
  prompt and date must be logged here per image before shipping (CC0/CC-BY or a
  license recorded in this file). None are shipped yet.

## Channels that failed and were NOT silently substituted

- **itch.io Quaternius pages** (e.g. https://quaternius.itch.io/universal-base-characters):
  the download checkout requires a payment-method step (PayPal/Card; the free
  `$0` path could not be completed headlessly). **Not used.**
- **Google Drive quota**: `Casual_Male.gltf` / `Casual_Female.gltf` /
  `License.txt` returned the "Too many users have downloaded this file" page on
  the first attempt and succeeded on retry — same official URLs, no substitute
  was needed. **No manual download is required.**
