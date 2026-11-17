/** Round 11 item 1: new depth metrics (sobelP95, sharpFraction) + rank-based limiter. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const PY = `
import importlib.util, sys, json
spec=importlib.util.spec_from_file_location('depth','scripts/depth.py');d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
p=sys.argv[1];kind=sys.argv[2];w,h=256,256
if kind=='ramp':    fn=lambda y,x: int(65535*x/(w-1))              # smooth: tiny gradient everywhere
elif kind=='stripes':fn=lambda y,x: 0 if (x//8)%2==0 else 65535    # many sharp edges (>5% of pixels)
elif kind=='flat':  fn=lambda y,x: 32768
d.write_gray16(p,w,h,fn)
s=d.depth_statistics(p)
f=d.rank_limit_factors([s['sobelP95']])
print(json.dumps({'stats':s,'factors':f}))
`;
function fixture(kind) {
  const p = `C:/Users/chhea/AppData/Local/Temp/opencode/r11-${kind}.png`;
  const r = spawnSync('python', ['-c', PY, p, kind], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim());
}

test('soft ramp: low sobelP95 and sharpFraction', () => {
  const { stats } = fixture('ramp');
  assert.ok(stats.sobelP95 < 0.01, `ramp p95 ${stats.sobelP95}`);
  assert.ok(stats.sharpFraction < 0.05, `ramp sharpFrac ${stats.sharpFraction}`);
});

test('sharp stripes: higher sobelP95 and sharpFraction than smooth ramp', () => {
  const sharp = fixture('stripes').stats;
  const ramp = fixture('ramp').stats;
  assert.ok(sharp.sobelP95 > ramp.sobelP95, `stripes ${sharp.sobelP95} > ramp ${ramp.sobelP95}`);
  assert.ok(sharp.sharpFraction > ramp.sharpFraction, `stripes sharp ${sharp.sharpFraction} > ramp ${ramp.sharpFraction}`);
});

test('flat map: near-zero sobelP95 and sharpFraction', () => {
  const { stats } = fixture('flat');
  assert.ok(stats.sobelP95 < 0.001);
  assert.equal(stats.sharpFraction, 0);
});

test('rank_limit_factors: sharpest get lower factor, all clamped [0.4,1]', () => {
  const PY2 = `
import importlib.util, json
spec=importlib.util.spec_from_file_location('depth','scripts/depth.py');d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
vals=[0.9,0.1,0.5,0.3,0.8,0.2,0.7,0.4]
print(json.dumps(d.rank_limit_factors(vals)))
`;
  const r = spawnSync('python', ['-c', PY2], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const f = JSON.parse(r.stdout.trim());
  assert.equal(f.length, 8);
  for (const x of f) assert.ok(x >= 0.4 && x <= 1);
  assert.ok(f[0] <= 0.7, `sharpest factor ${f[0]} should be <=0.7`);
  assert.ok(Math.min(...f) >= 0.6);
});

test('regression: committed real metrics vary (not identical) and have new fields', () => {
  const p = 'out/review/parallax-metrics.json';
  assert.ok(fs.existsSync(p), 'real metrics file must exist');
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(m.scenes.length, 18);
  for (const s of m.scenes) {
    assert.ok(typeof s.sobelP95 === 'number', `${s.scene} missing sobelP95`);
    assert.ok(typeof s.sharpFraction === 'number', `${s.scene} missing sharpFraction`);
    assert.ok(s.limitFactor >= 0.4 && s.limitFactor <= 1);
    assert.ok(s.depthSource === 'model');
  }
  assert.ok(new Set(m.scenes.map((s) => s.sobelP95)).size > 1, 'sobelP95 must NOT be identical across scenes (STOP rule)');
  assert.ok(new Set(m.scenes.map((s) => s.sharpFraction)).size > 1, 'sharpFraction must NOT be identical across scenes');
  const limited = m.scenes.filter((s) => s.limitFactor <= 0.8);
  assert.ok(limited.length >= 1 && limited.length <= Math.ceil(18 * 0.25) + 1, `sharpest quartile count ${limited.length}`);
});
