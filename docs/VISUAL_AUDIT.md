# Visual Audit — current output (Phase 0)

Date: 2026-11-16. Inputs: stills rendered at frames 0, 62, 124, 187, 249, 311
of `khmer-temple` (out/khmer-temple-audit-f<N>.png). Camera math from
`remotion/lib/camera.ts` `getShotPose`; image pixel checks with
`scripts/crop-zoom.mjs`. No code was changed for this phase.

## Per-frame facts

| Frame | Shot (rig) | Cam pos (m) | Dist | 1.7 m figure as % of frame height | Face visible? |
|---|---|---|---|---|---|
| 0 | wide (dolly) | [0.00, 2.55, 12.98] | 13.23 | ~15.5% | No — both seen from a 3/4 **back** angle |
| 62 | wide (dolly) | [0.00, 2.55, 12.65] | 12.90 | ~15.9% | No — backs, slightly drifted in |
| 124 | wide (dolly) | [0.00, 2.55, 11.22] | 11.51 | ~17.8% | No — backs, closest approach of the dolly |
| 187 | medium (orbit) | [-1.52, 1.65, 3.70] | 4.33 | ~47% | Listener: **back** filling left third; speaker: 3/4 front, face visible |
| 249 | medium (orbit) | [0.23, 1.65, 3.99] | 4.33 | ~47% | Speaker: 3/4 front ✓; listener: back-left profile |
| 311 | medium (orbit) | [1.56, 1.65, 3.68] | 4.33 | ~47% | Speaker: ~3/4, turned toward listener; listener: profile from behind |

Figure heights are geometry-derived (fov 45°); visual spot-checks of crops agree within ~2 px.

## What looks wrong, per frame (and likely cause in code)

**f0 (wide, k1 opening)**
- Single tower, not Angkor Wat: `remotion/lib/set-dressing.ts` `khmerTemple()` stacks one 5-piece tower; Kenney "castle" kit pastel-peach walls with no gallery tiers, no moat, no causeway, no gopuras, one road-block of walls.
- Cracked desert ground: `dry_ground_01` (tan) tiled 150× over 600 m plane, cracks dominate; zero vegetation.
- White box props ("arches", "cubes", "ruins"): pale Kenney pieces whose albedo already reads off-palette; nothing anchors them.
- Toy palms (mint-green, rounded canopy): Kenney nature palms — stylistically cartoonish against PBR ground.
- Blown-out sun glow: `SunGlow` additive sprite (`opacity 0.35`) + HDRI sun + `qwantani_sunset` → a nuclear disc behind the tower.
- Characters are 16% of frame height and read as figurines; no face visible at all.
- Visible white dust dots in the sky (additive motes) — reads as compression snow.

**f62 / f124 (wide, mid/late k1)**
- Composition is nearly identical to f0 — the dolly only changes distance (13.2 → 12.9 → 11.5 m) with no azimuth drift, no parallax, no environmental change; nothing moves except a ~4% scale delta.
- Same set/glow/ground defects as f0. Dolly end state (f124) still frames the pair from behind.

**f187 (medium, k2 opening)**
- The listener's back fills the left third at the same scale as the speaker — the shot frames the wrong subject; the face that matters (reach, speaking) is ~28% of frame height.
- White arch prop directly behind the speaker's head; pastel palace behind; cracked desert floor; mint palms.
- Speaker's eyes finally visible but the MToon face reads glossy-doll vs the PBR stone (material model mismatch, see Phase 3).

**f249 / f311 (medium, k2 mid/end)**
- Orbit sweep works mechanically (camera travels left→center→right, verified by the positions above) but the background is static desert — no parallax layers, no mist, no water.
- Same pastel/white-box/cracked-ground defects; characters still read toy-like against the PBR ground.

**Cross-cutting**
- The five-second shot list (wide dolly with no arc, one medium orbit) cannot breathe: no camera height change, no water/mist motion, identical framing start-to-end in k1.
- Face visibility rule ("never only the back") is violated in every wide frame and at f187 by the listener's back.
- Light: one sun + HDRI with a blown highlight band; no long soft shadows (sun too high-behind); no ground mist; no tropical greenery anywhere (it is literally a desert).

## Likely causes (code)

