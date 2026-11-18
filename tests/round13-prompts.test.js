/** Round 13 item 6: paste-ready prompt files with era-correct style lines. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildPromptFiles, writePromptFiles, parseSceneTitles, PROMPT_DIR } from '../scripts/generate-prompts.mjs';

const story = JSON.parse(fs.readFileSync('src/stories/khmer-empire.json', 'utf8'));
const doc = fs.readFileSync('docs/ILLUSTRATION_PROMPTS.md', 'utf8');

function read(n) {
  return fs.readFileSync(path.join(PROMPT_DIR, `scene-${String(n).padStart(2, '0')}.txt`), 'utf8');
}

function promptLine(text) {
  return text.split('\n').find((l) => l.startsWith('Detailed painterly historical illustration'));
}

test('all 18 prompt files exist and are up to date', () => {
  const files = fs.readdirSync(PROMPT_DIR).filter((f) => /^scene-\d{2}\.txt$/.test(f)).sort();
  assert.equal(files.length, 18);
  const { stale } = writePromptFiles({ check: true });
  assert.deepEqual(stale, [], 'prompt files must match the story + master doc');
});

test('each file has filename, size, English + Khmer narration and a prompt', () => {
  for (let n = 1; n <= 18; n += 1) {
    const t = read(n);
    const name = `scene-${String(n).padStart(2, '0')}.png`;
    assert.ok(t.includes(`FILENAME: assets-src/illustrations/${name}`), `scene ${n} filename`);
    assert.ok(t.includes('SIZE: 1920x1080 (16:9)'), `scene ${n} size`);
    assert.ok(t.includes('at least 1600 px wide'), `scene ${n} source minimum`);
    assert.match(t, /NARRATION \(en\): \S/);
    assert.ok(/[\u1780-\u17FF]/.test(t), `scene ${n} Khmer narration`);
    const p = promptLine(t);
    assert.ok(p, `scene ${n} prompt`);
    assert.ok(p.includes('consistent art style'), `scene ${n} style line`);
    assert.ok(p.includes('no text, no modern objects'), `scene ${n} no text/modern objects`);
  }
});

test('era-correct style line: no 12th century for 802-889 or 1296+ scenes', () => {
  const expected = {
    2: /9th-century Angkorian Khmer Empire \(802\)/,
    3: /9th-century Angkorian Khmer Empire/,
    4: /late 9th-century Angkorian Khmer Empire \(889\)/,
    15: /late 13th-century Angkorian Khmer Empire \(1296\)/,
    16: /14th–15th-century Angkorian Khmer Empire/,
    17: /15th-century Angkorian Khmer Empire \(1431\)/,
    18: /present-day Angkor, Cambodia/,
  };
  for (const [n, re] of Object.entries(expected)) {
    assert.match(promptLine(read(Number(n))), re, `scene ${n} era`);
  }
  for (const n of [2, 3, 4, 15, 16, 17, 18]) {
    assert.ok(!/12th-century/.test(promptLine(read(n))), `scene ${n} must not claim the 12th century`);
  }
  // Scenes that do fit keep the 12th century (Angkor Wat construction etc.).
  assert.match(promptLine(read(7)), /12th-century Angkorian Khmer Empire \(1113–1150\)/);
  assert.match(promptLine(read(12)), /12th-century Angkorian Khmer Empire/);
});

test('master prompt doc carries the same corrected era lines', () => {
  assert.ok(!/scene-15[^\n]*\nDetailed[^\n]*12th-century/.test(doc));
  assert.ok(doc.includes('late 13th-century Angkorian Khmer Empire (1296)'));
  assert.ok(doc.includes('9th-century Angkorian Khmer Empire (802)'));
  assert.ok(doc.includes('15th-century Angkorian Khmer Empire (1431)'));
  assert.ok(doc.includes('present-day Angkor, Cambodia'));
  assert.ok(!/post-12th-century/.test(doc), 'stale anachronism note must be fixed');
});

test('titles come from the doc headings, not invented', () => {
  const titles = parseSceneTitles(doc);
  assert.equal(titles['01'], 'Dawn over Angkor Wat');
  assert.match(titles['15'], /Zhou Daguan in the market \(1296\)/);
  const files = buildPromptFiles({ story, promptsDoc: doc });
  assert.equal(files.length, 18);
  assert.ok(files[0].text.startsWith('# scene-01 — Dawn over Angkor Wat'));
});

test('missing prompt sections fail loudly', () => {
  assert.throws(() => buildPromptFiles({ story, promptsDoc: doc.replace(/## scene-18[\s\S]*$/, '') }),
    /No prompt for scene\(s\) 18/);
});
