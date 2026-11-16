/**
 * @fileoverview Layout invariants for the procedural Angkor Wat set
 * (remotion/lib/angkor.ts). These tests are the contract that keeps the
 * monument standing: five prangs, quincunx order, causeway across a real
 * moat, populated colonnades — and byte-identical layout across builds.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAngkorLayout,
  TIERS,
  PRANGS,
  CENTRAL_PRANG_APEX_M,
  MOAT_FRONT_Z,
  MOAT_BACK_Z,
  MOAT_WIDTH_X,
  CAUSEWAY_PATH,
  CAUSEWAY_BRIDGE,
  CAUSEWAY_LENGTH_M,
  PALM_COUNT,
} from '../remotion/lib/angkor.ts';

test('layout is byte-identical across builds (determinism)', () => {
  const a = buildAngkorLayout();
  const b = buildAngkorLayout();
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('five prangs in a quincunx; central is tallest', () => {
  const ids = PRANGS.map((p) => p.id);
  assert.deepEqual(ids, ['central', 'nw', 'ne', 'sw', 'se']);
  const [central, ...corners] = PRANGS;
  for (const c of corners) {
    assert.ok(c.height < central.height, `${c.id} taller than central`);
    assert.ok(Math.abs(c.height - corners[0].height) < 1e-9, 'corner prangs must match');
  }
  // Quincunx symmetry about the temple axis.
  assert.equal(PRANGS[1].position[0], -PRANGS[2].position[0]);
  assert.equal(PRANGS[3].position[0], -PRANGS[4].position[0]);
  assert.equal(PRANGS[1].position[2], PRANGS[2].position[2]);
  assert.equal(PRANGS[3].position[2], PRANGS[4].position[2]);
  assert.equal(CENTRAL_PRANG_APEX_M, central.position[1] + central.height);
  assert.ok(CENTRAL_PRANG_APEX_M > 20, 'central prang must read as a mountain, not a turret');
});

test('three galleries, floors rise, footprints shrink', () => {
  assert.equal(TIERS.length, 3);
  for (let i = 1; i < TIERS.length; i++) {
    assert.ok(TIERS[i].floor > TIERS[i - 1].floor, 'floors must rise');
    assert.ok(TIERS[i].size[0] < TIERS[i - 1].size[0], 'width must shrink');
    assert.ok(TIERS[i].size[2] < TIERS[i - 1].size[2], 'depth must shrink');
  }
});

test('the moat crosses the site; the bridge spans it; the path approaches', () => {
  assert.ok(MOAT_FRONT_Z > MOAT_BACK_Z, 'moat z ordering');
  assert.ok(MOAT_WIDTH_X >= 70, 'moat must run edge to edge');
  const bridgeZMin = CAUSEWAY_BRIDGE.position[2] - CAUSEWAY_BRIDGE.size[2] / 2;
  const bridgeZMax = CAUSEWAY_BRIDGE.position[2] + CAUSEWAY_BRIDGE.size[2] / 2;
  assert.ok(bridgeZMin <= MOAT_BACK_Z + 0.01, 'bridge must reach the far bank');
  assert.ok(bridgeZMax >= MOAT_FRONT_Z - 0.01, 'bridge must reach the near bank');
  const pathZMin = CAUSEWAY_PATH.position[2] - CAUSEWAY_PATH.size[2] / 2;
  const pathZMax = CAUSEWAY_PATH.position[2] + CAUSEWAY_PATH.size[2] / 2;
  assert.ok(pathZMin <= MOAT_FRONT_Z + 0.01, 'path must meet the bridge at the near bank');
  assert.ok(pathZMax > 30, 'path must reach the foreground');
  assert.ok(CAUSEWAY_BRIDGE.position[1] > 0.2, 'bridge sits above water level');
  assert.ok(CAUSEWAY_PATH.size[1] <= 0.1, 'approach path is flush with the terrain');
  assert.equal(CAUSEWAY_LENGTH_M, CAUSEWAY_PATH.size[2] + CAUSEWAY_BRIDGE.size[2]);
});

test('colonnade instances exist and stand on their gallery floors', () => {
  const { colonnades } = buildAngkorLayout();
  assert.ok(colonnades.length > 100, `expected >100 columns, got ${colonnades.length}`);
  for (const c of colonnades) {
    assert.ok(c.position[1] > 1.5, 'columns stand above the terrace base');
  }
});

test('palms stay out of the camera corridor and the moat', () => {
  const { palms } = buildAngkorLayout();
  assert.equal(palms.length, PALM_COUNT);
  for (const p of palms) {
    const [x, , z] = p.position;
    assert.ok(!(Math.abs(x) < 8 && z > -12), `palm in camera corridor at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    assert.ok(!(z > MOAT_FRONT_Z && z < MOAT_BACK_Z && Math.abs(x) < MOAT_WIDTH_X / 2), 'palm in the moat');
  }
});

test('naga finials and stair treads are populated', () => {
  const { nagas, stairs } = buildAngkorLayout();
  assert.ok(nagas.length >= 28, `expected >=28 naga finials, got ${nagas.length}`);
  assert.equal(stairs.length, 12);
});
