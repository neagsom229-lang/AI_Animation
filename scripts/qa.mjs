#!/usr/bin/env node
/**
 * @fileoverview Single QA command: all release gates with real command output.
 *
 * `npm run qa` runs, in order:
 *   1. tsc --noEmit
 *   2. npm test
 *   3. verify:determinism StoryFilm
 *   4. verify:determinism IllustratedFilm
 *   5. illustrated asset manifest (--allow-missing, informational)
 *   6. license coverage (npm license table + CREDITS cells)
 *   7. duration gate (>= 120 s from voice data if present)
 *   8. loudness/silence helpers sanity (pure)
 *   9. caption safe-area (SUBTITLE_LAYOUT constants)
 *
 * Every step prints PASS/FAIL and the real command; any FAIL -> exit 1.
 * @module scripts/qa
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const results = [];

function report(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}${detail ? `: ${detail}` : ''}`);
}

function run(cmd, args, opts = {}) {
  console.log(`  $ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT, encoding: 'utf8',
    shell: process.platform === 'win32', // npm/npx are .cmd shims on Windows
    maxBuffer: 64 * 1024 * 1024, ...opts,
  });
  return { ok: r.status === 0, status: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

export async function main() {
  // 1. tsc
  let r = run('npx', ['tsc', '--noEmit']);
  report('TypeScript (tsc --noEmit)', r.ok, r.ok ? '0 errors' : r.out.split('\n').filter((l) => l.includes('error TS')).slice(0, 3).join(' | '));

  // 2. tests
  r = run('npm', ['test']);
  const m = r.out.match(/# pass (\d+)/); const f = r.out.match(/# fail (\d+)/);
  report('Unit tests (npm test)', r.ok, `pass ${m ? m[1] : '?'}, fail ${f ? f[1] : '?'}`);

  // 3 & 4. determinism (software GL reference)
  for (const comp of ['StoryFilm', 'IllustratedFilm']) {
    r = run('node', ['scripts/verify-determinism.mjs', '--composition', comp]);
    report(`Determinism: ${comp}`, r.ok, r.ok ? 'byte+frame identical' : (r.out.match(/FAIL[^\n]*/) || ['see output'])[0]);
  }

  // 5. manifest (informational — assets may be absent; use --allow-missing)
  r = run('node', ['scripts/illustrated-manifest.mjs', '--allow-missing', '--json']);
  if (r.ok) {
    try {
      const j = JSON.parse(r.out.slice(r.out.indexOf('{'), r.out.lastIndexOf('}') + 1));
      report('Illustrated asset manifest (informational)', true, `scenes ${j.scenes.length}, missing ${j.missing} (allow-missing)`);
    } catch { report('Illustrated asset manifest', false, 'could not parse manifest JSON'); }
  } else report('Illustrated asset manifest', false, r.out.slice(0, 120));

  // 6. license coverage: CREDITS permissive cells + THIRD_PARTY_LICENSES exists
  const credits = fs.readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
  const cells = [...credits.matchAll(/\|\s*License\s*\|([^|]+)\|/g)].map((x) => x[1]);
  const permissive = /CC0|public domain|open font|SIL OFL|\bMIT\b|Apache/i;
  const licenseOk = cells.length >= 8 && cells.every((c) => permissive.test(c)) &&
    fs.existsSync(path.join(ROOT, 'THIRD_PARTY_LICENSES.md'));
  report('License coverage', licenseOk, `${cells.length} CREDITS license cells + THIRD_PARTY_LICENSES.md`);

  // 7. duration gate
  const voicePath = path.join(ROOT, 'public/voice-khmer-empire.json');
  if (fs.existsSync(voicePath)) {
    const { buildIllustratedTimeline, meetsMinimumDuration } = await import('../remotion/lib/illustrated-timing.ts');
    const voice = JSON.parse(fs.readFileSync(voicePath, 'utf8'));
    const tl = buildIllustratedTimeline(voice, 30);
    const secs = tl.durationInFrames / 30;
    report('Duration >= 120 s', meetsMinimumDuration(tl, 120, 30), `${secs.toFixed(1)} s`);
  } else {
    report('Duration >= 120 s', false, 'voice data missing — run make-illustrated first');
  }

  // 8. loudness helpers sanity
  const loud = await import('./lib/loudness.mjs');
  const loudOk = loud.parseLoudnessI('{"input_i":"-16.0"}') === -16 &&
    loud.hasLongSilence(loud.parseSilences('silence_start: 1\nsilence_end: 3 | silence_duration: 2'));
  report('Loudness/silence helpers', loudOk, 'parse + long-gap flag');

  // 9. caption safe area
  const sub = await import('../remotion/lib/subtitles.ts');
  const safe = sub.SUBTITLE_LAYOUT.bottomPx >= 1080 * 0.05 && sub.SUBTITLE_LAYOUT.maxWidthPercent <= 80;
  report('Caption safe area', safe, `bottom ${sub.SUBTITLE_LAYOUT.bottomPx}px, width ${sub.SUBTITLE_LAYOUT.maxWidthPercent}%`);

  const failed = results.filter((x) => !x.ok);
  console.log('');
  if (failed.length > 0) {
    console.error(`QA FAILED: ${failed.length} gate(s): ${failed.map((x) => x.name).join(', ')}`);
    return 1;
  }
  console.log(`QA PASSED: ${results.length} gates.`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('QA crashed:', e); process.exit(1); });
