// 날씨 그림: 비(선), 눈(점), 폭풍(굵은 비 + 번개 번쩍), 흐린 날씨는 햇빛을 어둡게(daylight.setWeatherLight).
// 빗방울·눈송이는 보는 곳(화면 중심) 둘레 상자 안에서만 내리고, 양은 그래픽 설정(소품 양)을 따름.
import * as THREE from "three";
import { WEATHER } from "../world/season.js";

const BOX = 70, TOP = 32, RAIN_MAX = 2400, SNOW_MAX = 1800;
// 계절별 땅 색 곱하기(봄·여름은 그대로, 가을은 누렇게, 겨울은 차갑게)
export const SEASON_TINT = { spring: 0xffffff, summer: 0xf6ffec, autumn: 0xfff0c4, winter: 0xe9f0fa };

export class WeatherViews {
  constructor(scene, daylight) {
    this.daylight = daylight; this.amount = 1; this.light = 1; this.flash = 0; this.nextBolt = 6;
    const rp = new Float32Array(RAIN_MAX * 6), rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xc4d6e6, transparent: true, opacity: 0.55, fog: true }));
    this.rainDrops = Array.from({ length: RAIN_MAX }, () => [Math.random() * BOX - BOX / 2, Math.random() * TOP, Math.random() * BOX - BOX / 2]);
    const sp = new Float32Array(SNOW_MAX * 3), sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const dot = document.createElement("canvas"); dot.width = dot.height = 32; const g = dot.getContext("2d"), rg2 = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg2.addColorStop(0, "rgba(255,255,255,1)"); rg2.addColorStop(0.6, "rgba(255,255,255,.85)"); rg2.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = rg2; g.fillRect(0, 0, 32, 32);
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, map: new THREE.CanvasTexture(dot), transparent: true, depthWrite: false, fog: true }));   // 둥근 눈송이
    this.flakes = Array.from({ length: SNOW_MAX }, () => [Math.random() * BOX - BOX / 2, Math.random() * TOP, Math.random() * BOX - BOX / 2, Math.random() * 6.28]);
    for (const o of [this.rain, this.snow]) { o.frustumCulled = false; o.visible = false; o.userData.noToon = true; o.renderOrder = 2; scene.add(o); }
    this.bolt = new THREE.AmbientLight(0xdde6ff, 0); scene.add(this.bolt);       // 번개: 잠깐 장면 전체를 밝힘
  }
  /** 그래픽 설정: 0~1(소품 양과 같은 비율) */
  setAmount(f) { this.amount = Math.max(0.15, f); }
  update(dt, kind, target) {
    const w = WEATHER[kind] || WEATHER.clear, wet = kind === "rain" || kind === "storm";
    // 햇빛: 날씨 밝기로 천천히 바뀜(약 1~2초)
    this.light += (w.light - this.light) * Math.min(1, dt * 0.8);
    if (Math.abs(this.light - (this.daylight.wl ?? 1)) > 0.01) this.daylight.setWeatherLight(this.light);
    const cx = Math.round(target.x / 4) * 4, cz = Math.round(target.z / 4) * 4;
    // 비
    this.rain.visible = wet;
    if (wet) {
      const n = Math.floor(RAIN_MAX * this.amount * (kind === "storm" ? 1 : 0.6)), speed = kind === "storm" ? 30 : 22, len = kind === "storm" ? 0.9 : 0.6, slant = kind === "storm" ? 0.35 : 0.12;
      const p = this.rain.geometry.attributes.position.array;
      for (let i = 0; i < n; i++) {
        const d = this.rainDrops[i]; d[1] -= speed * dt; if (d[1] < 0) { d[1] += TOP; d[0] = Math.random() * BOX - BOX / 2; d[2] = Math.random() * BOX - BOX / 2; }
        const j = i * 6; p[j] = cx + d[0]; p[j + 1] = d[1]; p[j + 2] = cz + d[2]; p[j + 3] = cx + d[0] - slant * len; p[j + 4] = d[1] + len; p[j + 5] = cz + d[2];
      }
      this.rain.geometry.setDrawRange(0, n * 2); this.rain.geometry.attributes.position.needsUpdate = true;
    }
    // 눈
    this.snow.visible = kind === "snow";
    if (kind === "snow") {
      const n = Math.floor(SNOW_MAX * this.amount), p = this.snow.geometry.attributes.position.array;
      for (let i = 0; i < n; i++) {
        const f = this.flakes[i]; f[1] -= 1.6 * dt; f[3] += dt; if (f[1] < 0) { f[1] += TOP; f[0] = Math.random() * BOX - BOX / 2; f[2] = Math.random() * BOX - BOX / 2; }
        p[i * 3] = cx + f[0] + Math.sin(f[3]) * 0.4; p[i * 3 + 1] = f[1]; p[i * 3 + 2] = cz + f[2] + Math.cos(f[3] * 0.8) * 0.4;
      }
      this.snow.geometry.setDrawRange(0, n); this.snow.geometry.attributes.position.needsUpdate = true;
    }
    // 번개(폭풍일 때 4~11초마다, 두 번 번쩍)
    if (kind === "storm" && (this.nextBolt -= dt) <= 0) { this.nextBolt = 4 + Math.random() * 7; this.flash = 1; this.second = 0.18; }
    if (this.second > 0 && (this.second -= dt) <= 0) this.flash = 0.8;
    this.flash = Math.max(0, this.flash - dt * 5); this.bolt.intensity = this.flash * 2.2;
  }
}
