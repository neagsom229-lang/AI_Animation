/**
 * @fileoverview Smart filename -> scene mapping (pure). Matches the variants the
 * user actually drops: scene-1, scene16, "Scene 16", scene_16, 16.png.
 * No digits => look up inbox/map.json. Detects duplicates + missing scenes.
 * @module scripts/lib/film-map
 */
import path from 'node:path';

/** Extract a scene number from a filename. Returns null when no digits. */
export function sceneFromFilename(name) {
  const base = String(name).split(path.sep).pop();
  const m = base.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/**
 * Map a list of filenames to scene numbers using an optional map file object.
 * map.json form: { "1": "dawn.png", "scene-02": "kulen.png" } or
 * { "dawn.png": 1, "kulen.png": "02" }.
 * Returns { mapped: [{file, scene}], unmapped: [file], duplicates: {scene:[files]} }.
 */
export function mapFilenames(files, mapObject = {}, totalScenes = 18) {
  // Build filename->scene lookup from map.json (both directions).
  const byFile = new Map();
  for (const [k, v] of Object.entries(mapObject || {})) {
    const kNum = sceneFromFilename(k);
    const vNum = sceneFromFilename(String(v));
    if (kNum !== null && typeof v === 'string') byFile.set(v.toLowerCase(), kNum);
    if (vNum !== null) byFile.set(k.toLowerCase(), vNum);
  }
  const byScene = new Map();
  const unmapped = [];
  for (const f of files) {
    let scene = sceneFromFilename(f);
    if (scene === null && byFile.has(String(f).toLowerCase())) scene = byFile.get(String(f).toLowerCase());
    if (scene === null || !Number.isInteger(scene) || scene < 1 || scene > totalScenes) {
      unmapped.push(f);
      continue;
    }
    if (!byScene.has(scene)) byScene.set(scene, []);
    byScene.get(scene).push(f);
  }
  const duplicates = {};
  for (const [scene, fs] of byScene) {
    if (fs.length > 1) duplicates[scene] = fs;
  }
  const mapped = [...byScene.entries()].map(([scene, fs]) => ({ file: fs[0], scene, also: fs.slice(1) }));
  return { mapped, unmapped, duplicates };
}

/** Missing scene numbers (1..totalScenes) from a mapped list. */
export function missingScenes(mapped, totalScenes = 18) {
  const have = new Set(mapped.map((m) => m.scene));
  const out = [];
  for (let i = 1; i <= totalScenes; i += 1) if (!have.has(i)) out.push(i);
  return out;
}
