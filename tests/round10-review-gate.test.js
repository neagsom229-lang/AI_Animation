/** Round 10 item 5: manual review gate never auto-filled; blocks final render. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isManifestEntryReady, REQUIRED_MANIFEST_FLAGS } from '../scripts/lib/image-check.mjs';

test('required manual flags include reviewed, matchesNarration, watermarkCheck', () => {
  assert.deepEqual(REQUIRED_MANIFEST_FLAGS.sort(), ['matchesNarration', 'reviewed', 'watermarkCheck'].sort());
});

test('isManifestEntryReady blocks while any manual flag false or license empty', () => {
  const base = { tool: 'T', date: '2026-11-17', prompt: 'P', licenseTermsUrl: 'https://x',
    reviewed: true, matchesNarration: true, watermarkCheck: true };
  assert.equal(isManifestEntryReady(base), true);
  for (const flag of REQUIRED_MANIFEST_FLAGS) {
    assert.equal(isManifestEntryReady({ ...base, [flag]: false }), false, `${flag} false must block`);
  }
  assert.equal(isManifestEntryReady({ ...base, licenseTermsUrl: '' }), false, 'empty license must block');
});

test('no code path auto-fills manual review flags to true', () => {
  const files = [
    'scripts/lib/film-ingest.mjs', 'scripts/make-illustrated.mjs', 'scripts/intake-illustrations.mjs',
  ];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/reviewed\s*=\s*true/.test(src), `${f} must not auto-set reviewed=true`);
    assert.ok(!/matchesNarration\s*=\s*true/.test(src), `${f} must not auto-set matchesNarration=true`);
    assert.ok(!/watermarkCheck\s*=\s*true/.test(src), `${f} must not auto-set watermarkCheck=true`);
  }
});

test('real manifest is unreviewed (honest) — final render would block', () => {
  const p = 'assets-src/illustrations/manifest.json';
  if (!fs.existsSync(p)) return;
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  const bad = (m.scenes || []).filter((e) => !isManifestEntryReady(e));
  assert.ok(bad.length > 0, 'real manifest is not releasable — no flags were silently filled');
});
