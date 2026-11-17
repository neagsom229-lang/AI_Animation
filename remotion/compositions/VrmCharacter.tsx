/**
 * @fileoverview Deterministic VRM character for Remotion (Goal 3).
 *
 * Loads a VRM avatar (CC0 VRoid sample — see CREDITS.md) through
 * `@pixiv/three-vrm` and drives it **entirely** from pure functions of the
 * current frame (remotion/lib/vrm-anim.ts):
 *
 *  - body: `bodyPose()` — a solved never-T-pose stance under every action
 *    (VRM rest *is* a T-pose, so the arms are re-posed on every frame),
 *    cross-faded Idle/Talk/Gesture/Walk layers,
 *  - face: seeded 3–5 s blink, aa/ih/ou/ee/oh visemes from the 20 Hz voice
 *    envelope (Rhubarb `mouthCues` take precedence when present), breathing
 *    and head sway,
 *  - gaze: `vrm.lookAt` toward the listener/camera with seeded micro-saccades.
 *
 * DETERMINISM: `vrm.update(delta)` is deliberately **not** called — its
 * spring-bone step is Verlet integration with per-instance state, which would
 * make a frame depend on how many frames were rendered before it (fatal for
 * out-of-order/concurrent Remotion renders). The three stateless stages the
 * renderer needs are called explicitly in the library's own order:
 * `humanoid.update()` → `lookAt.update(0)` → `expressionManager.update()`.
 * Hair/cloth spring bones therefore stay in their rest pose (static).
 *
 * Loading uses R3F's suspense `useLoader` (same pattern as GlbCharacter):
 * @remotion/three turns the suspense into a delayRender so the frame is
 * captured only after the model is decoded.
 *
 * RULES: no useFrame, no Math.random, no wall-clock time, no clock-driven
 * mixer — mutations happen synchronously in the render body.
 * @module remotion/compositions/VrmCharacter
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig, staticFile } from 'remotion';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import {
  blinkWeight,
  bodyPose,
  gazeSaccade,
  mouthWeights,
  type RhubarbCue,
  type VrmBoneName
} from '../lib/vrm-anim.ts';
import type { StoryAction } from '../lib/character-anim.ts';
import { useReliefMaterial } from '../lib/relief.ts';

// ---------------------------------------------------------------------------
// Loader: one GLTFLoader with the VRM plugin registered exactly once.
// useLoader caches by [loader, url], so the instance (not a class) is the
// cache key and the plugin is never registered twice on the same loader.
// ---------------------------------------------------------------------------
const vrmLoader = new GLTFLoader();
vrmLoader.register((parser) => new VRMLoaderPlugin(parser));

/**
 * Every normalized bone this component writes each frame. The list is fixed
 * and written with absolute values (pose[bone] ?? 0) so nothing can leak
 * from a previous frame — a re-render of frame N never depends on frame N-1.
 */
const DRIVEN_BONES: VrmBoneName[] = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftShoulder',
  'rightShoulder',
  'leftUpperArm',
  'rightUpperArm',
  'leftLowerArm',
  'rightLowerArm',
  'leftHand',
  'rightHand',
  'leftUpperLeg',
  'rightUpperLeg',
  'leftLowerLeg',
  'rightLowerLeg'
];

const ZERO = { x: 0, y: 0, z: 0 };

export interface VrmCharacterProps {
  /** Repo-root-relative VRM path, e.g. "public/models/characters/Vita.vrm". */
  modelUrl: string;
  position?: [number, number, number];
  /** Yaw in radians (deterministic scene placement). */
  rotationY?: number;
  /** Uniform scale (VRMs are authored in metres; Vivi needs ~1.27 to match). */
  scale?: number;
  /** Story action: idle | walk | talk | turn | react. */
  action?: StoryAction | string;
  /** 20 Hz loudness envelope of the active dialogue line (lip-sync). */
  env?: number[];
  /** Sequence-local frame where the active line's audio starts. */
  lineStartFrame?: number;
  /** Rhubarb mouth cues for the active line (seconds, line-relative). */
  mouthCues?: RhubarbCue[];
  /** Per-character seed: blink/gaze/gesture schedules differ per character. */
  seed?: string;
  /** World-space point the eyes fixate on (listener head or camera). */
  gazeTarget?: [number, number, number];
  /**
   * Rendering style. `relief` replaces the model's own materials with the
   * carved-sandstone material of the Angkor Wat bas-reliefs, so a
   * mismatched (e.g. modern) figure reads as part of the monument.
   */
  style?: 'default' | 'relief';
}

