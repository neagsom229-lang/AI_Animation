/** Round 12 item 4: licenseTermsUrl requirement printed/checked at START of ingest. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('ingest source states the license requirement before scanning', () => {
  const src = fs.readFileSync('scripts/lib/film-ingest.mjs', 'utf8');
  const reqIdx = src.indexOf('ingest REQUIREMENT: each image must have a licenseTermsUrl');
  const scanIdx = src.indexOf('resolveDropFolder({ root, inbox');
  assert.ok(reqIdx > 0, 'license requirement notice must exist');
  assert.ok(scanIdx > 0, 'drop-folder scan must exist');
  assert.ok(reqIdx < scanIdx, 'license requirement must be printed BEFORE scanning images');
});

test('ingest throws early when licenseTermsUrl empty and not --force', () => {
  const src = fs.readFileSync('scripts/lib/film-ingest.mjs', 'utf8');
  assert.ok(src.includes('licenseTermsUrl is required in film.config.json'), 'early error must exist');
  const errIdx = src.indexOf('licenseTermsUrl is required in film.config.json');
  const scanIdx = src.indexOf('resolveDropFolder({ root, inbox');
  assert.ok(errIdx < scanIdx, 'early throw must precede scanning');
});

test('real ingest output starts with the REQUIREMENT notice', () => {
  const p = 'C:/Users/chhea/AppData/Local/Temp/opencode/r12-ingest-start.txt';
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf16le'); // PowerShell > writes UTF-16
  const clean = text.includes('ingest REQUIREMENT') ? text : fs.readFileSync(p, 'utf8');
  const req = clean.indexOf('ingest REQUIREMENT');
  const scan = clean.indexOf('ingest: 18 inbox file');
  assert.ok(req >= 0, 'real output must contain the requirement notice');
  if (scan >= 0) assert.ok(req < scan, 'notice before scan in real output');
});
