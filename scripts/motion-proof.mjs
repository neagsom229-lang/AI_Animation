#!/usr/bin/env node
/**
 * @fileoverview MOTION PROOF — measures whether a character visibly moves.
 *
 * Renders N consecutive frames (default 8, every 3rd frame) of one scene,
 * projects the speaker's head / torso / arm regions into screen space using
 * the *same* camera maths the composition uses (remotion/lib/camera.ts), and
 * prints the per-region pixel difference between consecutive frames.
 *
 * The shot and rig can be overridden on the input story WITHOUT touching any
 * source file, so the same character rig / same line / same audio can be
 * measured at two different framings (close-up vs wide) — a controlled
 * comparison where only the lens changes.
 *
 * A background reference region is measured on every frame pair (median of
 * all patches that do NOT touch the character). Camera drift (dolly/orbit)
 * changes the background; subtracting it from the character regions isolates
 * *character* motion from *camera* motion.
 *
 * Output:
 *   out/review/motion-strip-<tag>.png  — the 8 cropped frames side by side
 *   out/review/motion-<tag>-fNNN.png    — the full frames (for the report)
 *
 * Usage:
 *   node scripts/motion-proof.mjs --scene k2 --shot close-up --tag closeup
 *   node scripts/motion-proof.mjs --scene k2 --shot wide     --tag wide
 *
 * Windows note: use the direct node form (npm run -- flag passing breaks).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { renderStill, selectComposition } from '@remotion/renderer';
import { getOrCreateBundle } from './lib/bundle-cache.mjs';
import { decodePng, encodePng } from './lib/png.mjs';
import { resizeRgba } from './lib/contact-sheet.mjs';
import { buildRestPose, fkPose } from './lib/vrm-pose.mjs';
import { IDLE_POSE } from '../remotion/lib/vrm-anim.ts';
import {
  getShotPose,
  shotFov,
  SPEAKER_POSITION,
  SPEAKER_YAW,
} from '../remotion/lib/camera.ts';
import { buildStoryTimeline } from '../remotion/lib/story-timing.ts';
import { resolveCharacter } from '../src/characters/library.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    story: 'src/stories/khmer-temple.json',
    voice: 'public/voice.json',
    scene: 'k2',
    shot: null,
    rig: 'dolly',
    start: null,
    step: 3,
    count: 8,
    tag: 'shot',
    out: null,
    debug: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--story' && argv[i + 1]) args.story = argv[++i];
    else if (a === '--voice' && argv[i + 1]) args.voice = argv[++i];
    else if (a === '--scene' && argv[i + 1]) args.scene = argv[++i];
    else if (a === '--shot' && argv[i + 1]) args.shot = argv[++i];
    else if (a === '--rig' && argv[i + 1]) args.rig = argv[++i];
    else if (a === '--start' && argv[i + 1]) args.start = Number(argv[++i]);
    else if (a === '--step' && argv[i + 1]) args.step = Number(argv[++i]);
    else if (a === '--count' && argv[i + 1]) args.count = Number(argv[++i]);
    else if (a === '--tag' && argv[i + 1]) args.tag = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (a === '--debug') args.debug = true;
    else throw new Error(`Unknown or incomplete argument: ${a}`);
  }
  if (!Number.isInteger(args.step) || args.step < 1) throw new Error('bad --step');
  if (!Number.isInteger(args.count) || args.count < 2) throw new Error('bad --count');
  return args;
}

// ---------------------------------------------------------------------------
// Character metrics — read from the VRM's own rest pose (not guessed)
// ---------------------------------------------------------------------------

/**
 * Build the head / torso / arm boxes for a character, in WORLD metres.
 *
 * The rest pose of the shipped VRM gives the real joint heights (head, neck,
 * shoulder, hips) and the real lateral offsets (upper arm, hand), so the
 * boxes follow the asset instead of a hard-coded skeleton. The arm bands are
 * cut from the *posed* idle stance (forward-kinematics on the real
 * IDLE_POSE), because a VRoid avatar with the arms down has them hanging
 * against the body — an arm box that is not derived from the pose lands on
 * the background instead of on the arm.
 *
 * @param {Buffer} vrmBuffer the VRM file bytes
 * @param {number} scale uniform scale applied by the composition
 * @param {number} yaw world yaw of the character
 * @param {number[]} origin world position of the character's feet
 */
