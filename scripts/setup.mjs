#!/usr/bin/env node
/**
 * @fileoverview One-command environment setup + health check for Kuanimation Studio.
 *
 * Checks Node, finds a suitable Python (prefers 3.12/3.11 via `py -3.12`),
 * creates the ONE env .venv-depth, installs torch + transformers + Pillow +
 * numpy + edge-tts with `python -m pip`, verifies each import, checks full
 * Chrome for the GPU render, checks Remotion ffmpeg decode, and runs the RAM
 * preflight. Prints EXACT fix commands for every failure.
 *
 * No silent fallbacks: if only Python 3.13+/3.14 exists, warns that torch may
 * lack wheels and suggests `--depth gradient` (the labeled fallback). Never
 * asserts that dependency install succeeded without running it.
 *
 * Usage:
 *   node scripts/setup.mjs
 *   node scripts/setup.mjs --depth gradient   # skip torch install, use fallback
 *   node scripts/setup.mjs --no-install       # checks only, no venv/pip changes
 */

import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importProbeScript, parseImportProbe } from './lib/film-env.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VENV = path.join(ROOT, '.venv-depth');
const ENV_DEPS = ['torch', 'transformers', 'pillow', 'numpy', 'edge-tts'];
const IMPORT_NAMES = ['torch', 'transformers', 'PIL', 'numpy', 'edge_tts'];
const ENV_DEPS_PAIRS = [
  ['torch', 'torch'], ['transformers', 'transformers'], ['pillow', 'PIL'],
  ['numpy', 'numpy'], ['edge-tts', 'edge_tts'],
];

export function parseArgs(argv) {
  const args = { depth: 'model', install: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--depth' && argv[i + 1]) args.depth = argv[++i];
    else if (a === '--no-install') args.install = false;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown or incomplete argument: ${a}`);
  }
  if (!['model', 'gradient'].includes(args.depth)) throw new Error('--depth must be model or gradient');
  return args;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT, encoding: 'utf8', shell: false,
    ...opts,
  });
  return { ok: r.status === 0, status: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

/** Record a check result and print it with an exact fix command on failure. */
export class Results {
  constructor() { this.rows = []; }
  check(name, ok, detail, fix) {
    this.rows.push({ name, ok, detail });
    console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}: ${detail}`);
    if (!ok && fix) console.log(`       FIX: ${fix}`);
    return ok;
  }
  get failed() { return this.rows.filter((r) => !r.ok); }
}

/** Find a Python interpreter. Prefers 3.12/3.11 via `py -3.12` / `py -3.11`. */
export function findPython() {
  for (const ver of ['3.12', '3.11']) {
    const r = run('py', [`-${ver}`, '--version']);
    if (r.ok) return { cmd: 'py', prefix: [`-${ver}`], version: r.out, preferred: true };
  }
  const r = run('python', ['--version']);
  if (r.ok) return { cmd: 'python', prefix: [], version: r.out, preferred: false };
  return null;
}

