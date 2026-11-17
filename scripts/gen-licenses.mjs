#!/usr/bin/env node
/**
 * @fileoverview Regenerate THIRD_PARTY_LICENSES.md's dependency table from the
 * ACTUAL installed node_modules package.json license fields + license files.
 * Never asserts terms from memory. Does not overwrite the hand-written prose
 * sections (Remotion summary, Python tools, assets) — it rewrites only the
 * npm-dependency table between the markers.
 *
 * Usage: node scripts/gen-licenses.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'THIRD_PARTY_LICENSES.md');
const BEGIN = '## JavaScript / npm dependencies';
const END = '### Remotion License.md';

function firstLicenseQuote(dir) {
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE']) {
    const f = path.join(dir, name);
    if (fs.existsSync(f)) {
      const first = fs.readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' / ');
      return first.slice(0, 120);
    }
  }
  return '(no license file found)';
}

export function collect() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const names = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})].sort();
  return names.map((name) => {
    let version = '?';
    let license = '(none declared)';
    let quote = '';
    try {
      const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', name, 'package.json'), 'utf8'));
      version = p.version || '?';
      license = p.license || '(none declared)';
      quote = firstLicenseQuote(path.join(ROOT, 'node_modules', name));
    } catch { /* leave defaults */ }
    return { name, version, license, quote };
  });
}

export function renderTable(rows) {
  const lines = [
    BEGIN + ' (from `package.json` + installed `LICENSE` files)',
    '',
    '| Package | Version | `package.json` license field | License file first line(s) |',
    '|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(`| ${r.name} | ${r.version} | \`${r.license}\` | ${r.quote.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

export function regenerate() {
  if (!fs.existsSync(OUT)) throw new Error(`Missing ${OUT}`);
  const text = fs.readFileSync(OUT, 'utf8');
  const i = text.indexOf(BEGIN);
  const j = text.indexOf(END);
  if (i < 0 || j < 0 || j <= i) throw new Error('License file markers not found; will not overwrite prose.');
  const next = text.slice(0, i) + renderTable(collect()) + text.slice(j);
  fs.writeFileSync(OUT, next, 'utf8');
  return collect().length;
}

const isMain = process.argv[1] && import.meta.url === `file:///${path.resolve(process.argv[1]).replace(/\\/g, '/')}`;
if (isMain) {
  const n = regenerate();
  console.log(`[licenses] regenerated npm table from ${n} installed packages -> THIRD_PARTY_LICENSES.md`);
  console.log('[licenses] Remotion / edge-tts prose sections are hand-written from quoted license files and were not touched.');
}
