/** Round 13 item 3: draft vs final profiles, aspect notes, grouped findings. */
'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PROFILE_DRAFT, PROFILE_FINAL, resolveProfile, profileForCommand,
  readManifestProfile, manifestCanSatisfyFinal, classifyAspect,
  compactRanges, summarizeFindings, buildGateFindings, duplicateFindings,
} from '../scripts/lib/film-profile.mjs';
import { parseArgs as filmArgs } from '../scripts/film.mjs';

test('profiles: draft is the default for ingest/depth/render/draft only', () => {
  assert.equal(PROFILE_DRAFT, 'draft');
  assert.equal(PROFILE_FINAL, 'final');
  assert.equal(profileForCommand('ingest'), 'draft');
  assert.equal(profileForCommand('depth'), 'draft');
  assert.equal(profileForCommand('render'), 'draft');
  assert.equal(profileForCommand('draft'), 'draft');
  assert.equal(profileForCommand('doctor'), null);
  assert.equal(profileForCommand('status'), null);
  assert.equal(profileForCommand('ingest', 'final'), 'final');
  assert.equal(profileForCommand('render', 'final'), 'final');
});

test('resolveProfile rejects anything except draft/final', () => {
  assert.equal(resolveProfile(undefined), 'draft');
  assert.equal(resolveProfile('FINAL'), 'final');
  assert.throws(() => resolveProfile('release'), /must be draft or final/);
});

test('--profile parsing: valid values, invalid values, and --draft conflict', () => {
  assert.equal(filmArgs(['ingest', '--profile', 'final']).profile, 'final');
  assert.equal(filmArgs(['ingest', '--profile=draft']).profile, 'draft');
  assert.equal(filmArgs(['ingest']).profile, null, 'no flag means command default');
  assert.throws(() => filmArgs(['ingest', '--profile', 'prod']), /must be draft or final/);
  assert.throws(() => filmArgs(['render', '--profile', 'final', '--draft']), /conflicts with --profile final/);
});

test('a draft-profile manifest can never satisfy final', () => {
  assert.equal(manifestCanSatisfyFinal(null), false);
  assert.equal(manifestCanSatisfyFinal({}), false, 'missing profile is legacy = draft');
  assert.equal(manifestCanSatisfyFinal({ profile: 'draft' }), false);
  assert.equal(manifestCanSatisfyFinal({ factory: { profile: 'draft' } }), false);
  assert.equal(manifestCanSatisfyFinal({ profile: 'final' }), true);
  assert.equal(manifestCanSatisfyFinal({ factory: { profile: 'final' } }), true);
});

test('readManifestProfile reads the recorded profile, factory field first', () => {
  const root = 'build/cache/round13-profile';
  const dir = `${root}/assets-src/illustrations`;
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cfg = { paths: { illustrations: 'assets-src/illustrations' } };
  assert.equal(readManifestProfile(root, cfg), null, 'missing manifest -> null');
  fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify({ profile: 'final' }));
  assert.equal(readManifestProfile(root, cfg), 'final');
  fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify({ profile: 'draft', factory: { profile: 'final' } }));
  assert.equal(readManifestProfile(root, cfg), 'final', 'factory.profile wins');
  fs.rmSync(root, { recursive: true, force: true });
});

test('aspect gate: <=2% ok, 2-5% note, >5% warning with crop percent', () => {
  const exact = classifyAspect(1920, 1080);
  assert.equal(exact.level, 'ok');
  assert.equal(exact.deviationPercent, 0);
  const near = classifyAspect(1920, 1060);
  assert.equal(near.level, 'ok');
  const note = classifyAspect(1024, 559); // 2.95% off
  assert.equal(note.level, 'note');
  assert.ok(note.cropPercent > 0);
  const warn = classifyAspect(1000, 1000); // far off
  assert.equal(warn.level, 'warn');
  assert.ok(warn.deviationPercent > 5);
  assert.ok(warn.cropPercent > 0);
});

