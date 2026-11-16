/**
 * @fileoverview Shrink a GLB/VRM by downscaling embedded PNG textures while
 * preserving every JSON extension byte-for-byte.
 *
 * Why this exists: `@gltf-transform/cli resize` cannot be used on the VRM
 * characters — it does not know the `VRM` extension, warns
 * "Missing optional extension, VRM", strips `extensions.VRM` (the license
 * meta, blendshapes and humanoid rig live there) and writes an external-file
 * `.gltf` for the unknown `.vrm` extension. Verified on Vita.vrm/Vivi.vrm
 * (2026-11-15): output had `extensions: {}` and sidecar `.bin`/`.png` files.
 *
 * This module therefore does the minimum possible edit of a GLB container:
 *  1. parse header + JSON chunk + BIN chunk,
 *  2. re-encode embedded PNGs larger than `maxTextureSize` (area-average
 *     downscale via the sibling contact-sheet lib),
 *  3. rebuild the BIN chunk (untouched bufferViews keep their exact bytes),
 *  4. re-serialize the JSON with **only** `bufferViews[].byteOffset` /
 *     `byteLength` / `buffers[0].byteLength` changed — `extensions`,
 *     `extensionsUsed`, accessors, meshes, materials and image indices are
 *     carried over verbatim.
 *
 * Images that are already small, not PNG, or use an unsupported PNG variant
 * are kept byte-identical (never silently dropped). Pure Node (`node:fs`
 * only plus the sibling libs) — no npm dependency, so a fresh clone works.
 *
 * @module scripts/lib/vrm-shrink
 */

import { decodePng, encodePng } from './png.mjs';
import { resizeRgba } from './contact-sheet.mjs';

/** GLB magic number ("glTF" little-endian). */
const GLB_MAGIC = 0x46546c67;
/** Chunk type "JSON". */
const CHUNK_JSON = 0x4e4f534a;
/** Chunk type "BIN\0". */
const CHUNK_BIN = 0x004e4942;

/**
 * Parse a GLB container into its JSON document and BIN chunk bytes.
 *
 * @param {Buffer} buffer GLB file bytes
 * @returns {{ json: object, bin: Buffer }}
 * @throws if the buffer is not a GLB or uses an unsupported layout — a bad
 *   input must fail loudly, never return a half-parsed result
 */
export function parseGlb(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) {
    throw new Error('parseGlb: not a buffer or too short for a GLB');
  }
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error('parseGlb: bad magic (not a GLB)');
  }
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`parseGlb: unsupported glTF version ${version}`);
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) {
    throw new Error(`parseGlb: header says ${declaredLength} bytes, buffer is ${buffer.length}`);
  }

  let offset = 12;
  let json = null;
  let bin = Buffer.alloc(0);
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (dataStart + length > buffer.length) {
      throw new Error('parseGlb: chunk extends past end of file');
    }
    const data = buffer.subarray(dataStart, dataStart + length);
    if (type === CHUNK_JSON) {
      if (json !== null) throw new Error('parseGlb: multiple JSON chunks');
      json = JSON.parse(data.toString('utf8'));
    } else if (type === CHUNK_BIN) {
      if (bin.length > 0) throw new Error('parseGlb: multiple BIN chunks');
      bin = Buffer.from(data);
    }
    // Unknown chunk types are skipped per the glTF spec.
    offset = dataStart + length + ((4 - (length % 4)) % 4);
  }
  if (json === null) throw new Error('parseGlb: missing JSON chunk');
  if (!Array.isArray(json.bufferViews) || !Array.isArray(json.buffers)) {
    throw new Error('parseGlb: JSON chunk has no bufferViews/buffers arrays');
  }
  return { json, bin };
}

/** Round `value` up to the next multiple of 4 (glTF buffer alignment). */
function align4(value) {
  return (value + 3) & ~3;
}

/**
 * Rebuild a GLB from a JSON document and a BIN chunk.
 *
 * @param {object} json glTF JSON (already mutated as needed)
 * @param {Buffer} bin BIN chunk payload (no padding required)
 * @returns {Buffer} complete GLB bytes
 */
export function buildGlb(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const jsonChunkLength = jsonBytes.length + jsonPad;
  const binChunkLength = bin.length + binPad;
  const total = 12 + 8 + jsonChunkLength + 8 + binChunkLength;

  const out = Buffer.alloc(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunkLength, 12);
  out.writeUInt32LE(CHUNK_JSON, 16);
  jsonBytes.copy(out, 20);
  // JSON chunk padding is spaces (0x20) per the glTF spec.
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonChunkLength);
  const binHeader = 20 + jsonChunkLength;
  out.writeUInt32LE(binChunkLength, binHeader);
  out.writeUInt32LE(CHUNK_BIN, binHeader + 4);
  bin.copy(out, binHeader + 8);
  // BIN chunk padding is zeros per the glTF spec.
  return out;
}

