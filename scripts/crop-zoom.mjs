/**
 * @fileoverview CLI: crop a region of a PNG and scale it up for visual QA.
 * Usage: node scripts/crop-zoom.mjs <in.png> <out.png> <x> <y> <w> <h> [scale]
 * Pure Node (sibling png codec) — used to inspect faces on 1080p stills.
 */
import fs from 'node:fs';
import { decodePng, encodePng } from './lib/png.mjs';

const [input, output, xs, ys, ws, hs, ss] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/crop-zoom.mjs <in.png> <out.png> x y w h [scale]');
  process.exit(2);
}
const x = Number(xs);
const y = Number(ys);
const w = Number(ws);
const h = Number(hs);
const scale = ss ? Number(ss) : 3;
if (![x, y, w, h, scale].every(Number.isFinite)) {
  console.error('invalid numeric argument');
  process.exit(2);
}

const img = decodePng(fs.readFileSync(input));
if (x < 0 || y < 0 || x + w > img.width || y + h > img.height) {
  console.error(`crop out of bounds: image is ${img.width}x${img.height}`);
  process.exit(1);
}
const ow = Math.round(w * scale);
const oh = Math.round(h * scale);
const out = Buffer.alloc(ow * oh * 4);
for (let oy = 0; oy < oh; oy++) {
  const sy = y + Math.min(h - 1, Math.floor((oy / oh) * h));
  for (let ox = 0; ox < ow; ox++) {
    const sx = x + Math.min(w - 1, Math.floor((ox / ow) * w));
    const si = (sy * img.width + sx) * 4;
    const di = (oy * ow + ox) * 4;
    out[di] = img.data[si];
    out[di + 1] = img.data[si + 1];
    out[di + 2] = img.data[si + 2];
    out[di + 3] = img.data[si + 3];
  }
}
fs.writeFileSync(output, encodePng({ width: ow, height: oh, data: out }));
console.log(`wrote ${output} (${ow}x${oh})`);
