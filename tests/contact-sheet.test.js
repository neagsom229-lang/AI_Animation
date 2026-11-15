/**
 * @fileoverview Phase E: the real contact sheet (frame picks, PNG codec,
 * grid tiling) and its wiring in scripts/make.mjs.
 *
 * make.mjs used to render ONE still at frame 30 and call it a contact
 * sheet. These tests pin the replacement:
 *  - pickContactFrames spreads the picks evenly over the whole clip,
 *    always including the first and last frame, and fails loudly on bad
 *    input;
 *  - the dependency-free PNG codec round-trips every scanline filter on
 *    every colour type it accepts (encoder and decoder are inverses);
 *  - tileContactSheet builds the right grid geometry, downscales cells and
 *    pads a partial last row with solid black;
 *  - make.mjs actually calls the new pipeline (grep guard) and no
 *    `-contact.jpg` single-frame references survive anywhere in the repo.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pickContactFrames,
  resizeRgba,
  tileContactSheet,
  CONTACT_FRAME_COUNT,
} from '../scripts/lib/contact-sheet.mjs';
import { decodePng, encodePng } from '../scripts/lib/png.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAKE_MJS = path.join(ROOT, 'scripts', 'make.mjs');

/** Temp dir that is always removed, even when an assertion fails. */
function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kuani-contact-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 1. Frame selection.
// ---------------------------------------------------------------------------

test('pickContactFrames spreads 6 picks evenly across a 312-frame clip', () => {
  // khmer-temple: 10.411 s @ 30 fps = 312 frames, two scenes (k1 0-152,
  // k2 176-311) — the picks must cover both, not just the opening.
  const frames = pickContactFrames(312, 6);
  assert.deepEqual(frames, [0, 62, 124, 187, 249, 311]);
  assert.equal(frames[0], 0, 'first frame must be included');
  assert.equal(frames[frames.length - 1], 311, 'last frame must be included');
});

test('pickContactFrames is strictly increasing and inside the clip', () => {
  for (const total of [1, 2, 5, 30, 90, 312, 1000]) {
    const frames = pickContactFrames(total);
    for (const f of frames) {
      assert.ok(Number.isInteger(f) && f >= 0 && f < total, `frame ${f} outside 0..${total - 1}`);
    }
    for (let i = 1; i < frames.length; i++) {
      assert.ok(frames[i] > frames[i - 1], `picks not increasing for total=${total}`);
    }
    assert.ok(frames.length <= Math.min(CONTACT_FRAME_COUNT, total));
  }
});

test('pickContactFrames clamps when the clip is shorter than the count', () => {
  assert.deepEqual(pickContactFrames(4, 6), [0, 1, 2, 3]);
  assert.deepEqual(pickContactFrames(1, 6), [0]);
  assert.deepEqual(pickContactFrames(1, 1), [0]);
});

test('pickContactFrames fails loudly on invalid input', () => {
  assert.throws(() => pickContactFrames(0), /totalFrames must be a positive integer/);
  assert.throws(() => pickContactFrames(-10), /totalFrames must be a positive integer/);
  assert.throws(() => pickContactFrames(12.5), /totalFrames must be a positive integer/);
  assert.throws(() => pickContactFrames(100, 0), /count must be a positive integer/);
  assert.throws(() => pickContactFrames(100, -1), /count must be a positive integer/);
});

// ---------------------------------------------------------------------------
// 2. PNG codec: encoder and decoder are inverses.
// ---------------------------------------------------------------------------

function rgbaPattern(width, height) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = (i * 37) & 0xff;
    data[i * 4 + 1] = (i * 91 + 5) & 0xff;
    data[i * 4 + 2] = (i * 13 + 200) & 0xff;
    data[i * 4 + 3] = 255 - ((i * 7) & 0xff);
  }
  return data;
}

test('PNG round-trips RGBA through every scanline filter', () => {
  const width = 5;
  const height = 3;
  const data = rgbaPattern(width, height);
  for (const filter of [0, 1, 2, 3, 4]) {
    const png = encodePng({ width, height, data }, { filter });
    assert.deepEqual([png[0], png[1], png[2]], [0x89, 0x50, 0x4e], 'PNG signature');
    const decoded = decodePng(png);
    assert.equal(decoded.width, width, `filter ${filter}: width`);
    assert.equal(decoded.height, height, `filter ${filter}: height`);
    assert.deepEqual(decoded.data, data, `filter ${filter}: pixels differ after round-trip`);
  }
});

