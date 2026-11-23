// 바닥 렌더링(지시서 3-B-2): 칸마다 오브젝트를 만들지 않고 16×16 청크마다 메쉬 하나로 합친다.
// 바뀐 칸이 속한 청크만(grid.takeDirty) 다시 만든다.
// 모양: 칸을 4×4 조각으로 나누고, 높이는 꼭짓점 높이(terrain.js)로 부드럽게 잇는다(경사면). 한 단보다 큰 차이만 절벽 벽.
// 색: 칸 경계에서 이웃 바닥 종류와 둥글게 섞고(체스판 없음), 잔잔한 얼룩 무늬로 단조롭지 않게. 경사진 돌길·데크는 계단.
import * as THREE from "three";
import { CELL, toWorldX, toWorldZ } from "../config.js";
import { GroundType } from "../data/types.js";
import { GROUND_STYLE } from "../data/catalog.js";
import { corners as cornersRaw, heightIn, bilinear, stairLayout, treadHeight } from "../world/terrain.js";

let SUB = 4;                                   // 칸당 조각(화질 낮음이면 2: 삼각형 1/4)
const STAIR_SUB = 4, BLEND_R = 0.42, LOWEST = -1.6;
export function setTerrainDetail(sub) { const changed = SUB !== sub; SUB = sub; return changed; }
const SEABED_COL = new THREE.Color(0xcdbb8a), CLIFF = new THREE.Color(0xa77a4f), CLIFF_SAND = new THREE.Color(0xcdb583);
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
  const gx = rx + (noise(rx * 0.8 + 3.1, rz * 0.8) - 0.5) * 0.75, gz = rz + (noise(rx * 0.8, rz * 0.8 - 5.7) - 0.5) * 0.75;
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
function chunkHeight(grid, gx, gz) {
  const x = Math.floor(gx), z = Math.floor(gz);
  if (!grid.inBounds(x, z)) return LOWEST;
  return heightIn(cachedCorners(grid, x, z), grid.get(x, z).elevation, gx - x, gz - z);
}

/** 부드러운 법선: 주변 높이 차로 기울기를 잼(칸 경계를 넘어도 이어짐). */
function normalAt(grid, gx, gz) {
  const e = 0.25, dx = chunkHeight(grid, gx + e, gz) - chunkHeight(grid, gx - e, gz), dz = chunkHeight(grid, gx, gz + e) - chunkHeight(grid, gx, gz - e);
  const n = [-dx / (2 * e * CELL), 1, -dz / (2 * e * CELL)], l = Math.hypot(...n); return [n[0] / l, n[1] / l, n[2] / l];
}
const toW = (gx, h, gz) => [toWorldX(gx), h, toWorldZ(gz)];

function cliffColor(grid, x, z, y, gx, gz) {
  const c = grid.get(x, z), base = c && c.groundType === GroundType.Sand ? CLIFF_SAND : CLIFF;
  return new THREE.Color().copy(base).multiplyScalar(0.82 + 0.18 * noise(gx * 2 + y * 3, gz * 2 - y * 3) + Math.max(-0.15, y * 0.1));
}

/** 칸 테두리 한 변: 내 변이 이웃보다 높으면 그 사이에 벽(절벽·턱). */
function edgeWall(b, grid, x, z, my, nb, ax, az, bx, bz, nrm) {
  const [ha, hb] = my, [la, lb] = nb;
  if (ha - la < 0.01 && hb - lb < 0.01) return;
  b.quad([
    { p: toW(ax, ha, az), n: nrm, c: cliffColor(grid, x, z, ha, ax, az) }, { p: toW(bx, hb, bz), n: nrm, c: cliffColor(grid, x, z, hb, bx, bz) },
    { p: toW(bx, Math.min(lb, hb), bz), n: nrm, c: cliffColor(grid, x, z, lb, bx, bz) }, { p: toW(ax, Math.min(la, ha), az), n: nrm, c: cliffColor(grid, x, z, la, ax, az) },
  ]);
}

function cellSurface(b, grid, x, z, c) {
  const e = grid.get(x, z).elevation;
  const L = stairLayout(grid, x, z, c); if (L) return stairs(b, grid, x, z, c, L);   // 경사진 돌길·데크 = 계단
  const step = 1 / SUB;
  for (let j = 0; j < SUB; j++) for (let i = 0; i < SUB; i++) {
    const pts = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, d]) => {
      const u = a * step, v = d * step, gx = x + u, gz = z + v, k = (z * SUB + d) * 4096 + (x * SUB + a);
      let pc = pointCache.get(k);                                           // 색·법선은 위치만으로 정해지므로 이웃 조각과 나눠 씀
      if (!pc) {
        const n = normalAt(grid, gx, gz), col = groundColor(grid, gx, gz, new THREE.Color());
        const steep = Math.min(1, Math.max(0, (0.86 - n[1]) / 0.2));             // 가파를수록 흙·바위 빛
        if (steep > 0 && !grid.isWater(Math.floor(gx), Math.floor(gz))) col.lerp(cliffColor(grid, Math.floor(gx), Math.floor(gz), 0, gx, gz), steep * 0.85);
        pc = { n, c: col }; pointCache.set(k, pc);
      }
      return { p: toW(gx, heightIn(c, e, u, v), gz), n: pc.n, c: pc.c };
    });
    b.quad(pts);
  }
}

