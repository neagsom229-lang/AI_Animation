# Image review checklist — "The Khmer Empire"

Review each generated illustration against this checklist. Only set
`reviewed: true` for a scene in `assets-src/illustrations/manifest.json` when
every applicable box is ticked. The final render refuses unreviewed scenes.

For each scene (01–18), check:

## Clothing
- [ ] Sampot / shoulder cloths are period-appropriate 12th-century Khmer, not modern casual wear.
- [ ] No modern textiles (synthetic prints, zippers, sneakers, wristwatches, sunglasses).
- [ ] Rulers / priests / dancers have distinct, plausible rank dress for the scene.

## Buildings & architecture
- [ ] Temple architecture matches the scene's era (Roluos brick prangs early; Angkor Wat 12th c.; Bayon late 12th c.).
- [ ] Stone construction, corbel arches, prang silhouettes are Khmer, not Thai/Indian/Chinese temples by mistake.
- [ ] Water works (barays, canals, sluices) are earthen/stone, not modern concrete.

## Text & signs
- [ ] No modern signage, banners with legible modern script, or brand logos.
- [ ] Any inscriptions are stylized Khmer/sanskrit-like marks, not readable modern text or Latin letters.

## Modern objects
- [ ] No vehicles, electronics, firearms, plastic, glass bottles, lamps, or power lines.
- [ ] Tools/weapons are period (wood, stone, bronze); no steel modern hardware.

## Wrong temple / continuity
- [ ] The correct temple appears in the correct scene (see prompt + per-scene table in docs/ILLUSTRATED_QA.md).
- [ ] Art style, palette, and key character designs are consistent across all 18 images.
- [ ] Year chips in the story match the scene's depicted event.

## Scene 18 exception
- [ ] Scene 18 is "modern-day": contemporary dress IS allowed, but still no vehicles, signage, electronics, or modern objects (per its prompt).

## Content check (Round 9)
- [ ] **matches narration**: read the scene's Khmer/English narration line; confirm the image actually depicts that event (e.g. scene 11 = Cham war boats + burning city, not a market). Set `matchesNarration: true` in the manifest ONLY when it matches.

## Sign-off
- [ ] Reviewed by: ____________  date: __________  scene id: __________
- [ ] `reviewed: true` set in `assets-src/illustrations/manifest.json` for this scene.
- [ ] `watermarkCheck: true` set after checking the generator tool's terms (never edit an image to hide a mark).
- [ ] `matchesNarration: true` set after the content check above.

Final render requires all three flags plus the string fields (tool/date/prompt/licenseTermsUrl) and a source width >= 1600 px. Duplicates (exact or near) block the final render regardless of flags.
