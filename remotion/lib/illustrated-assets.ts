/**
 * @fileoverview Pure asset-path mapping for the illustrated film.
 *
 * Story paths (assets-src/...) are staged into public/illustrated/... by
 * make.mjs before bundling, so staticFile() can serve them. The mapping here
 * is a pure string transform, unit-testable without the filesystem.
 * @module remotion/lib/illustrated-assets
 */

/** Map an `assets-src/...` story path to a public/-relative staticFile path. */
export function publicAssetPath(storyPath: string): string {
  if (typeof storyPath !== 'string' || !storyPath.trim()) return '';
  const normalised = storyPath.replace(/\\/g, '/').replace(/^\.?\//, '');
  if (normalised.startsWith('assets-src/')) return `illustrated/${normalised.slice('assets-src/'.length)}`;
  if (normalised.startsWith('public/')) return normalised.slice('public/'.length);
  return `illustrated/${normalised}`;
}

/** Depth path for an illustration (matches scripts/depth.py + manifest). */
export function depthPathFor(imagePath: string): string {
  if (!imagePath) return '';
  const dot = imagePath.lastIndexOf('.');
  return dot >= 0
    ? `${imagePath.slice(0, dot)}-depth${imagePath.slice(dot)}`
    : `${imagePath}-depth.png`;
}

export interface SceneAssetStatus {
  image: boolean;
  depth: boolean;
  clip: boolean;
}

/** Default status when none is supplied: assume everything missing. */
export function emptyStatus(): SceneAssetStatus {
  return { image: false, depth: false, clip: false };
}
