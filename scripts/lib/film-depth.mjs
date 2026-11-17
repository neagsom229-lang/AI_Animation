/**
 * @fileoverview Round 9 item 4: robust depth stage.
 *
 * Model mode: if torch is unavailable on the default Python, find Python 3.11/3.12
 * via `py -3.12` / `py -3.11`, create .venv-depth, install deps with `python -m pip`,
 * and run depth.py with that interpreter. Gradient mode is ONLY when explicitly
 * requested (--depth gradient). Prints exact manual steps when impossible.
 * @module scripts/lib/film-depth
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Run a command, return {ok, out, status}. Never throws. */
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: false, maxBuffer: 16 * 1024 * 1024, ...opts });
  return { ok: r.status === 0, status: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

/** Interpreter descriptor {cmd, prefix, version}. Prefers py -3.12/-3.11. */
export function findPythonInterpreter() {
  for (const ver of ['3.12', '3.11']) {
    const r = run('py', [`-${ver}`, '--version']);
    if (r.ok) return { cmd: 'py', prefix: [`-${ver}`], version: r.out, label: `py -${ver}` };
  }
  const r = run('python', ['--version']);
  if (r.ok) return { cmd: 'python', prefix: [], version: r.out, label: 'python' };
  return null;
}

/** Does an interpreter have torch importable? Pure wrapper around a subprocess. */
export function hasTorch(interp) {
  if (!interp) return false;
  const r = run(interp.cmd, [...interp.prefix, '-c', 'import torch; print(torch.__version__)']);
  return r.ok;
}

/** Resolve the venv python path for this platform. */
export function venvPython(root, venvName = '.venv-depth') {
  const bin = process.platform === 'win32' ? 'Scripts' : 'bin';
  return path.join(root, venvName, bin, process.platform === 'win32' ? 'python.exe' : 'python');
}

/**
 * Choose an interpreter capable of running the depth model.
 * Returns { interp, createdVenv, manualSteps } or { error, manualSteps }.
 */
export function prepareModelInterpreter(root, { install = true } = {}) {
  const preferred = findPythonInterpreter();
  if (!preferred) {
    return {
      error: 'No Python interpreter found',
      manualSteps: [
        '1. Install Python 3.12 from https://python.org (with the "py" launcher on Windows).',
        '2. Verify: py -3.12 --version',
        `3. py -3.12 -m venv ${path.join(root, '.venv-depth')}`,
        `4. ${path.join(root, '.venv-depth', 'Scripts', 'python.exe')} -m pip install torch transformers Pillow numpy`,
        '5. Re-run: node scripts/film.mjs depth',
        'Alternatively use the explicit labeled fallback: node scripts/film.mjs depth --depth gradient',
      ],
    };
  }
  if (hasTorch(preferred)) return { interp: preferred, createdVenv: false };
  // Default Python lacks torch — try building a venv with a preferred interpreter.
  if (!install) {
    return {
      error: `torch not available on ${preferred.label}`,
      manualSteps: [
        `1. ${preferred.label} -m pip install torch transformers Pillow numpy`,
        '2. Re-run: node scripts/film.mjs depth',
        'Or: node scripts/film.mjs depth --depth gradient (labeled fallback, no model).',
      ],
    };
  }
  // Only 3.11/3.12 are likely to have torch wheels; re-find a preferred one.
  let venvBase = null;
  for (const ver of ['3.12', '3.11']) {
    const r = run('py', [`-${ver}`, '--version']);
    if (r.ok) { venvBase = { cmd: 'py', prefix: [`-${ver}`], label: `py -${ver}` }; break; }
  }
  if (!venvBase) {
    return {
      error: `torch not available and no Python 3.11/3.12 found (default: ${preferred.version})`,
      manualSteps: [
        '1. Install Python 3.12 from https://python.org (with the "py" launcher).',
        `2. py -3.12 -m venv ${path.join(root, '.venv-depth')}`,
        `3. ${path.join(root, '.venv-depth', 'Scripts', 'python.exe')} -m pip install torch transformers Pillow numpy`,
        '4. Re-run: node scripts/film.mjs depth',
        'Or: node scripts/film.mjs depth --depth gradient (labeled fallback).',
      ],
    };
  }
  const venvDir = path.join(root, '.venv-depth');
  const venvPy = venvPython(root);
  if (!fs.existsSync(venvPy)) {
    const mk = run(venvBase.cmd, [...venvBase.prefix, '-m', 'venv', venvDir]);
    if (!mk.ok) return { error: `venv creation failed: ${mk.out.slice(0, 200)}`, manualSteps: [`${venvBase.label} -m venv ${venvDir}`] };
  }
  const ins = run(venvPy, ['-m', 'pip', 'install', 'torch', 'transformers', 'Pillow', 'numpy']);
  if (!ins.ok) {
    return {
      error: `pip install failed: ${ins.out.slice(-200)}`,
      manualSteps: [`${venvPy} -m pip install torch transformers Pillow numpy`, 'Then: node scripts/film.mjs depth'],
    };
  }
  return { interp: { cmd: venvPy, prefix: [], version: 'venv', label: venvPy }, createdVenv: true };
}

/** The depth stage runner (called from film.mjs). */
export function runDepth({ cfg, args, graph, root = process.cwd() }) {
  const mode = args.depthMode || cfg.depth.mode;
  if (mode === 'gradient') {
    graph.log('depth: --depth gradient (explicit labeled fallback, no model)');
    return spawnDepth('python', [], root, cfg, graph, mode, args);
  }
  // Model mode — ensure a torch-capable interpreter.
  const prep = prepareModelInterpreter(root);
  if (prep.error) {
    graph.log(`depth: MODEL unavailable — ${prep.error}`);
    for (const s of prep.manualSteps || []) graph.log(`  FIX: ${s}`);
    throw new Error(`Depth model unavailable: ${prep.error}. Exact manual steps printed above. Gradient fallback requires: node scripts/film.mjs depth --depth gradient`);
  }
  if (prep.createdVenv) graph.log(`depth: created .venv-depth with ${prep.interp.label}`);
  return spawnDepth(prep.interp.cmd, prep.interp.prefix, root, cfg, graph, mode, args);
}

function spawnDepth(cmd, prefix, root, cfg, graph, mode, args) {
  const dArgs = [...prefix, 'scripts/depth.py', '--story', cfg.story, '--depth', mode];
  if (args.allowMissing) dArgs.push('--allow-missing');
  if (args.force) dArgs.push('--force');
  graph.log(`depth: $ ${cmd} ${dArgs.join(' ')}`);
  const r = spawnSync(cmd, dArgs, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`depth.py failed (exit ${r.status}). FIX: check the log in build/logs/.`);
  return { mode };
}
