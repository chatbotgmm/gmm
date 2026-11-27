// 물 깊이 창(오픈월드 1-A): 보는 곳을 따라가는 W×W칸 창의 물 깊이 텍스처 값을 보기 격자에서 계산한다(water.js는 받아서 그리기만).
//  · 깊이(m) = 물 표면 − 바닥 높이 + 가장 가까운 얕은 곳(높이 ≥ −0.6)까지 칸 수 × 0.07. 예전(water.js setGrid)과 같은 식.
//  · 물가 거리는 DIST_CAP칸까지만 센다: 그 너머는 깊이가 1.66 m 이상이라 물빛(1.6 m에서 다 진해짐)·반짝임·불투명도가 이미 끝값이라 모습이 같다.
//  · 창 가운데는 32칸 단위로만 옮긴다(옮길 때만 다시 계산). 땅을 바꾸면 dirty로 다시.
//  · 나중에 바다 세부(sea-detail)의 바다/연못 비트가 합쳐지면, 여기서 sea 비트를 곱해 한 채널을 더 넘기면 된다.
import { WATER_Y, toGridX, toGridZ, toWorldX, toWorldZ } from "../config.js";
import { WCH, WCH_SHIFT, WCH_MASK } from "../world/worldGen.js";

export const DIST_CAP = 12, STEP = 32;
/** 창 하나 계산: 왼위 칸 (x0, z0), 크기 W → Uint8Array(W*W) (깊이 0~3 m를 0~255로) */
export function waterDepths(view, x0, z0, W) {
  const N = W * W, el = new Float64Array(N), dist = new Int16Array(N).fill(-1), q = new Int32Array(N);
  let qt = 0;
  for (let tz = z0 >> WCH_SHIFT; tz <= (z0 + W - 1) >> WCH_SHIFT; tz++) for (let tx = x0 >> WCH_SHIFT; tx <= (x0 + W - 1) >> WCH_SHIFT; tx++) {   // 32칸 타일마다 데이터를 한 번만 꺼냄
    const ax = Math.max(x0, tx * WCH), bx = Math.min(x0 + W, tx * WCH + WCH), az = Math.max(z0, tz * WCH), bz = Math.min(z0 + W, tz * WCH + WCH);
    const inner = !(bx <= 0 || bz <= 0 || ax >= view.inner.w || az >= view.inner.h), d = inner ? null : view.chunkData(tx, tz);
    for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) {
      const e = inner ? view.elev(x, z) : d.elev[(z & WCH_MASK) * WCH + (x & WCH_MASK)] / 1000, i = (z - z0) * W + (x - x0);
      el[i] = e; if (e >= -0.6) { dist[i] = 0; q[qt++] = i; }
    }
  }
  for (let h = 0; h < qt; h++) {
    const i = q[h], d = dist[i]; if (d >= DIST_CAP) continue;
    const x = i % W, z = (i - x) / W;
    if (x > 0 && dist[i - 1] < 0) { dist[i - 1] = d + 1; q[qt++] = i - 1; }
    if (x < W - 1 && dist[i + 1] < 0) { dist[i + 1] = d + 1; q[qt++] = i + 1; }
    if (z > 0 && dist[i - W] < 0) { dist[i - W] = d + 1; q[qt++] = i - W; }
    if (z < W - 1 && dist[i + W] < 0) { dist[i + W] = d + 1; q[qt++] = i + W; }
  }
  const data = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const dd = dist[i] < 0 ? DIST_CAP : dist[i], d = Math.max(0, Math.min(3, WATER_Y - el[i] + dd * 0.07)); data[i] = Math.round(d / 3 * 255); }
  return data;
}

export class WaterWindow {
  constructor(water, view, size = 256) { this.water = water; this.view = view; this.size = size; this.cx = NaN; this.cz = NaN; this.dirty = true; this.ms = 0; }
  setSize(size) { if (size !== this.size) { this.size = size; this.dirty = true; } }
  /** focus(월드 좌표) 둘레로 창을 맞춤. 가운데가 32칸 넘게 옮겨졌거나 dirty면 다시 계산해 water.userData.setWindow로 넘긴다. 다시 계산했으면 true */
  update(focus, force = false) {
    const cx = Math.round(toGridX(focus.x) / STEP) * STEP, cz = Math.round(toGridZ(focus.z) / STEP) * STEP;
    if (!force && !this.dirty && cx === this.cx && cz === this.cz) return false;
    const W = this.size, x0 = cx - W / 2, z0 = cz - W / 2, t = performance.now();
    const data = waterDepths(this.view, x0, z0, W);
    this.water.userData.setWindow(data, W, toWorldX(x0), toWorldZ(z0));
    this.cx = cx; this.cz = cz; this.dirty = false; this.ms = performance.now() - t;
    return true;
  }
}