test('compactRanges: contiguous scene runs collapse', () => {
  assert.equal(compactRanges([1, 2, 3, 5, 6]), '1-3,5-6');
  assert.equal(compactRanges([7]), '7');
  assert.equal(compactRanges([3, 1, 2, 2]), '1-3');
  assert.equal(compactRanges([]), '');
});

test('summarizeFindings groups repeated messages into ONE line', () => {
  const findings = [1, 2, 3, 4, 5].map((scene) => ({
    kind: 'source', scene, value: 'source 1024 px (< 1600)',
  }));
  const lines = summarizeFindings(findings);
  assert.equal(lines.length, 1, 'five identical messages must collapse');
  assert.match(lines[0], /^5 scenes: source 1024 px \(< 1600\)\s+scenes 1-5$/);
  const verbose = summarizeFindings(findings, { verbose: true });
  assert.equal(verbose.length, 5, '--verbose lists every scene');
  assert.ok(verbose[0].includes('scene 1:'));
  assert.deepEqual(summarizeFindings([]), []);
});

test('buildGateFindings flags source, aspect, and license per scene', () => {
  const sources = [
    { scene: 1, sourceWidth: 1024, sourceHeight: 559 },
    { scene: 2, sourceWidth: 2048, sourceHeight: 1152 },
  ];
  const noLicense = buildGateFindings({ sources, licenseUrl: '', minSourceWidth: 1600 });
  const kinds = new Set(noLicense.map((f) => f.kind));
  assert.ok(kinds.has('source'));
  assert.ok(kinds.has('aspect'));
  assert.ok(kinds.has('license'));
  assert.ok(noLicense.every((f) => f.scene === 1 || f.scene === 2));
  const licensed = buildGateFindings({ sources, licenseUrl: 'https://x', minSourceWidth: 1600 });
  assert.ok(!licensed.some((f) => f.kind === 'license'));
  assert.ok(!licensed.some((f) => f.kind === 'source' && f.scene === 2));
  assert.ok(!licensed.some((f) => f.kind === 'aspect' && f.scene === 2));
});

test('duplicateFindings names the group and every member scene', () => {
  const f = duplicateFindings([[{ scene: 9 }, { scene: 10 }], [{ scene: 11 }, { scene: 12 }, { scene: 13 }]]);
  assert.equal(f.length, 5);
  assert.ok(f[0].value.includes('duplicate group 1 (2 scenes)'));
  assert.ok(f[2].value.includes('duplicate group 2 (3 scenes)'));
  assert.deepEqual(f.map((x) => x.scene), [9, 10, 11, 12, 13]);
});

test('ingest records the profile and final ingest has no silent force path', () => {
  const src = fs.readFileSync('scripts/lib/film-ingest.mjs', 'utf8');
  assert.ok(src.includes('man.profile = profile'));
  assert.ok(src.includes('FINAL ingest blocked (no --force, no exceptions)'));
  assert.ok(!/force\s*\)\s*\{\s*\/\/\s*provisional/i.test(src));
  assert.ok(src.includes('buildGateFindings'));
  assert.ok(src.includes('summarizeFindings'));
});

test('final render requires a final-profile manifest; draft relaxes gates', () => {
  const src = fs.readFileSync('scripts/make-illustrated.mjs', 'utf8');
  assert.ok(src.includes('manifestCanSatisfyFinal(im)'));
  assert.ok(src.includes('A draft ingest can never satisfy a final render'));
  assert.ok(src.includes("if (!args.allowMissing && !args.draft)"), 'draft must relax the intake gates');
  assert.ok(src.includes('-DRAFT-NOT-RELEASABLE'), 'draft output must be labelled');
});

test('draft filename is labelled NOT RELEASABLE in both pipelines', () => {
  const ill = fs.readFileSync('scripts/make-illustrated.mjs', 'utf8');
  assert.ok(ill.includes("args.draft ? '-DRAFT-NOT-RELEASABLE' : ''"));
  const make = fs.readFileSync('scripts/make.mjs', 'utf8');
  assert.ok(make.includes("args.draft ? '-DRAFT-NOT-RELEASABLE.mp4' : '.mp4'"));
});
