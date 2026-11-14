/**
 * @fileoverview Phase C: scene and look.
 *
 * Enforces, as CI-runnable checks:
 *  1. `buildWorld()` is deterministic (two calls → deep-equal) and throws on
 *     an unknown world name (no silent substitute set).
 *  2. Every placement references a model file that exists on disk.
 *  3. Seeded scatter obeys its keep-out rules (temple / pond / sight
 *     corridor / orbit lane) and stays inside the radius band.
 *  4. No scattered prop rises above the 5.5-unit ceiling (measured from the
 *     real GLB bounding boxes × the placed scale).
 *  5. The Phase C sources stay inside the determinism contract: no
 *     Math.random, no wall-clock, no useFrame.
 *  6. StoryFilm really wires shadows, ACES tone mapping, SceneWorld and the
 *     vignette.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SET_DRESSING = path.join(ROOT, 'remotion', 'lib', 'set-dressing.ts');
const SCENE_WORLD = path.join(ROOT, 'remotion', 'compositions', 'SceneWorld.tsx');
const STORY_FILM = path.join(ROOT, 'remotion', 'compositions', 'StoryFilm.tsx');

// ---------------------------------------------------------------------------
// GLB bounding-box helper (POSITION accessors of every primitive).
// ---------------------------------------------------------------------------

function glbHeight(relPath) {
  const buf = readFileSync(path.join(ROOT, relPath));
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `${relPath} is not a GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const acc = json.accessors[prim.attributes.POSITION];
      if (!acc || !acc.min) continue;
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], acc.min[i]);
        max[i] = Math.max(max[i], acc.max[i]);
      }
    }
  }
  assert.ok(Number.isFinite(min[1]), `${relPath}: no POSITION accessors`);
  return { height: max[1] - min[1], baseY: min[1] };
}

// ---------------------------------------------------------------------------
// 1. Determinism + loud failure.
// ---------------------------------------------------------------------------

test('buildWorld is deterministic (deep-equal across calls)', async () => {
  const { buildWorld } = await import('../remotion/lib/set-dressing.ts');
  const a = buildWorld('khmer-temple');
  const b = buildWorld('khmer-temple');
  assert.deepEqual(a, b, 'two builds of the same world must be identical');
  assert.ok(a.props.length > 50, `expected a dressed set, got ${a.props.length} props`);
});

test('buildWorld throws loudly on an unknown world', async () => {
  const { buildWorld, KNOWN_WORLDS } = await import('../remotion/lib/set-dressing.ts');
  assert.throws(() => buildWorld('narnia'), /Unknown world "narnia"/);
  assert.ok(KNOWN_WORLDS.includes('khmer-temple'));
});

test('scatterProps is deterministic for a fixed seed', async () => {
  const { scatterProps, SCATTER_SEED, SCATTER_COUNT } = await import(
    '../remotion/lib/set-dressing.ts'
  );
  const a = scatterProps(SCATTER_SEED, SCATTER_COUNT);
  const b = scatterProps(SCATTER_SEED, SCATTER_COUNT);
  assert.deepEqual(a, b);
  assert.equal(a.length, SCATTER_COUNT);
  // A different seed must actually produce a different forest.
  const c = scatterProps(SCATTER_SEED + 1, SCATTER_COUNT);
  assert.notDeepEqual(a, c, 'seed must influence the layout');
});

// ---------------------------------------------------------------------------
// 2. Every referenced model exists.
// ---------------------------------------------------------------------------

test('every placed model exists on disk', async () => {
  const { buildWorld } = await import('../remotion/lib/set-dressing.ts');
  const { props } = buildWorld('khmer-temple');
  const seen = new Set();
  for (const p of props) {
    if (seen.has(p.model)) continue;
    seen.add(p.model);
    const abs = path.join(ROOT, p.model);
    assert.ok(existsSync(abs), `placement references missing model ${p.model}`);
  }
  assert.ok(seen.size >= 15, `expected many distinct props, saw ${seen.size}`);
});

// ---------------------------------------------------------------------------
// 3. Scatter keep-out rules.
// ---------------------------------------------------------------------------

test('scatter placements respect the keep-out rules and radius band', async () => {
  const { scatterProps, isScatterExcluded, SCATTER_RADIUS } = await import(
    '../remotion/lib/set-dressing.ts'
  );
  for (const p of scatterProps()) {
    const [x, , z] = p.position;
    assert.equal(
      isScatterExcluded(x, z),
      false,
      `scatter prop at [${x.toFixed(2)}, ${z.toFixed(2)}] sits in a keep-out zone`
    );
    const r = Math.hypot(x, z);
    assert.ok(
      r >= SCATTER_RADIUS[0] - 1e-9 && r <= SCATTER_RADIUS[1] + 1e-9,
      `scatter radius ${r.toFixed(2)} outside [${SCATTER_RADIUS[0]}, ${SCATTER_RADIUS[1]}]`
    );
    assert.equal(p.group, 'scatter');
    assert.ok(p.scale > 0 && p.scale <= 4, `implausible scale ${p.scale}`);
  }
});

test('no scatter prop rises above the orbit camera (5.5 units)', async () => {
  const { scatterProps } = await import('../remotion/lib/set-dressing.ts');
  const cache = new Map();
  for (const p of scatterProps()) {
    if (!cache.has(p.model)) cache.set(p.model, glbHeight(p.model));
    const { height, baseY } = cache.get(p.model);
    const worldHeight = baseY * p.scale + height * p.scale;
    assert.ok(
      worldHeight < 5.5,
      `${path.basename(p.model)} reaches ${worldHeight.toFixed(2)} units ` +
        `(height ${height.toFixed(2)} × scale ${p.scale.toFixed(2)}) — limit 5.5`
    );
  }
});

// ---------------------------------------------------------------------------
// 4. Temple / pond geometry sanity.
// ---------------------------------------------------------------------------

test('the temple sits inside its platform footprint', async () => {
  const { buildWorld } = await import('../remotion/lib/set-dressing.ts');
  const layout = buildWorld('khmer-temple');
  const [px, , pz] = layout.platform.position;
  const [sx, , sz] = layout.platform.size;
  const halfX = sx / 2;
  const halfZ = sz / 2;

  const templeProps = layout.props.filter((p) => p.group === 'temple');
  assert.ok(templeProps.length >= 30, 'temple group looks too small');

  for (const p of templeProps) {
    const [x, y, z] = p.position;
    // Props ON the platform (y > 0) must be within its footprint; ground-level
    // ruins and the stair are allowed to sit just outside it.
    if (y > 0.5) {
      assert.ok(
        x >= px - halfX - 0.01 && x <= px + halfX + 0.01,
        `elevated prop at x=${x} falls off the platform`
      );
      assert.ok(
        z >= pz - halfZ - 0.01 && z <= pz + halfZ + 0.01,
        `elevated prop at z=${z} falls off the platform`
      );
    }
    assert.ok(y >= -0.1, `prop at y=${y} is buried below ground`);
    assert.ok(y <= 10, `prop at y=${y} is floating implausibly high`);
  }

  // Platform top must meet the stair top (stairs are 0.7 × scale 2 = 1.4).
  assert.equal(layout.platform.position[1] * 2, layout.platform.size[1],
    'platform centre y must equal half its height (base flush with the ground)');
  const stair = templeProps.find((p) => p.model.includes('stairs-stone'));
  assert.ok(stair, 'stair missing');
  assert.ok(Math.abs(stair.position[2] - (pz + halfZ - 0.8)) < 0.01,
    'stair must touch the front face of the platform');
});

test('pond pieces stay inside the pond apron', async () => {
  const { buildWorld } = await import('../remotion/lib/set-dressing.ts');
  const layout = buildWorld('khmer-temple');
  const pond = layout.props.filter((p) => p.group === 'pond');
  assert.ok(pond.length >= 15, 'pond group looks too small');
  for (const p of pond) {
    const [x, , z] = p.position;
    assert.ok(x >= -17 && x <= -5, `pond prop x=${x} outside the pond apron`);
    assert.ok(z >= -2 && z <= 8, `pond prop z=${z} outside the pond apron`);
    assert.ok(p.position[1] < 1, 'pond piece is floating');
    if (p.model.includes('riverTile')) {
      // Regression guard: at y = -0.05 the tile field sat entirely below the
      // ground plane and the pond rendered as a bare blue rectangle.
      assert.ok(
        p.position[1] >= 0,
        `river tile buried at y=${p.position[1]} — it would be hidden by the ground`
      );
    }
  }
  // The water plane overlaps the pond tiles.
  const [wx, , wz] = layout.water.position;
  assert.ok(wx >= -13 && wx <= -9, 'water plane must sit over the tiles');
  assert.ok(wz >= 0 && wz <= 4, 'water plane must sit over the tiles');
});

// ---------------------------------------------------------------------------
// 5. Determinism contract for the Phase C sources.
// ---------------------------------------------------------------------------

function stripComments(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? code.length : end + 2;
      out += ' ';
      continue;
    }
    if (ch === '/' && next === '/') {
      const end = code.indexOf('\n', i + 2);
      i = end === -1 ? code.length : end;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

test('set-dressing and SceneWorld stay inside the determinism contract', () => {
  for (const file of [SET_DRESSING, SCENE_WORLD]) {
    const src = stripComments(readFileSync(file, 'utf8'));
    const name = path.basename(file);
    assert.ok(!/Math\.random\s*\(/.test(src), `${name}: unseeded Math.random() is banned`);
    assert.ok(!/THREE\.Clock/.test(src), `${name}: THREE.Clock is wall-clock — banned`);
    assert.ok(!/performance\.now|Date\.now/.test(src), `${name}: wall-clock timers are banned`);
    assert.ok(!/\buseFrame\s*\(/.test(src), `${name}: useFrame is banned`);
    assert.ok(!/mixer\.update\s*\(/.test(src), `${name}: clock-driven mixer.update is banned`);
  }
  // SceneWorld must drive everything through the seeded layout.
  const sceneWorld = stripComments(readFileSync(SCENE_WORLD, 'utf8'));
  assert.ok(/buildWorld\(/.test(sceneWorld), 'SceneWorld must lay out via buildWorld()');
  assert.ok(/useLoader\(/.test(sceneWorld), 'SceneWorld must suspense-load its assets');
});

// ---------------------------------------------------------------------------
// 6. StoryFilm wiring: shadows, ACES, SceneWorld, vignette.
// ---------------------------------------------------------------------------

test('StoryFilm enables shadows, ACES tone mapping, SceneWorld and a vignette', () => {
  const src = stripComments(readFileSync(STORY_FILM, 'utf8'));
  assert.ok(/<SceneWorld\b/.test(src), 'StoryFilm must render SceneWorld');
  assert.ok(/world=\{story\.world\}/.test(src), 'the story world must reach SceneRenderer');
  assert.ok(/shadows/.test(src), 'ThreeCanvas must enable shadow mapping');
  assert.ok(
    /ACESFilmicToneMapping/.test(src),
    'ThreeCanvas must use ACES filmic tone mapping'
  );
  assert.ok(/SRGBColorSpace/.test(src), 'output color space must be sRGB');
  assert.ok(/radial-gradient/.test(src), 'a CSS vignette overlay must be present');
});

test('every world mesh carries a layout-derived renderOrder (draw-order determinism)', () => {
  const src = stripComments(readFileSync(SCENE_WORLD, 'utf8'));
  // three sorts opaque meshes by renderOrder BEFORE material.id, and material
  // ids depend on GLTF parse order — without this, coincident faces flip
  // between runs (observed as ~10 drifting edge pixels).
  assert.ok(
    /mesh\.renderOrder = renderOrder/.test(src),
    'PropInstance must stamp each prop with its layout index'
  );
  assert.ok(
    /renderOrder=\{index \+ 2\}/.test(src),
    'each placement must get a UNIQUE renderOrder (index + 2)'
  );
  assert.ok(
    /renderOrder=\{1\}/.test(src),
    'the platform must have an explicit renderOrder'
  );
  assert.ok(
    /renderOrder=\{0\}/.test(src),
    'the ground must have an explicit renderOrder'
  );
  // The character rig must participate in the same ordering scheme.
  const glb = stripComments(readFileSync(
    path.join(ROOT, 'remotion', 'compositions', 'GlbCharacter.tsx'),
    'utf8'
  ));
  assert.ok(/mesh\.renderOrder = 1/.test(glb), 'GlbCharacter meshes need a fixed renderOrder');
});

test('the shipped khmer-temple story declares a known world', async () => {
  const story = JSON.parse(
    readFileSync(path.join(ROOT, 'src', 'stories', 'khmer-temple.json'), 'utf8')
  );
  const { KNOWN_WORLDS, buildWorld } = await import('../remotion/lib/set-dressing.ts');
  assert.ok(
    KNOWN_WORLDS.includes(story.world),
    `story.world "${story.world}" is not in KNOWN_WORLDS`
  );
  const layout = buildWorld(story.world);
  assert.equal(layout.name, story.world);
  // The world's assets are on disk and small enough to ship.
  for (const p of layout.props) {
    const size = statSync(path.join(ROOT, p.model)).size;
    assert.ok(size < 5 * 1024 * 1024, `${p.model} exceeds the 5 MB budget`);
  }
});
