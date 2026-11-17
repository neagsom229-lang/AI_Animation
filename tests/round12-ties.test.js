/** Round 12 item 1: tie scenes share the same limitFactor. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const PY = `
import importlib.util, json
spec=importlib.util.spec_from_file_location('depth','scripts/depth.py');d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
# 3 scenes tie on signature + hash, one distinct sharper scene
sharp=[0.9, 0.5, 0.5, 0.5]
sigs=[((0.9,0.1),'h1'), ((0.5,0.05),'same'), ((0.5,0.05),'same'), ((0.5,0.05),'same')]
out={'bySig':d.rank_limit_factors(sharp,sigs),'byHash':d.rank_limit_factors([0.2,0.2,0.2],[((0.2,0.01),'hA'),((0.2,0.02),'hA'),((0.2,0.03),'hB')])}
print(json.dumps(out))
`;

function factors() {
  const r = spawnSync('python', ['-c', PY], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim());
}

test('rank_limit_factors: identical signature -> identical factor', () => {
  const f = factors().bySig;
  assert.equal(f[1], f[2]);
  assert.equal(f[2], f[3]);
  assert.notEqual(f[1], f[0], 'sharper scene gets a different factor');
});

test('rank_limit_factors: identical image hash -> identical factor even when metrics differ', () => {
  const f = factors().byHash;
  assert.equal(f[0], f[1], 'hash hA tie must match despite different metrics');
  assert.notEqual(f[0], f[2]);
});

test('regression: committed real metrics sc-15/16/17 share a factor', () => {
  const m = JSON.parse(fs.readFileSync('out/review/parallax-metrics.json', 'utf8'));
  const g = m.scenes.filter((s) => ['sc-15', 'sc-16', 'sc-17'].includes(s.scene));
  assert.equal(g.length, 3);
  assert.equal(g[0].imageSha256, g[1].imageSha256);
  assert.equal(g[1].imageSha256, g[2].imageSha256);
  assert.equal(g[0].sobelP95, g[1].sobelP95);
  assert.equal(g[0].sharpFraction, g[1].sharpFraction);
  assert.equal(g[0].limitFactor, g[1].limitFactor, 'tie scenes must share factor');
  assert.equal(g[1].limitFactor, g[2].limitFactor, 'tie scenes must share factor');
});

test('regression: no two scenes with identical hash have different factors', () => {
  const m = JSON.parse(fs.readFileSync('out/review/parallax-metrics.json', 'utf8'));
  const byHash = new Map();
  for (const s of m.scenes) byHash.set(s.imageSha256, s.limitFactor);
  const seen = new Map();
  for (const s of m.scenes) {
    if (seen.has(s.imageSha256)) assert.equal(seen.get(s.imageSha256), s.limitFactor, `${s.scene} hash tie drift`);
    seen.set(s.imageSha256, s.limitFactor);
  }
  assert.ok(byHash.size > 0);
});
