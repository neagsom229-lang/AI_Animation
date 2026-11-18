#!/usr/bin/env node
/**
 * @fileoverview Round 15 item 3: READ-ONLY scene-type audit and cost guard.
 * Does not modify the story. Prints the exact field that makes a scene world3d,
 * the scene-13 anomaly, and the world3d share of duration vs the 25% limit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/film-config.mjs';
import { buildIllustratedTimeline } from '../remotion/lib/illustrated-timing.ts';
import { costGuard } from './lib/film-cost.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Scene type + the story field that set it. Pure. */
export function auditSceneTypes(story) {
  return (story.scenes || []).map((s, i) => {
    const type = s.media?.type === 'world3d' ? 'world3d' : 'illustration';
    return {
      scene: i + 1, id: s.id, type,
      field: type === 'world3d' ? `media.type=${s.media.type}, media.world=${s.media.world || '-'}` : 'media.type absent/illustration',
    };
  });
}

/** Read the last real draft report for measured ms/frame (never invent numbers). */
export function lastDraftTimings(root = ROOT) {
  const base = path.resolve(root, 'out/drafts');
  if (!fs.existsSync(base)) return { dir: null, timing: [] };
  const dirs = fs.readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-/.test(e.name))
    .map((e) => ({ name: e.name, mtime: fs.statSync(path.join(base, e.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const d of dirs) {
    const p = path.join(base, d.name, 'report.json');
    if (!fs.existsSync(p)) continue;
    try { return { dir: d.name, timing: JSON.parse(fs.readFileSync(p, 'utf8')).timing || [] }; } catch { /* try older */ }
  }
  return { dir: null, timing: [] };
}

export function auditText({ root = ROOT } = {}) {
  const cfg = loadConfig(root);
  const story = JSON.parse(fs.readFileSync(path.resolve(root, cfg.story), 'utf8'));
  const types = auditSceneTypes(story);
  const world3d = types.filter((t) => t.type === 'world3d');
  const voice = JSON.parse(fs.readFileSync(path.resolve(root, `public/voice-${path.basename(cfg.story, '.json')}.json`), 'utf8'));
  const timeline = buildIllustratedTimeline(voice, cfg.fps);
  const guard = costGuard({ story, timeline, fps: cfg.fps, cfg });
  const { dir, timing } = lastDraftTimings(root);
  const ms = new Map(timing.map((t) => [t.scene, t.msPerFrame]));
  const scene13 = ms.get(13);
  const neighbours = [11, 12, 14].map((n) => `${n}=${ms.get(n) ?? 'n/a'}`).join(', ');

  const lines = [
    'SCENE TYPE AUDIT — read-only (story was NOT modified)',
    '',
    `world3d scenes (${world3d.length}): ${world3d.map((t) => `${t.scene} (${t.id})`).join(', ')}`,
    'story field: ' + world3d.map((t) => `${t.scene}: ${t.field}`).join('; '),
    'All other scenes are painted illustration = 2.5D parallax, NOT true 3D. Only world3d scenes have limb animation.',
    '',
    `COST GUARD: world3d ${(guard.world3dFraction * 100).toFixed(1)}% of duration; limit ${(cfg.cost.world3dMaxFraction * 100).toFixed(0)}%; warn=${guard.warn}${guard.reasons.length ? ` — ${guard.reasons.join('; ')}` : ''}`,
    `Film duration: ${(timeline.durationInFrames / cfg.fps).toFixed(1)} s`,
    '',
    `LATEST REAL DRAFT: ${dir || 'none'}`,
    `Scene 13 (Angkor Thom / Bayon) measured ${scene13 ?? 'n/a'} ms/frame while its painted duplicates ran ${neighbours}.`,
    'FLAG FOR USER CONFIRMATION: scene 13 is marked world3d but behaves like a painted duplicate. To make it painted, apply this ONE line:',
    `  node -e \"const fs=require('fs');const p='src/stories/khmer-empire.json';const s=JSON.parse(fs.readFileSync(p));delete s.scenes[12].media;fs.writeFileSync(p,JSON.stringify(s,null,2)+'\\\\n')\"`,
    'This audit did NOT apply that edit.',
  ];
  return { lines, types, guard, scene13, neighbours };
}

export function main() {
  const { lines } = auditText();
  console.log(lines.join('\n'));
  return 0;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) { try { process.exitCode = main(); } catch (e) { console.error('scene audit failed:', e.message); process.exit(1); } }
