# QA Report — Khmer-Empire Explainer Goal (Phases 0–6)

Date: 2026-11-16. Author: agent, verified by hand where noted. Every number below
comes from a real command run in this working tree. Nothing is asserted from
memory; where a claim is visual, the frame is named.

## Gates (final state, on `main` @ a2891e6 + Phase 6)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm test` | **152 / 152 pass** (15 files) |
| `node scripts/verify-determinism.mjs` | **PASS** — video sha256 identical across 2 runs; frames 0/15/…/89 identical |
| `node scripts/verify-determinism.mjs --composition StoryFilm` | **PASS** — video + frames 0/41/82 identical |
| `node scripts/still.mjs` | used throughout for per-frame QA |
| Contact sheets | `out/khmer-temple-contact.png` (6 frames), plus per-phase sheets in `out/review/` |

Tests added this round: `angkor.test.js` (layout invariants, determinism),
`credits-license.test.js` (every `| License |` cell must be permissive),
`vrm-anim/vrm-shrink/assets` .vrm coverage (Phase 3/5 of the previous goal),
silence-line handling in `buildSrt` (loud-throw contract preserved).

## Per-phase log

### Phase 0 — Audit (`docs/VISUAL_AUDIT.md`, commit e382b6c)
Rendered frames 0/62/124/187/249/311 and measured camera geometry:
character height ~15.5% of frame in wide shots (~47% in medium); faces never
visible in wides (both characters face away); single-tower pastel palace;
desert floor; white box props; blown-out glow; near-identical wide frames.

### Phase 1 — Art direction (`docs/ART_DIRECTION.md`, commit 1fbbef5)
Golden-hour, warm-but-desaturated; grey-brown sandstone + moss; tropical
greens; hazy depth; per-scene colour script (dawn k0/k1, morning k2).

### Phase 2 — Angkor Wat set (`remotion/lib/angkor.ts`, `compositions/AngkorWorld.tsx`, commit a1b7ec3)
Procedural, seeded, instanced: moat, causeway + naga rails, gopura, laterite
terrace, three galleries with bas-relief bands, five lotus-bud prangs
(quincunx, central ~24 m), instanced colonnades/stairs/nagas/96 palms, ground
mist, seeded birds. 18 CC0 Poly Haven textures (1k JPG, MD5-verified) added to
CREDITS.md §9. Tests: 152/152 after adding layout invariants.
Known defect: characters still seen from behind in the wide shots (fixed in Phase 4).

### Phase 3 — Human characters
- **3a (blocked → manual steps)**: `assets-src/characters/` does **not** exist.
  Wrote `docs/CHARACTER_PIPELINE.md`: exact Blender+MPFB (CC0) + Mixamo steps,
  rig vocabulary (`Idle/Talk/Gesture/Walk`), GLB budgets, license notes, and the
  no-clip procedural alternative already in place. Commit 0e383cc.
- **3b**: Vita/Vivi VRMs scaled into the 1.65–1.75 m band (Vivi 1.381→1.69 m at
  `vrmScale` 1.22). Both lack a jaw bone; the envelope→visa viseme path is the
  correct one. Commit ecb4819.

### Phase 4 — Direction and camera (commit f8dedf8)
- Establishing wide `k0` (crane, 2.4 s, **silent** — plays committed
  `public/voice/k0-silence.mp3`, 2.4 s of zero bytes, loud-throw preserved in
  `make.mjs`/`buildSrt` via a `silent` marker).
- `k1`/`k2` reframed over-shoulder (`over-shoulder` shot): camera behind the
  listener, speaker 3/4 front — faces visible in every talk frame (verified
  f110, f180, f249, f300).
- Root-caused the character/causeway occlusion (characters were sunk 0.8 m into
  the raised slab): causeway split into flush approach path (y≈0.03) + raised
  bridge over the moat. Verified f110/f300: both figures fully visible.
- `SHOT_FOV`: wide 50 / OTS 44 / medium 42 / close-up 38 (35–50 mm band).
- Split-focus DoF widened to OTS; dust motes thinned to 14 @ 0.15 opacity.
- naga cones shrink from 0.38→0.22 m after reading as artillery shells.

### Phase 5 — Quality and performance (commit a2891e6)
- `--draft` (720p via root scale transform, shadow 2048→512, normal/bump maps
  dropped in Angkor set, DoF/vignette/dust skipped) → `out/<story>-draft.mp4`.
