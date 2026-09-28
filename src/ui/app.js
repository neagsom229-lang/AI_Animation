/**
 * @fileoverview Modern UI/UX application controller, story prompt panel, timeline scrubber, theme toggle, JSON export/import, and MediaRecorder.
 * @module src/ui/app
 */

'use strict';

import { generateStory } from '../core/story.js';
import { TimelineScheduler } from '../core/engine.js';
import { ThreeSceneManager } from '../render/three3d.js';
import { AudioManager, NarrationManager } from '../audio/audio.js';

export class AnimationStudioApp {
  /**
   * @param {HTMLElement} rootElement 
   */
  constructor(rootElement) {
    this.root = rootElement;
    this.story = null;
    this.scheduler = null;
    this.threeManager = null;
    this.audioManager = new AudioManager();
    this.narrationManager = new NarrationManager();
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isDarkMode = true;

    this.renderLayout();
    this.bindEvents();
    this.loadDefaultStory();
  }

  renderLayout() {
    this.root.innerHTML = `
      <div class="studio-container ${this.isDarkMode ? 'dark' : 'light'}">
        <header class="studio-header">
          <h1>Kuanimation Studio</h1>
          <div class="header-controls">
            <button id="theme-toggle" class="btn">Toggle Theme</button>
            <button id="fullscreen-btn" class="btn">Fullscreen</button>
          </div>
        </header>

        <div class="studio-main">
          <aside class="studio-sidebar">
            <section class="panel">
              <h3>Story Prompt</h3>
              <div class="form-group">
                <label>Genre:</label>
                <select id="genre-select" class="input">
                  <option value="historical">Historical (Angkor)</option>
                  <option value="science">Science (Sunflower)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Theme / Prompt:</label>
                <textarea id="theme-input" class="input" rows="3">Rise of water management and great temples</textarea>
              </div>
              <div class="form-group">
                <label>Language:</label>
                <select id="lang-select" class="input">
                  <option value="en">English</option>
                  <option value="km">Khmer (ភាសាខ្មែរ)</option>
                </select>
              </div>
              <button id="generate-btn" class="btn primary">Generate Story</button>
            </section>

            <section class="panel">
              <h3>Project IO</h3>
              <button id="export-json" class="btn">Export Story JSON</button>
              <input type="file" id="import-json" accept=".json" style="display:none">
              <button id="import-btn" class="btn">Import Story JSON</button>
              <button id="record-btn" class="btn danger">Record WebM Video</button>
            </section>
          </aside>

          <section class="studio-viewport">
            <div id="viewport-container" class="viewport-box">
              <canvas id="canvas-2d" width="1920" height="1080"></canvas>
              <div id="canvas-3d-container"></div>
            </div>

            <div class="timeline-bar">
              <button id="play-btn" class="btn">Play</button>
              <input id="scrub-range" type="range" min="0" max="100" value="0" step="0.1" class="scrubber">
              <span id="time-display">0.00s / 0.00s</span>
              <select id="speed-select" class="input" style="width: 80px;">
                <option value="0.5">0.5x</option>
                <option value="1" selected>1.0x</option>
                <option value="2">2.0x</option>
              </select>
            </div>
          </section>
        </div>
      </div>
      <style>
        .studio-container { display: flex; flex-direction: column; height: 100vh; font-family: system-ui, sans-serif; background: #121212; color: #e0e0e0; }
        .studio-container.light { background: #f5f5f5; color: #212121; }
        .studio-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; background: #1e1e1e; border-bottom: 1px solid #333; }
        .studio-container.light .studio-header { background: #ffffff; border-bottom: 1px solid #ddd; }
        .studio-main { display: flex; flex: 1; overflow: hidden; }
        .studio-sidebar { width: 320px; padding: 16px; background: #181818; border-right: 1px solid #333; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
        .studio-container.light .studio-sidebar { background: #fafafa; border-right: 1px solid #ddd; }
        .panel { background: #222; padding: 12px; border-radius: 8px; border: 1px solid #333; display: flex; flex-direction: column; gap: 8px; }
        .studio-container.light .panel { background: #fff; border: 1px solid #ddd; }
        .form-group { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
        .input { padding: 8px; border-radius: 4px; border: 1px solid #444; background: #2a2a2a; color: #fff; }
        .studio-container.light .input { background: #f9f9f9; color: #333; border: 1px solid #ccc; }
        .btn { padding: 8px 16px; border-radius: 4px; border: none; background: #333; color: #fff; cursor: pointer; font-weight: 600; }
        .btn:hover { background: #444; }
        .btn.primary { background: #3b82f6; }
        .btn.primary:hover { background: #2563eb; }
        .btn.danger { background: #ef4444; }
        .btn.danger:hover { background: #dc2626; }
        .studio-container.light .btn { background: #e0e0e0; color: #333; }
        .studio-container.light .btn.primary { background: #3b82f6; color: #fff; }
        .studio-viewport { flex: 1; display: flex; flex-direction: column; padding: 16px; gap: 12px; align-items: center; justify-content: center; }
        .viewport-box { position: relative; width: 100%; max-width: 1280px; aspect-ratio: 16/9; background: #000; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        #canvas-2d, #canvas-3d-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        #canvas-3d-container { pointer-events: none; }
        .timeline-bar { display: flex; align-items: center; gap: 12px; width: 100%; max-width: 1280px; background: #1e1e1e; padding: 12px; border-radius: 8px; }
        .studio-container.light .timeline-bar { background: #fff; border: 1px solid #ddd; }
        .scrubber { flex: 1; }
      </style>
    `;
  }

