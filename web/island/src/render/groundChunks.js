// 바닥 렌더링(지시서 3-B-2): 칸마다 오브젝트를 만들지 않고 16×16 청크마다 메쉬 하나로 합친다.
// 바뀐 칸이 속한 청크만(grid.takeDirty) 다시 만든다.
// 모양: 칸을 4×4 조각으로 나누고, 높이는 꼭짓점 높이(terrain.js)로 부드럽게 잇는다(경사면). 한 단보다 큰 차이만 절벽 벽.
// 색: 칸 경계에서 이웃 바닥 종류와 둥글게 섞고(체스판 없음), 잔잔한 얼룩 무늬로 단조롭지 않게.
import * as THREE from "three";
import { seasonalGround } from "./seasons.js";
import { gridGround } from "./gridLines.js";
import { groundPattern } from "./groundPattern.js";
import { CELL, toWorldX, toWorldZ } from "../config.js";
import { GroundType } from "../data/types.js";
import { GROUND_STYLE } from "../data/catalog.js";
import { corners as cornersRaw, heightIn, joined } from "../world/terrain.js";
import { cellSub, snowClear, hardPair, hardCell, isPathType, pathIn } from "../world/groundLook.js";

let SUB = 4;                                   // 가까운 땅의 칸당 조각(화질 낮음이면 2: 삼각형 1/4)
// 거리별 상세도(오픈월드 지형의 LOD와 같은 생각): 보는 곳(화면 중심)에서 가까운 청크만 촘촘히, 멀수록 성기게.
// 칸 테두리에서는 높이가 직선이라(가운데 볼록은 테두리에서 0) 상세도가 다른 청크끼리도 틈이 생기지 않는다.
export const LOD_NEAR = 26, LOD_MID = 50, LOD_HYST = 4;   // m: 이 안은 SUB, 그다음은 SUB/2, 더 멀면 1. 경계에서 왔다 갔다 하지 않게 4 m 여유
const BLEND_R = 0.22, LOWEST = -1.6;   // 칸 경계 색 섞는 폭(작을수록 또렷)
let LOD_SCALE = 1, FAR_DROP = false;                                                 // 그래픽 설정: 상세도 거리 배율, 멀리서 볼 때 한 단계 낮추기
export function setTerrainDetail(sub, lodScale = 1, farDrop = false) { const changed = SUB !== sub || LOD_SCALE !== lodScale || FAR_DROP !== farDrop; SUB = sub; LOD_SCALE = lodScale; FAR_DROP = farDrop; return changed; }
const SEABED_COL = new THREE.Color(0xcdbb8a), CLIFF = new THREE.Color(0xa77a4f), CLIFF_SAND = new THREE.Color(0xcdb583), CLIFF_ROCK = new THREE.Color(0x8f8a82);
const tmp = new THREE.Color(), tmp2 = new THREE.Color();
const BASE = Object.fromEntries(Object.entries(GROUND_STYLE).map(([k, v]) => [k, new THREE.Color(v.colors[0])]));
const ALT = Object.fromEntries(Object.entries(GROUND_STYLE).map(([k, v]) => [k, new THREE.Color(v.colors[1] ?? v.colors[0])]));

