/**
 * @fileoverview Deterministic GLB / Mixamo character for Remotion (Round 4).
 *
 * Loads a rigged GLB (Quaternius "Ultimate Animated Character", or any
 * Mixamo/VRMA-rigged human once one lands — see docs/CHARACTER_PIPELINE.md)
 * and drives it with a THREE.AnimationMixer using
 * `mixer.setTime(frame / fps)` on every render. There is deliberately **no**
 * clock-driven `mixer.update(deltaTime)`: seeking by absolute scene time is
 * what makes a frame re-render identical (Phase 1 contract).
 *
 * Round 4 additions:
 *  - **Clip blending** — Idle / Talk / Gesture / Walk are resolved against
 *    the clips the model actually ships and cross-faded with pure weights
 *    (remotion/lib/character-anim.ts). The fallback pack (Idle + Walk only)
 *    still resolves to Idle for talk, so nothing ever freezes.
 *  - **Face rig** — if the mesh carries mouth morph targets they are driven
 *    from the 20 Hz voice envelope; if it has no visemes, the JAW and/or
 *    lower-lip bone is rotated from the same envelope. Both paths use the
 *    shared viseme table (character-anim.ts).
 *  - **Weight shift + torso counter-rotation** on the spine/hips bones, so
 *    the figure stops reading as a mannequin between clips.
 *  - **Foot planting** — after the mixer seek, a foot that sinks below the
 *    floor is planted and the leg shortened to compensate (foot-plant.ts).
 *
 * Loading uses R3F's suspense `useLoader` — @remotion/three's <ThreeCanvas>
 * wraps children in a Suspense boundary that holds the render
 * ("Waiting for <Suspense /> of <ThreeCanvas /> to resolve") until the model
 * is decoded, then mounts the canvas *with* the model so its per-frame
 * `advance()` draws the character. (A post-commit setState would miss that
 * draw: ManualFrameRenderer only advances when the Remotion frame changes.)
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
  clipWeights,
  resolveClip,
  headNodRadians,
  lipSyncVisemes,
  visemeFromMorphName,
  type StoryAction,
  type VisemeName
} from '../lib/character-anim.ts';
import { plantFoot } from '../lib/foot-plant.ts';
import { weightShift } from '../lib/vrm-anim.ts';

/** Per-instance cloned rig + the bones the lip-sync gesture drives. */
interface Rig {
  root: THREE.Group;
  animations: THREE.AnimationClip[];
  head?: THREE.Object3D;
  neck?: THREE.Object3D;
  /** Jaw / lower-lip bones, for rigs without viseme morph targets. */
  jaw?: THREE.Object3D;
  lowerLip?: THREE.Object3D;
  /** Hips / spine / chest, for the weight-shift layer. */
  hips?: THREE.Object3D;
  spine?: THREE.Object3D;
  chest?: THREE.Object3D;
  leftFoot?: THREE.Object3D;
  rightFoot?: THREE.Object3D;
  leftUpperLeg?: THREE.Object3D;
  rightUpperLeg?: THREE.Object3D;
  /** Meshes that carry mouth morph targets, with their viseme slots. */
  morphMeshes: Array<{
    mesh: THREE.Mesh;
    slots: Partial<Record<VisemeName, number>>;
  }>;
}

/** Bone names that mean "this is the jaw" / "this is the lower lip". */
const JAW_NAMES = /^(jaw|lowerjaw|lower_jaw|jawbone|mandible)$/i;
const LOWER_LIP_NAMES = /(lowerlip|lower_lip|lip_lower|lowerlipcorner|chin)/i;
const FOOT_NAMES = /^(foot|leftfoot|rightfoot|foot_l|foot_r)$/i;

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
  /** Per-character seed so two speakers do not mirror each other. */
  seed?: string;
}

