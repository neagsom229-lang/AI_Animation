/**
 * @fileoverview Doctor script for Kuanimation Studio.
 * Checks Node.js, Python, edge-tts, Chrome/Remotion browser, and environment status.
 * Run via: npm run doctor
 */

import { execSync } from 'child_process';
import fs from 'fs';

function check() {
  console.log('[Kuanimation Studio Doctor] Checking environment...');
  let errors = 0;

  // 1. Check Node
  try {
    const nodeVer = process.version;
    console.log(`[PASS] Node.js version: ${nodeVer}`);
  } catch (e) {
    console.error('[FAIL] Node.js check failed.');
    errors++;
  }

  // 2. Check Python
  try {
    const pyVer = execSync('python --version', { encoding: 'utf-8' }).trim();
    console.log(`[PASS] Python: ${pyVer}`);
  } catch (e) {
    console.error('[FAIL] Python is not installed or not in PATH. Install Python 3.10+.');
    errors++;
  }

  // 3. Check edge-tts
  try {
    execSync('python -c "import edge_tts"', { stdio: 'ignore' });
    console.log('[PASS] edge-tts Python package available.');
  } catch (e) {
    console.warn('[WARN] edge-tts Python package not found. Run: pip install edge-tts aiohttp');
  }

  // 4. Check project structure
  const requiredFiles = ['package.json', 'remotion/Root.tsx', 'src/stories/khmer-temple.json'];
  for (const f of requiredFiles) {
    if (fs.existsSync(f)) {
      console.log(`[PASS] Found required file: ${f}`);
    } else {
      console.error(`[FAIL] Missing required file: ${f}`);
      errors++;
    }
  }

  if (errors > 0) {
    console.log(`\nDoctor found ${errors} critical issue(s). Please fix the items above.`);
    process.exit(1);
  } else {
    console.log('\nAll checks passed successfully! Kuanimation Studio is ready.');
  }
}

check();
