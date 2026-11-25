// 바닥 그림 규칙(three.js 없이 시험할 수 있는 부분). groundChunks.js가 씀.
//  · 칠한 곳이 멀리서도 보이게: 바닥 색은 꼭짓점에만 들어가서, 칸당 조각이 1이면 한 칸짜리 칠하기·한 칸 폭 길이
//    이웃 색과 섞여(모서리 꼭짓점이 네 칸을 1/4씩 섞음) 거의 사라졌다. 그래서 좁은 칠하기(가로·세로 3칸 이하 띠)와 그 둘레만
//    상세도와 상관없이 EDGE_SUB 조각으로 그린다. 길 종류는 넓게 칠해도 테두리 칸을 촘촘히(테두리가 번지지 않고 또렷하게). 넓은 땅과 넓은 땅끼리의 경계는 그대로 거리별 상세도(넓은 섬에서 땅 칸의 약 10%만 촘촘해짐).
//  · 겨울 눈: 길(돌길·나무 데크·흙길)은 갈매미가 다니며 쓸어서 눈이 덜 쌓인다(SNOW_CLEAR만큼 덜). 잔디·모래·바위는 자연 땅이라 그대로.
import { GroundType } from "../data/types.js";

export const EDGE_SUB = 4;
/** 바닥 종류별로 눈을 얼마나 덜 쌓이게 할지(0 = 그대로, 1 = 안 쌓임) */
export const SNOW_CLEAR = { [GroundType.Cobble]: 0.85, [GroundType.WoodDeck]: 0.85, [GroundType.Dirt]: 0.6 };   // 포장(돌·나무)은 거의 다 쓸고, 흙길은 반쯤
export const snowClear = type => SNOW_CLEAR[type] || 0;

const kind = (grid, x, z) => { const c = grid.get(x, z); return !c || grid.isWater(x, z) ? null : c.groundType; };   // 물·밖은 null(경계로 안 봄)
/** (x, z)에서 (dx, dz) 방향으로 같은 종류가 몇 칸 이어지는지(양쪽, 자기 포함, 한쪽 최대 k칸까지만 셈). 물·밖은 이어진 것으로 봄 */
function runLen(grid, x, z, dx, dz, t, k) {
  let n = 1;
  for (const s of [1, -1]) for (let i = 1; i <= k; i++) { const u = kind(grid, x + s * dx * i, z + s * dz * i); if (u === t || u === null) n++; else break; }
  return n;
}
/** 좁은 칠하기: 가로나 세로로 THIN칸 이하인 띠(한 칸 붓·한 칸 폭 길·3×3까지). 넓은 자연 땅의 경계(해안 모래 등)는 해당 안 됨 */
export const THIN = 3;
export function isThin(grid, x, z) {
  const t = kind(grid, x, z); if (!t) return false;
  return runLen(grid, x, z, 1, 0, t, THIN) <= THIN || runLen(grid, x, z, 0, 1, t, THIN) <= THIN;
}
/** 좁은 칠하기 칸이나 그 둘레 8칸이면 true(둘레도 촘촘해야 칠한 곳 바깥 꼭짓점이 칠한 색을 끌고 나가지 않음) */
export function nearThin(grid, x, z) {
  if (!kind(grid, x, z)) return false;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (isThin(grid, x + dx, z + dz)) return true;
  return false;
}
/** 길(돌길·나무 데크·흙길)과 다른 종류가 맞닿은 칸: 길은 사람이 깐 것이라 넓어도 테두리가 또렷해야 함(자연 섬에는 길 칸이 거의 없음) */
const LOOK_PATHS = new Set([GroundType.Cobble, GroundType.WoodDeck, GroundType.Dirt]);   // autotile.js PATH_TYPES와 같음(그 파일은 한 파일 빌드에 안 들어가서 따로 둠)
export function pathEdge(grid, x, z) {
  const t = kind(grid, x, z); if (!t) return false;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const u = kind(grid, x + dx, z + dz); if (u && u !== t && (LOOK_PATHS.has(u) || LOOK_PATHS.has(t))) return true; }
  return false;
}
/** 이 칸을 몇 조각으로 그릴지: 거리별 상세도(sub)에, 좁은 칠하기 둘레나 길 테두리면 최소 EDGE_SUB */
export const cellSub = (grid, x, z, sub) => (sub < EDGE_SUB && (nearThin(grid, x, z) || pathEdge(grid, x, z)) ? EDGE_SUB : sub);
