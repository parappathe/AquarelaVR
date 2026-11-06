// Sons sintetizados na hora (sem arquivos). Só liga depois de um clique ou da entrada no VR;
// os testes nunca chamam unlock, então nunca tocam nada.
export class Sfx {
  constructor() { this.ctx = null; this.on = true; }

  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.9 : 0;
      this.master.connect(this.ctx.destination);
      this.white = this.makeNoise(3, false);
      this.brown = this.makeNoise(3, true);
      this.startAmbience();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }
  makeNoise(sec, brown) {
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { b = 0.98 * b + 0.02 * w; d[i] = b * 7; } else d[i] = w * 0.5;
    }
    return buf;
  }
  loop(buf, type, freq, q) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    return { f, g };
  }
  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.004 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, { vol = 0.1, freq = 1200, q = 1, at = 0, type = 'bandpass', attack = 0, sweep = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.white;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t + dur);
    g.gain.setValueAtTime(attack ? 0.0001 : vol, t);
    if (attack) g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
  }

  click() { this.tone(880, 0.05, { vol: 0.07, type: 'square' }); }
  good() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.25, { vol: 0.1, type: 'triangle', at: i * 0.08 })); }
  bad() { this.tone(330, 0.5, { vol: 0.1, type: 'triangle', slide: 0.7 }); this.tone(262, 0.6, { vol: 0.06, type: 'sine', slide: 0.7, at: 0.12 }); }
  fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i === 5 ? 0.7 : 0.18, { vol: 0.12, type: 'triangle', at: i * 0.12 })); }
  star(n) { this.tone(784 * (1 + n * 0.26), 0.35, { vol: 0.12, type: 'triangle' }); }

  // ---- Aquarela ----
  pick() { this.tone(900, 0.05, { vol: 0.07, type: 'triangle', slide: 1.2 }); }
  // Gota se formando na ponta do conta-gotas: tom que sobe com a força (0..1)
  charge(k) {
    if (!this.ctx) return;
    if (!this.hum) { this.hum = this.ctx.createOscillator(); this.humG = this.ctx.createGain(); this.hum.type = 'sine'; this.humG.gain.value = 0; this.hum.connect(this.humG); this.humG.connect(this.master); this.hum.start(); }
    this.hum.frequency.setTargetAtTime(300 + 500 * k, this.ctx.currentTime, 0.03);
    this.humG.gain.setTargetAtTime(k > 0 ? 0.025 + 0.02 * k : 0, this.ctx.currentTime, 0.04);
  }
  // Pingo caindo no papel molhado ("plic"), mais grave para gota grande
  drip(amount = 3, at = 0) {
    const f = 1300 - amount * 110;
    this.tone(f, 0.12, { vol: 0.16, type: 'sine', slide: 1.9, at });
    this.noise(0.06, { vol: 0.08, freq: 2400, q: 1.5, at: at + 0.01 });
  }
  // Tinta escorrendo: chiadinho de água
  seep(at = 0) { this.noise(0.5, { vol: 0.035, freq: 3800, q: 0.7, at, attack: 0.1, sweep: 0.6 }); }
  mud() { this.tone(160, 0.25, { vol: 0.07, type: 'triangle', slide: 0.7 }); }

  // Ateliê de manhã: passarinhos lá fora e um sininho de vento de vez em quando
  startAmbience() { this.birdT = 1.5; this.chimeT = 4; }
  updateAmbience(dt) {
    if (!this.ctx) return;
    this.birdT -= dt; this.chimeT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 3 + Math.random() * 6;
      const base = 2600 + Math.random() * 1200, n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) this.tone(base * (1 + 0.1 * Math.sin(k * 1.7)), 0.08, { vol: 0.014, type: 'sine', slide: 1.3, at: k * 0.12 });
    }
    if (this.chimeT <= 0) {
      this.chimeT = 9 + Math.random() * 12;
      [1568, 1976, 2349].forEach((f, k) => { if (Math.random() < 0.7) this.tone(f, 1.6, { vol: 0.012, type: 'sine', at: k * 0.25 + Math.random() * 0.1, attack: 0.01 }); });
    }
  }
}
