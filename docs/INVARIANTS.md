# Non-Negotiable Invariants & Contract Rules

This document outlines the strict technical invariants that govern the Kuanimation Studio codebase. Any violation causes frame drift and breaks the deterministic rendering pipeline.

## 1. Frame Determinism
- **Rule:** Never use `useFrame` from React Three Fiber inside any Remotion composition or 3D component.
- **Rationale:** `useFrame` relies on browser wall-clock time (`requestAnimationFrame`), which varies across machines and rendering runs.
- **Enforcement:** Statically checked by unit tests (`tests/remotion.test.js`) and verified via `npm run verify:determinism`.

## 2. Pure Mathematical Animation
- **Rule:** All animations (camera rigs, position, rotation, morph targets, particle motion) MUST be pure deterministic functions of `useCurrentFrame()` and `useVideoConfig().fps`.
- **Rationale:** Ensures exact reproducibility when rendering frames out-of-order or across distributed compute nodes.

## 3. Seeded Randomness
- **Rule:** Never call `Math.random()`.
- **Rationale:** `Math.random()` introduces non-deterministic entropy.
- **Enforcement:** Use Remotion's seeded `random()` function or helper utilities in `remotion/lib/randomness.ts` (e.g., `makeDust`).

## 4. Explicit ThreeCanvas Dimensions
- **Rule:** Every `<ThreeCanvas>` instance from `@remotion/three` MUST specify explicit `width` and `height` props matching the composition dimensions.
- **Rationale:** Prevents layout jitter and rendering clipping in headless Chromium.
