/**
 * @fileoverview Unit tests for the in-repo VRM/GLB shrink tool
 * (scripts/lib/vrm-shrink.mjs): the one tool in the repo entrusted with
 * rewriting the shipped characters. It must (a) leave small images
 * byte-identical, (b) re-encode oversize PNGs to the cap, (c) preserve the
 * VRM extension (license meta / blendshapes / rig) verbatim.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGlb, buildGlb, shrinkGlb } from '../scripts/lib/vrm-shrink.mjs';
import { encodePng, decodePng } from '../scripts/lib/png.mjs';

/** Deterministic RGBA pattern (no randomness in tests either). */
function makeRgba(width, height, seed = 1) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 3 + y + seed * 17) & 0xff;
      data[i + 1] = (y * 2 + x + seed * 29) & 0xff;
      data[i + 2] = (x + y * seed) & 0xff;
      data[i + 3] = 255;
    }
  }
  return data;
}

const align4 = (v) => (v + 3) & ~3;

/**
 * Build a synthetic but structurally valid GLB with two embedded PNGs
 * (small + big), one accessor (to exercise the shared-bufferView guard), and
 * a VRM extension that must survive byte-for-byte.
 */
function makeSyntheticVrm({ bigWidth = 1500, bigHeight = 1000, small = 8 } = {}) {
  const smallPng = encodePng({ width: small, height: small, data: makeRgba(small, small, 7) });
  const bigPng = encodePng({ width: bigWidth, height: bigHeight, data: makeRgba(bigWidth, bigHeight, 3) });
  const position = Buffer.from([0, 0, 0, 1, 1, 1].flatMap((v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]));

  const parts = [position, smallPng, bigPng];
  const offsets = [];
  let cursor = 0;
  for (const part of parts) {
    const pad = align4(cursor) - cursor;
    cursor += pad;
    offsets.push(cursor);
    cursor += part.length;
  }
  const bin = Buffer.alloc(cursor);
  for (let i = 0; i < parts.length; i++) parts[i].copy(bin, offsets[i]);

  const json = {
    asset: { version: '2.0', generator: 'vrm-shrink-test' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Face', mesh: 0 }],
    meshes: [{
      name: 'Face',
      primitives: [{ attributes: { POSITION: 0 } }],
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: 'VEC3' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: position.length },
      { buffer: 0, byteOffset: offsets[1], byteLength: smallPng.length },
      { buffer: 0, byteOffset: offsets[2], byteLength: bigPng.length },
    ],
    buffers: [{ byteLength: bin.length }],
    images: [
      { name: 'small', bufferView: 1, mimeType: 'image/png' },
      { name: 'big', bufferView: 2, mimeType: 'image/png' },
    ],
    textures: [{ source: 0 }, { source: 1 }],
    extensionsUsed: ['VRM'],
    extensions: {
      VRM: {
        meta: { licenseName: 'CC0', title: 'synthetic' },
        blendShapeMaster: { blendShapeGroups: [{ name: 'Blink', presetName: 'blink' }] },
        humanoid: { humanBones: [{ bone: 'hips', node: 0 }] },
      },
    },
  };
  return { buffer: buildGlb(json, bin), json, smallPng, bigPng };
}

test('parseGlb round-trips buildGlb output', () => {
  const { buffer, json } = makeSyntheticVrm();
  const parsed = parseGlb(buffer);
  assert.equal(parsed.json.extensions.VRM.meta.licenseName, 'CC0');
  assert.equal(parsed.json.accessors.length, 1);
  assert.ok(Buffer.isBuffer(parsed.bin));
  // The BIN chunk includes 4-byte alignment padding; the buffer byteLength
  // is the data length (spec) — the two differ by at most 3 bytes.
  assert.ok(
    parsed.bin.length - parsed.json.buffers[0].byteLength >= 0 &&
      parsed.bin.length - parsed.json.buffers[0].byteLength <= 3
  );
  void json;
});

test('parseGlb fails loudly on bad input', () => {
  assert.throws(() => parseGlb(Buffer.from('not a glb at all, far too short for a real GLB container')), /bad magic/);
  const { buffer } = makeSyntheticVrm();
  const truncated = buffer.subarray(0, buffer.length - 4);
  assert.throws(() => parseGlb(truncated), /header says/);
});

test('small images are copied byte-identically; OOB images are re-encoded to the cap', () => {
  const { buffer } = makeSyntheticVrm({ bigWidth: 1500, bigHeight: 1000 });
  const before = parseGlb(buffer);
  const smallBefore = before.bin.subarray(
    before.json.bufferViews[1].byteOffset,
    before.json.bufferViews[1].byteOffset + before.json.bufferViews[1].byteLength
  );

  const { output, stats } = shrinkGlb(buffer, { maxTextureSize: 1024 });
  assert.equal(stats.resized, 1);
  assert.equal(stats.keptSmall, 1);
  assert.equal(stats.keptUnsupported, 0);
  assert.ok(stats.bytesAfter < stats.bytesBefore);

  const after = parseGlb(output);
  // VRM extension must survive verbatim (it holds the CC0 license meta).
  assert.deepEqual(after.json.extensions, before.json.extensions);
  assert.deepEqual(after.json.extensionsUsed, before.json.extensionsUsed);

  // Small image bytes are identical.
  const smallAfter = after.bin.subarray(
    after.json.bufferViews[1].byteOffset,
    after.json.bufferViews[1].byteOffset + after.json.bufferViews[1].byteLength
  );
  assert.ok(smallBefore.equals(smallAfter), 'small image was re-encoded');

  // Big image is now <= 1024 on its longest side, aspect preserved.
  const bigAfter = after.bin.subarray(
    after.json.bufferViews[2].byteOffset,
    after.json.bufferViews[2].byteOffset + after.json.bufferViews[2].byteLength
  );
  const decoded = decodePng(bigAfter);
  assert.equal(decoded.width, 1024);
  assert.equal(decoded.height, 683);

  // Accessor-targeted bufferView kept its exact bytes (24 B POSITION data).
  const positionBytes = after.bin.subarray(
    after.json.bufferViews[0].byteOffset,
    after.json.bufferViews[0].byteOffset + 24
  );
  assert.deepEqual([...positionBytes], [...before.bin.subarray(before.json.bufferViews[0].byteOffset, before.json.bufferViews[0].byteOffset + 24)]);
});

test('an image bufferView shared with an accessor is kept verbatim (keptShared)', () => {
  const { buffer } = makeSyntheticVrm();
  const parsed = parseGlb(buffer);
  // Re-point the small image at bufferView 0 (the accessor's view).
  parsed.json.images[0].bufferView = 0;
  const shared = buildGlb(parsed.json, parsed.bin);
  const { output, stats } = shrinkGlb(shared, { maxTextureSize: 1024 });
  assert.equal(stats.keptShared, 1);
  assert.equal(stats.keptSmall, 0);
  const after = parseGlb(output);
  const v0 = after.bin.subarray(after.json.bufferViews[0].byteOffset, after.json.bufferViews[0].byteOffset + 24);
  assert.deepEqual([...v0], [...parsed.bin.subarray(0, 24)], 'shared bufferView bytes changed');
});

test('shrinkGlb rejects a multi-buffer GLB and a buffer with a URI', () => {
  const { json } = makeSyntheticVrm();
  const twoBuffers = { ...json, buffers: [json.buffers[0], { byteLength: 0 }] };
  assert.throws(() => shrinkGlb(buildGlb(twoBuffers, Buffer.alloc(0))), /exactly 1 buffer/);

  const uriBuffer = { ...json, buffers: [{ uri: 'data.bin', byteLength: 0 }] };
  assert.throws(() => shrinkGlb(buildGlb(uriBuffer, Buffer.alloc(0))), /URI/);
});
