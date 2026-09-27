'use strict';
// How Angkor Wat Was Built. Narration captions and action are timed to the generated voice.
const fixed = (x = 960, y = 540, zoom = 1) => () => ({x, y, zoom});
const VOICE_CUES = [
  {scene: 'hook', text: 'In the 12th century, the Khmer Empire built the largest religious monument on Earth.'},
  {scene: 'commission', text: 'King Suryavarman II wanted a temple to honor Vishnu, and a mountain to house his remains.'},
  {scene: 'quarry', text: '5 million tons of sandstone. Quarried 40 kilometers away. No wheels. No pulleys.'},
  {scene: 'transport', text: 'They used canals, rafts, and elephants. Millions of blocks floated toward the site.'},
  {scene: 'construction', text: 'Every surface was carved in place. It took 35 years, and possibly 300,000 workers.'},
  {scene: 'legacy', text: '900 years later, it still stands. The largest religious monument ever built.'},
];
const VOICE = VOICE_CUES.map(cue => {
  const clips = typeof VOICE_FILES === 'undefined' ? null : VOICE_FILES.find(item => item.scene === cue.scene);
  return clips ? {scene: cue.scene, lines: clips.lines.map(line => ({...line, sub: cue.text, sub2: ''}))} : null;
}).filter(Boolean);
const voiceDuration = name => VOICE.find(v => v.scene === name)?.lines?.[0]?.dur || 0;
const timing30 = name => ({dur: 30, pre: .6, post: .6, holds: {0: Math.max(0, 28.8 - voiceDuration(name))}});
function raftT(c, x, y, s, t) {
  c.save(); c.translate(x, y + Math.sin(t * 1.4) * 5); c.scale(s, s);
  for (let k = 0; k < 6; k++) sh(c, rr(-128 + k * 43, -8 + Math.sin(k) * 3, 42, 28, 12), k % 2 ? '#8f613e' : '#a87549', {w: 3.4});
  mk(c, [[-132, -15], [132, -15]], {w: 5, color: '#6c4e37'});
  blockT(c, -48, -13, 96, 52);
  c.restore();
}
const SCENES = [
  {...timing30('hook'), name: 'hook', mood: 'dawn', camera: tau => ({x: 960, y: 540, zoom: lerp(1.02, 1.32, span(0, 30, tau, easeInOutSine))}), set(c, tau) {
    sunBurst(c, lerp(1480, 1420, span(0, 7, tau)), 260, 82, tau, {col: '#f1aa4f'});
    sh(c, ell(960, 786, 820, 112, 44), vgrad('#75b9c8', '#397c93'), {w: 4, color: '#d5e5dd'});
    const y = 704;
    c.save(); c.globalAlpha = .26; c.translate(0, 1.42 * y); c.scale(1, -.42); angkorFlat(c, 960, y, .7); c.restore();
    angkorFlat(c, 960, y, .7);
    for (let k = 0; k < 4; k++) cloudT(c, ((tau * (13 + k * 3) + k * 570 + 80) % 2280) - 180, 388 + k % 2 * 85, .72 + (k % 2) * .22, {col: '#fff5df'});
    for (let k = 0; k < 18; k++) { const x = 250 + k * 82, a = .2 + .45 * (1 - Math.abs(x - 960) / 1000); mk(c, [[x, 752 + (k % 3) * 12], [x + 34 + Math.sin(tau * 1.4 + k) * 12, 754 + (k % 3) * 12]], {w: 3, color: '#f5d594', al: a}); }
    handText(c, 'How Angkor Wat Was Built', 960, 108, 48, span(.1, 1.6, tau), {col: '#6f4936'});
  }},
  {...timing30('commission'), name: 'commission', mood: 'gold', camera: tau => ({x: 960, y: 540, zoom: lerp(1.02, 1.1, span(0, 30, tau))}), set(c, tau) {
    sunBurst(c, 330, 198, 60, tau);
    const rise = span(.5, 8, tau, easeOut);
    sh(c, [[170, 744, 1], [210, 590], [300, 480], [380, 568], [470, 390], [560, 520], [650, 320], [740, 512], [825, 408], [920, 566], [1010, 480], [1110, 744, 1]], '#c69b66', {w: 4, al: rise});
    
    const angle3D = tau * 0.5;
    const towers3D = [
      {x: -120, y: -100, z: 50, h: 180},
      {x: 120, y: -100, z: 50, h: 180},
      {x: 0, y: -130, z: 0, h: 235},
      {x: -80, y: -70, z: -50, h: 150},
      {x: 80, y: -70, z: -50, h: 150}
    ];
    towers3D.forEach((twr, idx) => {
      const rot = rotY([twr.x, twr.y, twr.z], angle3D);
      const proj = project(rot, {cx: 960, cy: 620, fov: 900, scale: rise});
      zDraw(rot[2], (g) => {
        budTower(g, proj[0], proj[1] + 80, 52 * proj[2], twr.h * proj[2], idx === 2 ? '#c48e55' : '#b58251');
      });
    });
    flushZ(c);

    handText(c, 'MOUNT MERU (3D ROTATION)', 600, 275, 34, span(1.8, 2.8, tau), {col: '#76523a'});
    angkorFlat(c, 1510, 758, .35);

    const walking = tau > 2 && tau < 22;
    const kingWalk = walk3D(tau, 2, 22, [1510, 920], [690, 920]);
    const kingY = kingWalk.y + kingWalk.bobY * 3;
    const kingDepth = 0.85 + (kingY - 700) / 1000 * 0.3;
    pp(c, kingWalk.x, kingY, 1.12 * kingDepth, {
      body: T.red, hat: 'mokot', dir: -1,
      arms: walking ? 'down' : 'up',
      walk: walking ? kingWalk.walk * 0.72 : null,
      armSwingL: kingWalk.armSwingL,
      armSwingR: kingWalk.armSwingR,
      legSwingL: kingWalk.legSwingL,
      legSwingR: kingWalk.legSwingR,
      kneeL: kingWalk.kneeL,
      kneeR: kingWalk.kneeR,
      hipSway: kingWalk.hipSway,
      torsoYaw: kingWalk.torsoYaw,
      headYaw: tau > 18 ? -0.3 : kingWalk.headYaw,
      bobY: kingWalk.bobY,
      breathe: kingWalk.breathe,
      mood: tau > 22 ? 'star' : 'happy',
      t: tau
    });

    for (let k = 0; k < 3; k++) {
      const y = 920;
      const depth = 0.85 + (y - 700) / 1000 * 0.3;
      const i = idle3D(tau + k * 0.7);
      pp(c, 1130 + k * 105, y, .76 * depth, {
        body: [T.teal, T.orange, T.navy][k], hat: 'hair',
        arms: tau > 10 ? 'cheer' : 'pray', mood: 'happy',
        bobY: i.bobY, breathe: i.breathe,
        headYaw: i.headYaw, headPitch: i.headPitch,
        t: tau + k
      });
    }
    emote(c, tau, 3.2, kingWalk.x, 610, 'idea', {t1: 5.3});
  }},
  {...timing30('quarry'), name: 'quarry', mood: 'dust', camera: fixed(960, 540, 1.05), set(c, tau) {
    mountainT(c, 390, 800, .95, tau, {fall: false});
    sh(c, [[210, 748, 1], [265, 640], [475, 610], [540, 748, 1]], '#bd9364', {w: 4});
    for (let k = 0; k < 6; k++) blockT(c, 268 + k * 68, 754, 55, 44);
    blockT(c, 760, 752, 172, 112);
    for (let k = 0; k < 3; k++) {
      const x = 610 + k * 260, y = 916, working = Math.sin(tau * .8 + k) > -.72;
      const hammer = working ? Math.sin(tau * 8 + k) * 18 : 0;
      const swing = working ? Math.sin(tau * 6 + k) * 0.7 : 0;
      const depth = 0.85 + (y - 700) / 1000 * 0.3;
      const hand = pp(c, x, y, .86 * depth, {
        body: [T.teal, T.orange, T.red][k], hat: 'hair',
        arms: working ? 'hold' : 'down',
        walk: working ? tau * 1.2 + k : null,
        armSwingL: swing,
        armSwingR: swing,
        elbowL: 0.5 + Math.abs(swing) * 0.3,
        elbowR: 0.5 + Math.abs(swing) * 0.3,
        torsoYaw: swing * 0.2,
        lean: swing * 0.3,
        kneeL: 0.3 + swing * 0.2,
        kneeR: 0.3 + swing * 0.2,
        headPitch: -0.2 - swing * 0.2,
        hipSway: swing * 0.3,
        t: tau + k
      });
      const handX = hand ? hand[0] + x : x + 24;
      const handY = hand ? hand[1] + y : 804;
      mk(c, [[handX, handY], [handX + 38, handY - 34 + hammer]], {w: 8, color: '#765036'});
      if (working) sparkle(c, x + 64, 769 + hammer, .42, .35 + .35 * Math.sin(tau * 12 + k) ** 2);
    }
    for (let k = 0; k < 12; k++) { const p = pop(tau, 2.2 + k * 1.65, .45); if (p > 0) blockT(c, 940 + (k % 3) * 82, 902 - Math.floor(k / 3) * 47, 76, 48); }
    for (let k = 0; k < 24; k++) {
      const phase = (tau * .34 + hash(k, 5)) % 1, x = 500 + (k % 3) * 260 + Math.sin(phase * 5 + k) * (12 + phase * 36), y = 780 - phase * 185;
      c.save(); c.globalAlpha *= Math.sin(phase * Math.PI) * .32; c.fillStyle = '#d8b58a'; c.beginPath(); c.arc(x, y, 3 + phase * 7, 0, TAU); c.fill(); c.restore();
    }
    handText(c, 'PHNOM KULEN', 420, 330, 34, span(.4, 1.3, tau), {col: '#694d3a'});
    handText(c, '40 km', 1000, 582, 30, span(5.8, 6.6, tau), {col: '#694d3a'});
    pathArrow(c, [[540, 662], [690, 620], [850, 630], [1010, 670]], span(6.1, 8.4, tau), {w: 5});
  }},
  {...timing30('transport'), name: 'transport', mood: 'sea', dur: 30, camera: fixed(960, 550, 1), set(c, tau) {
    const waterY = 724;
    waveRoller(c, waterY, tau, {col: '#67b2c7', dk: '#3b8297', h: 360, amp: 13});
    for (let k = 0; k < 3; k++) {
      const raftX = ((tau * (47 + k * 8) + k * 770 + 180) % 2540) - 300, y = 770 + Math.sin(tau * 1.5 + k) * 10;
      raftT(c, raftX, y, .82 + (k % 2) * .12, tau + k);
      const stroke = Math.sin(tau * 3.5 + k * 0.5);
      const rowerY = 760;
      const depth = 0.85 + (rowerY - 700) / 1000 * 0.3;
      pp(c, raftX + 40, rowerY, .65 * depth, {
        body: T.orange, hat: 'hair', arms: 'row',
        armSwingL: stroke * 0.9,
        armSwingR: -stroke * 0.9,
        elbowL: 0.4 + Math.abs(stroke) * 0.3,
        elbowR: 0.4 + Math.abs(stroke) * 0.3,
        torsoYaw: stroke * 0.25,
        hipSway: stroke * 0.3,
        bobY: Math.abs(stroke) * 0.2,
        t: tau
      });
    }
    for (let k = 0; k < 2; k++) {
      const ex = 2020 - ((tau * 32 + k * 870) % 1540);
      blockT(c, ex - 315, 918, 150, 78);
      sh(c, rr(ex - 338, 918, 176, 16, 5), '#946342', {w: 4});
      mk(c, [[ex - 162, 894], [ex - 96, 835], [ex - 44, 842]], {w: 4, color: '#805b3e'});
      elephantT(c, ex, 948, .62, tau * .75 + k, {walk: true, rider: g => {
        const sway = Math.sin(tau * 1.5 + k) * 0.5;
        const depth = 0.85 + (948 - 700) / 1000 * 0.3;
        pp(g, 0, -6, .65 * depth, {
          body: T.orange, hat: 'hair', arms: 'hold',
          hipSway: sway,
          torsoYaw: sway * 0.6,
          headYaw: sway * 0.3,
          bobY: Math.abs(sway) * 0.4,
          breathe: 0.5 + Math.sin(tau * 0.5) * 0.5,
          t: tau
        });
      }});
    }
    for (let k = 0; k < 8; k++) { const x = (k * 231 + tau * (18 + k % 3 * 5)) % 1940; mk(c, [[x, 735 + (k % 3) * 35], [x + 24 + 12 * Math.sin(tau * 2 + k), 739 + (k % 3) * 35]], {w: 3, color: '#f6e6b4', al: .62}); }
  }},
  {...timing30('construction'), name: 'construction', mood: 'gold', camera: fixed(960, 535, 1.06), set(c, tau) {
    const growth = span(.5, 26, tau, easeInOutSine), scaffoldTop = lerp(690, 270, span(2, 19, tau, easeOut));
    c.save(); c.translate(960, 754); c.scale(1, lerp(.14, 1, growth)); c.translate(-960, -754); angkorFlat(c, 960, 754, .74); c.restore();
    for (let k = 0; k < 9; k++) {
      const x = 480 + k * 120, rise = span(1 + k * .45, 14 + k * .35, tau, easeOut);
      if (rise <= 0) continue;
      mk(c, [[x, 754], [x, lerp(754, scaffoldTop, rise)]], {w: 5, color: '#9c7046', al: .85});
      mk(c, [[x + 50, 754], [x + 50, lerp(754, scaffoldTop, rise)]], {w: 5, color: '#9c7046', al: .85});
      for (let row = 1; row <= 6; row++) { const p = span(row * 2 + k * .3, row * 2 + 1.1 + k * .3, tau); if (p > 0 && lerp(754, scaffoldTop, rise) < 754 - row * 62) mk(c, [[x, 754 - row * 62], [x + 50, 754 - row * 62]], {w: 4, color: '#a87b4e', al: p * .85}); }
    }
    sh(c, rr(280, 628, 510, 114, 10), '#c5a574', {w: 4});
    for (let k = 0; k < 12; k++) {
      const x = 310 + k * 39, y = 720 - (k % 3) * 18;
      mk(c, [[x, y], [x + 4, y - 40], [x + 12, y - 51], [x + 20, y - 39], [x + 22, y]], {w: 3.2, color: '#795b3b', al: .8});
      mk(c, [[x - 2, y - 22], [x + 24, y - 22]], {w: 2.4, color: '#795b3b', al: .7});
    }
    for (let k = 0; k < 4; k++) {
      const x = 340 + ((tau * 28 + k * 390) % 1240), y = 950, working = Math.sin(tau * .7 + k) > -.8;
      const carve = working ? Math.sin(tau * 5 + k) * 0.6 : 0;
      const depth = 0.85 + (y - 700) / 1000 * 0.3;
      const hand = pp(c, x, y, .78 * depth, {
        body: [T.teal, T.red, T.orange][k % 3], hat: 'hair',
        arms: working ? 'hold' : 'down',
        walk: working ? tau * 1.4 + k * 0.15 : null,
        armSwingL: carve,
        armSwingR: carve,
        elbowL: 0.55, elbowR: 0.55,
        torsoYaw: carve * 0.25,
        headPitch: -0.25,
        hipSway: carve * 0.3,
        bobY: Math.abs(carve) * 0.15,
        breathe: 0.4,
        t: tau + k
      });
      const handX = hand ? hand[0] + x : x + 25;
      const handY = hand ? hand[1] + y : 836;
      mk(c, [[handX, handY], [handX + 49, handY - 46 + (working ? Math.sin(tau * 8 + k) * 13 : 0)]], {w: 7, color: '#765036'});
      if (working) sparkle(c, x + 76, 788, .38, .55);
    }
    const moat = span(12, 26, tau);
    if (moat > 0) { c.save(); c.globalAlpha = moat * .7; sh(c, ell(1110, 1025, 530, 62, 30), '#5e9ca7', {w: 4}); c.restore(); }
  }},
  {...timing30('legacy'), name: 'legacy', mood: 'gold', camera: tau => ({x: 960, y: 540, zoom: lerp(1, 1.1, span(0, 30, tau))}), set(c, tau) {
    const dusk = span(0, 30, tau, easeInOutSine), sunY = lerp(245, 650, dusk);
    c.save(); c.globalAlpha = dusk * .26; c.fillStyle = '#47394d'; c.fillRect(0, 0, W, H); c.restore();
    sunBurst(c, lerp(1480, 1370, dusk), sunY, 98, tau, {col: mix('#f3c66d', '#d97555', dusk)});
    sh(c, ell(960, 810, 820, 105, 40), vgrad('#548c9b', '#315e72'), {w: 4, color: '#ddc996'});
    for (let k = 0; k < 3; k++) treeT(c, 230 + k * 180, 758, 250 + k * 30, {col: '#647d55'});
    for (let k = 0; k < 3; k++) treeT(c, 1500 + k * 125, 760, 260 - k * 25, {col: '#668154'});
    const y = 718;
    c.save(); c.globalAlpha = .25; c.translate(0, 1.42 * y); c.scale(1, -.42); angkorFlat(c, 960, y, .72); c.restore();
    angkorFlat(c, 960, y, .72);
    for (let k = 0; k < 20; k++) { const x = 190 + k * 80; mk(c, [[x, 770 + (k % 2) * 13], [x + 38 + Math.sin(tau * 1.3 + k) * 12, 772 + (k % 2) * 13]], {w: 3, color: '#f4d294', al: .48}); }
    
    const y1 = 950;
    const d1 = 0.85 + (y1 - 700) / 1000 * 0.3;
    const i1 = idle3D(tau);
    const i2 = idle3D(tau + 1.5);
    pp(c, 800, y1, 1.0 * d1, {
      body: T.orange, hat: 'hair', arms: 'rest', mood: 'happy',
      bobY: i1.bobY, breathe: i1.breathe, headYaw: -0.2, headPitch: i1.headPitch,
      t: tau
    });
    pp(c, 1080, y1, 0.95 * d1, {
      body: T.teal, hat: 'hair', arms: 'rest', mood: 'happy',
      bobY: i2.bobY, breathe: i2.breathe, headYaw: -0.25, headPitch: i2.headPitch,
      t: tau
    });
    flagT(c, 1450, 850, 160, tau, span(.8, 3, tau));
  }},
];
