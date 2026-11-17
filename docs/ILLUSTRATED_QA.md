# Illustrated film — Phase 5 QA (honest, observation-only)

Artifacts inspected (all rendered with **mock voice + `--allow-missing`** because
no illustrations / real voice are present on this branch yet):

- `out/khmer-empire-draft.mp4` — 18-scene draft film, 143.8 s, 1280×720, h264+aac.
- `out/khmer-empire-storyboard/contact.png` — 18-scene contact sheet.
- `out/khmer-empire-storyboard/storyboard-animatic.mp4` — 2:13 slideshow + mock voice.
- `out/review/motion-strip-round5-plain.png` etc. are from the 3D style (unchanged).

## What I can judge from these artifacts
- The **pipeline is correct and deterministic**: 18 scenes, right durations,
  Khmer captions in Hanuman, year chips, title/end cards, transitions, ducking
  function, placeholder cards labeled "PLACEHOLDER — MISSING ASSET".
- Missing-file fail-loud + `--allow-missing` placeholder path works.
- Cached scene re-render works (17 HITs reused on the warm run).
- Parallax plane, FX layers, crossfade/dip-to-black, and OffthreadVideo path are
  wired; the tiny committed fixture rendered pixel-identical frames.

## What I CANNOT judge (no real assets)
Every illustration is a placeholder, so the **art quality, anachronism check,
depth-map quality, parallax believability and god-ray/ripple masking** are
UNVERIFIED. The depth model was never run (no illustrations; deps not installed).
Face/detail quality of the painterly characters is unverified. These require you
to generate the 18 images + depth maps, then re-render.

## Per-scene honest description (visual = prompt intent, NOT observed)
| # | id | years | camera | fx | Description of what the scene is *intended* to show (from the prompt); observed = placeholder |
|---|---|---|---|---|---|
| 1 | sc-01 | — | push-in | dust,god-rays,birds,grain,vignette | Dawn over Angkor Wat, mist + lotus moat |
| 2 | sc-02 | 802 | crane-up | dust,god-rays,smoke | Mount Kulen coronation of Jayavarman II |
| 3 | sc-03 | — | truck-right | water,grass | Roluos temples and a baray |
| 4 | sc-04 | 889 | crane-up | dust | Founding of Yasodharapura |
| 5 | sc-05 | — | push-in | water,grass,god-rays | Canals, moats, monsoon rice fields |
| 6 | sc-06 | — | truck-left | dust,grass | Farmers, weavers, craftsmen |
| 7 | sc-07 | 1113-1150 | crane-up | dust,smoke,birds | Angkor Wat under construction, scaffolds |
| 8 | sc-08 | — | truck-right | water,dust | Oxen carts and canal barges with sandstone |
| 9 | sc-09 | — | push-in | dust,grain | Carvers on the bas-relief galleries |
| 10 | sc-10 | — | push-out | god-rays,fireflies,dust | Priests, apsara dancers, king in procession |
| 11 | sc-11 | 1177 | truck-right | water,smoke,fire | Cham war boats, burning capital |
| 12 | sc-12 | 1181 | push-in | dust,smoke | Jayavarman VII rallying warriors |
| 13 | sc-13 | — | crane-up | god-rays,dust | Bayon smiling faces + walled gate |
| 14 | sc-14 | — | truck-left | dust,grass | Hospital / rest house with healers |
| 15 | sc-15 | 1296 | truck-right | dust,birds | Zhou Daguan in the market |
| 16 | sc-16 | — | push-out | dust,grain,smoke | Abandoned galleries, drought, cracked baray |
| 17 | sc-17 | 1431 | push-in | god-rays,dust,fireflies | Monks keeping Angkor Wat alive |
| 18 | sc-18 | — | crane-up | water,god-rays,birds,grain,vignette | Modern-day dawn over restored temples |

## Performance (this machine, tiny fixture; real illustrations will be heavier)
- Draft 720p: **67.7 ms/frame** (target ≤120 ms: PASS).
- Final 1080p: **97.8 ms/frame**.
- Warm scene-cache re-render: 17/18 scenes reused, ~28 s wall for the film.
