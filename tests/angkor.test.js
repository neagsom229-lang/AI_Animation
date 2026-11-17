/**
 * @fileoverview Layout invariants for the procedural Angkor Wat set
 * (remotion/lib/angkor.ts). These tests are the contract that keeps the
 * monument standing: five prangs, quincunx order, the central prang
 * dominating the corners, a causeway across a real moat, populated
 * colonnades — and byte-identical layout across builds.
 *
 * Round 4 added the SCALE contract: the monument is sized from the human.
 * A 1.70 m figure must read against a ~4.2 m gallery and a ~37 m apex, and
 * the central prang must be 3× the corners or the silhouette collapses into
 * a brown pyramid.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAngkorLayout,
  TIERS,
  PRANGS,
  CENTRAL_PRANG_APEX_M,
  CENTRAL_TO_CORNER_RATIO,
  HUMAN_HEIGHT_M,
  MOAT_FRONT_Z,
  MOAT_BACK_Z,
  MOAT_WIDTH_X,
  MOAT_WATER_Y,
  CAUSEWAY_PATH,
  CAUSEWAY_BRIDGE,
  CAUSEWAY_LENGTH_M,
  PALM_COUNT,
  FOREST_COUNT,
  LOTUS_COUNT,
  NAGA_HOOD_COUNT,
  nagaRailPath,
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

test('the central prang dominates: 3x the corners (silhouette contract)', () => {
  assert.ok(
    Math.abs(CENTRAL_TO_CORNER_RATIO - 3) < 1e-6,
    `central/corner height ratio is ${CENTRAL_TO_CORNER_RATIO.toFixed(3)}, expected 3.000`
  );
  const [central, ...corners] = PRANGS;
  assert.ok(
    central.radius > corners[0].radius * 1.4,
    'the central prang must also be visibly wider than the corners'
  );
  // The apex must clear the corners by a wide margin or the eye reads one
  // mass instead of a dominant tower with satellites.
  const cornerApex = Math.max(...corners.map((c) => c.position[1] + c.height));
  assert.ok(
    CENTRAL_PRANG_APEX_M - cornerApex > 8,
    `central apex only ${(CENTRAL_PRANG_APEX_M - cornerApex).toFixed(1)} m above the corners`
  );
});

test('the monument is scaled from the human, not the other way round', () => {
  // Gallery colonnade: ~4–5 m, i.e. 2.5–3× a person.
  const outerColonnade = TIERS[0].colonnade;
  assert.ok(
    outerColonnade >= 3.8 && outerColonnade <= 5.0,
    `outer gallery colonnade is ${outerColonnade} m, expected ~4–5 m`
  );
  assert.ok(
    outerColonnade / HUMAN_HEIGHT_M > 2.2,
    'a person must be clearly shorter than the gallery they stand in front of'
  );
  // Apex: monumental but still framable (15–30× a person).
  const ratio = CENTRAL_PRANG_APEX_M / HUMAN_HEIGHT_M;
  assert.ok(ratio > 15, `apex is only ${ratio.toFixed(1)}× human height`);
  assert.ok(ratio < 30, `apex is ${ratio.toFixed(1)}× human height — unframable in a wide`);
});

test('three galleries, floors rise, footprints shrink', () => {
  assert.equal(TIERS.length, 3);
  for (let i = 1; i < TIERS.length; i++) {
    assert.ok(TIERS[i].floor > TIERS[i - 1].floor, 'floors must rise');
    assert.ok(TIERS[i].size[0] < TIERS[i - 1].size[0], 'width must shrink');
    assert.ok(TIERS[i].size[2] < TIERS[i - 1].size[2], 'depth must shrink');
  }
  // Each tier is a colonnade + a roof slab, and they stack without gaps.
  for (let i = 0; i < TIERS.length; i++) {
    const tier = TIERS[i];
    assert.ok(
      Math.abs(tier.colonnade + tier.roof - tier.size[1]) < 1e-9,
      `${tier.name}: height must be colonnade + roof`
    );
    if (i > 0) {
      assert.ok(
        Math.abs(TIERS[i - 1].floor + TIERS[i - 1].size[1] - tier.floor) < 1e-9,
        `${tier.name} must stand exactly on the tier below`
      );
    }
  }
});

test('the moat crosses the site; the bridge spans it; the path approaches', () => {
  assert.ok(MOAT_FRONT_Z > MOAT_BACK_Z, 'moat z ordering');
  assert.ok(MOAT_WIDTH_X >= 70, 'moat must run edge to edge');
  assert.ok(MOAT_WATER_Y < 0, 'the water must sit below the bank lip');
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

test('a dense forest line stands behind the temple', () => {
  const { forest } = buildAngkorLayout();
  assert.equal(forest.length, FOREST_COUNT);
  assert.ok(FOREST_COUNT >= 200, 'the jungle behind the monument must be dense');
  for (const f of forest) {
    assert.ok(f.position[2] < -70, 'forest must sit behind the temple');
  }
});

test('lotus pads float on the moat, clear of the causeway', () => {
  const { lotus } = buildAngkorLayout();
  assert.equal(lotus.length, LOTUS_COUNT);
  for (const l of lotus) {
    assert.ok(Math.abs(l.position[0]) > 3.6, 'a lotus pad must not sit on the causeway');
    assert.ok(
      l.position[2] < MOAT_FRONT_Z && l.position[2] > MOAT_BACK_Z,
      'a lotus pad must be on the water'
    );
    assert.ok(l.position[1] > MOAT_WATER_Y, 'a lotus pad must float on the surface');
  }
});

test('naga balustrade is a continuous rail with hooded heads', () => {
  const { nagaHoods, nagaRails } = buildAngkorLayout();
  assert.equal(nagaHoods.length, NAGA_HOOD_COUNT * 2);
  assert.ok(NAGA_HOOD_COUNT >= 3 && NAGA_HOOD_COUNT <= 5, '3–5 hoods per rail');
  for (const rail of nagaRails) {
    const path = nagaRailPath(rail, 16);
    assert.equal(path.length, 17);
    // Continuous: consecutive samples never jump.
    for (let i = 1; i < path.length; i += 1) {
      const dz = Math.abs(path[i].z - path[i - 1].z);
      const dy = Math.abs(path[i].y - path[i - 1].y);
      assert.ok(dz < 3 && dy < 0.6, 'the naga rail must be a continuous body');
    }
  }
});

test('stair treads are populated', () => {
  const { stairs } = buildAngkorLayout();
  assert.equal(stairs.length, 10);
});
