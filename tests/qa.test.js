/** Phase 7 QA: the qa orchestrator exists and package.json wires it. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('npm run qa is wired to scripts/qa.mjs', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts.qa, 'node scripts/qa.mjs');
  assert.ok(fs.existsSync('scripts/qa.mjs'));
});

test('qa orchestrator covers all required gates', () => {
  const src = fs.readFileSync('scripts/qa.mjs', 'utf8');
  for (const gate of ['tsc', 'npm test', 'verify-determinism', 'StoryFilm', 'IllustratedFilm',
    'illustrated-manifest', 'License coverage', 'Duration >= 120', 'Loudness', 'Caption safe area']) {
    assert.ok(src.includes(gate), `QA missing gate: ${gate}`);
  }
});

test('GitHub Actions workflows: tests on push, weekly audit, secret check', () => {
  const files = fs.readdirSync('.github/workflows');
  assert.ok(files.some((f) => f.includes('render') || f.includes('ci')), 'CI render/test workflow');
  assert.ok(files.some((f) => f.includes('audit')), 'weekly npm audit workflow');
  assert.ok(files.some((f) => f.includes('secret')), 'secret-check workflow');
  const audit = fs.readFileSync('.github/workflows/npm-audit.yml', 'utf8');
  assert.ok(audit.includes('cron:') && audit.includes('npm audit'));
  const secret = fs.readFileSync('.github/workflows/secret-check.yml', 'utf8');
  assert.ok(secret.includes('check_secrets.py'));
});
