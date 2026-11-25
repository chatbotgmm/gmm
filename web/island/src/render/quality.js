// 그래픽 설정 5단계: 최고 품질 → 높음 → 보통 → 낮음 → 성능 우선.
// 단계마다 바뀌는 것(main.js·views·decor·groundChunks가 cfg를 읽어 적용):
//  · 해상도(pixel ratio)와 자동 낮추기: 느리면 ① 그림자를 덜 자주 그리고 ② 해상도를 조금씩 내리고(바닥 1.0배 — 그 아래는 화면이 뭉개져 보임)
//    ③ 그래도 느리면 그림자 지도를 반으로. 빨라지면 해상도 → 그림자 간격 순으로 되돌림(그림자 지도 크기는 설정을 다시 고를 때까지 그대로)
//  · 휴대폰(터치): 높음은 2배까지(느리면 1.5배로), 소품 텍스처는 2k까지(화면이 작아 4k와 차이가 안 보이고 4k 13장은 추정 1.1 GB라 탭이 죽을 수 있음. 메모리 8 GB 이상 기기의 최고 품질만 4k)
//  · 그림자 지도 크기·부드러움·다시 그리는 간격(N프레임에 한 번), 성능 우선은 그림자 끔(발밑 원판)
//  · 땅 상세도(가까운 칸당 조각 수, 상세도 거리 배율, 멀리서 볼 때 한 단계 낮추기)
//  · 갈매미 실제 그림자를 드리우는 거리(그 밖은 발밑 원판)
//  · 덤불·꽃·자갈 양과 모양(단순한 모양 = 삼각형 1/4)
//  · 프레임 상한(성능 우선 30fps)
//  · 소품 모델 단계 lod(0~3, 원본 → 50% → 30% → 18%)와 그리기 거리 drawDist(m, 그 밖의 나무·건물·소품·갈매미는 안 그림, 안개로 가림)
//  · 발자국 개수(눈·모래 위, 성능 우선은 0)
//  · 가로등 실제 빛(가까운 것 N개만 주변 갈매미·건물·땅을 밝힘, 성능 우선은 0)
//  · 갈매미 모델 정밀도(liteModel: 남길 삼각형 비율, 다음에 열 때부터). 나중에 단계별 모델 파일을 만들면 여기서 고르게 연결
import * as THREE from "three";

const IS_TOUCH = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
const DPR = typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1;
const pr = (pc, touch) => Math.min(DPR, IS_TOUCH ? touch : pc);
const MEM = (typeof navigator !== "undefined" && navigator.deviceMemory) || (IS_TOUCH ? 4 : 8);   // 기기 메모리(GB, 크롬만 알려 줌. 모르면 폰 4·PC 8로 봄)

export const QUALITY = {
  ultra: { name: "최고 품질", maxPR: pr(2, 2), minPR: pr(2, 2), dynamic: false, shadows: true, shadow: 4096, soft: true, shadowEvery: 1,
    terrainSub: 4, lodScale: 1.7, farDrop: false, gullShadowDist: 999, decor: { density: 1, simple: false, bushShadow: true }, lampLights: 8, footprints: 500, lod: IS_TOUCH && MEM < 8 ? 1 : 0, drawDist: 260, fpsCap: 0, model: 1, liteModel: 1 },
  high:  { name: "높음", maxPR: pr(2, 2), minPR: pr(2, 1.5), dynamic: IS_TOUCH, shadows: true, shadow: 2048, soft: true, shadowEvery: 1,
    terrainSub: 4, lodScale: 1.2, farDrop: false, gullShadowDist: 45, decor: { density: 1, simple: false, bushShadow: true }, lampLights: 6, footprints: 400, lod: IS_TOUCH ? 1 : 0, drawDist: 170, fpsCap: 0, model: 1, liteModel: 1 },
  medium: { name: "보통", maxPR: pr(1.75, 1.5), minPR: pr(1, 1), dynamic: true, shadows: true, shadow: IS_TOUCH ? 1024 : 2048, soft: !IS_TOUCH, shadowEvery: 2,
    terrainSub: IS_TOUCH ? 2 : 4, lodScale: 1, farDrop: true, gullShadowDist: 28, decor: { density: 0.8, simple: true, bushShadow: true }, lampLights: 4, footprints: 200, lod: 1, drawDist: 120, fpsCap: 0, model: 0.4, liteModel: 1 },
  low:   { name: "낮음", maxPR: pr(1, 1.25), minPR: pr(0.85, 1), dynamic: true, shadows: true, shadow: 1024, soft: false, shadowEvery: 3,
    terrainSub: 2, lodScale: 0.7, farDrop: true, gullShadowDist: 0, decor: { density: 0.5, simple: true, bushShadow: false }, lampLights: 2, footprints: 80, lod: 2, drawDist: 90, fpsCap: 0, model: 0.25, liteModel: 0.6 },
  perf:  { name: "성능 우선", maxPR: pr(0.7, 0.6), minPR: pr(0.7, 0.6), dynamic: false, shadows: false, shadow: 512, soft: false, shadowEvery: 4,
    terrainSub: 1, lodScale: 0.5, farDrop: true, gullShadowDist: 0, decor: { density: 0.25, simple: true, bushShadow: false }, lampLights: 0, footprints: 0, lod: 3, drawDist: 70, fpsCap: 30, model: 0.2, liteModel: 0.4 },
};
export const ORDER = ["ultra", "high", "medium", "low", "perf"];
export const QUALITY_NOTE = {
  ultra: "가장 선명하고 그림자가 촘촘해요. 좋은 PC용",
  high: "선명한 화면, 가까운 갈매미 그림자",
  medium: "기본값. 느려지면 그림자를 덜 자주 그리고 해상도를 조금 낮춰요",
  low: "그림자·땅·소품을 가볍게",
  perf: "그림자 끔, 30fps 상한. 오래된 휴대폰용",
};
const KEY = "galmaemiman-quality";
const OLD = { auto: "medium", high: "high", low: "low" };                       // 예전 저장값(자동·높음·낮음)

