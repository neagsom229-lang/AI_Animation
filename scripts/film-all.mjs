#!/usr/bin/env node
/**
 * @fileoverview Round 15 item 6: `film all` — the one honest command.
 *
 * environment check -> ingest -> depth -> next. Stops at the FIRST blocker for
 * the chosen profile and prints exactly ONE next action. Never loops, never
 * forces, never touches assets-src/inbox. `--draft` renders only when there are
 * no blockers AND free RAM >= 4 GB.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, configHash } from './lib/film-config.mjs';
import { probeEnvironment } from './lib/film-env.mjs';
import { runGates } from './film-doctor.mjs';
import { currentProfile } from './lib/film-profile.mjs';
import { nextActionFor, collectContext, readManifest } from './film-next.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MIN_RENDER_FREE_GB = 4;

/** Free RAM in GB (os.freemem, NOT filesystem space). */
export function freeRamGb() {
  return Number((os.freemem() / 1e9).toFixed(2));
}

/** One next action from all gates (no stopping inside runGates). */
export function oneAction(gates, { profile, context }) {
  const next = nextActionFor(gates, { profile, context });
  return { blockers: next.blockers, gate: next.gate, action: next.action, why: next.why };
}

/** Draft render is allowed ONLY with the flag, zero blockers and enough RAM. */
export function draftDecision({ draft, blockers, ramGb }) {
  if (!draft) return { render: false, reason: 'no --draft flag' };
  if (blockers > 0) return { render: false, reason: `${blockers} blocker(s) for this profile` };
  if (!(ramGb >= MIN_RENDER_FREE_GB)) {
    return { render: false, reason: `free RAM ${ramGb} GB < ${MIN_RENDER_FREE_GB} GB` };
  }
  return { render: true, reason: 'no blockers and free RAM >= 4 GB' };
}

/** Run the real chain. Returns an exit code. */
export async function main({ root = ROOT, cfg = null, args = {}, graph = null } = {}) {
  const cfg0 = cfg || loadConfig(root);
  const ch = configHash(cfg0);
  const log = (m) => { if (graph) graph.log(m); else console.log(`[film all] ${m}`); };
  const profile = args.profile || currentProfile({ root, cfg: cfg0, explicit: null });
  const ramStart = freeRamGb(root);
  log(`film all profile=${profile} config=${ch} freeRam=${ramStart} GB`);

  // 0) environment — the one Python env + ffmpeg + node.
  const env = probeEnvironment(root);
  if (!env.ok) {
    console.error(`ENVIRONMENT BLOCK: ${env.summary}\nFIX: ${env.fix}`);
    return 1;
  }
  log(`environment PASS: ${env.summary}`);

  const story = JSON.parse(fs.readFileSync(path.resolve(root, cfg0.story), 'utf8'));
  const data = { story, storyName: path.basename(cfg0.story, '.json') };
  const stages = [
    ['ingest', async () => {
      const { ingest } = await import('./lib/film-ingest.mjs');
      await ingest({ cfg: cfg0, args, graph: graph || { log, close() {}, save() {} },
        data, force: false, only: args.only, verbose: args.verbose, profile });
    }],
    ['depth', async () => {
      const { runDepth } = await import('./lib/film-depth.mjs');
      runDepth({ cfg: cfg0, args, graph: graph || { log, close() {}, save() {} }, root, profile });
    }],
  ];

  for (const [name, fn] of stages) {
    log(`stage ${name} START`);
    await fn();
    const gates = runGates({ cfg: cfg0, story, profile, stopOnBlock: false });
    const action = oneAction(gates, { profile, context: collectContext({
      root, cfg: cfg0, story, manifest: readManifest(root, cfg0),
    }) });
    if (action.blockers > 0) {
      console.log(`STOP after ${name}: ${action.blockers} blocker(s) for profile ${profile}`);
      console.log(`NEXT: ${action.action}`);
      if (action.why) console.log(`      ${action.why}`);
      return 1;
    }
    log(`stage ${name} DONE (0 blockers)`);
  }

  const decision = draftDecision({ draft: Boolean(args.draft), blockers: 0, ramGb: freeRamGb(root) });
  if (decision.render) {
    const { main: draftMain } = await import('./film-draft.mjs');
    return draftMain(['--all']);
  }
  log(`draft NOT rendered: ${decision.reason}`);
  const gates = runGates({ cfg: cfg0, story, profile, stopOnBlock: false });
  const action = oneAction(gates, { profile, context: collectContext({
    root, cfg: cfg0, story, manifest: readManifest(root, cfg0),
  }) });
  console.log(`NEXT: ${action.action}`);
  if (action.why) console.log(`      ${action.why}`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  main({ args: { draft: process.argv.includes('--draft') } })
    .then((c) => { process.exitCode = c; })
    .catch((e) => { console.error('film all failed:', e.message); process.exit(1); });
}
