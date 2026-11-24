// 섬 만들기(지시서 3-A): 가운데 넓고 평평한 잔디 평야, 둘레 모래사장(바다 쪽으로 살짝 낮아짐), 바깥은 바다.
// 계단식 언덕 하나(절벽 + 돌계단), 가운데 돌길 광장과 부두로 가는 길, 해안 모듈(부두·방파제·등대·바위).
import { Grid } from "./Grid.js";
import { GroundType } from "../data/types.js";
import { SEABED } from "../config.js";
import { seededRandom } from "../util.js";

export const ISLAND_R = 24;        // 해안선 평균 반지름(칸)
const BEACH = 4;                   // 모래사장 너비(칸)

export function generateIsland(seed = 7, w = 64, h = 64) {
  const rnd = seededRandom(seed), grid = new Grid(w, h);
  const cx = w / 2, cz = h / 2, ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const coast = a => ISLAND_R + 1.6 * Math.sin(3 * a + ph[0]) + 1.1 * Math.sin(5 * a + ph[1]) + 0.6 * Math.sin(8 * a + ph[2]);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz, r = Math.hypot(dx, dz), edge = coast(Math.atan2(dz, dx)), c = grid.get(x, z);
    if (r < edge - BEACH) { c.groundType = GroundType.Grass; c.elevation = 0; }
    else if (r < edge) { c.groundType = GroundType.Sand; c.elevation = -Math.round(15 * (r - (edge - BEACH)) / BEACH) / 100; }   // 0 ~ -0.15
    else { c.groundType = GroundType.Sand; c.elevation = Math.max(SEABED, -0.45 - 0.12 * (r - edge)); }                          // 바닷속 모래
  }
  const set = (x, z, type, e) => { const c = grid.get(x, z); c.groundType = type; if (e !== undefined) c.elevation = e; };

  // 계단식 언덕: 높이 0.6 고원(옆은 절벽), 동쪽에 돌계단 3칸(0.45 → 0.3 → 0.15)
  for (let z = 19; z <= 24; z++) for (let x = 18; x <= 24; x++) set(x, z, GroundType.Grass, 0.6);
  [[25, 0.45], [26, 0.3], [27, 0.15]].forEach(([x, e]) => { set(x, 21, GroundType.Cobble, e); set(x, 22, GroundType.Cobble, e); });

  // 가운데 돌길 광장 6×6, 남쪽 부두까지 흙길 2칸 폭
  for (let z = 29; z <= 34; z++) for (let x = 29; x <= 34; x++) set(x, z, GroundType.Cobble);
  let z0 = 35; while (z0 < h && !grid.isWater(31, z0)) { if (grid.get(31, z0).groundType === GroundType.Grass) { set(31, z0, GroundType.Dirt); set(32, z0, GroundType.Dirt); } z0++; }

  const modules = [];
  // 나무 부두: 첫 바다 칸부터 바다 쪽으로 6칸, 폭 2
  const pier = [];
  for (let z = z0; z < Math.min(h - 1, z0 + 6); z++) for (const x of [31, 32]) if (grid.isWater(x, z)) pier.push([x, z]);
  modules.push({ id: "pier-1", defId: "pier", cells: pier, rot: 0 });

  // 등대: 북동쪽 해변에서 2×2 모래 칸
  for (let r = ISLAND_R + 3; r > 10; r -= 0.5) {
    const a = -Math.PI / 4, x = Math.floor(cx + r * Math.cos(a)), z = Math.floor(cz + r * Math.sin(a));
    const cells = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]];
    if (cells.every(([px, pz]) => grid.inBounds(px, pz) && !grid.isWater(px, pz) && grid.get(px, pz).groundType === GroundType.Sand)) {
      modules.push({ id: "lighthouse-1", defId: "lighthouse", cells, rot: 0 }); break;
    }
  }

  // 돌 방파제: 서쪽 해안에서 바다 쪽으로 2칸 떨어져 해안을 따라 9칸
  const bw = [];
  for (let z = cz - 4; z <= cz + 4; z++) { let x = cx; while (x > 0 && !grid.isWater(x, z)) x--; if (x - 2 >= 0) bw.push([x - 2, z]); }
  modules.push({ id: "breakwater-1", defId: "breakwater", cells: bw, rot: 0 });

  // 해변 바위 몇 개(부두·등대 근처는 피함)
  const used = new Set(modules.flatMap(m => m.cells.map(([x, z]) => `${x},${z}`)));
  for (let k = 0, tries = 0; k < 6 && tries < 400; tries++) {
    const x = Math.floor(rnd() * w), z = Math.floor(rnd() * h), c = grid.get(x, z);
    if (grid.isWater(x, z) || c.groundType !== GroundType.Sand || c.elevation > -0.05) continue;
    if ([...used].some(s => { const [ux, uz] = s.split(",").map(Number); return Math.abs(ux - x) + Math.abs(uz - z) < 4; })) continue;
    modules.push({ id: `rock-${k + 1}`, defId: "beachRock", cells: [[x, z]], rot: Math.floor(rnd() * 4), variant: k % 3 }); used.add(`${x},${z}`); k++;
  }
  const near = (x, z, d) => [...used].some(k => { const [ux, uz] = k.split(",").map(Number); return Math.abs(ux - x) + Math.abs(uz - z) < d; });
  const freeGrass = (x, z) => grid.inBounds(x, z) && !grid.isWater(x, z) && grid.get(x, z).groundType === GroundType.Grass && grid.get(x, z).elevation === 0;
  // 숲: 남서쪽에 나무 11그루를 모아 심음(벌목 장소) + 섬 곳곳에 5그루
  const forest = { x: 19, z: 41 };
  for (let k = 0, tries = 0; k < 11 && tries < 3000; tries++) {
    const a = rnd() * Math.PI * 2, r = 1 + rnd() * 4.2, x = Math.floor(forest.x + Math.cos(a) * r), z = Math.floor(forest.z + Math.sin(a) * r);
    if (!freeGrass(x, z) || near(x, z, 2)) continue;
    modules.push({ id: `tree-${k + 1}`, defId: "tree", cells: [[x, z]], rot: Math.floor(rnd() * 4), variant: k % 5 }); used.add(`${x},${z}`); k++;
  }
  for (let k = 11, tries = 0; k < 16 && tries < 2000; tries++) {
    const x = Math.floor(rnd() * w), z = Math.floor(rnd() * h), r = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (!freeGrass(x, z) || r < 12 || near(x, z, 4)) continue;
    modules.push({ id: `tree-${k + 1}`, defId: "tree", cells: [[x, z]], rot: Math.floor(rnd() * 4), variant: k % 5 }); used.add(`${x},${z}`); k++;
  }
  // 광산: 언덕 남쪽 기슭에 광석 바위 5개
  const mine = { x: 21, z: 27 };
  [[18, 26], [20, 27], [22, 26], [24, 27], [21, 29]].forEach(([x, z], k) => {
    if (!freeGrass(x, z) || used.has(`${x},${z}`)) return;
    modules.push({ id: `ore-${k + 1}`, defId: "ore", cells: [[x, z]], rot: k % 4, variant: k % 3 }); used.add(`${x},${z}`);
  });
  // 낚시터: 부두 끝 두 칸(바다 쪽 +z를 봄) + 해변에서 바다와 맞닿은 모래 칸 몇 곳. 부두 입구 옆에 건조대·양동이.
  const spots = [];
  const pierEnd = Math.max(...pier.map(c => c[1]));
  for (const [x, z] of pier.filter(c => c[1] === pierEnd)) spots.push({ x, z, dir: [0, 1] });
  const shore = [];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const c = grid.get(x, z);
    if (grid.isWater(x, z) || c.groundType !== GroundType.Sand || used.has(`${x},${z}`)) continue;
    const d = [[0, 1], [1, 0], [0, -1], [-1, 0]].find(([dx, dz]) => grid.isWater(x + dx, z + dz) && !used.has(`${x + dx},${z + dz}`));
    if (d) shore.push({ x, z, dir: d, a: Math.atan2(z + 0.5 - cz, x + 0.5 - cx) });
  }
  for (const want of [0.6, 1.4, 2.4, -0.3]) {                         // 섬 둘레 몇 방향(라디안)에서 하나씩
    const s = shore.filter(p => !spots.some(q => Math.abs(q.x - p.x) + Math.abs(q.z - p.z) < 6) && !near(p.x, p.z, 3))
      .sort((p, q) => Math.abs(Math.atan2(Math.sin(p.a - want), Math.cos(p.a - want))) - Math.abs(Math.atan2(Math.sin(q.a - want), Math.cos(q.a - want))))[0];
    if (s) spots.push({ x: s.x, z: s.z, dir: s.dir });
  }
  const pierBase = Math.min(...pier.map(c => c[1])) - 1;
  [["fishStand", 29], ["bucket", 34]].forEach(([defId, x]) => {
    if (grid.inBounds(x, pierBase) && !grid.isWater(x, pierBase) && !used.has(`${x},${pierBase}`))
      { modules.push({ id: `${defId}-1`, defId, cells: [[x, pierBase]], rot: 0 }); used.add(`${x},${pierBase}`); }
  });
  // 밭(농부가 심고 거둠): 광장 서쪽 3×2칸, 흙으로 칠함. 걸어 다닐 수 있는 칸이다.
  const plots = [];
  for (let z = 32; z <= 33; z++) for (let x = 25; x <= 27; x++)
    if (freeGrass(x, z) && !used.has(`${x},${z}`)) { set(x, z, GroundType.Dirt); plots.push({ x, z }); used.add(`${x},${z}`); }
  // 시장 가판대(상인이 사고팖): 광장 동쪽 가장자리, 상인은 광장 쪽 칸에 서서 장사
  const stall = { x: 35, z: 30, standX: 34, standZ: 30 };
  if (!used.has("35,30") && !grid.isWater(35, 30)) { modules.push({ id: "stall-1", defId: "stall", cells: [[35, 30]], rot: 3 }); used.add("35,30"); }
  const zones = [{ id: "forest", label: "🌲 숲", x: forest.x, z: forest.z }, { id: "mine", label: "⛏ 광산", x: mine.x, z: mine.z },
                 { id: "fishing", label: "🎣 낚시터", x: 32, z: pierEnd - 1 }, { id: "farm", label: "🌾 밭", x: 26, z: 32 },
                 { id: "market", label: "🐚 시장", x: 35, z: 30 }];
  grid.markAllDirty();
  return { grid, modules, spots, zones, plots, stall };
}

