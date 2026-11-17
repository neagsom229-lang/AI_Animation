/**
 * @fileoverview Phase B: GLB character that animates deterministically.
 *
 * Enforces, as CI-runnable checks:
 *  1. The pure action→clip mapping / cross-fade weights are deterministic,
 *     sum to 1, and always weight Idle = 1 at frame 0 (never a T-pose).
 *  2. The head-nod lip-sync gesture is exactly 0 when the voice stops.
 *  3. Shipped character GLBs really contain the Idle and Walk clips and
 *     stay under the 5 MB budget.
 *  4. GlbCharacter drives the mixer with `mixer.setTime(frame / fps)` and
 *     never with a clock (`mixer.update`, THREE.Clock, wall-clock timers).
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GLB_CHARACTER = path.join(ROOT, 'remotion', 'compositions', 'GlbCharacter.tsx');
const STORY_FILM = path.join(ROOT, 'remotion', 'compositions', 'StoryFilm.tsx');

// ---------------------------------------------------------------------------
// 1. Pure cross-fade weights.
// ---------------------------------------------------------------------------

test('crossFadeWeights is a pure function of (action, frame, fps)', async () => {
  const { crossFadeWeights } = await import('../remotion/lib/character-anim.ts');
  for (const action of ['idle', 'walk', 'talk', 'turn', 'react', undefined, 'unknown-xyz']) {
    for (const frame of [0, 1, 7, 30, 120]) {
      const a = crossFadeWeights(action, frame, 30);
      const b = crossFadeWeights(action, frame, 30);
      assert.deepEqual(a, b, `not deterministic for ${action} @ ${frame}`);
      assert.ok(a.idle >= 0 && a.idle <= 1, 'idle weight out of range');
      assert.ok(a.walk >= 0 && a.walk <= 1, 'walk weight out of range');
      assert.ok(
        Math.abs(a.idle + a.walk - 1) < 1e-12,
        `weights must sum to 1 for ${action} @ ${frame}`
      );
    }
  }
});

test('frame 0 always plays Idle at full weight (never a T-pose)', async () => {
  const { crossFadeWeights } = await import('../remotion/lib/character-anim.ts');
  for (const action of ['idle', 'walk', 'talk', 'turn', 'react']) {
    const w = crossFadeWeights(action, 0, 30);
    assert.equal(w.idle, 1, `action "${action}" must start on Idle at frame 0`);
    assert.equal(w.walk, 0, `action "${action}" must not start mid-walk at frame 0`);
  }
});

test('walk scenes cross-fade from Idle to Walk within 0.4 s', async () => {
  const { crossFadeWeights, CROSS_FADE_SECONDS } = await import('../remotion/lib/character-anim.ts');
  const fps = 30;
  const fadeFrames = CROSS_FADE_SECONDS * fps;
  const start = crossFadeWeights('walk', 0, fps);
  const mid = crossFadeWeights('walk', Math.round(fadeFrames / 2), fps);
  const end = crossFadeWeights('walk', Math.ceil(fadeFrames), fps);
  assert.equal(start.idle, 1);
  assert.ok(mid.walk > start.walk && mid.walk < end.walk, 'monotonic cross-fade');
  assert.ok(Math.abs(end.walk - 1) < 1e-9, 'Walk fully weighted after the fade');
  // Non-walk actions never blend in Walk.
  for (const action of ['idle', 'talk', 'turn', 'react']) {
    assert.equal(crossFadeWeights(action, 999, fps).walk, 0, `${action} must not walk`);
  }
});

// ---------------------------------------------------------------------------
// 2. Lip-sync fallback: nod stops exactly when the voice stops.
// ---------------------------------------------------------------------------

test('headNodRadians is 0 at zero envelope and grows monotonically', async () => {
  const { headNodRadians } = await import('../remotion/lib/character-anim.ts');
  assert.equal(headNodRadians(0), 0, 'silent frame must produce no head motion');
  assert.equal(headNodRadians(-3), 0, 'negative envelope clamps to 0');
  let previous = -1;
  for (const amp of [0, 0.1, 0.25, 0.5, 0.75, 1, 1.5]) {
    const nod = headNodRadians(amp);
    assert.ok(nod >= previous, 'nod must be monotonic in envelope');
    assert.ok(nod <= 0.22 * 1.5, 'nod must stay bounded');
    previous = nod;
  }
  assert.ok(headNodRadians(1) > 0, 'loud voice must move the head');
});

test('envelopeAmplitude returns 0 outside the line audio span', async () => {
  const { envelopeAmplitude } = await import('../remotion/lib/anima.ts');
  const env = [0, 0.5, 1, 0.5, 0];
  // Before the line starts.
  assert.equal(envelopeAmplitude(env, 0, 30, 60), 0);
  // After the line ends (20 Hz → 5 samples = 0.25 s of audio).
  assert.equal(envelopeAmplitude(env, 60 + 30 * 1, 30, 60), 0);
  // Inside the line the envelope is sampled.
  assert.ok(envelopeAmplitude(env, 60 + 5, 30, 60) > 0);
  // No envelope at all → mouth/head rest.
  assert.equal(envelopeAmplitude(undefined, 10, 30, 0), 0);
});

// ---------------------------------------------------------------------------
// 3. Shipped GLB models: clips + size budget.
// ---------------------------------------------------------------------------

function readGlbJson(relPath) {
  const buf = readFileSync(path.join(ROOT, relPath));
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `${relPath} is not a GLB (bad magic)`);
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
}

for (const rel of [
  'public/models/characters/casual_male.glb',
  'public/models/characters/casual_female.glb'
]) {
  test(`${rel} ships Idle + Walk clips and is < 5 MB`, () => {
    const json = readGlbJson(rel);
    const names = (json.animations || []).map((a) => a.name);
    assert.ok(names.includes('Idle'), `missing Idle clip (have: ${names.join(', ')})`);
    assert.ok(names.includes('Walk'), `missing Walk clip (have: ${names.join(', ')})`);
    const size = statSync(path.join(ROOT, rel)).size;
    assert.ok(size < 5 * 1024 * 1024, `${rel} is ${(size / 1048576).toFixed(2)} MB`);
    // Head/Neck bones exist for the bone-nod lip-sync fallback.
    const nodeNames = (json.nodes || []).map((n) => n.name);
    assert.ok(nodeNames.includes('Head'), 'Head bone missing (lip-sync fallback)');
    assert.ok(nodeNames.includes('Neck'), 'Neck bone missing (lip-sync fallback)');
    // No morph targets in this pack — documents why the bone fallback exists.
    const hasMorphs = (json.meshes || []).some((m) =>
      (m.primitives || []).some((p) => p.targets && p.targets.length > 0)
    );
    assert.equal(hasMorphs, false, 'pack was expected to have no morph targets');
  });
}

// ---------------------------------------------------------------------------
// 4. Static rules: frame-driven mixer, no clock.
//    Comments are stripped first so JSDoc that *documents* the bans (e.g.
//    "never call mixer.update(deltaTime)") does not trip the rules.
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

test('GlbCharacter seeks the mixer with mixer.setTime(frame / fps)', () => {
  const src = stripComments(readFileSync(GLB_CHARACTER, 'utf8'));
  assert.ok(/mixer\.setTime\(/.test(src), 'GlbCharacter must call mixer.setTime(...)');
  assert.ok(
    /setTime\(frame \/ fps\)/.test(src),
    'mixer time must be exactly frame / fps (scene time)'
  );
  assert.ok(!/mixer\.update\(/.test(src), 'mixer.update(delta) is clock-driven — banned');
  assert.ok(!/THREE\.Clock/.test(src), 'THREE.Clock is wall-clock — banned');
  assert.ok(!/performance\.now|Date\.now/.test(src), 'wall-clock timers are banned');
  assert.ok(!/Math\.random\s*\(/.test(src), 'unseeded randomness is banned');
  assert.ok(/\buseFrame\b/.test(src) === false, 'useFrame is banned');
  // Lip-sync fallback wired to the voice envelope.
  assert.ok(/envelopeAmplitude\(/.test(src), 'lip-sync must sample the voice envelope');
  assert.ok(/headNodRadians\(/.test(src), 'bone-nod fallback must be applied');
});

test('StoryFilm renders the character through the VRM/GLB dispatch', () => {
  const src = readFileSync(STORY_FILM, 'utf8');
  // Speaker and listener are dispatched per cast member through
  // StoryCharacter. Round 5: the cast comes from the CHARACTER LIBRARY, so
  // the dispatch keys on the library's `modelType` (glb = the Mixamo/GLB
  // human, vrm = the fallback), not on which URL the story happens to carry.
  assert.ok(/<StoryCharacter\b/.test(src), 'StoryFilm must dispatch characters through StoryCharacter');
  assert.ok(/spec=\{charSpec\}/.test(src), 'the speaker dispatch must receive the story cast member');
  assert.ok(/action=\{charAction\}/.test(src), 'the speaker must receive the scene action');
  assert.ok(/resolveLibraryCast\(/.test(src), 'the cast must be resolved from the character library');
  assert.ok(/modelType === 'glb'/.test(src), 'the GLB path must be selected by the library modelType');
  assert.ok(/<VrmCharacter\b/.test(src), 'StoryFilm must render the VRM path');
  assert.ok(/<GlbCharacter\b/.test(src), 'StoryFilm must keep the GLB path');
  assert.ok(/style=\{style\}/.test(src), 'the relief style must reach the character components');
});
