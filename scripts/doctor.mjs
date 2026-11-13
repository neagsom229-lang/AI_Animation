/**
 * @fileoverview Doctor script for Kuanimation Studio.
 *
 * Checks, in order, every dependency of the one-command pipeline
 * (node scripts/make.mjs) and prints the EXACT fix command for each failure:
 *
 *   1. Node.js >= 18
 *   2. Python 3 with `python -m pip`
 *   3. edge-tts Python package importable
 *   4. Remotion bundled ffmpeg can decode a generated 1-second WAV
 *   5. A live 1-word edge-tts call (network) end-to-end through the generator
 *
 * Run: node scripts/doctor.mjs      (or: npm run doctor)
 * Exit code 0 = all critical checks pass; 1 = at least one failure.
 * No silent fallbacks: every failure is reported with its real error.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const results = [];

function record(name, ok, detail, fix) {
  results.push({ name, ok, detail, fix });
  const mark = ok ? '[PASS]' : '[FAIL]';
  console.log(`${mark} ${name}: ${detail}`);
  if (!ok && fix) console.log(`       FIX: ${fix}`);
  return ok;
}

/** Generate a 1-second 440 Hz mono 16-bit 22050 Hz WAV in the given dir. */
function writeTestWav(filePath) {
  const sampleRate = 22050;
  const seconds = 1;
  const numSamples = sampleRate * seconds;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);        // PCM chunk size
  buf.writeUInt16LE(1, 20);         // PCM format
  buf.writeUInt16LE(1, 22);         // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);         // block align
  buf.writeUInt16LE(16, 34);        // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.round(Math.sin(2 * Math.PI * 440 * t) * 12000);
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

function main() {
  console.log('[Kuanimation Studio Doctor]');
  console.log(`node scripts/doctor.mjs on ${os.type()} ${os.release()}, ${new Date().toISOString()}`);
  console.log('');

  // 1. Node
  const nodeOk = record(
    'Node.js',
    Number(process.versions.node.split('.')[0]) >= 18,
    process.version,
    'Install Node.js 18 or newer from https://nodejs.org (or via winget install OpenJS.NodeJS.LTS).'
  );

  // 2. Python + pip module
  const py = spawnSync('python', ['--version'], { encoding: 'utf8', shell: true });
  let pythonOk = false;
  if (py.status === 0 && /Python 3/.test(`${py.stdout}${py.stderr}`)) {
    const ver = `${py.stdout}`.trim() || `${py.stderr}`.trim();
    const pip = spawnSync('python', ['-m', 'pip', '--version'], { encoding: 'utf8', shell: true });
    pythonOk = pip.status === 0;
    record(
      'Python 3 + pip',
      pythonOk,
      `${ver}; pip ${pythonOk ? 'available' : 'NOT available'}`,
      pythonOk ? '' : 'Python is present but `python -m pip` failed. Reinstall Python with "pip" selected, or run: python -m ensurepip --upgrade'
    );
  } else {
    record('Python 3 + pip', false, `python --version failed (exit ${py.status})`,
      'Install Python 3.10+ from https://python.org and make sure `python --version` works in PowerShell.');
  }

  // 3. edge-tts importable (python.exe is a real exe: spawn directly, no shell)
  if (pythonOk) {
    const et = spawnSync('python', ['-c', 'import edge_tts'], { encoding: 'utf8' });
    record(
      'edge-tts package',
      et.status === 0,
      et.status === 0 ? 'import ok' : `${(`${et.stderr}`.trim().split('\n').pop()) || 'import failed'}`,
      'Run: python -m pip install --user edge-tts'
    );
  }

  // 4. Remotion ffmpeg decode of a 1-second WAV
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kuan-doctor-'));
  const wavIn = path.join(tmpDir, 'doctor-test.wav');
  const wavOut = path.join(tmpDir, 'doctor-decoded.wav');
  try {
    writeTestWav(wavIn);
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const ff = spawnSync(npxCmd, ['remotion', 'ffmpeg', '-y', '-v', 'error', '-i', wavIn, '-ac', '1', '-ar', '22050', wavOut], {
      encoding: 'utf8',
      timeout: 120000,
      shell: process.platform === 'win32',
    });
    const decodedOk = ff.status === 0 && fs.existsSync(wavOut) && fs.statSync(wavOut).size >= 40000;
    record(
      'Remotion ffmpeg decode (1 s test WAV)',
      decodedOk,
      decodedOk
        ? `decoded ${fs.statSync(wavOut).size} bytes PCM`
        : `exit ${ff.status}; ${((`${ff.stderr}` || `${ff.stdout}`).trim().split('\n').pop() || 'no output')}`,
      decodedOk ? '' : 'Run: npm install   (restores @remotion/*, which bundles ffmpeg). Verify with: npx remotion ffmpeg -version'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // 5. Live 1-word edge-tts call through the real generator
  if (pythonOk) {
    console.log('       (live edge-tts call, may take ~10 s)...');
    const tmpLive = fs.mkdtempSync(path.join(os.tmpdir(), 'kuan-doctor-live-'));
    try {
      const live = spawnSync('python', [
        'scripts/generate-voice.py',
        '--story', 'tests/fixtures/one-line-story.json',
        '--out', tmpLive,
        '--json', path.join(tmpLive, 'voice.json'),
      ], { encoding: 'utf8', timeout: 120000, shell: process.platform === 'win32' });
      const liveOk = live.status === 0 && fs.existsSync(path.join(tmpLive, 'voice.json'));
      record(
        'Live edge-tts call (1 word)',
        liveOk,
        liveOk ? `generated ${(fs.readdirSync(tmpLive).filter((f) => f.endsWith('.mp3'))).join(', ')}` :
          `exit ${live.status}; ${((`${live.stderr}` || `${live.stdout}`).trim().split('\n').pop() || 'no output')}`,
        liveOk ? '' : 'edge-tts reached Microsoft servers and failed. Usually a transient 503 or a network/proxy block. Re-run in a minute: node scripts/doctor.mjs'
      );
    } finally {
      fs.rmSync(tmpLive, { recursive: true, force: true });
    }
  }

  const failures = results.filter((r) => !r.ok);
  console.log('');
  if (failures.length > 0) {
    console.error(`Doctor found ${failures.length} failed check(s): ${failures.map((f) => f.name).join(', ')}`);
    process.exit(1);
  }
  console.log('All doctor checks passed. The full pipeline (node scripts/make.mjs) should work.');
}

main();
