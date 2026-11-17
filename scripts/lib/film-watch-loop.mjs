/**
 * @fileoverview Watch mode: watch inbox + story.json, debounce, run ingest ->
 * depth(if model available) -> preview for affected scenes, refresh sheet.
 * Memory-safe: preflight + low concurrency from config.
 * @module scripts/lib/film-watch-loop
 */
import fs from 'node:fs';
import path from 'node:path';
import { debounceReady, affectedScenes } from './film-watch.mjs';

export async function watch({ cfg, args, graph, ROOT }) {
  const inbox = path.resolve(ROOT, cfg.paths.inbox);
  const storyPath = path.resolve(ROOT, cfg.story);
  if (!fs.existsSync(inbox)) fs.mkdirSync(inbox, { recursive: true });
  let lastMs = 0;
  let timer = null;
  let affected = new Set();

  const { runPreflight, formatPreflight } = await import('../preflight.mjs');
  for (const line of formatPreflight(runPreflight())) graph.log(line);
  graph.log(`watch: inbox=${cfg.paths.inbox}, story=${cfg.story}, concurrency=${cfg.concurrency}, debounce=600ms`);

  const flush = async () => {
    const scenes = [...affected].sort((a, b) => a - b);
    affected = new Set();
    if (!scenes.length) return;
    graph.log(`watch: change -> scenes [${scenes.join(',')}]`);
    const only = scenes.length === 1 ? ['--only', `scene=${scenes[0]}`] : [];
    const { main } = await import('../../film.mjs');
    // Run stages sequentially with the original config; --force not used (hash decides).
    try { await main(['ingest', '--story', cfg.story, ...only]); }
    catch (e) { graph.log(`watch: ingest failed: ${e.message}`); return; }
    if (cfg.depth.mode === 'model') {
      try { await main(['depth', '--story', cfg.story]); }
      catch (e) { graph.log(`watch: depth skipped (${e.message}) — model unavailable`); }
    }
    try { await main(['preview', '--story', cfg.story, '--force']); }
    catch (e) { graph.log(`watch: preview failed: ${e.message}`); }
  };

  const onChange = (changedPath) => {
    const now = Date.now();
    const scenes = affectedScenes(changedPath);
    for (const s of scenes) affected.add(s);
    if (!debounceReady(lastMs, now, 600)) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { lastMs = Date.now(); flush(); }, 600);
      return;
    }
    lastMs = now;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 600);
  };

  const watchers = [];
  try {
    watchers.push(fs.watch(inbox, (_event, filename) => { if (filename) onChange(String(filename)); }));
    watchers.push(fs.watch(storyPath, () => onChange('story.json')));
    graph.log('watch: running (Ctrl+C to stop)');
    await new Promise((resolve) => {
      const stop = () => { for (const w of watchers) w.close(); resolve(); };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    });
  } finally {
    for (const w of watchers) w.close();
  }
  return 0;
}