test('PNG decoder expands grey, grey+alpha and RGB samples to RGBA', () => {
  const width = 3;
  const height = 2;
  // channels: 1 = grey, 2 = grey+alpha, 3 = RGB
  for (const channels of [1, 2, 3]) {
    const raw = Buffer.alloc(width * height * channels);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 29 + 3) & 0xff;
    const decoded = decodePng(encodePng({ width, height, data: raw }, { channels }));
    assert.equal(decoded.data.length, width * height * 4, `channels ${channels}: RGBA length`);
    for (let i = 0; i < width * height; i++) {
      const d = i * 4;
      if (channels === 1) {
        assert.deepEqual([...decoded.data.subarray(d, d + 4)], [raw[i], raw[i], raw[i], 255]);
      } else if (channels === 2) {
        assert.deepEqual([...decoded.data.subarray(d, d + 4)], [raw[i * 2], raw[i * 2], raw[i * 2], raw[i * 2 + 1]]);
      } else {
        assert.deepEqual([...decoded.data.subarray(d, d + 4)], [raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2], 255]);
      }
    }
  }
});

test('decodePng rejects non-PNG and corrupt data instead of guessing', () => {
  assert.throws(() => decodePng(Buffer.from('definitely not a png, just text')), /bad signature/);
  assert.throws(() => decodePng(Buffer.alloc(0)), /bad signature/);
  const good = encodePng({ width: 2, height: 2, data: rgbaPattern(2, 2) });
  // Walk the chunks to flip a byte inside the first IDAT payload → the
  // per-chunk CRC must catch it (never decode silently wrong pixels).
  let offset = 8;
  let idatData = -1;
  while (offset + 8 <= good.length) {
    const len = good.readUInt32BE(offset);
    const type = good.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') { idatData = offset + 8; break; }
    offset += 12 + len;
  }
  assert.ok(idatData > 0, 'test fixture must contain an IDAT chunk');
  const corrupt = Buffer.from(good);
  corrupt[idatData + 2] ^= 0xff;
  assert.throws(() => decodePng(corrupt), /CRC mismatch/);
});

test('encodePng fails loudly on bad dimensions, sizes and filters', () => {
  const data = rgbaPattern(2, 2);
  assert.throws(() => encodePng({ width: 0, height: 2, data }), /bad dimensions/);
  assert.throws(() => encodePng({ width: 2, height: 2, data: Buffer.alloc(3) }), /expected 16/);
  assert.throws(() => encodePng({ width: 2, height: 2, data }, { filter: 7 }), /bad filter/);
  assert.throws(() => encodePng({ width: 2, height: 2, data }, { channels: 5 }), /channel count/);
});

// ---------------------------------------------------------------------------
// 3. Resizing and tiling.
// ---------------------------------------------------------------------------

test('resizeRgba box-averages a solid block and copies single pixels', () => {
  // 4x4 solid red -> 2x2: every output pixel is the average of red.
  const src = Buffer.alloc(4 * 4 * 4);
  for (let i = 0; i < 16; i++) {
    src[i * 4] = 200;
    src[i * 4 + 1] = 10;
    src[i * 4 + 2] = 20;
    src[i * 4 + 3] = 255;
  }
  const out = resizeRgba(src, 4, 4, 2, 2);
  assert.equal(out.length, 2 * 2 * 4);
  for (let i = 0; i < 4; i++) {
    assert.deepEqual([...out.subarray(i * 4, i * 4 + 4)], [200, 10, 20, 255]);
  }
  // Upscale 2x1 -> 4x1: point sampling must preserve both colours exactly.
  const strip = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);
  const up = resizeRgba(strip, 2, 1, 4, 1);
  assert.deepEqual([...up.subarray(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual([...up.subarray(12, 16)], [0, 0, 255, 255]);
});

function writeSolidPng(file, rgba, width = 2, height = 2) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.copy(data, i * 4);
  fs.writeFileSync(file, encodePng({ width, height, data }));
}

test('tileContactSheet builds a 3x2 grid with black padding for a partial row', () => {
  withTempDir((dir) => {
    const colors = [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 0, 255],
    ];
    const inputs = colors.map((c, i) => {
      const file = path.join(dir, `cell${i}.png`);
      writeSolidPng(file, Buffer.from(c));
      return file;
    });
    const output = path.join(dir, 'sheet.png');
    const info = tileContactSheet({ inputs, output, cols: 3, cellWidth: 2 });
    assert.deepEqual(
      { frames: info.frames, cols: info.cols, rows: info.rows, width: info.width, height: info.height },
      { frames: 4, cols: 3, rows: 2, width: 6, height: 4 }
    );
    const sheet = decodePng(fs.readFileSync(output));
    assert.equal(sheet.width, 6);
    assert.equal(sheet.height, 4);
    const at = (x, y) => [...sheet.data.subarray((y * 6 + x) * 4, (y * 6 + x) * 4 + 4)];
    assert.deepEqual(at(0, 0), [255, 0, 0, 255], 'cell 0 red');
    assert.deepEqual(at(2, 0), [0, 255, 0, 255], 'cell 1 green');
    assert.deepEqual(at(4, 0), [0, 0, 255, 255], 'cell 2 blue');
    assert.deepEqual(at(0, 2), [255, 255, 0, 255], 'cell 3 yellow (row 2)');
    // Partial row padding: cells 4 and 5 are solid black, fully opaque.
    assert.deepEqual(at(2, 2), [0, 0, 0, 255], 'padding must be opaque black');
    assert.deepEqual(at(5, 3), [0, 0, 0, 255], 'last pixel opaque black');
  });
});

