/**
 * @fileoverview Tests for the Phase 1 Deterministic Frame Contract.
 *
 * Enforces, as CI-runnable checks:
 *  1. `useFrame` from @react-three/fiber is never used inside the Remotion
 *     project (wall-clock dependency → frame drift).
 *  2. `Math.random()`, `THREE.Clock`, `performance.now`, `Date.now` never
 *     appear in Remotion sources.
 *  3. Animated components derive state from `useCurrentFrame()`.
 *  4. Every `<ThreeCanvas>` sets explicit `width` and `height`.
 *  5. Camera rigs and seeded randomness are *pure functions of the frame*:
 *     identical inputs → identical outputs (runtime unit tests on the
 *     TypeScript lib sources via Node type stripping).
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REMOTION_DIR = fileURLToPath(new URL('../remotion', import.meta.url));

/**
 * Remove comments so the static rules ban *usage*, not documentation
 * (our JSDoc intentionally mentions "Math.random" to explain the ban).
 * Handles block comments, line comments, and skips string/template literals.
 */
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
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = findStringEnd(code, i);
      out += code.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;

  function findStringEnd(src, start) {
    const quote = src[start];
    for (let j = start + 1; j < src.length; j += 1) {
      if (src[j] === '\\') {
        j += 1;
        continue;
      }
      if (src[j] === quote) {
        return j;
      }
    }
    return src.length - 1;
  }
}

const codeOf = (file) => stripComments(readFileSync(file, 'utf8'));

function listSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSources(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const sources = listSources(REMOTION_DIR);
const codes = new Map(sources.map((file) => [file, codeOf(file)]));

test('remotion project contains TypeScript sources', () => {
  assert.ok(sources.length >= 8, `expected >= 8 sources, found ${sources.length}`);
});

test('RULE: useFrame from @react-three/fiber never appears in Remotion sources', () => {
  const offenders = sources.filter((file) => /\buseFrame\b/.test(codes.get(file)));
  assert.deepEqual(offenders, [], `wall-clock useFrame found in: ${offenders.join(', ')}`);
});

test('RULE: Math.random() never appears in Remotion sources', () => {
  const offenders = sources.filter((file) => /Math\.random\s*\(/.test(codes.get(file)));
  assert.deepEqual(offenders, [], `unseeded randomness found in: ${offenders.join(', ')}`);
});

test('RULE: no wall-clock timers (THREE.Clock, getElapsedTime, performance.now, Date.now)', () => {
  const banned = /new\s+THREE\.Clock|getElapsedTime|performance\.now|Date\.now/;
  const offenders = sources.filter((file) => banned.test(codes.get(file)));
  assert.deepEqual(offenders, [], `wall-clock time found in: ${offenders.join(', ')}`);
});

test('RULE: animated components derive motion from useCurrentFrame()', () => {
  const animated = ['compositions/KuanimationScene.tsx', 'compositions/DeterminismTest.tsx', 'compositions/ProceduralCharacter.tsx', 'compositions/DustParticles.tsx'];
  for (const rel of animated) {
    const file = path.join(REMOTION_DIR, rel);
    assert.ok(
      /\buseCurrentFrame\s*\(/.test(codes.get(file)),
      `${rel} does not call useCurrentFrame()`
    );
  }
});

test('RULE: every <ThreeCanvas> sets explicit width and height props', () => {
  const tags = [];
  for (const file of sources) {
    const matches = codes.get(file).match(/<ThreeCanvas\b[\s\S]*?>/g) || [];
    for (const tag of matches) {
      tags.push({ file, tag });
      assert.ok(/\bwidth=/.test(tag), `ThreeCanvas missing explicit width in ${file}`);
      assert.ok(/\bheight=/.test(tag), `ThreeCanvas missing explicit height in ${file}`);
    }
  }
  assert.ok(tags.length >= 1, 'expected at least one <ThreeCanvas> usage');
});

// ---------------------------------------------------------------------------
// Runtime purity checks on the pure TypeScript lib functions.
// ---------------------------------------------------------------------------

test('camera rigs are pure deterministic functions of the frame index', async () => {
  const { getCameraPose } = await import('../remotion/lib/camera.ts');

  const fps = 30;
  const duration = 90;
  for (const rig of ['dolly', 'orbit', 'crane', 'handheld', 'static']) {
    for (let frame = 0; frame < duration; frame += 7) {
      const a = getCameraPose(rig, frame, fps, duration);
      const b = getCameraPose(rig, frame, fps, duration);
      assert.deepEqual(a, b, `${rig} rig not deterministic at frame ${frame}`);
      for (const v of [...a.position, ...a.lookAt]) {
        assert.ok(Number.isFinite(v), `${rig} rig produced non-finite value at frame ${frame}`);
      }
    }
  }
});

test('dolly rig pushes the camera forward with eased, monotonic z', async () => {
  const { getCameraPose } = await import('../remotion/lib/camera.ts');
  const fps = 30;
  const duration = 90;
  let previous = getCameraPose('dolly', 0, fps, duration).position[2];
  assert.equal(previous, 15, 'dolly must start at z=15');
  for (let frame = 1; frame < duration; frame += 1) {
    const z = getCameraPose('dolly', frame, fps, duration).position[2];
    assert.ok(z <= previous + 1e-12, `dolly z increased at frame ${frame}`);
    previous = z;
  }
  // Clamped interpolation settles exactly on the end value at the last frame.
  assert.equal(getCameraPose('dolly', duration, fps, duration).position[2], 12,
    'dolly must settle at z=12 at the final frame');
});

test('handheld rig shake stays bounded (no exploding values)', async () => {
  const { getCameraPose } = await import('../remotion/lib/camera.ts');
  const duration = 300;
  for (let frame = 0; frame < duration; frame += 3) {
    const [x, y, z] = getCameraPose('handheld', frame, 30, duration).position;
    assert.ok(Math.abs(x) <= 0.16 && Math.abs(y - 5) <= 0.16, `shake out of bounds at frame ${frame}`);
    assert.ok(Math.abs(z - 12) < 1e-9);
  }
});

test('seeded randomness: makeDust is deterministic and Math.random-free', async () => {
  const { makeDust } = await import('../remotion/lib/randomness.ts');
  const a = makeDust(24);
  const b = makeDust(24);
  assert.deepEqual(a, b, 'makeDust must return identical output for identical input');
  assert.equal(a.length, 24);
  for (const mote of a) {
    assert.ok(mote.x >= -13 && mote.x <= 13);
    assert.ok(mote.y >= 0.4 && mote.y <= 7);
    assert.ok(mote.speed >= 0.15 && mote.speed <= 0.5);
    assert.ok(mote.size >= 0.03 && mote.size <= 0.08);
  }
  // Prefix stability: a shorter field is exactly the prefix of a longer one.
  assert.deepEqual(a.slice(0, 10), makeDust(10), 'field must be prefix-stable across counts');
});

test('lookAtQuaternion matches three.js camera.lookAt orientation', async () => {
  const THREE = (await import('three')).default ?? (await import('three'));
  const { lookAtQuaternion } = await import('../remotion/lib/camera.ts');

  const position = [3, 6, -4];
  const target = [0, 2, 5];

  const ref = new THREE.PerspectiveCamera();
  ref.position.set(...position);
  ref.lookAt(...target);

  const q = lookAtQuaternion(position, target);
  const angle = ref.quaternion.angleTo(q);
  assert.ok(angle < 1e-6, `quaternion mismatch: ${angle} rad`);
});
