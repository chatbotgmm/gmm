// 바깥 세계 생성기(오픈월드 1-A): 씨앗 + 청크 좌표 → 늘 같은 지형. 시작 섬(칸 0..191)은 islandGen이 따로 만들고, 여기는 그 바깥.
// 장르 일반 구조(절차 생성 + 걸어가면 펼쳐지는 세계)만 쓴다. three.js에 기대지 않는 순수 함수라 node 시험에서 그대로 부른다.
//  · 결정성: Math.imul 정수 해시 + 사칙연산·Math.floor·Math.sqrt만 쓴다(IEEE에서 정확히 반올림되어 어느 엔진에서나 같은 값).
//    sin·cos·exp·pow·hypot·atan2는 쓰지 않는다(엔진마다 1ulp씩 다를 수 있음). 방향은 아래 표(DIR16)의 상수로.
//  · 음수 좌표: 청크는 x >> 5, 청크 안 칸은 x & 31. 칸막이(MACRO 192칸)는 Math.floor(x / 192). %·|0은 음수에 쓰지 않는다.
//  · 높이는 Int16(높이 × 1000)으로 담는다. Float32는 경계값을 뒤집는다(Math.fround(-0.2) < -0.2).
//  · 섬은 칸막이마다 0~1개(군도: 본섬 + 위성 0~3). 한 섬의 영향은 최대 약 91칸이라 둘레 3×3 칸막이를 고정된 순서로 보고 max로 합친다
//    → 청크·칸막이 경계에서 어느 쪽이 계산해도 같은 값(이음매 없음).
import { SEABED } from "../config.js";
import { GROUND_TYPES } from "../data/types.js";

export const GEN_WORLD_V = 1;                 // 생성 규칙 판. 바꾸면 올리고(나중 저장 델타가 이 판을 기준으로 함) 옛 판을 남긴다
export const WCH = 32, WCH_SHIFT = 5, WCH_MASK = 31;   // 데이터 청크 32×32칸
export const MACRO = 192;                     // 섬 칸막이(시작 섬 격자와 같은 크기: 칸막이 (0,0) = 시작 섬)
export const START_BOX = { x0: 0, z0: 0, x1: 192, z1: 192 };   // 시작 섬 상자(이 안에는 바깥 섬이 없음)
export const START_CLEAR = 30;                // 이웃 칸막이의 보통 섬은 시작 섬 상자에서 이만큼(칸) 떨어져야 놓음(이웃 군도는 따로 40~60칸)
const P_ISLAND = 0.7, WG_BEACH = 4, WG_PALM_BEACH = 6, WG_TERRACE = 0.9;
const SEABED_M = Math.round(SEABED * 1000);   // -1000
const GI = Object.fromEntries(GROUND_TYPES.map((t, i) => [t, i]));
export const KINDS = ["forest", "mine", "meadow", "palm", "shell"];   // 시작 섬 작은 섬 5종과 같은 결

// 16방향 단위 벡터(cos, sin of k·π/8). 상수라 엔진마다 같다.
const DIR16 = [
  [1, 0], [0.9238795325112867, 0.3826834323650898], [0.7071067811865476, 0.7071067811865475], [0.3826834323650898, 0.9238795325112867],
  [0, 1], [-0.3826834323650897, 0.9238795325112867], [-0.7071067811865475, 0.7071067811865476], [-0.9238795325112867, 0.3826834323650899],
  [-1, 0], [-0.9238795325112868, -0.3826834323650897], [-0.7071067811865477, -0.7071067811865475], [-0.3826834323650903, -0.9238795325112865],
  [0, -1], [0.38268343236509, -0.9238795325112866], [0.7071067811865474, -0.7071067811865477], [0.9238795325112865, -0.3826834323650904],
];