/**
 * 경사진 돌길·데크 = 계단. 칸에서 더 많이 기운 방향(x 또는 z)을 골라, 칸 너비 전체에 걸친 반듯한 디딤판을 2~6단 놓는다.
 * 디딤판 높이는 올라가는 방향으로 고르게 나누고, 칸 둘레는 이웃 땅의 실제 가장자리 높이(꼭짓점 쌍선형, 이웃과 같은 값)까지
 * 벽으로 메워 틈이 없다.
 */
function stairs(b, grid, x, z, c, L) {
  const alongX = L.alongX;                                                   // 단 방향·높이는 terrain.js stairLayout(갈매미가 서는 높이와 같음)
  // t: 올라가는 축(0→1), s: 가로 축. P(t, s) → 칸 안 (u, v)
  const uv = (t, s2) => (alongX ? [t, s2] : [s2, t]);
  const edgeH = (t, s2) => { const [u, v] = uv(t, s2); return bilinear(c, u, v); };   // 가장자리 실제 높이(이웃과 같음)
  const n = L.n, tread = i => treadHeight(L, i);
  const P = (t, s2, h) => { const [u, v] = uv(t, s2); return toW(x + u, h, z + v); };
  const up = [0, 1, 0], col = groundColor(grid, x + 0.5, z + 0.5, new THREE.Color()), dark = col.clone().multiplyScalar(0.7);
  const axisN = sign => (alongX ? [sign, 0, 0] : [0, 0, sign]), sideN = sign => (alongX ? [0, 0, sign] : [sign, 0, 0]);
  const wall = (a, bb, cc, d, nrm) => b.quad([a, bb, cc, d].map(p => ({ p, n: nrm, c: dark })));
  const SEG = 4;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, h = tread(i), tc = col.clone().multiplyScalar(0.94 + 0.06 * (i % 2));
    b.quad([P(t0, 0, h), P(t1, 0, h), P(t1, 1, h), P(t0, 1, h)].map(p => ({ p, n: up, c: tc })));
    // 디딤판 사이 벽(다음 단과의 높이 차)
    if (i + 1 < n) { const hn = tread(i + 1); wall(P(t1, 0, h), P(t1, 1, h), P(t1, 1, hn), P(t1, 0, hn), axisN(hn > h ? -1 : 1)); }
    // 옆 두 변: 디딤판 높이 ↔ 이웃 땅 가장자리 높이
    for (const s2 of [0, 1]) wall(P(t0, s2, h), P(t1, s2, h), P(t1, s2, edgeH(t1, s2)), P(t0, s2, edgeH(t0, s2)), sideN(s2 ? 1 : -1));
  }
  // 앞·뒤 변: 첫 단·마지막 단 높이 ↔ 이웃 땅 가장자리(이웃 꼭짓점 간격대로 나눠서)
  for (const [t, h] of [[0, tread(0)], [1, tread(n - 1)]]) for (let k = 0; k < SEG; k++) {
    const s0 = k / SEG, s1 = (k + 1) / SEG;
    wall(P(t, s0, h), P(t, s1, h), P(t, s1, edgeH(t, s1)), P(t, s0, edgeH(t, s0)), axisN(t ? 1 : -1));
  }
}

export function buildChunkGeometry(grid, cx, cz) {
  const b = new Builder(), n = grid.chunk;
  if (cacheGrid !== grid || !cornerCache) { cornerCache = new Map(); cacheGrid = grid; }
  pointCache = new Map();
  for (let z = cz * n; z < Math.min(grid.h, (cz + 1) * n); z++) for (let x = cx * n; x < Math.min(grid.w, (cx + 1) * n); x++) {
    const c = cachedCorners(grid, x, z);                               // [왼위, 오위, 왼아래, 오아래]
    cellSurface(b, grid, x, z, c);
    // 네 변: 이웃 칸의 맞닿은 꼭짓점 높이와 비교해 벽
    // 땅은 꼭짓점을 이웃과 나눠 써서 틈이 없음 → 벽은 격자 바깥 테두리에만(바다 밑으로 내려가는 면)
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
  /** 바뀐 청크만 다시 만든다. 다시 만든 청크 수를 돌려준다. */
  sync() {
    const keys = this.grid.takeDirty();
    if (keys.length) { cornerCache = new Map(); cacheGrid = this.grid; }      // 높이가 바뀌었을 수 있으니 이번 동기화에서 새로 계산
    for (const key of keys) {
      const [cx, cz] = key.split(",").map(Number), geo = buildChunkGeometry(this.grid, cx, cz);
      let m = this.meshes.get(key);
      if (m) { m.geometry.dispose(); m.geometry = geo; }
      else { m = new THREE.Mesh(geo, this.material); m.receiveShadow = true; m.castShadow = false; m.name = `chunk ${key}`; m.userData.chunk = key; this.scene.add(m); this.meshes.set(key, m); }   // 땅은 그림자를 받기만(그림자용으로 다시 그리지 않음)
    }
    this.rebuilt += keys.length; return keys.length;
  }
  dispose() { for (const m of this.meshes.values()) { this.scene.remove(m); m.geometry.dispose(); } this.meshes.clear(); }
}