/** Scale so the longest side equals `maxSize`, keeping ≥1 px and aspect. */
function scaledSize(width, height, maxSize) {
  const longest = Math.max(width, height);
  const scale = maxSize / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Shrink a GLB/VRM by downscaling embedded PNG textures.
 *
 * Every JSON field except `bufferViews[].byteOffset`, `bufferViews[].byteLength`
 * and `buffers[0].byteLength` is preserved exactly — in particular the `VRM`
 * extension (license meta, blendshape groups, humanoid bones) survives
 * untouched because the JSON object is round-tripped, never rebuilt.
 *
 * @param {Buffer} buffer input GLB/VRM bytes
 * @param {{ maxTextureSize?: number }} [options]
 *   `maxTextureSize` (default 1024) is the longest-side limit in px;
 *   images at or below it are copied byte-identically.
 * @returns {{ output: Buffer, stats: object }}
 *   stats: { bytesBefore, bytesAfter, images, resized, keptSmall,
 *            keptUnsupported, keptExternal }
 * @throws on a non-GLB input or a JSON/BIN layout this tool cannot safely
 *   rewrite (more than one buffer, a buffer with a URI, an image bufferView
 *   also used by an accessor)
 */
export function shrinkGlb(buffer, { maxTextureSize = 1024 } = {}) {
  if (!Number.isInteger(maxTextureSize) || maxTextureSize < 1) {
    throw new Error(`shrinkGlb: maxTextureSize must be a positive integer, got ${maxTextureSize}`);
  }
  const { json, bin } = parseGlb(buffer);

  if (!Array.isArray(json.buffers) || json.buffers.length !== 1) {
    throw new Error(`shrinkGlb: expected exactly 1 buffer, got ${(json.buffers || []).length}`);
  }
  if (json.buffers[0].uri !== undefined) {
    throw new Error('shrinkGlb: buffer has a URI (not a self-contained GLB)');
  }

  // bufferViews referenced by accessors must keep their exact bytes: an
  // image sharing such a bufferView would corrupt vertex data if rewritten.
  const accessorBufferViews = new Set();
  for (const accessor of json.accessors || []) {
    if (accessor.bufferView !== undefined) accessorBufferViews.add(accessor.bufferView);
  }

  const images = Array.isArray(json.images) ? json.images : [];
  const stats = {
    bytesBefore: buffer.length,
    bytesAfter: 0,
    images: images.length,
    resized: 0,
    keptSmall: 0,
    keptUnsupported: 0,
    keptExternal: 0,
    keptShared: 0,
  };

  // Unique bufferViews used by embedded PNG images.
  const imageBufferViews = new Map(); // bufferView index -> { imageIndex, bytes|null }
  images.forEach((image, imageIndex) => {
    if (image.bufferView === undefined) {
      stats.keptExternal++;
      return;
    }
    if (typeof image.uri === 'string') {
      throw new Error(`shrinkGlb: image ${imageIndex} has both bufferView and uri`);
    }
    if (!imageBufferViews.has(image.bufferView)) {
      imageBufferViews.set(image.bufferView, { imageIndex, bytes: null });
    }
  });

  // Re-encode each unique image bufferView (or decide to keep it).
  for (const [bufferViewIndex, entry] of imageBufferViews) {
    const bufferView = json.bufferViews[bufferViewIndex];
    if (!bufferView || bufferView.byteLength === undefined) {
      throw new Error(`shrinkGlb: image references missing bufferView ${bufferViewIndex}`);
    }
    const start = bufferView.byteOffset || 0;
    const bytes = bin.subarray(start, start + bufferView.byteLength);
    const image = images[entry.imageIndex];

    if (image.mimeType !== 'image/png') {
      stats.keptUnsupported++;
      entry.bytes = null; // copy verbatim
      continue;
    }
    if (accessorBufferViews.has(bufferViewIndex)) {
      // Shared with vertex data: leave the original bytes in place and note
      // it — repointing the image would need a second copy of the data.
      stats.keptShared++;
      entry.bytes = null;
      continue;
    }
    try {
      const decoded = decodePng(Buffer.from(bytes));
      if (decoded.width <= maxTextureSize && decoded.height <= maxTextureSize) {
        stats.keptSmall++;
        entry.bytes = null; // copy verbatim
        continue;
      }
      const { width, height } = scaledSize(decoded.width, decoded.height, maxTextureSize);
      const resized = resizeRgba(decoded.data, decoded.width, decoded.height, width, height);
      entry.bytes = encodePng({ width, height, data: resized });
      stats.resized++;
    } catch {
      // Unsupported PNG variant (16-bit, interlaced, palette, corrupt):
      // keep the original bytes rather than guess at pixels.
      stats.keptUnsupported++;
      entry.bytes = null;
    }
  }

  // Rebuild the BIN chunk: every bufferView keeps its data, image bufferViews
  // swap in the re-encoded bytes. Offsets are 4-byte aligned (glTF requires
  // accessor+bufferView offsets to be multiples of 4).
  const parts = [];
  let offset = 0;
  json.bufferViews.forEach((bufferView, index) => {
    const replacement = imageBufferViews.get(index);
    let source;
    if (replacement && replacement.bytes) {
      source = replacement.bytes;
    } else {
      const start = bufferView.byteOffset || 0;
      source = bin.subarray(start, start + bufferView.byteLength);
    }
    const padding = align4(offset) - offset;
    if (padding > 0) {
      parts.push(Buffer.alloc(padding));
      offset += padding;
    }
    bufferView.byteOffset = offset;
    bufferView.byteLength = source.length;
    parts.push(source);
    offset += source.length;
  });
  const newBin = Buffer.concat(parts);
  json.buffers[0].byteLength = newBin.length;

  return { output: buildGlb(json, newBin), stats };
}
