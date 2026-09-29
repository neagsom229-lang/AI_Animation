/**
 * @fileoverview Canvas 2D Pencil Sketch Renderer with layered scenes, sprites, parallax, particles, weather, vignette, screen shake, and transitions.
 * @module src/render/canvas2d
 */

'use strict';

export class Canvas2DRenderer {
  /**
   * @param {HTMLCanvasElement} canvas 
   * @param {Object} [options]
   */
  constructor(canvas, { width = 1920, height = 1080 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    this.particles = [];
    this.screenShakeTime = 0;
    this.screenShakeIntensity = 0;
    this.transitionEffect = null; // { type: 'fade'|'wipe'|'dissolve', progress: 0 }
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  triggerScreenShake(intensity = 10, duration = 0.5) {
    this.screenShakeIntensity = intensity;
    this.screenShakeTime = duration;
  }

  setTransition(type, progress) {
    this.transitionEffect = { type, progress };
  }

  addParticle(particle) {
    this.particles.push(particle);
  }

  render(sceneData, time = 0) {
    const ctx = this.ctx;
    ctx.save();

    // Screen Shake Offset
    let shakeX = 0, shakeY = 0;
    if (this.screenShakeTime > 0) {
      shakeX = (Math.random() - 0.5) * this.screenShakeIntensity;
      shakeY = (Math.random() - 0.5) * this.screenShakeIntensity;
      this.screenShakeTime -= 0.016;
    }
    ctx.translate(shakeX, shakeY);

    // Clear background (Warm drawing paper color)
    ctx.fillStyle = sceneData.backgroundPaper || '#fdfbf7';
    ctx.fillRect(0, 0, this.width, this.height);

    // Parallax background layers
    const layers = sceneData.layers || [
      { speed: 0.1, color: '#e8e1d5', type: 'hills' },
      { speed: 0.3, color: '#d4c7b0', type: 'trees' },
      { speed: 0.6, color: '#bfa88c', type: 'buildings' }
    ];

    for (const layer of layers) {
      const offsetX = (time * layer.speed * 50) % this.width;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(-offsetX, this.height);
      
      if (layer.type === 'hills') {
        for (let x = -offsetX; x <= this.width + offsetX; x += 200) {
          const h = Math.sin(x * 0.002 + time * 0.5) * 150 + 400;
          ctx.lineTo(x, this.height - h);
        }
      } else {
        // Geometric structure / temple skyline
        for (let x = -offsetX; x <= this.width + offsetX; x += 150) {
          const h = 200 + ((x * 13) % 180);
          ctx.rect(x, this.height - h, 120, h);
        }
      }
      ctx.lineTo(this.width + offsetX, this.height);
      ctx.closePath();
      ctx.fill();

      // Pencil hatching texture
      ctx.strokeStyle = 'rgba(60, 50, 40, 0.15)';
      ctx.lineWidth = 1;
      for (let hx = -offsetX; hx < this.width; hx += 15) {
        ctx.beginPath();
        ctx.moveTo(hx, 0);
        ctx.lineTo(hx - 50, this.height);
        ctx.stroke();
      }
    }

    // Draw characters / sprites
    const sprites = sceneData.sprites || [
      { x: this.width * 0.5, y: this.height * 0.75, scale: 1, label: sceneData.characterLabel || 'Figure' }
    ];

    for (const sprite of sprites) {
      this.drawPencilSprite(ctx, sprite, time);
    }

    // Draw Weather (rain / dust / petals)
    if (sceneData.weather === 'rain' || sceneData.weather === 'storm') {
      ctx.strokeStyle = 'rgba(100, 120, 140, 0.6)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 150; i++) {
        const rx = (i * 137 + time * 300) % this.width;
        const ry = (i * 97 + time * 800) % this.height;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 5, ry + 25);
        ctx.stroke();
      }
    }

    // Vignette & Soft lighting overlay
    const grad = ctx.createRadialGradient(
      this.width / 2, this.height / 2, this.width * 0.3,
      this.width / 2, this.height / 2, this.width * 0.75
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(40, 30, 20, 0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Transitions
    if (this.transitionEffect) {
      const { type, progress } = this.transitionEffect;
      if (type === 'fade') {
        ctx.fillStyle = `rgba(18, 18, 18, ${progress})`;
        ctx.fillRect(0, 0, this.width, this.height);
      } else if (type === 'wipe') {
        ctx.fillStyle = '#121212';
        ctx.fillRect(0, 0, this.width * progress, this.height);
      } else if (type === 'dissolve') {
        ctx.fillStyle = `rgba(255, 255, 255, ${progress * 0.5})`;
        ctx.fillRect(0, 0, this.width, this.height);
      }
    }

    ctx.restore();
  }

  drawPencilSprite(ctx, sprite, time) {
    ctx.save();
    ctx.translate(sprite.x, sprite.y);
    const bob = Math.sin(time * 6) * 4;

    // Graphite outline
    ctx.strokeStyle = '#2b2621';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Head
    ctx.beginPath();
    ctx.arc(0, -90 + bob, 25, 0, Math.PI * 2);
    ctx.fillStyle = '#f7f3ee';
    ctx.fill();
    ctx.stroke();

    // Body / Robe
    ctx.beginPath();
    ctx.moveTo(-20, -65 + bob);
    ctx.lineTo(20, -65 + bob);
    ctx.lineTo(35, 30 + bob);
    ctx.lineTo(-35, 30 + bob);
    ctx.closePath();
    ctx.fillStyle = '#e6dbc9';
    ctx.fill();
    ctx.stroke();

    // Hand-drawn hatching inside body
    ctx.strokeStyle = 'rgba(43, 38, 33, 0.25)';
    ctx.lineWidth = 1;
    for (let hy = -55; hy < 20; hy += 8) {
      ctx.beginPath();
      ctx.moveTo(-15, hy + bob);
      ctx.lineTo(15, hy + 5 + bob);
      ctx.stroke();
    }

    // Label / Name
    if (sprite.label) {
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillStyle = '#2b2621';
      ctx.textAlign = 'center';
      ctx.fillText(sprite.label, 0, 60 + bob);
    }

    ctx.restore();
  }

  dispose() {
    this.particles = [];
  }
}
