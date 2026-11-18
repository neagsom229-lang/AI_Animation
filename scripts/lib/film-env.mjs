/**
 * @fileoverview Round 13 item 1: ONE Python environment for the film pipeline.
 *
 * The pipeline uses exactly one venv: `.venv-depth` (Python 3.11/3.12) with
 * torch, transformers, Pillow, numpy and edge-tts. `film setup` creates it and
 * verifies every import; `film doctor` reports it as the FIRST gate.
 *
 * The legacy `.venv` is never used by scripts. It is kept on disk (nothing is
 * deleted) but reported as deprecated so it cannot silently become the env.
 * @module scripts/lib/film-env
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** The one venv directory, relative to the repo root. */
export const VENV_NAME = '.venv-depth';

/** Every dependency required in the one env (pip name + import name). */
export const ENV_DEPS = [
  { pip: 'torch', importName: 'torch' },
  { pip: 'transformers', importName: 'transformers' },
  { pip: 'pillow', importName: 'PIL' },
  { pip: 'numpy', importName: 'numpy' },
  { pip: 'edge-tts', importName: 'edge_tts' },
];

/** Exact pip install command (used in every failure message). */
export const PIP_INSTALL = `pip install ${ENV_DEPS.map((d) => d.pip).join(' ')}`;

/** Python version accepted for the one env. Pure. */
export function pythonVersionOk(version) {
  const m = String(version || '').match(/(\d+)\.(\d+)/);
  if (!m) return false;
  return Number(m[1]) === 3 && (Number(m[2]) === 11 || Number(m[2]) === 12);
}

/** Resolve the venv interpreter path for this platform. */
export function venvPython(root) {
  const bin = process.platform === 'win32' ? 'Scripts' : 'bin';
  return path.join(root, VENV_NAME, bin, process.platform === 'win32' ? 'python.exe' : 'python');
}

