// 물 깊이 창(오픈월드 1-A): 보는 곳을 따라가는 W×W칸 창의 물가 자료(RGBA, world/shore.js와 같은 뜻)를 보기 격자에서 계산한다(water.js는 받아서 그리기만).
//  · R 깊이(m) = 물 표면 − 바닥 높이 + 가장 가까운 얕은 곳(높이 ≥ −0.6)까지 칸 수 × 0.07.
//    거리는 DIST_CAP칸까지만 센다: 그 너머는 깊이가 1.66 m 이상이라 물빛(1.6 m에서 다 진해짐)·반짝임·불투명도가 이미 끝값이라 모습이 같다.
//  · G 해안선까지 거리(±8칸) · B 가장 가까운 땅이 모래사장인가 · A 파도 세기: 시작 섬 안이든 바깥 생성 섬이든 같은 규칙(바깥 섬 해변에도 파도).
//  · 바다 비트: 시작 섬 안은 시작 섬 격자 가장자리에서 퍼진 물(섬 안에 판 연못은 빠짐, 창이 어디 있든 같음),
//    바깥은 창 가장자리의 물·시작 섬 바다에서 창 안으로 퍼진 물. 창 끝(보는 곳에서 112칸 넘게 떨어짐)은 둘레를 못 봐서 조금 다를 수 있음.
//  · 창 가운데는 32칸 단위로만 옮긴다(옮길 때만 다시 계산). 땅을 바꾸면 dirty로 다시.
import { toGridX, toGridZ, toWorldX, toWorldZ } from "../config.js";
import { WCH, WCH_SHIFT, WCH_MASK } from "../world/worldGen.js";
import { GROUND_TYPES } from "../data/types.js";
import { shoreCore, waterMask, floodSea } from "../world/shore.js";

export const DIST_CAP = 12, STEP = 32;
const SAND = GROUND_TYPES.indexOf("Sand");

/** 창 하나 물가 자료: 왼위 칸 (x0, z0), 크기 W → { data: RGBA Uint8Array(W*W*4), sd: 해안선 거리 } */
export function shoreWindow(view, x0, z0, W) {
  const N = W * W, el = new Float64Array(N), sand = new Uint8Array(N), inner = new Uint8Array(N), g = view.inner, B = g.box, BW = B.x1 - B.x0, BH = B.z1 - B.z0;
  for (let tz = z0 >> WCH_SHIFT; tz <= (z0 + W - 1) >> WCH_SHIFT; tz++) for (let tx = x0 >> WCH_SHIFT; tx <= (x0 + W - 1) >> WCH_SHIFT; tx++) {   // 32칸 타일마다 데이터를 한 번만 꺼냄
    const ax = Math.max(x0, tx * WCH), bx = Math.min(x0 + W, tx * WCH + WCH), az = Math.max(z0, tz * WCH), bz = Math.min(z0 + W, tz * WCH + WCH);
    const hit = !(bx <= B.x0 || bz <= B.z0 || ax >= B.x1 || az >= B.z1), d = view.chunkData(tx, tz);   // hit: 시작 섬 상자에 걸친 타일
    const sim = !hit && view.sim && g.isResidentChunk(tx, tz);                        // 바깥이라도 바꾼 칸이 있는 청크는 시뮬 칸 그대로(판 연못·메운 땅)
    for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) {
      const i = (z - z0) * W + (x - x0);
      if (hit && g.inBox(x, z)) { const c = g.get(x, z); el[i] = c.elevation; sand[i] = c.groundType === "Sand" && c.elevation <= 0.02 ? 1 : 0; inner[i] = 1; }
      else if (sim) { const c = g.get(x, z); el[i] = c.elevation; sand[i] = c.groundType === "Sand" && c.elevation <= 0.02 ? 1 : 0; }
      else { const j = (z & WCH_MASK) * WCH + (x & WCH_MASK); el[i] = d.elev[j] / 1000; sand[i] = d.ground[j] === SAND && d.elev[j] <= 20 ? 1 : 0; }
    }
  }
  const water = waterMask(el), wet = new Uint8Array(N), seeds = [];
  const isea = startSea(g, BW, BH);                                                // 시작 섬 상자 가장자리에서 퍼진 바다(연못 빠짐)
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x; if (!water[i]) continue;
    if (inner[i]) { if (isea[(z + z0 - B.z0) * BW + (x + x0 - B.x0)]) { wet[i] = 1; seeds.push(i); } }                    // 시작 섬 안: 시작 섬 바다만(연못은 막음)
    else { wet[i] = 1; if (x === 0 || z === 0 || x === W - 1 || z === W - 1) seeds.push(i); }
  }
  return shoreCore(W, W, el, sand, water, floodSea(W, W, wet, seeds), DIST_CAP);
}
/** 시작 섬 상자의 바다(가장자리에서 물로만 퍼진 칸). 칸이 바뀔 때만(version) 다시 셈 */
const seaCache = new WeakMap();
function startSea(g, BW, BH) {
  const c = seaCache.get(g); if (c && c.v === g.version) return c.sea;
  const el = new Float64Array(BW * BH);
  for (let z = 0; z < BH; z++) for (let x = 0; x < BW; x++) el[z * BW + x] = g.get(x + g.box.x0, z + g.box.z0).elevation;
  const sea = floodSea(BW, BH, waterMask(el), null); seaCache.set(g, { v: g.version, sea }); return sea;
}
/** 창 하나 깊이만: Uint8Array(W*W) (깊이 0~3 m를 0~255로) */
export function waterDepths(view, x0, z0, W) {
  const { data } = shoreWindow(view, x0, z0, W), out = new Uint8Array(W * W);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4];
  return out;
}

export class WaterWindow {
  constructor(water, view, size = 256) { this.water = water; this.view = view; this.size = size; this.cx = NaN; this.cz = NaN; this.dirty = true; this.ms = 0; }
  setSize(size) { if (size !== this.size) { this.size = size; this.dirty = true; } }
  /** focus(월드 좌표) 둘레로 창을 맞춤. 가운데가 32칸 넘게 옮겨졌거나 dirty면 다시 계산해 water.userData.setWindow로 넘긴다. 다시 계산했으면 true */
  update(focus, force = false) {
    const cx = Math.round(toGridX(focus.x) / STEP) * STEP, cz = Math.round(toGridZ(focus.z) / STEP) * STEP;
    if (!force && !this.dirty && cx === this.cx && cz === this.cz) return false;
    const W = this.size, x0 = cx - W / 2, z0 = cz - W / 2, t = performance.now();
    const { data, sd } = shoreWindow(this.view, x0, z0, W);
    this.water.userData.setWindow(data, W, toWorldX(x0), toWorldZ(z0), { view: this.view, x0, z0, sd });
    this.cx = cx; this.cz = cz; this.dirty = false; this.ms = performance.now() - t;
    return true;
  }
}
