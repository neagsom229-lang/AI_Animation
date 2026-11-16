/**
 * @fileoverview Solve the never-T-pose arm angles for the VRM characters.
 *
 * The VRM rest pose is a T-pose (arms horizontal). The film needs a relaxed
 * conversational stance: arms hanging at the sides, elbows softly bent, hands
 * near the hips and slightly forward. Rather than eyeballing euler values
 * (the normalized bone frames are world-aligned, but the shoulder→elbow→wrist
 * chain composes rotations in a non-obvious order), this script grid-searches
 * the six euler parameters per arm against joint targets using the same
 * forward kinematics the renderer uses (scripts/lib/vrm-pose.mjs replicates
 * three-vrm's normalized rig exactly — identity FK reproduces raw rest to
 * 1e-6).
 *
 * Run: node scripts/pose-solve.mjs [path/to.vrm]
 * Prints the solved constants that are shipped in remotion/lib/vrm-anim.ts
 * (POSE constants) together with the resulting joint positions, so the
 * provenance of those numbers is reproducible.
 *
 * @module scripts/pose-solve
 */

import fs from 'node:fs';
import { buildRestPose, fkPose } from './lib/vrm-pose.mjs';

/** Relaxed-stance targets in raw-rest space (front = -Z, Vita proportions). */
const TARGETS = {
  // left arm: hand hangs by the hip, slightly forward; elbow tucked near the
  // body with a small outward flare.
  left: {
    hand: [-0.15, 0.93, -0.09],
    elbow: [-0.17, 1.12, 0.03],
  },
  right: {
    hand: [0.15, 0.93, -0.09],
    elbow: [0.17, 1.12, 0.03],
  },
};

const ARMS = [
  { side: 'left', upper: 'leftUpperArm', lower: 'leftLowerArm', hand: 'leftHand' },
  { side: 'right', upper: 'rightUpperArm', lower: 'rightLowerArm', hand: 'rightHand' },
];

const vec = ([x, y, z]) => ({ x, y, z });
const dist = (p, t) =>
  Math.sqrt((p.x - t.x) ** 2 + (p.y - t.y) ** 2 + (p.z - t.z) ** 2);

/** Coarse-to-fine grid over upper/lower arm eulers (XYZ radians). */
function solveArm(rest, arm, targets) {
  const upper = rest.boneWorldPos.get(arm.upper);
  const elbowTarget = vec(targets.elbow);
  const handTarget = vec(targets.hand);

  let best = null;
  const evaluate = (params) => {
    const pose = {
      [arm.upper]: { x: params[0], y: params[1], z: params[2] },
      [arm.lower]: { x: params[3], y: params[4], z: params[5] },
    };
    const world = fkPose(rest, pose);
    const elbow = world.get(arm.lower);
    const hand = world.get(arm.hand);
    const cost =
      dist(hand, handTarget) ** 2 + 0.35 * dist(elbow, elbowTarget) ** 2;
    if (!best || cost < best.cost) {
      best = { cost, pose, elbow: elbow.clone(), hand: hand.clone() };
    }
  };

  // Stage 1: coarse sweep. Upper-arm z is the primary "arm down" rotation
  // (positive for the left arm along -X, negative for the right), so give it
  // a directed range per side.
  const zSign = arm.side === 'left' ? 1 : -1;
  const range = (lo, hi, step) => {
    const out = [];
    for (let v = lo; v <= hi + 1e-9; v += step) out.push(v);
    return out;
  };
  for (const ux of range(-0.3, 0.3, 0.15))
    for (const uy of range(-0.3, 0.3, 0.15))
      for (const uz of range(0.9, 1.7, 0.1))
        for (const lx of range(0.0, 1.2, 0.2))
          for (const ly of range(-0.4, 0.4, 0.2))
            for (const lz of range(-0.4, 0.4, 0.2))
              evaluate([ux, uy, zSign * uz, lx, ly, lz]);

  // Stage 2: refine around the coarse winner.
  const c = [
    best.pose[arm.upper].x,
    best.pose[arm.upper].y,
    Math.abs(best.pose[arm.upper].z),
    best.pose[arm.lower].x,
    best.pose[arm.lower].y,
    best.pose[arm.lower].z,
  ];
  for (const dx of range(-0.08, 0.08, 0.04))
    for (const dy of range(-0.08, 0.08, 0.04))
      for (const dz of range(-0.08, 0.08, 0.04))
        for (const ex of range(-0.12, 0.12, 0.06))
          for (const ey of range(-0.12, 0.12, 0.06))
            for (const ez of range(-0.12, 0.12, 0.06))
              evaluate([
                c[0] + dx,
                c[1] + dy,
                c[2] + dz,
                c[3] + ex,
                c[4] + ey,
                c[5] + ez,
              ]);

  return {
    upper: best.pose[arm.upper],
    lower: best.pose[arm.lower],
    elbow: best.elbow,
    hand: best.hand,
    cost: best.cost,
    shoulder: upper.clone(),
  };
}

function main() {
  const file = process.argv[2] || 'public/models/characters/Vita.vrm';
  const rest = buildRestPose(fs.readFileSync(file));
  console.log(`# ${file}`);
  for (const arm of ARMS) {
    const s = solveArm(rest, arm, TARGETS[arm.side]);
    const f = (v) => `[${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}]`;
    console.log(`${arm.side}:`);
    console.log(
      `  ${arm.upper}: { x: ${s.upper.x.toFixed(3)}, y: ${s.upper.y.toFixed(3)}, z: ${s.upper.z.toFixed(3)} }`
    );
    console.log(
      `  ${arm.lower}: { x: ${s.lower.x.toFixed(3)}, y: ${s.lower.y.toFixed(3)}, z: ${s.lower.z.toFixed(3)} }`
    );
    console.log(`  shoulder ${f(s.shoulder)} -> elbow ${f(s.elbow)} -> hand ${f(s.hand)}`);
    console.log(`  cost ${s.cost.toFixed(5)}`);
  }
}

main();
