/** Round 10 item 1: depth metric definition validated on synthetic fixtures. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const PY = `
import importlib.util, sys
spec = importlib.util.spec_from_file_location('depth', 'scripts/depth.py')
d = importlib.util.module_from_spec(spec); spec.loader.exec_module(d)
p = sys.argv[1]
w,h = 64,36
kind = sys.argv[2]
if kind == 'flat':   fn = lambda y,x: 32768
elif kind == 'step': fn = lambda y,x: 0 if x < w//2 else 65535
elif kind == 'ramp': fn = lambda y,x: int(65535*x/(w-1))
d.write_gray16(p,w,h,fn)
print(__import__('json').dumps(d.depth_statistics(p)))
`;

function statsFor(kind) {
  const p = path.join(os.tmpdir(), `kuan-r10-${kind}.png`);
  const r = spawnSync('python', ['-c', PY, p, kind], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim());
}

test('flat depth map: flatDepth true, edgeMetric ~0, range ~0', () => {
  const s = statsFor('flat');
  assert.equal(s.flatDepth, true);
  assert.ok(s.edgeMetric < 0.001);
  assert.ok(s.depthRange < 0.01);
});

test('hard step edge: high edgeMetric, full range, not flat', () => {
  const s = statsFor('step');
  assert.ok(s.edgeMetric > 0.02, `step edgeMetric ${s.edgeMetric} should be highest`);
  assert.ok(s.depthRange > 0.9);
  assert.equal(s.flatDepth, false);
});

test('smooth ramp: low edgeMetric (lower than step), wide range, not flat', () => {
  const ramp = statsFor('ramp');
  const step = statsFor('step');
  assert.ok(ramp.edgeMetric < step.edgeMetric, 'ramp edge must be lower than hard step');
  assert.ok(ramp.depthRange > 0.5);
  assert.equal(ramp.flatDepth, false);
});

test('metric is NOT identically zero across synthetic fixtures', () => {
  const all = [statsFor('flat'), statsFor('step'), statsFor('ramp')];
  assert.ok(all.some((s) => s.edgeMetric > 0), 'the metric implementation must detect at least one edge');
});

test('safety factor clamps to [0.25, 1] (Round 10 item 1)', async () => {
  const m = await import('../remotion/lib/parallelax-safety.ts');
  assert.equal(m.safetyFactor(0), 1);
  assert.equal(m.safetyFactor(1), 0.25, 'must clamp at MIN_LIMIT_FACTOR, never 0');
  assert.ok(m.safetyFactor(0.1) > 0.25 && m.safetyFactor(0.1) < 1);
  assert.equal(m.MIN_LIMIT_FACTOR, 0.25);
});