// ---- 값 노이즈(얼룩 무늬)
function hash(ix, iz) { let h = (ix * 374761393 + iz * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}
const fbm = (x, z) => 0.6 * noise(x * 0.35, z * 0.35) + 0.4 * noise(x * 1.3 + 17, z * 1.3 - 9);

/** 바닥 종류 하나의 색(위치에 따라 조금씩 다름). */
function typeColor(type, gx, gz, out) {
  const n = fbm(gx, gz);
  out.copy(BASE[type]).lerp(ALT[type], n);
  if (type === GroundType.Grass) out.offsetHSL((noise(gx * 0.12, gz * 0.12) - 0.5) * 0.04, 0, (n - 0.5) * 0.06);
  else if (type === GroundType.Cobble) out.multiplyScalar(0.93 + 0.14 * noise(gx * 1.3, gz * 1.3));         // 큰 얼룩만(돌·틈은 셰이더 무늬, groundPattern.js)
  else if (type === GroundType.WoodDeck) out.multiplyScalar(0.95 + 0.1 * noise(gx * 0.9, gz * 0.9));         // 널빤지·틈은 셰이더(예전 sin 줄무늬는 꼭짓점 위치에서 늘 0이라 안 보였음)
  else if (type === GroundType.Dirt) out.multiplyScalar(0.92 + 0.14 * noise(gx * 1.6, gz * 1.6));
  else out.multiplyScalar(0.96 + 0.06 * noise(gx * 1.7, gz * 1.7));
  return out;
}

/** 격자 좌표 (gx, gz)에서의 바닥 색: 근처 칸들의 종류를 경계에서 둥글게 섞는다(위치만의 함수라 칸 사이 이음매가 없음).
 *  hard: 이 꼭짓점 가까이(1칸 안)에 길이 있으면(hardAt) 비틀기 없이, 제 칸(own)과 또렷하게 끊을 이웃(hardPair)은 섞지 않음 → 칸 선에서 색이 딱 끊김
 *  (꼭짓점은 칸마다 따로라 경계 위 꼭짓점이 양쪽 칸에서 각자 제 색을 가짐). 자연 땅끼리는 예전처럼 섞음.
 *  hard는 꼭 위치만으로 정함(칸마다 정하면 길 옆 잔디와 모래가 맞닿은 꼭짓점이 한쪽 칸은 비틀고 한쪽은 안 비틀어 색 이음매가 생겼음). */
let lastClear = 0;                               // groundColor가 같이 셈: 이 점의 눈 덜 쌓임(길은 쓸어서 덜, seasons.js aSnowClear)
const lastPath = [0, 0, 0];                      // 같이 셈: 돌길·데크·흙길 비율 → 꼭짓점 하나에 수 하나로(packPath, 셰이더 무늬 세기 groundPattern.js aPath)
const PATH_SLOT = { [GroundType.Cobble]: 0, [GroundType.WoodDeck]: 1, [GroundType.Dirt]: 2 };
function groundColor(grid, rx, rz, out, own = null, hard = false) {
  // 경계를 칸 선에서 살짝 비틀어(도메인 워프) 계단 모양 대신 구불구불한 자연스러운 경계로(길 둘레 칸은 안 비틂)
  const gx = hard ? rx : rx + (noise(rx * 0.8 + 3.1, rz * 0.8) - 0.5) * 0.4, gz = hard ? rz : rz + (noise(rx * 0.8, rz * 0.8 - 5.7) - 0.5) * 0.4;
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  let tw = 0, cl = 0; out.setRGB(0, 0, 0); lastPath[0] = lastPath[1] = lastPath[2] = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const x = x0 + dx, z = z0 + dz, c = grid.get(x, z); if (!c) continue;
    const water = grid.isWater(x, z);
    if (hard && !water && hardPair(own, c.groundType)) continue;          // 길 경계: 건너편 색을 끌어오지 않음
    const ddx = Math.max(x - gx, 0, gx - (x + 1)), ddz = Math.max(z - gz, 0, gz - (z + 1)), d = Math.hypot(ddx, ddz);
    if (d >= BLEND_R) continue;
    const w = (1 - d / BLEND_R) ** 2;
    if (water) tmp2.copy(SEABED_COL); else typeColor(c.groundType, rx, rz, tmp2);
    out.r += tmp2.r * w; out.g += tmp2.g * w; out.b += tmp2.b * w; tw += w;
    if (!water) { cl += snowClear(c.groundType) * w; const k = PATH_SLOT[c.groundType]; if (k !== undefined) lastPath[k] += w; }
  }
  lastClear = tw ? cl / tw : 0;
  if (tw) for (let k = 0; k < 3; k++) lastPath[k] /= tw;
  return tw ? out.multiplyScalar(1 / tw) : out.copy(BASE[GroundType.Grass]);
}
/** 길 무늬 세기를 꼭짓점 수 하나로: 0 = 길 아님, 그 밖엔 1 + 종류(0·1·2) + 0.05 + 0.9 × 비율. 길 경계는 섞지 않아서(hardPair) 한 꼭짓점에 길 종류가 둘 섞이지 않음(물·같은 종류만 섞임) → 가장 큰 쪽 하나면 충분 */
function packPath() {
  let k = 0; if (lastPath[1] > lastPath[k]) k = 1; if (lastPath[2] > lastPath[k]) k = 2;
  return lastPath[k] > 0.001 ? 1 + k + 0.05 + 0.9 * Math.min(1, lastPath[k]) : 0;   // 칸 안에서 보간돼도 정수를 안 넘게 0.05~0.95
}
/** 길 칸 테두리(다른 종류와 또렷하게 끊긴 변) 꼭짓점을 조금 어둡게: 길에 얕은 턱·그늘이 진 것처럼 윤곽이 생김 */
const PATH_RIM = 0.84;
function onHardRim(grid, x, z, t, u, v) {
  const sx = u === 0 ? -1 : u === 1 ? 1 : 0, sz = v === 0 ? -1 : v === 1 ? 1 : 0;
  if (!sx && !sz) return false;
  const k = (dx, dz) => { const c = grid.get(x + dx, z + dz); return c && !grid.isWater(x + dx, z + dz) && hardPair(t, c.groundType); };
  return (sx && k(sx, 0)) || (sz && k(0, sz)) || (sx && sz && k(sx, sz));
}

