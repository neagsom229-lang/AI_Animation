# Third-party licenses (quoted from installed files)

This file records the license of every dependency, tool and model, with the
license text **quoted from the actual installed file or fetched model card**,
not from memory. Run `node scripts/gen-licenses.mjs` to regenerate the
dependency table from `node_modules/*/package.json` + license files.

Generated: 2026-11-17. Do not assert terms from memory — re-read on upgrade.

## JavaScript / npm dependencies (from `package.json` + installed `LICENSE` files)

| Package | Version | `package.json` license field | License file first line(s) |
|---|---|---|---|
| @pixiv/three-vrm | 3.5.5 | `MIT` | Copyright (c) 2019-2026 pixiv Inc. / MIT License |
| @react-three/drei | 10.7.9 | `MIT` | MIT License / Copyright (c) 2020 react-spring |
| @react-three/fiber | 9.8.2 | `MIT` | (no license file found) |
| @remotion/bundler | 4.0.542 | `SEE LICENSE IN LICENSE.md` | # Remotion License / In Remotion 5.0, the license will slightly change. [View the changes here](https://github.com/remot |
| @remotion/cli | 4.0.542 | `SEE LICENSE IN LICENSE.md` | # Remotion License / In Remotion 5.0, the license will slightly change. [View the changes here](https://github.com/remot |
| @remotion/renderer | 4.0.542 | `SEE LICENSE IN LICENSE.md` | # Remotion License / In Remotion 5.0, the license will slightly change. [View the changes here](https://github.com/remot |
| @remotion/three | 4.0.542 | `MIT` | (no license file found) |
| @types/react | 19.3.0 | `MIT` | MIT License / Copyright (c) Microsoft Corporation. |
| anima3d | 0.70.0 | `MIT` | MIT License / Copyright (c) 2026 SCENA contributors |
| react | 19.3.1 | `MIT` | MIT License / Copyright (c) Meta Platforms, Inc. and affiliates. |
| react-dom | 19.3.1 | `MIT` | MIT License / Copyright (c) Meta Platforms, Inc. and affiliates. |
| remotion | 4.0.542 | `SEE LICENSE IN LICENSE.md` | # Remotion License / In Remotion 5.0, the license will slightly change. [View the changes here](https://github.com/remot |
| remotion-subtitle | 2.0.0 | `MIT` | MIT License / Copyright (c) 2021 Juan Pablo Mejia Duque |
| simplex-noise | 4.0.3 | `MIT` | MIT License / Copyright (c) 2018 Jonas Wagner |
| three | 0.160.1 | `MIT` | The MIT License / Copyright © 2010-2023 three.js authors |
| typescript | 7.0.2 | `Apache-2.0` | Apache License / Version 2.0, January 2004 |
| vite | 5.4.2 | `MIT` | # Vite core license / Vite is released under the MIT license: |

### Remotion License.md — summarized verbatim (NOT interpreted)

Source: `node_modules/remotion/LICENSE.md` (identical files in
`@remotion/{bundler,cli,renderer}`). Quoted lines:

> # Remotion License
>
> Depending on the type of your legal entity, you are granted permission to use Remotion for your project. Individuals and small companies are allowed to use Remotion to create videos for free (even commercial), while a company license is required for for-profit organizations of a certain size.

> ## Free License — Eligibility
> You are eligible to use Remotion for free if you are:
> - an individual
> - a for-profit organization with up to 3 employees
> - a non-profit or not-for-profit organization
> - evaluating whether Remotion is a good fit, and are not yet using it in a commercial way

> ### Disallowed use cases
> It is not allowed to copy or modify Remotion code for the purpose of selling, renting, licensing, relicensing, or sublicensing your own derivate of Remotion.

> ## Company License
> You are required to obtain a Company License to use Remotion if you are not within the group of entities eligible for a Free License.

**Summary (no interpretation):** Remotion is NOT MIT/Apache/CC0. It uses a
two-tier license: a Free License for individuals, ≤3-employee for-profits,
non-profits and evaluation, and a paid Company License otherwise. Whether this
project's use falls under Free or Company depends on your legal entity — that
is a decision for the rights-holder, not something this document asserts.

## Python tools

| Tool | Version | License source | Quote / note |
|---|---|---|---|
| edge-tts | 7.3.1 | installed `.../edge_tts-7.3.1.dist-info/licenses/LICENSE` | "The MIT license is used for 'src/edge_tts/srt_composer.py' only. All remaining files are licensed under the LGPLv3." — **LGPLv3 is a weak copyleft, NOT in the MIT/Apache/BSD/CC0/CC-BY allow-list.** Used only as a build-time TTS command-line tool; flag for review before redistribution. |
| Depth Anything V2 Small | model | Hugging Face model card (fetched 2026-11-17) | "License: apache-2.0" — Apache-2.0, allowed. |
| torch / transformers / Pillow / numpy / opencv-python-headless | via `python -m pip` | installed dist-info licenses | torch BSD-3-Clause, transformers Apache-2.0, Pillow HPND, numpy BSD-3-Clause, opencv Apache-2.0 — verify on install; all permissive. |
| Real-ESRGAN (realesrgan-ncnn-vulkan) | optional upscaler | official LICENSE fetched 2026-11-17 from `https://raw.githubusercontent.com/xinntao/Real-ESRGAN/master/LICENSE` | "BSD 3-Clause License / Copyright (c) 2021, Xintao Wang / All rights reserved." — permissive, allowed. Used only by explicit `film upscale --scene N`; never silently. |

## Assets

- Kenney (Nature/Castle kits): **CC0** — quoted in `CREDITS.md`.
- Quaternius (Ultimate Animated Character): **CC0** — quoted in `CREDITS.md`.
- Poly Haven textures/HDRI: **CC0** — quoted in `CREDITS.md`.
- Hanuman font: **SIL OFL 1.1** — quoted in `CREDITS.md`.
- Vita.vrm / Vivi.vrm (VRoid CC0 samples): **CC0** — quoted in `CREDITS.md`.
- Illustrations: user-generated; each must be logged in `assets-src/illustrations/manifest.json` with a license-terms URL (Phase 2). No third-party images shipped yet.

## Allow-list check

Allowed: MIT, Apache-2.0, BSD, CC0, CC-BY, SIL OFL.
**Outside allow-list (flagged, not silently accepted):**
- Remotion (two-tier Free/Company) — core render engine; company-license question for the rights-holder.
- edge-tts (LGPLv3) — build-time TTS tool.
