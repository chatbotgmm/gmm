// 화질·속도 조절. 화면을 그리는 양이 렉의 주원인이라(갈매미 8마리 약 23만 + 지형 약 13만 삼각형, 그림자 때문에 두 번)
// 아래 값을 화질에 따라 바꾸고, 「자동」이면 프레임이 느릴 때 해상도를 낮춘다(빨라지면 다시 올림).
import * as THREE from "three";

const IS_TOUCH = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
const DPR = typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1;

export const QUALITY = {
  // model: 원본 갈매미 모델(약 3만 삼각형)을 불러올 때 남길 비율, liteModel: 가벼운 모델(assets/gulls, 약 1만)일 때. 바꾸면 다음에 열 때부터
  high: { name: "높음", model: 1, liteModel: 1, maxPR: Math.min(DPR, IS_TOUCH ? 1.5 : 2), minPR: Math.min(DPR, IS_TOUCH ? 1.5 : 2), shadow: 2048, soft: true, terrainSub: 4, dynamic: false, gullShadow: true },
  auto: { name: "자동", model: 0.4, liteModel: 1, maxPR: Math.min(DPR, IS_TOUCH ? 1.5 : 2), minPR: Math.min(DPR, IS_TOUCH ? 0.9 : 0.8), shadow: IS_TOUCH ? 1024 : 2048, soft: !IS_TOUCH, terrainSub: IS_TOUCH ? 2 : 4, dynamic: true, gullShadow: true },
  low:  { name: "낮음", model: 0.25, liteModel: 0.6, maxPR: Math.min(DPR, 1), minPR: Math.min(DPR, 0.8), shadow: 1024, soft: false, terrainSub: 2, dynamic: true, gullShadow: false },
};
// 자동·낮음의 minPR: 너무 낮추면 화면이 뿌옇게 보여 0.8~0.9배까지만 낮춤
const ORDER = ["auto", "high", "low"];
const KEY = "galmaemiman-quality";

export class Quality {
  constructor(renderer, sun, onTerrainSub) {
    this.renderer = renderer; this.sun = sun; this.onTerrainSub = onTerrainSub;
    let saved = null; try { saved = localStorage.getItem(KEY); } catch { /* 저장 못 해도 됨 */ }
    this.mode = QUALITY[saved] ? saved : "auto";
    this.ema = 16; this.lastCheck = 0; this.pr = 1;
    this.apply();
  }
  get cfg() { return QUALITY[this.mode]; }
  next() { this.mode = ORDER[(ORDER.indexOf(this.mode) + 1) % ORDER.length]; try { localStorage.setItem(KEY, this.mode); } catch { /* 무시 */ } this.apply(); return this.mode; }
  apply() {
    const c = this.cfg, r = this.renderer;
    this.pr = c.maxPR; r.setPixelRatio(this.pr); r.setSize(innerWidth, innerHeight);
    r.shadowMap.type = c.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (this.sun.shadow.mapSize.x !== c.shadow) {
      this.sun.shadow.mapSize.set(c.shadow, c.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }   // 새 크기로 다시 만듦
    }
    r.shadowMap.needsUpdate = true;
    this.onTerrainSub?.(c.terrainSub);
  }
  /** 매 프레임: 프레임 시간 평균을 보고 1초마다 해상도를 조금씩 내리거나 올림. */
  frame(dt, now) {
    this.ema += (dt * 1000 - this.ema) * 0.08;
    const c = this.cfg; if (!c.dynamic || now - this.lastCheck < 1000) return;
    this.lastCheck = now;
    let pr = this.pr;
    if (this.ema > 26 && pr > c.minPR) pr = Math.max(c.minPR, pr - 0.15);         // 40fps 아래면 낮춤
    else if (this.ema < 15 && pr < c.maxPR) pr = Math.min(c.maxPR, pr + 0.1);     // 66fps 넘으면 올림
    if (Math.abs(pr - this.pr) > 0.01) { this.pr = pr; this.renderer.setPixelRatio(pr); this.renderer.setSize(innerWidth, innerHeight); }
  }
  get fps() { return Math.round(1000 / Math.max(1, this.ema)); }
}
