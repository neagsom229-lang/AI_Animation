'use strict';
// Quiet, original pentatonic marimba and warm sustained tones under narration.
function score(ac, t0, dest) {
  const total = PLAY.reduce((sum, scene) => sum + scene.dur, 0);
  const master = ac.createGain(); master.gain.setValueAtTime(0, t0);
  master.gain.linearRampToValueAtTime(.72, t0 + 1.5);
  master.gain.setValueAtTime(.72, t0 + total - 2);
  master.gain.linearRampToValueAtTime(0, t0 + total);
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -22; comp.ratio.value = 2.5;
  master.connect(comp); comp.connect(dest);
  const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19], base = 146.83;
  const at = (time) => { let sum = 0; for (const scene of PLAY) { if (time < sum + scene.dur) return [scene, time - sum]; sum += scene.dur; } return [PLAY.at(-1), 0]; };
  const note = (time, midi, length, volume, type = 'sine') => {
    if (time >= total) return;
    const osc = ac.createOscillator(), gain = ac.createGain(); osc.type = type;
    osc.frequency.value = base * Math.pow(2, midi / 12);
    gain.gain.setValueAtTime(.0001, t0 + time); gain.gain.linearRampToValueAtTime(volume, t0 + time + .025);
    gain.gain.exponentialRampToValueAtTime(.0001, t0 + time + length);
    osc.connect(gain); gain.connect(master); osc.start(t0 + time); osc.stop(t0 + time + length + .04);
  };
  let last = 0;
  for (let time = 0, beat = 0; time < total; time += .48, beat++) {
    const [scene] = at(time), mood = scene.name === 'quarry' || scene.name === 'construction' ? 2 : scene.name === 'legacy' ? 0 : 1;
    const chord = [0, 5, 7, 0, 2, 7][(Math.floor(time / 2.4) + mood) % 6];
    if (beat % 5 === 0) for (const interval of [0, 4, 7]) note(time, chord + interval - 12, 2.15, .009, 'triangle');
    const choices = scale.filter(value => Math.abs(value - last) <= 9);
    const idx = Math.floor(hash(beat, 31) * choices.length), pitch = choices[idx] ?? 7;
    last = pitch;
    if (hash(beat, 13) > .16) note(time, chord + pitch + 12, .45 + hash(beat, 17) * .42, .024, 'sine');
  }
}