/** Is the reported Python version older than 3.15 (torch wheels likely exist)? */
export function versionHasTorchWheels(version) {
  const m = String(version).match(/(\d+)\.(\d+)/);
  if (!m) return false;
  const [maj, min] = [Number(m[1]), Number(m[2])];
  if (maj < 3) return false;
  return min <= 12; // 3.13+/3.14 may lack torch wheels
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) { console.log('Usage: node scripts/setup.mjs [--depth model|gradient] [--no-install]'); return 0; }
  const R = new Results();

  // 1. Node
  const major = Number(process.versions.node.split('.')[0]);
  R.check('Node.js >= 18', major >= 18, process.version, 'Install Node 18+ from https://nodejs.org');

  // 2. Python
  const py = findPython();
  if (!py) {
    R.check('Python', false, 'not found', 'Install Python 3.12 from https://python.org (with py launcher)');
    return finish(R);
  }
  R.check('Python', true, `${py.version} (${py.preferred ? 'preferred' : 'default'})`);
  if (fs.existsSync(path.join(ROOT, '.venv'))) {
    console.log('[WARN] legacy .venv found: deprecated and IGNORED by the film pipeline (kept on disk; nothing deleted).');
    console.log('       The ONE env is .venv-depth — this setup installs/verifies it.');
  }
  if (!py.preferred && !versionHasTorchWheels(py.version)) {
    console.log(`[WARN] Python ${py.version}: PyTorch may lack wheels for this version.`);
    console.log('       torch depth model may not install; use --depth gradient for the labeled fallback.');
    console.log('       FIX (preferred): py -3.12 -m venv .venv-depth  (install Python 3.12 first).');
  }

  // 3. Full Chrome for GPU render
  const { resolveBrowser } = await import('./lib/browser.mjs');
  const browser = resolveBrowser();
  R.check('Full Chrome/Edge for GPU', browser.isFull, browser.label,
    'Install Google Chrome or Edge, or set CHROME=<path to chrome.exe>');

  // 4. Remotion ffmpeg decode (1 s silence-shaped WAV)
  const tmp = path.join(ROOT, 'out', '.setup-test.wav');
  try {
    const srate = 22050, n = srate;
    const buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22); buf.writeUInt32LE(srate, 24); buf.writeUInt32LE(srate * 2, 28);
    buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, buf);
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const ff = run(npx, ['remotion', 'ffmpeg', '-y', '-v', 'error', '-i', tmp, '-ac', '1', path.join(ROOT, 'out', '.setup-test-out.wav')], { shell: process.platform === 'win32' });
    R.check('Remotion ffmpeg decode', ff.ok, ff.ok ? 'decoded 1 s WAV' : ff.out.slice(0, 160), 'Run npm install (restores @remotion/* bundled ffmpeg)');
  } finally {
    for (const f of [tmp, path.join(ROOT, 'out', '.setup-test-out.wav')]) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
  }

  // 5. install the ONE env deps into .venv-depth using `python -m pip` (never pip.exe)
  if (args.install && args.depth === 'model') {
    const pyBin = path.join(VENV, process.platform === 'win32' ? 'Scripts' : 'bin', 'python' + (process.platform === 'win32' ? '.exe' : ''));
    if (!fs.existsSync(pyBin)) {
      console.log(`[setup] Creating ${VENV} ...`);
      const mk = run(py.cmd, [...py.prefix, '-m', 'venv', VENV]);
      R.check('Create .venv-depth', mk.ok, mk.ok ? VENV : mk.out.slice(0, 160), 'Install Python 3.12 and re-run; or use --depth gradient');
    }
    if (fs.existsSync(pyBin)) {
      console.log(`[setup] Installing (python -m pip): ${ENV_DEPS.join(' ')} ...`);
      const ins = run(pyBin, ['-m', 'pip', 'install', ...ENV_DEPS]);
      R.check('Python deps install', ins.ok, ins.ok ? ENV_DEPS.join(', ') : ins.out.slice(-200),
        `${pyBin} -m pip install ${ENV_DEPS.join(' ')}  (or use --depth gradient)`);

      // Item 1: verify EVERY import in the one env (never assume install = import).
      const probe = run(pyBin, ['-c', importProbeScript()]);
      const imports = parseImportProbe(probe.out);
      for (const [pipName, importName] of ENV_DEPS_PAIRS) {
        const v = imports[importName];
        const ok = Boolean(v) && !String(v).startsWith('ERR:');
        R.check(`import ${importName}`, ok, ok ? String(v) : (v || probe.out.slice(-120) || 'no output'),
          `${pyBin} -m pip install ${pipName}`);
      }
    }
  } else if (args.depth === 'gradient') {
    console.log('[setup] --depth gradient: skipping torch install (labeled fallback will be used).');
  } else {
    console.log('[setup] --no-install: skipping venv/pip changes.');
  }

  // 6. RAM preflight
  const { runPreflight, formatPreflight } = await import('./preflight.mjs');
  for (const line of formatPreflight(runPreflight())) console.log(line);

  return finish(R);
}

function finish(R) {
  console.log('');
  if (R.failed.length === 0) {
    console.log('SETUP OK — run `node scripts/doctor.mjs` then `npm run qa`.');
    return 0;
  }
  console.error(`SETUP INCOMPLETE — ${R.failed.length} check(s) failed (fix commands above).`);
  return 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().then((code) => { process.exitCode = code; }).catch((err) => { console.error('Setup crashed:', err); process.exit(1); });
}