function characterBoxes(vrmBuffer, scale, yaw, origin) {
  const rest = buildRestPose(vrmBuffer);
  const posed = fkPose(rest, IDLE_POSE);
  const at = (map, name) => {
    const p = map.get(name);
    if (!p) throw new Error(`characterBoxes: VRM has no bone "${name}"`);
    return p;
  };
  const head = at(rest.boneWorldPos, 'head');
  const neck = at(rest.boneWorldPos, 'neck');
  const hips = at(rest.boneWorldPos, 'hips');
  const shoulderL = at(rest.boneWorldPos, 'leftShoulder');
  const shoulderR = at(rest.boneWorldPos, 'rightShoulder');
  const upperArmL = at(rest.boneWorldPos, 'leftUpperArm');
  const upperArmR = at(rest.boneWorldPos, 'rightUpperArm');

  const shoulderY = (shoulderL.y + shoulderR.y) / 2;
  const shoulderHalf = (Math.abs(upperArmR.x) + Math.abs(upperArmL.x)) / 2;
  const headR = Math.max(0.085, head.distanceTo(neck) * 1.3);

  // Lateral extent of the posed arm chain (hands are the outermost point).
  const handL = at(posed, 'leftHand');
  const handR = at(posed, 'rightHand');
  const armOuter = Math.max(Math.abs(handL.x), Math.abs(handR.x));
  const torsoHalf = shoulderHalf * 1.05;

  // Model-space boxes: [xMin, xMax, yMin, yMax]
  const boxes = {
    head: [[-headR, headR, head.y - headR * 1.05, head.y + headR * 0.9]],
    torso: [
      [
        -torsoHalf,
        torsoHalf,
        hips.y + 0.06,
        shoulderY + 0.06,
      ],
    ],
    // Two lateral bands where the arms hang, clear of the torso core.
    arm: [
      [-armOuter * 1.12, -torsoHalf, hips.y - 0.16, shoulderY + 0.04],
      [torsoHalf, armOuter * 1.12, hips.y - 0.16, shoulderY + 0.04],
    ],
  };

  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const toWorld = (x, y) => [
    origin[0] + x * cos * scale,
    y * scale,
    origin[2] - x * sin * scale,
  ];

  const out = { parts: {} };
  for (const [name, boxList] of Object.entries(boxes)) {
    const parts = [];
    for (const [x0, x1, y0, y1] of boxList) {
      const corners = [];
      for (const x of [x0, x1]) {
        for (const y of [y0, y1]) {
          for (const z of [-0.12, 0.12]) {
            const [wx, wy, wz] = toWorld(x, y);
            corners.push([wx, wy, wz + z]);
          }
        }
      }
      parts.push(corners);
    }
    out.parts[name] = parts;
  }
  out.metrics = {
    headY: head.y * scale,
    shoulderY: shoulderY * scale,
    hipsY: hips.y * scale,
    modelHeight: (head.y + headR) * scale,
    armOuter: armOuter * scale,
  };
  return out;
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/** Project world-space corners to a screen-space AABB (pixels). */
function projectBox(corners, camera, width, height) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const v = new THREE.Vector3();
  for (const c of corners) {
    v.set(c[0], c[1], c[2]).project(camera);
    const sx = (v.x * 0.5 + 0.5) * width;
    const sy = (-v.y * 0.5 + 0.5) * height;
    minX = Math.min(minX, sx);
    maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy);
    maxY = Math.max(maxY, sy);
  }
  return {
    x0: Math.max(0, Math.floor(minX)),
    y0: Math.max(0, Math.floor(minY)),
    x1: Math.min(width, Math.ceil(maxX)),
    y1: Math.min(height, Math.ceil(maxY)),
  };
}

/** Union of a list of screen rects. */
function unionRects(rects) {
  const out = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const r of rects) {
    out.x0 = Math.min(out.x0, r.x0);
    out.y0 = Math.min(out.y0, r.y0);
    out.x1 = Math.max(out.x1, r.x1);
    out.y1 = Math.max(out.y1, r.y1);
  }
  return out;
}

/** Build the three.js camera for a shot pose (same maths as the composition). */
function makeCamera(pose, shot, width, height) {
  const cam = new THREE.PerspectiveCamera(shotFov(shot), width / height, 0.1, 1000);
  cam.position.set(pose.position[0], pose.position[1], pose.position[2]);
  cam.lookAt(
    new THREE.Vector3(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2])
  );
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

