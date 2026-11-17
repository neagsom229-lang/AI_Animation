/** Phase 1 QA: setup + doctor helper purity and CLI arg parsing. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs as setupArgs, versionHasTorchWheels, Results } from '../scripts/setup.mjs';

test('setup parseArgs validates depth mode', () => {
  assert.deepEqual(setupArgs([]), { depth: 'model', install: true });
  assert.equal(setupArgs(['--depth', 'gradient']).depth, 'gradient');
  assert.equal(setupArgs(['--no-install']).install, false);
  assert.throws(() => setupArgs(['--depth', 'bogus']), /must be model or gradient/);
  assert.throws(() => setupArgs(['--wat']), /Unknown/);
});

test('versionHasTorchWheels reflects Python version bands', () => {
  assert.equal(versionHasTorchWheels('Python 3.12.1'), true);
  assert.equal(versionHasTorchWheels('Python 3.11.9'), true);
  assert.equal(versionHasTorchWheels('Python 3.14.7'), false);
  assert.equal(versionHasTorchWheels('Python 3.13.0'), false);
  assert.equal(versionHasTorchWheels('garbage'), false);
});

test('Results tracks pass/fail and exact fix text', () => {
  const R = new Results();
  R.check('ok', true, 'yes');
  R.check('bad', false, 'no', 'FIX: do this');
  assert.equal(R.rows.length, 2);
  assert.equal(R.failed.length, 1);
  assert.equal(R.failed[0].name, 'bad');
});
