/**
 * @fileoverview Bundle reuse cache for the render CLIs.
 *
 * `bundle()` re-runs webpack/rspack and re-copies `public/` on every make
 * run — tens of seconds even when nothing changed. This helper records a
 * hash of the inputs that can affect the bundle (sources + static files +
 * toolchain manifests) in `out/.bundle-cache.json`; when the hash matches a
 * previously recorded bundle directory that still exists, the cached bundle
 * is reused instead of rebuilding.
 *
 * The hash keys on (relpath, size, mtimeMs) so re-downloading or touching a
 * public asset invalidates the cache — a stale bundle would ship stale
 * assets silently, which is worse than a slow build.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { bundle } from '@remotion/bundler';

const SCALAR_FILES = ['package.json', 'package-lock.json', 'remotion.config.ts'];
const TREE_DIRS = ['remotion', 'public'];

function hashTree(root, dir, parts) {
  const base = path.join(root, dir);
  if (!fs.existsSync(base)) return;
  const stack = [base];
  while (stack.length) {
    const dirPath = stack.pop();
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        const st = fs.statSync(full);
        parts.push(`${path.relative(root, full).replaceAll('\\', '/')}|${st.size}|${st.mtimeMs}`);
      }
    }
  }
}

/** Deterministic hash of everything that shapes the bundle. */
export function computeBundleHash(root) {
  const parts = [];
  for (const f of SCALAR_FILES) {
    const full = path.join(root, f);
    if (fs.existsSync(full)) {
      const st = fs.statSync(full);
      parts.push(`${f}|${st.size}|${st.mtimeMs}`);
    }
  }
  for (const dir of TREE_DIRS) hashTree(root, dir, parts);
  parts.sort();
  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex');
}

/**
 * Reuse the cached bundle when inputs are unchanged; otherwise rebuild and
 * remember the new directory. Returns { serveUrl, cached }.
 */
export async function getOrCreateBundle({ root, cacheFile, publicDir, entryPoint }) {
  const hash = computeBundleHash(root);
  let cachedDir = null;
  try {
    const manifest = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (manifest.hash === hash && manifest.bundleDir && fs.existsSync(manifest.bundleDir)) {
      cachedDir = manifest.bundleDir;
    }
  } catch {
    // No manifest or unreadable — fall through and rebuild.
  }

  if (cachedDir) {
    console.log(`[cache] Reusing bundle from previous run (${cachedDir})`);
    return { serveUrl: cachedDir, cached: true };
  }

  console.log('[cache] Bundle inputs changed — rebuilding…');
  const started = Date.now();
  const serveUrl = await bundle({
    entryPoint,
    publicDir,
  });
  fs.mkdirSync(path.resolve(cacheFile, '..'), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ hash, bundleDir: serveUrl }, null, 2));
  console.log(`[cache] Built in ${((Date.now() - started) / 1000).toFixed(1)}s → ${serveUrl}`);
  return { serveUrl, cached: false };
}
