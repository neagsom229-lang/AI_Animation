#!/usr/bin/env node
/**
 * @fileoverview Round 14b item 2/3: honest, explicit cleanup.
 *
 * `film clean --plan` is the DEFAULT (also `--dry-run`). It prints every ghost,
 * its tier, exact bytes, git-tracked state and the planned action.
 * `film clean --apply` requires the operator to type DELETE once; nothing is
 * removed without that word. Tier B (superseded originals) is NEVER actionable
 * while duplicates remain or manifest sha256 values do not match the inbox.
 *
 * Safety:
 *  - protected paths are never candidates;
 *  - every path is resolved and checked to stay under the repo root;
 *  - symlinks/junctions that resolve outside the repo are refused;
 *  - the 3 newest drafts and the pinned comparison draft are always kept.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/film-config.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const PINNED_DRAFT = '2026-11-18T02-04-01-751Z';
export const KEEP_NEWEST_DRAFTS = 3;
export const ARCHIVE_DATE = '2026-11-18';

/** Parse clean CLI arguments. Default mode is plan (dry run). */
export function parseArgs(argv) {
  const a = { mode: 'plan', confirm: null, restore: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--plan' || argv[i] === '--dry-run') a.mode = 'plan';
    else if (argv[i] === '--apply') a.mode = 'apply';
    else if (argv[i] === '--confirm' && argv[i + 1]) a.confirm = argv[++i];
    else if (argv[i] === '--restore' && argv[i + 1]) a.restore = argv[++i];
    else throw new Error(`Unknown: ${argv[i]}. Usage: node scripts/film-clean.mjs [--plan | --apply [--confirm DELETE] | --restore <path>]`);
  }
  return a;
}

