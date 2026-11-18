/** Round 13 item 1: ONE Python env (.venv-depth) + environment doctor gate. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  VENV_NAME, ENV_DEPS, pythonVersionOk, venvPython, importProbeScript, parseImportProbe,
  probeEnvironment, voicePython, installCommand,
} from '../scripts/lib/film-env.mjs';

test('one env: .venv-depth with all five dependencies', () => {
  assert.equal(VENV_NAME, '.venv-depth');
  assert.deepEqual(ENV_DEPS.map((d) => d.pip), ['torch', 'transformers', 'pillow', 'numpy', 'edge-tts']);
  assert.deepEqual(ENV_DEPS.map((d) => d.importName), ['torch', 'transformers', 'PIL', 'numpy', 'edge_tts']);
});

test('python version gate accepts 3.11/3.12 only', () => {
  assert.equal(pythonVersionOk('Python 3.12.10'), true);
  assert.equal(pythonVersionOk('Python 3.11.9'), true);
  assert.equal(pythonVersionOk('Python 3.14.7'), false);
  assert.equal(pythonVersionOk('Python 3.13.0'), false);
  assert.equal(pythonVersionOk('garbage'), false);
});

test('venvPython resolves Scripts/python.exe on Windows', () => {
  const p = venvPython('D:/repo');
  assert.ok(p.includes(VENV_NAME));
  assert.ok(process.platform === 'win32' ? p.includes('Scripts') : p.includes('bin'));
});

test('import probe script imports each dependency (no install assumption)', () => {
  const s = importProbeScript();
  for (const d of ENV_DEPS) assert.ok(s.includes(`"${d.importName}"`), `probe must import ${d.importName}`);
  assert.ok(s.includes('importlib.import_module'));
  const parsed = parseImportProbe('npm notice\n{"torch":"2.15.0","edge_tts":"ok"}\n');
  assert.equal(parsed.torch, '2.15.0');
  assert.deepEqual(parseImportProbe('no json'), {});
});

test('install command names the venv python and every pip package', () => {
  const cmd = installCommand('D:/repo');
  assert.ok(cmd.includes('.venv-depth'));
  for (const d of ENV_DEPS) assert.ok(cmd.includes(d.pip), `install command must name ${d.pip}`);
});

test('real environment probe reports per-package imports (honest)', () => {
  const env = probeEnvironment('.', { refresh: true });
  assert.equal(typeof env.ok, 'boolean');
  assert.ok(env.node && env.python && env.ffmpeg);
  for (const d of ENV_DEPS) assert.ok(env.deps[d.pip], `probe must report ${d.pip}`);
  if (fs.existsSync(venvPython('.'))) {
    assert.ok(env.python.exists);
    assert.ok(env.python.versionOk, `venv python must be 3.11/3.12: ${env.python.version}`);
  }
  // Never claim ok without every check passing.
  const allImports = ENV_DEPS.every((d) => env.deps[d.pip].ok);
  assert.equal(env.ok, env.node.ok && env.python.ok && allImports && env.ffmpeg.ok);
});

test('legacy .venv is warned about, never silently used', () => {
  const env = probeEnvironment('.');
  if (fs.existsSync(path.join('.', '.venv'))) {
    assert.ok(env.warnings.some((w) => w.includes('legacy .venv')), 'legacy .venv must warn');
  }
  const vp = voicePython('.');
  assert.ok(vp.cmd);
  if (!fs.existsSync(venvPython('.'))) assert.ok(vp.warning.includes('.venv-depth'));
});

test('film setup exists and installs edge-tts + verifies imports', () => {
  const src = fs.readFileSync('scripts/setup.mjs', 'utf8');
  assert.ok(src.includes("'edge-tts'"), 'setup must install edge-tts');
  assert.ok(src.includes('importProbeScript'), 'setup must verify imports');
  assert.ok(src.includes('legacy .venv'), 'setup must warn about the legacy .venv');
  const film = fs.readFileSync('scripts/film.mjs', 'utf8');
  assert.ok(film.includes("'setup'"), 'film CLI must expose setup');
});
