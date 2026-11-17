/**
 * @fileoverview The "relief" rendering style: carved sandstone.
 *
 * Round 5: the shipped characters are modern anime VRMs and do not belong
 * in a 12th-century Khmer story. There are no era-correct assets in the
 * repo, so the library can mark a character `style: "relief"` — the model's
 * own materials are then replaced by the carved-sandstone material of the
 * Angkor Wat bas-reliefs. A mismatched figure then reads as part of the
 * monument's visual language instead of clashing with it.
 *
 * The material is the same one the temple's walls use: a desaturated
 * sandstone albedo with the procedural carved-relief bump map, slightly
 * darker and rougher than the wall so a figure still separates from the
 * masonry behind it.
 *
 * The canvas helpers live here so the set and the characters cannot drift
 * apart. Everything is procedural — no external assets, no licences.
 * @module remotion/lib/relief
 */

import React from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { staticFile } from 'remotion';

/** Make a 2D canvas texture (browser only — called inside the renderer). */
export const makeReliefCanvas = (
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void
): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('relief: 2D canvas unavailable');
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

/**
 * The carved gallery-wall relief band, used as a bump map.
 *
 * Stacked registers separated by a heavy cornice, with corbelled niches
 * and pilasters between them.
 */
export function makeBasReliefBump(): THREE.CanvasTexture {
  return makeReliefCanvas(512, 128, (ctx) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 128);
    // Heavy cornice at the top and bottom of the band.
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(0, 0, 512, 10);
    ctx.fillStyle = '#3c3c3c';
    ctx.fillRect(0, 10, 512, 5);
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(0, 113, 512, 10);
    ctx.fillStyle = '#3c3c3c';
    ctx.fillRect(0, 108, 512, 5);
    // Two carved registers separated by a mid string course.
    ctx.fillStyle = '#5e5e5e';
    ctx.fillRect(0, 60, 512, 4);
    // Corbelled niches: an arch head over a recessed panel.
    for (let x = 32; x < 512; x += 96) {
      for (const top of [18, 68]) {
        ctx.fillStyle = '#3f3f3f';
        ctx.fillRect(x, top + 14, 56, 30);
        ctx.fillStyle = '#d0d0d0';
        ctx.beginPath();
        ctx.moveTo(x - 4, top + 16);
        ctx.lineTo(x + 28, top - 4);
        ctx.lineTo(x + 60, top + 16);
        ctx.lineTo(x + 60, top + 20);
        ctx.lineTo(x + 28, top + 1);
        ctx.lineTo(x - 4, top + 20);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#9a9a9a';
        ctx.beginPath();
        ctx.ellipse(x + 28, top + 30, 9, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(x + 22, top + 40, 12, 4);
      }
    }
    // Pilasters between the niches.
    for (let x = 0; x < 512; x += 96) {
      ctx.fillStyle = '#b4b4b4';
      ctx.fillRect(x, 15, 12, 93);
      ctx.fillStyle = '#4c4c4c';
      ctx.fillRect(x + 12, 15, 4, 93);
    }
  });
}

/** Options for the relief material. */
export interface ReliefMaterialOptions {
  /** Base colour (desaturated stone). */
  color?: string;
  /** How strong the carved relief reads (bump scale). */
  bumpScale?: number;
  /** Texture repeats of the sandstone albedo. */
  repeat?: [number, number];
  /** Roughness (1 = dry stone). */
  roughness?: number;
}

/**
 * The carved-sandstone material.
 *
 * Uses the same Poly Haven sandstone the temple uses, plus the procedural
 * relief bump, with the saturation pulled down so a figure reads as stone
 * rather than as a person wearing stone-coloured clothes.
 */
export const useReliefMaterial = (options: ReliefMaterialOptions = {}) => {
  const {
    color = '#9a9184',
    bumpScale = 1.6,
    repeat = [3, 3],
    roughness = 0.96
  } = options;

  const [diff, nor, rough] = useLoader(THREE.TextureLoader, [
    staticFile('textures/old_sandstone_02_diff_1k.jpg'),
    staticFile('textures/old_sandstone_02_nor_gl_1k.jpg'),
    staticFile('textures/old_sandstone_02_rough_1k.jpg')
  ]);

  const bump = React.useMemo(() => makeBasReliefBump(), []);

  React.useMemo(() => {
    for (const tex of [diff, nor, rough]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat[0], repeat[1]);
      tex.anisotropy = 4;
    }
    diff.colorSpace = THREE.SRGBColorSpace;
  }, [diff, nor, rough, repeat]);

  return React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: diff,
        normalMap: nor,
        roughnessMap: rough,
        bumpMap: bump,
        bumpScale,
        color,
        roughness,
        metalness: 0,
        vertexColors: false
      }),
    [diff, nor, rough, bump, bumpScale, color, roughness]
  );
};

/**
 * Override every mesh material of an object with the relief material.
 *
 * Mutates the object in place; call it once, right after the model is
 * loaded. Materials are shared afterwards, so the whole figure costs ONE
 * extra draw-call batch instead of one per original material.
 *
 * @param {THREE.Object3D} root the model root
 * @param {THREE.Material} material the material to apply
 * @returns {number} how many meshes were re-materialed
 */
export function applyReliefStyle(root: THREE.Object3D, material: THREE.Material): number {
  let count = 0;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    count += 1;
  });
  return count;
}

/**
 * Reduce the saturation of a colour (for the "slight desaturation" the
 * brief asks for on the relief style).
 *
 * @param {string} hex colour
 * @param {number} amount 0 = unchanged, 1 = fully grey
 * @returns {string} the desaturated colour
 */
export function desaturate(hex: string, amount = 0.25): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s * (1 - amount), hsl.l);
  return `#${c.getHexString()}`;
}
