// 건물 밑 바닥(칠하기·자동 맞춤). 건물 모델이 차지 칸보다 작아서 밑의 바닥이 드러나 보이므로, 길로 칠한 마을에서 건물 밑만 잔디로 남지 않게 함.
//  · 칠하기: 건물 칸도 칠할 수 있음. 밭(def.field — 밭 칸은 따로 거절), 계단(ramp — 걸어 다니는 시설이라 위를 걷는 갈매미가 돌길 속도를 받게 됨),
//    다리(물 칸이라 원래 거절), 나무·바위·지형지물(모듈 — 바닥 종류로 심을 수 있는지를 정하므로 밑 바닥을 바꾸지 않음)은 그대로 거절.
//  · 길 연결(roads.isPaved)은 건물 칸을 늘 포장이 아닌 것으로 봄 → 건물 밑을 돌길로 칠해도 도로망이 건물을 지나 이어지지 않음(갈매미가 지나갈 수 없으니까).
//  · 자동 맞춤(matchGround): 새로 놓는 건물의 둘레(8방향, 땅 칸)가 MATCH_MIN 넘게 한 가지 길 바닥이면, 차지 칸 가운데 잔디인 칸만 그 바닥으로.
//    플레이어가 칠한 바닥(잔디가 아닌 칸)은 덮어쓰지 않음. 철거해도 그대로 둠(둘레와 같은 바닥이라 광장에 잔디 구멍이 생기지 않게).
//    알림은 type 없이 보냄 → 오늘의 부탁 '포장도로 칠하기'에 세지 않음.
import { GroundType } from "../data/types.js";
import { BUILDINGS } from "../data/catalog.js";

export const MATCH_TYPES = [GroundType.Cobble, GroundType.WoodDeck, GroundType.Dirt];
export const MATCH_MIN = 2 / 3;                                                   // 둘레 땅 칸 가운데 이 비율 이상이 한 가지 길 바닥이면 맞춤
export const MATCH_RING_MIN = 4;                                                  // 둘레 땅 칸이 이보다 적으면(바닷가 끝 등) 맞추지 않음

/** 이 칸을 차지한 것(occupiedId) 밑을 칠할 수 있나: 없음 또는 밭·계단이 아닌 건물 */
export function paintableUnder(world, id) {
  if (!id) return true;
  const b = world.buildings.get(id), def = b && BUILDINGS[b.defId];
  return !!def && !def.field && !def.bridge && !def.stairs && !b.ramp;
}

/** 건물 둘레 땅 칸에서 가장 많은 길 바닥과 그 비율 → { type, share, n } (없으면 type null) */
export function ringGround(world, b) {
  const g = world.grid, own = new Set(b.cells.map(([x, z]) => `${x},${z}`)), seen = new Set(), count = {}; let n = 0;
  for (const [cx, cz] of b.cells) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const x = cx + dx, z = cz + dz, k = `${x},${z}`; if (own.has(k) || seen.has(k)) continue; seen.add(k);
    if (!g.inBounds(x, z) || g.isWater(x, z)) continue;
    n++; const t = g.get(x, z).groundType; count[t] = (count[t] || 0) + 1;
  }
  let type = null, best = 0; for (const t of MATCH_TYPES) if ((count[t] || 0) > best) { best = count[t]; type = t; }
  return { type, share: n ? best / n : 0, n };
}

/** 새로 놓은 건물 밑 잔디를 둘레 길 바닥에 맞춤. 바꾼 칸 수 */
export function matchGround(world, b) {
  if (!paintableUnder(world, b.id)) return 0;
  const r = ringGround(world, b); if (!r.type || r.n < MATCH_RING_MIN || r.share < MATCH_MIN) return 0;
  let n = 0;
  for (const [x, z] of b.cells) {
    const c = world.grid.get(x, z); if (!c || c.groundType !== GroundType.Grass || world.grid.isWater(x, z) || world.isPlot(x, z)) continue;
    if (world.grid.setGround(x, z, r.type)) { n++; world.emit("ground", { x, z }); }
  }
  return n;
}
