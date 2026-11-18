/** Round 13 item 9: offline npm test must not pull in live network tests. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('live-network tests are split out of npm test (offline skip)', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.js', 'npm test must match only top-level tests');
  assert.equal(typeof pkg.scripts['test:network'], 'string', 'test:network script must exist');
  assert.ok(fs.existsSync('tests/network/story-voice-network.test.js'));
  assert.ok(!fs.existsSync('tests/story-voice-network.test.js'), 'network test must not be in the offline glob');
  const off = fs.readFileSync('tests/story-voice.test.js', 'utf8');
  assert.ok(!off.includes('real edge-tts generation'), 'offline suite must not contain the live call');
  assert.match(off, /npm run test:network/);
  const net = fs.readFileSync('tests/network/story-voice-network.test.js', 'utf8');
  assert.match(net, /LIVE NETWORK test/);
  assert.match(net, /real edge-tts generation/);
  console.log('SKIP live-network tests under npm test — run: npm run test:network (needs edge-tts connectivity)');
});
