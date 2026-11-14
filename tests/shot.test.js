/**
 * @fileoverview Phase D: shot types, framing math, blocking and determinism.
 *
 * getShotPose() must produce the framing it documents:
 *  - talk shots (close-up / medium / over-shoulder) keep the speaker between
 *    40% and 60% of the frame height — measured by projecting the shipped
 *    1.8 m character through the fov 45° PerspectiveCamera StoryFilm uses,
 *    clipping to the frame (a close-up legitimately cuts the feet off);
 *  - the wide shot stays an establishing shot (<30% character) with the
 *    horizon on the lower third (~0.65 from the top);
 *  - rigs behave: dolly pushes in, orbit never goes behind the set (z > 0),
 *    crane never dips below the ground plane;
 *  - every pose is a pure function of (shot, rig, frame) — identical output
 *    across repeated calls (Phase 1 contract), and an unknown shot throws
 *    with the valid list instead of silently substituting.
 *
 * Also guards the story-side vocabulary: KNOWN_SHOTS must equal
 * Object.keys(SHOT_SPECS), the blocking yaws must face each other, and the
 * bundled Hanuman TTFs must exist with valid TrueType magic bytes.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getShotPose,
  SHOT_SPECS,
  SPEAKER_POSITION,
  SPEAKER_YAW,
  LISTENER_POSITION,
  LISTENER_YAW
} from '../remotion/lib/camera.ts';
import { KNOWN_SHOTS } from '../src/core/story.js';
import { SUBTITLE_LAYOUT } from '../remotion/lib/subtitles.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STORY_FILM = path.join(ROOT, 'remotion', 'compositions', 'StoryFilm.tsx');

const FPS = 30;
const DUR = 120;
const SHOTS = Object.keys(SHOT_SPECS);
const RIGS = ['dolly', 'orbit', 'crane', 'handheld', 'static'];

// --- Projection helper: matches StoryFilm's PerspectiveCamera (fov 45) ------

const TAN_HALF_FOV = Math.tan((45 / 2) * (Math.PI / 180));
const CHARACTER_HEAD_M = 1.8; // shipped Quaternius character at scale 0.55

/**
 * Fraction of the frame height occupied by the speaker (standing at the
 * origin, feet y=0 → head y=1.8), clipped to the visible frame.
 */
function visibleSpeakerFraction(pose) {
  const C = pose.position;
  const T = pose.lookAt;
  let d = [T[0] - C[0], T[1] - C[1], T[2] - C[2]];
  const dl = Math.hypot(d[0], d[1], d[2]);
  d = d.map((v) => v / dl);
  // camera right = normalize(cross(forward, worldUp)) with worldUp = +y
  let r = [-d[2], 0, d[0]];
  const rl = Math.hypot(r[0], r[1], r[2]);
  r = r.map((v) => v / rl);
  const u = [
    r[1] * d[2] - r[2] * d[1],
    r[2] * d[0] - r[0] * d[2],
    r[0] * d[1] - r[1] * d[0]
  ];
  const ndcY = (P) => {
    const v = [P[0] - C[0], P[1] - C[1], P[2] - C[2]];
    const z = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
    const y = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
    return y / z / TAN_HALF_FOV;
  };
  const head = ndcY([0, CHARACTER_HEAD_M, 0]);
  const feet = ndcY([0, 0, 0]);
  const top = Math.min(1, Math.max(head, feet));
  const bottom = Math.max(-1, Math.min(head, feet));
  return Math.max(0, (top - bottom) / 2);
}

/** Horizon position measured from the top of the frame (0 = top, 1 = bottom). */
function horizonFromTop(pose) {
  const C = pose.position;
  const T = pose.lookAt;
  let d = [T[0] - C[0], T[1] - C[1], T[2] - C[2]];
  const dl = Math.hypot(d[0], d[1], d[2]);
  d = d.map((v) => v / dl);
  let r = [-d[2], 0, d[0]];
  const rl = Math.hypot(r[0], r[1], r[2]);
  r = r.map((v) => v / rl);
  const u = [
    r[1] * d[2] - r[2] * d[1],
    r[2] * d[0] - r[0] * d[2],
    r[0] * d[1] - r[1] * d[0]
  ];
  const ndcY = (P) => {
    const v = [P[0] - C[0], P[1] - C[1], P[2] - C[2]];
    const z = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
    const y = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
    return y / z / TAN_HALF_FOV;
  };
  // A point on the ground plane (y=0) infinitely far along the view bearing.
  const hl = Math.hypot(d[0], d[2]) || 1;
  const far = [C[0] + (d[0] / hl) * 1e6, 0, C[2] + (d[2] / hl) * 1e6];
  return 0.5 - 0.5 * ndcY(far);
}

