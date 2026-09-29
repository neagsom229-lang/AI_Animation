# Kuanimation Studio & Agent Skill

Kuanimation is an [Agent Skill](https://agentskills.io/specification) and modern Web Studio for making illustrated animated stories and explainers. It features a dual 2D Pencil Sketch and 3D WebGL (Three.js) engine with post-processing (Bloom, Depth of Field), timeline scrubbing, multilingual support (English & Khmer), audio narration, and WebM video recording.

---

## Getting Started & Runnable App

To open the interactive Studio in your browser:

```bash
npm install
npm run dev
```

To run the automated test suite:

```bash
npm test
```

---

## Architecture Overview

- **`src/core/engine.js`**: Timeline scheduler, easing library (`Easing`), keyframe interpolation, and particle systems.
- **`src/core/story.js`**: Data-driven story format (`Story`, `Scene`, `Character`), validation, and offline generation fallbacks.
- **`src/render/canvas2d.js`**: 2D Pencil Sketch renderer featuring layered scenes, parallax background scrolling, procedural character sprites, hatching textures, weather effects, vignette lighting, screen shake, and scene transitions (fade, wipe, dissolve).
- **`src/render/three3d.js`**: 3D Three.js scene manager with procedural geometry, camera rigs (`dolly`, `orbit`, `crane`, `handheld`), mood lighting presets, and `EffectComposer` post-processing (Unreal Bloom & Depth of Field Bokeh), with quality toggles for low-end devices.
- **`src/audio/audio.js`**: Web Audio API tone synthesis and speech narration manager.
- **`src/ui/app.js`**: Modern Studio UI controller hosting story prompt panel, timeline scrubber, theme toggle, JSON import/export, and MediaRecorder.

---

## How to Add a Story

1. Create a JSON story file in `src/stories/` (or reference a custom JSON object) conforming to the `Story` schema:
   ```json
   {
     "title": "My Story Title",
     "genre": "historical",
     "theme": "Story theme description",
     "tone": "epic",
     "language": "en",
     "characters": [
       { "id": "hero", "name": "Hero Name", "role": "Protagonist" }
     ],
     "scenes": [
       {
         "id": "scene1",
         "name": "Opening Scene",
         "mood": "warm dawn",
         "dur": 6,
         "camera": "dolly",
         "renderer": "2d",
         "dialogue": [
           { "speaker": "hero", "text": "Hello world!", "subtitle": "Hello." }
         ]
       }
     ]
   }
   ```
2. Load or import the story JSON in `AnimationStudioApp` (`src/ui/app.js`) or select it via the genre/prompt panel.

---

## Accessibility & Reduced Motion

- **Keyboard Accessibility**: All studio controls, buttons, scrubbers, and selects are fully keyboard navigable with standard focus rings and ARIA attributes.
- **Reduced Motion**: Respects `prefers-reduced-motion: media` queries, automatically minimizing or disabling heavy procedural animations and transitions for users sensitive to motion.

---

## License & Security
- Keep credentials out of Git. Never commit `.env` or API keys.
