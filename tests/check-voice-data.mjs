/**
 * @fileoverview Phase 1 voice-data contract checker.
 *
 * Validates every line of every scene against the Phase 1 envelope contract:
 *   - abs(len(env) - ceil(dur * 20)) <= 2   (envelope sampled at exactly 20 Hz)
 *   - unique(env) values > 10               (real speech, not flat/stale)
 *   - max(env) === 1                        (normalised per-line peak)
 *   - audio file exists (relative to the voice.json's directory)
 *   - dur > 0
 *
 * Usage (CLI):
 *   node tests/check-voice-data.mjs <path-to-voice.json>
 * Exit code 0 = all lines pass; exit code 1 = violations printed, no fallback.
 *
 * Programmatic use:
 *   import { checkVoiceContract } from './check-voice-data.mjs';
 *   checkVoiceContract(voiceData, baseDir) -> string[]  (empty = valid)
 */
import fs from 'fs';
import path from 'path';

export function checkVoiceContract(voiceData, baseDir) {
  const problems = [];
  if (!voiceData || !Array.isArray(voiceData.scenes)) {
    return ['voice data must be an object with a scenes array'];
  }
  for (const scene of voiceData.scenes) {
    for (const line of scene.lines || []) {
      const label = `${scene.id}/${line.file}`;

      if (!(line.dur > 0)) {
        problems.push(`${label}: dur must be > 0, got ${line.dur}`);
        continue;
      }

      const expectedLen = Math.ceil(line.dur * 20);
      const lenDelta = Math.abs((line.env || []).length - expectedLen);
      if (lenDelta > 2) {
        problems.push(
          `${label}: env length ${line.env.length} differs from ceil(dur*20)=${expectedLen} by ${lenDelta} (>2) — envelope is time-compressed/stretched`
        );
      }

      const uniqueVals = new Set(line.env).size;
      if (uniqueVals <= 10) {
        problems.push(`${label}: env has only ${uniqueVals} unique values (need > 10)`);
      }

      const maxVal = line.env.length ? Math.max(...line.env) : -1;
      if (maxVal !== 1) {
        problems.push(`${label}: env max is ${maxVal}, expected exactly 1 (peak normalisation)`);
      }

      const full = path.resolve(baseDir, line.file);
      if (!fs.existsSync(full)) {
        problems.push(`${label}: audio file missing: ${full}`);
      }
    }
  }
  return problems;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node tests/check-voice-data.mjs <path-to-voice.json>');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`[FAIL] voice data file not found: ${file}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(file, 'utf-8');
  const voiceData = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const problems = checkVoiceContract(voiceData, path.dirname(path.resolve(file)));
  if (problems.length > 0) {
    console.error(`[FAIL] ${problems.length} violation(s) in ${file}:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const lineCount = voiceData.scenes.reduce((n, s) => n + (s.lines || []).length, 0);
  console.log(`[PASS] ${lineCount} line(s) in ${file} satisfy the Phase 1 voice contract.`);
}

if (process.argv[1] && path.basename(process.argv[1]) === 'check-voice-data.mjs') {
  main();
}
