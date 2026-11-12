# Kuanimation Studio

Professional, frame-deterministic 3D animation and motion graphics studio powered by **Remotion**, **Three.js**, and **AI Agent Skills**.

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                   AI Agent / MCP                       │
│        (video-shotcraft, kinetic-reel, awb-mcp)        │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Remotion Studio                      │
│            (Deterministic Frame Engine)                │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                   @remotion/three                      │
│             (<ThreeCanvas width, height>)              │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│      Pure Math Animation & Seeded Randomness           │
│  (getCameraPose, useCurrentFrame, anima3d, simplex)    │
└────────────────────────────────────────────────────────┘
```

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Launch Remotion Studio
Preview and scrub compositions interactively:
```bash
npm run remotion:studio
```

### 3. Verify Determinism Contract
Run the test suite and verify byte-identical video + pixel-identical frame hashes:
```bash
npm test
npm run verify:determinism
```

### 4. Render Production Video
```bash
npx remotion render DeterminismTest out/determinism-test.mp4 --codec=h264
npx remotion render Scene10s out/scene10s.mp4 --codec=h264
```

---

## Prompting the Agent

Example prompts to generate new scenes:
- *"Generate a 15-second explainer composition with a crane-down camera move and warm dawn mood."*
- *"Add a new walking character composition with custom narration and seeded procedural gait."*
- *"Create a 5-second orbit shot with glowing dust particles and cinematic handheld shake."*
