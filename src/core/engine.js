/**
 * @fileoverview Animation timeline scheduler, easing, tweening, keyframes, particle system, parallax, and subtitle effects.
 * @module src/core/engine
 */

'use strict';

// ---------- Easing Library ----------
export const Easing = {
  linear: t => t,
  easeIn: t => t ** 3,
  easeOut: t => 1 - (1 - t) ** 3,
  easeInOut: t => t < .5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2,
  easeInOutSine: t => (1 - Math.cos(Math.PI * t)) / 2,
  easeOutExpo: t => t >= 1 ? 1 : 1 - 2 ** (-10 * t),
  easeOutBack: (t, k = 1.70158) => { const u = t - 1; return 1 + (k + 1) * u ** 3 + k * u ** 2; }
};

/**
 * Evaluates keyframes at time t.
 * @param {number} t - current time
 * @param {Array<[number, number|number[], Function|string]>} frames - [[time, value, ease?], ...]
 * @param {Function} [defaultEase=Easing.easeInOut]
 * @returns {number|number[]} interpolated value
 */
export function keyframes(t, frames, defaultEase = Easing.easeInOut) {
  const val = f => f[1];
  if (t <= frames[0][0]) return val(frames[0]);
  const i = frames.findIndex((f, k) => k > 0 && t < f[0]);
  if (i < 0) return val(frames[frames.length - 1]);
  const a = frames[i - 1], b = frames[i];
  const e = typeof a[2] === 'function' ? a[2] : (typeof a[2] === 'string' && Easing[a[2]] ? Easing[a[2]] : defaultEase);
  const u = e(clamp((t - a[0]) / (b[0] - a[0]), 0, 1));
  const va = val(a), vb = val(b);
  if (Array.isArray(va)) {
    return va.map((v, k) => v + (vb[k] - v) * u);
  }
  return va + (vb - va) * u;
}

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

// ---------- Timeline Scheduler ----------
export class TimelineScheduler {
  /**
   * @param {Object} options
   * @param {Array} [options.scenes=[]]
   * @param {number} [options.fps=60]
   * @param {boolean} [options.loop=false]
   */
  constructor({ scenes = [], fps = 60, loop = false } = {}) {
    this.scenes = scenes;
    this.fps = fps;
    this.loop = loop;
    this.duration = scenes.reduce((acc, s) => acc + (s.dur || 0), 0);
    this.currentTime = 0;
    this.speed = 1.0;
    this.playing = false;
    this.listeners = new Set();
    this._rafId = null;
    this._lastTimestamp = null;
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this._lastTimestamp = performance.now();
    const tick = (now) => {
      if (!this.playing) return;
      const dt = (now - this._lastTimestamp) / 1000;
      this._lastTimestamp = now;
      this.seek(this.currentTime + dt * this.speed);
      if (this.currentTime >= this.duration) {
        if (this.loop) {
          this.seek(0);
        } else {
          this.pause();
          this.currentTime = this.duration;
        }
      }
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  seek(t) {
    this.currentTime = clamp(t, 0, this.duration);
    const sceneInfo = this.getSceneAt(this.currentTime);
    this.emit('timeupdate', { currentTime: this.currentTime, duration: this.duration, scene: sceneInfo });
  }

  setSpeed(spd) {
    this.speed = Math.max(0.1, spd);
  }

  getSceneAt(t) {
    let acc = 0;
    for (let i = 0; i < this.scenes.length; i++) {
      const s = this.scenes[i];
      const dur = s.dur || 0;
      if (t < acc + dur || i === this.scenes.length - 1) {
        return { index: i, scene: s, localTime: t - acc };
      }
      acc += dur;
    }
    return { index: 0, scene: this.scenes[0], localTime: 0 };
  }

  on(event, cb) {
    this.listeners.add({ event, cb });
  }

  off(event, cb) {
    for (const item of this.listeners) {
      if (item.event === event && item.cb === cb) {
        this.listeners.delete(item);
      }
    }
  }

  emit(event, data) {
    for (const item of this.listeners) {
      if (item.event === event) {
        item.cb(data);
      }
    }
  }
}

// ---------- Particle System ----------
export class ParticleSystem {
  constructor(maxParticles = 500) {
    this.maxParticles = maxParticles;
    this.particles = [];
  }

  emit(config) {
    const { x = 0, y = 0, vx = 0, vy = -1, life = 1, size = 3, color = '#fff' } = config;
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift();
    }
    this.particles.push({ x, y, vx, vy, life, maxLife: life, size, color });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(ctx) {
    ctx.save();
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------- Parallax Layers ----------
export class ParallaxLayerManager {
  constructor(width = 1920, height = 1080) {
    this.width = width;
    this.height = height;
    this.layers = [];
  }

  addLayer(renderFn, scrollFactor = 1) {
    this.layers.push({ renderFn, scrollFactor });
  }

  render(ctx, cameraX, cameraY) {
    for (const layer of this.layers) {
      ctx.save();
      ctx.translate(-cameraX * layer.scrollFactor, -cameraY * layer.scrollFactor);
      layer.renderFn(ctx, this.width, this.height);
      ctx.restore();
    }
  }
}

// ---------- Subtitle & Text Effects ----------
export function renderSubtitle(ctx, text, progress = 1, { x = 960, y = 980, size = 36, color = '#fff', font = 'Georgia, serif' } = {}) {
  if (!text || progress <= 0) return;
  ctx.save();
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 500, y - size - 10, 1000, size + 20);
  
  const charsCount = Math.floor(text.length * clamp(progress, 0, 1));
  const shown = text.slice(0, charsCount);
  
  ctx.fillStyle = color;
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 6;
  ctx.fillText(shown, x, y);
  ctx.restore();
}
