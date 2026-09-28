/**
 * @fileoverview Three.js 3D scene manager, camera rigs, mood lighting presets, procedural props, and 2D/3D blending.
 * @module src/render/three3d
 */

'use strict';

import * as THREE from 'https://esm.sh/three@0.160.0';

export const MoodLightingPresets = {
  'warm dawn': { ambient: 0xffe8d6, directional: 0xffb347, fog: 0xffe8d6, intensity: 1.2 },
  'gold dust': { ambient: 0xfff0c2, directional: 0xffc857, fog: 0xfff0c2, intensity: 1.4 },
  'night storm': { ambient: 0x1a233a, directional: 0x4a6fa5, fog: 0x0b132b, intensity: 0.6 },
  'paper': { ambient: 0xfffcf5, directional: 0xffffff, fog: 0xfffcf5, intensity: 1.0 },
  'green': { ambient: 0xd8f3dc, directional: 0x52b788, fog: 0xd8f3dc, intensity: 1.1 }
};

export class ThreeSceneManager {
  /**
   * @param {HTMLElement} container 
   * @param {Object} [options]
   */
  constructor(container, { width = 1920, height = 1080 } = {}) {
    this.container = container;
    this.width = width;
    this.height = height;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 5, 15);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if (container) {
      container.appendChild(this.renderer.domElement);
    }

    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.dirLight.position.set(10, 20, 10);
    this.dirLight.castShadow = true;
    this.scene.add(this.dirLight);

    this.proceduralObjects = [];
  }

  setMood(moodName) {
    const preset = MoodLightingPresets[moodName] || MoodLightingPresets['warm dawn'];
    this.ambientLight.color.setHex(preset.ambient);
    this.ambientLight.intensity = preset.intensity;
    this.dirLight.color.setHex(preset.directional);
    this.scene.background = new THREE.Color(preset.fog);
    this.scene.fog = new THREE.FogExp2(preset.fog, 0.015);
  }

  applyCameraRig(rigType, tau) {
    switch (rigType) {
      case 'dolly':
        this.camera.position.z = 15 - tau * 3;
        this.camera.position.y = 5 + Math.sin(tau * 0.5) * 0.5;
        this.camera.lookAt(0, 2, 0);
        break;
      case 'orbit':
        const angle = tau * 0.8;
        this.camera.position.x = Math.sin(angle) * 12;
        this.camera.position.z = Math.cos(angle) * 12;
        this.camera.position.y = 6;
        this.camera.lookAt(0, 2, 0);
        break;
      case 'crane':
        this.camera.position.y = 2 + tau * 4;
        this.camera.position.z = 12 - tau * 2;
        this.camera.lookAt(0, 1, 0);
        break;
      case 'handheld':
        const shakeX = (Math.sin(tau * 20) * 0.1) + (Math.cos(tau * 35) * 0.05);
        const shakeY = (Math.cos(tau * 25) * 0.1) + (Math.sin(tau * 40) * 0.05);
        this.camera.position.set(shakeX, 5 + shakeY, 12);
        this.camera.lookAt(0, 2, 0);
        break;
      default:
        this.camera.position.set(0, 5, 15);
        this.camera.lookAt(0, 2, 0);
    }
  }

  addProceduralCharacter(id, { x = 0, y = 0, z = 0, color = 0x4a90e2 } = {}) {
    const group = new THREE.Group();
    
    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.6, 0.4, 2, 16);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 1;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 2.4;
    head.castShadow = true;
    group.add(head);

    group.position.set(x, y, z);
    this.scene.add(group);
    this.proceduralObjects.push({ id, group });
    return group;
  }

  addProceduralProp(id, type = 'temple', { x = 0, y = 0, z = 0 } = {}) {
    let geo, mat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.8 });
    if (type === 'pillar') {
      geo = new THREE.CylinderGeometry(0.8, 0.9, 4, 16);
    } else {
      geo = new THREE.BoxGeometry(3, 3, 3);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 1.5, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.proceduralObjects.push({ id, group: mesh });
    return mesh;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const obj of this.proceduralObjects) {
      this.scene.remove(obj.group);
    }
    this.proceduralObjects = [];
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
