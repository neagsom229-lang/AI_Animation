/**
 * @fileoverview CLI: shrink a VRM/GLB by downscaling its PNG textures while
 * preserving the VRM extension (see scripts/lib/vrm-shrink.mjs for why
 * gltf-transform cannot do this).
 *
 * Usage:
 *   node scripts/shrink-vrm.mjs <input> <output> [maxTextureSize]
 *
 * After writing, the output is re-parsed and (for VRM inputs) the license
 * meta, blendshape groups and humanoid bone list are compared against the
 * input — any loss fails the run with a non-zero exit code.
 *
 * @module scripts/shrink-vrm
 */

import fs from 'node:fs';
import { parseGlb, shrinkGlb } from './lib/vrm-shrink.mjs';

/** Extract the VRM extension payload from a parsed GLB JSON, or null. */
function vrmExtension(json) {
  return (json.extensions && (json.extensions.VRM || json.extensions.VRM0)) || null;
}

function main(argv) {
  const [input, output, maxSizeArg] = argv;
  if (!input || !output) {
    console.error('usage: node scripts/shrink-vrm.mjs <input> <output> [maxTextureSize]');
    return 2;
  }
  const maxTextureSize = maxSizeArg ? Number(maxSizeArg) : 1024;
  if (!Number.isInteger(maxTextureSize) || maxTextureSize < 1) {
    console.error(`invalid maxTextureSize: ${maxSizeArg}`);
    return 2;
  }

  const inputBytes = fs.readFileSync(input);
  const { json: inputJson } = parseGlb(inputBytes);
  const inputVrm = vrmExtension(inputJson);

  const { output: outputBytes, stats } = shrinkGlb(inputBytes, { maxTextureSize });

  // Verify the output before it can be committed anywhere.
  const { json: outputJson } = parseGlb(outputBytes);
  const outputVrm = vrmExtension(outputJson);
  if (Boolean(inputVrm) !== Boolean(outputVrm)) {
    console.error(
      `FAIL: VRM extension ${inputVrm ? 'LOST' : 'unexpectedly appeared'} while shrinking ${input}`
    );
    return 1;
  }
  if (inputVrm) {
    const inGroups = inputVrm.blendShapeMaster?.blendShapeGroups?.length ?? 0;
    const outGroups = outputVrm.blendShapeMaster?.blendShapeGroups?.length ?? 0;
    // VRM 0.x stores the rig at humanoid.humanBones (a name->node map or a
    // list depending on exporter); count whichever shape is present.
    const countBones = (vrm) => {
      const bones = vrm.humanoid?.humanBones ?? vrm.human?.boneList ?? [];
      return Array.isArray(bones) ? bones.length : Object.keys(bones).length;
    };
    const inBones = countBones(inputVrm);
    const outBones = countBones(outputVrm);
    const inLicense = inputVrm.meta?.licenseName;
    const outLicense = outputVrm.meta?.licenseName;
    if (inGroups !== outGroups || inBones !== outBones || inLicense !== outLicense) {
      console.error(
        `FAIL: VRM data changed — blendshapes ${inGroups}->${outGroups}, ` +
          `bones ${inBones}->${outBones}, license ${inLicense}->${outLicense}`
      );
      return 1;
    }
    console.log(
      `VRM preserved: license=${outLicense} blendshapes=${outGroups} bones=${outBones}`
    );
  }

  fs.writeFileSync(output, outputBytes);
  const pct = ((1 - outputBytes.length / inputBytes.length) * 100).toFixed(1);
  console.log(
    `${input} (${(inputBytes.length / 1048576).toFixed(2)} MB) -> ` +
      `${output} (${(outputBytes.length / 1048576).toFixed(2)} MB, -${pct}%)`
  );
  console.log(
    `textures: ${stats.images} images, ${stats.resized} resized to <=${maxTextureSize}px, ` +
      `${stats.keptSmall} already small, ${stats.keptUnsupported} kept (unsupported format), ` +
      `${stats.keptExternal} external, ${stats.keptShared} shared with vertex data`
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));
