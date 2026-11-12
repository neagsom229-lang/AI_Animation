# GitHub Copilot Instructions — Remotion & Three.js Studio

## Tech Stack
- **Remotion**: v4 (`remotion`, `@remotion/three`, `@remotion/renderer`, `@remotion/bundler`)
- **React**: v19 (`react`, `react-dom`)
- **Three.js / R3F**: `three`, `@react-three/fiber`, `@react-three/drei`
- **Animation / Rigging**: `anima3d`, `simplex-noise`

## Development Rules
1. **Never use `useFrame`** in Remotion compositions. Use `useCurrentFrame()` and `useVideoConfig()`.
2. **Deterministic Camera & Motion**: Compute camera poses via `getCameraPose(rig, frame, fps, durationInFrames)`.
3. **Seeded Randomness**: Use `makeDust` or Remotion's `random()`. Never `Math.random()`.
4. **ThreeCanvas Wrapping**: Wrap Three.js scenes in `<ThreeCanvas width={width} height={height}>`.
5. **Testing**: Run `npm test` and `npm run verify:determinism` before concluding any feature or bug fix.
