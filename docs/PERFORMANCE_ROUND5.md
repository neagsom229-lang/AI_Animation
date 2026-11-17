# Round 5 — Performance & Flexible Pipeline (real measurements)

All numbers below come from commands actually run on this VM (Intel UHD,
16 GB total, ~3.2–4.1 GB free). Nothing is estimated unless marked as such.

## 1. Per-scene render cache (`scripts/render-scenes.mjs`)

Each story scene renders to its own MP4, keyed by a content hash of
`(scene spec + its voice lines + bundle hash + PIPELINE_VERSION)`, then the
scene MP4s are stitched with Remotion's own ffmpeg (`-f concat -c copy`).
Only scenes whose hash changed are re-rendered.

Real run (`node scripts/render-scenes.mjs --story src/stories/khmer-temple.json
--voice public/voice.json --out out/khmer-temple-scenedraft.mp4 --draft`):

- Cold run (3 MISS): k0 95 frames in **29.3 s**, k1 176 frames in **35.4 s**,
  k2 136 frames in **30.7 s** → **~95 s** of rendering.
- Warm run (3 HIT): all 3 scenes reused, stitched in **8.4 s** wall time.
- Verified stitch: `npx remotion ffprobe out/khmer-temple-scenedraft.mp4` →
  13.63 s, 1280x720 @ 29.97 fps, h264 + aac.
- Hash sensitivity verified: editing only scene k2's caption changes k2's
  hash and leaves k0/k1 identical.

Time saved on an unchanged re-render: **~95 s → 8.4 s** (≈91 %).

## 2. Storyboard mode (`node scripts/storyboard.mjs` / `make.mjs --storyboard`)

One low-res still per scene at the dialogue midpoint, a contact sheet, and a
"voice animatic" (stills held for each scene's real audio duration + the real
voice track). Real output in `out/khmer-temple-storyboard/`:

- `storyboard-sheet.png` (3 stills, 480 px cells)
- `storyboard-animatic.mp4` — ffprobe: 12.08 s, 640x360, h264 + aac (24 kHz mono)

Approval can now happen before the expensive 1080p render.

## 3. Pre-flight (`scripts/preflight.mjs`)

When free RAM < 4 GB (the brief's threshold), the report now lists the 5
biggest memory processes. Real output:

```
[Preflight] RAM: 3202 MB free of 16088 MB — BELOW the 4096 MB threshold
[Preflight]  3812  793 MB  Memory Compression
[Preflight] 29852  592 MB  Code
[Preflight] 18208  524 MB  Code
[Preflight] 30028  483 MB  chrome
[Preflight] 22128  437 MB  chrome
```

## 4. Asset optimization — honest status

Commands actually run:

- `npx gltf-transform --version` → **fails**: `npm error code ENOVERSIONS /
  No versions available for gltf-transform`. The CLI and `@gltf-transform/core`
  are NOT installed; `package.json`/lockfile carry no gltf-transform dependency.
  `draco3d` / `meshoptimizer` exist only as transitive deps of `three-stdlib`.
- Parsed the shipped GLBs directly: `casual_male.glb` 824,284 B and
  `casual_female.glb` 832,972 B, generator `glTF-Transform v4.5.1`, with
  **no** `KHR_draco_mesh_compression`, **no** `EXT_meshopt_compression` and no
  KTX2. The historical optimise ran with `--compress false` (CREDITS.md §1).
- `public/textures/` is **24 plain JPGs (~17 MB)** + one HDRI; no `.ktx2`,
  `.basis` or `.webp` anywhere in the repo, and no `KTX2Loader` in source.
- Static geometry is **already merged/instanced**: `AngkorWorld.tsx` uses
  6 `<instancedMesh>` (988 instanced items — colonnade 156, stairs 10, lotus 54,
  grass 620, palms 88, forest 240 — collapsed into 6 draw calls) and 4
  `mergeGeometries` groups (canopy/grass planes, 4 naga rails).
- **No baked AO**: no `aoMap`/`occlusionMap` anywhere (the only "occlusion" hit
  is prose in `camera.ts`). Lighting is ambient + 2 directionals + HDRI + shadows.

### Why KTX2 / meshopt / Draco / baked AO were NOT applied

- Applying KTX2 or meshopt is **not a config toggle**: the renderers would
  need `KTX2Loader` (plus shipped transcoder WASM) and `GLTFLoader.setMeshoptDecoder`.
  That is a loader change that would need a full determinism re-verification and
  could regress the software-GL reference on a machine with ~3 GB free RAM.
- `gltf-transform` is unavailable and installing it (network + lockfile churn)
  is out of scope for a render-only change on this host.
- Baked AO needs an offline bake of every static surface and changes the look —
  every visual change here requires before/after stills, and the Angkor set is
  explicitly "acceptable" this round. Adding AO would put that at risk.
- These are documented as **manual next steps**, not silently faked.

## 5. Draw calls

No runtime draw-call instrumentation exists in the repo (searched
`renderer.info`, `gl.info`, `onAfterRender`, `drawElements` patches — none).
Structural count from the shipped code: ~184 non-instanced meshes + 6 instanced
batches ≈ **190 color-pass draw calls**, plus the cast-shadow pass and HDRI
background. This is a source-derived estimate, not a measured count.

## 6. ms/frame

Current run this round (real output):
`node scripts/make.mjs --story src/stories/khmer-temple.json --lang km --gpu`
→ `[Perf] 407 frames in 60.5s (148.6 ms/frame, gl=angle (GPU))`.

Historical baselines from `docs/QA_REPORT.md`:

- Full 1080p GPU (full Chrome, concurrency 4): **239.4 ms/frame** (407 frames, 97.4 s)
- Full 1080p software: **2581 ms/frame** (17.5 min)
- Draft 720p software: ~1432–2372 ms/frame

So this round's GPU render was **148.6 ms/frame** — faster than the 239.4
ms/frame baseline (~38 % lower), though run-to-run variance on this shared VM
is high (the QA report cites 239.4 ms/frame for the same command). The
motion-amplitude and framing changes alter only bone rotations and camera
numbers — they add no meshes, textures or draw calls — so the ms/frame profile
is unchanged by them. Asset compression (§4) is the lever that would move it,
and it is deferred with reasons above.

## 7. WebGPU spike (isolated — `spikes/webgpu/`)

Isolated, untracked spike — nothing wired into production. Real result:

- Default Remotion `headless-shell`: `navigator.gpu.requestAdapter()` → `null`
  ("No available adapters.") → `three@0.160.1` silently falls back to WebGL2.
- Full Chrome for Testing (`--chrome-mode=chrome-for-testing`, `--headless=new`):
  Intel `gen-12lp` adapter found, WebGPU backend initialises, 4 frames render
  (calls=4, triangles=12). Reproduced reliably.

So WebGPU **works here only with the full Chrome-for-Testing binary**, not with
Remotion's default browser. Integrating it would need custom async `init()`/
`render()` + `delayRender()` handling (Remotion's `<ThreeCanvas>` uses classic
WebGLRenderer). Not made default. Full commands/output in
`spikes/webgpu/README.md`.
