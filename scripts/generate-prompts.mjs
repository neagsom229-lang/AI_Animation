#!/usr/bin/env node
/**
 * @fileoverview Generate paste-ready prompt files: docs/prompts/scene-NN.txt.
 *
 * Each file has the scene's era-correct prompt (from docs/ILLUSTRATION_PROMPTS.md,
 * which now varies the style line by period), the exact filename to save, the
 * target size, and both narrations. Pure function + CLI; deterministic output.
 *
 * Usage: node scripts/generate-prompts.mjs [--story src/stories/khmer-empire.json]
 *        node scripts/generate-prompts.mjs --check   (fail if files are stale)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePrompts } from './lib/film-duplicates.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const PROMPT_DIR = 'docs/prompts';
export const PROMPTS_DOC = 'docs/ILLUSTRATION_PROMPTS.md';

/**
 * Build the prompt files in memory from the story + prompt document.
 * @returns {Array<{scene:number, file:string, text:string}>}
 */
export function buildPromptFiles({ story, promptsDoc }) {
  const prompts = parsePrompts(promptsDoc, ROOT);
  const titles = parseSceneTitles(promptsDoc);
  const scenes = story.scenes || [];
  const missing = [];
  const files = scenes.map((s, i) => {
    const n = Number(String(s.id).match(/\d+/)?.[0] || i + 1);
    const key = String(n).padStart(2, '0');
    const prompt = prompts[key];
    if (!prompt) missing.push(n);
    const name = `scene-${key}.png`;
    const narration = s.narration || {};
    const text = `${[
      `# scene-${key} — ${titles[key] || 'illustration'}`,
      '',
      `FILENAME: assets-src/illustrations/${name}`,
      'SIZE: 1920x1080 (16:9); source must be at least 1600 px wide for a final render',
      '',
      `NARRATION (en): ${narration.en || ''}`,
      `NARRATION (km): ${narration.km || ''}`,
      '',
      'PROMPT:',
      prompt || '(MISSING — add this scene to docs/ILLUSTRATION_PROMPTS.md)',
      '',
    ].join('\n')}`;
    return { scene: n, file: `${PROMPT_DIR}/${name.replace(/\.png$/, '.txt')}`, text };
  });
  if (missing.length) {
    throw new Error(`No prompt for scene(s) ${missing.join(', ')} in ${PROMPTS_DOC}. Add a "## scene-NN" section.`);
  }
  return files;
}

/** Heading titles: { '01': 'Dawn over Angkor Wat', ... }. */
export function parseSceneTitles(doc) {
  const out = {};
  const re = /^##\s*scene[-\s]?(\d+)\s*[—–-]\s*(.+)$/gim;
  let m;
  while ((m = re.exec(String(doc || ''))) !== null) out[String(m[1]).padStart(2, '0')] = m[2].trim();
  return out;
}

/** Write the files (or verify with {check:true}). */
export function writePromptFiles({ root = ROOT, storyPath = 'src/stories/khmer-empire.json', promptsPath = PROMPTS_DOC, check = false } = {}) {
  const story = JSON.parse(fs.readFileSync(path.resolve(root, storyPath), 'utf8'));
  const promptsDoc = fs.readFileSync(path.resolve(root, promptsPath), 'utf8');
  const files = buildPromptFiles({ story, promptsDoc });
  const stale = [];
  for (const f of files) {
    const abs = path.resolve(root, f.file);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (check) {
      if (current !== f.text) stale.push(f.file);
      continue;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (current !== f.text) fs.writeFileSync(abs, f.text, 'utf8');
  }
  return { files, stale };
}

function parseCli(argv) {
  const a = { story: 'src/stories/khmer-empire.json', check: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--story' && argv[i + 1]) a.story = argv[++i];
    else if (argv[i] === '--check') a.check = true;
    else throw new Error(`Unknown: ${argv[i]}. Usage: node scripts/generate-prompts.mjs [--story path] [--check]`);
  }
  return a;
}

export function main(argv = process.argv.slice(2)) {
  const a = parseCli(argv);
  const { files, stale } = writePromptFiles({ root: ROOT, storyPath: a.story, check: a.check });
  if (a.check) {
    if (stale.length) {
      console.error(`${stale.length} prompt file(s) stale: ${stale.slice(0, 5).join(', ')}${stale.length > 5 ? ' …' : ''}`);
      console.error('FIX: node scripts/generate-prompts.mjs');
      return 1;
    }
    console.log(`${files.length} prompt files are up to date.`);
    return 0;
  }
  console.log(`wrote ${files.length} prompt files to ${PROMPT_DIR}/ (scene-01.txt … scene-${String(files.length).padStart(2, '0')}.txt)`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  try { process.exitCode = main(); } catch (e) { console.error('generate-prompts failed:', e.message); process.exitCode = 1; }
}
