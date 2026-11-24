// 바닥 렌더링(지시서 3-B-2): 칸마다 오브젝트를 만들지 않고 16×16 청크마다 메쉬 하나로 합친다.
// 바뀐 칸이 속한 청크만(grid.takeDirty) 다시 만든다.
// 모양: 칸을 4×4 조각으로 나누고, 높이는 꼭짓점 높이(terrain.js)로 부드럽게 잇는다(경사면). 한 단보다 큰 차이만 절벽 벽.
// 색: 칸 경계에서 이웃 바닥 종류와 둥글게 섞고(체스판 없음), 잔잔한 얼룩 무늬로 단조롭지 않게.
import * as THREE from "three";
import { CELL, toWorldX, toWorldZ } from "../config.js";
import { GroundType } from "../data/types.js";
import { GROUND_STYLE } from "../data/catalog.js";
import { corners as cornersRaw, heightIn, joined } from "../world/terrain.js";

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
  else if (type === GroundType.Cobble) out.multiplyScalar(0.9 + 0.2 * noise(gx * 3.1, gz * 3.1));          // 돌 알갱이
  else if (type === GroundType.WoodDeck) out.multiplyScalar(0.88 + 0.12 * (Math.sin(gz * Math.PI * 4) > 0.7 ? 0 : 1));   // 널빤지 틈
  else if (type === GroundType.Dirt) out.multiplyScalar(0.92 + 0.14 * noise(gx * 2.2, gz * 2.2));
  else out.multiplyScalar(0.96 + 0.06 * noise(gx * 1.7, gz * 1.7));
  return out;
}

/** 격자 좌표 (gx, gz)에서의 바닥 색: 근처 칸들의 종류를 경계에서 둥글게 섞는다(위치만의 함수라 칸 사이 이음매가 없음). */
function groundColor(grid, rx, rz, out) {
  // 경계를 칸 선에서 살짝 비틀어(도메인 워프) 계단 모양 대신 구불구불한 자연스러운 경계로
  const gx = rx + (noise(rx * 0.8 + 3.1, rz * 0.8) - 0.5) * 0.4, gz = rz + (noise(rx * 0.8, rz * 0.8 - 5.7) - 0.5) * 0.4;
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  let tw = 0; out.setRGB(0, 0, 0);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const x = x0 + dx, z = z0 + dz, c = grid.get(x, z); if (!c) continue;
    const ddx = Math.max(x - gx, 0, gx - (x + 1)), ddz = Math.max(z - gz, 0, gz - (z + 1)), d = Math.hypot(ddx, ddz);
    if (d >= BLEND_R) continue;
    const w = (1 - d / BLEND_R) ** 2;
    if (grid.isWater(x, z)) tmp2.copy(SEABED_COL); else typeColor(c.groundType, rx, rz, tmp2);
    out.r += tmp2.r * w; out.g += tmp2.g * w; out.b += tmp2.b * w; tw += w;
  }
  return tw ? out.multiplyScalar(1 / tw) : out.copy(BASE[GroundType.Grass]);
}

class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  vert(p, n, c) { this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(c.r, c.g, c.b); }
  /** 사각형 하나(a→b→c→d 둘레 순서). 각 꼭짓점에 법선·색. 위에서 볼 때 반시계가 앞면이 되게 맞춤. */
  quad(v) {
    const [a, b, c] = v, ab = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]], ac = [c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]];
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const want = v[0].n; if (cr[0] * want[0] + cr[1] * want[1] + cr[2] * want[2] < 0) v = [v[0], v[3], v[2], v[1]];
    for (const i of [0, 1, 2, 0, 2, 3]) this.vert(v[i].p, v[i].n, v[i].c);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere(); return g;
  }
}

// 한 번 다시 그릴 때 칸 꼭짓점 높이를 한 번씩만 계산(법선·벽·면이 같은 값을 여러 번 씀)
let cornerCache = null, cacheGrid = null, pointCache = new Map();
function cachedCorners(grid, x, z) {
  const k = z * grid.w + x; let c = cornerCache.get(k);
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
const toW = (gx, h, gz) => [toWorldX(gx), h, toWorldZ(gz)];

function cliffColor(grid, x, z, y, gx, gz, tall = false) {
  const c = grid.get(x, z), base = c && c.groundType === GroundType.Sand ? CLIFF_SAND : (c && c.groundType === GroundType.Rock) || tall ? CLIFF_ROCK : CLIFF;
  const strata = tall ? 0.9 + 0.12 * noise(gx * 0.7, y * 4.5) : 1;                 // 높은 절벽은 돌빛 + 가로 결
  return new THREE.Color().copy(base).multiplyScalar((0.82 + 0.18 * noise(gx * 2 + y * 3, gz * 2 - y * 3) + Math.max(-0.15, y * 0.1)) * strata);
}
/** 구석 그늘(미리 계산): 둘레 8방향 두 거리에서 더 높은 땅·벽이 얼마나 막는지 → 0(트임)~0.5(깊은 구석) */
function occlusion(grid, gx, gz, h0) {
  let occ = 0;
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a);
    for (const r of [0.6, 1.4]) { const h = chunkHeight(grid, gx + ca * r, gz + sa * r); occ += Math.min(1, Math.max(0, (h - h0) / r) * 0.9); }
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
function cellSurface(b, grid, x, z, c, sub) {
  const e = grid.get(x, z).elevation, S = deepSea(grid, x, z) ? 1 : sub;
  const step = 1 / S;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const pts = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, d]) => {
      const u = a * step, v = d * step, gx = x + u, gz = z + v, k = ((z * S + d) * 4096 + (x * S + a)) * 16384 + z * grid.w + x;
      let pc = pointCache.get(k);                                           // 색·법선(칸마다: 절벽 위·아래가 다름)
      if (!pc) {
        const n = normalAt(grid, gx, gz, x, z), col = groundColor(grid, gx, gz, new THREE.Color());
        const steep = Math.min(1, Math.max(0, (0.86 - n[1]) / 0.2));             // 가파를수록 흙·바위 빛
        if (steep > 0 && !grid.isWater(Math.floor(gx), Math.floor(gz))) col.lerp(cliffColor(grid, Math.floor(gx), Math.floor(gz), 0, gx, gz), steep * 0.85);
        if (!grid.isWater(Math.floor(gx), Math.floor(gz))) col.multiplyScalar(1 - occlusion(grid, gx, gz, heightIn(c, e, u, v)));   // 구석 그늘
        pc = { n, c: col }; pointCache.set(k, pc);
      }
      return { p: toW(gx, heightIn(c, e, u, v), gz), n: pc.n, c: pc.c };
    });
    b.quad(pts);
  }
}

