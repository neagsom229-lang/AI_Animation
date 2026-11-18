/**
 * @fileoverview Round 13 item 7: STATUS.md — one human table, no JSON hunting.
 *
 * `film status` calls `writeStatusFile`, which joins the real sources of truth:
 *   - assets-src/illustrations/manifest.json  (image, size, review flags)
 *   - out/review/parallax-metrics.json        (depth source + limitFactor)
 *   - out/.illustrated-scene-cache/sc-NN-*.mp4 (last render)
 *
 * The file is generated output: it carries a "do not edit by hand" header and is
 * rewritten on every `film status`. Nothing here invents a value — missing data
 * is printed as `-` / `missing`.
 * @module scripts/lib/film-report
 */
import fs from 'node:fs';
import path from 'node:path';
import { readManifestProfile } from './film-profile.mjs';

export const STATUS_FILE = 'STATUS.md';
export const METRICS_REL = 'out/review/parallax-metrics.json';
export const SCENE_CACHE_REL = 'out/.illustrated-scene-cache';

/** First number in a scene id ("sc-07" -> 7, "scene-12" -> 12). */
export function sceneNo(value) {
  const m = String(value ?? '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Read the intake manifest (null when missing/corrupt). */
export function readManifest(root, cfg) {
  const p = path.resolve(root, cfg.paths.illustrations, 'manifest.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/** Map scene number -> metrics record (from out/review/parallax-metrics.json). */
export function readMetrics(root) {
  const p = path.resolve(root, METRICS_REL);
  const map = new Map();
  if (!fs.existsSync(p)) return map;
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const s of j.scenes || []) {
      const n = sceneNo(s.scene);
      if (n) map.set(n, s);
    }
  } catch { /* missing metrics are reported as "-" */ }
  return map;
}

/** Map scene number -> newest cached scene render ({file, mtimeMs, size}). */
export function lastRenderByScene(root, dir = SCENE_CACHE_REL) {
  const base = path.resolve(root, dir);
  const map = new Map();
  if (!fs.existsSync(base)) return map;
  for (const name of fs.readdirSync(base)) {
    const m = name.match(/^sc-(\d+)-[0-9a-f]+\.(?:mp4|webm)$/i);
    if (!m) continue;
    const st = fs.statSync(path.join(base, name));
    const n = Number(m[1]);
    const prev = map.get(n);
    if (!prev || st.mtimeMs > prev.mtimeMs) map.set(n, { file: name, mtimeMs: st.mtimeMs, size: st.size });
  }
  return map;
}

/** Map scene number -> {group, size} for duplicate groups ([records...]). */
export function duplicateSceneMap(groups = []) {
  const map = new Map();
  groups.forEach((g, i) => {
    for (const r of g) map.set(sceneNo(r.scene), { group: i + 1, size: g.length });
  });
  return map;
}

/** Compact inline group list: [9,10],[11,12,13,14] -> "9=10; 11=12=13=14". */
export function groupList(groups = []) {
  return groups.map((g) => g.map((r) => sceneNo(r.scene)).join('=')).join('; ');
}

function stamp(ms) {
  if (!Number.isFinite(ms)) return '-';
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

function mb(bytes) {
  if (!Number.isFinite(bytes)) return '';
  return ` (${(bytes / (1024 * 1024)).toFixed(1)} MB)`;
}

/**
 * Build the status model used by STATUS.md (and tests). All values come from
 * files on disk; `report` (computeStatus output) only supplies duplicate groups
 * and the release verdict when available.
 * @returns {{rows:object[], counts:object, profile:string|null, markdown:string}}
 */
export function buildStatusReport({ root, cfg, story, report = null, now = new Date() }) {
  const manifest = readManifest(root, cfg);
  const metrics = readMetrics(root);
  const renders = lastRenderByScene(root);
  const dupes = duplicateSceneMap(report?.duplicateGroups || []);
  const entries = manifest?.scenes?.length
    ? [...manifest.scenes].sort((a, b) => Number(a.scene) - Number(b.scene))
    : (story?.scenes || []).map((s, i) => ({ scene: sceneNo(s.id) ?? i + 1, file: s.image }));

  const rows = entries.map((e) => {
    const n = Number(e.scene) || sceneNo(e.scene);
    const metric = metrics.get(n);
    const render = renders.get(n);
    const dupe = dupes.get(n);
    return {
      scene: n,
      image: path.basename(e.file || `scene-${String(n).padStart(2, '0')}.png`),
      file: e.file || null,
      sourceWidth: e.sourceWidth ?? null,
      sourceHeight: e.sourceHeight ?? null,
      duplicateGroup: dupe ? dupe.group : null,
      duplicateSize: dupe ? dupe.size : 0,
      depthSource: metric?.depthSource || 'missing',
      limitFactor: typeof metric?.limitFactor === 'number' ? metric.limitFactor : null,
      reviewed: e.reviewed === true,
      matchesNarration: e.matchesNarration === true,
      watermarkCheck: e.watermarkCheck === true,
      license: Boolean(e.licenseTermsUrl && String(e.licenseTermsUrl).trim()),
      lastRender: render ? stamp(render.mtimeMs) : 'never',
      lastRenderBytes: render ? render.size : null,
    };
  });

  const depthCounts = rows.reduce((acc, r) => {
    acc[r.depthSource] = (acc[r.depthSource] || 0) + 1;
    return acc;
  }, {});
  const groups = report?.duplicateGroups || [];
  const counts = {
    scenes: rows.length,
    reviewed: rows.filter((r) => r.reviewed).length,
    matched: rows.filter((r) => r.matchesNarration).length,
    watermark: rows.filter((r) => r.watermarkCheck).length,
    licensed: rows.filter((r) => r.license).length,
    lowSource: rows.filter((r) => Number.isFinite(r.sourceWidth) && r.sourceWidth < cfg.quality.minSourceWidth).length,
    duplicateGroups: groups.length,
    duplicateScenes: rows.filter((r) => r.duplicateGroup).length,
    depthMissing: rows.filter((r) => r.depthSource === 'missing').length,
    rendered: rows.filter((r) => r.lastRender !== 'never').length,
    depthCounts,
  };

  const profile = readManifestProfile(root, cfg);
  const profileLabel = profile || 'missing';
  const generated = now.toISOString();
  const name = path.basename(cfg.story || 'story');
  const release = counts.reviewed === rows.length && counts.duplicateGroups === 0 && counts.lowSource === 0
    && counts.licensed === rows.length;

  const table = rows.map((r) => {
    const size = Number.isFinite(r.sourceWidth) ? `${r.sourceWidth}x${r.sourceHeight ?? '?'}` : '-';
    const dup = r.duplicateGroup ? `${r.duplicateGroup} (${r.duplicateSize})` : '-';
    const limit = r.limitFactor === null ? '-' : r.limitFactor.toFixed(2);
    const yes = (v) => (v ? 'yes' : 'no');
    return `| ${r.scene} | \`${r.image}\` | ${size} | ${dup} | ${r.depthSource} | ${yes(r.reviewed)} | ${yes(r.matchesNarration)} | ${yes(r.watermarkCheck)} | ${limit} | ${r.lastRender}${mb(r.lastRenderBytes)} |`;
  }).join('\n');

  const depthLine = Object.entries(counts.depthCounts)
    .filter(([k]) => k !== 'missing')
    .map(([k, v]) => `${k} ${v}`)
    .join(', ') || 'none';

  const markdown = `# STATUS — ${name}

> Generated ${generated} by \`node scripts/film.mjs status\`. Do not edit by hand; re-run the command.
> Manifest profile: **${profileLabel}** · Release candidate: **${release ? 'YES' : 'NO'}**
> Parallax is **2.5D** (depth-based camera movement), never true 3D.

| # | image | source | dup | depth | rev | match | wm | limit | last render |
|--:|---|---|---:|---|---|---|---|---:|---|
${table}

## Counts
- scenes: **${counts.scenes}**
- reviewed: **${counts.reviewed}** / ${counts.scenes} (matches narration ${counts.matched}, watermark clear ${counts.watermark})
- licensed: **${counts.licensed}** / ${counts.scenes}
- duplicate groups: **${counts.duplicateGroups}**${groups.length ? ` (${groupList(groups)})` : ''}
- sources below ${cfg.quality.minSourceWidth} px: **${counts.lowSource}**
- depth maps: **${counts.scenes - counts.depthMissing}** / ${counts.scenes} (${depthLine})
- scenes with a cached render: **${counts.rendered}** / ${counts.scenes}

## Next
Run \`node scripts/film.mjs next\` — it prints exactly one action and the blocker count.
`;

  return { rows, counts, profile, release, generated, markdown };
}

/** Write STATUS.md at the repo root; returns the relative path. */
export function writeStatusFile({ root, cfg, story, report = null, now = new Date(), file = STATUS_FILE }) {
  const model = buildStatusReport({ root, cfg, story, report, now });
  const out = path.resolve(root, file);
  fs.writeFileSync(out, model.markdown, 'utf8');
  return { path: path.relative(root, out).replace(/\\/g, '/'), ...model };
}
