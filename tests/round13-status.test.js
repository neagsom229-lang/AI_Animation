/** Round 13 item 7: generated STATUS.md + one-action `film next`. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildStatusReport, writeStatusFile, readManifest, readMetrics, lastRenderByScene,
  duplicateSceneMap, groupList, sceneNo,
} from '../scripts/lib/film-report.mjs';
import { nextActionFor, parseArgs as nextArgs, collectContext } from '../scripts/film-next.mjs';

const TMP = path.join('build', 'cache', 'round13-status');

function makeRoot() {
  fs.rmSync(TMP, { recursive: true, force: true });
  const ill = path.join(TMP, 'assets-src', 'illustrations');
  const metricsDir = path.join(TMP, 'out', 'review');
  const cache = path.join(TMP, 'out', '.illustrated-scene-cache');
  fs.mkdirSync(ill, { recursive: true });
  fs.mkdirSync(metricsDir, { recursive: true });
  fs.mkdirSync(cache, { recursive: true });
  const cfg = JSON.parse(fs.readFileSync('film.config.json', 'utf8'));
  cfg.paths.illustrations = 'assets-src/illustrations';
  fs.writeFileSync(path.join(TMP, 'film.config.json'), JSON.stringify(cfg, null, 2));
  const scenes = [1, 2, 3].map((n) => ({
    scene: n,
    file: `assets-src/illustrations/scene-0${n}.png`,
    sourceWidth: 1024, sourceHeight: 559, sourceAspect: 1.8318,
    upscaled: true, reviewed: n === 1, matchesNarration: n === 1, watermarkCheck: n === 1,
    licenseTermsUrl: 'https://tool.example/licence', prompt: 'see docs/prompts',
  }));
  fs.writeFileSync(path.join(ill, 'manifest.json'), JSON.stringify({ profile: 'draft', scenes }, null, 2));
  fs.writeFileSync(path.join(metricsDir, 'parallax-metrics.json'), JSON.stringify({
    scenes: [
      { scene: 'sc-01', depthSource: 'model', limitFactor: 0.93 },
      { scene: 'sc-02', depthSource: 'gradient', limitFactor: 0.6 },
      { scene: 'sc-03', depthSource: 'model', limitFactor: 0.78 },
    ],
  }, null, 2));
  fs.writeFileSync(path.join(cache, 'sc-01-abc123.mp4'), 'x');
  fs.writeFileSync(path.join(cache, 'sc-02-def456.mp4'), 'yy');
  const story = JSON.parse(fs.readFileSync('src/stories/khmer-empire.json', 'utf8'));
  story.scenes = story.scenes.slice(0, 3);
  return { root: TMP, cfg, story };
}

const fixedNow = new Date('2026-11-18T02:00:00.000Z');

test('sceneNo handles sc-NN / scene-N / bare numbers', () => {
  assert.equal(sceneNo('sc-07'), 7);
  assert.equal(sceneNo('scene-12'), 12);
  assert.equal(sceneNo(3), 3);
  assert.equal(sceneNo('n/a'), null);
});

test('readers merge manifest + metrics + last render without inventing values', () => {
  const { root, cfg } = makeRoot();
  assert.equal(readManifest(root, cfg).scenes.length, 3);
  assert.equal(readMetrics(root).get(2).depthSource, 'gradient');
  const renders = lastRenderByScene(root);
  assert.ok(renders.get(1).file.startsWith('sc-01-'));
  assert.equal(renders.get(3), undefined);
});

test('STATUS.md table: image, size, duplicate group, depth source, flags, limit, last render', () => {
  const { root, cfg, story } = makeRoot();
  const report = {
    duplicateGroups: [[{ scene: 1 }, { scene: 2 }]],
  };
  const model = buildStatusReport({ root, cfg, story, report, now: fixedNow });
  assert.equal(model.rows.length, 3);
  assert.equal(model.rows[0].image, 'scene-01.png');
  assert.equal(model.rows[0].sourceWidth, 1024);
  assert.equal(model.rows[0].duplicateGroup, 1);
  assert.equal(model.rows[0].duplicateSize, 2);
  assert.equal(model.rows[0].depthSource, 'model');
  assert.equal(model.rows[0].limitFactor, 0.93);
  assert.equal(model.rows[0].reviewed, true);
  assert.ok(model.rows[0].lastRender.startsWith('2026-11-18'));
  assert.equal(model.rows[2].depthSource, 'model');
  assert.equal(model.rows[2].lastRender, 'never');
  assert.equal(model.rows[2].duplicateGroup, null);
  assert.equal(model.counts.lowSource, 3);
  assert.equal(model.counts.reviewed, 1);

  const md = model.markdown;
  assert.ok(md.startsWith('# STATUS — '));
  assert.match(md, /Do not edit by hand/);
  assert.match(md, /Manifest profile: \*\*draft\*\*/);
  assert.match(md, /Release candidate: \*\*NO\*\*/);
  assert.match(md, /Parallax is \*\*2\.5D\*\*/);
  assert.match(md, /\| # \| image \| source \| dup \| depth \| rev \| match \| wm \| limit \| last render \|/);
  assert.match(md, /\| 1 \| `scene-01\.png` \| 1024x559 \| 1 \(2\) \| model \| yes \| yes \| yes \| 0\.93 \|/);
  assert.match(md, /duplicate groups: \*\*1\*\* \(1=2\)/);
  assert.match(md, /scenes with a cached render: \*\*2\*\* \/ 3/);
  assert.match(md, /node scripts\/film\.mjs next/);
});

