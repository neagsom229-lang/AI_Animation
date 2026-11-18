/**
 * @fileoverview Bundled Remotion ffmpeg/ffprobe resolution.
 *
 * `npx remotion ffprobe` costs ~3 s of Node startup per call. The same binaries
 * ship inside node_modules/@remotion/compositor-<platform>/, so use them
 * directly when present and fall back to `npx remotion` otherwise.
 * @module scripts/lib/media-bin
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Resolve the bundled ffprobe/ffmpeg binary (null when not installed). */
export function bundledBinary(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  try {
    const base = path.resolve(process.cwd(), 'node_modules', '@remotion');
    for (const dir of fs.readdirSync(base)) {
      if (!dir.startsWith('compositor-')) continue;
      const candidate = path.join(base, dir, exe);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* fall through */ }
  return null;
}

/** Command vector for a media tool: bundled binary first, `npx remotion` fallback. */
export function mediaCommand(name) {
  const bundled = bundledBinary(name);
  if (bundled) return { cmd: bundled, prefix: [], shell: false, bundled: true };
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return { cmd: npx, prefix: ['remotion', name], shell: process.platform === 'win32', bundled: false };
}

/** Run the media tool, never throw (returns {ok, out}). */
export function runMedia(name, args) {
  const { cmd, prefix, shell } = mediaCommand(name);
  try {
    const out = execFileSync(cmd, [...prefix, ...args], {
      cwd: process.cwd(), encoding: 'utf8', shell,
      maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || e.message || ''}` };
  }
}
