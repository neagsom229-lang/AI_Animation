# Art Direction — "Angkor: Water is Life" (Phase 1 spec)

Status: binding reference for Phases 2–5. Every material, light, and shot in the
film must trace back to a decision here. If something on screen disagrees with
this document, the screen is wrong.

The film is a **semi-realistic Khmer-empire explainer**, not a toy diorama.
Reference: early-morning Ta Prohm / Angkor Wat documentary photography — wet
sandstone, moss creeping into pediments, jungle pressing against the walls,
mountains lost in haze.

## 1. Palette (warm but desaturated)

| Role | Colour | Hex | Note |
|---|---|---|---|
| Sky zenith (dawn) | pale gold-blue | `#b9c4c8` | grey-warm, never baby-blue |
| Sky horizon glow | muted amber | `#e0c49a` | desaturated, no neon orange |
| Sandstone (body) | grey-brown | `#8a7a5f` | base `old_stone_wall`/`sandstone` texture, tinted |
| Sandstone (shade) | deep umber | `#4e4436` | AO crevices, never pure black |
| Moss / lichen | desaturated green | `#57684a` | caps of wall courses, pediment feet |
| Tropical foliage (canopy) | deep monsoon green | `#2e4530` | dominant third of every frame |
| Tropical foliage (sunlit) | yellow-green wash | `#77895a` | only where sun catches edges |
| Water | green-grey mirror | `#3d4a44` | reflective, picks up sky amber |
| Ground (laterite/dust) | warm grey-tan | `#7d6f58` | never tan-desert crack plates |
| Skin / fabric | muted earth tones | — | characters: warm browns, desaturated teal/ochre |
| Subtitles | near-black on 70% plate | — | unchanged (Phase D) |

Nothing in the frame may exceed ~80% saturation except the sun itself, which
must read as a soft disc inside haze, never a white flash.

## 2. Light and atmosphere

- **Golden hour bias.** Sun low (15–25° elevation), warm `#ffd9a8` key at ~1.6
  intensity with soft shadows (large penumbra, `normalBias` ~0.03), cool
  blue-grey bounce fill ~0.35. No top-down noon light anywhere.
- **Long soft shadows** rake from the temple across the causeway; shadow camera
  fits the full set (one directional light, tuned frustum).
- **Hazy depth**: exponential fog `0.011–0.014`; distant forest/temple tiers
  visibly melt into amber-grey. Water and mist planes add a second haze layer.
- **Ground mist**: thin, slow, additive noise planes just above the ground and
  the moat — present in every exterior shot, animated purely by frame index.
- **No blown highlights**: glow sprite max opacity 0.18, hue `#ffdfae`; the HDRI
  stays `qwantani_sunset_puresky` (CC0) but its exposure is reduced via tone
  mapping; the sun is a soft disc.
- **Birds**: 5–7 seeded dark sprites crossing the sky on wides only (frame-driven
  paths, no wing animation frames — silhouettes).

## 3. Materials (all PBR, one pipeline)

- Sandstone: Poly Haven CC0 textures, 1k–2k, albedo+normal+rough — e.g. a
  sandstone wall set + a rock/moss overlay. Sandstone gets a procedural
  **bas-relief normal band** along galleries (canvas-generated normal stripes/
  figures, bump-style), and per-instance colour jitter (instance colour) for
  weathering.
- Water: metallic/roughness ~0.02–0.1, envmap reflection, slight normal ripple
  (seeded canvas normal), 82% opacity over a dark bed.
- Vegetation: instanced low-poly canopy (billboard crosses with seeded alpha
  texture, 3 variants), dark green with rim-sun variation; trunks instanced
  cylinders. No saturated plastic greens.
- Characters: semi-realistic — see Phase 3 (MPFB Meshroom-style materials if
  supplied; otherwise current VRMs, consciously kept as placeholders).

**Banned on sight**: Kenney pastel castles/nature kits (they are gone after
Phase 2), flat-white "architectural model" props, cracked-tan crack plates as
the entire floor, cartoon outline shading, mint-teal saturated plastics.

## 4. Colour script per scene

| Scene | Story beat | Time | Key light | Sky/fog | Notes |
|---|---|---|---|---|---|
| k1 (khmer-temple, frames 0–~177) | "First light over temple spires" | **Dawn** | low warm sun `#ffd9a8`, long violet-amber shadows | zenith `#aebfc6` → horizon `#e8c9a0`, fog `#d9c3a3` density 0.013 | sunrise backlight rim on prangs; mist thick on the moat; birds |
| k2 (frames ~178–311) | "Water is life" | **Morning/late-morning** | sun a bit higher `#ffe3b4`, shadows still long but shorter | zenith `#b9c9cd` → horizon `#e3cfae`, fog 0.012 | water glints on the moat; talk shots stay warm |
| (reference) k3-style dusk beat, not in this story | water ceremony | **Dusk** | deep amber `#ffc98a` at ~8°, purple ambient `#6b5f6e` | ember horizon `#d8a86e` → `#5d5666` zenith, fog 0.014 | reserved for the next story; keep out of k1/k2 |

The two shipped scenes are dawn and morning. Both share the same palette family:
warm golds over grey-browns, muted greens — never daylight-clean, never night.

## 5. Composition and camera feel

- Lens ~35–40 mm equivalent (45° fov reads 35-ish; keep). Medium shots at eye
  level, 3/4 front for the speaker, eye-line to the listener; wides only as
  establishing shots ≤ 2.5 s in motion (crane/dolly drift + living set).
- Characters 45–65% of frame height in talk shots (medium already satisfies
  this — verify per shot).
- Gentle DoF on wides only (existing split-focus approach, keep, soften).
- Title-safe captions unchanged; the lower caption plate sits inside the 90%
  margin.

## 6. Coherence test (what "done" looks like)

Cover any frame and check in this order: (1) is there haze between the camera
and the furthest tower? (2) is the stone desaturated grey-brown with darker
crevices and green at the feet? (3) do the leaves have at least two tones?
(4) does the water mirror the sky? (5) is the sun a soft source, not a light
bulb? If any answer is no, the frame is not done — regardless of subject.