test('writeStatusFile writes real STATUS.md at the requested path', () => {
  const { root, cfg, story } = makeRoot();
  const out = writeStatusFile({ root, cfg, story, file: 'out/STATUS.test.md', now: fixedNow });
  assert.equal(out.path, 'out/STATUS.test.md');
  const text = fs.readFileSync(path.join(TMP, 'out', 'STATUS.test.md'), 'utf8');
  assert.equal(text, out.markdown);
  assert.match(text, /Generated 2026-11-18T02:00:00\.000Z/);
});

test('duplicateSceneMap / groupList are compact and scene-number aware', () => {
  const groups = [[{ scene: 'sc-09' }, { scene: 'sc-10' }], [{ scene: 'sc-11' }, { scene: 'sc-12' }, { scene: 'sc-13' }]];
  const map = duplicateSceneMap(groups);
  assert.deepEqual(map.get(9), { group: 1, size: 2 });
  assert.equal(map.get(10).group, 1);
  assert.deepEqual(map.get(13), { group: 2, size: 3 });
  assert.equal(groupList(groups), '9=10; 11=12=13');
});

function gate(name, fix = '', detail = 'detail') {
  return { name, status: 'BLOCK', detail, fix };
}

test('film next: no blockers -> exactly one render action for the current profile', () => {
  const draft = nextActionFor([], { profile: 'draft' });
  assert.equal(draft.blockers, 0);
  assert.equal(draft.action, 'node scripts/film.mjs render');
  const final = nextActionFor([], { profile: 'final' });
  assert.equal(final.action, 'node scripts/film.mjs render --profile final');
});

test('film next: blocker count includes EVERY BLOCK, action comes from the first', () => {
  const gates = [gate('duplicates', 'REQUEUE'), gate('resolution'), gate('manual-review')];
  const r = nextActionFor(gates, { profile: 'final' });
  assert.equal(r.blockers, 3);
  assert.equal(r.gate, 'duplicates');
});

test('film next: each gate maps to its exact fix command', () => {
  const fix = 'Regenerate distinct images, then: node scripts/film.mjs ingest\n'
    + 'REQUEUE (regenerate only these 6):\n'
    + '  scene 10 -> save as assets-src/inbox/scene-10.png | target >= 1920x1080, 16:9 | prompt: docs/prompts/scene-10.txt\n';
  const cases = [
    [gate('environment'), 'node scripts/film.mjs setup'],
    [gate('ingest'), 'node scripts/film.mjs ingest'],
    [gate('duplicates', fix), 'regenerate scene 10 -> assets-src/inbox/scene-10.png'],
    [gate('resolution'), 'node scripts/film.mjs upscale --scene 4'],
    [gate('depth'), 'node scripts/film.mjs depth --depth gradient'],
    [gate('parallax-metrics'), 'node scripts/film.mjs depth --depth gradient'],
    [gate('draft-render'), 'node scripts/film.mjs render'],
  ];
  const context = { lowScenes: [4, 5] };
  for (const [g, expected] of cases) {
    const r = nextActionFor([g], { profile: 'final', context });
    assert.ok(r.action.includes(expected), `${g.name}: ${r.action}`);
  }
  const dupe = nextActionFor([gate('duplicates', fix)], { profile: 'final' });
  assert.match(dupe.action, /prompt: docs\/prompts\/scene-10\.txt/);
  assert.match(dupe.action, /then: node scripts\/film\.mjs ingest/);
});

