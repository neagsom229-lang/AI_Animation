# remotion-3d-skill Skill

## Overview
Provides deterministic 3D component templates and best practices for combining Remotion with `@remotion/three`.

## Guidelines
- Always wrap 3D scenes in `<ThreeCanvas width={width} height={height}>`.
- Avoid R3F imperative hooks (`useFrame`) that depend on wall-clock time.
- Use explicit quaternions (`lookAtQuaternion`) for camera orientation.