- Bundle reuse `scripts/lib/bundle-cache.mjs` (sha256 of staged inputs +
  `public/`), wired into make/still — rebuilds only on real change.
- Concurrency cap 8→4 tabs; VM had only **3.64 GB free RAM**, tabs OOM-died
  mid-frame (18% death reproducible). 24 zombie chrome processes found and killed.
- **GPU path (with hard evidence):** CDP probe of the two browsers Remotion
  can use —
  - Remotion's bundled `chrome-headless-shell`: `renderer = ANGLE (Google,
    Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`
  - Full Chrome 157: `ANGLE (Intel, Intel(R) UHD Graphics (0x0000A7A8)
    Direct3D11 vs_5_0 ps_5_0, D3D11)`
  → Remotion does **not** use the system GPU by default. With `CHROME` pointed
  at full Chrome + `--gpu` + concurrency 4, the full render completes in 97.4 s
  (239 ms/frame). The earlier frame-276 stall was memory pressure (8 tabs on
  3.6 GB free RAM); with 4 tabs + 60 s page timeout it passes.
- **GPU + full Chrome works on this VM** once memory pressure is fixed
  (concurrency 4 + `timeoutInMilliseconds: 60000`, with zombie tabs killed):
  `node scripts/make.mjs --lang km --gpu` → **407 frames in 97.4 s = 239.4
  ms/frame** — ~11× faster than software, beating even the draft target, at
  full 1080p. The earlier stall (frame 276) was tab-starvation on 3.6 GB free
  RAM, not a hard driver fault. `--gpu` still needs `CHROME` pointed at full
  Chrome (Remotion's bundled shell is SwiftShader-only).
- **Final 1080p software (concurrency 4): 407 frames, 2581 ms/frame, 17.5 min.**
  Draft 720p: **~1432–2372 ms/frame** (run variance high on this VM).
- The 531 ms/frame number on the previous set confirmed SwiftShader is the
  ceiling for software; the set is heavier now, so software is strictly for
  `verify:determinism` and low-stakes checks.
- **Targets (draft ≤ 250 ms/frame, final ≤ 500): reached via `--gpu`**
  (239.4 ms/frame), **not reached on software** — but the software path remains
  the determinism reference and the default. On this VM with 3.6 GB free RAM,
  8-tab concurrency OOMs; 4 tabs is the stable ceiling.

Shipped artifact `out/khmer-temple.mp4` is **the GPU render** (h264 1920×1080
@30 fps + AAC, 13.568 s, 13.69 MB, verified by ffprobe). The software path is
byte-identical across runs (see gates), so determinism claims stand on software.

### Phase 6 — This report (commit pending)

## Before/after contact sheets (`out/review/`)

| File | Phase boundary | Reads |
|---|---|---|
| `phase-0-before.png` | audit input | 6 frames: single tower, desert, back-of-head blocking |
| `phase-2-after.png` | after Angkor set | temple reads as Angkor Wat (5 prangs, gopura, moat, causeway) |
| `phase-3-after.png` | after character scaling | identical staging (scale delta is sub-visible at this size) |
| `phase-4-after.png` | after direction fix | k0 establishing wide; OTS frames with faces visible (f124, f187, f249, f311) |
| `phase-6-after.png` | shipped state | identical to phase-4-after (Phase 5/6 changed no visuals) |

## Known remaining defects / could-not-judge

1. **No semi-realistic humans yet** — placeholder VRoid anime avatars (CC0).
   Faces are stylized, clothing synthetic; "semi-realistic" is not achieved.
2. **Wide establishing still shows backs** (it is a reveal; acceptable, not a face shot).
3. Sandstone still reads chocolate/tan rather than grey-brown (could push the
   desat further); tier slabs slightly flat; bas-relief bump subtle at distance.
4. Moat water reads as a **white band** in wides (reflects the bright sky, no
   normal-map ripple visible at this range); would need proper reflective
   material or mirrored geometry to fix convincingly.
5. Naga balustrade reads as stone spikes, not multi-headed nāga — geometry, not
   just materials, would be needed.
6. Gopura doorway recess is crushed to near black.
7. Birds are simple `𐒻`-stroke silhouettes.
8. **Naturalness of motion/lip-sync is unverified** (I verified determinism and
   envelope logic with A/B pixel diffs, not perceived realism).
9. **Khmer text rendering**: subtitles are correct but we have not done a
   Khmer-native read-through for line-break/shaping errors.
10. Mouth visemes: A/B diff confirms the mouth moves with the envelope but we
    have not judged whether it reads as *speech* (jaw motion is 2-state-ish, no
    tongue/teeth detail).
11. 24→14 dust motes reduced but still visible as faint dots at large size.

## License table (from CREDITS.md)

| Asset | License | Shipped? |
|---|---|---|
| Quaternius Ultimate Animated Character (Casual_Male/Female GLB) | CC0 1.0 | yes (fallback path) |
| Kenney Nature Kit (trees/rocks/ruins scatter) | CC0 | yes |
| Kenney Castle Kit (walls/towers) | CC0 | yes |
| Poly Haven qwantani_sunset_puresky HDRI | CC0 | yes |
| Poly Haven dry_ground_01 | CC0 | yes |
| Poly Haven old_stone_wall | CC0 | yes |
| Hanuman (Khmer caption font, SIL OFL 1.1) | SIL OFL | yes |
| Vita.vrm / Vivi.vrm (madjin/vrm-samples) | CC0 (embedded `licenseName:"CC0"` + VRM-verified) | yes |
| Poly Haven Angkor set textures (`old_sandstone_02` etc., §9) | CC0 (MD5-verified vs API) | yes |
| `@pixiv/three-vrm`, `three`, Remotion | MIT | n/a (libraries) |
| Mixamo (if used later) | royalty-free grant (not CC0) | **not shipped** — only if you download per `CHARACTER_PIPELINE.md`; re-licensed use needs your confirmation |

## What you must do manually next

1. **Characters (Phase 3a)** — see `docs/CHARACTER_PIPELINE.md`: Blender + MPFB2
   to author two semi-real humans (~1.7 m, export GLB ≤ 5 MB with shapes), then
   Mixamo (Idle/Talk/Gesture/Walk), retarget, bake to GLB at
   `assets-src/characters/`. Then I wire them and delete or keep VRMs as fallback.
2. **Ship faster final renders** — `--gpu` works today on this VM
   (`CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node
   scripts/make.mjs --lang km --gpu`, 239 ms/frame, artifact verified). But the
   VM has only ~3.6 GB free RAM, so keep `concurrency: 4` (already set) and
   never run 8 tabs. A discrete GPU or +8 GB RAM would make this routine;
   the shipped artifact is already the GPU render.
3. **Optional**: push sandstone desaturation + real water reflection (drei
   `Reflector` or `MeshStandardMaterial` with metalness 1.0 roughness 0.05) +
   nāga head geometry — each is an independent Phase-2-sized change.


---

# Round 4 (2026-11-17) — measurement, motion, temple, shots, render

## What was measured first (no code changes)

`scripts/motion-proof.mjs` (new) renders 8 consecutive frames (every 3rd
frame), projects the speaker's head / torso / arm regions into screen space
with the composition's own camera maths and prints the pixel difference.
The shot and rig can be overridden on the *input story* without touching a
source file, so the same rig, line and audio were measured at two
framings. Full numbers and the artefacts: `docs/VISUAL_AUDIT.md`.

**Stated plainly:** the character DID move before Round 4, but almost all of
it was in the head. The torso and the arms were close to static. That is
the evidence behind "procedural/stiff".

| region (close-up, k2) | mean diff before | after | changed % before | after |
|---|---|---|---|---|
| head | 11.605 | 17.280 | 26.1 % | 37.0 % |
| torso | 3.437 | 7.221 | 13.0 % | 24.1 % |
| arm | 2.587 | 5.148 | 11.2 % | 18.4 % |

## Gates (Round 4)

| gate | command | result |
|---|---|---|
| types | `tsc --noEmit` | clean |
| tests | `npm test` | 180 / 180 pass |
| determinism (reference composition) | `node scripts/verify-determinism.mjs` | PASS — byte-identical video + 7/7 identical frame hashes |
| determinism (StoryFilm) | `node scripts/verify-determinism.mjs --composition StoryFilm` | PASS — byte-identical video + 3/3 identical frame hashes |
| production render | `node scripts/render.mjs --story src/stories/khmer-temple.json --out out/khmer-temple-round4.mp4` | 407 frames rendered |

## Changes by area

### Temple (`remotion/lib/angkor.ts`, `remotion/compositions/AngkorWorld.tsx`)

- **Scale from the human.** The set is now sized from a 1.70 m figure:
  the outer gallery's colonnade is 4.2 m (≈2.5× a person) and the central
  prang's apex is 37.5 m (≈22× a person). The central prang is exactly
  **3.000×** the corner prangs (it was 1.875×) — that ratio is what turns
  a stepped pyramid into Angkor Wat.
- **The galleries are colonnades, not solid boxes.** Each tier is now an
  open rhythm of columns in front of a shadowed (recessed) gallery wall,
  capped by a corniced roof slab. Before, the colonnade was modelled but
  hidden inside a solid box.
- **The prangs are towers.** A stepped plinth, a tapering square shaft
  broken by six projecting cornice bands, a lotus-bud crown and a finial.
  The upper courses use a lighter stone so the silhouette separates.
- **The gopura has a real doorway** — jambs, a projecting lintel slab,
  flanking columns and a dark interior, instead of a flat grey rectangle.
- **The wall has rhythm** — buttress pilasters and a coping course; the
  carved bas-relief bump band (registers + corbelled niches) now repeats at
  a readable scale.
- **Ground, moat, trees.** Dry earth + 620 instanced grass tufts (the
  brick-red ground is gone); the moat is cut OUT of the ground plane
  (four pieces with a hole) and carries dark reflective water plus 54
  lotus pads; the cone trees are now sugar palms (260 of them) with a
  dense forest line of 240 behind the monument.
- **The naga balustrade** is a continuous serpent rail on a straight stone
  plinth, terminated by 5 hooded heads per side (was a row of spikes).

### Characters (`remotion/lib/vrm-anim.ts`, `remotion/lib/character-anim.ts`, `remotion/lib/foot-plant.ts`, `remotion/compositions/GlbCharacter.tsx`)

- **Weight shift + torso counter-rotation** (always on): the hips roll
  onto the supporting foot, the spine and chest counter-rotate above it,
  the free knee softens.
- **Gestures timed by the VOICE**: the local maxima of the 20 Hz envelope
  are the stressed syllables, and the hand lifts on each one. The old
  seeded schedule fired at times unrelated to the dialogue.
- **Face rig on the GLB path**: mouth morph targets are matched against a
  shared viseme table; a rig with no visemes gets its **jaw** and/or
  **lower lip** driven from the same envelope.
- **Foot planting**: after the mixer seek, a foot below the floor is
  clamped to it and the leg shortened (max 6 cm).
- **Dispatch**: the GLB/Mixamo human is primary, the VRM is the fallback.

### Shots and captions

- New camera rig **`dolly-drift`** — a slow push-in PLUS a drifting
  bearing and a vertical settle. The two-shot now uses it, so consecutive
  frames differ.
- The wide shot is now a **monument** shot aimed at the temple (the
  look-at moved from the character to the temple spine).
- **Caption language**: the shipped Khmer story's `subtitle` field is an
  English gloss; the captions now follow the *script* of the caption
  language, so `--lang km` shows Khmer and `--lang en` shows the gloss.
  A story may override with `subtitleLanguage`.

### Render

- The **GPU path is the default** (`gl: 'angle'` on an auto-detected full
  Chrome/Edge); `--software` selects the software path that
  `verify:determinism` uses as the reference.
- `scripts/preflight.mjs`: free-RAM report, **warning below 4 GB**,
  concurrency selection, and reaping of the headless Chrome processes this
  pipeline started (before and after the render).

## Known remaining defects (Round 4)

1. **The characters are still anime placeholders.** The VRMs are VRoid
   models. No procedural work fixes that — it needs the MPFB/Mixamo assets
   (`docs/CHARACTER_PIPELINE.md`).
2. **The gopura masonry still reads as planks** at close range: one
   texture repeat cannot serve both a 7 m jamb and a 9 m lintel, so two
   repeats are used, but the material still stretches on the long bands.
3. **The moat is thin in the wide shot.** Geometrically correct from a
   4.4 m camera 62 m from the temple, but it reads as a dark line rather
   than water. A higher or closer wide shot would show it.
4. **The face rig on the shipped GLB pack is untested end-to-end** — the
   Quaternius pack has no visemes and no jaw bone, so the jaw path is
   exercised only by unit tests, not by a render.
5. **Foot planting is a contact clamp, not an IK solve.**
6. **The close-up framing is looser than a cinema close-up** (the shot
   tests pin the 40–60 % band measured on a 1.8 m stand-in, and the
   shipped VRM is ~1.6 m).
