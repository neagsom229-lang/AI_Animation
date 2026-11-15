/**
 * @fileoverview Minimal, dependency-free PNG codec used by the contact sheet.
 *
 * Scope: exactly what the pipeline needs — 8-bit, non-interlaced images in
 * colour type 0 (grey), 2 (RGB), 4 (grey+alpha) or 6 (RGBA), with all five
 * scanline filters (None/Sub/Up/Average/Paeth). Anything outside that scope
 * fails loudly instead of silently mis-decoding.
 *
 * Pure Node (`node:zlib` only): no npm dependency, so a fresh clone works
 * offline. The encoder and decoder are inverses — the round-trip test in
 * tests/contact-sheet.test.js exercises every filter path on every colour
 * type the decoder accepts.
 *
 * @module scripts/lib/png
 */

import zlib from 'node:zlib';

/** The 8-byte PNG file signature. */
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Colour type -> samples per pixel. */
const CHANNELS_FOR_COLOR_TYPE = { 0: 1, 2: 3, 4: 2, 6: 4 };
/** Samples per pixel -> colour type (encoder side). */
const COLOR_TYPE_FOR_CHANNELS = { 1: 0, 2: 4, 3: 2, 4: 6 };

// --- CRC-32 (ISO 3309 / PNG spec) -----------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build one PNG chunk: length | type | data | crc32(type+data). */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// --- Scanline filters (shared by encoder and decoder) ----------------------

/** Paeth predictor (PNG spec, section 9.4). */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Apply a filter to one raw scanline (encoder direction).
 * @param {0|1|2|3|4} filterType
 * @param {Buffer} line raw bytes of this row
 * @param {Buffer} prev raw bytes of the previous row (zeros for row 0)
 * @param {number} bpp bytes per pixel
 */
function filterLine(filterType, line, prev, bpp) {
  const out = Buffer.alloc(line.length);
  switch (filterType) {
    case 0:
      line.copy(out);
      break;
    case 1:
      for (let i = 0; i < line.length; i++) {
        out[i] = (line[i] - (i >= bpp ? line[i - bpp] : 0)) & 0xff;
      }
      break;
    case 2:
      for (let i = 0; i < line.length; i++) out[i] = (line[i] - prev[i]) & 0xff;
      break;
    case 3:
      for (let i = 0; i < line.length; i++) {
        const left = i >= bpp ? line[i - bpp] : 0;
        out[i] = (line[i] - ((left + prev[i]) >> 1)) & 0xff;
      }
      break;
    case 4:
      for (let i = 0; i < line.length; i++) {
        const left = i >= bpp ? line[i - bpp] : 0;
        const upLeft = i >= bpp ? prev[i - bpp] : 0;
        out[i] = (line[i] - paeth(left, prev[i], upLeft)) & 0xff;
      }
      break;
    default:
      throw new Error(`png: unknown scanline filter ${filterType}`);
  }
  return out;
}

/**
 * Undo one scanline filter (decoder direction) into `out`.
 * @param {0|1|2|3|4} filterType
 * @param {Buffer} line filtered bytes of this row
 * @param {Buffer} prev reconstructed bytes of the previous row (zeros for row 0)
 * @param {Buffer} out destination for the reconstructed row
 * @param {number} bpp bytes per pixel
 */
