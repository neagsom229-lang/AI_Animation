#!/usr/bin/env node
/** Run the LIVE NETWORK tests only (never part of `npm test`). */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = path.resolve('tests/network');
if (!fs.existsSync(dir)) {
  console.error('No tests/network/ directory — nothing to run.');
  process.exit(1);
}
const files = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.test.js'))
  .sort()
  .map((f) => path.join(dir, f));
if (!files.length) {
  console.error('No live-network test files found in tests/network/.');
  process.exit(1);
}
console.log(`Running ${files.length} LIVE NETWORK test file(s) (requires edge-tts connectivity):`);
for (const f of files) console.log(`  ${path.relative(process.cwd(), f).replace(/\\/g, '/')}`);
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