// ---------------------------------------------------------------------------
// 1. Framing: talk shots 40–60% of frame height, wide stays establishing.
// ---------------------------------------------------------------------------

test('talk shots hold 40–60% of the frame height for every rig and frame', () => {
  const talkShots = ['close-up', 'medium', 'over-shoulder'];
  for (const shot of talkShots) {
    for (const rig of RIGS) {
      for (let frame = 0; frame <= DUR; frame += 5) {
        const frac = visibleSpeakerFraction(getShotPose(shot, rig, frame, FPS, DUR));
        assert.ok(
          frac >= 0.4 && frac <= 0.6,
          `${shot}/${rig}@${frame}: speaker occupies ${(frac * 100).toFixed(1)}% ` +
            `of frame height, expected 40–60%`
        );
      }
    }
  }
});

test('wide shot keeps the character under 30% and the horizon on the lower third', () => {
  for (const rig of RIGS) {
    for (let frame = 0; frame <= DUR; frame += 5) {
      const pose = getShotPose('wide', rig, frame, FPS, DUR);
      const frac = visibleSpeakerFraction(pose);
      assert.ok(
        frac < 0.3,
        `wide/${rig}@${frame}: character is ${(frac * 100).toFixed(1)}% of frame, expected <30%`
      );
      const horizon = horizonFromTop(pose);
      // The horizon must never climb into the upper frame — temple + sky own
      // it. (The crane's low-angle start dips it as far as 0.884, which is
      // still below the settled 0.648 ≈ lower-third framing.)
      assert.ok(
        horizon >= 0.6 && horizon <= 0.9,
        `wide/${rig}@${frame}: horizon at ${horizon.toFixed(3)} from top, expected 0.6–0.9`
      );
      if (rig === 'static') {
        assert.ok(
          Math.abs(horizon - 0.648) < 0.01,
          `wide/static: settled horizon ${horizon.toFixed(3)} should sit on the lower third (~0.648)`
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Rig behaviour.
// ---------------------------------------------------------------------------

test('dolly pushes in: start distance > end distance for every shot', () => {
  for (const shot of SHOTS) {
    const start = getShotPose(shot, 'dolly', 0, FPS, DUR);
    const end = getShotPose(shot, 'dolly', DUR, FPS, DUR);
    const dist = (p) =>
      Math.hypot(
        p.position[0] - p.lookAt[0],
        p.position[1] - p.lookAt[1],
        p.position[2] - p.lookAt[2]
      );
    assert.ok(
      dist(start) > dist(end),
      `${shot}: dolly distance ${dist(start).toFixed(2)} → ${dist(end).toFixed(2)} is not a push-in`
    );
  }
});

test('orbit stays in front of the set (camera z > 0) for every shot', () => {
  for (const shot of SHOTS) {
    for (let frame = 0; frame <= DUR; frame += 5) {
      const pose = getShotPose(shot, 'orbit', frame, FPS, DUR);
      assert.ok(
        pose.position[2] > 0,
        `${shot}/orbit@${frame}: camera z = ${pose.position[2].toFixed(2)} would look ` +
          'at the set from behind (empty desert backdrop)'
      );
    }
  }
});

test('crane never dips below the ground plane', () => {
  for (const shot of SHOTS) {
    for (let frame = 0; frame <= DUR; frame += 5) {
      const pose = getShotPose(shot, 'crane', frame, FPS, DUR);
      assert.ok(
        pose.position[1] >= 0.4,
        `${shot}/crane@${frame}: camera y = ${pose.position[1].toFixed(2)} is at/below ground`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 2b. Two-character staging: the listener must never block the speaker.
// ---------------------------------------------------------------------------

test('listener never occludes the speaker in any shot, rig or frame', () => {
  // Project both heads and require their screen-space circles (head half
  // width ≈ 0.16 m) to stay apart. Regression guard: the medium orbit's old
  // ±1.0 arc swept through the listener's bearing (-0.637 rad) and lined the
  // two heads up 4 px apart at f41 — the listener, 1.8 m closer to camera,
  // completely covered the speaker mid-sentence.
  const HEAD_R = 0.16;
  const headRadiusPx = (depth) => (HEAD_R / (depth * 2 * TAN_HALF_FOV * (16 / 9))) * 1920;
  const project = (pose, P) => {
    const C = pose.position;
    const T = pose.lookAt;
    let d = [T[0] - C[0], T[1] - C[1], T[2] - C[2]];
    const dl = Math.hypot(d[0], d[1], d[2]);
    d = d.map((v) => v / dl);
    let r = [-d[2], 0, d[0]];
    const rl = Math.hypot(r[0], r[1], r[2]);
    r = r.map((v) => v / rl);
    const v = [P[0] - C[0], P[1] - C[1], P[2] - C[2]];
    const z = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
    const x = v[0] * r[0] + v[1] * r[1] + v[2] * r[2];
    return { px: (x / z / (TAN_HALF_FOV * (16 / 9)) + 1) / 2 * 1920, depth: z };
  };
  const speakerHead = [0, 1.7, 0];
  const listenerHead = [LISTENER_POSITION[0], 1.7, LISTENER_POSITION[2]];
  for (const shot of SHOTS) {
    for (const rig of RIGS) {
      for (let frame = 0; frame <= DUR; frame += 4) {
        const pose = getShotPose(shot, rig, frame, FPS, DUR);
        const s = project(pose, speakerHead);
        const l = project(pose, listenerHead);
        if (s.depth <= 0.1 || l.depth <= 0.1) continue;
        const clearance =
          Math.abs(s.px - l.px) - headRadiusPx(s.depth) - headRadiusPx(l.depth);
        assert.ok(
          clearance > 0,
          `${shot}/${rig}@${frame}: listener covers the speaker ` +
            `(heads ${Math.abs(s.px - l.px).toFixed(0)}px apart, need ` +
            `${(headRadiusPx(s.depth) + headRadiusPx(l.depth)).toFixed(0)}px)`
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Determinism: pure function of (shot, rig, frame).
// ---------------------------------------------------------------------------
test('getShotPose is deterministic across repeated calls', () => {
  const frames = [0, 13, 60, 119];
  for (const shot of SHOTS) {
    for (const rig of RIGS) {
      for (const frame of frames) {
        const a = getShotPose(shot, rig, frame, FPS, DUR);
        const b = getShotPose(shot, rig, frame, FPS, DUR);
        assert.deepEqual(
          a,
          b,
          `${shot}/${rig}@${frame}: two evaluations of the same frame differ`
        );
        assert.ok(
          a.position.every((v) => Number.isFinite(v)) &&
            a.lookAt.every((v) => Number.isFinite(v)),
          `${shot}/${rig}@${frame}: pose contains non-finite values`
        );
      }
    }
  }
});

test('getShotPose throws on an unknown shot with the valid list', () => {
  assert.throws(
    () => getShotPose('extreme-wide', 'dolly', 0, FPS, DUR),
    (err) =>
      /unknown shot "extreme-wide"/i.test(err.message) &&
      err.message.includes('close-up, medium, wide, over-shoulder')
  );
});

// ---------------------------------------------------------------------------
// 4. Story vocabulary sync + conversation blocking.
// ---------------------------------------------------------------------------

test('KNOWN_SHOTS matches Object.keys(SHOT_SPECS) exactly', () => {
  assert.deepEqual([...KNOWN_SHOTS].sort(), Object.keys(SHOT_SPECS).sort());
});

test('speaker and listener yaws make them face each other', () => {
  // facing direction of a yaw θ is (sin θ, 0, cos θ)
  const facing = (yaw) => [Math.sin(yaw), Math.cos(yaw)];
  const toward = (from, to) => {
    const v = [to[0] - from[0], to[2] - from[2]];
    const l = Math.hypot(v[0], v[1]);
    return [v[0] / l, v[1] / l];
  };
  const sf = facing(SPEAKER_YAW);
  const st = toward(SPEAKER_POSITION, LISTENER_POSITION);
  assert.ok(
    Math.abs(sf[0] - st[0]) < 1e-9 && Math.abs(sf[1] - st[1]) < 1e-9,
    'speaker does not face the listener'
  );
  const lf = facing(LISTENER_YAW);
  const lt = toward(LISTENER_POSITION, SPEAKER_POSITION);
  assert.ok(
    Math.abs(lf[0] - lt[0]) < 1e-9 && Math.abs(lf[1] - lt[1]) < 1e-9,
    'listener does not face the speaker'
  );
  assert.notDeepEqual(SPEAKER_POSITION, LISTENER_POSITION, 'blocking marks must differ');
});

// ---------------------------------------------------------------------------
// 5. StoryFilm wiring (grep guards) + bundled Khmer caption font.
// ---------------------------------------------------------------------------

function stripComments(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? code.length : end + 2;
      out += ' ';
      continue;
    }
    if (ch === '/' && next === '/') {
      const end = code.indexOf('\n', i + 2);
      i = end === -1 ? code.length : end;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

test('StoryFilm dispatches on spec.shot and stages the two-character blocking', () => {
  const src = stripComments(readFileSync(STORY_FILM, 'utf8'));
  assert.ok(/spec\.shot/.test(src), 'StoryFilm must read the per-scene shot field');
  assert.ok(/getShotPose\(/.test(src), 'StoryFilm must evaluate shots via getShotPose');
  assert.ok(/position=\{SPEAKER_POSITION\}/.test(src), 'speaker must stand on its mark');
  assert.ok(/position=\{LISTENER_POSITION\}/.test(src), 'listener must stand on its mark');
  assert.ok(/rotationY=\{hasListener \? SPEAKER_YAW : 0\}/.test(src),
    'a solo character keeps facing the camera; two characters face each other');
  assert.ok(/rotationY=\{LISTENER_YAW\}/.test(src), 'listener must face the speaker');
});

test('StoryFilm loads the bundled Hanuman caption font behind delayRender', () => {
  const src = stripComments(readFileSync(STORY_FILM, 'utf8'));
  assert.ok(/@font-face/.test(src), 'StoryFilm must register the caption font');
  assert.ok(/font-display:\s*block/.test(src), 'font-display must be block (no fallback flash)');
  assert.ok(/delayRender\('Loading Hanuman subtitle font'\)/.test(src),
    'renders must wait for the font (fallback typeface would break determinism)');
  assert.ok(/fonts\/Hanuman-Regular\.ttf/.test(src), 'regular weight must be referenced');
  assert.ok(/fonts\/Hanuman-Bold\.ttf/.test(src), 'bold weight must be referenced');
  assert.ok(/SUBTITLE_LAYOUT/.test(src), 'caption geometry must come from SUBTITLE_LAYOUT');
  assert.ok(
    src.indexOf('delayRender') < src.indexOf('return ('),
    'the font gate must be registered before any render path returns'
  );
});

test('bundled Hanuman TTFs exist with valid TrueType magic bytes', () => {
  for (const name of ['Hanuman-Regular.ttf', 'Hanuman-Bold.ttf']) {
    const file = path.join(ROOT, 'public', 'fonts', name);
    const buf = readFileSync(file);
    assert.ok(buf.length > 10000, `${name}: suspiciously small (${buf.length} B)`);
    assert.deepEqual(
      [buf[0], buf[1], buf[2], buf[3]],
      [0x00, 0x01, 0x00, 0x00],
      `${name}: not a TrueType font (magic ${buf.subarray(0, 4).toString('hex')})`
    );
  }
});

test('SUBTITLE_LAYOUT keeps captions inside the 5% title-safe area', () => {
  const frameW = 1920;
  const frameH = 1080;
  const safe = 0.05;
  assert.ok(
    SUBTITLE_LAYOUT.bottomPx >= frameH * safe,
    `bottom margin ${SUBTITLE_LAYOUT.bottomPx}px < ${(frameH * safe)}px title-safe`
  );
  const sideMargin = ((100 - SUBTITLE_LAYOUT.maxWidthPercent) / 100) * frameW;
  assert.ok(
    sideMargin >= frameW * safe,
    `side margin ${sideMargin}px < ${frameW * safe}px title-safe`
  );
  assert.ok(
    SUBTITLE_LAYOUT.lineHeight >= 1.4,
    'lineHeight must leave headroom for Khmer ascenders/descenders'
  );
});