  bindEvents() {
    this.root.querySelector('#theme-toggle').onclick = () => {
      this.isDarkMode = !this.isDarkMode;
      this.root.querySelector('.studio-container').className = `studio-container ${this.isDarkMode ? 'dark' : 'light'}`;
    };

    this.root.querySelector('#fullscreen-btn').onclick = () => {
      const box = this.root.querySelector('#viewport-container');
      if (!document.fullscreenElement) box.requestFullscreen();
      else document.exitFullscreen();
    };

    this.root.querySelector('#generate-btn').onclick = async () => {
      const genre = this.root.querySelector('#genre-select').value;
      const theme = this.root.querySelector('#theme-input').value;
      const language = this.root.querySelector('#lang-select').value;
      
      this.story = await generateStory({ genre, theme, language });
      this.initScheduler();
      alert(`Story generated: "${this.story.title}" with ${this.story.scenes.length} scenes.`);
    };

    this.root.querySelector('#export-json').onclick = () => {
      if (!this.story) return alert('No story loaded.');
      const blob = new Blob([JSON.stringify(this.story, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.story.title.toLowerCase().replace(/\s+/g, '-')}.json`;
      a.click();
    };

    const fileInput = this.root.querySelector('#import-json');
    this.root.querySelector('#import-btn').onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          this.story = JSON.parse(evt.target.result);
          this.initScheduler();
          alert(`Successfully imported "${this.story.title}".`);
        } catch (err) {
          alert(`Invalid JSON: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };

    const playBtn = this.root.querySelector('#play-btn');
    const scrubRange = this.root.querySelector('#scrub-range');
    const speedSelect = this.root.querySelector('#speed-select');

    playBtn.onclick = () => {
      if (!this.scheduler) return;
      if (this.scheduler.playing) {
        this.scheduler.pause();
        playBtn.textContent = 'Play';
        this.audioManager.stopScore();
      } else {
        this.scheduler.play();
        playBtn.textContent = 'Pause';
        const currentSceneInfo = this.scheduler.getSceneAt(this.scheduler.currentTime);
        this.audioManager.playMoodScore(currentSceneInfo.scene.mood);
        if (currentSceneInfo.scene.dialogue?.[0]) {
          this.narrationManager.speak(currentSceneInfo.scene.dialogue[0].text, { lang: this.story?.language === 'km' ? 'km-KH' : 'en-US' });
        }
      }
    };

    scrubRange.oninput = (e) => {
      if (!this.scheduler) return;
      const val = parseFloat(e.target.value);
      const t = (val / 100) * this.scheduler.duration;
      this.scheduler.seek(t);
    };

    speedSelect.onchange = (e) => {
      if (this.scheduler) {
        this.scheduler.setSpeed(parseFloat(e.target.value));
      }
    };

    const recordBtn = this.root.querySelector('#record-btn');
    recordBtn.onclick = () => {
      const canvas2d = this.root.querySelector('#canvas-2d');
      const stream = canvas2d.captureStream(60);
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.recordedChunks.push(e.data); };
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'animation-film.webm';
        a.click();
        alert('Recording saved as animation-film.webm');
      };
      
      this.mediaRecorder.start();
      recordBtn.textContent = 'Recording... (Click to Stop)';
      recordBtn.className = 'btn primary';
      setTimeout(() => {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.stop();
          recordBtn.textContent = 'Record WebM Video';
          recordBtn.className = 'btn danger';
        }
      }, 5000); // 5 second demo record
    };
  }

  async loadDefaultStory() {
    this.story = await generateStory({ genre: 'historical', theme: 'Echoes of Angkor' });
    this.initScheduler();
  }

  initScheduler() {
    if (this.scheduler) this.scheduler.pause();
    this.scheduler = new TimelineScheduler({ scenes: this.story.scenes, fps: 60 });

    const threeContainer = this.root.querySelector('#canvas-3d-container');
    if (this.threeManager) this.threeManager.dispose();
    this.threeManager = new ThreeSceneManager(threeContainer);

    const canvas2d = this.root.querySelector('#canvas-2d');
    const ctx2d = canvas2d.getContext('2d');

    this.scheduler.on('timeupdate', ({ currentTime, duration, scene }) => {
      const scrubRange = this.root.querySelector('#scrub-range');
      const timeDisplay = this.root.querySelector('#time-display');
      scrubRange.value = (currentTime / duration) * 100;
      timeDisplay.textContent = `${currentTime.toFixed(2)}s / ${duration.toFixed(2)}s`;

      // Render 2D Canvas
      ctx2d.clearRect(0, 0, canvas2d.width, canvas2d.height);
      ctx2d.save();
      ctx2d.fillStyle = scene.scene.mood === 'night storm' ? '#0b132b' : '#faf0ca';
      ctx2d.fillRect(0, 0, canvas2d.width, canvas2d.height);

      ctx2d.fillStyle = '#212121';
      ctx2d.font = 'bold 48px Georgia, serif';
      ctx2d.textAlign = 'center';
      ctx2d.fillText(scene.scene.name, 960, 200);

      if (scene.scene.dialogue?.[0]) {
        ctx2d.font = '28px sans-serif';
        ctx2d.fillStyle = '#fff';
        ctx2d.fillRect(480, 850, 960, 80);
        ctx2d.fillStyle = '#000';
        ctx2d.fillText(scene.scene.dialogue[0].subtitle || scene.scene.dialogue[0].text, 960, 900);
      }
      ctx2d.restore();

      // Render 3D Scene
      if (this.threeManager) {
        this.threeManager.setMood(scene.scene.mood);
        this.threeManager.applyCameraRig(scene.scene.camera || 'dolly', scene.localTime);
        this.threeManager.render();
      }
    });

    this.scheduler.seek(0);
  }
}
