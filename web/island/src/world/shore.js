// 바다 물가 자료(순수 계산, 그림 없음): 칸마다 물 깊이 · 해안선까지 거리 · 모래사장인가 · 파도 세기. render/water.js가 텍스처로 올려 파도를 그림.
import { WATER_Y, SEA_LEVEL } from "../config.js";

export const SD_SCALE = 16;                // G 채널: 128 + 거리(칸) × 16 → ±8칸

/** 칸마다: 물 깊이(R) · 해안선까지 거리(G) · 가장 가까운 땅이 모래사장인가(B) · 파도 세기(A). 순수 계산(시험용으로 내보냄). */
export function shoreData(grid) {
  const W = grid.w, H = grid.h, N = W * H, el = new Float64Array(N), sand = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const c = grid.cells[i]; el[i] = c.elevation; sand[i] = c.groundType === "Sand" && c.elevation <= 0.02 ? 1 : 0; }
  const water = waterMask(el);
  return { ...shoreCore(W, H, el, sand, water, floodSea(W, H, water, null)), W, H };
}

/** 높이 → 물 칸(1) */
export function waterMask(el) { const w = new Uint8Array(el.length); for (let i = 0; i < el.length; i++) w[i] = el[i] < SEA_LEVEL ? 1 : 0; return w; }

/** 바다와 이어진 물: seeds(칸 번호 목록)에서 wet 칸으로만 퍼짐. seeds가 null이면 가장자리의 wet 칸(지도 밖은 바다) — 섬 안에 판 연못은 빠짐 */
export function floodSea(W, H, wet, seeds) {
  const N = W * H, sea = new Uint8Array(N), q = new Int32Array(N); let qn = 0;
  const seed = i => { if (wet[i] && !sea[i]) { sea[i] = 1; q[qn++] = i; } };
  if (seeds) for (const i of seeds) seed(i);
  else { for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); } for (let z = 0; z < H; z++) { seed(z * W); seed(z * W + W - 1); } }
  for (let h = 0; h < qn; h++) { const i = q[h], x = i % W;
    if (x > 0) seed(i - 1); if (x < W - 1) seed(i + 1); if (i >= W) seed(i - W); if (i < N - W) seed(i + W); }
  return sea;
}

/** 물가 자료 본체(격자 하나 또는 보는 곳 둘레 창 하나): el 높이(m) · sand 모래사장 땅(1) · water 물 칸 · sea 바다와 이어진 물 →
 *  { data: RGBA, sd: 해안선 거리(칸) }. distCap: 깊이에 쓰는 '가장 가까운 얕은 곳까지 칸 수'를 몇 칸까지 셀까(창은 12, 그 너머는 모습이 같음) */
