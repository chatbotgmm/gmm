// 현실 시간대: 기기 시계로 해의 높이·방향을 계산해 햇빛·하늘·안개·바다·구름 색을 바꿈. 밤에는 푸른 달빛과 등대 불빛.
// 해 위치 계산은 world/sun.js(서울 위치 가정, 균시차·경도 보정).
import * as THREE from "three";

import { sunPosition } from "../world/sun.js";
const DEG = Math.PI / 180;
const C = (h) => new THREE.Color(h);
// 해 높이(도)별 색 표: 밤 · 해질녘 · 낮
const SKY_KEYS = [
  { e: -12, top: C(0x0a1430), hor: C(0x1e2c55), sun: C(0x9fb6ff), sunI: 0.35, hemiSky: C(0x3a4f8a), hemiGround: C(0x1b2233), hemiI: 0.35, water: 0.45, exp: 0.95 },
  { e: -2, top: C(0x2a3f7e), hor: C(0xd99a7a), sun: C(0xff9a5a), sunI: 0.6, hemiSky: C(0x8a8fc4), hemiGround: C(0x4a4038), hemiI: 0.5, water: 0.7, exp: 1.0 },
  { e: 6, top: C(0x5b8fd6), hor: C(0xffc58a), sun: C(0xffb36b), sunI: 2.2, hemiSky: C(0xcfd8f0), hemiGround: C(0x7a7350), hemiI: 0.7, water: 0.9, exp: 1.08 },
  { e: 25, top: C(0x7fc4ec), hor: C(0xe4f3f6), sun: C(0xffe2b8), sunI: 3.3, hemiSky: C(0xdcefff), hemiGround: C(0x8a8f5a), hemiI: 0.85, water: 1.0, exp: 1.12 },
];
function sample(e) {
  e = Math.max(SKY_KEYS[0].e, Math.min(SKY_KEYS[SKY_KEYS.length - 1].e - 1e-6, e));   // 끝에서도 표를 복사해서 돌려줌(날씨가 색을 바꿔도 표는 그대로)
  let i = 0; while (SKY_KEYS[i + 1].e < e) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1], t = (e - a.e) / (b.e - a.e), out = {};
  for (const k of Object.keys(a)) out[k] = a[k].isColor ? a[k].clone().lerp(b[k], t) : a[k] + (b[k] - a[k]) * t;
  return out;
}

export class Daylight {
  /** mode: "real"(기기 시계) | "noon"(낮 고정) | "fast"(1분 = 1시간, 확인용) */
  constructor({ scene, renderer, sun, hemi, water, clouds, skyTex }) {
    Object.assign(this, { scene, renderer, sun, hemi, water, clouds, skyTex }); this.mode = "real"; this.fastT = 0; this.last = -1; this.dir = new THREE.Vector3(-0.6, 0.55, 0.32);
    this.moonColor = C(0xaebcff); this.wl = 1; this.grey = C(0x9aa3ad);          // wl: 날씨 밝기(흐림·비·폭풍이면 1보다 작음)
  }
  now() {
    if (this.mode === "noon") { const d = new Date(); d.setHours(12, 30, 0); return d; }
    if (this.mode === "fast") { const d = new Date(); d.setHours(0, 0, 0); return new Date(d.getTime() + this.fastT * 3600e3); }
    return new Date();
  }
  /** 매 프레임(내부적으로 0.5초마다만 다시 계산) */
  update(dt, nowMs) {
    if (this.mode === "fast") this.fastT = (this.fastT + dt / 60) % 24;
    if (nowMs - this.last < 500) { this.beam(dt); return; }
    this.last = nowMs;
    const d = this.now(), { elev, azim } = sunPosition(d), k = sample(elev);
    this.elev = elev; this.time = d;
    // 해(밤에는 달: 해 반대쪽 높이 40°로 둠)가 비추는 방향. 장면 좌표: +x 동, -z 북
    const night = elev < -2, e = night ? 40 : Math.max(4, elev), a = (night ? azim + 180 : azim) * DEG;
    this.dir.set(Math.sin(a) * Math.cos(e * DEG), Math.sin(e * DEG), -Math.cos(a) * Math.cos(e * DEG)).normalize();
    const wl = this.wl, dim = 1 - wl;                                               // 흐린 만큼 하늘·안개·구름을 회색으로
    k.top.lerp(this.grey, dim * 0.8); k.hor.lerp(this.grey, dim * 0.7);
    this.sun.color.copy(night ? this.moonColor : k.sun); this.sun.intensity = k.sunI * wl;
    this.hemi.color.copy(k.hemiSky); this.hemi.groundColor.copy(k.hemiGround); this.hemi.intensity = k.hemiI * (0.7 + 0.3 * wl);
    this.renderer.toneMappingExposure = k.exp * (0.55 + 0.45 * this.wl);           // 흐리면 화면 전체를 어둡게
    // 하늘 그라데이션·안개
    const cv = this.skyTex.image, g = cv.getContext("2d"), grad = g.createLinearGradient(0, 0, 0, cv.height);
    grad.addColorStop(0, "#" + k.top.getHexString()); grad.addColorStop(0.75, "#" + k.hor.getHexString()); grad.addColorStop(1, "#" + k.hor.getHexString());
    g.fillStyle = grad; g.fillRect(0, 0, cv.width, cv.height); this.skyTex.needsUpdate = true;
    if (this.scene.fog) this.scene.fog.color.copy(k.hor);
    this.water.userData.setLight?.(k.water * (0.75 + 0.25 * wl));
    this.clouds.traverse(o => { if (o.isSprite) o.material.color.copy(k.hor).lerp(C(0xffffff), 0.55); });
    this.night = Math.max(0, Math.min(1, (2 - elev) / 8));                          // 0 낮 ~ 1 밤(해 높이 2° → -6°)
    this.lamp();
    this.beam(dt);
  }
  /** 날씨 밝기(0.45~1). 0.5초마다 하는 다시 계산 때 반영 */
  setWeatherLight(v) { this.wl = v; }
  /** 등대: 램프 발광(밤에 세게), 둘레를 비추는 불빛, 회전하는 빛줄기 */
  lamp() {
    const lamp = this.scene.getObjectByName("lighthouseLamp"); if (!lamp) return;
    const v = 0.9 + 3.5 * this.night, m = lamp.material; m.emissiveIntensity = v; if (m.userData.src) m.userData.src.emissiveIntensity = v;   // 툰 재질이면 원래 재질도
    if (!this.light) { this.light = new THREE.PointLight(0xffd27a, 0, 26, 1.6); lamp.add(this.light); }
    this.light.intensity = 30 * this.night;
  }
  beam(dt) {
    const b = this.scene.getObjectByName("lighthouseBeam"); if (!b) return;
    b.rotation.y += dt * 0.9; b.visible = (this.night ?? 0) > 0.05;
    for (const m of b.children) m.material.opacity = 0.32 * (this.night ?? 0);
  }
  label() {
    const d = this.time || new Date(), hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
    const e = this.elev ?? 30, icon = e > 6 ? "☀️" : e > -2 ? "🌇" : "🌙";
    return `${icon} ${hh}:${mm}`;
  }
}
