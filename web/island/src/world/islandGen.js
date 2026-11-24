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
// 처음엔 자연만: 넓은 잔디 평야와 모래사장, 북서쪽 산(층층이 절벽, 남동쪽 한 줄기는 걸어 오르는 비탈), 산기슭 동굴(둘레 광석 바위),
// 숲 세 곳, 등대, 해변 바위. 가운데는 공식은행 자리로 비워 둠(World.create에서 지음). 시장·밭·낚시터·집은 갈매미가 지음.
export const WILD = { size: 96, r: 36 };
export function generateWildIsland(seed = 7, w = WILD.size, h = WILD.size) {
  const rnd = seededRandom(seed), grid = new Grid(w, h);
  const cx = w / 2, cz = h / 2, ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const R = WILD.r, coast = a => R + 2.4 * Math.sin(3 * a + ph[0]) + 1.6 * Math.sin(5 * a + ph[1]) + 0.9 * Math.sin(9 * a + ph[2]);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz, r = Math.hypot(dx, dz), edge = coast(Math.atan2(dz, dx)), c = grid.get(x, z);
    if (r < edge - BEACH) { c.groundType = GroundType.Grass; c.elevation = 0; }
    else if (r < edge) { c.groundType = GroundType.Sand; c.elevation = -Math.round(15 * (r - (edge - BEACH)) / BEACH) / 100; }
    else { c.groundType = GroundType.Sand; c.elevation = Math.max(SEABED, -0.45 - 0.12 * (r - edge)); }
  }
  const modules = [], used = new Set(), key = (x, z) => `${x},${z}`;
  const near = (x, z, d) => [...used].some(k => { const [ux, uz] = k.split(",").map(Number); return Math.abs(ux - x) + Math.abs(uz - z) < d; });
  const freeGrass = (x, z) => grid.inBounds(x, z) && !grid.isWater(x, z) && grid.get(x, z).groundType === GroundType.Grass && !used.has(key(x, z));

  // 산: 층마다 0.5 m(걸어서는 못 오르는 절벽), 남동쪽 비탈 한 줄기만 높이가 칸마다 0.25 m 이하로 바뀜(걸어 오름)
  const mt = { x: cx - 17, z: cz - 15 }, MR = 12, TOP = 2.5, trailA = Math.PI / 4;   // 비탈 방향: 남동(+x, +z)
  for (let z = Math.floor(mt.z - MR - 4); z <= mt.z + MR + 4; z++) for (let x = Math.floor(mt.x - MR - 4); x <= mt.x + MR + 4; x++) {
    if (!grid.inBounds(x, z) || grid.isWater(x, z)) continue;
    const dx = x + 0.5 - mt.x, dz = z + 0.5 - mt.z, a = Math.atan2(dz, dx), r0 = Math.hypot(dx, dz), r = r0 * (1 + 0.12 * Math.sin(4 * a + ph[3]));
    const along = dx * Math.cos(trailA) + dz * Math.sin(trailA), across = -dx * Math.sin(trailA) + dz * Math.cos(trailA);
    const trail = along > 0 && Math.abs(across) < 1.6 && r0 <= MR * 1.15 + 1;      // 폭 약 3칸으로 일정한 비탈(굴곡진 산 가장자리 밖까지)
    if (r > MR && !trail) continue;
    // 비탈: 굴곡 없는 반지름으로 0.25 m 단위(이웃 칸끼리 한 단 이하) / 나머지: 0.5 m 단위 층(절벽)
    const e = trail ? Math.max(0, Math.min(TOP, Math.round(TOP * (1 - r0 / MR) * 4) / 4)) : Math.min(TOP, Math.ceil(TOP * (1 - r / MR) / 0.5 - 1e-6) * 0.5);
    const c = grid.get(x, z); c.elevation = e; c.groundType = trail && e > 0 && e < TOP ? GroundType.Dirt : GroundType.Grass;
  }
  // 동굴: 산 남쪽 기슭(산 밖 첫 평지 칸)에 2×2 입구, 둘레에 광석 바위 6개
  let cave = null;
  for (let r = MR - 1; r < MR + 4 && !cave; r += 0.5) {
    const a = Math.PI * 0.62, x = Math.floor(mt.x + Math.cos(a) * r), z = Math.floor(mt.z + Math.sin(a) * r);
    const cells = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]];
    if (cells.every(([px, pz]) => freeGrass(px, pz) && grid.get(px, pz).elevation === 0)) cave = { x, z, cells };
  }
  if (cave) { modules.push({ id: "cave-1", defId: "cave", cells: cave.cells, rot: 0 }); cave.cells.forEach(([x, z]) => used.add(key(x, z))); }
  const caveAt = cave ? { x: cave.x + 1, z: cave.z + 1 } : { x: mt.x, z: mt.z + MR + 2 };
  for (let k = 0, tries = 0; k < 6 && tries < 600; tries++) {
    const a = rnd() * Math.PI * 2, r = 2 + rnd() * 3, x = Math.floor(caveAt.x + Math.cos(a) * r), z = Math.floor(caveAt.z + Math.sin(a) * r);
    if (!freeGrass(x, z) || grid.get(x, z).elevation !== 0 || near(x, z, 2)) continue;
    modules.push({ id: `ore-${k + 1}`, defId: "ore", cells: [[x, z]], rot: k % 4, variant: k % 3 }); used.add(key(x, z)); k++;
  }
  // 등대: 북동쪽 해변 2×2
  for (let r = R + 3; r > 12; r -= 0.5) {
    const a = -Math.PI / 4, x = Math.floor(cx + r * Math.cos(a)), z = Math.floor(cz + r * Math.sin(a));
    const cells = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]];
    if (cells.every(([px, pz]) => grid.inBounds(px, pz) && !grid.isWater(px, pz) && grid.get(px, pz).groundType === GroundType.Sand)) {
      modules.push({ id: "lighthouse-1", defId: "lighthouse", cells, rot: 0 }); cells.forEach(([px, pz]) => used.add(key(px, pz))); break;
    }
  }
  // 가운데 은행 자리(둘레 4칸)는 비움
  for (let z = cz - 6; z <= cz + 5; z++) for (let x = cx - 6; x <= cx + 6; x++) used.add(key(x, z));
  // 숲 세 곳 + 흩어진 나무
  const forests = [{ x: cx - 20, z: cz + 14, n: 14, r: 5.5 }, { x: cx + 18, z: cz + 12, n: 12, r: 5 }, { x: cx + 14, z: cz - 18, n: 10, r: 4.5 }];
  let tid = 1;
  for (const f of forests) for (let k = 0, tries = 0; k < f.n && tries < 4000; tries++) {
    const a = rnd() * Math.PI * 2, r = 1 + rnd() * f.r, x = Math.floor(f.x + Math.cos(a) * r), z = Math.floor(f.z + Math.sin(a) * r);
    if (!freeGrass(x, z) || grid.get(x, z).elevation !== 0 || near(x, z, 2)) continue;
    modules.push({ id: `tree-${tid}`, defId: "tree", cells: [[x, z]], rot: Math.floor(rnd() * 4), variant: tid % 5 }); used.add(key(x, z)); tid++; k++;
  }
  for (let k = 0, tries = 0; k < 10 && tries < 3000; tries++) {                       // 평야에 드문드문(산 위는 길이 막히지 않게 비움)
    const x = Math.floor(rnd() * w), z = Math.floor(rnd() * h);
    if (!freeGrass(x, z) || grid.get(x, z).elevation !== 0 || near(x, z, 5)) continue;
    modules.push({ id: `tree-${tid}`, defId: "tree", cells: [[x, z]], rot: Math.floor(rnd() * 4), variant: tid % 5 }); used.add(key(x, z)); tid++; k++;
  }
  // 해변 바위
  for (let k = 0, tries = 0; k < 8 && tries < 800; tries++) {
    const x = Math.floor(rnd() * w), z = Math.floor(rnd() * h), c = grid.get(x, z);
    if (grid.isWater(x, z) || c.groundType !== GroundType.Sand || c.elevation > -0.05 || near(x, z, 5)) continue;
    modules.push({ id: `rock-${k + 1}`, defId: "beachRock", cells: [[x, z]], rot: Math.floor(rnd() * 4), variant: k % 3 }); used.add(key(x, z)); k++;
  }
  const zones = [{ id: "mountain", label: "⛰ 산", x: mt.x, z: mt.z }, { id: "cave", label: "🕳 동굴", x: caveAt.x, z: caveAt.z + 1 },
    ...forests.map((f, i) => ({ id: `forest${i}`, label: "🌲 숲", x: f.x, z: f.z })), { id: "bank", label: "🏦 공식은행", x: cx, z: cz - 3 }];
  grid.markAllDirty();
  return { grid, modules, spots: [], zones, plots: [], stall: null, center: { x: cx, z: cz } };
}
