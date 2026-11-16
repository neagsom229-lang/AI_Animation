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