| Defect | Code site |
|---|---|
| Single pastel tower, castle-kit temple | `remotion/lib/set-dressing.ts` `khmerTemple()`; `SceneWorld.tsx` renders it with the Kenney GLBs |
| Desert ground | `SceneWorld.tsx` `Ground` — `dry_ground_01` × 150 repeat |
| White boxes / toy palms | Kenney `kenney-castle-*.glb`, `kenney-nature-*.glb` (pastel/mint albedos) in `set-dressing.ts` |
| Blown glow | `SceneWorld.tsx` `SunGlow` (opacity 0.35, additive) + HDRI |
| Backs to camera in wide | `camera.ts` wide azimuth 0 + dolly; `SPEAKER_YAW` faces the listener mark; no shot sets a face-forward bearing for the listener-facing pair |
| Near-identical wide frames | `getShotPose('wide','dolly')` only scales distance (11 m × 1.18 → 1.0); no arc, no crane, no animated set motion |
| Figures at 16% frame height | wide distance 11 m and 45° fov — by design was "establishing", but it is never escaped |
| No face → no eye-line | same blocking |


---

# Visual Audit — Round 4 (2026-11-17)

Method: `node scripts/motion-proof.mjs` renders 8 consecutive frames
(every 3rd frame) of a scene, projects the speaker's head / torso / arm
regions into screen space using the composition's own camera maths
(`remotion/lib/camera.ts` + forward kinematics on the shipped VRM), and
prints the pixel difference per region. The shot and the rig can be
overridden on the *input story* without touching a source file, so the same
character rig, the same line and the same audio can be measured at two
framings.

Two numbers per region:

- **mean diff** — mean absolute per-channel difference, minus the measured
  background drift (camera motion). Scale-DEPENDENT: a 10 px-tall region
  turns a one-pixel shift into a 30/255 mean.
- **visible-change fraction** — the share of the region's pixels whose
  max-channel delta exceeds 8/255. Much closer to scale-independent, and
  the number to quote.

## The round-4 findings (before -> after)

Close-up, scene `k2`, speaker `reach` (Vivi.vrm), 8 frames from f301 to
f322, background subtracted:

| region | mean diff before | mean diff after | changed % before | changed % after |
|---|---|---|---|---|
| head | 11.605 | **17.280** | 26.1 % | **37.0 %** |
| torso | 3.437 | **7.221** | 13.0 % | **24.1 %** |
| arm | 2.587 | **5.148** | 11.2 % | **18.4 %** |

Wide, same scene, same frames (framing changed — see below):

| region | changed % before | changed % after |
|---|---|---|
| head | 55.1 % | 86.2 % |
| torso | 45.0 % | 81.5 % |
| arm | 38.7 % | 70.6 % |

**Stated plainly:** before Round 4 the character *did* move, but almost all
of it was in the head (the lip-sync and the gaze). The torso and the arms
were close to static — that is what "procedural/stiff" meant, and it is
confirmed by the numbers, not by impression. After Round 4 the torso and the
arms are roughly twice as alive and the gesture is timed by the voice.

The wide-shot numbers are **not** comparable with the close-up numbers: the
figure occupies 8x10 px in the new wide framing (a monument shot 62 m from
the temple) against 16x23 px in the old one, so the mean-diff metric
inflates. The visible-change fraction is the comparable figure, and it says
the same thing: the character is changing in every framing, it is simply
too small to read as motion in the wide.

## What the frames showed

1. **The characters are anime placeholders.** Confirmed by eye and by
   measurement: VRoid-style models with large eyes and stylised hair. No
   procedural work fixes that — it needs the MPFB/Mixamo assets
   (`docs/CHARACTER_PIPELINE.md`).
2. **The temple read as a brown pyramid.** The central prang was only 1.875x
   the corner prangs and the galleries were solid boxes with the colonnade
   hidden inside them. Now: 3.000x exactly, colonnades in front of a
   shadowed gallery, cornice bands on the prang shaft, and the whole set
   sized from a 1.70 m human (4.2 m gallery, 37.5 m apex).
3. **The ground was brick-red.** Now dry earth + instanced grass tufts.
4. **The moat was invisible** — it was buried under a ground plane that
   covered it. The ground is now four pieces with the moat cut out of it.
5. **The cone trees** are now sugar palms with a dense forest line behind
   the monument.
6. **The doorway** was a flat grey rectangle; it is now a real recess with
   jambs, a lintel slab, flanking columns and a dark interior.
7. **The naga balustrade** was a row of spikes; it is now a continuous
   serpent rail on a stone plinth, terminated by 5 hooded heads per side.
8. **The captions were English under Khmer narration.** The shipped Khmer
   story's `subtitle` field is an English gloss. The caption text is now
   resolved by the SCRIPT of the caption language.

## Measurement artefacts worth knowing

- The first arm measurement (0.955 mean diff) was taken with an arm box
  that landed on the background: a VRoid with the arms down hangs them
  against the body, so an arm region must be cut from the *posed* stance
  (forward kinematics on `IDLE_POSE`), not from the rest pose. The
  `before` numbers above use the corrected boxes, so they are comparable
  with the `after` numbers.
- The wide shot's DoF mask used to blur the upper half of the frame — i.e.
  the temple — into mush. The mask now keeps the subject sharp.