/** True when `p` resolves strictly inside `root`. */
export function isInside(root, p) {
  const rel = path.relative(path.resolve(root), path.resolve(p));
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Refuse symlink/junction paths that escape the repo; return the real path. */
export function assertSafe(root, p) {
  const abs = path.resolve(root, p);
  if (!isInside(root, abs)) throw new Error(`Refusing path outside repo root: ${p}`);
  // Check every existing component for a symlink to somewhere else.
  let cur = abs;
  const stop = path.resolve(root);
  while (cur !== stop && cur !== path.dirname(cur)) {
    try {
      const st = fs.lstatSync(cur);
      if (st.isSymbolicLink()) {
        const real = fs.realpathSync(cur);
        if (!isInside(root, real)) throw new Error(`Refusing symlink escaping repo: ${p} -> ${real}`);
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    cur = path.dirname(cur);
  }
  try {
    const real = fs.realpathSync(abs);
    if (!isInside(root, real)) throw new Error(`Refusing path resolving outside repo: ${p} -> ${real}`);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return abs;
}

function walkFiles(target) {
  const out = [];
  const visit = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) visit(p);
      else out.push(p);
    }
  };
  if (fs.existsSync(target)) {
    const st = fs.statSync(target);
    if (st.isDirectory()) visit(target); else out.push(target);
  }
  return out;
}

/** Bytes and newest mtime for a file or directory (missing -> 0). */
export function statsFor(root, rel) {
  const p = path.resolve(root, rel);
  const files = walkFiles(p);
  const bytes = files.reduce((s, f) => {
    try { return s + fs.statSync(f).size; } catch { return s; }
  }, 0);
  const modified = files.reduce((best, f) => {
    try { return Math.max(best, fs.statSync(f).mtimeMs); } catch { return best; }
  }, 0);
  return { bytes, modified };
}

/** Draft directories to keep: newest 3 plus the pinned comparison draft. */
export function draftKeepSet(root) {
  const base = path.resolve(root, 'out/drafts');
  if (!fs.existsSync(base)) return new Set();
  const dirs = fs.readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, mtime: fs.statSync(path.join(base, e.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const keep = new Set(dirs.slice(0, KEEP_NEWEST_DRAFTS).map((d) => `out/drafts/${d.name}`));
  keep.add(`out/drafts/${PINNED_DRAFT}`);
  return keep;
}

/** Ghosts: scene-image / depth / voice / scene-cache holders outside LIVE. */
export function detectGhosts({ root = ROOT, cfg, manifest, tracked = defaultTracked, now = new Date() } = {}) {
  const ghosts = [];
  const add = (rel, tier, reason, action = 'delete') => {
    if (!rel || ghosts.some((g) => g.path === rel)) return;
    const s = statsFor(root, rel);
    if (s.bytes === 0 && !fs.existsSync(path.resolve(root, rel))) return;
    ghosts.push({
      path: rel.replace(/\\/g, '/'), ...s, tier, reason, action,
      tracked: Boolean(tracked(rel)),
      modified: s.modified ? new Date(s.modified).toISOString().slice(0, 10) : '-',
    });
  };

  // Tier A — regenerable caches and derived copies.
  for (const rel of [
    'build', 'out/.scene-cache', 'out/.illustrated-scene-cache',
    'out/khmer-empire-storyboard', 'out/khmer-temple-storyboard',
  ]) add(rel, 'A', 'regenerable cache / derived output');

  const keep = draftKeepSet(root);
  const draftsBase = path.resolve(root, 'out/drafts');
  if (fs.existsSync(draftsBase)) {
    for (const e of fs.readdirSync(draftsBase, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const rel = `out/drafts/${e.name}`;
      if (!keep.has(rel)) add(rel, 'A', 'draft beyond newest 3 (pinned draft always kept)');
    }
  }

  add('public/voice', 'A', 'generated voice data; regenerate with film voice (network)');
  const publicDir = path.resolve(root, 'public');
  const voiceRoot = fs.existsSync(publicDir) ? fs.readdirSync(publicDir, { withFileTypes: true }) : [];
  for (const e of voiceRoot) {
    if (e.isFile() && /^voice-.*\.json$/.test(e.name) && !tracked(`public/${e.name}`)) {
      add(`public/${e.name}`, 'A', 'generated voice manifest; regenerate with film voice');
    }
  }

  // Stale staged illustration copies: not in the manifest and not git-tracked.
  const liveNames = new Set((manifest?.scenes || []).flatMap((e) => {
    const base = path.basename(e.file || '');
    const ext = path.extname(base);
    return [base, `${base.slice(0, -ext.length)}-depth${ext}`];
  }));
  const staged = path.resolve(root, 'public/illustrated/illustrations');
  if (fs.existsSync(staged)) {
    for (const e of fs.readdirSync(staged, { withFileTypes: true })) {
      if (!e.isFile() || liveNames.has(e.name)) continue;
      const rel = `public/illustrated/illustrations/${e.name}`;
      if (tracked(rel)) continue; // tracked fixture — never touch
      add(rel, 'A', 'staged copy not in manifest and not git-tracked');
    }
  }

  // Tier B — superseded originals. Reported but NEVER actionable here.
  add('assets-src/backup', 'B', 'superseded originals; blocked until 0 duplicates + sha256 match');
  add('assets-src/inbox/_originals', 'B', 'superseded originals; blocked until 0 duplicates + sha256 match');

  // Tier C — old projects: delete regenerable heavy parts, archive small remnants.
  for (const proj of ['angkor-built', 'demo-angkor', 'demo-film']) {
    for (const heavy of ['node_modules', '.venv', 'out', 'build']) {
      add(`${proj}/${heavy}`, 'C', 'old project regenerable heavy part', 'delete');
    }
    // Remaining small source files would be archived here (none in the current tree).
    const base = path.resolve(root, proj);
    if (fs.existsSync(base)) {
      for (const e of fs.readdirSync(base, { withFileTypes: true })) {
        if (['node_modules', '.venv', 'out', 'build'].includes(e.name)) continue;
        const rel = `${proj}/${e.name}`;
        add(rel, 'C', 'old project small source file (preserved)', 'archive');
      }
    }
  }
  add('out/e9', 'C', 'old debug frames, no generator', 'archive');
  add('out/voice-test', 'C', 'old voice test output, no generator', 'archive');

  void now;
  void cfg;
  return ghosts;
}

/** Default git-tracked query for the real repo. */
export function defaultTracked(rel) {
  try {
    const r = spawnSync('git', ['ls-files', '--', rel], { cwd: ROOT, encoding: 'utf8' });
    return Boolean(r.stdout && r.stdout.trim());
  } catch { return false; }
}

/** Human plan table plus exact byte totals. */
export function planText(ghosts) {
  const lines = [
    'film clean — PLAN (nothing deleted; --plan is the default)',
    '',
    'path                                            MB   tier  tracked  modified   action  reason',
    '-'.repeat(116),
  ];
  for (const g of ghosts) {
    lines.push(
      `${g.path.padEnd(46)} ${(g.bytes / 1e6).toFixed(2).padStart(8)}  ${g.tier}     ${String(g.tracked).padEnd(7)} ${g.modified.padEnd(11)} ${g.action.padEnd(8)} ${g.reason}`
    );
  }
  lines.push('-'.repeat(116));
  const totals = {};
  for (const g of ghosts) totals[g.tier] = (totals[g.tier] || 0) + g.bytes;
  for (const tier of ['A', 'B', 'C']) {
    lines.push(`TIER ${tier} total: ${(totals[tier] || 0).toLocaleString()} bytes (${((totals[tier] || 0) / 1e6).toFixed(2)} MB) — ${ghosts.filter((g) => g.tier === tier).length} path(s)${tier === 'B' ? ' [BLOCKED: not actionable]' : ''}`);
  }
  const actionable = ghosts.filter((g) => g.tier !== 'B');
  lines.push(`ACTIONABLE TOTAL: ${actionable.reduce((s, g) => s + g.bytes, 0).toLocaleString()} bytes (${(actionable.reduce((s, g) => s + g.bytes, 0) / 1e6).toFixed(2)} MB)`);
  lines.push('Tier B is NOT included: duplicates remain / sha256 match not proven.');
  lines.push('Apply with: node scripts/film.mjs clean --apply   (then type DELETE)');
  return lines.join('\n');
}

function availableBytes(root) {
  try { const s = fs.statfsSync(root); return s.bavail * s.bsize; } catch { return NaN; }
}

function archivePath(root, rel) {
  return path.resolve(root, '_archive', ARCHIVE_DATE, rel);
}

/** Execute the plan. Requires the literal word DELETE. */
export function applyPlan({ root = ROOT, ghosts, confirmation }) {
  if (confirmation !== 'DELETE') throw new Error('clean --apply requires typing the word DELETE exactly once');
  const before = availableBytes(root);
  const deleted = [];
  const moved = [];
  for (const g of ghosts) {
    if (g.tier === 'B') continue; // hard rule: never actionable in this pass
    const abs = assertSafe(root, g.path);
    if (!fs.existsSync(abs)) continue;
    if (g.action === 'archive') {
      const dest = archivePath(root, g.path);
      assertSafe(root, dest);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(abs, dest);
      moved.push({ ...g, to: path.relative(root, dest).replace(/\\/g, '/') });
    } else {
      fs.rmSync(abs, { recursive: true, force: true });
      deleted.push(g);
    }
  }
  // MOVED.md for archived remnants (always written, even if the list is empty).
  const archiveDir = path.resolve(root, '_archive', ARCHIVE_DATE);
  fs.mkdirSync(archiveDir, { recursive: true });
  const movedLines = moved.length
    ? moved.map((m) => `| ${m.path} | ${m.bytes} | ${m.reason} | ${m.to} |`).join('\n')
    : '| (none) | 0 | no small source remnants | - |';
  fs.writeFileSync(path.join(archiveDir, 'MOVED.md'),
    `# Moved ${ARCHIVE_DATE}\n\n| original path | bytes | reason | archive path |\n|---|---:|---|---|\n${movedLines}\n`, 'utf8');

  const logDir = path.resolve(root, 'out/review');
  fs.mkdirSync(logDir, { recursive: true });
  const logLines = [
    `# Clean log — ${new Date().toISOString()}`,
    '',
    `Disk before: ${Number.isFinite(before) ? (before / 1e6).toFixed(1) + ' MB free' : 'unknown'}`,
    '',
    '| action | path | bytes | tier | reason |',
    '|---|---|---:|---|---|',
    ...deleted.map((g) => `| DELETED | ${g.path} | ${g.bytes} | ${g.tier} | ${g.reason} |`),
    ...moved.map((g) => `| MOVED | ${g.path} | ${g.bytes} | ${g.tier} | ${g.reason} -> ${g.to} |`),
    '',
    `Disk after: ${Number.isFinite(availableBytes(root)) ? (availableBytes(root) / 1e6).toFixed(1) + ' MB free' : 'unknown'}`,
    'Tier B was never actioned.',
  ];
  fs.appendFileSync(path.join(logDir, 'clean-log.md'), `${logLines.join('\n')}\n\n`, 'utf8');
  return { deleted, moved, before, after: availableBytes(root) };
}

async function promptDelete() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question('Type DELETE to apply this plan (anything else cancels): ', (a) => {
    rl.close(); resolve(a.trim());
  }));
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cfg = loadConfig(ROOT);
  const manifestPath = path.resolve(ROOT, cfg.paths.illustrations, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { scenes: [] };
  const ghosts = detectGhosts({ root: ROOT, cfg, manifest });

  if (args.restore) {
    const src = assertSafe(ROOT, args.restore);
    if (!src.startsWith(path.resolve(ROOT, '_archive'))) throw new Error('--restore only accepts paths under _archive/');
    const rel = path.relative(path.resolve(ROOT, '_archive', ARCHIVE_DATE), src);
    const dest = assertSafe(ROOT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
    console.log(`restored ${rel}`);
    return 0;
  }

  console.log(planText(ghosts));
  if (args.mode === 'plan') return 0;
  const confirm = args.confirm || await promptDelete();
  const result = applyPlan({ root: ROOT, ghosts, confirmation: confirm });
  console.log(`DELETED ${result.deleted.length} path(s), MOVED ${result.moved.length} path(s), archived remnant in _archive/${ARCHIVE_DATE}/MOVED.md`);
  console.log(`disk before ${(result.before / 1e6).toFixed(1)} MB free -> after ${(result.after / 1e6).toFixed(1)} MB free`);
  console.log('log: out/review/clean-log.md (Tier B was never actioned)');
  return 0;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('film clean failed:', e.message); process.exit(1); });
}
