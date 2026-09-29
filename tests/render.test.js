/**
 * @fileoverview Unit tests for Canvas2D and Three.js renderers.
 */

'use strict';

import test from 'node:test';
import assert from 'node:assert';

// Polyfill window and document for headless Three.js tests
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: (tagName) => ({
      tagName: tagName.toUpperCase(),
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      getContext: () => ({
        canvas: {},
        getExtension: () => {},
        getParameter: () => {},
      })
    }),
    createElementNS: (ns, tagName) => globalThis.document.createElement(tagName)
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

import { Canvas2DRenderer } from '../src/render/canvas2d.js';
import { ThreeSceneManager } from '../src/render/three3d.js';

test('Canvas2DRenderer initializes and renders without error', () => {
  const canvas = {
    getContext: () => ({
      save: () => {},
      restore: () => {},
      translate: () => {},
      fillStyle: '',
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      fill: () => {},
      strokeStyle: '',
      lineWidth: 0,
      lineJoin: '',
      lineCap: '',
      arc: () => {},
      stroke: () => {},
      font: '',
      textAlign: '',
      fillText: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} })
    }),
    width: 800,
    height: 600
  };

  const renderer = new Canvas2DRenderer(canvas, { width: 800, height: 600 });
  assert.strictEqual(renderer.width, 800);
  assert.strictEqual(renderer.height, 600);

  renderer.render({
    backgroundPaper: '#fdfbf7',
    layers: [{ speed: 0.1, color: '#e8e1d5', type: 'hills' }],
    sprites: [{ x: 400, y: 300, scale: 1, label: 'Hero' }]
  }, 0);

  renderer.dispose();
  assert.strictEqual(renderer.particles.length, 0);
});

test('ThreeSceneManager initializes and disposes correctly', () => {
  const manager = new ThreeSceneManager(null, { width: 800, height: 600, quality: 'low' });
  assert.strictEqual(manager.width, 800);
  assert.strictEqual(manager.height, 600);

  const charGroup = manager.addProceduralCharacter('hero', { x: 0, y: 0, z: 0 });
  assert.ok(charGroup);

  const prop = manager.addProceduralProp('temple1', 'temple', { x: 5, y: 0, z: 0 });
  assert.ok(prop);

  manager.render();
  manager.dispose();
  assert.strictEqual(manager.proceduralObjects.length, 0);
});
