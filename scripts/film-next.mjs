#!/usr/bin/env node
/**
 * @fileoverview Round 13 item 7: `film next` — exactly ONE next action.
 *
 * It runs every doctor gate (without stopping at the first block), counts the
 * blockers for the CURRENT profile, and translates the first blocking gate into
 * a single concrete command. No JSON reading, no guessing.
 *
 * Usage: node scripts/film-next.mjs [--story <path>] [--profile draft|final]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/film-config.mjs';
import { runGates } from './film-doctor.mjs';
import { currentProfile, PROFILE_FINAL } from './lib/film-profile.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Parse next CLI arguments. */
export function parseArgs(argv) {
  const a = { story: null, profile: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--story' && argv[i + 1]) a.story = argv[++i];
    else if (argv[i] === '--profile' && argv[i + 1]) {
      const v = String(argv[++i]).toLowerCase();
      if (!['draft', 'final'].includes(v)) throw new Error('--profile must be draft or final');
      a.profile = v;
    } else throw new Error(`Unknown: ${argv[i]}. Usage: node scripts/film-next.mjs [--story path] [--profile draft|final]`);
  }
  return a;
}

/** Read the intake manifest (null when absent). */
export function readManifest(root, cfg) {
  const p = path.resolve(root, cfg.paths.illustrations, 'manifest.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * Everything the action chooser needs from the real files.
 * @returns {{lowScenes:number[], unreviewedScenes:number[], missingDepthScenes:number[],
 *            licenseMissing:boolean, promptMissingScenes:number[], sceneCount:number}}
 */
export function collectContext({ root, cfg, story, manifest }) {
  const minWidth = cfg.quality.minSourceWidth;
  const entries = manifest?.scenes || [];
  const lowScenes = entries
    .filter((e) => Number.isFinite(e.sourceWidth) && e.sourceWidth < minWidth)
    .map((e) => Number(e.scene));
  const unreviewedScenes = entries
    .filter((e) => e.reviewed !== true || e.matchesNarration !== true || e.watermarkCheck !== true)
    .map((e) => Number(e.scene));
  const licenseMissing = !cfg.intake?.licenseTermsUrl
    || entries.some((e) => !e.licenseTermsUrl || !String(e.licenseTermsUrl).trim());
  const promptMissingScenes = entries
    .filter((e) => !e.prompt || !String(e.prompt).trim())
    .map((e) => Number(e.scene));
  const missingDepthScenes = (story.scenes || [])
    .map((s, i) => ({ n: Number(String(s.id).match(/\d+/)?.[0] || i + 1), image: s.image }))
    .filter(({ image }) => {
      if (!image) return false;
      const depth = path.resolve(root, image.replace(/\.[^.]+$/, '') + '-depth' + path.extname(image));
      return !fs.existsSync(depth);
    })
    .map(({ n }) => n);
  return {
    lowScenes, unreviewedScenes, missingDepthScenes,
    licenseMissing, promptMissingScenes, sceneCount: story.scenes?.length || entries.length,
  };
}

function first(list, fallback) {
  return list && list.length ? list[0] : fallback;
}

/**
 * Map the first BLOCK gate to ONE action. Pure enough to unit test.
 * @param {Array<{name:string,status:string,detail:string,fix:string}>} gates
 * @param {{profile?:string, context?:object}} [opts]
 */
export function nextActionFor(gates, { profile = 'draft', context = {} } = {}) {
  const blockers = (gates || []).filter((g) => g.status === 'BLOCK');
  if (blockers.length === 0) {
    const final = profile === PROFILE_FINAL;
    return {
      blockers: 0,
      gate: null,
      action: final ? 'node scripts/film.mjs render --profile final' : 'node scripts/film.mjs draft',
      why: final
        ? 'every final gate passes — render the final film'
        : 'no blockers for the draft profile — render a 720p draft and watch it',
    };
  }
  const gate = blockers[0];
  const ctx = context || {};
  let action;
  let why = gate.detail;
  switch (gate.name) {
    case 'environment':
      action = 'node scripts/film.mjs setup';
      why = 'the one Python env / ffmpeg / node check failed';
      break;
    case 'ingest':
      action = 'copy your images into assets-src/inbox/, then: node scripts/film.mjs ingest';
      break;
    case 'duplicates': {
      const m = String(gate.fix || '').match(/^\s*scene (\d+) -> save as (\S+) \| target ([^|]+) \| prompt: (.+)$/m);
      if (m) {
        action = `regenerate scene ${m[1]} -> ${m[2].trim()} (${m[3].trim()}); prompt: ${m[4].trim()}; then: node scripts/film.mjs ingest`;
        why = `duplicate group — scene ${m[1]} needs a distinct image`;
      } else {
        action = 'regenerate a distinct image for the first REQUEUE scene, then: node scripts/film.mjs ingest';
      }
      break;
    }
    case 'resolution': {
      const n = first(ctx.lowScenes, null);
      action = n === null
        ? 'node scripts/film.mjs upscale --scene N  (or regenerate a larger source)'
        : `node scripts/film.mjs upscale --scene ${n}  (or regenerate a source >= ${ctx.minSourceWidth || 1600} px wide)`;
      why = n === null ? 'a source is too small for final' : `scene ${n} source is too small for final`;
      break;
    }
    case 'manual-review': {
      if (ctx.licenseMissing) {
        action = 'node scripts/film.mjs review --license-url <the image tool\'s license URL>';
        why = 'licenseTermsUrl is empty — only the explicit review command may set it';
      } else if (ctx.promptMissingScenes && ctx.promptMissingScenes.length) {
        action = 'node scripts/film.mjs ingest --profile final';
        why = `scene ${ctx.promptMissingScenes[0]} has no recorded prompt — a final ingest fills it from docs/prompts/`;
      } else {
        const n = first(ctx.unreviewedScenes, 'N');
        action = `open out/review/review.html (scene ${n}), then: node scripts/film.mjs review --scene ${n} --matches-narration yes --watermark clear --reviewed yes`;
        why = 'each scene must be reviewed by a person; nothing is auto-filled';
      }
      break;
    }
    case 'depth':
      action = 'node scripts/film.mjs depth --depth gradient';
      why = gate.detail;
      break;
    case 'parallax-metrics':
      action = 'node scripts/film.mjs depth --depth gradient';
      why = gate.detail;
      break;
    case 'draft-render':
      action = 'node scripts/film.mjs draft --scenes 2,7,15';
      why = gate.detail;
      break;
    default:
      action = gate.fix ? String(gate.fix).split('\n')[0] : `node scripts/film.mjs doctor`;
      break;
  }
  return { blockers: blockers.length, gate: gate.name, action, why };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cfg = loadConfig(ROOT);
  if (args.story) cfg.story = args.story;
  const story = JSON.parse(fs.readFileSync(path.resolve(ROOT, cfg.story), 'utf8'));
  const profile = currentProfile({ root: ROOT, cfg, explicit: args.profile });
  const manifest = readManifest(ROOT, cfg);
  const gates = runGates({ cfg, story, profile, stopOnBlock: false });
  const context = collectContext({ root: ROOT, cfg, story, manifest });
  const next = nextActionFor(gates, { profile, context });

  const source = args.profile ? 'flag' : (manifest ? 'manifest' : 'default');
  console.log(`film next: story=${cfg.story} profile=${profile} (${source})`);
  console.log(`BLOCKERS: ${next.blockers}${next.blockers ? ` (${gates.filter((g) => g.status === 'BLOCK').map((g) => g.name).join(', ')})` : ''}`);
  console.log(`NEXT: ${next.action}`);
  if (next.why) console.log(`      ${next.why}`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('film next failed:', e.message); process.exit(1); });
}