class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.clr = []; this.pat = []; }
  vert(p, n, c, s = 0, w = 0) { this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(c.r, c.g, c.b); this.clr.push(s); this.pat.push(w); }
  /** 사각형 하나(a→b→c→d 둘레 순서). 각 꼭짓점에 법선·색. 위에서 볼 때 반시계가 앞면이 되게 맞춤. */
  quad(v) {
    const [a, b, c] = v, ab = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]], ac = [c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]];
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const want = v[0].n; if (cr[0] * want[0] + cr[1] * want[1] + cr[2] * want[2] < 0) v = [v[0], v[3], v[2], v[1]];
    for (const i of [0, 1, 2, 0, 2, 3]) this.vert(v[i].p, v[i].n, v[i].c, v[i].s, v[i].w);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("aSnowClear", new THREE.Float32BufferAttribute(this.clr, 1));
    g.setAttribute("aPath", new THREE.Float32BufferAttribute(this.pat, 1));
    g.computeBoundingSphere(); return g;
  }
}

// 한 번 다시 그릴 때 칸 꼭짓점 높이를 한 번씩만 계산(법선·벽·면이 같은 값을 여러 번 씀)
let cornerCache = null, cacheGrid = null, pointCache = new Map(), flatCache = null;
export function resetCaches(grid) { cornerCache = new Map(); cacheGrid = grid; flatCache = new Map(); }
/** 둘레 3칸까지 높이가 모두 같은 칸인지(평평한 땅·바다 바닥). 그러면 법선은 똑바로 위, 구석 그늘은 0이라 점마다 높이를 20번씩 재지 않아도 됨.
 *  3칸: 구석 그늘이 1.4칸 밖까지 재고(2칸 옆 칸), 그 칸의 꼭짓점 높이는 다시 한 칸 옆과 평균이라서 */
function flatAround(grid, x, z) {
  const k = grid.index(x, z); let f = flatCache.get(k);
  if (!f) {
    f = 1;
    if (!grid.inBounds(x - 3, z - 3) || !grid.inBounds(x + 3, z + 3)) f = 2;
    else { const e = grid.get(x, z).elevation; for (let dz = -3; dz <= 3 && f === 1; dz++) for (let dx = -3; dx <= 3; dx++) if (grid.get(x + dx, z + dz).elevation !== e) { f = 2; break; } }
    flatCache.set(k, f);
  }
  return f === 1;
}
function cachedCorners(grid, x, z) {
  const k = grid.index(x, z); let c = cornerCache.get(k);
  if (!c) { c = cornersRaw(grid, x, z); cornerCache.set(k, c); }
  return c;
}
function chunkHeight(grid, gx, gz, hx = null, hz = null) {
  let x = Math.floor(gx), z = Math.floor(gz);
  if (hx !== null && (x !== hx || z !== hz) && !joined(grid, grid.get(hx, hz), grid.get(x, z), hx, hz, x, z)) {   // 절벽 너머는 재지 않고 이 칸 면을 늘려 씀
    x = hx; z = hz; gx = Math.min(x + 1, Math.max(x, gx)); gz = Math.min(z + 1, Math.max(z, gz));
  }
  if (!grid.inBounds(x, z)) return LOWEST;
  return heightIn(cachedCorners(grid, x, z), grid.get(x, z).elevation, gx - x, gz - z);
}

