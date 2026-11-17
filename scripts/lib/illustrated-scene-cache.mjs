/**
 * @fileoverview Content hashing for illustrated scene caching.
 *
 * A scene cache key includes everything that can change its pixels:
 * image bytes + depth bytes + that scene's voice (text + dur + envelope) +
 * the code version. Pure Node, deterministic.
 * @module scripts/lib/illustrated-scene-cache
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Bump when the IllustratedFilm renderer changes. */
export const ILLUSTRATED_CODE_VERSION = 'illustrated-v1';

/** SHA-256 of a file's bytes (empty string when missing). */
export function fileHash(file) {
  if (!file || !fs.existsSync(file)) return '';
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Hash one illustrated scene. `image`/`depth` are repo paths; `voiceScene` is
 * the matching voiceData scene. Returns a 16-char hex digest.
 */
export function illustratedSceneHash({ image, depth, voiceScene, codeVersion = ILLUSTRATED_CODE_VERSION, extra = '' }) {
  const payload = JSON.stringify({
    codeVersion,
    image: fileHash(image),
    depth: fileHash(depth),
    voice: voiceScene || {},
    extra,
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}
