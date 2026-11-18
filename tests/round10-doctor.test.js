/** Round 10 item 6: film doctor gate order + first-blocker behavior. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runGates } from '../scripts/film-doctor.mjs';
import { loadConfig } from '../scripts/lib/film-config.mjs';

const cfg = loadConfig('.');
const story = JSON.parse(fs.readFileSync('src/stories/khmer-empire.json', 'utf8'));
// runGates probes 18 images via ffmpeg — compute once and share across tests.
const strictGates = runGates({ cfg, story, allowMissing: false });
const looseGates = runGates({ cfg, story, allowMissing: true });

test('runGates stops at the FIRST blocker (duplicates) with a fix', () => {
  assert.ok(strictGates.length >= 3, 'at least environment + ingest + duplicates ran');
  assert.equal(strictGates[0].name, 'environment', 'Round 13: environment is the first gate');
  assert.equal(strictGates[0].status, 'PASS');
  assert.equal(strictGates[1].name, 'ingest');
  assert.equal(strictGates[1].status, 'PASS');
  assert.equal(strictGates[2].name, 'duplicates');
  assert.equal(strictGates[2].status, 'BLOCK');
  assert.ok(strictGates[2].fix.includes('REQUEUE'), 'fix command must include requeue');
  assert.ok(!strictGates.some((g) => g.name === 'resolution'), 'must stop at first blocker');
});

test('--allow-missing advances past duplicates to later gates', () => {
  const names = looseGates.map((g) => g.name);
  assert.ok(names.includes('duplicates'));
  assert.ok(names.includes('resolution') || names.includes('manual-review'), `advanced gates: ${names.join(',')}`);
});

test('gates have status PASS/BLOCK/SKIP and a fix on BLOCK', () => {
  for (const g of [...strictGates, ...looseGates]) {
    assert.ok(['PASS', 'BLOCK', 'SKIP'].includes(g.status));
    if (g.status === 'BLOCK') assert.ok(g.fix.length > 0, `${g.name} BLOCK needs a fix command`);
  }
});
