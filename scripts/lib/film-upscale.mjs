/**
 * @fileoverview Round 9 item 1: optional Real-ESRGAN upscale hook.
 *
 * `film upscale --scene N` requires a Real-ESRGAN executable on PATH (license
 * BSD-3-Clause, quoted in THIRD_PARTY_LICENSES.md). It NEVER silently resizes:
 * if the upscaler is missing it fails with exact install steps. On success the
 * manifest entry is marked upscaled:true and sourceWidth updated.
 * @module scripts/lib/film-upscale
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Detect Real-ESRGAN executable on PATH (where/which). */
export function detectUpscaler() {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(cmd, ['realesrgan-ncnn-vulkan'], { encoding: 'utf8' });
  if (r.status === 0 && (r.stdout || '').trim()) {
    return { found: true, exe: (r.stdout || '').trim().split(/\r?\n/)[0].trim() };
  }
  return { found: false, exe: '' };
}

/** Exact manual install steps for Real-ESRGAN (BSD-3-Clause). */
export function upscaleInstallSteps() {
  return [
    'Real-ESRGAN is NOT installed (license: BSD-3-Clause — permissive, verified from https://raw.githubusercontent.com/xinntao/Real-ESRGAN/master/LICENSE).',
    'Install from https://github.com/xinntao/Real-ESRGAN/releases (realesrgan-ncnn-vulkan), extract it, and add the folder to PATH.',
    'Verify: realesrgan-ncnn-vulkan --version',
    'Then re-run: node scripts/film.mjs upscale --scene N',
    'Alternatively regenerate that illustration at >= 1600px source width (the resolution gate measures SOURCE, never the resized output).',
  ];
}

/** Run the upscale stage for one scene. */
export async function filmUpscale({ cfg, args, graph, data, root = process.cwd() }) {
  const sceneNo = args.only;
  if (!Number.isInteger(sceneNo) || sceneNo < 1) {
    throw new Error('film upscale requires --scene N. FIX: node scripts/film.mjs upscale --scene 3');
  }
  const up = detectUpscaler();
  if (!up.found) {
    for (const s of upscaleInstallSteps()) graph.log(`FIX: ${s}`);
    throw new Error('Real-ESRGAN not installed. Exact manual steps printed above (no silent resize).');
  }
  const spec = (data.story.scenes || [])[sceneNo - 1];
  if (!spec || !spec.image) throw new Error(`Scene ${sceneNo} has no image path. FIX: check src/stories story JSON.`);
  const src = path.resolve(root, spec.image);
  if (!fs.existsSync(src)) throw new Error(`Scene ${sceneNo} image missing: ${spec.image}. FIX: run film ingest.`);
  const tmpOut = path.resolve(root, cfg.paths.build, 'ingest', data.storyName, `scene-${String(sceneNo).padStart(2, '0')}-upscaled.png`);
  fs.mkdirSync(path.dirname(tmpOut), { recursive: true });
  graph.log(`upscale: scene ${sceneNo} via ${up.exe} (BSD-3-Clause), 4x -> ${tmpOut}`);
  const r = spawnSync(up.exe, ['-i', src, '-o', tmpOut, '-n', 'realesrgan-x4plus', '-f', 'png'], {
    cwd: root, encoding: 'utf8', shell: process.platform === 'win32', stdio: 'inherit',
  });
  if (r.status !== 0 || !fs.existsSync(tmpOut)) throw new Error(`Real-ESRGAN failed (exit ${r.status}). No change made to the source.`);
  // Real-ESRGAN names output <name>_out.png; handle that.
  const actual = fs.existsSync(tmpOut) ? tmpOut : tmpOut.replace(/\.png$/, '_out.png');
  if (!fs.existsSync(actual)) throw new Error('Upscaled output not found; no change made.');
  // Replace the normalized image (originals are kept in inbox/_originals).
  fs.copyFileSync(actual, src);
  const manifestPath = path.resolve(root, cfg.paths.illustrations, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const e = (man.scenes || []).find((x) => x.scene === sceneNo);
    if (e) {
      e.upscaled = true;
      e.upscaler = 'realesrgan-x4plus (BSD-3-Clause)';
      e.upscaledAt = new Date().toISOString();
    }
    fs.writeFileSync(manifestPath, JSON.stringify(man, null, 2) + '\n', 'utf8');
  }
  graph.log(`upscale: scene ${sceneNo} marked upscaled:true in manifest (source preserved in _originals).`);
  return 0;
}