// ---------------------------------------------------------------- 넓은 섬(게임 시작용)
// 처음엔 자연만: 만과 곶이 있는 들쭉날쭉한 해안선, 넓은 잔디 평야, 북서쪽 고지대(등고선처럼 굴곡진 잔디 단이 층층이,
// 단 가장자리는 회색 바위 비탈, 단 사이는 흙길 비탈로 이어짐), 고지대 기슭 동굴(둘레 광석 바위), 숲 세 곳, 낮은 언덕, 곶 끝 등대, 해변 바위.
// 가운데는 공식은행 자리로 비워 둠(World.create에서 지음). 시장·밭·낚시터·집은 갈매미가 지음.
export const WILD = { size: 96, r: 33 };
const TERRACE = 0.9;                 // 고지대 한 층 높이(m): 걸어서는 못 오름(흙길 비탈로만). 가장자리는 돌벽

/** 값 노이즈(격자 꼭짓점 난수를 부드럽게 보간) + 여러 겹(fbm) */
function makeNoise(seed) {
  const r = seededRandom(seed * 7919 + 13), P = new Float32Array(64 * 64); for (let i = 0; i < P.length; i++) P[i] = r();
  const at = (x, z) => P[((z & 63) << 6) | (x & 63)], sm = t => t * t * (3 - 2 * t);
  const n = (x, z) => { const x0 = Math.floor(x), z0 = Math.floor(z), fx = sm(x - x0), fz = sm(z - z0);
    return (at(x0, z0) * (1 - fx) + at(x0 + 1, z0) * fx) * (1 - fz) + (at(x0, z0 + 1) * (1 - fx) + at(x0 + 1, z0 + 1) * fx) * fz; };
  return (x, z, oct = 3) => { let a = 0, f = 1, w = 0.5, t = 0; for (let o = 0; o < oct; o++) { a += w * n(x * f, z * f); t += w; f *= 2; w *= 0.5; } return a / t; };
}

