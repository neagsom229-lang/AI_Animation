/**
 * @fileoverview Rest-pose extraction and forward kinematics for the VRM
 * normalized humanoid rig (Goal 3).
 *
 * three-vrm poses avatars through a *normalized* skeleton
 * (`VRMHumanoidRig._setupTransforms`): every normalized bone sits at the raw
 * bone's world rest position (offset from its humanoid parent), with an
 * **identity rest rotation** — so the normalized local axes equal the model's
 * world axes in T-pose. Setting `normalizedBone.rotation` therefore rotates
 * the limb around world axes at the joint, for any VRM regardless of how its
 * raw bones were oriented (VRoid rigs have arbitrary local bone frames).
 *
 * This module replicates that construction from the GLB JSON alone (no
 * WebGL, no loader — pure three.js math, so it runs in Node tests):
 *
 *  - `buildRestPose(buffer)`  raw world transforms from the node graph +
 *                            humanoid bone table → normalized chain offsets
 *  - `fkPose(rest, pose)`    world joint positions for a pose map
 *    `{ bone: { x, y, z } }` (euler XYZ radians on normalized bones)
 *
 * Used by tests to prove the shipped pose never shows a T-pose on the
 * shipped asset, and by scripts/pose-solve.mjs to solve arm angles that put
 * the hands at conversational rest positions.
 *
 * @module scripts/lib/vrm-pose
 */

import * as THREE from 'three';
import { VRMHumanBoneParentMap } from '@pixiv/three-vrm-core';
import { parseGlb } from './vrm-shrink.mjs';

/**
 * Extract the humanoid rest layout from a VRM/GLB buffer.
 *
 * @param {Buffer} buffer GLB/VRM bytes
 * @returns {{ boneWorldPos: Map<string, THREE.Vector3>,
 *   localOffset: Map<string, THREE.Vector3>,
 *   humanoidParent: Map<string, string | null>,
 *   boneList: string[] }}
 *   `boneWorldPos` — raw rest world position per humanoid bone;
 *   `localOffset` — position of each bone relative to its normalized parent
 *   (the exact value three-vrm stores on the normalized Object3D);
 *   `boneList` — humanoid bones present in the file, in file order.
 * @throws if the file has no VRM humanoid or an unparseable node graph
 */
export function buildRestPose(buffer) {
  const { json } = parseGlb(buffer);
  const vrm = json.extensions && (json.extensions.VRM || json.extensions.VRM0);
  const humanBones = vrm && vrm.humanoid && vrm.humanoid.humanBones;
  if (!Array.isArray(humanBones) || humanBones.length === 0) {
    throw new Error('buildRestPose: no VRM humanoid.humanBones found');
  }
  const nodes = json.nodes || [];

  // Raw world transforms for every node (scene graph walk).
  const children = new Map(); // parent index -> child indices
  const hasParent = new Set();
  nodes.forEach((node, index) => {
    for (const child of node.children || []) {
      if (!children.has(index)) children.set(index, []);
      children.get(index).push(child);
      hasParent.add(child);
    }
  });
  const worldMatrices = new Map();
  const visit = (index, parentMatrix) => {
    const node = nodes[index];
    const local = new THREE.Matrix4();
    if (node.matrix) {
      local.fromArray(node.matrix);
    } else {
      const t = node.translation || [0, 0, 0];
      const r = node.rotation || [0, 0, 0, 1];
      const s = node.scale || [1, 1, 1];
      local.compose(
        new THREE.Vector3(t[0], t[1], t[2]),
        new THREE.Quaternion(r[0], r[1], r[2], r[3]),
        new THREE.Vector3(s[0], s[1], s[2])
      );
    }
    const world = parentMatrix.clone().multiply(local);
    worldMatrices.set(index, world);
    for (const child of children.get(index) || []) visit(child, world);
  };
  const roots = (json.scenes && json.scenes.length > 0 && json.scenes[0].nodes) || [];
  const identity = new THREE.Matrix4();
  for (const root of roots) {
    if (!hasParent.has(root)) visit(root, identity);
  }
  // Nodes not reachable from the default scene still may be humanoid bones
  // (rare); fall back to their local transform so the map never misses one.
  const boneWorldPos = new Map();
  const boneList = [];
  for (const { bone, node: nodeIndex } of humanBones) {
    let matrix = worldMatrices.get(nodeIndex);
    if (!matrix) {
      matrix = new THREE.Matrix4();
      const node = nodes[nodeIndex];
      if (node && node.matrix) matrix.fromArray(node.matrix);
      else if (node) {
        const t = node.translation || [0, 0, 0];
        const r = node.rotation || [0, 0, 0, 1];
        const s = node.scale || [1, 1, 1];
        matrix.compose(
          new THREE.Vector3(t[0], t[1], t[2]),
          new THREE.Quaternion(r[0], r[1], r[2], r[3]),
          new THREE.Vector3(s[0], s[1], s[2])
        );
      }
    }
    const position = new THREE.Vector3();
    matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
    boneWorldPos.set(bone, position);
    boneList.push(bone);
  }

  // Normalized chain: parent = VRM humanoid parent map (three-vrm walks this
  // same map), offset = world position delta from that parent.
  const humanoidParent = new Map();
  const localOffset = new Map();
  for (const bone of boneList) {
    const parent = VRMHumanBoneParentMap[bone] ?? null;
    const resolvedParent = parent && boneWorldPos.has(parent) ? parent : null;
    humanoidParent.set(bone, resolvedParent);
    const own = boneWorldPos.get(bone);
    const parentPos = resolvedParent ? boneWorldPos.get(resolvedParent) : new THREE.Vector3();
    localOffset.set(bone, own.clone().sub(parentPos));
  }

  return { boneWorldPos, localOffset, humanoidParent, boneList };
}

/**
 * Forward kinematics on the normalized rig.
 *
 * @param {ReturnType<typeof buildRestPose>} rest
 * @param {Record<string, { x?: number, y?: number, z?: number }>} pose
 *   euler XYZ radians per normalized bone (missing bones stay identity)
 * @returns {Map<string, THREE.Vector3>} world position of every humanoid
 *   bone joint under the pose (root at the origin, as three-vrm keeps it)
 */
export function fkPose(rest, pose) {
  const worldRot = new Map(); // bone -> Quaternion
  const worldPos = new Map(); // bone -> Vector3

  // Humanoid chains are shallow; resolve parents before children by walking
  // the parent map (bones are ordered hips-first in practice, but do it
  // properly with memoized recursion).
  const resolve = (bone) => {
    if (worldPos.has(bone)) return;
    const parent = rest.humanoidParent.get(bone);
    if (parent) resolve(parent);
    const parentRot = parent ? worldRot.get(parent) : new THREE.Quaternion();
    const parentPos = parent ? worldPos.get(parent) : new THREE.Vector3();
    const euler = pose[bone] || { x: 0, y: 0, z: 0 };
    const local = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(euler.x || 0, euler.y || 0, euler.z || 0, 'XYZ')
    );
    const rotation = parentRot.clone().multiply(local);
    const position = parentPos
      .clone()
      .add(rest.localOffset.get(bone).clone().applyQuaternion(parentRot));
    worldRot.set(bone, rotation);
    worldPos.set(bone, position);
  };
  for (const bone of rest.boneList) resolve(bone);
  return worldPos;
}

/**
 * Direction from one bone joint to another under a pose (unit vector), or
 * null when either bone is missing.
 */
export function boneDirection(worldPos, fromBone, toBone) {
  const from = worldPos.get(fromBone);
  const to = worldPos.get(toBone);
  if (!from || !to) return null;
  return to.clone().sub(from).normalize();
}