function unfilterLine(filterType, line, prev, out, bpp) {
  switch (filterType) {
    case 0:
      line.copy(out);
      break;
    case 1:
      for (let i = 0; i < line.length; i++) {
        out[i] = (line[i] + (i >= bpp ? out[i - bpp] : 0)) & 0xff;
      }
      break;
    case 2:
      for (let i = 0; i < line.length; i++) out[i] = (line[i] + prev[i]) & 0xff;
      break;
    case 3:
      for (let i = 0; i < line.length; i++) {
        const left = i >= bpp ? out[i - bpp] : 0;
        out[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xff;
      }
      break;
    case 4:
      for (let i = 0; i < line.length; i++) {
        const left = i >= bpp ? out[i - bpp] : 0;
        const upLeft = i >= bpp ? prev[i - bpp] : 0;
        out[i] = (line[i] + paeth(left, prev[i], upLeft)) & 0xff;
      }
      break;
    default:
      throw new Error(`png: unknown scanline filter ${filterType}`);
  }
}

// --- Decode -----------------------------------------------------------------

/**
 * Decode a PNG buffer into 8-bit RGBA pixels.
 *
 * @param {Buffer} buffer PNG file bytes
 * @returns {{ width: number, height: number, data: Buffer }} RGBA, length
 *   width*height*4, row-major
 * @throws if the data is not a PNG or uses an unsupported variant — never
 *   returns silently wrong pixels.
 */
export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('decodePng: not a PNG file (bad signature)');
  }

  let offset = 8;
  let ihdr = null;
  const idatParts = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const crcStart = dataStart + length;
    if (crcStart + 4 > buffer.length) {
      throw new Error(`decodePng: truncated chunk "${type}"`);
    }
    const data = buffer.subarray(dataStart, crcStart);
    const expectedCrc = buffer.readUInt32BE(crcStart);
    const actualCrc = crc32(Buffer.concat([buffer.subarray(offset + 4, offset + 8), data]));
    if (expectedCrc !== actualCrc) {
      throw new Error(`decodePng: CRC mismatch in chunk "${type}"`);
    }

    if (type === 'IHDR') {
      if (length !== 13) throw new Error(`decodePng: bad IHDR length ${length}`);
      ihdr = {
        width: buffer.readUInt32BE(dataStart),
        height: buffer.readUInt32BE(dataStart + 4),
        bitDepth: buffer[dataStart + 8],
        colorType: buffer[dataStart + 9],
        compression: buffer[dataStart + 10],
        filter: buffer[dataStart + 11],
        interlace: buffer[dataStart + 12],
      };
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = crcStart + 4;
  }

  if (!ihdr) throw new Error('decodePng: missing IHDR chunk');
  if (idatParts.length === 0) throw new Error('decodePng: missing IDAT chunk');
  const { width, height, bitDepth, colorType, compression, filter, interlace } = ihdr;
  if (width < 1 || height < 1) throw new Error(`decodePng: bad dimensions ${width}x${height}`);
  if (bitDepth !== 8) throw new Error(`decodePng: unsupported bit depth ${bitDepth} (only 8)`);
  if (!(colorType in CHANNELS_FOR_COLOR_TYPE)) {
    throw new Error(`decodePng: unsupported colour type ${colorType} (want 0, 2, 4 or 6)`);
  }
  if (compression !== 0 || filter !== 0) throw new Error('decodePng: unsupported compression/filter method');
  if (interlace !== 0) throw new Error('decodePng: interlaced PNG is not supported');

  const channels = CHANNELS_FOR_COLOR_TYPE[colorType];
  const stride = width * channels;
  const expected = (stride + 1) * height;
  const raw = zlib.inflateSync(Buffer.concat(idatParts));
  if (raw.length !== expected) {
    throw new Error(`decodePng: pixel data is ${raw.length} bytes, expected ${expected}`);
  }

  const pixels = Buffer.alloc(stride * height);
  const zeros = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const lineStart = y * (stride + 1);
    const filterType = raw[lineStart];
    const line = raw.subarray(lineStart + 1, lineStart + 1 + stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : zeros;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    if (filterType > 4) throw new Error(`decodePng: unknown scanline filter ${filterType} on row ${y}`);
    unfilterLine(filterType, line, prev, out, channels);
  }

  return { width, height, data: expandToRgba(pixels, colorType, width * height) };
}

/** Widen decoded samples to RGBA. */
function expandToRgba(pixels, colorType, pixelCount) {
  if (colorType === 6) return pixels; // already RGBA
  const out = Buffer.alloc(pixelCount * 4);
  if (colorType === 2) {
    for (let i = 0; i < pixelCount; i++) {
      const s = i * 3;
      const d = i * 4;
      out[d] = pixels[s];
      out[d + 1] = pixels[s + 1];
      out[d + 2] = pixels[s + 2];
      out[d + 3] = 0xff;
    }
  } else if (colorType === 0) {
    for (let i = 0; i < pixelCount; i++) {
      const v = pixels[i];
      const d = i * 4;
      out[d] = v;
      out[d + 1] = v;
      out[d + 2] = v;
      out[d + 3] = 0xff;
    }
  } else {
    // colorType 4: grey + alpha
    for (let i = 0; i < pixelCount; i++) {
      const s = i * 2;
      const d = i * 4;
      out[d] = pixels[s];
      out[d + 1] = pixels[s];
      out[d + 2] = pixels[s];
      out[d + 3] = pixels[s + 1];
    }
  }
  return out;
}

// --- Encode -----------------------------------------------------------------

/**
 * Encode raw samples as a PNG buffer (8-bit, non-interlaced).
 *
 * @param {{ width: number, height: number, data: Buffer }} image
 * @param {{ channels?: 1|2|3|4, filter?: 0|1|2|3|4 }} [options]
 *   `channels` defaults to 4 (RGBA); `filter` selects the scanline filter
 *   applied to every row (0 = None) — tests use all five to prove the
 *   decoder's unfilter paths.
 * @returns {Buffer} complete PNG file bytes
 */
export function encodePng({ width, height, data }, { channels = 4, filter = 0 } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`encodePng: bad dimensions ${width}x${height}`);
  }
  if (!(channels in COLOR_TYPE_FOR_CHANNELS)) {
    throw new Error(`encodePng: unsupported channel count ${channels} (want 1, 2, 3 or 4)`);
  }
  if (!Buffer.isBuffer(data)) throw new Error('encodePng: data must be a Buffer');
  const expected = width * height * channels;
  if (data.length !== expected) {
    throw new Error(`encodePng: data is ${data.length} bytes, expected ${expected}`);
  }
  if (!Number.isInteger(filter) || filter < 0 || filter > 4) {
    throw new Error(`encodePng: bad filter ${filter} (want 0-4)`);
  }

  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  const zeros = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const line = data.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? data.subarray((y - 1) * stride, y * stride) : zeros;
    raw[y * (stride + 1)] = filter;
    filterLine(filter, line, prev, channels).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = COLOR_TYPE_FOR_CHANNELS[channels];
  // compression method 0, filter method 0, interlace 0 already zeroed

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
