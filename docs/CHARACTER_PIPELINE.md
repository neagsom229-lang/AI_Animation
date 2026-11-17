# Character Pipeline — semi-realistic MPFB characters + Mixamo motion (Phase 3a)

Status: **still blocked on assets.** `assets-src/characters/` does not exist
(re-checked 2026-11-17 — only `kenney/`, `polyhaven/`, `quaternius/`, `vrm/`
staging folders are present). The shipped VRMs are still **anime placeholders**
(the Round-4 motion measurement confirmed it: they read as VRoid dolls, not
humans). Everything below therefore describes the pipeline that is *ready to
consume* the assets the moment they land, plus the procedural work that has
been done in the meantime.

Target rig vocabulary (matches the film's needs): `Idle`, `Talk`, `Gesture`,
`Walk` clips; skeleton retargetable to a humanoid GLB; visemes **or** a jaw
bone for envelope lip-sync; 1.65–1.75 m tall; ≤ 5 MB per character GLB.

## The dispatch order (Round 4)

`remotion/compositions/StoryFilm.tsx` resolves a character in this order:

1. `modelUrl` — the **GLB / Mixamo human** (primary). This is the path with
   the face rig (viseme morphs, or a jaw + lower-lip bone), the
   Idle/Talk/Gesture/Walk clip blend and the foot-planting pass.
2. `vrmUrl` — the **VRM** (fallback). Expression rig, seeded blink, gaze
   saccades, procedural body layer.
3. neither — the legacy anima3d rig.

The shipped Khmer story therefore points at the **VRM**: the only GLBs in
the repo are the Quaternius placeholder pack, which has **no face rig at
all** (no visemes, no jaw bone — see CREDITS.md), so switching the story to
them would silently drop the film's lip-sync. The VRM is the fallback
because there is no face-rigged human yet; the moment the MPFB/Mixamo
character lands, the story gains a `modelUrl` and the GLB path wins
automatically with no code change.

The loader is no longer "GLB = walk cycle". `remotion/compositions/GlbCharacter.tsx`
now handles a full Mixamo-rigged human:

| feature | how it works | file |
|---|---|---|
| clip blending | `resolveClip()` picks the best clip the model ACTUALLY ships from the preferred list (`talk → Talk, Gesture, Idle`); `clipWeights()` cross-fades Idle↔Talk↔Gesture↔Walk over 0.4 s; `mixer.setTime(frame/fps)` stays the only clock | `remotion/lib/character-anim.ts` |
| face rig — morphs | mouth morph targets are matched against the shared viseme table (`viseme_aa`, `mouth_ih`, `v_ee`, `A`, `I`, `U`, `E`, `O`, …) and driven by the 20 Hz envelope | `visemeFromMorphName()`, `lipSyncVisemes()` |
| face rig — no morphs | a **jaw** bone (`jaw`/`lowerJaw`/`mandible`) and/or a **lower lip** bone (`lowerLip`/`chin`) are rotated from the same envelope; the mouth closes exactly when the voice stops | `GlbCharacter.tsx` |
| weight shift | the hips roll onto the supporting foot, the spine and chest counter-rotate, the free knee softens | `weightShift()` in `remotion/lib/vrm-anim.ts` |
| foot planting | after the mixer seek, a foot that sinks below the floor is clamped to it and the leg is shortened to compensate (max 6 cm) | `remotion/lib/foot-plant.ts` |

The VRM path (`remotion/compositions/VrmCharacter.tsx`) uses the same
functions, so the two rigs cannot drift apart.

## What the code already does with a Mixamo/GLB human (Round 4)

**Still missing even with Mixamo assets:** a real two-bone IK solve. The
current foot planting is a contact clamp (it removes the slide and the sink,
which is what reads at 24 fps) — a proper IK pass over the hip/ankle is the
upgrade path.

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

   The names matter: `remotion/lib/character-anim.ts` resolves clips by name
   (`PREFERRED_CLIP`), case-insensitively, and falls back to the next name in
   the list when a clip is missing. A rig that ships `Idle`, `Talk` and
   `Walk` works today; `Gesture` is optional.
5. **Face rig.** Either keep the MPFB mouth shape keys (they export as glTF
   morph targets) or make sure the armature has a `Jaw` bone. The loader
   matches `jaw`/`lowerJaw`/`mandible` for the jaw and
   `lowerLip`/`chin`/`lowerLipCorner` for the lower lip, and matches morph
   target names against the viseme table.
6. Drop the results at:

   ```
   assets-src/characters/reach-animated.glb       (≤ 5 MB)
   assets-src/characters/minea-animated.glb       (≤ 5 MB)
   ```

### 3b. Foot planting for the baked walk clip

The baked `Walk` clip still needs the contact pass, because a retargeted
Mixamo walk carries the source rig's slide:

1. In Blender, mark the foot contacts (the frames where the foot is flat and
   the hip is above it) — the usual walk-cycle contact/passing/lift keys.
2. Bake the clip with those keys intact (do NOT "fix" the slide by hand —
   the code clamps the foot to the floor and shortens the leg, so a
   hand-fixed clip double-corrects).
3. After import, `remotion/lib/foot-plant.ts` clamps the foot to the floor
   plane of the character's mark and compensates the leg by at most 6 cm.
   If a clip needs more than that, the source contact keys were not
   preserved — fix the bake, not the clamp.

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
  **Round 4**: the weight shift rolls the hips onto the supporting foot, the
  spine and chest counter-rotate above it, and the free knee softens.
- **Round 4**: the gesture layer is now timed by the VOICE — the 20 Hz
  envelope's local maxima are the stressed syllables, and the hand lifts on
  each one (`speechPeaks()` / `speechPeakGesture()`). The old seeded
  schedule fired at times unrelated to the dialogue, which is why the hands
  looked disconnected from the speech.
- `mixer.setTime(frame / fps)` rule, FK-verified never-T-pose, character scale
  constants, walk action, foot planting (contact clamp — see above).

## Round-4 measurement (why this pipeline still matters)

Measured with `node scripts/motion-proof.mjs --scene k2 --shot close-up`
(8 frames, every 3rd frame; the mean visible-change fraction of the
head / torso / arm regions, background subtracted):

| | head | torso | arm |
|---|---|---|---|
| before Round 4 | 26.1 % | 13.0 % | 11.2 % |
| after Round 4 | **37.0 %** | **24.1 %** | **18.4 %** |

The head was always alive (it carries the lip-sync and the gaze). The torso
and the arms were close to static — that is what "procedural/stiff" meant.
They are now roughly twice as alive, and they are alive *with the voice*.
They are still not alive like a human: the underlying VRM is an anime
placeholder, and no amount of procedural motion fixes the asset.

