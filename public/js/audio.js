// Процедурный звук: гул ламп, эмбиент, шаги, сердцебиение, голоса сущностей, скримеры.
// Всё синтезируется через WebAudio — без внешних файлов.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambNodes = [];
    this.entityPanner = null;
    this.entityGain = null;
    this.heartGain = null;
    this.heartTimer = null;
    this.stepTime = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this._makeHeartbeat();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _noiseBuffer(seconds = 2) {
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------- эмбиент уровня ----------

  stopAmbient() {
    for (const n of this.ambNodes) { try { n.stop ? n.stop() : n.disconnect(); } catch {} }
    this.ambNodes = [];
  }

  startAmbient(theme) {
    if (!this.ctx) return;
    this.stopAmbient();
    const t = this.ctx.currentTime;

    // низкий гул — у всех уровней, разная высота
    const droneFreq = { yellow: 55, warehouse: 38, pipes: 46, pools: 62, final: 33 }[theme] || 50;
    const drone = this.ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = droneFreq;
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 120;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.05;
    drone.connect(droneFilter).connect(droneGain).connect(this.master);
    drone.start(t);
    this.ambNodes.push(drone, droneGain);

    // медленная пульсация гула
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(droneGain.gain);
    lfo.start(t);
    this.ambNodes.push(lfo);

    if (theme === 'yellow') {
      // гул люминесцентных ламп: 100 Гц + лёгкий шум
      const buzz = this.ctx.createOscillator();
      buzz.type = 'square';
      buzz.frequency.value = 100;
      const bf = this.ctx.createBiquadFilter();
      bf.type = 'bandpass'; bf.frequency.value = 800; bf.Q.value = 2;
      const bg = this.ctx.createGain(); bg.gain.value = 0.012;
      buzz.connect(bf).connect(bg).connect(this.master);
      buzz.start(t);
      this.ambNodes.push(buzz, bg);
    }
    if (theme === 'pools') {
      // капли и плеск: фильтрованный шум
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer(4); src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 0.6;
      const g = this.ctx.createGain(); g.gain.value = 0.015;
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
      this.ambNodes.push(src, g);
      this._dripLoop();
    }
    if (theme === 'pipes') {
      // шипение пара
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer(3); src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 3000;
      const g = this.ctx.createGain(); g.gain.value = 0.008;
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
      this.ambNodes.push(src, g);
    }
    if (theme === 'hotel') {
      // ветер в коридорах + редкие скрипы половиц
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer(4); src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 1.8;
      const g = this.ctx.createGain(); g.gain.value = 0.012;
      const lfo2 = this.ctx.createOscillator(); lfo2.frequency.value = 0.13;
      const lg2 = this.ctx.createGain(); lg2.gain.value = 0.008;
      lfo2.connect(lg2).connect(g.gain);
      src.connect(f).connect(g).connect(this.master);
      src.start(t); lfo2.start(t);
      this.ambNodes.push(src, g, lfo2);
      this._creakLoop();
    }
    if (theme === 'party') {
      // расстроенная музыкальная шкатулка
      this._musicBoxLoop(0);
    }
    if (theme === 'final') {
      // тревожная сирена вдалеке
      const sir = this.ctx.createOscillator();
      sir.type = 'sine'; sir.frequency.value = 220;
      const sLfo = this.ctx.createOscillator(); sLfo.frequency.value = 0.25;
      const sLfoG = this.ctx.createGain(); sLfoG.gain.value = 40;
      sLfo.connect(sLfoG).connect(sir.frequency);
      const sg = this.ctx.createGain(); sg.gain.value = 0.014;
      sir.connect(sg).connect(this.master);
      sir.start(t); sLfo.start(t);
      this.ambNodes.push(sir, sLfo, sg);
    }

    // позиционный источник сущности
    this._makeEntitySource(theme);
  }

  _creakLoop() {
    if (!this.ctx) return;
    const delay = 4000 + Math.random() * 9000;
    const timer = setTimeout(() => {
      if (!this.ambNodes.length) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(90 + Math.random() * 60, t);
      o.frequency.linearRampToValueAtTime(60 + Math.random() * 30, t + 0.5);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 500;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.random() * 2 - 1;
      o.connect(f).connect(g).connect(p).connect(this.master);
      o.start(t); o.stop(t + 0.7);
      this._creakLoop();
    }, delay);
    this.ambNodes.push({ disconnect: () => clearTimeout(timer) });
  }

  _musicBoxLoop(step) {
    if (!this.ctx) return;
    // «К нам сегодня приходи» — кривая колыбельная из пяти нот
    const notes = [523, 494, 440, 494, 523, 523, 523, 0, 494, 494, 494, 0, 523, 587, 659, 0];
    const note = notes[step % notes.length];
    const timer = setTimeout(() => {
      if (!this.ambNodes.length) return;
      if (note) {
        const t = this.ctx.currentTime;
        const detune = 1 + (Math.random() - 0.5) * 0.025; // фальшивит
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = note * 0.5 * detune;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.035, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        o.connect(g).connect(this.master);
        o.start(t); o.stop(t + 0.6);
      }
      this._musicBoxLoop(step + 1);
    }, 460);
    this.ambNodes.push({ disconnect: () => clearTimeout(timer) });
  }

  _dripLoop() {
    if (!this.ctx) return;
    const delay = 1500 + Math.random() * 5000;
    const timer = setTimeout(() => {
      if (!this.ambNodes.length) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(1400 + Math.random() * 800, t);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.1);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.3);
      this._dripLoop();
    }, delay);
    this.ambNodes.push({ disconnect: () => clearTimeout(timer) });
  }

  // ---------- сущность (позиционный звук) ----------

  _makeEntitySource(theme) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'exponential';
    p.refDistance = 2;
    p.rolloffFactor = 1.6;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    p.connect(g).connect(this.master);
    this.entityPanner = p;
    this.entityGain = g;

    // дыхание/рык — фильтрованный шум с медленной модуляцией
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(3);
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = theme === 'pipes' ? 2400 : 240;
    f.Q.value = 3;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = theme === 'warehouse' ? 1.6 : 0.55;
    const lg = this.ctx.createGain(); lg.gain.value = 0.5;
    const vg = this.ctx.createGain(); vg.gain.value = 0.6;
    lfo.connect(lg).connect(vg.gain);
    src.connect(f).connect(vg).connect(p);
    src.start();
    lfo.start();
    this.ambNodes.push(src, lfo, g, { disconnect: () => { p.disconnect(); } });
  }

  updateEntity(x, y, z, dist, hunting) {
    if (!this.entityPanner) return;
    const t = this.ctx.currentTime;
    this.entityPanner.positionX.setTargetAtTime(x, t, 0.1);
    this.entityPanner.positionY.setTargetAtTime(y, t, 0.1);
    this.entityPanner.positionZ.setTargetAtTime(z, t, 0.1);
    const vol = dist > 40 ? 0 : (hunting ? 1.2 : 0.55);
    this.entityGain.gain.setTargetAtTime(vol, t, 0.3);
    // сердцебиение при близкой сущности
    const heartVol = dist < 14 ? (1 - dist / 14) * 0.5 : 0;
    if (this.heartGain) this.heartGain.gain.setTargetAtTime(heartVol, t, 0.4);
  }

  updateListener(pos, forward) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.05);
      l.positionY.setTargetAtTime(pos.y, t, 0.05);
      l.positionZ.setTargetAtTime(pos.z, t, 0.05);
      l.forwardX.setTargetAtTime(forward.x, t, 0.05);
      l.forwardY.setTargetAtTime(forward.y, t, 0.05);
      l.forwardZ.setTargetAtTime(forward.z, t, 0.05);
      l.upX.setTargetAtTime(0, t, 0.05);
      l.upY.setTargetAtTime(1, t, 0.05);
      l.upZ.setTargetAtTime(0, t, 0.05);
    }
  }

  _makeHeartbeat() {
    this.heartGain = this.ctx.createGain();
    this.heartGain.gain.value = 0;
    this.heartGain.connect(this.master);
    const beat = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      for (const dt of [0, 0.22]) {
        const o = this.ctx.createOscillator();
        o.frequency.value = 52;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.exponentialRampToValueAtTime(1.0, t + dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.18);
        o.connect(g).connect(this.heartGain);
        o.start(t + dt); o.stop(t + dt + 0.25);
      }
      this.heartTimer = setTimeout(beat, 850);
    };
    beat();
  }

  // ---------- одиночные эффекты ----------

  footstep(running, inWater) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.12);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = inWater ? 900 : 320;
    const g = this.ctx.createGain();
    const v = (running ? 0.30 : 0.14) * (inWater ? 1.5 : 1);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (inWater ? 0.3 : 0.13));
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  pickup() { this._blip(880, 0.12, 0.15, 'sine'); }
  uiTick() { this._blip(440, 0.06, 0.08, 'square'); }
  leverClank() {
    this._blip(180, 0.25, 0.3, 'square');
    this._thud(0.18);
  }
  valveCreak() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(160, t);
    o.frequency.linearRampToValueAtTime(90, t + 0.8);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.linearRampToValueAtTime(0.001, t + 0.9);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 1);
  }
  doorOpen() {
    this._thud(0.5);
    this._blip(70, 1.2, 0.25, 'sine');
  }
  signalPing() { this._blip(1200, 0.3, 0.12, 'sine'); }

  _blip(freq, dur, vol, type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _thud(vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.45);
  }

  // далёкий крик (напарника поймали)
  distantScream() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(600, t);
    o.frequency.linearRampToValueAtTime(900, t + 0.3);
    o.frequency.linearRampToValueAtTime(200, t + 1.4);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.linearRampToValueAtTime(0.001, t + 1.5);
    o.connect(f).connect(g).connect(this.master);
    o.start(t); o.stop(t + 1.6);
  }

  // СКРИМЕР
  jumpscare() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // визг
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 1.1);
    const dist = this.ctx.createWaveShaper();
    dist.curve = this._distCurve(120);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.linearRampToValueAtTime(0.001, t + 1.3);
    o.connect(dist).connect(g).connect(this.master);
    o.start(t); o.stop(t + 1.4);
    // взрыв шума
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(1.4);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.7, t);
    ng.gain.linearRampToValueAtTime(0.001, t + 1.3);
    src.connect(ng).connect(this.master);
    src.start(t);
  }

  whisper() {
    // случайный шёпот из ниоткуда
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(1.8);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1600, t);
    f.frequency.linearRampToValueAtTime(900, t + 0.6);
    f.frequency.linearRampToValueAtTime(2100, t + 1.4);
    f.Q.value = 9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.7);
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.random() * 2 - 1;
    src.connect(f).connect(g).connect(p).connect(this.master);
    src.start(t);
  }

  _distCurve(amount) {
    const n = 256, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }
}
