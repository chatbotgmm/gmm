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
    modules.push({ id: `rock-${k + 1}`, defId: "beachRock", cells: [[x, z]], rot: Math.floor(rnd() * 4) }); used.add(`${x},${z}`); k++;
  }
  grid.markAllDirty();
  return { grid, modules };
}