// ---------------------------------------------------------------------------
// Pixel maths
// ---------------------------------------------------------------------------

/** Mean absolute per-channel difference over a pixel rectangle. */
function regionDiff(a, b, box) {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(a.width, Math.ceil(box.x1));
  const y1 = Math.min(a.height, Math.ceil(box.y1));
  if (x1 <= x0 || y1 <= y0) return NaN;
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * a.width + x) * 4;
      sum +=
        Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]);
      n += 1;
    }
  }
  return sum / n / 3;
}

/**
 * Fraction of pixels in a region that changed VISIBLY (max channel delta
 * above `threshold`).
 *
 * The mean absolute difference is NOT comparable between framings: a region
 * 10 px tall turns a one-pixel shift into a 30/255 mean, while the same
 * shift in a 130 px region is worth 2/255. The changed-fraction answers
 * the question that actually matters — how much of the character changed —
 * and it is far closer to scale-independent.
 */
function regionChangedFraction(a, b, box, threshold = 8) {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(a.width, Math.ceil(box.x1));
  const y1 = Math.min(a.height, Math.ceil(box.y1));
  if (x1 <= x0 || y1 <= y0) return NaN;
  let changed = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * a.width + x) * 4;
      const d = Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2])
      );
      if (d > threshold) changed += 1;
      n += 1;
    }
  }
  return n === 0 ? NaN : (changed / n) * 100;
}

/**
 * Background reference: median difference over a grid of patches that do not
 * overlap the character boxes. This is the camera/lighting noise floor.
 */
function backgroundDiff(a, b, characterBoxesPx) {
  const patch = 48;
  const vals = [];
  for (let y = 0; y + patch <= a.height; y += patch) {
    for (let x = 0; x + patch <= a.width; x += patch) {
      const box = { x0: x, y0: y, x1: x + patch, y1: y + patch };
      const hits = Object.values(characterBoxesPx).some(
        (c) => !(c.x1 <= box.x0 || c.x0 >= box.x1 || c.y1 <= box.y0 || c.y0 >= box.y1)
      );
      if (hits) continue;
      const d = regionDiff(a, b, box);
      if (Number.isFinite(d)) vals.push(d);
    }
  }
  if (vals.length === 0) return 0;
  vals.sort((p, q) => p - q);
  return vals[Math.floor(vals.length / 2)];
}