// ---- 정수 해시(Math.imul만) → 0 이상 1 미만
export function hash32(x, z, s) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(s, 0x5bd1e995);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
const u01 = (x, z, s) => hash32(x, z, s) / 4294967296;
/** 값 노이즈(격자 꼭짓점 해시를 부드럽게 보간). 표가 없어 되풀이 무늬가 없다. */
function wvnoise(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = u01(ix, iz, s), b = u01(ix + 1, iz, s), c = u01(ix, iz + 1, s), d = u01(ix + 1, iz + 1, s);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}
function wfbm(x, z, s) { return (4 * wvnoise(x, z, s) + 2 * wvnoise(x * 2, z * 2, s + 31) + wvnoise(x * 4, z * 4, s + 62)) / 7; }

// ---- 섬 배치
const seedOf = seed => (seed ?? 7) | 0;
function mkIsland(x, z, r, A, kind, beach) { const b = r * (1 + A / 2) + WG_BEACH + 1; return { x, z, r, A, kind, beach, bx0: x - b, bx1: x + b, bz0: z - b, bz1: z + b }; }
const boxGap = (I, B) => Math.max(B.x0 - I.bx1, I.bx0 - B.x1, B.z0 - I.bz1, I.bz0 - B.z1);   // 상자 사이 체비쇼프 틈(겹치면 음수)
/** 시작 섬 이웃 군도: 씨앗으로 동·남·서·북 중 한쪽, 시작 섬 해안에서 약 40~60칸. 해안에서 빈 바다만 보이지 않게(그리기 반경 49~84 m). */
const NEIGHBOR_D = [66.3, 73.0, 69.7, 70.1];   // 방향별 시작 섬 땅이 가운데에서 뻗은 거리(씨앗 20개 평균, 잰 값) — 그 바깥으로 틈 47칸(씨앗 24개로 잰 해안~해안 44.3~57.6칸)
export function neighborArchipelago(seed) {
  const s = seedOf(seed), k = hash32(s, 0, 101) & 3, d = DIR16[k * 4], r = 18 + 6 * u01(s, 1, 102);
  const D = NEIGHBOR_D[k] + 47 + r, cx = MACRO / 2 + d[0] * D, cz = MACRO / 2 + d[1] * D;
  const kind = KINDS[[0, 2, 3][hash32(s, 2, 103) % 3]];
  const out = [mkIsland(cx, cz, r, 0.3, kind, kind === "palm" ? WG_PALM_BEACH : WG_BEACH)];
  for (let i = 0; i < 2; i++) {                                          // 위성 둘: 바깥쪽 반원(시작 섬 쪽으로는 본섬보다 가까워지지 않음)
    const a = DIR16[(k * 4 + (i ? 3 : -3) + 16) & 15], rs = 6 + 5 * u01(s, i, 104), gap = 7 + 7 * u01(s, i, 105), dd = r + gap + rs;
    const sk = KINDS[hash32(s, i, 106) % 5];
    out.push(mkIsland(cx + a[0] * dd, cz + a[1] * dd, rs, 0.4, sk, sk === "palm" ? WG_PALM_BEACH : WG_BEACH));
  }
  return { dir: k, islands: out };
}
const nbCache = new Map();
function neighborOf(seed) { let v = nbCache.get(seed); if (!v) { if (nbCache.size > 16) nbCache.clear(); v = neighborArchipelago(seed); nbCache.set(seed, v); } return v; }

