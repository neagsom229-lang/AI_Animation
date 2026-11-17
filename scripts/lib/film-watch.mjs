/**
 * @fileoverview Watch-mode pure helpers. Debounce gate + change classification.
 * The actual fs.watch loop lives in film.mjs; these are unit-testable.
 * @module scripts/lib/film-watch
 */

/** Pure debounce decision: fire when (now - last) >= delayMs. */
export function debounceReady(lastEventMs, nowMs, delayMs = 500) {
  if (!Number.isFinite(lastEventMs)) return true;
  return (nowMs - lastEventMs) >= delayMs;
}

/** Classify a changed path into affected scene numbers (pure). */
export function affectedScenes(changedPath, mapObject = {}, total = 18) {
  const base = String(changedPath).split(/[\\/]/).pop();
  const m = base.match(/\d+/);
  if (m) {
    const n = Number(m[0]);
    return n >= 1 && n <= total ? [n] : [];
  }
  // No digits: check map.json both directions.
  const out = [];
  for (const [k, v] of Object.entries(mapObject || {})) {
    const kn = String(k).match(/\d+/); const vn = String(v).match(/\d+/);
    if ((k.toLowerCase() === base.toLowerCase() && vn) || (String(v).toLowerCase() === base.toLowerCase() && kn)) {
      const n = Number((vn || kn)[0]);
      if (n >= 1 && n <= total) out.push(n);
    }
  }
  return [...new Set(out)];
}