/** Spawn helper: never throws. */
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8', shell: false, maxBuffer: 16 * 1024 * 1024, ...opts,
  });
  return { ok: r.status === 0, status: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

/** Find a base interpreter that can create a 3.11/3.12 venv. */
export function findBasePython() {
  const candidates = [
    { cmd: 'py', prefix: ['-3.12'], label: 'py -3.12' },
    { cmd: 'py', prefix: ['-3.11'], label: 'py -3.11' },
  ];
  for (const c of candidates) {
    const r = run(c.cmd, [...c.prefix, '--version']);
    if (r.ok) return { ...c, version: r.out };
  }
  const r = run('python', ['--version']);
  if (r.ok) {
    const ok = pythonVersionOk(r.out);
    return { cmd: 'python', prefix: [], label: 'python', version: r.out, versionOk: ok };
  }
  return null;
}

/** Has a legacy `.venv` (kept working, but deprecated). */
export function legacyVenvPresent(root) {
  return fs.existsSync(path.join(root, '.venv'));
}

/** One Python invocation that imports each dependency and reports success per package. */
export function importProbeScript() {
  const mods = JSON.stringify(ENV_DEPS.map((d) => d.importName));
  return [
    'import importlib, json, sys',
    `mods=${mods}`,
    'out={}',
    'for m in mods:',
    '    try:',
    '        mod=importlib.import_module(m)',
    '        out[m]=str(getattr(mod,"__version__","ok"))',
    '    except Exception as e:',
    '        out[m]="ERR:"+str(e).splitlines()[0][:120]',
    'print(json.dumps(out))',
  ].join('\n');
}

/** Parse the JSON printed by importProbeScript. Pure. */
export function parseImportProbe(out) {
  const text = String(out || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return {};
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return {}; }
}

/** Exact install command for this repo. */
export function installCommand(root) {
  const py = venvPython(root);
  return `${py} -m ${PIP_INSTALL}`;
}

/** Human label for an import failure. */
export function importFailures(probe) {
  return ENV_DEPS.filter((d) => !probe[d.importName] || String(probe[d.importName]).startsWith('ERR:'));
}

let cached = null;

/**
 * Probe the single environment. Returns per-check results, an exact fix and a
 * one-line summary. Cached per process (doctor runs twice in tests).
 *
 * @param {string} root repo root
 * @param {{refresh?: boolean}} [opts]
 */
export function probeEnvironment(root, opts = {}) {
  if (cached && !opts.refresh) return cached;
  const py = venvPython(root);
  const warnings = [];
  if (legacyVenvPresent(root)) {
    warnings.push('legacy .venv found — deprecated and ignored; the film pipeline now uses .venv-depth (kept on disk, nothing deleted)');
  }

  const nodeOk = Number(process.versions.node.split('.')[0]) >= 18;
  const node = { ok: nodeOk, detail: process.version };

  let python = { ok: false, exists: fs.existsSync(py), path: py, version: '', versionOk: false, detail: 'missing' };
  let imports = {};
  if (python.exists) {
    const v = run(py, ['--version']);
    python = {
      ok: v.ok && pythonVersionOk(v.out), exists: true, path: py,
      version: v.out, versionOk: pythonVersionOk(v.out),
      detail: v.ok ? v.out : `could not run (${v.out || 'no output'})`,
    };
    const pr = run(py, ['-c', importProbeScript()]);
    imports = parseImportProbe(pr.out);
  }

  const ff = run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['remotion', 'ffmpeg', '-version'], {
    shell: process.platform === 'win32', cwd: root,
  });
  const ffmpeg = {
    ok: ff.ok && /ffmpeg version/i.test(ff.out),
    detail: (ff.out.splitlines ? ff.out.splitlines()[0] : String(ff.out).split('\n')[0]) || 'not found',
  };

  const depChecks = {};
  for (const d of ENV_DEPS) {
    const value = imports[d.importName];
    depChecks[d.pip] = {
      ok: Boolean(value) && !String(value).startsWith('ERR:'),
      importName: d.importName,
      detail: value ? String(value) : 'not importable',
    };
  }

  const fixes = [];
  if (!nodeOk) fixes.push('Install Node.js 18+ from https://nodejs.org (winget install OpenJS.NodeJS.LTS)');
  if (!python.exists) {
    const base = findBasePython();
    const create = base ? `${base.label} -m venv ${VENV_NAME}` : `py -3.12 -m venv ${VENV_NAME}`;
    fixes.push(`Create the one env: ${create}`);
  } else if (!python.versionOk) {
    fixes.push(`Recreate ${VENV_NAME} with Python 3.11/3.12: py -3.12 -m venv ${VENV_NAME}`);
  }
  const failed = importFailures(imports);
  if (failed.length > 0 || !python.exists) {
    fixes.push(`Install/verify deps: ${installCommand(root)}`);
  }
  if (!ffmpeg.ok) fixes.push('Restore bundled ffmpeg: npm install');

  const ok = nodeOk && python.ok && failed.length === 0 && ffmpeg.ok;
  const summary = ok
    ? `${python.version || 'Python 3.11/3.12'}; all ${ENV_DEPS.length} imports ok; ffmpeg + node ${process.version}`
    : `environment incomplete: ${[
      !nodeOk ? 'node' : null,
      !python.ok ? 'python' : null,
      ...failed.map((d) => d.pip),
      !ffmpeg.ok ? 'ffmpeg' : null,
    ].filter(Boolean).join(', ')}`;

  cached = {
    ok, summary, fixes, fix: fixes.join('\n'),
    node, python, imports, deps: depChecks, ffmpeg, warnings,
  };
  return cached;
}

/** Reset the in-process memo (tests / after setup installs). */
export function resetEnvCache() { cached = null; }

/**
 * Python command for voice generation. Prefers the single venv; falls back to
 * the legacy `python` with an explicit deprecation warning (kept working).
 * @returns {{cmd: string, prefix: string[], warning: string}}
 */
export function voicePython(root) {
  const py = venvPython(root);
  if (fs.existsSync(py)) {
    const r = run(py, ['-c', 'import edge_tts']);
    if (r.ok) return { cmd: py, prefix: [], warning: '' };
    return { cmd: py, prefix: [], warning: `edge-tts missing in ${VENV_NAME}; run: ${installCommand(root)}` };
  }
  return {
    cmd: 'python', prefix: [],
    warning: `legacy 'python' used (${VENV_NAME} not found) — deprecated; run: node scripts/film.mjs setup`,
  };
}