/** 칸막이 (mi, mj)의 섬들(본섬 + 위성). 시작 섬 칸막이와 이웃 군도가 든 칸막이는 비고, 시작 섬 이웃 칸막이는 상자에서 START_CLEAR칸 밖에만 놓음. */
export function macroIslands(seed, mi, mj) {
  const s = seedOf(seed);
  if (mi === 0 && mj === 0) return [];
  const nb = neighborOf(s), m = nb.islands[0];
  if (Math.floor(m.x / MACRO) === mi && Math.floor(m.z / MACRO) === mj) return [];
  if (u01(mi, mj, s + 1) >= P_ISLAND) return [];
  const u = u01(mi, mj, s + 2), r = 14 + u * u * 26;
  const cx = (mi + 0.25 + 0.5 * u01(mi, mj, s + 3)) * MACRO, cz = (mj + 0.25 + 0.5 * u01(mi, mj, s + 4)) * MACRO;
  const kind = KINDS[hash32(mi, mj, s + 5) % 5];
  const main = mkIsland(cx, cz, r, 0.5, kind, kind === "palm" ? WG_PALM_BEACH : WG_BEACH);
  const near = mi >= -1 && mi <= 1 && mj >= -1 && mj <= 1, ok = I => !near || boxGap(I, START_BOX) >= START_CLEAR;
  if (!ok(main)) return [];
  const out = [main], ns = [0, 1, 1, 2, 2, 3][hash32(mi, mj, s + 6) % 6], a0 = hash32(mi, mj, s + 7) & 15;
  for (let i = 0; i < ns; i++) {                                        // 위성: 본섬 해안에서 틈 6~20칸(다리로 건널 만한 거리), 방향은 서로 고르게
    const a = DIR16[(a0 + i * 5 + (hash32(mi, mj, s + 8 + i) & 1)) & 15], rs = 5 + 7 * u01(mi + i, mj, s + 9), gap = 6 + 14 * u01(mi, mj + i, s + 10);
    const dd = r + gap + rs, sk = KINDS[hash32(mi + i, mj, s + 11) % 5];
    const sat = mkIsland(cx + a[0] * dd, cz + a[1] * dd, rs, 0.5, sk, sk === "palm" ? WG_PALM_BEACH : WG_BEACH);
    if (ok(sat)) out.push(sat);
  }
  return out;
}
const macroCache = new Map();   // 칸막이 열쇠는 작은 정수(Smi): 소프트 한계 ±16384칸 = 칸막이 ±86
function macroOf(s, mi, mj) {
  const k = (mj + 128) * 256 + (mi + 128); let v = macroCache.get(k);
  if (!v || v.s !== s) { if (macroCache.size > 512) macroCache.clear(); v = { s, list: macroIslands(s, mi, mj) }; macroCache.set(k, v); }
  return v.list;
}
/** 칸 (x, z) 둘레(그 칸막이 + 둘레 8칸막이 + 이웃 군도)의 섬. 순서가 고정이라 어디서 불러도 같은 목록. */
export function islandsAround(seed, x, z) {
  const s = seedOf(seed), mi = Math.floor(x / MACRO), mj = Math.floor(z / MACRO), out = [...neighborOf(s).islands];
  for (let j = mj - 1; j <= mj + 1; j++) for (let i = mi - 1; i <= mi + 1; i++) for (const I of macroOf(s, i, j)) out.push(I);
  return out;
}

// ---- 칸 하나의 높이·바닥(섬 안쪽 거리 t로)
/** t(해안에서 안쪽으로 몇 칸, 바깥이면 음수)와 섬 종류 → [높이×1000, 바닥 번호]. 시작 섬과 같은 규칙: 잔디 0 → 모래 해변(0~−0.15) → 바닷속 −0.45 − 0.12·거리, 최저 SEABED */
function cellFromT(t, I, x, z, s) {
  if (!I || t < 0) { const e = I ? Math.max(SEABED_M, Math.round((-0.45 + 0.12 * t) * 1000)) : SEABED_M; return [e, GI.Sand]; }
  const beach = I.beach;
  if (t < beach || I.kind === "shell") { const e = t < beach ? 0 - Math.round(15 * (beach - t) / beach) * 10 : 0; return [e, GI.Sand]; }
  if (I.kind === "mine") { if (t >= 0.8 * I.r) return [1800, GI.Rock]; if (t >= 0.62 * I.r) return [900, GI.Rock]; return [0, GI.Grass]; }
  if (I.r >= 24 && t >= 9) {                                             // 큰 섬: 고지대 단 1~2층(가장자리는 돌벽으로 그려짐)
    const n2 = wfbm((x + 0.5) * 0.035, (z + 0.5) * 0.035, s + 77);
    if (t >= 17 && n2 >= 0.64) return [Math.round(2 * WG_TERRACE * 1000), GI.Grass];
    if (n2 >= 0.55) return [Math.round(WG_TERRACE * 1000), GI.Grass];
  }
  return [0, GI.Grass];
}

