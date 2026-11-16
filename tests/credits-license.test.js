/**
 * @fileoverview License floor for every asset documented in CREDITS.md.
 *
 * Every `| License | ... |` table cell (each shipped/documented asset) must
 * be a permissive license: CC0, SIL OFL, MIT, Apache, or plain CC-BY. Anything
 * non-commercial, share-alike, no-derivatives, or editorial fails the build —
 * those assets can never ship in this film.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const creditsText = readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');

/** Tokens that disqualify a shipped asset outright (case-insensitive). */
const BANNED = [
  /non-?commercial/i,
  /CC-BY-NC/i,
  /share-?alike/i,
  /CC-BY-SA/i,
  /no-?derivatives/i,
  /CC-BY-ND/i,
  /editorial/i,
  /rights?\s*reserved/i,
  /\ball rights\b/i,
];

test('CREDITS.md exists and every License cell is permissive', () => {
  assert.ok(existsSync(path.join(ROOT, 'CREDITS.md')), 'CREDITS.md missing');
  const cells = [...creditsText.matchAll(/\|\s*License\s*\|([^|]+)\|/g)].map((m) => m[1]);
  assert.ok(cells.length >= 8, `expected >=8 License cells, found ${cells.length}`);
  for (const cell of cells) {
    for (const bad of BANNED) {
      assert.ok(!bad.test(cell), `banned license token ${bad} in License cell: "${cell.trim().slice(0, 80)}"`);
    }
  }
});

test('every License cell asserts an explicitly permissive license', () => {
  const cells = [...creditsText.matchAll(/\|\s*License\s*\|([^|]+)\|/g)].map((m) => m[1]);
  const permissive = /CC0|public domain|open font|SIL OFL|\bMIT\b|Apache/i;
  for (const cell of cells) {
    assert.ok(permissive.test(cell), `License cell names no recognized permissive license: "${cell.trim().slice(0, 80)}"`);
  }
});
