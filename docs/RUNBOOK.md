# Runbook — Kuanimation Studio (one page)

## Film factory (one CLI — preferred)

```powershell
node scripts/film.mjs status              # dashboard + wrong-folder + cost + verdict
node scripts/film.mjs status --strict     # exit 1 if not releasable
node scripts/film.mjs ingest --force      # copy inbox images -> normalized + manifest (force = provisional license)
node scripts/film.mjs depth               # depth.py (gradient if model unavailable)
node scripts/film.mjs voice               # edge-tts narration
node scripts/film.mjs preview             # contact sheet + animatic from REAL images
node scripts/film.mjs render --draft      # scene-cached render, resume from build/state.json
node scripts/film.mjs publish             # stamped publish pack in out/publish/<story>/
node scripts/film.mjs qa                  # 9 gates
node scripts/film.mjs all --draft         # whole chain
node scripts/film.mjs watch               # watch inbox + story, debounce, partial rebuild
node scripts/film.mjs clean               # remove build/ (regenerable)
```

Flags: `--story <path> --only scene=N --profile draft|final --force --draft --strict --verbose --allow-missing`.
Ingest/doctor cache ffprobe + perceptual hashes in `build/cache/probe-cache.json`
keyed by (path, mtime, size) with the sha256 stored; a second run over unchanged
images does no probe work and prints the measured speedup.
Config: `film.config.json` (validated at start). State/logs/previews: `build/`.
Drop images into `assets-src/inbox/`, NEVER into `out/` or `build/` — `film status`
prints the exact fix commands if you do. See `docs/ARCHITECTURE_FACTORY.md`.

## Daily build (illustrated film, legacy direct scripts)

```powershell
cd D:\General\Animation\kuanimation-skill
node scripts/preflight.mjs              # RAM free? stale Chrome to reap?
node scripts/illustrated-manifest.mjs   # assets present + reviewed:true?
npm run qa                              # tsc + tests + determinism + gates
node scripts/make.mjs --story src/stories/khmer-empire.json --style illustrated --min-duration 120
```

Outputs: `out/publish/khmer-empire/` (masters, SRT, cover, chapters, checksums,
manifest.json). QA sheets: `out/review/`.

## Gates (a render refuses to proceed if these fail)
- Missing illustration / depth / music / clip without `--allow-missing`.
- Any scene with `reviewed !== true` in `assets-src/illustrations/manifest.json`.
- Manifest fields `tool`, `date`, `prompt`, `licenseTermsUrl` empty.
- Film shorter than `--min-duration` (default 120 s).
- `npm run qa` failing (types, tests, determinism, licenses, caption safe area).

## Recovery / crash / OOM
- Per-scene MP4s are cached in `out/.illustrated-scene-cache/` by content hash;
  a re-run skips finished scenes (resume). A state file records progress.
- Stale Remotion Chrome processes are reaped by preflight (`--kill`) and after
  each render. Free RAM < 4 GB → concurrency drops to 2 automatically.
- `out/` is gitignored; deleting it forces a cold render.

## Verification
- `npm run qa` runs all gates (see package.json).
- `node scripts/verify-determinism.mjs --composition StoryFilm`
- `node scripts/verify-determinism.mjs --composition IllustratedFilm`

## Asset intake
1. Generate images from `docs/ILLUSTRATION_PROMPTS.md` (style line verbatim).
2. `node scripts/intake-illustrations.mjs <folder>` → normalized PNGs + manifest.
3. Review each against `docs/IMAGE_REVIEW_CHECKLIST.md`; set `reviewed: true`.
4. `python scripts/depth.py --story src/stories/khmer-empire.json --depth model`.

## Environment
- **ONE env:** `.venv-depth` (Python 3.11/3.12) with torch, transformers,
  pillow, numpy and edge-tts. `node scripts/film.mjs setup` creates it and
  verifies every import; `node scripts/film.mjs doctor` checks it first.
- The legacy `.venv` is deprecated: scripts warn if it exists but never use it
  (nothing is deleted).
- `node scripts/doctor.mjs` (live edge-tts call; Azure call if env keys present).
- Azure TTS (optional): set `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` in the
  environment only — never commit them (`tests` + `check_secrets.py` enforce).

## Licensing
Read `THIRD_PARTY_LICENSES.md` (quoted lines). Remotion = two-tier Free/Company
license; edge-tts = LGPLv3; both flagged for the rights-holder. All shipped
assets must be CC0/CC-BY/MIT/Apache/BSD/SIL OFL and logged in `CREDITS.md`.
