# Film Factory — architecture

One CLI (`node scripts/film.mjs`), declarative stage graph, explicit layout.

## Layout (what goes where)

```
assets-src/
  inbox/            <- DROP ZONE (user drops scene images here)
    map.json        <- optional {"3":"my-dawn.png"} for filenames with no digits
    _originals/     <- untouched copies of every dropped file
  illustrations/    <- NORMALIZED scene-XX.png + manifest.json (review gate)
  music/            <- ambient.mp3 + sfx-*.mp3
  clips/            <- optional image-to-video mp4
build/              <- GITIGNORED: cache/, state.json, logs/, preview/
out/publish/<story>/<- FINAL deliverables only (masters, SRT, cover, checksums, manifest)
```

**Critical:** `out/` and `build/` are OUTPUT folders. Images dropped there are
mistaken for inputs. `film status` detects source-looking `scene*.png` files in
those folders and prints the exact `Copy-Item … ; node scripts/film.mjs ingest`
commands. Never ingest from an output folder directly.

## Diagram

```
  inbox/scene-1.png ──ingest──> illustrations/scene-01.png + manifest.json
        │                              │
        │ (originals kept)             ├──depth──> scene-01-depth.png + parallax metrics
        │                              │
        └──────────────────────────────┼──voice──> voice-<story>.json (real durations)
                                       │
                                       ├──preview─> build/preview/contact.png (+ embedded input hash)
                                       │
                                       ├──render──> out/<story>.mp4 (scene cache + resume)
                                       │
                                       └──publish─> out/publish/<story>/ (+ stamped manifest)

  watch: inbox/story.json -> debounce -> ingest -> depth -> preview (affected scenes only)
```

## Stage contracts (wrap, don't rewrite)

| Stage | Wraps | Inputs | Outputs | Hash inputs |
|---|---|---|---|---|
| ingest | `intake-illustrations.mjs` | inbox files, map.json, config | illustrations/*.png, manifest.json | file bytes + config + story |
| depth | `depth.py` | illustrations/*.png | *-depth.png, parallax-metrics.json | image bytes + depth mode |
| voice | `generate-voice.py` | story, config.tts | voice-<story>.json | story + provider/rate |
| preview | Remotion stills + `tileContactSheet` | illustrations, voice | build/preview/contact.png | image+story bytes |
| render | `make.mjs --style illustrated` | all above | out/<story>.mp4 | content hashes |
| publish | `publish-pack.mjs` | master + voice | out/publish/<story>/* | master bytes + stamp |

Each stage declares `inputs`, `outputs`, `content hash`; `film-graph.mjs` skips
when unchanged, rebuilds per scene (`--only scene=N`), checkpoints `build/state.json`
after every scene, and writes a per-run log in `build/logs/`. `--force` ignores the
cache. A crash leaves the state file; the next run resumes from the last finished scene.

## Failure modes & exact fixes

| Symptom | Cause | Fix printed by the tool |
|---|---|---|
| images in `out/` or `build/` | outputs mistaken for inputs | `Copy-Item '…' 'assets-src/inbox/…' ; node scripts/film.mjs ingest` |
| ingest: empty licenseTermsUrl | license not logged | set `intake.licenseTermsUrl` in film.config.json (or `--force` provisional) |
| quality gate warnings | <1920x1080, aspect, alpha | normalization runs; quality unverified — supply larger source images |
| watermark checklist | generator marks present | check the tool's terms; **never edit images to hide marks**; set `reviewed:true` only after check |
| stale preview sheet | inputs changed since sheet built | `node scripts/film.mjs preview` |
| `film status --strict` exit 1 | not releasable | fix each REASON line |
| config invalid | bad film.config.json | edit the named key |
| OOM / crash | low RAM | preflight drops concurrency; resume from build/state.json |
| world3d >25% duration | cost guard | reduce world3d scenes or accept the warning |

## Determinism & licenses

Software GL is the determinism reference (`npm run verify:determinism`). No
`useFrame`, wall-clock, or unseeded `Math.random`. Licenses are quoted from
installed files in `THIRD_PARTY_LICENSES.md`; Remotion (two-tier) and edge-tts
(LGPLv3) are flagged outside the permissive allow-list, never silently accepted.
