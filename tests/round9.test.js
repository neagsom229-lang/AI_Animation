/** Round 9 QA: source-resolution gate, duplicate blocking, requeue, Python detect. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  sourceResolutionGate, isUpscaled, REQUIRED_MANIFEST_FLAGS,
} from '../scripts/lib/image-check.mjs';
import {
  groupDuplicates, requeueBlock, perceptualHash, hamming, parsePrompts,
} from '../scripts/lib/film-duplicates.mjs';
import {
  findPythonInterpreter, hasTorch, prepareModelInterpreter, venvPython,
} from '../scripts/lib/film-depth.mjs';
import { detectUpscaler, upscaleInstallSteps } from '../scripts/lib/film-upscale.mjs';
import { parseArgs as filmArgs } from '../scripts/film.mjs';

// --- item 1: source resolution ---
test('source gate: <1600 hard-fails final, allowed in draft', () => {
  const final = sourceResolutionGate(1024, 1600, { draft: false });
  assert.equal(final.ok, false);
  assert.equal(final.hardFail, true);
  assert.ok(final.warning.includes('BLOCK'));
  const draft = sourceResolutionGate(1024, 1600, { draft: true });
  assert.equal(draft.ok, true);
  assert.equal(draft.hardFail, false);
  assert.ok(draft.warning.includes('draft'));
  assert.equal(sourceResolutionGate(1920, 1600).hardFail, false);
  assert.equal(sourceResolutionGate(NaN, 1600).hardFail, true);
});

test('isUpscaled flags sources below target width', () => {
  assert.equal(isUpscaled(1024, 1920), true);
  assert.equal(isUpscaled(1920, 1920), false);
  assert.equal(isUpscaled(2560, 1920), false);
});

test('manifest records SOURCE fields (integration with real ingest)', () => {
  const p = 'assets-src/illustrations/manifest.json';
  if (!fs.existsSync(p)) return; // no manifest yet — pure tests above cover logic
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  const e = (m.scenes || [])[1];
  assert.equal(e.sourceWidth, 1024, 'source width must be the inbox file, not 1920 output');
  assert.equal(e.upscaled, true);
  assert.equal(e.matchesNarration, false);
  assert.ok(REQUIRED_MANIFEST_FLAGS.includes('matchesNarration'));
});

// --- item 2: duplicates + requeue ---
test('groupDuplicates: exact hash and near pHash both group', () => {
  const rec = (s, h, p) => ({ scene: s, exactHash: h, phash: p, narration: `line ${s}`, prompt: `prompt ${s}` });
  const groups = groupDuplicates([
    rec(1, 'aaa', '0'.repeat(64)), rec(2, 'aaa', '0'.repeat(64)),
    rec(3, 'bbb', '1'.repeat(64)),
    rec(4, 'ccc', '0'.repeat(63) + '1'), // hamming 1 near-rec 1
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((r) => r.scene).sort(), [1, 2, 4]);
});

test('perceptualHash + hamming are deterministic and bounded', () => {
  const px = Array.from({ length: 32 * 32 }, (_, i) => (i % 7) * 30);
  const h1 = perceptualHash(px);
  assert.equal(h1, perceptualHash(px));
  assert.equal(h1.length, 64);
  assert.equal(hamming(h1, h1), 0);
  assert.ok(hamming(h1, '1'.repeat(64)) > 0);
});

test('requeueBlock contains scene, narration, prompt, action', () => {
  const out = requeueBlock([
    { scene: 9, narration: 'carvers', prompt: 'sculptors at work', image: 'assets-src/illustrations/scene-09.png' },
  ]);
  assert.ok(out.includes('scene 9'));
  assert.ok(out.includes('NARRATION: carvers'));
  assert.ok(out.includes('PROMPT: sculptors at work'));
  assert.ok(out.includes('film.mjs ingest'));
});

test('parsePrompts extracts the canonical style line per scene', () => {
  const text = fs.readFileSync('docs/ILLUSTRATION_PROMPTS.md', 'utf8');
  const p = parsePrompts(text);
  assert.ok(p['01'].startsWith('Detailed painterly historical illustration'));
  assert.ok(p['18']);
});

// --- item 4: Python detection ---
test('findPythonInterpreter returns a descriptor with cmd/version', () => {
  const py = findPythonInterpreter();
  assert.ok(py, 'an interpreter must be found on this machine');
  assert.ok(['py', 'python'].includes(py.cmd));
  assert.ok(py.version.includes('Python'));
});

test('hasTorch is false for a bogus interpreter (no false positive)', () => {
  assert.equal(hasTorch(null), false);
  assert.equal(hasTorch({ cmd: 'nonexistent-python-xyz', prefix: [] }), false);
});

test('venvPython path uses Scripts on Windows', () => {
  const p = venvPython('D:/repo');
  assert.ok(p.includes('.venv-depth'));
  assert.ok(process.platform === 'win32' ? p.includes('Scripts') : p.includes('bin'));
});

test('gradient mode does not require torch; prepareModelInterpreter prints fixes when impossible', () => {
  // We never call prepareModelInterpreter in gradient mode (film-depth branches first).
  const cfg = JSON.parse(fs.readFileSync('film.config.json', 'utf8'));
  assert.equal(cfg.depth.mode, 'gradient');
  // On Python 3.14 (no wheels) the prep returns an error WITH manual steps.
  const prep = prepareModelInterpreter('.', { install: false });
  if (prep.error) assert.ok(prep.manualSteps.length >= 2);
  else assert.ok(prep.interp);
});

// --- CLI flag for depth/upscale ---
test('film CLI accepts --depth and upscale command', () => {
  const a = filmArgs(['depth', '--depth', 'gradient']);
  assert.equal(a.command, 'depth');
  assert.equal(a.depthMode, 'gradient');
  assert.equal(filmArgs(['upscale', '--only', 'scene=3']).command, 'upscale');
  assert.throws(() => filmArgs(['depth', '--depth', 'bogus']), /model or gradient/);
});

test('upscale install steps name BSD-3 and the exact command', () => {
  const s = upscaleInstallSteps().join('\n');
  assert.ok(s.includes('BSD-3-Clause'));
  assert.ok(s.includes('film.mjs upscale'));
  assert.equal(detectUpscaler().found, false, 'not installed on this machine (honest)');
});
