#!/usr/bin/env node
/**
 * @fileoverview Film factory — ONE CLI for the whole pipeline.
 *
 * Stages wrap existing scripts (never rewrite them):
 *   ingest   -> lib/film-ingest.mjs (wraps intake-illustrations.mjs)
 *   depth    -> scripts/depth.py
 *   voice    -> scripts/generate-voice.py
 *   preview  -> build/preview contact sheet + animatic (wraps storyboard helpers)
 *   render   -> scripts/make-illustrated.mjs + publish-pack.mjs (via make.mjs)
 *   publish  -> scripts/publish-pack.mjs
 *   qa       -> npm run qa
 *
 * Commands: status|ingest|depth|voice|preview|render|publish|qa|all|watch|clean
 * Flags: --story, --only scene=N, --force, --draft, --strict, --verbose.
 * Config: film.config.json validated at start. State/logs: build/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, configHash } from './lib/film-config.mjs';
import { StageGraph, hashInputs } from './lib/film-graph.mjs';
import { computeStatus } from './lib/film-status.mjs';
import { buildIllustratedTimeline } from '../remotion/lib/illustrated-timing.ts';
import { costGuard } from './lib/film-cost.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COMMANDS = ['status', 'ingest', 'depth', 'voice', 'preview', 'render', 'publish', 'qa', 'all', 'watch', 'clean'];

/** Parse CLI args. Throws on unknown command/flag with exact usage. */
export function parseArgs(argv) {
  const a = { command: null, story: null, only: null, force: false, draft: false, strict: false, verbose: false, allowMissing: false };
  const rest = [...argv];
  if (rest.length && !rest[0].startsWith('-')) a.command = rest.shift();
  for (let i = 0; i < rest.length; i += 1) {
    const x = rest[i];
    if (x === '--story' && rest[i + 1]) a.story = rest[++i];
    else if ((x === '--only' || x === '--scene') && rest[i + 1]) {
      const v = rest[++i];
      const m = String(v).match(/(\d+)/);
      if (!m) throw new Error(`--only needs a scene number (got "${v}"). Fix: --only scene=3`);
      a.only = Number(m[1]);
    } else if (x.startsWith('--only=')) a.only = Number(x.split('=')[1].match(/\d+/)?.[1] || 0);
    else if (x === '--force') a.force = true;
    else if (x === '--draft') a.draft = true;
    else if (x === '--strict') a.strict = true;
    else if (x === '--verbose') a.verbose = true;
    else if (x === '--allow-missing') a.allowMissing = true;
    else if (x === '--help' || x === '-h') a.help = true;
    else throw new Error(`Unknown argument: ${x}. Usage: node scripts/film.mjs <${COMMANDS.join('|')}> [--story ...] [--only scene=N] [--force] [--draft] [--strict] [--verbose]`);
  }
  if (!a.command && !a.help) throw new Error(`Command required. Usage: node scripts/film.mjs <${COMMANDS.join('|')}>`);
  if (a.command && !COMMANDS.includes(a.command)) throw new Error(`Unknown command "${a.command}". Valid: ${COMMANDS.join(', ')}`);
  return a;
}

/** Run a wrapped command with real output. On error print cause+file+fix, no stack unless verbose. */
export function runCmd(cmd, args, { verbose = false, fix = '', label = '' } = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024, stdio: 'inherit',
  });
  if (r.status !== 0) {
    const msg = `${label || cmd} failed (exit ${r.status})${fix ? `\nFIX: ${fix}` : ''}`;
    if (verbose && r.stderr) console.error(r.stderr);
    throw new Error(msg);
  }
  return r;
}

/** Load story + voice + timeline for the configured story. */
export function loadStoryData(cfg, voiceOverride) {
  const storyPath = path.resolve(ROOT, cfg.story);
  if (!fs.existsSync(storyPath)) throw new Error(`Story missing: ${cfg.story}. FIX: check film.config.json story path.`);
  const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
  const storyName = path.basename(cfg.story, '.json');
  const voiceRel = voiceOverride || `public/voice-${storyName}.json`;
  const voicePath = path.resolve(ROOT, voiceRel);
  const voiceData = fs.existsSync(voicePath) ? JSON.parse(fs.readFileSync(voicePath, 'utf8')) : null;
  const timeline = voiceData ? buildIllustratedTimeline(voiceData, cfg.fps) : null;
  return { story, voiceData, timeline, storyName, voiceRel };
}

