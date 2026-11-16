/**
 * @fileoverview Tile a set of stills into a QA contact sheet for
 * out/review/. Usage:
 *   node scripts/review-sheet.mjs --prefix out/review/khmer-temple-audit --names f0,f62,f124,f187,f249,f311 --out out/review/phase-2-after.png
 */
import path from 'path';
import { tileContactSheet, CONTACT_SHEET_COLS, CONTACT_CELL_WIDTH } from './lib/contact-sheet.mjs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    prefix: { type: 'string' },
    names: { type: 'string' },
    out: { type: 'string' },
    cols: { type: 'string' },
  },
});
if (!values.prefix || !values.names || !values.out) {
  console.error('usage: node scripts/review-sheet.mjs --prefix <path-prefix> --names a,b,c --out <file> [--cols N]');
  process.exit(2);
}
const inputs = values.names.split(',').map((n) => `${values.prefix}-${n.trim()}.png`);
const sheet = tileContactSheet({
  inputs,
  output: values.out,
  cols: values.cols ? Number(values.cols) : 3,
  cellWidth: 640,
});
console.log(`wrote ${sheet.output} (${sheet.width}x${sheet.height}, ${sheet.cols}x${sheet.rows}) from ${sheet.frames} frames`);
