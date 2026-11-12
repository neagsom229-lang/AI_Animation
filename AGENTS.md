# AGENTS.md — Kuanimation Studio Agent Guidelines

Welcome to the Kuanimation Studio repository. This document provides core operational rules for AI agents working in this codebase.

## 1. Core Engineering Principles
- **Frame Determinism (Absolute Rule):** Never use `useFrame` from React Three Fiber inside Remotion compositions. All animations must be pure mathematical functions of `useCurrentFrame()` and `useVideoConfig().fps`.
- **No Wall-Clock Time:** Banned APIs include `THREE.Clock`, `getElapsedTime()`, `performance.now()`, and `Date.now()`.
- **Seeded Randomness:** Never use `Math.random()`. Use Remotion's seeded `random()` or helper utilities in `remotion/lib/randomness.ts`.
- **Explicit ThreeCanvas Props:** Every `<ThreeCanvas>` component must specify explicit `width` and `height` props.

## 2. Repo Scripts & Workflows
- **Run Tests:** `npm test` (executes Node.js built-in test runner on `tests/*.test.js`).
- **Verify Determinism:** `npm run verify:determinism` (renders composition twice and compares video + frame hashes).
- **Remotion Studio:** `npm run remotion:studio` (launches interactive Remotion Studio).
- **Render Production Video:** `npm run remotion:render:test` or `npx remotion render <CompositionId> out/<output>.mp4`.

## 3. Safety & Style
- **Write Tests:** Always add corresponding tests for new compositions or library functions in `tests/`.
- **Non-Destructive:** Do not modify `.git`, delete protected workflow files, or run destructive shell commands without authorization.
- **Type Safety:** Maintain strict TypeScript compliance (`tsc`).