test('tileContactSheet downscales oversized stills into the cell', () => {
  withTempDir((dir) => {
    const input = path.join(dir, 'big.png');
    writeSolidPng(input, Buffer.from([18, 220, 90, 255]), 8, 8);
    const output = path.join(dir, 'small-sheet.png');
    const info = tileContactSheet({ inputs: [input], output, cols: 1, cellWidth: 4 });
    assert.equal(info.width, 4);
    assert.equal(info.height, 4);
    const sheet = decodePng(fs.readFileSync(output));
    for (let i = 0; i < 16; i++) {
      assert.deepEqual([...sheet.data.subarray(i * 4, i * 4 + 4)], [18, 220, 90, 255]);
    }
  });
});

test('tileContactSheet fails loudly on missing, empty or mismatched inputs', () => {
  withTempDir((dir) => {
    assert.throws(() => tileContactSheet({ inputs: [], output: path.join(dir, 'x.png') }), /non-empty/);
    assert.throws(
      () => tileContactSheet({ inputs: [path.join(dir, 'nope.png')], output: path.join(dir, 'x.png') }),
      /missing still/
    );
    const a = path.join(dir, 'a.png');
    const b = path.join(dir, 'b.png');
    writeSolidPng(a, Buffer.from([1, 2, 3, 255]), 2, 2);
    writeSolidPng(b, Buffer.from([1, 2, 3, 255]), 4, 4);
    assert.throws(
      () => tileContactSheet({ inputs: [a, b], output: path.join(dir, 'x.png') }),
      /must share one resolution/
    );
    assert.throws(
      () => tileContactSheet({ inputs: [a], output: '' }),
      /output path is required/
    );
  });
});

// ---------------------------------------------------------------------------
// 4. make.mjs wiring + documentation consistency.
// ---------------------------------------------------------------------------

test('make.mjs renders evenly spaced PNG stills and tiles them', () => {
  const src = fs.readFileSync(MAKE_MJS, 'utf8');
  assert.ok(/pickContactFrames\(composition\.durationInFrames/.test(src),
    'make.mjs must derive frame picks from the real clip length');
  assert.ok(/tileContactSheet\(\{/.test(src), 'make.mjs must tile the stills');
  assert.ok(/imageFormat: 'png'/.test(src), 'stills must be real PNGs for the codec');
  assert.ok(/-contact\.png/.test(src), 'the sheet must be written as <story>-contact.png');
  assert.ok(!/frame:\s*30/.test(src), 'the single-frame-30 fake sheet must be gone');
  assert.ok(!/contact\.jpg/.test(src), 'no JPEG sheet path may remain in make.mjs');
});

test('no stale -contact.jpg single-frame references remain for the make.mjs outputs', () => {
  // README/docs/scripts used to document out/<story>-contact.jpg as
  // "frame 30" — the make.mjs sheet is now a real PNG grid.
  // SKILL.md/references' `film-contact.jpg` belongs to the legacy HTML
  // `render.mjs film.html --grid` pipeline (different artifact, unrelated
  // to make.mjs) and is intentionally not scanned here.
  const roots = ['README.md', 'docs', 'scripts', 'src', 'remotion', 'tests'];
  const self = fileURLToPath(import.meta.url); // this test discusses the old name
  const stale = [];
  const walk = (p) => {
    if (p === self) return;
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(p)) {
        if (entry === 'node_modules' || entry === 'out' || entry === '.git') continue;
        walk(path.join(p, entry));
      }
      return;
    }
    if (!/\.(md|mjs|js|ts|tsx|json)$/.test(p)) return;
    if (fs.readFileSync(p, 'utf8').includes('contact.jpg')) stale.push(path.relative(ROOT, p));
  };
  for (const r of roots) walk(path.join(ROOT, r));
  assert.deepEqual(stale, [], `stale contact.jpg references in: ${stale.join(', ')}`);
});