/** 부드러운 법선: 주변 높이 차로 기울기를 잼(이어진 칸끼리는 경계를 넘어도 이어짐, 절벽 너머는 안 봄). hx, hz: 이 점이 속한 칸 */
function normalAt(grid, gx, gz, hx, hz) {
  const e = 0.25, H = (a, b) => chunkHeight(grid, a, b, hx, hz), dx = H(gx + e, gz) - H(gx - e, gz), dz = H(gx, gz + e) - H(gx, gz - e);
  const n = [-dx / (2 * e * CELL), 1, -dz / (2 * e * CELL)], l = Math.hypot(...n); return [n[0] / l, n[1] / l, n[2] / l];
}
const FLAT_N = [0, 1, 0];
const toW = (gx, h, gz) => [toWorldX(gx), h, toWorldZ(gz)];

function cliffColor(grid, x, z, y, gx, gz, tall = false) {
  const c = grid.get(x, z), base = c && c.groundType === GroundType.Sand ? CLIFF_SAND : (c && c.groundType === GroundType.Rock) || tall ? CLIFF_ROCK : CLIFF;
  const strata = tall ? 0.9 + 0.12 * noise(gx * 0.7, y * 4.5) : 1;                 // 높은 절벽은 돌빛 + 가로 결
  return new THREE.Color().copy(base).multiplyScalar((0.82 + 0.18 * noise(gx * 2 + y * 3, gz * 2 - y * 3) + Math.max(-0.15, y * 0.1)) * strata);
}
/** 구석 그늘(미리 계산): 둘레 8방향 두 거리에서 더 높은 땅·벽이 얼마나 막는지 → 0(트임)~0.5(깊은 구석) */
const OCC_DIR = Array.from({ length: 8 }, (_, k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)]);
function occlusion(grid, gx, gz, h0) {
  let occ = 0;
  for (let k = 0; k < 8; k++) {
    const ca = OCC_DIR[k][0], sa = OCC_DIR[k][1];
    let h = chunkHeight(grid, gx + ca * 0.6, gz + sa * 0.6); occ += Math.min(1, Math.max(0, (h - h0) / 0.6) * 0.9);
    h = chunkHeight(grid, gx + ca * 1.4, gz + sa * 1.4); occ += Math.min(1, Math.max(0, (h - h0) / 1.4) * 0.9);
  }
  return Math.min(0.5, occ / 16 * 1.1);
}

/** 칸 테두리 한 변: 내 변이 이웃보다 높으면 그 사이에 벽(절벽·턱). */
function edgeWall(b, grid, x, z, my, nb, ax, az, bx, bz, nrm) {
  const [ha, hb] = my, [la, lb] = nb;
  if (ha - la < 0.01 && hb - lb < 0.01) return;
  const tall = Math.max(ha - la, hb - lb) > 0.55 && la > -0.3, foot = 0.68;          // 높은 벽은 돌빛, 벽 밑동은 그늘로 어둡게
  b.quad([
    { p: toW(ax, ha, az), n: nrm, c: cliffColor(grid, x, z, ha, ax, az, tall) }, { p: toW(bx, hb, bz), n: nrm, c: cliffColor(grid, x, z, hb, bx, bz, tall) },
    { p: toW(bx, Math.min(lb, hb), bz), n: nrm, c: cliffColor(grid, x, z, lb, bx, bz, tall).multiplyScalar(foot) }, { p: toW(ax, Math.min(la, ha), az), n: nrm, c: cliffColor(grid, x, z, la, ax, az, tall).multiplyScalar(foot) },
  ]);
}

