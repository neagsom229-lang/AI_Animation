/**
 * @fileoverview Procedural temple set, ported from
 * `src/render/three3d.js` `ThreeSceneManager.addProceduralProp()` ('temple'
 * box and 'pillar' cylinders). Architecture is static; all motion belongs to
 * the camera, characters and atmosphere layers.
 * @module remotion/compositions/TempleSet
 */

import React from 'react';

const SANDSTONE = '#d4a373';

/** Corner pillar layout (x, z), matching the legacy procedural prop placement. */
const PILLARS: ReadonlyArray<readonly [number, number]> = [
  [-6, -6],
  [6, -6],
  [-6, 6],
  [6, 6]
];

export const TempleSet: React.FC = () => {
  return (
    <>
      {/* Central temple block (legacy addProceduralProp 'temple'). */}
      <mesh position={[0, 3, -3]} castShadow receiveShadow>
        <boxGeometry args={[3, 3, 3]} />
        <meshStandardMaterial color={SANDSTONE} roughness={0.8} />
      </mesh>

      {PILLARS.map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 2, z]} castShadow receiveShadow>
          {/* Legacy 'pillar': CylinderGeometry(0.8, 0.9, 4, 16). */}
          <cylinderGeometry args={[0.8, 0.9, 4, 16]} />
          <meshStandardMaterial color={SANDSTONE} roughness={0.8} />
        </mesh>
      ))}
    </>
  );
};
