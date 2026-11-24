// 효과음: Kenney "RPG sounds"(CC0, assets/sfx/, mp3로 바꿈) + 그 묶음에 없는 소리(물, 종소리, 천둥, 바람)는 Web Audio로 합성.
// 첫 손가락·클릭 뒤에 소리를 켬(브라우저 규칙). 화면 중심에서 먼 곳의 소리는 작게, 30 m 넘게 멀면 안 냄.
// 같은 소리를 너무 자주 내지 않게(소리마다 최소 간격). 설정: 켜기/끄기 · 크기(이 브라우저에 저장).
const FILES = {
  chop: ["chop"], mine: ["metalPot1", "metalPot2"], hammer: ["metalPot3", "metalClick"], coins: ["handleCoins", "handleCoins2"],
  place: ["bookPlace1"], done: ["doorOpen_1"], doorIn: ["doorOpen_2"], doorOut: ["doorClose_2"], click: ["bookFlip1"], undo: ["bookFlip2"],
  phoneOpen: ["bookOpen"], phoneClose: ["bookClose"], paint: ["cloth1", "cloth2", "cloth3"], dig: ["dropLeather"], furniture: ["bookPlace2", "bookPlace3"],
  bag: ["handleSmallLeather"], step: ["footstep00", "footstep01", "footstep02", "footstep03"], creak: ["creak1"], latch: ["metalLatch"],
};
const GAP = { step: 0.12, chop: 0.08, mine: 0.08, hammer: 0.08, paint: 0.09, coins: 0.15, click: 0.04 };   // 소리마다 최소 간격(초)
const SFX_KEY = "galmaemiman-sfx";

export class Sfx {
  constructor() {
    let s = null; try { s = JSON.parse(localStorage.getItem(SFX_KEY) || "null"); } catch { /* 무시 */ }
    this.on = s?.on ?? true; this.volume = s?.volume ?? 0.7; this.buf = new Map(); this.last = new Map(); this.listener = null;
    const unlock = () => { this.start(); removeEventListener("pointerdown", unlock, true); removeEventListener("keydown", unlock, true); };
    addEventListener("pointerdown", unlock, true); addEventListener("keydown", unlock, true);
  }
  save() { try { localStorage.setItem(SFX_KEY, JSON.stringify({ on: this.on, volume: this.volume })); } catch { /* 무시 */ } }
  setOn(on) { this.on = on; this.save(); if (this.master) this.master.gain.value = on ? this.volume : 0; }
  setVolume(v) { this.volume = v; this.save(); if (this.master) this.master.gain.value = this.on ? v : 0; }
  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.on ? this.volume : 0; this.master.connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const names of Object.values(FILES)) for (const n of names) this.load(n);
  }
  async load(n) {
    if (this.buf.has(n)) return; this.buf.set(n, null);
    for (const url of [`assets/sfx/${n}.mp3`, `assets/sfx/${n}.mp3.json`]) {     // 아티팩트는 .mp3 그대로 받음(혹시 못 받으면 base64 json)
      try { const r = await fetch(url); if (!r.ok) continue; let ab = url.endsWith(".json") ? Uint8Array.from(atob((await r.json()).data), c => c.charCodeAt(0)).buffer : await r.arrayBuffer();
        this.buf.set(n, await this.ctx.decodeAudioData(ab)); return; } catch { /* 다음 */ }
    }
  }
  /** 이 위치(월드 m)의 소리 크기 배율: 화면 중심에서 멀수록 작게, 30 m 넘으면 0 */
  gainAt(pos) {
    if (!pos || !this.listener) return 1; const t = this.listener.target, cam = this.listener.camera;
    const d = Math.hypot(pos.x - t.x, pos.z - t.z), zoom = Math.max(0.35, 1 - (cam.position.distanceTo(t) - 10) / 90);   // 멀리서 보면 전체를 조금 작게
    return d > 30 ? 0 : Math.max(0, 1 - d / 30) * zoom;
  }
  ok(name) { if (!this.ctx || !this.on || this.ctx.state !== "running") return false; const now = this.ctx.currentTime, g = GAP[name] ?? 0.05; if (now - (this.last.get(name) ?? -9) < g) return false; this.last.set(name, now); return true; }
  /** 파일 소리 하나: vol 0~1, rate(높낮이·빠르기, 조금씩 흔들어 같은 소리 반복을 덜 거슬리게) */
  play(name, { pos = null, vol = 1, rate = 1 } = {}) {
    if (!this.ok(name)) return; const k = this.gainAt(pos) * vol; if (k < 0.02) return;
    const names = FILES[name], b = names && this.buf.get(names[Math.floor(Math.random() * names.length)]); if (!b) return;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(); src.buffer = b; src.playbackRate.value = rate * (0.92 + Math.random() * 0.16);
    g.gain.value = k; src.connect(g).connect(this.master); src.start();
  }
  // ---- 합성 소리
  env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  tone(freq, t, dur, peak, type = "sine") { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.value = freq; this.env(g, t, 0.01, peak, dur); o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05); }
  noiseBurst(t, dur, peak, f0, f1, q = 1) { const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(); s.buffer = this.noise; f.type = "bandpass"; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); this.env(g, t, 0.01, peak, dur); s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); }
  splash(pos, vol = 1) { if (!this.ok("splash")) return; const k = this.gainAt(pos) * vol; if (k < 0.02) return; const t = this.ctx.currentTime; this.noiseBurst(t, 0.35, 0.5 * k, 2400, 500, 0.8); this.noiseBurst(t + 0.05, 0.25, 0.25 * k, 900, 300, 1.2); }
  chime(notes = [784, 988, 1175], gap = 0.09, vol = 0.22) { if (!this.ok("chime" + notes[0])) return; const t = this.ctx.currentTime; notes.forEach((f, i) => { this.tone(f, t + i * gap, 0.5, vol); this.tone(f * 2, t + i * gap, 0.3, vol * 0.25, "triangle"); }); }
  fanfare() { this.chime([523, 659, 784, 1047], 0.12, 0.25); }
  summon() { this.chime([659, 880, 1319], 0.07, 0.2); }
  thunder(vol = 1) { if (!this.ok("thunder")) return; const t = this.ctx.currentTime + 0.15 + Math.random() * 0.4; this.noiseBurst(t, 1.8, 0.6 * vol, 180, 40, 0.6); this.noiseBurst(t, 0.25, 0.4 * vol, 900, 200, 0.7); }
  // ---- 날씨 배경음(빗소리·바람): 끊기지 않는 잡음을 날씨에 맞춰 키우고 줄임
  ambience(kind, dt) {
    if (!this.ctx || this.ctx.state !== "running") return;
    if (!this.amb) { const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(); s.buffer = this.noise; s.loop = true; f.type = "lowpass"; f.frequency.value = 1200; g.gain.value = 0; s.connect(f).connect(g).connect(this.master); s.start(); this.amb = { f, g }; }
    const want = kind === "storm" ? 0.16 : kind === "rain" ? 0.09 : kind === "snow" ? 0.025 : 0.012, cut = kind === "storm" || kind === "rain" ? 2600 : 600;   // 맑은 날은 아주 작은 파도·바람
    const g = this.amb.g.gain; g.value += (want - g.value) * Math.min(1, dt * 0.8); this.amb.f.frequency.value += (cut - this.amb.f.frequency.value) * Math.min(1, dt);
  }
}
