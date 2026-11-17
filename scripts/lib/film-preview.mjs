/**
 * @fileoverview Preview helpers: embed/read an input hash in contact-sheet PNG
 * metadata (tEXt chunk), plus the preview stage that wraps storyboard.mjs.
 * @module scripts/lib/film-preview
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const META_KEYWORD = 'KuanimationInputHash';
export const MISSING_BADGE = 'PLACEHOLDER — MISSING ASSET';

/** Insert a tEXt chunk before IEND in a PNG buffer (pure bytes). */
export function embedPngText(png, keyword, text) {
  const buf = Buffer.isBuffer(png) ? png : Buffer.from(png);
  const kw = Buffer.from(keyword, 'latin1');
  const val = Buffer.from(text, 'latin1');
  const data = Buffer.concat([kw, Buffer.from([0]), val]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write('tEXt', 4, 'latin1');
  data.copy(chunk, 8);
  // CRC32 (PNG uses IEEE polynomial, init 0xFFFFFFFF, final xor).
  let crc = 0xffffffff;
  const bytes = Buffer.concat([Buffer.from('tEXt', 'latin1'), data]);
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  const iend = buf.lastIndexOf(Buffer.from('IEND', 'latin1')) - 4;
  if (iend < 8) throw new Error('embedPngText: not a valid PNG (no IEND)');
  return Buffer.concat([buf.slice(0, iend), chunk, buf.slice(iend)]);
}

/** Read a tEXt keyword from a PNG buffer. Returns null when absent. */
export function readPngText(png, keyword) {
  const buf = Buffer.isBuffer(png) ? png : Buffer.from(png);
  let pos = 8;
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    if (type === 'tEXt') {
      const body = buf.toString('latin1', pos + 8, pos + 8 + len);
      const [k, ...v] = body.split('\0');
      if (k === keyword) return v.join('\0');
    }
    if (type === 'IEND') break;
    pos += 12 + len;
  }
  return null;
}

/** Embed hash + write sidecar meta.json; returns paths. */
export function stampSheet(sheetPath, inputHash, extra = {}) {
  const png = fs.readFileSync(sheetPath);
  const out = embedPngText(png, META_KEYWORD, inputHash);
  fs.writeFileSync(sheetPath, out);
  const meta = { inputHash, sheet: path.basename(sheetPath), generated: new Date().toISOString(), ...extra };
  const metaPath = `${sheetPath.replace(/\.png$/i, '')}.meta.json`;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  return { sheetPath, metaPath, inputHash };
}

export function isSheetStale(sheetPath, currentHash) {
  if (!fs.existsSync(sheetPath)) return true;
  const embedded = readPngText(fs.readFileSync(sheetPath), META_KEYWORD);
  if (embedded) return embedded !== currentHash;
  const metaPath = `${sheetPath.replace(/\.png$/i, '')}.meta.json`;
  if (fs.existsSync(metaPath)) {
    const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return m.inputHash !== currentHash;
  }
  return true;
}