export class Quality {
  /** onChange(cfg): 단계가 바뀌면 불림(땅·소품·갈매미 그림자 등은 main이 적용) */
  constructor(renderer, sun, onChange) {
    this.renderer = renderer; this.sun = sun; this.onChange = onChange;
    let saved = null; try { saved = localStorage.getItem(KEY); } catch { /* 저장 못 해도 됨 */ }
    saved = OLD[saved] && !QUALITY[saved] ? OLD[saved] : saved;
    this.mode = QUALITY[saved] ? saved : (IS_TOUCH && MEM <= 2 ? "low" : "medium");   // 처음: 보통(메모리 2 GB 이하 폰은 낮음)
    this.ema = 16; this.lastCheck = 0; this.pr = 1; this.frameNo = 0; this.lastFrame = 0; this.adapt = 0;   // adapt: 자동 낮추기 단계(0 · 1 그림자 덜 자주 · 2 그림자 지도 반)
    this.apply();
  }
  get cfg() { return QUALITY[this.mode]; }
  set(mode) { if (!QUALITY[mode]) return; this.mode = mode; try { localStorage.setItem(KEY, mode); } catch { /* 무시 */ } this.apply(); }
  next() { this.set(ORDER[(ORDER.indexOf(this.mode) + 1) % ORDER.length]); return this.mode; }
  apply() {
    const c = this.cfg, r = this.renderer;
    this.pr = c.maxPR; r.setPixelRatio(this.pr); r.setSize(innerWidth, innerHeight); this.adapt = 0;
    r.shadowMap.enabled = c.shadows; this.shadowMap(c.shadow, c.soft);
    r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = true;                 // 그림자는 shadowEvery 프레임마다(frame)
    this.sun.castShadow = c.shadows;
    this.onChange?.(c);
  }
  /** 그림자 지도 크기·부드러움(크기가 바뀌면 새로 만듦) */
  shadowMap(size, soft) {
    const r = this.renderer, type = soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (r.shadowMap.type !== type) { r.shadowMap.type = type; r.shadowMap.needsUpdate = true; }
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }   // 새 크기로 다시 만듦
      r.shadowMap.needsUpdate = true;
    }
  }
  /** 프레임 상한: 이번 프레임을 건너뛸지(성능 우선 30fps) */
  skip(now) {
    const cap = this.cfg.fpsCap; if (!cap) return false;
    if (now - this.lastFrame < 1000 / cap - 2) return true;
    this.lastFrame = now; return false;
  }
  /** 매 프레임: 그림자 다시 그리기 간격, 자동 낮추기(1초마다 한 걸음씩) */
  frame(dt, now) {
    this.frameNo++;
    const c = this.cfg;
    if (c.shadows && this.frameNo % (c.shadowEvery * (this.adapt ? 2 : 1)) === 0) this.renderer.shadowMap.needsUpdate = true;
    this.ema += (dt * 1000 - this.ema) * 0.08;
    if (!c.dynamic || now - this.lastCheck < 1000) return;
    this.lastCheck = now;
    let pr = this.pr;
    if (this.ema > 26) {                                                            // 40fps 아래: ① 그림자 덜 자주 → ② 해상도(바닥까지) → ③ 그림자 지도 반(딱딱한 가장자리)
      if (!this.adapt && c.shadows) this.adapt = 1;
      else if (pr > c.minPR) pr = Math.max(c.minPR, pr - 0.15);
      else if (this.adapt === 1 && c.shadow > 1024) { this.adapt = 2; this.shadowMap(c.shadow / 2, false); }
    } else if (this.ema < 15) {                                                     // 66fps 넘으면 해상도부터 되돌림
      if (pr < c.maxPR) pr = Math.min(c.maxPR, pr + 0.1);
      else if (this.adapt === 1) this.adapt = 0;
    }
    if (Math.abs(pr - this.pr) > 0.01) { this.pr = pr; this.renderer.setPixelRatio(pr); this.renderer.setSize(innerWidth, innerHeight); }
  }
  get fps() { return Math.round(1000 / Math.max(1, this.ema)); }
}