/** 깊은 바다(둘레 칸까지 모두 물이고 깊음)는 안 보이니 칸당 1조각. */
function deepSea(grid, x, z) {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const c = grid.get(x + dx, z + dz); if (c && c.elevation > -0.6) return false; }
  return true;
}
/** 꼭짓점 (gx, gz)가 길 가까이인지(위치만의 함수: 이 점에 닿은 칸들과 그 바로 옆 칸 중 길이 있으면). 아니면 길에서 1칸 넘게 떨어져 비틀기(≤0.28)+섞기(BLEND_R)로도 길 색이 닿지 않음 */
const hardAt = (grid, gx, gz) => pathIn(grid, Math.ceil(gx) - 2, Math.floor(gx) + 1, Math.ceil(gz) - 2, Math.floor(gz) + 1);
function cellSurface(b, grid, x, z, c, sub) {
  const e = grid.get(x, z).elevation, S = deepSea(grid, x, z) ? 1 : cellSub(grid, x, z, sub);   // 좁게 칠한 곳·길 테두리는 멀리서도 촘촘히(칠한 곳이 이웃 색에 묻히지 않게, groundLook.js)
  const step = 1 / S, flat = flatAround(grid, x, z), t = grid.get(x, z).groundType, rim = isPathType(t) && hardCell(grid, x, z), near = pathIn(grid, x - 2, x + 2, z - 2, z + 2);   // near: 칸 둘레 5×5에 길이 없으면 꼭짓점마다 따질 것 없음(대부분의 칸)
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const pts = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, d]) => {
      const u = a * step, v = d * step, gx = x + u, gz = z + v, k = (((z & 15) * 16 + (x & 15)) * 9 + d) * 9 + a;   // 조각(16칸) 안 지역 좌표: 음수·먼 좌표에서도 겹치지 않음
      let pc = pointCache.get(k);                                           // 색·법선(칸마다: 절벽 위·아래가 다름)
      if (!pc) {
        const n = flat ? FLAT_N : normalAt(grid, gx, gz, x, z), col = groundColor(grid, gx, gz, new THREE.Color(), t, near && hardAt(grid, gx, gz)), w = packPath(), s = lastClear;
        if (rim && onHardRim(grid, x, z, t, u, v)) col.multiplyScalar(PATH_RIM);
        if (flat) { pc = { n, c: col, s, w }; pointCache.set(k, pc); return { p: toW(gx, heightIn(c, e, u, v), gz), n, c: col, s, w }; }
        const steep = Math.min(1, Math.max(0, (0.86 - n[1]) / 0.2));             // 가파를수록 흙·바위 빛
        if (steep > 0 && !grid.isWater(Math.floor(gx), Math.floor(gz))) col.lerp(cliffColor(grid, Math.floor(gx), Math.floor(gz), 0, gx, gz), steep * 0.85);
        if (!grid.isWater(Math.floor(gx), Math.floor(gz))) col.multiplyScalar(1 - occlusion(grid, gx, gz, heightIn(c, e, u, v)));   // 구석 그늘
        pc = { n, c: col, s, w }; pointCache.set(k, pc);
      }
      return { p: toW(gx, heightIn(c, e, u, v), gz), n: pc.n, c: pc.c, s: pc.s, w: pc.w };
    });
    b.quad(pts);
  }
}