export function buildChunkGeometry(grid, cx, cz, sub = SUB) {
  const b = new Builder(), n = grid.chunk;
  if (cacheGrid !== grid || !cornerCache) { cornerCache = new Map(); cacheGrid = grid; }
  pointCache = new Map();
  for (let z = cz * n; z < Math.min(grid.h, (cz + 1) * n); z++) for (let x = cx * n; x < Math.min(grid.w, (cx + 1) * n); x++) {
    const c = cachedCorners(grid, x, z);                               // [왼위, 오위, 왼아래, 오아래]
    cellSurface(b, grid, x, z, c, sub);
    // 네 변: 이웃 칸의 맞닿은 꼭짓점 높이보다 내 변이 높으면 그 사이를 벽(절벽)으로 메움. 이어진 칸끼리는 높이가 같아 벽이 생기지 않음
    const nb = (nx, nz, i, j) => { const k = cachedCorners(grid, nx, nz); return [k[i], k[j]]; };
    if (x < grid.w - 1) edgeWall(b, grid, x, z, [c[1], c[3]], nb(x + 1, z, 0, 2), x + 1, z, x + 1, z + 1, [1, 0, 0]);
    if (x > 0) edgeWall(b, grid, x, z, [c[0], c[2]], nb(x - 1, z, 1, 3), x, z, x, z + 1, [-1, 0, 0]);
    if (z < grid.h - 1) edgeWall(b, grid, x, z, [c[2], c[3]], nb(x, z + 1, 0, 1), x, z + 1, x + 1, z + 1, [0, 0, 1]);
    if (z > 0) edgeWall(b, grid, x, z, [c[0], c[1]], nb(x, z - 1, 2, 3), x, z, x + 1, z, [0, 0, -1]);
    const out = [LOWEST, LOWEST];
    if (x === grid.w - 1) edgeWall(b, grid, x, z, [c[1], c[3]], out, x + 1, z, x + 1, z + 1, [1, 0, 0]);
    if (x === 0) edgeWall(b, grid, x, z, [c[0], c[2]], out, x, z, x, z + 1, [-1, 0, 0]);
    if (z === grid.h - 1) edgeWall(b, grid, x, z, [c[2], c[3]], out, x, z + 1, x + 1, z + 1, [0, 0, 1]);
    if (z === 0) edgeWall(b, grid, x, z, [c[0], c[1]], out, x, z, x + 1, z, [0, 0, -1]);
  }
  return b.geometry();
}

export class GroundChunks {
  constructor(scene, grid) {
    this.scene = scene; this.grid = grid; this.meshes = new Map(); this.rebuilt = 0;
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });   // 어느 쪽에서 봐도 비치지 않게
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
  /** 바뀐 청크는 바로, 보는 곳이 옮겨져 상세도가 바뀐 청크는 한 번에 maxLod개씩(끊김 없게) 다시 만든다. */
  sync(focus = null, maxLod = 2, camDist = 0) {
    this.camDist = camDist;
    const keys = this.grid.takeDirty();
    if (keys.length) { cornerCache = new Map(); cacheGrid = this.grid; }      // 높이가 바뀌었을 수 있으니 이번 동기화에서 새로 계산
    const todo = new Set(keys);
    if (focus) {
      let n = 0;
      for (let cz = 0; cz < this.grid.chunksZ && n < maxLod; cz++) for (let cx = 0; cx < this.grid.chunksX && n < maxLod; cx++) {
        const key = `${cx},${cz}`, m = this.meshes.get(key);
        if (!m || todo.has(key)) continue;
        if (this.lodFor(cx, cz, focus, m.userData.sub) !== m.userData.sub) { todo.add(key); n++; }
      }
    }
    for (const key of todo) {
      const [cx, cz] = key.split(",").map(Number), m0 = this.meshes.get(key), sub = this.lodFor(cx, cz, focus, m0?.userData.sub ?? null);
      const geo = buildChunkGeometry(this.grid, cx, cz, sub);
      let m = m0;
      if (m) { m.geometry.dispose(); m.geometry = geo; }                         // 예전 조각은 바로 버림(메모리)
      else { m = new THREE.Mesh(geo, this.material); m.receiveShadow = true; m.castShadow = false; m.name = `chunk ${key}`; m.userData.chunk = key; this.scene.add(m); this.meshes.set(key, m); }   // 땅은 그림자를 받기만(그림자용으로 다시 그리지 않음)
      m.userData.sub = sub;
    }
    this.rebuilt += todo.size; return todo.size;
  }
  /** 지금 그리는 땅 삼각형 수(확인용) */
  get triangles() { let t = 0; for (const m of this.meshes.values()) t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; return Math.round(t); }
  dispose() { for (const m of this.meshes.values()) { this.scene.remove(m); m.geometry.dispose(); } this.meshes.clear(); }
}