/** Draw a 2 px rectangle outline into an RGBA buffer. */
function drawRect(data, width, box, rgb) {
  const put = (x, y) => {
    if (x < 0 || y < 0 || x >= width) return;
    const i = (y * width + x) * 4;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  };
  for (let x = box.x0; x <= box.x1; x += 1) {
    put(x, box.y0);
    put(x, box.y1);
  }
  for (let y = box.y0; y <= box.y1; y += 1) {
    put(box.x0, y);
    put(box.x1, y);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const story = JSON.parse(fs.readFileSync(path.resolve(ROOT, args.story), 'utf-8'));
  const voiceData = JSON.parse(fs.readFileSync(path.resolve(ROOT, args.voice), 'utf-8'));

  const timeline = buildStoryTimeline(voiceData, 30);
  const sceneIdx = timeline.scenes.findIndex((s) => s.id === args.scene);
  if (sceneIdx < 0) {
    throw new Error(
      `scene "${args.scene}" not found. Available: ${timeline.scenes.map((s) => s.id).join(', ')}`
    );
  }
  const scene = timeline.scenes[sceneIdx];
  const sceneSpec = (story.scenes || [])[sceneIdx] || {};

  // --- shot / rig override (input data only — no source file is touched) ---
  const shot = args.shot || sceneSpec.shot || 'medium';
  const rig = args.rig || sceneSpec.camera || 'dolly';
  const durationInFrames = scene.durationInFrames;

  // --- who speaks in this scene? ---
  // story.characters is an array of IDs (Round 5 form); resolve through the library.
  const dialogue = sceneSpec.dialogue || [];
  const speakerId = dialogue[0] && dialogue[0].speaker;
  const charId = speakerId || (story.characters || [])[0];
  if (!charId) throw new Error('story has no characters');
  const charSpec = resolveCharacter(charId);
  if (!charSpec) throw new Error(`story references unknown character id "${charId}"`);

  const vrmRel = charSpec.modelUrl || charSpec.vrmUrl;
  const hasListener = (story.characters || []).some((c) => c !== charId);
  const yaw = hasListener ? SPEAKER_YAW : 0;
  const vrmScale = typeof charSpec.scale === 'number' ? charSpec.scale : 1;

  // --- frame window ---
  const line = scene.lines[0];
  const lineStart = line ? line.startFrame : scene.startFrame;
  // Default: start 1.0 s into the line so the voice is actually running.
  const start = args.start !== null ? args.start : lineStart + 30;
  const frames = [];
  for (let i = 0; i < args.count; i += 1) frames.push(start + i * args.step);
  const lastFrame = frames[frames.length - 1];
  if (lastFrame >= timeline.durationInFrames) {
    throw new Error(
      `frame ${lastFrame} is past the end of the film (${timeline.durationInFrames} frames)`
    );
  }

  console.log('='.repeat(78));
  console.log(`MOTION PROOF — scene "${scene.id}" (${sceneSpec.name || ''})`);
  console.log('='.repeat(78));
  console.log(`story          : ${args.story}`);
  console.log(`shot / rig     : ${shot} / ${rig}   (native: ${sceneSpec.shot || '-'} / ${sceneSpec.camera || '-'})`);
  console.log(`speaker        : ${charSpec.id} (${charSpec.vrmUrl || charSpec.modelUrl}) scale=${vrmScale}`);
  console.log(`scene frames   : ${scene.startFrame}..${scene.startFrame + durationInFrames - 1}`);
  console.log(`line audio     : frames ${lineStart}..${(line ? line.startFrame + line.durationInFrames : '-')}`);
  console.log(`measured frames: ${frames.join(', ')}  (every ${args.step} frames)`);
  console.log('');

  // --- character boxes (model space -> world) ---
  const vrmPath = path.resolve(ROOT, 'public', vrmRel.replace(/^public\//, ''));
  const boxes = characterBoxes(fs.readFileSync(vrmPath), vrmScale, yaw, SPEAKER_POSITION);
  console.log(
    `character scale: head bone y=${boxes.metrics.headY.toFixed(3)} m, ` +
      `shoulder y=${boxes.metrics.shoulderY.toFixed(3)} m, hips y=${boxes.metrics.hipsY.toFixed(3)} m, ` +
      `model height ~${boxes.metrics.modelHeight.toFixed(3)} m`
  );

  // --- render the frames ---
  console.log('[1/3] Bundling…');
  const { serveUrl } = await getOrCreateBundle({
    root: process.cwd(),
    cacheFile: path.resolve(ROOT, 'out/.bundle-cache.json'),
    publicDir: path.resolve(ROOT, 'public'),
    entryPoint: path.resolve(ROOT, 'remotion/index.ts'),
  });

  const storyOverride = JSON.parse(JSON.stringify(story));
  storyOverride.scenes[sceneIdx].shot = shot;
  storyOverride.scenes[sceneIdx].camera = rig;
  const inputProps = { story: storyOverride, voiceData, isMock: false, isDraft: false };

  const browserExecutable = process.env.CHROME || undefined;
  const composition = await selectComposition({
    serveUrl,
    id: 'StoryFilm',
    inputProps,
    ...(browserExecutable ? { browserExecutable } : {}),
  });
  const W = composition.width;
  const H = composition.height;

  const reviewDir = path.resolve(ROOT, 'out/review');
  fs.mkdirSync(reviewDir, { recursive: true });
  const stillPaths = [];

  console.log(`[2/3] Rendering ${frames.length} stills (${W}x${H})…`);
  for (const frame of frames) {
    const out = path.join(reviewDir, `motion-${args.tag}-f${String(frame).padStart(4, '0')}.png`);
    await renderStill({
      composition,
      serveUrl,
      output: out,
      frame,
      inputProps,
      timeoutInMilliseconds: 60000,
      ...(browserExecutable ? { browserExecutable } : {}),
    });
    stillPaths.push(out);
    process.stdout.write(`      frame ${frame} → ${path.basename(out)}\n`);
  }

  // --- measure ---
  console.log('[3/3] Measuring region differences…');
  const images = stillPaths.map((p) => decodePng(fs.readFileSync(p)));

  const rows = [];
  for (let i = 0; i < frames.length; i += 1) {
    const localFrame = frames[i] - scene.startFrame;
    const pose = getShotPose(shot, rig, localFrame, 30, durationInFrames);
    const cam = makeCamera(pose, shot, W, H);
    const px = {};
    const parts = {};
    for (const name of ['head', 'torso', 'arm']) {
      parts[name] = boxes.parts[name].map((c) => projectBox(c, cam, W, H));
      px[name] = unionRects(parts[name]);
    }
    const bg = backgroundDiff(images[i], images[Math.min(i + 1, images.length - 1)], px);
    const entry = { frame: frames[i], boxes: px, parts };
    if (i + 1 < images.length) {
      entry.head = regionDiff(images[i], images[i + 1], px.head);
      entry.torso = regionDiff(images[i], images[i + 1], px.torso);
      entry.arm = regionDiff(images[i], images[i + 1], px.arm);
      entry.headPct = regionChangedFraction(images[i], images[i + 1], px.head);
      entry.torsoPct = regionChangedFraction(images[i], images[i + 1], px.torso);
      entry.armPct = regionChangedFraction(images[i], images[i + 1], px.arm);
      entry.bgNext = backgroundDiff(images[i], images[i + 1], px);
    }
    rows.push(entry);
  }

  // --- report ---
  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(3).padStart(8) : '     n/a');
  console.log('');
  console.log('region boxes in screen pixels (frame 0) and per-pair mean abs pixel difference');
  console.log('');
  const b0 = rows[0].boxes;
  console.log(
    `  head  box x ${b0.head.x0}-${b0.head.x1}  y ${b0.head.y0}-${b0.head.y1}   ` +
      `(${b0.head.x1 - b0.head.x0}x${b0.head.y1 - b0.head.y0} px)`
  );
  console.log(
    `  torso box x ${b0.torso.x0}-${b0.torso.x1}  y ${b0.torso.y0}-${b0.torso.y1}   ` +
      `(${b0.torso.x1 - b0.torso.x0}x${b0.torso.y1 - b0.torso.y0} px)`
  );
  console.log(
    `  arm   box x ${b0.arm.x0}-${b0.arm.x1}  y ${b0.arm.y0}-${b0.arm.y1}   ` +
      `(${b0.arm.x1 - b0.arm.x0}x${b0.arm.y1 - b0.arm.y0} px)`
  );
  console.log('');
  console.log('  visible-change fraction: % of region pixels whose max-channel delta > 8/255');
  console.log('  frame pair        head    torso      arm   background  head-bg  torso-bg   arm-bg');
  for (let i = 0; i + 1 < rows.length; i += 1) {
    const r = rows[i];
    console.log(
      `  ${String(r.frame).padStart(4)} -> ${String(rows[i + 1].frame).padStart(4)}   ` +
        `${fmt(r.head)} ${fmt(r.torso)} ${fmt(r.arm)} ${fmt(r.bgNext)}   ` +
        `${fmt(r.head - r.bgNext)} ${fmt(r.torso - r.bgNext)} ${fmt(r.arm - r.bgNext)}`
    );
  }

  const pairs = rows.slice(0, -1);
  const mean = (key) =>
    pairs.reduce((acc, r) => acc + (r[key] - r.bgNext), 0) / pairs.length;
  const max = (key) => Math.max(...pairs.map((r) => r[key] - r.bgNext));
  console.log('');
  console.log(
    `  MEAN above background:  head ${mean('head').toFixed(3)}   ` +
      `torso ${mean('torso').toFixed(3)}   arm ${mean('arm').toFixed(3)}`
  );
  console.log(
    `  MAX  above background:  head ${max('head').toFixed(3)}   ` +
      `torso ${max('torso').toFixed(3)}   arm ${max('arm').toFixed(3)}`
  );
  console.log(
    `  MEAN raw (incl. camera): head ${(pairs.reduce((a, r) => a + r.head, 0) / pairs.length).toFixed(3)}   ` +
      `torso ${(pairs.reduce((a, r) => a + r.torso, 0) / pairs.length).toFixed(3)}   ` +
      `arm ${(pairs.reduce((a, r) => a + r.arm, 0) / pairs.length).toFixed(3)}   ` +
      `background ${(pairs.reduce((a, r) => a + r.bgNext, 0) / pairs.length).toFixed(3)}`
  );
  const meanPct = (key) => pairs.reduce((acc, r) => acc + r[key], 0) / pairs.length;
  console.log('');
  console.log(
    `  MEAN visible-change fraction:  head ${meanPct('headPct').toFixed(1)}%   ` +
      `torso ${meanPct('torsoPct').toFixed(1)}%   arm ${meanPct('armPct').toFixed(1)}%`
  );
  const bgPct = pairs.reduce((acc, r) => acc + regionChangedFraction(
    images[0], images[1], { x0: 0, y0: 0, x1: 64, y1: 64 }
  ), 0) / pairs.length;
  console.log(`  (a 64x64 background reference patch changes ${bgPct.toFixed(1)}% — the noise floor)`);

  // --- strip ---
  // Crop every frame to the union of the character boxes (padded), then tile
  // the crops side by side with the region boxes outlined.
  const union = boxesUnion(rows.map((r) => r.boxes));
  const pad = 40;
  const crop = {
    x0: Math.max(0, union.x0 - pad),
    y0: Math.max(0, union.y0 - pad),
    x1: Math.min(W, union.x1 + pad),
    y1: Math.min(H, union.y1 + pad),
  };
  const cellW = 360;
  const cellH = Math.max(1, Math.round((crop.y1 - crop.y0) * (cellW / (crop.x1 - crop.x0))));
  const sheetW = cellW * images.length;
  const sheetH = cellH;
  const sheet = Buffer.alloc(sheetW * sheetH * 4);
  for (let i = 3; i < sheet.length; i += 4) sheet[i] = 0xff;

  images.forEach((img, i) => {
    const cropped = cropImage(img, crop);
    const scaled = resizeRgba(cropped, crop.x1 - crop.x0, crop.y1 - crop.y0, cellW, cellH);
    const sx = (box) => ({
      x0: Math.round(((box.x0 - crop.x0) * cellW) / (crop.x1 - crop.x0)),
      x1: Math.round(((box.x1 - crop.x0) * cellW) / (crop.x1 - crop.x0)),
      y0: Math.round(((box.y0 - crop.y0) * cellH) / (crop.y1 - crop.y0)),
      y1: Math.round(((box.y1 - crop.y0) * cellH) / (crop.y1 - crop.y0)),
    });
    // Debug overlays (region boxes) are OFF by default — pass --debug to
    // show them. The plain strip is the deliverable.
    if (args.debug) {
      drawRect(scaled, cellW, sx(rows[i].boxes.head), [255, 60, 60]);
      drawRect(scaled, cellW, sx(rows[i].boxes.torso), [60, 255, 90]);
      for (const part of rows[i].parts.arm) drawRect(scaled, cellW, sx(part), [80, 150, 255]);
    }
    for (let y = 0; y < cellH; y += 1) {
      const srcStart = y * cellW * 4;
      const dstStart = (y * sheetW + i * cellW) * 4;
      scaled.copy(sheet, dstStart, srcStart, srcStart + cellW * 4);
    }
  });

  const stripPath = args.out
    ? path.resolve(ROOT, args.out)
    : path.join(reviewDir, `motion-strip-${args.tag}.png`);
  fs.writeFileSync(stripPath, encodePng({ width: sheetW, height: sheetH, data: sheet }));
  console.log('');
  console.log(`  strip written: ${stripPath} (${sheetW}x${sheetH})`);
  console.log(`  frames written: ${stillPaths.map((p) => path.basename(p)).join(', ')}`);
  console.log(
    args.debug
      ? '  legend: red = head, green = torso, blue = arm (debug overlays ON)'
      : '  plain strip (no debug overlays); pass --debug to show region boxes'
  );
}

function boxesUnion(list) {
  const out = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const set of list) {
    for (const box of Object.values(set)) {
      out.x0 = Math.min(out.x0, box.x0);
      out.y0 = Math.min(out.y0, box.y0);
      out.x1 = Math.max(out.x1, box.x1);
      out.y1 = Math.max(out.y1, box.y1);
    }
  }
  return out;
}

function cropImage(img, box) {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const srcStart = ((y + box.y0) * img.width + box.x0) * 4;
    img.data.copy(out, y * w * 4, srcStart, srcStart + w * 4);
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((err) => {
    console.error('Motion proof failed:', err);
    process.exit(1);
  });
}
