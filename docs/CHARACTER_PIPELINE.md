# Character Pipeline — semi-realistic MPFB characters + Mixamo motion (Phase 3a)

Status: **blocked on assets.** `assets-src/characters/` does not exist (checked
2026-11-16 — only `kenney/`, `polyhaven/`, `quaternius/`, `vrm/` staging
folders are present). Current VRMs are GOOD ENOUGH to hold the frame as
placeholders (wired, licensed, lip-synced), but they are not the semi-realistic
humans this film needs. Once you supply the assets below, the work is ~1 day.

Target rig vocabulary (matches the film's needs): `Idle`, `Talk`, `Gesture`,
`Walk` clips; skeleton retargetable to a humanoid GLB; visemes **or** a jaw
bone for envelope lip-sync; 1.65–1.75 m tall; ≤ 5 MB per character GLB.

## Step 1 — Blender + MPFB (MakeHuman Plugin For Blender, CC0)

1. Install **Blender 4.x** (https://www.blender.org/download/ — free).
2. Install **MPFB**: in Blender → Edit → Preferences → Get Extensions → search
   "MakeHuman" / "MPFB" (or grab the zip from
   https://github.com/makehumancommunity/mpfb2 — CC0). Restart Blender.
3. Create two humans (the cast):
   - `reach` — male character, role: young sculptor/guide (Angkor-era Khmer
     dress if you want verisimilitude: MPFB has Asian phenotype presets;
     clothing from MPFB's CC0 library — bare `shirtless` + a sampot/sinh-like
     wrap would be ideal; a simple tunic works too).
   - `minea` — female character, role: researcher (modern field clothes fine).
4. Per character set, in the N-panel (MPFB): Age ≈ 24–30, Height **1.70 m**
   (reach) / **1.66 m** (minea), skin tones varied, hair from MPFB CC0 assets
   or Blender's hair particles (baked to mesh on export).
5. **Bake materials**: MPFB → Material → setup MB-Lab/MPFB skin materials
   (they export cleanly to glTF: baseColor/normal/roughness — all CC0).
6. Export each as **GLB** (File → Export → glTF Binary .glb):
   - Format: glTF Binary, `+Y up`,
   - Include: **Skinning** ✓, **Shape Keys** ✓ (keeps the face viseme morphs),
   - Morph targets: keep (head/face shapes incl. mouth visemes if present).
7. Put the two files here (repo-relative):

   ```
   assets-src/characters/reach.glb
   assets-src/characters/minea.glb
   ```

   Budget: ≤ 5 MB each after export (decimate hair/fur if needed) — check
   with `Get-Item *.glb | Select-Object Length`.

## Step 2 — Mixamo clips

Mixamo (https://www.mixamo.com/, Adobe account, free):

1. Upload `reach.glb` as FBX (export FBX from MPFB/Blender first, or upload the
   GLB converted via Blender: File → Export → FBX). Use **automatic rigging**.
2. Once rigged, grab these clips per character (search the library):
   - `Idle` → e.g. "Breathing Idle" or "Standing Idle"
   - `Talk` → e.g. "Talking" / "Standing Talk" / "Explaining"
   - `Gesture` → e.g. "Standing Gesture" / "Talking With Hands"
   - `Walk` → "Walking" (or "Casual Walk")
3. Download each **twice**:
   - "Without Skin" (animation only FBX) — what we retarget;
   - "With Skin" (once, for the base) — optional.
4. Save into the repo as:

   ```
   assets-src/characters/clips/reach_idle.fbx
   assets-src/characters/clips/reach_talk.fbx
   assets-src/characters/clips/reach_gesture.fbx
   assets-src/characters/clips/reach_walk.fbx
   assets-src/characters/clips/minea_*.fbx            (if different clips)
   ```

   (If you reuse the same four clips for both cast members, one set is fine;
   name them `shared_idle.fbx` … and tell me.)

## Step 3 — Retarget + bake (in Blender)

1. Import `reach.glb` (File → Import → glTF Binary).
2. Import the four clip FBXs into the same scene (File → Import → FBX).
3. On the MPFB armature, for each clip:
   - map bones by semantic role (Hips→hips, Spine→spine, Spine1→chest,
     Spine2→upper chest, Neck→neck, Head→head, shoulders/arms/hands, legs/
     feet) — ~30 constraints or use the community "Mixamo → Humanoid" bone
     map (there are several free Blender plugins and rigify presets; do NOT
     buy Auto-Rig Pro just for this — the free paths work),
   - **Bake**: Pose → Animation → Bake Action (visual keying ✓, 0.05 step or
     every frame),
   - delete the constraint rig, keep one clean armature per character.
4. Rename actions to `Idle`, `Talk`, `Gesture`, `Walk` (NLA strips) and export
   a **single GLB per character with all four clips** (glTF export → Include
   animations ✓, "Always sample animations" ✓).
5. Drop the results at:

   ```
   assets-src/characters/reach-animated.glb       (≤ 5 MB)
   assets-src/characters/minea-animated.glb       (≤ 5 MB)
   ```

## Step 4 — Tell me

One message with the file list is enough. Then I will:

- point the story `modelUrl` at the new GLBs (VRMs stay as documented fallback),
- drive `AnimationMixer.setTime(frame / fps)` (frame-pure, never clock-driven —
  already how the GLB path works),
- cross-fade Idle↔Talk↔Gesture weights, weight-shift idle already in the code,
- blink (seeded, 3–5 s) and saccades (already implemented) unchanged,
- lip-sync: if the mesh keeps viseme shape keys (MPFB keeps face targets),
  drive `A I U E O` from the 20 Hz envelope (and Rhubarb cues if you run a
  pass over the audio); **otherwise** drive the MPFB **jaw bone** with the
  same envelope — that is the documented fallback the brief allows,
- verify no T-pose at any sampled frame, scale figures to 1.65–1.75 m
  (measure `head_top - feet` from the rig),
- keep mixer playback strictly `setTime(frame/fps)`.

## Licensing notes (read before substituting anything)

- **MPFB** assets are CC0 (MakeHuman community dedicates them to CC0) — safest
  choice, no attribution needed. Blender is GPL (a tool, not shipped).
- **Mixamo** is a *royalty-free grant for use in your projects*, **not** CC0
  and **not** redistributable as raw assets. Using the baked animations inside
  this film (rendered video) is the intended use. The repo, however, would
  carry the baked GLBs — that is standard practice but **is not the same as
  raw redistribution**. If you would rather avoid any ambiguity: skip Mixamo,
  animate Idle/Talk/Gesture/Walk manually in Blender (or reuse the film's
  existing procedural Talk/Gesture layer, which needs no clips at all — it
  already cross-fades and never T-poses).
- Whatever you choose, the files get registered in **CREDITS.md** with their
  exact license text — `tests/credits-license.test.js` will fail the build if
  anything non-commercial/share-alike/no-derivatives appears in a License cell.

## What is already in place (no asset required)

- Frame-pure facial animation for the VRM fallback: seeded blink, gaze
  saccades, breathing, head sway, envelope lip-sync — all pure functions of
  `useCurrentFrame()`.
- Cross-faded procedural Talk/Gesture body layer with weight-shift idle.
- `mixer.setTime(frame / fps)` rule, FK-verified never-T-pose, character scale
  constants, walk action (no foot-slide guarantee — walk is unused by the
  current story; foot-planting would need an IK pass once real assets land).
