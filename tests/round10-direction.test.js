/** Round 10 item 3: parallax direction derived from camera move, not hardcoded. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { directionFromCamera, directionVector, limitParallax } from '../remotion/lib/parallelax-safety.ts';

test('TS directionFromCamera maps all camera moves', () => {
  assert.equal(directionFromCamera('truck-left'), 'left');
  assert.equal(directionFromCamera('truck-right'), 'right');
  assert.equal(directionFromCamera('push-in'), 'none');
  assert.equal(directionFromCamera('push-out'), 'none');
  assert.equal(directionFromCamera('crane-up'), 'none');
  assert.equal(directionFromCamera('static'), 'none');
  assert.equal(directionFromCamera(), 'none');
});

test('directionVector: none/unknown -> zero (no assumed direction)', () => {
  assert.deepEqual(directionVector('none'), { x: 0, y: 0 });
  assert.deepEqual(directionVector('bogus'), { x: 0, y: 0 });
  assert.deepEqual(directionVector('left'), { x: -1, y: 0 });
});

test('limitParallax derives direction from camera when no override', () => {
  const left = limitParallax(0, undefined, 'truck-left');
  const right = limitParallax(0, undefined, 'truck-right');
  const none = limitParallax(0, undefined, 'push-in');
  assert.ok(left.dirX < 0 && right.dirX > 0);
  assert.equal(none.dirX, 0);
  // Explicit override still wins.
  assert.ok(limitParallax(0, { direction: 'right' }, 'truck-left').dirX > 0);
});

test('Python direction_from_camera agrees with TS', () => {
  const PY = `
import importlib.util, json
spec=importlib.util.spec_from_file_location('depth','scripts/depth.py');d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
print(json.dumps({c:d.direction_from_camera(c) for c in ['truck-left','truck-right','push-in','push-out','crane-up','static']}))
`;
  const r = spawnSync('python', ['-c', PY], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout.trim());
  assert.equal(j['truck-left'], 'left');
  assert.equal(j['truck-right'], 'right');
  assert.equal(j['push-in'], 'none');
  assert.equal(j['crane-up'], 'none');
});