export function generateWildIsland(seed = 7, w = WILD.size, h = WILD.size) {
  const rnd = seededRandom(seed), grid = new Grid(w, h), noise = makeNoise(seed);
  const cx = w / 2, cz = h / 2, ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  // 해안선: 큰 굴곡 + 만 세 곳(남서·남·동쪽, 부두 놓기 좋은 곳) + 북동쪽 곶(등대)
  const bays = [{ a: Math.PI * 0.72, d: 7, wd: 0.22 }, { a: Math.PI * 0.42, d: 6, wd: 0.18 }, { a: Math.PI * 0.05, d: 6, wd: 0.2 }];
  const coast = a => {
    let r = WILD.r * (1 + 0.1 * Math.sin(2 * a + ph[0]) + 0.07 * Math.sin(3 * a + ph[1]) + 0.04 * Math.sin(7 * a + ph[2]));
    for (const b of bays) { const d = Math.atan2(Math.sin(a - b.a), Math.cos(a - b.a)); r -= b.d * Math.exp(-(d * d) / (2 * b.wd * b.wd)); }
    const cape = Math.atan2(Math.sin(a + Math.PI / 4), Math.cos(a + Math.PI / 4)); r += 7 * Math.exp(-(cape * cape) / (2 * 0.1 * 0.1));   // 북동 곶
    return Math.min(r, w / 2 - 3);
  };
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz, r = Math.hypot(dx, dz) + (noise(x * 0.18, z * 0.18) - 0.5) * 3, edge = coast(Math.atan2(dz, dx)), c = grid.get(x, z);
    if (r < edge - BEACH) { c.groundType = GroundType.Grass; c.elevation = 0; }
    else if (r < edge) { c.groundType = GroundType.Sand; c.elevation = -Math.round(15 * (r - (edge - BEACH)) / BEACH) / 100; }
    else { c.groundType = GroundType.Sand; c.elevation = Math.max(SEABED, -0.45 - 0.12 * (r - edge)); }
  }
  const modules = [], used = new Set(), key = (x, z) => `${x},${z}`, N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const near = (x, z, d) => [...used].some(k => { const [ux, uz] = k.split(",").map(Number); return Math.abs(ux - x) + Math.abs(uz - z) < d; });
  const freeGrass = (x, z) => grid.inBounds(x, z) && !grid.isWater(x, z) && grid.get(x, z).groundType === GroundType.Grass && !used.has(key(x, z));

  // 고지대: 북서쪽에 굴곡진 덩어리(노이즈) → 층(TERRACE m)으로 나눔. 바다에서 4칸 안쪽까지만.
  const hl = { x: cx - 15, z: cz - 14, rx: 21, rz: 17 };
  const level = new Map();
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const c = grid.get(x, z); if (c.groundType !== GroundType.Grass) continue;
    let coastD = 9; for (let k = 1; k <= 4; k++) for (const [dx, dz] of N4) if (grid.isWater(x + dx * k, z + dz * k)) coastD = Math.min(coastD, k);
    const ex = (x + 0.5 - hl.x) / hl.rx, ez = (z + 0.5 - hl.z) / hl.rz, d = Math.hypot(ex, ez) + (noise(x * 0.06 + 5, z * 0.06) - 0.5) * 0.9;
    if (d >= 1 || coastD < 3) continue;
    const hcont = (1 - d) * 5.2 * (0.6 + 0.6 * noise(x * 0.07, z * 0.07 + 9)) * Math.min(1, (coastD - 2) / 3);
    const lv = Math.min(4, Math.floor(hcont / TERRACE)); if (lv <= 0) continue;
    level.set(key(x, z), lv);
  }
  // 층 띠가 너무 좁지 않게(넓은 단 + 비탈 놓을 자리): 반지름 4칸 안의 가장 낮은 층 + 1보다 높지 않게
  for (let pass = 0; pass < 3; pass++) {
    const next = new Map();
    for (const [k, lv] of level) {
      const [x, z] = k.split(",").map(Number); let lo = lv;
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dz * dz <= 17) lo = Math.min(lo, level.get(key(x + dx, z + dz)) || 0);
      const nl = Math.min(lv, lo + 1); if (nl > 0) next.set(k, nl);
    }
    level.clear(); for (const [k, v] of next) level.set(k, v);
  }
  for (const [k, lv] of level) { const [x, z] = k.split(",").map(Number), c = grid.get(x, z); c.elevation = lv * TERRACE; }
  // 바닷가 작은 둥근 언덕 셋(2~3층 계단식, 가장자리는 바위 비탈, 흙길 비탈 하나)
  const smallHills = [{ a: Math.PI * 0.55, n: 3 }, { a: Math.PI * 0.2, n: 2 }, { a: Math.PI * 0.9, n: 2 }];
  for (const sh of smallHills) {
    let hx = 0, hz = 0; for (let r = WILD.r; r > 10; r -= 0.5) { hx = cx + Math.cos(sh.a) * r; hz = cz + Math.sin(sh.a) * r; const c = grid.get(Math.floor(hx), Math.floor(hz)); if (c && c.groundType === GroundType.Grass && c.elevation === 0) { let ok = true; for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) if (grid.isWater(Math.floor(hx + dx * 0.7), Math.floor(hz + dz * 0.7))) ok = false; if (ok) break; } }
    const R0 = 3 + sh.n * 1.4, cellsH = [];
    for (let z = Math.floor(hz - R0); z <= hz + R0; z++) for (let x = Math.floor(hx - R0); x <= hx + R0; x++) {
      const c = grid.get(x, z); if (!c || c.groundType !== GroundType.Grass || c.elevation !== 0 || level.has(key(x, z))) continue;
      const d = Math.hypot(x + 0.5 - hx, z + 0.5 - hz) / R0 + (noise(x * 0.3, z * 0.3 + 3) - 0.5) * 0.25; if (d >= 1) continue;
      const lv = Math.min(sh.n, Math.ceil((1 - d) * sh.n * 1.15)); if (lv <= 0) continue;
      c.elevation = lv * TERRACE * 0.75; cellsH.push([x, z, lv]);
    }
    for (const [x, z, lv] of cellsH) {                                              // 가장자리 바위
      let edge = false; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const o = grid.get(x + dx, z + dz); if (o && o.elevation < grid.get(x, z).elevation - 0.01) edge = true; }
      void edge;                                                                   // 가장자리는 잔디(돌벽으로 보임)
    }
  }
  // 고지대 꼭대기 바위 봉우리(걸어서는 못 감): 가장 높은 층 안쪽 몇 곳
  const tops = [...level].filter(([, lv]) => lv >= 3).map(([k]) => k.split(",").map(Number)).filter(([x, z]) => grid.get(x, z).groundType === GroundType.Grass);
  for (let k = 0; k < 2 && tops.length; k++) {
    const [px, pz] = tops[Math.floor(rnd() * tops.length)];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = grid.get(px + dx, pz + dz); if (!c || !level.has(key(px + dx, pz + dz))) continue;
      c.elevation = Math.round((c.elevation + (dx || dz ? 0.9 : 1.6)) * 100) / 100; c.groundType = GroundType.Rock;
    }
  }
  // 가장자리(더 낮은 이웃이 있는 칸): 예전엔 바위 비탈이었으나 지금은 잔디 + 돌벽(groundChunks가 높은 벽을 돌빛으로 그림)
  const lvAt = (x, z) => level.get(key(x, z)) || 0;
  for (const [k, lv] of level) {
    const [x, z] = k.split(",").map(Number);
    let edge = false; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (lvAt(x + dx, z + dz) < lv && !grid.isWater(x + dx, z + dz)) edge = true;
    void edge;                                                                     // 가장자리는 잔디 그대로(그림에서 수직 돌벽으로 보임)
  }
  // 흙길 비탈: 걸어서 닿는 곳에서 다음 층으로 4칸짜리 비탈(칸마다 0.2 m)을 붙임. 모든 층이 이어질 때까지 반복.
  const reach = () => {
    const seen = new Set(), q = [];
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) { const c = grid.get(x, z); if (!grid.isWater(x, z) && c.elevation <= 0.05 && !level.has(key(x, z))) { seen.add(key(x, z)); q.push([x, z]); } }
    while (q.length) { const [x, z] = q.pop(), e = grid.get(x, z).elevation;
      for (const [dx, dz] of N4) { const nx = x + dx, nz = z + dz, k2 = key(nx, nz), c = grid.get(nx, nz);
        if (!c || seen.has(k2) || grid.isWater(nx, nz) || Math.abs(c.elevation - e) > 0.25 + 1e-6) continue; seen.add(k2); q.push([nx, nz]); } }
    return seen;
  };
  const ramps = new Set(), bad = new Set();
  for (let iter = 0; iter < 60; iter++) {
    const seen = reach(); let best = null;
    for (const k of seen) {
      const [x, z] = k.split(",").map(Number), e = grid.get(x, z).elevation;
      for (const [dx, dz] of N4) {
        const bx = x + dx, bz = z + dz, b = grid.get(bx, bz), inn = grid.get(bx + dx, bz + dz); if (!b || !inn || seen.has(key(bx, bz)) || inn.groundType === GroundType.Rock) continue;
        const top = inn.elevation; if (top - e < 0.3 || top - e > 1.0 || b.elevation < e - 0.01 || b.elevation > top + 0.01) continue;
        // 비탈은 아래층에 3칸(x - dx·1..3) + 위층 가장자리 B, 그 안쪽 B2가 같은 높이여야 함
        const cells = [1, 2, 3].map(i => [x - dx * (i - 1), z - dz * (i - 1)]);
        if (bad.has(cells[0].join())) continue;
        if (!cells.every(([px, pz]) => { const c = grid.get(px, pz); return c && !grid.isWater(px, pz) && Math.abs(c.elevation - e) < 0.01 && seen.has(key(px, pz)) && !ramps.has(key(px, pz)); })) continue;
        const score = Math.hypot(bx - cx, bz - cz) + rnd() * 6;                      // 가운데(마을) 쪽에서 가까운 비탈 먼저
        if (!best || score < best.score) best = { score, cells, b: [bx, bz], e, top, d: [dx, dz] };
      }
    }
    if (!best) break;
    const undo = [...best.cells, best.b].map(([px, pz]) => { const c = grid.get(px, pz); return [c, c.elevation, c.groundType]; });
    // 아래층 3칸 + 가장자리 B: 다섯 걸음에 나눠 오름(칸마다 0.2 m 이하)
    best.cells.forEach(([px, pz], i) => { const c = grid.get(px, pz); c.elevation = Math.round((best.e + (3 - i) * (best.top - best.e) / 5) * 100) / 100; c.groundType = GroundType.Dirt; });
    { const c = grid.get(best.b[0], best.b[1]); c.elevation = Math.round((best.e + 4 * (best.top - best.e) / 5) * 100) / 100; c.groundType = GroundType.Dirt; }
    const after = reach();
    if ([...seen].some(k2 => !after.has(k2))) { for (const [c, e, t] of undo) { c.elevation = e; c.groundType = t; } bad.add(best.cells[0].join()); continue; }   // 이미 다니던 길을 끊으면 되돌림
    [...best.cells, best.b].forEach(([px, pz]) => ramps.add(key(px, pz)));
  }
  { const seen = reach(); for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) { const c = grid.get(x, z); if (c.elevation > 0.25 && !seen.has(key(x, z)) && c.groundType !== GroundType.Rock) c.groundType = GroundType.Rock; } }   // 그래도 못 닿는 단은 바위로

  // 연못: 고지대 동쪽 기슭 평지(바다 높이보다 낮게 파서 물이 참)
  {
    let pond = null;
    for (let t = 0; t < 200 && !pond; t++) {
      const px = Math.floor(hl.x + hl.rx * 0.8 + rnd() * 6), pz = Math.floor(hl.z + rnd() * 8 - 2);
      let ok = true; for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) { const c = grid.get(px + dx, pz + dz); if (!c || c.elevation !== 0 || c.groundType !== GroundType.Grass) ok = false; }
      if (ok && Math.hypot(px - cx, pz - cz) > 10) pond = { x: px, z: pz };
    }
    if (pond) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dz) + (noise((pond.x + dx) * 0.4, (pond.z + dz) * 0.4) - 0.5) * 1.2, c = grid.get(pond.x + dx, pond.z + dz);
      if (d < 2.6) { c.elevation = -0.6; c.groundType = GroundType.Sand; } else if (d < 3.4) { c.elevation = -0.12; c.groundType = GroundType.Sand; }
    }
    if (pond) { used.add(key(pond.x, pond.z)); var pondAt = pond; }
  }
  // 동굴: 고지대 남쪽 기슭(바위 비탈 바로 앞 평지 2×2), 둘레에 광석 바위 6개
  let cave = null;
  for (let z = Math.floor(hl.z); z < hl.z + hl.rz + 6 && !cave; z++) for (let x = Math.floor(hl.x - 6); x < hl.x + 8 && !cave; x++) {
    const cells = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]];
    if (!cells.every(([px, pz]) => freeGrass(px, pz) && grid.get(px, pz).elevation === 0 && !level.has(key(px, pz)))) continue;
    if (lvAt(x, z - 1) > 0 && lvAt(x + 1, z - 1) > 0 && !ramps.has(key(x, z - 1))) cave = { x, z, cells };       // 뒤(북쪽)가 고지대 비탈
  }
  if (cave) { modules.push({ id: "cave-1", defId: "cave", cells: cave.cells, rot: 0 }); cave.cells.forEach(([x, z]) => used.add(key(x, z))); }
  const caveAt = cave ? { x: cave.x + 1, z: cave.z + 1 } : { x: hl.x, z: hl.z + hl.rz };
  for (let k = 0, tries = 0; k < 6 && tries < 800; tries++) {
    const a = rnd() * Math.PI * 2, r = 2 + rnd() * 3.5, x = Math.floor(caveAt.x + Math.cos(a) * r), z = Math.floor(caveAt.z + Math.sin(a) * r);
    if (!freeGrass(x, z) || grid.get(x, z).elevation !== 0 || level.has(key(x, z)) || near(x, z, 2)) continue;
    modules.push({ id: `ore-${k + 1}`, defId: "ore", cells: [[x, z]], rot: k % 4, variant: k % 3 }); used.add(key(x, z)); k++;
  }
  // 등대: 북동 곶 끝의 모래 2×2
  for (let r = WILD.r + 10; r > 12; r -= 0.5) {
    const a = -Math.PI / 4, x = Math.floor(cx + r * Math.cos(a)), z = Math.floor(cz + r * Math.sin(a));
    const cells = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]];
    if (cells.every(([px, pz]) => grid.inBounds(px, pz) && !grid.isWater(px, pz))) { modules.push({ id: "lighthouse-1", defId: "lighthouse", cells, rot: 0 }); cells.forEach(([px, pz]) => used.add(key(px, pz))); break; }
  }
  // 가운데 은행 자리(둘레 포함)는 비움, 흙길 비탈도 비움
  for (let z = cz - 6; z <= cz + 5; z++) for (let x = cx - 6; x <= cx + 6; x++) used.add(key(x, z));
  for (const k of ramps) used.add(k);
  // 숲 세 곳 + 평야에 드문드문
  const forests = [{ x: cx - 20, z: cz + 13, n: 14, r: 5.5 }, { x: cx + 17, z: cz + 12, n: 12, r: 5 }, { x: cx + 12, z: cz - 17, n: 10, r: 4.5 }];
  let tid = 1;
  const okTree = (x, z) => freeGrass(x, z) && !near(x, z, 2);
  for (const f of forests) for (let k = 0, tries = 0; k < f.n && tries < 4000; tries++) {
    const a = rnd() * Math.PI * 2, r = 1 + rnd() * f.r, x = Math.floor(f.x + Math.cos(a) * r), z = Math.floor(f.z + Math.sin(a) * r);
    if (!okTree(x, z) || grid.get(x, z).elevation !== 0) continue;
    modules.push({ id: `tree-${tid}`, defId: "tree", cells: [[x, z]], rot: Math.floor(rnd() * 4), variant: tid % 5 }); used.add(key(x, z)); tid++; k++;
  }
  for (let k = 0, tries = 0; k < 14 && tries < 4000; tries++) {
    const x = Math.floor(rnd() * w), z = Math.floor(rnd() * h);
    if (!okTree(x, z) || grid.get(x, z).elevation !== 0 || near(x, z, 4)) continue;   // 평지 잔디만(고지대 좁은 단의 길을 막지 않게)
    modules.push({ id: `tree-${tid}`, defId: "tree", cells: [[x, z]], rot: Math.floor(rnd() * 4), variant: tid % 5 }); used.add(key(x, z)); tid++; k++;
  }
  // 해변 바위
  for (let k = 0, tries = 0; k < 10 && tries < 1000; tries++) {
    const x = Math.floor(rnd() * w), z = Math.floor(rnd() * h), c = grid.get(x, z);
    if (grid.isWater(x, z) || c.groundType !== GroundType.Sand || c.elevation > -0.05 || near(x, z, 5)) continue;
    modules.push({ id: `rock-${k + 1}`, defId: "beachRock", cells: [[x, z]], rot: Math.floor(rnd() * 4), variant: k % 3 }); used.add(key(x, z)); k++;
  }
  const zones = [{ id: "highland", label: "⛰ 고지대", x: hl.x, z: hl.z }, { id: "cave", label: "🕳 동굴", x: caveAt.x, z: caveAt.z + 1 },
    ...forests.map((f, i) => ({ id: `forest${i}`, label: "🌲 숲", x: f.x, z: f.z })), { id: "bank", label: "🏦 공식은행", x: cx, z: cz - 3 }];
  if (typeof pondAt !== "undefined") zones.push({ id: "pond", label: "💧 연못", x: pondAt.x, z: pondAt.z });
  grid.markAllDirty();
  return { grid, modules, spots: [], zones, plots: [], stall: null, center: { x: cx, z: cz } };
}
