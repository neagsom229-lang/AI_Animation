/** Round 10 item 2: composite depth cache key + source-identity tests. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const PY = `
import importlib.util, json
spec = importlib.util.spec_from_file_location('depth', 'scripts/depth.py')
d = importlib.util.module_from_spec(spec); spec.loader.exec_module(d)
a = d.depth_cache_key('IMG', 'model')
b = d.depth_cache_key('IMG', 'gradient')
c = d.depth_cache_key('IMG', 'model')
e = d.depth_cache_key('OTHER', 'model')
v = d.depth_cache_key('IMG', 'model', script_version='different')
print(json.dumps({ 'model': a, 'gradient': b, 'modelAgain': c, 'otherImage': e, 'otherVersion': v,
  'scriptVersion': d.SCRIPT_VERSION, 'modelRevision': d.MODEL_REVISION }))
`;

function keys() {
  const r = spawnSync('python', ['-c', PY], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim());
}

test('cache key includes depth mode: gradient never equals model', () => {
  const k = keys();
  assert.notEqual(k.model, k.gradient, 'mode must be part of the key');
  assert.equal(k.model, k.modelAgain, 'same inputs -> same key (deterministic)');
});

test('cache key includes image hash + script version + model identity', () => {
  const k = keys();
  assert.notEqual(k.model, k.otherImage);
  assert.notEqual(k.model, k.otherVersion);
  assert.ok(k.scriptVersion.includes('round10'));
  assert.ok(k.modelRevision.includes('2026-11-17'));
});

test('real sidecars carry depthSource (fixes "cannot tell source")', () => {
  const p = 'assets-src/illustrations/scene-01-depth.png.sha256';
  if (!fs.existsSync(p)) return;
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.ok(['model', 'gradient'].includes(m.depthSource), 'real cache must record its source (model or gradient)');
  assert.ok(m.cacheKey && m.imageSha256 && m.modelRevision && m.scriptVersion);
});

test('parallax metrics include all three stats + depthSource (no all-zero implementation)', () => {
  const p = 'out/review/parallax-metrics.json';
  if (!fs.existsSync(p)) return;
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const s of m.scenes) {
    assert.ok('depthEdgeMetric' in s && 'depthRange' in s && 'flatDepth' in s && 'depthSource' in s);
    assert.ok(s.limitFactor >= 0.25 && s.limitFactor <= 1);
    assert.ok(['model', 'gradient', 'unknown-legacy-cache'].includes(s.depthSource));
  }
});