/** Print the status dashboard; return exit code. */
export async function cmdStatus({ cfg, args, graph }) {
  const { story, voiceData, timeline } = loadStoryData(cfg);
  const report = computeStatus({
    root: ROOT, cfg, story, voiceData, timeline,
    configHashValue: configHash(cfg),
  });
  console.log('');
  console.log('scene        image  depth  reviewed  voice  dur(s)  media         cache     warnings');
  console.log('-'.repeat(96));
  for (const r of report.scenes) {
    console.log(
      `${String(r.scene).padEnd(12)} ${String(r.image).padEnd(6)} ${String(r.depth).padEnd(6)} ` +
      `${String(r.reviewed).padEnd(9)} ${String(r.voice).padEnd(6)} ${String(r.duration ?? '-').padEnd(7)} ` +
      `${String(r.mediaType).padEnd(13)} ${String(r.cache).padEnd(9)} ${r.warnings.join('; ')}`
    );
  }
  console.log('-'.repeat(96));
  console.log(`\nVERDICT: ${report.verdict}`);
  if (report.reasons.length) {
    console.log('REASONS:');
    for (const r of report.reasons) console.log(`  - ${r}`);
  }
  if (report.wrongFolder.length) {
    console.log('\nWRONG-FOLDER IMAGES (outputs mistaken for inputs). Fix commands:');
    for (const f of report.wrongFolderFixes) console.log(`  ${f}`);
  }
  if (report.sheetStale === true) console.log('\nNOTE: preview sheet is STALE — run: node scripts/film.mjs preview');
  // Cost guard.
  if (timeline) {
    const cg = costGuard({ story, timeline, fps: cfg.fps, cfg });
    console.log(`\nCOST: est ${cg.estimateSeconds}s render; world3d ${(cg.world3dFraction * 100).toFixed(0)}% of duration${cg.warn ? ` — WARN: ${cg.reasons.join('; ')}` : ''}.`);
  }
  graph.log(`status: ${report.verdict}`);
  return args.strict && !report.releasable ? 1 : 0;
}

/** Main dispatch. */
export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Film factory commands: ${COMMANDS.join(', ')}`);
    console.log('Flags: --story <path> --only scene=N --force --draft --strict --verbose');
    return 0;
  }
  const cfg = loadConfig(ROOT);
  if (args.story) cfg.story = args.story;
  const ch = configHash(cfg);
  const graph = new StageGraph({ root: ROOT, cfg, configHashValue: ch, logPrefix: args.command });
  graph.log(`film ${args.command} config=${ch} story=${cfg.story}`);
  try {
    const { ingest } = await import('./lib/film-ingest.mjs');
    const { preview } = await import('./lib/film-preview-stage.mjs');
    const data = loadStoryData(cfg);
    let code = 0;

    switch (args.command) {
      case 'status':
        code = await cmdStatus({ cfg, args, graph });
        break;
      case 'ingest':
        await ingest({ cfg, args, graph, data, force: args.force, only: args.only, verbose: args.verbose });
        code = 0;
        break;
      case 'depth':
        runCmd('python', ['scripts/depth.py', '--story', cfg.story, '--depth', cfg.depth.mode, ...(args.allowMissing ? ['--allow-missing'] : [])],
          { verbose: args.verbose, label: 'depth', fix: `python -m pip install torch transformers Pillow numpy (or use --depth gradient in film.config.json)` });
        break;
      case 'voice':
        runCmd('python', ['scripts/generate-voice.py', '--story', cfg.story, '--lang', 'km',
          '--voice', cfg.tts.voice, '--tts', cfg.tts.provider, '--rate', String(cfg.tts.rate),
          '--out', `public/voice/${data.storyName}`, '--json', `public/voice-${data.storyName}.json`,
          ...(args.draft ? ['--mock'] : [])],
          { verbose: args.verbose, label: 'voice', fix: 'Check network/edge-tts; run node scripts/doctor.mjs' });
        break;
      case 'preview':
        await preview({ cfg, args, graph, data, force: args.force, only: args.only });
        code = 0;
        break;
      case 'render':
        runCmd('node', ['scripts/make.mjs', '--story', cfg.story, '--style', 'illustrated',
          '--min-duration', '120', ...(args.draft ? ['--draft'] : []), ...(args.force ? ['--force'] : [])],
          { verbose: args.verbose, label: 'render', fix: 'Run film status; fix all reasons; ensure assets are in assets-src/illustrations' });
        break;
      case 'publish':
        runCmd('node', ['scripts/publish-pack.mjs', '--story', cfg.story],
          { verbose: args.verbose, label: 'publish', fix: 'Run film render first to produce out/<story>.mp4' });
        break;
      case 'qa':
        runCmd('npm', ['run', 'qa'], { verbose: args.verbose, label: 'qa', fix: 'Fix the failing gate reported above' });
        break;
      case 'all':
        for (const c of ['ingest', 'depth', 'voice', 'preview', 'render', 'publish', 'qa']) {
          graph.log(`all -> ${c}`);
          await main([c, '--story', cfg.story, ...(args.draft ? ['--draft'] : []), ...(args.force ? ['--force'] : [])]);
        }
        break;
      case 'watch': {
        const { watch } = await import('./lib/film-watch-loop.mjs');
        code = await watch({ cfg, args, graph, ROOT });
        break;
      }
      case 'clean': {
        for (const d of [cfg.paths.build]) {
          const p = path.resolve(ROOT, d);
          if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); console.log(`[clean] removed ${d}/`); }
        }
        graph.log('clean done');
        break;
      }
    }
    return code;
  } finally {
    graph.close();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().then((c) => { process.exitCode = c || 0; }).catch((e) => {
    console.error(`\nERROR: ${e.message}`);
    if (process.argv.includes('--verbose')) console.error(e.stack);
    process.exit(1);
  });
}