/** 청크 하나 만들기를 여러 프레임에 나눠 할 수 있게: startBuild로 시작해 stepBuild(job, 마감 시각)를 끝날 때까지(true) 부름 */
export function startBuild(grid, cx, cz, sub) { return { grid, cx, cz, sub, b: new Builder(), points: new Map(), i: 0 }; }
export function stepBuild(job, deadline = Infinity) {
  const { grid, cx, cz, sub, b } = job, n = grid.chunk, x0 = cx * n, z0 = cz * n, nx = n, nz = n;
  if (cacheGrid !== grid || !cornerCache) resetCaches(grid);
  pointCache = job.points;
  for (; job.i < nx * nz; job.i++) {
    if ((job.i & 3) === 0 && job.i && performance.now() >= deadline) return false;   // 4칸마다 시간 확인
    const x = x0 + job.i % nx, z = z0 + (job.i / nx | 0);
    const c = cachedCorners(grid, x, z);                               // [왼위, 오위, 왼아래, 오아래]
    cellSurface(b, grid, x, z, c, sub);
    // 네 변: 이웃 칸의 맞닿은 꼭짓점 높이보다 내 변이 높으면 그 사이를 벽(절벽)으로 메움. 이어진 칸끼리는 높이가 같아 벽이 생기지 않음
    const nb = (nx, nz, i, j) => { const k = cachedCorners(grid, nx, nz); return [k[i], k[j]]; };
    if (grid.inBounds(x + 1, z)) edgeWall(b, grid, x, z, [c[1], c[3]], nb(x + 1, z, 0, 2), x + 1, z, x + 1, z + 1, [1, 0, 0]);
    if (grid.inBounds(x - 1, z)) edgeWall(b, grid, x, z, [c[0], c[2]], nb(x - 1, z, 1, 3), x, z, x, z + 1, [-1, 0, 0]);
    if (grid.inBounds(x, z + 1)) edgeWall(b, grid, x, z, [c[2], c[3]], nb(x, z + 1, 0, 1), x, z + 1, x + 1, z + 1, [0, 0, 1]);
    if (grid.inBounds(x, z - 1)) edgeWall(b, grid, x, z, [c[0], c[1]], nb(x, z - 1, 2, 3), x, z, x + 1, z, [0, 0, -1]);
    const out = [LOWEST, LOWEST];
    if (!grid.inBounds(x + 1, z)) edgeWall(b, grid, x, z, [c[1], c[3]], out, x + 1, z, x + 1, z + 1, [1, 0, 0]);
    if (!grid.inBounds(x - 1, z)) edgeWall(b, grid, x, z, [c[0], c[2]], out, x, z, x, z + 1, [-1, 0, 0]);
    if (!grid.inBounds(x, z + 1)) edgeWall(b, grid, x, z, [c[2], c[3]], out, x, z + 1, x + 1, z + 1, [0, 0, 1]);
    if (!grid.inBounds(x, z - 1)) edgeWall(b, grid, x, z, [c[0], c[1]], out, x, z, x + 1, z, [0, 0, -1]);
  }
  return true;
}
export function buildChunkGeometry(grid, cx, cz, sub = SUB) {
  const job = startBuild(grid, cx, cz, sub); stepBuild(job);
  return job.b.geometry();
}