export const VrmCharacter: React.FC<VrmCharacterProps> = ({
  modelUrl,
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
  action = 'idle',
  env,
  lineStartFrame = 0,
  mouthCues,
  seed = 'vrm',
  gazeTarget,
  style = 'default'
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const url = staticFile(modelUrl.replace(/^public\//, ''));

  // Suspends on first load; @remotion/three's SuspenseLoader turns that into
  // a delayRender so the frame is captured only after the model is in.
  const gltf = useLoader(vrmLoader, url);

  // Round 5: the "relief" style replaces the model's own materials with the
  // carved-sandstone material of the Angkor Wat bas-reliefs.
  const reliefMaterial = useReliefMaterial({ color: '#9a9184', bumpScale: 1.4, repeat: [4, 4] });
  const useRelief = style === 'relief';

  const vrm: VRM | null = React.useMemo(() => {
    const instance = (gltf.userData as { vrm?: VRM } | undefined)?.vrm ?? null;
    if (instance) {
      // VRM 0.x avatars face -Z; rotateVRM0 assigns scene.rotation.y = PI
      // (idempotent — it assigns, does not accumulate). Placement lives on
      // the outer <group> so this rotation is never overwritten.
      VRMUtils.rotateVRM0(instance);
      // Deterministic draw order: characters sort after the ground
      // (renderOrder 0) so a foot at y = 0 can never flip between runs;
      // bind-pose culling is disabled so limbs never pop out mid-shot.
      instance.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.renderOrder = 1;
          mesh.frustumCulled = false;
          if (useRelief) {
            // One shared material for the whole figure — a stone relief is
            // carved out of one block, not assembled from painted parts.
            mesh.material = reliefMaterial;
          }
        }
      });
    }
    return instance;
  }, [gltf, useRelief, reliefMaterial]);

  // World-space gaze target object (sibling of the character group: lookAt
  // reads its world position, so it must not inherit the character transform).
  const gazeObject = React.useMemo(() => new THREE.Object3D(), []);

  // ------------------------------------------------------------------
  // Drive the rig — every value is a pure function of the current frame.
  // ------------------------------------------------------------------
  if (vrm) {
    // 1) Body pose on the normalized rig (world-aligned axes; absolute write
    //    of every driven bone — no residue from other frames/actions).
    const pose = bodyPose({ action, frame, fps, seed, env, lineStartFrame });
    for (const bone of DRIVEN_BONES) {
      const euler = pose[bone] ?? ZERO;
      const node = vrm.humanoid.getNormalizedBoneNode(bone);
      if (node) node.rotation.set(euler.x, euler.y, euler.z);
    }

    // 2) Face: blink + mouth visemes (envelope or Rhubarb cues).
    const expressions = vrm.expressionManager;
    if (expressions) {
      expressions.resetValues();
      const blink = blinkWeight(frame, fps, seed);
      if (blink > 0) expressions.setValue('blink', blink);
      const mouth = mouthWeights({ frame, fps, env, lineStartFrame, mouthCues, seed });
      expressions.setValue('aa', mouth.aa);
      expressions.setValue('ih', mouth.ih);
      expressions.setValue('ou', mouth.ou);
      expressions.setValue('ee', mouth.ee);
      expressions.setValue('oh', mouth.oh);
    }

    // 3) Gaze: move the fixated point by the current micro-saccade. The
    //    horizontal bearing from the character root to the target is exact;
    //    saccade offsets (<= ~2.6 deg) shift the target sideways/up by
    //    tan(angle) * distance, which is what lookAt needs.
    if (gazeTarget && vrm.lookAt) {
      const dx = gazeTarget[0] - position[0];
      const dz = gazeTarget[2] - position[2];
      const horizontal = Math.hypot(dx, dz);
      const yaw = gazeSaccade(frame, fps, seed);
      if (horizontal > 1e-4) {
        const bearingX = dx / horizontal;
        const bearingZ = dz / horizontal;
        // Perpendicular (right) of the bearing in the XZ plane.
        const rightX = -bearingZ;
        const rightZ = bearingX;
        gazeObject.position.set(
          gazeTarget[0] + rightX * Math.tan(yaw.yaw) * horizontal,
          gazeTarget[1] + Math.tan(yaw.pitch) * horizontal,
          gazeTarget[2] + rightZ * Math.tan(yaw.yaw) * horizontal
        );
      } else {
        gazeObject.position.set(gazeTarget[0], gazeTarget[1], gazeTarget[2]);
      }
      vrm.lookAt.target = gazeObject;
    } else if (vrm.lookAt) {
      vrm.lookAt.target = null;
    }

    // 4) Apply stages in the library's canonical order — but skip
    //    vrm.update(delta) entirely: its spring bones are stateful Verlet
    //    integrators (see file header). Hair stays at rest = deterministic.
    vrm.humanoid.update();
    if (vrm.lookAt) vrm.lookAt.update(0);
    if (expressions) expressions.update();
  }

  if (!vrm) return null;
  return (
    <>
      {/* Placement lives on the wrapper: vrm.scene keeps its VRM0 PI
          rotation, and position/yaw/scale are per-shot blocking. */}
      <group position={position} rotation-y={rotationY} scale={scale}>
        <primitive object={vrm.scene} />
      </group>
      <primitive object={gazeObject} />
    </>
  );
};
