/** Round 13 item 4: quiet grouped output, probe cache, one requeue list. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  bundledBinary, mediaCommand, fingerprint, entryKey, cachedProbe, cachedPhash,
  loadCache, saveCache, newStats, cacheReport, CACHE_VERSION, CACHE_REL,
} from '../scripts/lib/probe-cache.mjs';
import { requeuePlan } from '../scripts/lib/film-duplicates.mjs';
import { summarizeFindings } from '../scripts/lib/film-profile.mjs';

const TMP = path.join('build', 'cache', 'round13-probe');
const SOURCE = 'public/illustrated/illustrations/tiny.png';

function reset(p) {
  fs.rmSync(p, { recursive: true, force: true });
  fs.mkdirSync(p, { recursive: true });
}

test('bundled ffprobe/ffmpeg are used instead of npx (real paths)', () => {
  const probe = bundledBinary('ffprobe');
  const ffmpeg = bundledBinary('ffmpeg');
  if (!probe || !ffmpeg) {
    // Honest: without node_modules the fallback must still be a valid command.
    const c = mediaCommand('ffprobe');
    assert.ok(c.cmd);
    return;
  }
  assert.ok(fs.existsSync(probe) && probe.includes('compositor-'));
  assert.ok(fs.existsSync(ffmpeg) && ffmpeg.includes('compositor-'));
  const c = mediaCommand('ffprobe');
  assert.equal(c.cmd, probe);
  assert.equal(c.shell, false);
});

test('cache key covers path + mtime + size; sha256 stored with the entry', () => {
  const fp = fingerprint(SOURCE);
  const key = entryKey(fp);
  assert.ok(key.includes(fp.path));
  assert.ok(key.includes(String(fp.mtimeMs)));
  assert.ok(key.includes(String(fp.size)));
  assert.equal(fp.path.includes('\\'), false, 'path is normalized');
});

test('cachedProbe: first call computes, second call is a cache hit', () => {
  const root = TMP;
  reset(root);
  const stats = newStats();
  const cache = loadCache(root);
  const a = cachedProbe(SOURCE, { root, cache, stats });
  assert.ok(a.width > 0 && a.height > 0, 'probe must measure a real image');
  assert.equal(a.cached, false);
  assert.equal(a.sha256.length, 64);
  const b = cachedProbe(SOURCE, { root, cache, stats });
  assert.equal(b.cached, true);
  assert.equal(b.width, a.width);
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 1);
  const line = cacheReport(stats, { elapsedMs: 500, baselineMs: 265000 });
  assert.match(line, /probe cache: 1\/2 cached/);
  assert.match(line, /run 500 ms/);
  assert.match(line, /faster than baseline 265\.0 s/);
});

test('cachedPhash caches the hash and invalidates when mtime changes', () => {
  const root = TMP;
  reset(root);
  const copy = path.join(root, 'scene.png');
  fs.copyFileSync(SOURCE, copy);
  const stats = newStats();
  const cache = loadCache(root);
  const a = cachedPhash(copy, { root, cache, stats });
  assert.equal(a.phash.length, 64);
  assert.equal(a.cached, false);
  const b = cachedPhash(copy, { root, cache, stats });
  assert.equal(b.cached, true);
  assert.equal(b.phash, a.phash);
  // Touch the file: the fingerprint changes, so it must recompute (no stale hit).
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(copy, later, later);
  const c = cachedPhash(copy, { root, cache, stats });
  assert.equal(c.cached, false, 'mtime change must invalidate the cache');
  assert.equal(c.phash, a.phash, 'same bytes still produce the same hash');
});

test('save/load cache round-trips with a version guard', () => {
  const root = TMP;
  reset(root);
  const cache = loadCache(root);
  cache.entries.x = { path: 'nope', mtimeMs: 1, size: 2, sha256: 'a', probe: { width: 1, height: 1, pixFmt: 'rgb24' } };
  saveCache(cache, root);
  const loaded = loadCache(root);
  assert.equal(loaded.version, CACHE_VERSION);
  assert.ok(loaded.entries.x);
  const p = path.resolve(root, CACHE_REL);
  fs.writeFileSync(p, JSON.stringify({ version: 999, entries: { stale: 1 } }));
  assert.deepEqual(loadCache(root).entries, {}, 'old cache versions are ignored');
});

test('requeuePlan: scene, save-as filename, target size/aspect, prompt file', () => {
  const groups = [
    [{ scene: 9 }, { scene: 10 }],
    [{ scene: 15 }, { scene: 16 }, { scene: 17 }],
  ];
  const plan = requeuePlan(groups);
  const lines = plan.split('\n');
  assert.equal(lines[0], 'REQUEUE (regenerate only these 3):');
  assert.match(lines[1], /scene 10 -> save as assets-src\/inbox\/scene-10\.png \| target >= 1920x1080, 16:9 \| prompt: /);
  assert.equal(lines.length, 4);
  assert.ok(!plan.includes('scene 9 '), 'retained scene is not listed');
  assert.equal(requeuePlan([]), 'REQUEUE: none');
});

test('ingest is quiet by default: per-scene lines only with --verbose', () => {
  const src = fs.readFileSync('scripts/lib/film-ingest.mjs', 'utf8');
  assert.ok(src.includes("if (verbose) graph.log(`  scene ${m.scene}: SOURCE"), 'per-scene SOURCE must be verbose-only');
  assert.ok(src.includes("if (verbose) graph.log(`  scene ${m.scene}: SOURCE GATE"), 'per-scene gate must be verbose-only');
  assert.ok(src.includes('cacheReport(probeStats'), 'ingest must report the cache speedup');
  assert.ok(src.includes('summarizeFindings(findings, { verbose })'));
});

test('one grouped warning line matches the required wording', () => {
  const findings = Array.from({ length: 18 }, (_, i) => ({
    kind: 'source', scene: i + 1, value: 'source 1024 px (< 1600)',
  }));
  const lines = summarizeFindings(findings);
  assert.equal(lines.length, 1);
  assert.equal(lines[0], '18 scenes: source 1024 px (< 1600)  scenes 1-18');
});

test('intake uses the bundled binary too (no npx per image)', () => {
  const src = fs.readFileSync('scripts/intake-illustrations.mjs', 'utf8');
  assert.ok(src.includes('mediaCommand(cmd)'), 'intake must resolve the bundled binary');
  assert.ok(!src.includes("['remotion', cmd,"), 'intake must not spawn npx remotion per image');
});