export function shoreCore(W, H, el, sand, water, sea, distCap = Infinity) {
  const N = W * H, data = new Uint8Array(N * 4);
  // 땅에서 먼 바다일수록 더 깊게(섬 사이 넓은 바다가 진한 파랑): 가장 가까운 얕은 땅까지 칸 수(너비 우선)
  const dist = new Int16Array(N).fill(-1), q = new Int32Array(N); let qn = 0;
  for (let i = 0; i < N; i++) if (el[i] >= -0.6) { dist[i] = 0; q[qn++] = i; }
  const visit = (ni, v) => { if (dist[ni] < 0) { dist[ni] = v; q[qn++] = ni; } };
  for (let h = 0; h < qn; h++) { const i = q[h]; if (dist[i] >= distCap) continue; const x = i % W, v = dist[i] + 1;
    if (x > 0) visit(i - 1, v); if (x < W - 1) visit(i + 1, v); if (i >= W) visit(i - W, v); if (i < N - W) visit(i + W, v); }
  const far = Number.isFinite(distCap) ? distCap : 0;
  // 탁 트인 정도: 둘레 13×13칸 중 바닷물 비율(지도 밖은 바다로 셈). 좁은 물길(폭 3칸 ≈ 0.23)은 파도가 약하고 바닷가(≈ 0.5)는 셈
  const sat = new Int32Array((W + 1) * (H + 1));
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) sat[(z + 1) * (W + 1) + x + 1] = sea[z * W + x] + sat[z * (W + 1) + x + 1] + sat[(z + 1) * (W + 1) + x] - sat[z * (W + 1) + x];
  const RAD = 6, AREA = (2 * RAD + 1) ** 2, open = new Float32Array(N);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const x0 = Math.max(0, x - RAD), x1 = Math.min(W, x + RAD + 1), z0 = Math.max(0, z - RAD), z1 = Math.min(H, z + RAD + 1);
    const inside = (x1 - x0) * (z1 - z0), n = sat[z1 * (W + 1) + x1] - sat[z0 * (W + 1) + x1] - sat[z1 * (W + 1) + x0] + sat[z0 * (W + 1) + x0];
    open[z * W + x] = (n + AREA - inside) / AREA;
  }
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  // 해안선까지 거리(8방향 챔퍼, 칸): 땅 칸은 가장 가까운 물까지, 물 칸은 가장 가까운 땅까지 + 그 칸 번호
  const toWater = chamfer(W, H, water, 1), toLand = chamfer(W, H, water, 0);
  const sd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const isW = water[i] === 1;
    sd[i] = isW ? -(toLand.d[i] - 0.5) : toWater.d[i] - 0.5;                        // 이웃한 물·땅 칸이 ∓0.5 → 칸 경계가 0
    const land = isW ? toLand.src[i] : i, wat = isW ? i : toWater.src[i];
    const beach = land >= 0 ? sand[land] : 0;
    const power = wat >= 0 && sea[wat] ? smooth(0.2, 0.38, open[wat]) : 0;
    const d = Math.max(0, Math.min(3, WATER_Y - el[i] + (dist[i] < 0 ? far : dist[i]) * 0.07));
    data[i * 4] = Math.round(d / 3 * 255);
    data[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(128 + sd[i] * SD_SCALE)));
    data[i * 4 + 2] = beach * 255; data[i * 4 + 3] = Math.round(power * 255);
  }
  return { data, sd };
}

/** 8방향 챔퍼 거리(가로세로 1, 대각선 √2): 각 칸에서 가장 가까운 src 칸까지 거리와 그 칸 번호(없으면 1e9, -1). */
function chamfer(W, H, kind, want) {
  const N = W * H, d = new Float32Array(N).fill(1e9), src = new Int32Array(N).fill(-1), D2 = Math.SQRT2;
  for (let i = 0; i < N; i++) if (kind[i] === want) { d[i] = 0; src[i] = i; }
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x; let b = d[i], s = src[i], j;
    if (x > 0 && d[j = i - 1] + 1 < b) { b = d[j] + 1; s = src[j]; }
    if (z > 0) {
      if (d[j = i - W] + 1 < b) { b = d[j] + 1; s = src[j]; }
      if (x > 0 && d[j = i - W - 1] + D2 < b) { b = d[j] + D2; s = src[j]; }
      if (x < W - 1 && d[j = i - W + 1] + D2 < b) { b = d[j] + D2; s = src[j]; }
    }
    d[i] = b; src[i] = s;
  }
  for (let z = H - 1; z >= 0; z--) for (let x = W - 1; x >= 0; x--) {
    const i = z * W + x; let b = d[i], s = src[i], j;
    if (x < W - 1 && d[j = i + 1] + 1 < b) { b = d[j] + 1; s = src[j]; }
    if (z < H - 1) {
      if (d[j = i + W] + 1 < b) { b = d[j] + 1; s = src[j]; }
      if (x < W - 1 && d[j = i + W + 1] + D2 < b) { b = d[j] + D2; s = src[j]; }
      if (x > 0 && d[j = i + W - 1] + D2 < b) { b = d[j] + D2; s = src[j]; }
    }
    d[i] = b; src[i] = s;
  }
  return { d, src };
}

/** 쓸려 올라오는 물 판이 덮을 칸: 바다 쪽 모래사장 땅(해안선에서 1.6칸 안) + 그 둘레 물 칸. */
export function swashCells(grid, data, sd) {         // grid는 크기만 봄({ w, h })
  const W = grid.w, H = grid.h, pick = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (sd[i] <= 0 || sd[i] > 1.6 || data[i * 4 + 2] === 0 || data[i * 4 + 3] < 5) continue;
    const x = i % W, z = (i / W) | 0; pick[i] = 1;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, nz = z + dz; if (nx >= 0 && nz >= 0 && nx < W && nz < H && sd[nz * W + nx] < 0) pick[nz * W + nx] = 1; }
  }
  return pick;
}