/** 칸 하나: 후보 섬(cand, 고정 순서) 중 해안 안쪽 거리 t가 가장 큰 섬으로 [높이×1000, 바닥 번호]. 어느 섬도 안 닿으면 null(깊은 바다) */
function evalCell(s, cand, x, z) {
  const px = x + 0.5, pz = z + 0.5; let best = -Infinity, bi = null, n = NaN;
  for (const I of cand) {                                                // max로 합침(순서와 상관없는 값). 같은 t면 앞 섬(고정 순서)
    const dx = px - I.x, dz = pz - I.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > I.r * (1 + I.A / 2) + WG_BEACH + 1) continue;                   // 여기는 t < −5라 어느 섬이 이겨도 SEABED: 건너뜀
    if (n !== n) n = wfbm(px * 0.06, pz * 0.06, s) - 0.5;
    const t = I.r * (1 - n * I.A) - d;
    if (t > best) { best = t; bi = I; }
  }
  return bi ? cellFromT(best, bi, x, z, s) : null;
}

/** 청크 하나(32×32칸). { cx, cz, elev: Int16Array(높이×1000), ground: Uint8Array(GROUND_TYPES 번호), sea: Uint8Array(1 = 생성 때 정해진 바다), top: 가장 높은 높이×1000, land: 땅 칸 수 } */
export function genChunk(seed, cx, cz) {
  const s = seedOf(seed), x0 = cx * WCH, z0 = cz * WCH, N = WCH * WCH;
  const elev = new Int16Array(N).fill(SEABED_M), ground = new Uint8Array(N).fill(GI.Sand), sea = new Uint8Array(N).fill(1);
  const cand = islandsAround(s, x0, z0).filter(I => I.bx1 >= x0 && I.bx0 <= x0 + WCH && I.bz1 >= z0 && I.bz0 <= z0 + WCH);
  let top = SEABED_M, land = 0;
  if (cand.length) for (let lz = 0; lz < WCH; lz++) for (let lx = 0; lx < WCH; lx++) {
    const v = evalCell(s, cand, x0 + lx, z0 + lz); if (!v) continue;
    const [e, g] = v, i = lz * WCH + lx;
    elev[i] = e; ground[i] = g; sea[i] = e < -200 ? 1 : 0;              // SEA_LEVEL(−0.2) × 1000. 정수끼리 비교라 경계가 뒤집히지 않음
    if (e > top) top = e; if (e >= -200) land++;
  }
  return { cx, cz, elev, ground, sea, top, land };
}
/** 칸 하나를 청크와 따로 계산(시험용): 둘레 (2·reach+1)² 칸막이의 섬을 모두 봄. reach = 2면 genChunk(3×3)가 빠뜨린 섬이 있는지 잡아냄 */
export function cellAt(seed, x, z, reach = 1) {
  const s = seedOf(seed), mi = Math.floor(x / MACRO), mj = Math.floor(z / MACRO), cand = [...neighborOf(s).islands];
  for (let j = mj - reach; j <= mj + reach; j++) for (let i = mi - reach; i <= mi + reach; i++) for (const I of macroOf(s, i, j)) cand.push(I);
  const v = evalCell(s, cand, x, z), e = v ? v[0] : SEABED_M;
  return { elev: e, ground: v ? v[1] : GI.Sand, sea: e < -200 ? 1 : 0 };
}
