/**
 * @fileoverview Contact sheet: pick evenly spaced frames and tile them.
 *
 * `scripts/make.mjs` used to call a single still at frame 30 a "contact
 * sheet". This module builds a real sheet: N frames spread across the whole
 * clip, decoded, downscaled and composited into one grid image.
 *
 * Pure Node (`node:fs` + the sibling png codec) — no npm dependency, so a
 * fresh clone works. Everything is deterministic: the frame picks are pure
 * arithmetic on the clip length, and the pixel work has no randomness.
 *
 * @module scripts/lib/contact-sheet
 */

import fs from 'node:fs';
import { decodePng, encodePng } from './png.mjs';

/** Frames rendered into a sheet by `make.mjs`. */
export const CONTACT_FRAME_COUNT = 6;
/** Grid columns (3 x 2 for the default 6 frames). */
export const CONTACT_SHEET_COLS = 3;
/** Cell width in pixels; height follows the source aspect ratio. */
export const CONTACT_CELL_WIDTH = 960;

/**
 * Pick `count` frame indices spread evenly across a clip of `totalFrames`
 * frames, always including the first and last frame.
 *
 * @param {number} totalFrames composition duration in frames (>= 1)
 * @param {number} [count=CONTACT_FRAME_COUNT] how many frames to pick
 * @returns {number[]} strictly increasing frame indices in [0, totalFrames)
 * @throws on invalid input — a bad clip length must fail the build loudly
 */
export function pickContactFrames(totalFrames, count = CONTACT_FRAME_COUNT) {
  if (!Number.isInteger(totalFrames) || totalFrames < 1) {
    throw new Error(`pickContactFrames: totalFrames must be a positive integer, got ${totalFrames}`);
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`pickContactFrames: count must be a positive integer, got ${count}`);
  }
  const n = Math.min(count, totalFrames);
  if (n === 1) return [0];
  const frames = [];
  for (let i = 0; i < n; i++) {
    frames.push(Math.round((i * (totalFrames - 1)) / (n - 1)));
  }
  return [...new Set(frames)];
}

/**
 * Resize RGBA pixels with area averaging (correct box filter for any
 * downscale ratio; falls back to point sampling when upscaling).
 *
 * @param {Buffer} src RGBA source pixels, row-major
 * @param {number} sw source width
 * @param {number} sh source height
 * @param {number} dw destination width
 * @param {number} dh destination height
 * @returns {Buffer} dw*dh*4 RGBA pixels
 */
export function resizeRgba(src, sw, sh, dw, dh) {
  if (src.length !== sw * sh * 4) {
    throw new Error(`resizeRgba: source is ${src.length} bytes, expected ${sw * sh * 4}`);
  }
  if ([sw, sh, dw, dh].some((v) => !Number.isInteger(v) || v < 1)) {
    throw new Error(`resizeRgba: bad sizes ${sw}x${sh} -> ${dw}x${dh}`);
  }
  const out = Buffer.alloc(dw * dh * 4);
  const rx = sw / dw;
  const ry = sh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const y0 = dy * ry;
    const y1 = Math.min(sh, (dy + 1) * ry);
    const sy0 = Math.floor(y0);
    const sy1 = Math.min(sh, Math.max(sy0 + 1, Math.ceil(y1)));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = dx * rx;
      const x1 = Math.min(sw, (dx + 1) * rx);
      const sx0 = Math.floor(x0);
      const sx1 = Math.min(sw, Math.max(sx0 + 1, Math.ceil(x1)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        if (wy <= 0) continue;
        for (let sx = sx0; sx < sx1; sx++) {
          const wx = Math.min(sx + 1, x1) - Math.max(sx, x0);
          if (wx <= 0) continue;
          const w = wx * wy;
          const i = (sy * sw + sx) * 4;
          r += src[i] * w;
          g += src[i + 1] * w;
          b += src[i + 2] * w;
          a += src[i + 3] * w;
          weight += w;
        }
      }
      const d = (dy * dw + dx) * 4;
      out[d] = Math.round(r / weight);
      out[d + 1] = Math.round(g / weight);
      out[d + 2] = Math.round(b / weight);
      out[d + 3] = Math.round(a / weight);
    }
  }
  return out;
}

/**
 * Tile PNG stills into a single contact-sheet PNG.
 *
 * All inputs must share one resolution (stills of the same composition).
 * Cells are downscaled to `cellWidth` (height keeps the source aspect);
 * a trailing partial row is padded with solid black.
 *
 * @param {{ inputs: string[], output: string, cols?: number, cellWidth?: number }} opts
 *   `inputs` are PNG file paths in reading order (row-major).
 * @returns {{ output: string, frames: number, cols: number, rows: number,
 *   width: number, height: number }} sheet geometry
 * @throws on missing files, mixed resolutions or bad options
 */
export function tileContactSheet({ inputs, output, cols = CONTACT_SHEET_COLS, cellWidth = CONTACT_CELL_WIDTH }) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error('tileContactSheet: inputs must be a non-empty array of PNG paths');
  }
  if (typeof output !== 'string' || !output) {
    throw new Error('tileContactSheet: output path is required');
  }
  if (!Number.isInteger(cols) || cols < 1) {
    throw new Error(`tileContactSheet: cols must be a positive integer, got ${cols}`);
  }
  if (!Number.isInteger(cellWidth) || cellWidth < 1) {
    throw new Error(`tileContactSheet: cellWidth must be a positive integer, got ${cellWidth}`);
  }

  const images = inputs.map((file) => {
    if (!fs.existsSync(file)) throw new Error(`tileContactSheet: missing still ${file}`);
    return decodePng(fs.readFileSync(file));
  });

  const first = images[0];
  for (const [i, img] of images.entries()) {
    if (img.width !== first.width || img.height !== first.height) {
      throw new Error(
        `tileContactSheet: input ${i} is ${img.width}x${img.height}, ` +
          `expected ${first.width}x${first.height} (all stills must share one resolution)`
      );
    }
  }

  const cellHeight = Math.max(1, Math.round((first.height * cellWidth) / first.width));
  const usedCols = Math.min(cols, images.length);
  const rows = Math.ceil(images.length / usedCols);
  const sheetWidth = cellWidth * usedCols;
  const sheetHeight = cellHeight * rows;

  // Solid black canvas (alpha 255 — alpha 0 would make the padding
  // transparent, which looks broken outside PNG-aware viewers).
  const sheet = Buffer.alloc(sheetWidth * sheetHeight * 4);
  for (let i = 3; i < sheet.length; i += 4) sheet[i] = 0xff;

  images.forEach((img, i) => {
    const cell =
      img.width === cellWidth && img.height === cellHeight
        ? img.data
        : resizeRgba(img.data, img.width, img.height, cellWidth, cellHeight);
    const col = i % usedCols;
    const row = Math.floor(i / usedCols);
    for (let y = 0; y < cellHeight; y++) {
      const srcStart = y * cellWidth * 4;
      const dstStart = ((row * cellHeight + y) * sheetWidth + col * cellWidth) * 4;
      cell.copy(sheet, dstStart, srcStart, srcStart + cellWidth * 4);
    }
  });

  fs.writeFileSync(output, encodePng({ width: sheetWidth, height: sheetHeight, data: sheet }));
  return {
    output,
    frames: images.length,
    cols: usedCols,
    rows,
    width: sheetWidth,
    height: sheetHeight,
  };
}
