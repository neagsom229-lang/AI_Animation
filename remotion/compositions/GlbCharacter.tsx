/**
 * @fileoverview Deterministic GLB character for Remotion (Phase B).
 *
 * Loads a rigged GLB (Quaternius "Ultimate Animated Character" — see
 * CREDITS.md) and drives it with a THREE.AnimationMixer using
 * `mixer.setTime(frame / fps)` on every render. There is deliberately **no**
 * clock-driven `mixer.update(deltaTime)`: seeking by absolute scene time is
 * what makes a frame re-render identical (Phase 1 contract).
 *
 * Loading uses R3F's suspense `useLoader` — @remotion/three's <ThreeCanvas>
 * wraps children in a Suspense boundary that holds the render
 * ("Waiting for <Suspense /> of <ThreeCanvas /> to resolve") until the model
 * is decoded, then mounts the canvas *with* the model so its per-frame
 * `advance()` draws the character. (A post-commit setState would miss that
 * draw: ManualFrameRenderer only advances when the Remotion frame changes.)
 *
 * Behaviour:
 *  - Cross-fades Idle ↔ Walk by story action (see lib/character-anim.ts);
 *    frame 0 always plays Idle → the character is never shown in a T-pose.
 *  - Lip-sync: the pack has no morph targets and no Talk clip, so the
 *    voice envelope drives a Head/Neck bone nod (exactly 0 when the voice
 *    stops).
 *  - The GLB is cloned per instance with SkeletonUtils so skinned meshes
 *    keep independent skeletons.
 *
 * RULES: no useFrame, no Math.random, no wall-clock time.
 * @module remotion/compositions/GlbCharacter
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig, staticFile } from 'remotion';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { envelopeAmplitude } from '../lib/anima.ts';
import {
  crossFadeWeights,
  headNodRadians,
  type StoryAction
} from '../lib/character-anim.ts';

/** Per-instance cloned rig + the bones the lip-sync gesture drives. */
interface Rig {
  root: THREE.Group;
  animations: THREE.AnimationClip[];
  head?: THREE.Object3D;
  neck?: THREE.Object3D;
}

export interface GlbCharacterProps {
  /** Repo-root-relative model path, e.g. "public/models/characters/casual_male.glb". */
  modelUrl: string;
  position?: [number, number, number];
  /** Yaw in radians (deterministic scene placement). */
  rotationY?: number;
  /** Uniform scale — the source model is ~3.3 units tall, so 0.55 ≈ 1.8 m. */
  scale?: number;
  /** Story action: idle | walk | talk | turn | react. */
  action?: StoryAction | string;
  /** 20 Hz loudness envelope of the active dialogue line (lip-sync). */
  env?: number[];
  /** Sequence-local frame where the active line's audio starts. */
  lineStartFrame?: number;
}

export const GlbCharacter: React.FC<GlbCharacterProps> = ({
  modelUrl,
  position = [0, 0, 0],
  rotationY = 0,
  scale = 0.55,
  action = 'idle',
  env,
  lineStartFrame = 0
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const url = staticFile(modelUrl.replace(/^public\//, ''));

  // Suspends on first load; @remotion/three's SuspenseLoader turns that into
  // a delayRender so the frame is captured only after the model is in.
  const gltf = useLoader(GLTFLoader, url);

  // ------------------------------------------------------------------
  // Clone once per instance: SkeletonUtils.clone keeps skinned skeletons
  // independent when several characters share the same GLB.
  // ------------------------------------------------------------------
  const rig = React.useMemo<Rig | null>(() => {
    if (!gltf) return null;
    const root = cloneSkinned(gltf.scene) as THREE.Group;
    let head: THREE.Object3D | undefined;
    let neck: THREE.Object3D | undefined;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Deterministic draw order: characters sort after the ground
        // (renderOrder 0) so a foot planted exactly on y = 0 can never flip
        // between runs — three sorts opaque meshes by renderOrder before the
        // parse-order-dependent material id (see SceneWorld.tsx).
        mesh.renderOrder = 1;
        // Bind-pose bounding boxes are stale once the mixer animates the
        // mesh — disable culling so limbs never pop out mid-shot.
        mesh.frustumCulled = false;
      }
      if (o.name === 'Head') head = o;
      if (o.name === 'Neck') neck = o;
    });
    return { root, animations: gltf.animations, head, neck };
  }, [gltf]);

  // ------------------------------------------------------------------
  // Mixer + actions: created once per rig. Idle is the base clip (it is
  // what the pack guarantees); Walk cross-fades on top for walk actions.
  // ------------------------------------------------------------------
  const anim = React.useMemo(() => {
    if (!rig) return null;
    const mixer = new THREE.AnimationMixer(rig.root);
    const byName = new Map(rig.animations.map((c) => [c.name, c]));
    const baseClip = byName.get('Idle') ?? rig.animations[0];
    if (!baseClip) return null; // model without animations (would show bind pose)
    const idle = mixer.clipAction(baseClip);
    idle.play();
    const walkClip = byName.get('Walk');
    let walk: THREE.AnimationAction | null = null;
    if (walkClip && walkClip !== baseClip) {
      walk = mixer.clipAction(walkClip);
      walk.play();
      walk.setEffectiveWeight(0);
    }
    return { mixer, idle, walk };
  }, [rig]);

  // ------------------------------------------------------------------
  // Drive the rig — all state is a pure function of the current frame.
  // ------------------------------------------------------------------
  if (rig && anim) {
    const weights = crossFadeWeights(action, frame, fps);
    anim.idle.setEffectiveWeight(weights.idle);
    if (anim.walk) anim.walk.setEffectiveWeight(weights.walk);

    // Absolute-time seek: deterministic, re-renderable, clock-free.
    anim.mixer.setTime(frame / fps);

    // Lip-sync fallback (no morphs / no Talk clip): head+neck nod scaled
    // by the voice envelope. envelopeAmplitude() returns 0 outside the
    // line's audio span, so the nod stops exactly when the voice stops.
    const nod = headNodRadians(envelopeAmplitude(env, frame, fps, lineStartFrame));
    if (nod !== 0) {
      // Added AFTER setTime: the mixer rewrites bone rotations on every
      // seek, so this never accumulates across frames.
      if (rig.head) rig.head.rotation.x += nod;
      if (rig.neck) rig.neck.rotation.x += nod * 0.4;
    }

    rig.root.position.set(position[0], position[1], position[2]);
    rig.root.rotation.y = rotationY;
    rig.root.scale.setScalar(scale);
  }

  if (!rig) return null;
  return <primitive object={rig.root} />;
};