export const GlbCharacter: React.FC<GlbCharacterProps> = ({
  modelUrl,
  position = [0, 0, 0],
  rotationY = 0,
  scale = 0.55,
  action = 'idle',
  env,
  lineStartFrame = 0,
  seed = 'glb'
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
    const morphMeshes: Rig['morphMeshes'] = [];
    let head: THREE.Object3D | undefined;
    let neck: THREE.Object3D | undefined;
    let jaw: THREE.Object3D | undefined;
    let lowerLip: THREE.Object3D | undefined;
    let hips: THREE.Object3D | undefined;
    let spine: THREE.Object3D | undefined;
    let chest: THREE.Object3D | undefined;
    let leftFoot: THREE.Object3D | undefined;
    let rightFoot: THREE.Object3D | undefined;
    let leftUpperLeg: THREE.Object3D | undefined;
    let rightUpperLeg: THREE.Object3D | undefined;

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
        // Mouth morph targets (Mixamo "mouthSmile"/viseme packs, ARKit,
        // MPFB) — record the viseme slots so the lip-sync can drive them.
        const dict = (mesh as THREE.Mesh & { morphTargetDictionary?: Record<string, number> })
          .morphTargetDictionary;
        if (dict && mesh.morphTargetInfluences) {
          const slots: Partial<Record<VisemeName, number>> = {};
          for (const name of Object.keys(dict)) {
            const viseme = visemeFromMorphName(name);
            if (viseme && slots[viseme] === undefined) slots[viseme] = dict[name];
          }
          if (Object.keys(slots).length > 0) morphMeshes.push({ mesh, slots });
        }
      }
      const name = o.name || '';
      if (name === 'Head') head = o;
      if (name === 'Neck') neck = o;
      if (JAW_NAMES.test(name)) jaw = o;
      if (LOWER_LIP_NAMES.test(name)) lowerLip = o;
      if (/^hips?$/i.test(name)) hips = o;
      if (/^spine$/i.test(name)) spine = o;
      if (/^(chest|upperchest|spine2|spine1)$/i.test(name)) chest = o;
      if (/^(leftfoot|foot_l|l_foot)$/i.test(name)) leftFoot = o;
      if (/^(rightfoot|foot_r|r_foot)$/i.test(name)) rightFoot = o;
      if (/^(leftupperleg|upperleg_l|l_upleg)$/i.test(name)) leftUpperLeg = o;
      if (/^(rightupperleg|upperleg_r|r_upleg)$/i.test(name)) rightUpperLeg = o;
      if (FOOT_NAMES.test(name)) {
        if (/left|_l$|^l/i.test(name)) leftFoot = o;
        else rightFoot = o;
      }
    });
    return {
      root,
      animations: gltf.animations,
      head,
      neck,
      jaw,
      lowerLip,
      hips,
      spine,
      chest,
      leftFoot,
      rightFoot,
      leftUpperLeg,
      rightUpperLeg,
      morphMeshes
    };
  }, [gltf]);

  // ------------------------------------------------------------------
  // Mixer + actions: created once per rig. Idle is the base clip (it is
  // what the pack guarantees); the rest cross-fade on top.
  // ------------------------------------------------------------------
  const anim = React.useMemo(() => {
    if (!rig) return null;
    const mixer = new THREE.AnimationMixer(rig.root);
    const names = rig.animations.map((c) => c.name);
    const baseClip = rig.animations.find((c) => c.name === 'Idle') ?? rig.animations[0];
    if (!baseClip) return null; // model without animations (would show bind pose)
    const idle = mixer.clipAction(baseClip);
    idle.play();
    // Optional clips: Talk / Gesture / Walk, when the rig ships them.
    const extras = new Map<string, THREE.AnimationAction>();
    for (const clip of rig.animations) {
      if (clip === baseClip) continue;
      const action = mixer.clipAction(clip);
      action.play();
      action.setEffectiveWeight(0);
      extras.set(clip.name, action);
    }
    return { mixer, idle, extras, names };
  }, [rig]);

  // ------------------------------------------------------------------
  // Drive the rig — all state is a pure function of the current frame.
  // ------------------------------------------------------------------
  if (rig && anim) {
    const weights = crossFadeWeights(action, frame, fps);
    anim.idle.setEffectiveWeight(weights.idle);
    const walkAction = anim.extras.get('Walk');
    if (walkAction) walkAction.setEffectiveWeight(weights.walk);

    // Four-way blend (Idle/Talk/Gesture/Walk) for rigs that ship the full
    // set. The fallback pack has only Idle + Walk, so the others resolve to
    // nothing and the weights stay on the legacy path.
    const rich = clipWeights(action, frame, fps);
    const talkClip = resolveClip(anim.names, 'talk');
    const talkAction = talkClip ? anim.extras.get(talkClip) : undefined;
    if (talkAction && talkClip !== 'Walk') {
      talkAction.setEffectiveWeight(Math.max(0, rich.talk - (weights.walk > 0 ? 1 : 0)));
    }

    // Absolute-time seek: deterministic, re-renderable, clock-free.
    anim.mixer.setTime(frame / fps);

    // ---- Face rig --------------------------------------------------
    const visemes = lipSyncVisemes(env, frame, fps, lineStartFrame, seed);
    const amp = envelopeAmplitude(env, frame, fps, lineStartFrame);

    // 1) Morph-target visemes (preferred: the face actually shapes).
    for (const { mesh, slots } of rig.morphMeshes) {
      const influences = mesh.morphTargetInfluences;
      if (!influences) continue;
      for (const [viseme, index] of Object.entries(slots) as Array<[VisemeName, number]>) {
        influences[index] = visemes[viseme];
      }
    }

    // 2) Jaw / lower-lip fallback for rigs with no viseme morphs.
    if (rig.morphMeshes.length === 0) {
      const jawOpen = amp * 0.5;
      if (rig.jaw) rig.jaw.rotation.x += jawOpen;
      if (rig.lowerLip) {
        rig.lowerLip.rotation.x += jawOpen * 0.55;
        rig.lowerLip.position.y -= jawOpen * 0.02;
      }
    }

    // Lip-sync fallback (no morphs / no Talk clip): head+neck nod scaled
    // by the voice envelope. envelopeAmplitude() returns 0 outside the
    // line's audio span, so the nod stops exactly when the voice stops.
    const nod = headNodRadians(amp);
    if (nod !== 0) {
      // Added AFTER setTime: the mixer rewrites bone rotations on every
      // seek, so this never accumulates across frames.
      if (rig.head) rig.head.rotation.x += nod;
      if (rig.neck) rig.neck.rotation.x += nod * 0.4;
    }

    // ---- Weight shift + torso counter-rotation ----------------------
    const shift = weightShift(frame, fps, seed);
    if (rig.hips) {
      rig.hips.rotation.z += 0.05 * shift;
      rig.hips.rotation.y += 0.02 * shift;
    }
    if (rig.spine) {
      rig.spine.rotation.y += 0.035 * shift;
      rig.spine.rotation.z += -0.02 * shift;
    }
    if (rig.chest) {
      rig.chest.rotation.y += -0.05 * shift;
      rig.chest.rotation.z += 0.015 * shift;
    }

    // ---- Foot planting ----------------------------------------------
    if (action === 'walk' && (rig.leftFoot || rig.rightFoot)) {
      const floor = position[1];
      rig.root.updateMatrixWorld(true);
      if (rig.leftFoot && rig.leftUpperLeg) {
        const y = rig.leftFoot.getWorldPosition(new THREE.Vector3()).y;
        const res = plantFoot(y, floor);
        if (res.planted) rig.leftUpperLeg.position.y += res.correction;
      }
      if (rig.rightFoot && rig.rightUpperLeg) {
        const y = rig.rightFoot.getWorldPosition(new THREE.Vector3()).y;
        const res = plantFoot(y, floor);
        if (res.planted) rig.rightUpperLeg.position.y += res.correction;
      }
    }

    rig.root.position.set(position[0], position[1], position[2]);
    rig.root.rotation.y = rotationY;
    rig.root.scale.setScalar(scale);
  }

  if (!rig) return null;
  return <primitive object={rig.root} />;
};