export class GroundChunks {
  constructor(scene, grid) {
    this.scene = scene; this.grid = grid; this.meshes = new Map(); this.rebuilt = 0;
    this.material = gridGround(groundPattern(seasonalGround(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }))));   // 길 무늬(groundPattern.js) + 계절(봄 연두·가을 누런 잔디·겨울 눈) + 건설 모드 격자선(gridLines.js)   // 어느 쪽에서 봐도 비치지 않게
  }
  /** 이 청크가 보는 곳(focus, 월드 좌표)에서 얼마나 떨어졌는지에 따른 칸당 조각 수. cur: 지금 상세도(경계 여유용) */
  lodFor(cx, cz, focus, cur = null) {
    if (!focus) return SUB;
    const near = LOD_NEAR * LOD_SCALE, mid = LOD_MID * LOD_SCALE, drop = FAR_DROP && (this.camDist || 0) > 70 ? 1 : 0;   // 카메라가 멀면(섬 전체 보기) 한 단계 성기게
    const n = this.grid.chunk, wx = toWorldX(cx * n + n / 2), wz = toWorldZ(cz * n + n / 2);
    const d = Math.max(0, Math.hypot(wx - focus.x, wz - focus.z) - n * 0.7);          // 청크 가장자리까지 대략의 거리
    const lv = s => (s >= SUB ? 0 : s >= SUB / 2 && SUB > 1 ? 1 : 2), want = Math.min(2, (d < near ? 0 : d < mid ? 1 : 2) + drop);
    let level = want;
    if (cur !== null) {                                                               // 경계 근처면 지금 상세도를 유지
      const c = lv(cur), edge = [near, mid][Math.min(c, want, 1)];
      if (c !== want && Math.abs(d - edge) < LOD_HYST) level = c;
    }
    return [SUB, Math.max(1, SUB / 2), 1][level];
  }
  /** 바뀐 청크는 바로 다시 만든다. 보는 곳이 옮겨져 상세도가 바뀐 청크는 한 프레임에 budgetMs만큼만 나눠 만들고(화면을 옮길 때 끊기지 않게),
   *  보는 곳에서 가까운 것·촘촘해져야 하는 것부터 한다. */
  sync(focus = null, budgetMs = 4, camDist = 0) {
    this.camDist = camDist;
    const keys = this.grid.takeDirty();
    if (keys.length) { resetCaches(this.grid); this.job = null; }             // 높이가 바뀌었을 수 있으니 새로 계산(나눠 만들던 것도 처음부터)
    for (const key of keys) {
      const [cx, cz] = key.split(",").map(Number), m0 = this.meshes.get(key);
      const sub = this.lodFor(cx, cz, focus, m0?.userData.sub ?? null);
      this.put(key, cx, cz, buildChunkGeometry(this.grid, cx, cz, sub), sub);
    }
    let done = keys.length;
    if (focus && !keys.length) {
      const deadline = performance.now() + budgetMs;
      for (;;) {
        let job = this.job;
        if (job && this.lodFor(job.cx, job.cz, focus, job.m.userData.sub) !== job.sub) job = this.job = null;   // 그새 보는 곳이 또 옮겨져 필요 없어짐
        if (!job) {
          let best = null, bestD = Infinity;
          for (const m of this.meshes.values()) {                                    // 매 프레임 도는 곳: 열쇠 글자를 새로 만들지 않고 있는 메쉬를 그대로 훑음
            const u = m.userData, want = this.lodFor(u.cx, u.cz, focus, u.sub); if (want === u.sub) continue;
            const n = this.grid.chunk, d = Math.hypot(toWorldX(u.cx * n + n / 2) - focus.x, toWorldZ(u.cz * n + n / 2) - focus.z) + (want < u.sub ? 1000 : 0);   // 성기게 바꾸는 것은 나중에
            if (d < bestD) { bestD = d; best = m; }
          }
          if (!best) break;
          const u = best.userData; job = this.job = startBuild(this.grid, u.cx, u.cz, this.lodFor(u.cx, u.cz, focus, u.sub)); job.m = best;
        }
        if (!stepBuild(job, deadline)) break;
        this.put(job.m.userData.chunk, job.cx, job.cz, job.b.geometry(), job.sub); this.job = null; done++;
        if (performance.now() >= deadline) break;
      }
    }
    this.rebuilt += done; return done;
  }
  put(key, cx, cz, geo, sub) {
    let m = this.meshes.get(key);
    if (m) { m.geometry.dispose(); m.geometry = geo; }                           // 예전 조각은 바로 버림(메모리)
    else { m = new THREE.Mesh(geo, this.material); m.receiveShadow = true; m.castShadow = false; m.name = `chunk ${key}`; m.userData.chunk = key; m.userData.cx = cx; m.userData.cz = cz; this.scene.add(m); this.meshes.set(key, m); }   // 땅은 그림자를 받기만(그림자용으로 다시 그리지 않음)
    m.userData.sub = sub;
  }
  /** 지금 그리는 땅 삼각형 수(확인용) */
  get triangles() { let t = 0; for (const m of this.meshes.values()) t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; return Math.round(t); }
  dispose() { for (const m of this.meshes.values()) { this.scene.remove(m); m.geometry.dispose(); } this.meshes.clear(); this.job = null; }
}