test('film next: manual review never auto-fills — licence, prompt flags come first', () => {
  const g = gate('manual-review');
  assert.match(nextActionFor([g], { profile: 'final', context: { licenseMissing: true } }).action, /review --license-url/);
  assert.match(nextActionFor([g], { profile: 'final', context: { promptMissingScenes: [1] } }).action, /ingest --profile final/);
  const flags = nextActionFor([g], { profile: 'final', context: { unreviewedScenes: [7] } });
  assert.ok(flags.action.includes('review.html (scene 7)'));
  assert.match(flags.action, /review --scene 7 --matches-narration yes --watermark clear --reviewed yes/);
  assert.match(flags.why, /nothing is auto-filled/);
});

test('collectContext reads real low/review/depth/license state', () => {
  const { root, cfg, story } = makeRoot();
  const manifest = readManifest(root, cfg);
  const ctx = collectContext({ root, cfg, story, manifest });
  assert.deepEqual(ctx.lowScenes, [1, 2, 3]);
  assert.deepEqual(ctx.unreviewedScenes, [2, 3]);
  // Real film.config.json has an empty intake.licenseTermsUrl (never auto-filled).
  assert.equal(ctx.licenseMissing, true);
  assert.deepEqual(ctx.promptMissingScenes, []);
  assert.deepEqual(ctx.missingDepthScenes, [1, 2, 3], 'temp root has no depth maps');
});

test('film next CLI parses only its own flags', () => {
  assert.deepEqual(nextArgs([]), { story: null, profile: null });
  assert.deepEqual(nextArgs(['--profile', 'final']), { story: null, profile: 'final' });
  assert.deepEqual(nextArgs(['--story', 'src/stories/khmer-empire.json']), { story: 'src/stories/khmer-empire.json', profile: null });
  assert.throws(() => nextArgs(['--profile', 'release']), /must be draft or final/);
});

test('START_HERE.md gives the five plain commands and the safety rules', () => {
  const md = fs.readFileSync('START_HERE.md', 'utf8');
  for (const cmd of [
    'node scripts/film.mjs setup',
    'node scripts/film.mjs ingest',
    'node scripts/film.mjs depth',
    'node scripts/film.mjs next',
    'node scripts/film.mjs render',
  ]) assert.ok(md.includes(cmd), `missing command: ${cmd}`);
  assert.match(md, /DRAFT - NOT RELEASABLE/);
  assert.match(md, /2\.5D/);
  assert.match(md, /not true 3D/);
  assert.match(md, /no `--force`/);
  assert.match(md, /Nothing sets [\s\S]* automatically/);
});

test('real `film next` prints exactly one NEXT line with the blocker count', () => {
  const r = spawnSync(process.execPath, ['scripts/film.mjs', 'next', '--profile', 'draft'], { encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  assert.equal(r.status, 0, out.slice(-800));
  assert.equal(out.split('\n').filter((l) => l.startsWith('NEXT:')).length, 1);
  assert.match(out, /profile=draft/);
  assert.match(out, /^BLOCKERS: \d+/m);
  assert.match(out, /^NEXT: \S+/m);
});

test('real `film status` writes STATUS.md with all 18 scenes', () => {
  const r = spawnSync(process.execPath, ['scripts/film.mjs', 'status'], { encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  assert.equal(r.status, 0, out.slice(-800));
  assert.match(out, /wrote STATUS\.md \(18 scenes/);
  const md = fs.readFileSync('STATUS.md', 'utf8');
  assert.match(md, /Do not edit by hand/);
  assert.equal((md.match(/^\| \d+ \| `scene-\d+\.png`/gm) || []).length, 18);
  assert.match(md, /duplicate groups: \*\*3\*\*/);
});
