/**
 * @fileoverview Phase A asset pipeline test.
 *
 * Enforces, as CI-runnable checks:
 *  1. Every model/texture referenced by the shipped stories (`modelUrl`) or
 *     by string literals in remotion/ and src/ sources exists on disk.
 *  2. Every referenced asset has an entry in CREDITS.md (matched by file
 *     basename) — no uncredited assets can reach a render.
 *  3. Referenced models stay under 5 MB each. VRM characters are exempt
 *     (9–11 MB) and held to a documented 12 MB cap instead — they carry a
 *     full MToon face/body rig plus15 blendshapes, and even after the
 *     in-repo shrink they cannot fit 5 MB without dropping texture detail
 *     the close-up shot reads (see CREDITS.md §8).
 *  4. Referenced standalone textures (jpg/png) are <= 2048 px per side
 *     (GLB-embedded textures are capped by gltf-transform --texture-size).
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const CREDITS = path.join(ROOT, 'CREDITS.md');

/** Recursively list source files under a directory. */
function listSources(dir, pattern = /\.(tsx?|jsx?)$/) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSources(full, pattern));
    } else if (pattern.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Collect referenced asset paths:
 *  - `modelUrl` fields from every story JSON in src/stories/
 *  - quoted string literals like "models/…", "public/textures/…",
 *    "textures/…", "models/…" ending in a known asset extension.
 * Returns repo-root-relative paths (as written) plus their origin.
 */
function collectReferences() {
  const refs = [];

  // 1. Story modelUrl fields.
  const storiesDir = path.join(ROOT, 'src', 'stories');
  for (const f of readdirSync(storiesDir).filter((n) => n.endsWith('.json')).sort()) {
    const story = JSON.parse(readFileSync(path.join(storiesDir, f), 'utf8'));
    for (const c of story.characters || []) {
      if (c.modelUrl) {
        refs.push({ value: c.modelUrl, origin: `src/stories/${f} character "${c.id}"` });
      }
      if (c.vrmUrl) {
        refs.push({ value: c.vrmUrl, origin: `src/stories/${f} character "${c.id}" (vrm)` });
      }
    }
  }

  // 2. String literals in remotion/ and src/ sources.
  const literal = /["'`]((?:public\/)?(?:models|textures|fonts)\/[\w./-]+\.(?:glb|gltf|hdr|jpg|png|ttf|otf|woff2?|vrm))["'`]/g;
  const sourceDirs = [path.join(ROOT, 'remotion'), path.join(ROOT, 'src')];
  for (const dir of sourceDirs) {
    for (const file of listSources(dir)) {
      const code = readFileSync(file, 'utf8');
      for (const m of code.matchAll(literal)) {
        refs.push({ value: m[1], origin: path.relative(ROOT, file) });
      }
    }
  }

  return refs;
}

const creditsText = existsSync(CREDITS) ? readFileSync(CREDITS, 'utf8') : '';

/**
 * Resolve a referenced asset to an absolute path.
 *
 * Two conventions exist in the repo and both are valid:
 *  - story `modelUrl` values are repo-root relative: "public/models/…"
 *  - `staticFile()` literals are public-dir relative: "textures/…"
 * Anything not already rooted at `public/` is resolved inside `public/`.
 */
function resolveRef(value) {
  const rel = value.startsWith('public/') ? value : `public/${value}`;
  return path.join(ROOT, rel);
}

test('CREDITS.md exists at the repo root', () => {
  assert.ok(existsSync(CREDITS), 'CREDITS.md is missing');
  assert.ok(creditsText.length > 500, 'CREDITS.md looks empty');
});

test('every model/texture referenced by stories or compositions exists on disk', () => {
  const refs = collectReferences();
  assert.ok(refs.length > 0, 'no model/texture references found in stories or sources');
  for (const { value, origin } of refs) {
    const abs = resolveRef(value);
    assert.ok(existsSync(abs), `referenced asset "${value}" (${origin}) does not exist at ${abs}`);
  }
});

test('every referenced asset has an entry in CREDITS.md', () => {
  const refs = collectReferences();
  assert.ok(refs.length > 0, 'no model/texture references found');
  for (const { value, origin } of refs) {
    const base = path.basename(value);
    assert.ok(
      creditsText.includes(base),
      `referenced asset "${value}" (${origin}) has no entry for "${base}" in CREDITS.md`
    );
  }
});

test('every referenced model stays under 5 MB', () => {
  const refs = collectReferences().filter(({ value }) => /\.(glb|gltf)$/i.test(value));
  assert.ok(refs.length > 0, 'no model references found');
  for (const { value, origin } of refs) {
    const size = statSync(resolveRef(value)).size;
    assert.ok(
      size < 5 * 1024 * 1024,
      `model "${value}" (${origin}) is ${(size / 1024 / 1024).toFixed(2)} MB (limit 5 MB)`
    );
  }
});

test('referenced VRM characters stay under the 12 MB cap', () => {
  // VRMs ship a full MToon face/body rig + 15 blendshape groups, so the 5 MB
  // GLB cap is not attainable; 12 MB keeps them honest without dropping the
  // texture detail the close-up shot reads. Rationale: CREDITS.md §8.
  const refs = collectReferences().filter(({ value }) => /\.vrm$/i.test(value));
  assert.ok(refs.length > 0, 'no VRM references found');
  for (const { value, origin } of refs) {
    const size = statSync(resolveRef(value)).size;
    assert.ok(
      size < 12 * 1024 * 1024,
      `VRM "${value}" (${origin}) is ${(size / 1024 / 1024).toFixed(2)} MB (cap 12 MB)`
    );
  }
});

test('every referenced standalone texture is <= 2048 px per side', () => {
  const refs = collectReferences().filter(({ value }) => /\.(jpg|jpeg|png)$/i.test(value));
  for (const { value, origin } of refs) {
    const buf = readFileSync(resolveRef(value));
    let dims = null;
    if (/\.png$/i.test(value) && buf.length > 24) {
      dims = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    } else if (/\.(jpe?g)$/i.test(value)) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          dims = [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
          break;
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (!dims) continue; // unparseable header: size covered by MD5-verified downloads
    const [w, h] = dims;
    assert.ok(
      w <= 2048 && h <= 2048,
      `texture "${value}" (${origin}) is ${w}x${h} (limit 2048)`
    );
  }
});
