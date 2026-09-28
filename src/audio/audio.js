/**
 * @fileoverview Web Audio manager for background music/SFX and Web Speech API narration (Khmer & English).
 * @module src/audio/audio
 */

'use strict';

export class AudioManager {
  constructor() {
    this.audioCtx = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.currentOscillators = [];
  }

  init() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
      this.bgmGain = this.audioCtx.createGain();
      this.sfxGain = this.audioCtx.createGain();
      this.bgmGain.gain.value = 0.3;
      this.sfxGain.gain.value = 0.5;
      this.bgmGain.connect(this.audioCtx.destination);
      this.sfxGain.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playMoodScore(mood = 'warm dawn') {
    this.init();
    this.stopScore();

    const baseFreq = mood === 'night storm' ? 110 : (mood === 'gold dust' ? 220 : 165);
    const osc1 = this.audioCtx.createOscillator();
    const osc2 = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.value = baseFreq;
    osc2.frequency.value = baseFreq * 1.5;

    gain.gain.setValueAtTime(0.01, this.audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, this.audioCtx.currentTime + 1);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.bgmGain);

    osc1.start();
    osc2.start();
    this.currentOscillators.push(osc1, osc2, gain);
  }

  stopScore() {
    for (const item of this.currentOscillators) {
      if (item.stop) item.stop();
      if (item.disconnect) item.disconnect();
    }
    this.currentOscillators = [];
  }

  playSFX(type = 'build') {
    this.init();
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    const t = this.audioCtx.currentTime;

    osc.type = type === 'hit' ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(type === 'hit' ? 150 : 440, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.3);
  }
}

export class NarrationManager {
  constructor() {
    this.synth = window.speechSynthesis;
  }

  speak(text, { lang = 'en-US', rate = 1.0, onBoundary = null, onEnd = null } = {}) {
    if (!this.synth) return;
    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;

    if (onBoundary) {
      utterance.onboundary = (event) => onBoundary(event);
    }
    if (onEnd) {
      utterance.onend = () => onEnd();
    }

    this.synth.speak(utterance);
  }

  stop() {
    if (this.synth && this.synth.speaking) {
      this.synth.cancel();
    }
  }
}
