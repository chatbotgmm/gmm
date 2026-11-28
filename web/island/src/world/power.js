// 전기: 다 지은 풍차 발전소(BUILDINGS의 power)에서 POWER_RANGE칸 안에만 들어옴. 가로등·건물 등불·집 창가 불빛은 전기가 들어와야 켜짐.
// 규칙은 여기 한 곳(순수 계산, 그림을 모름). World.powered(b) · World.poweredAt(x, z)가 이 함수를 부르고, 그림(daylight.js·powerRing.js)·만족도(roads.js)·소원(wishes.js)이 그것을 씀.
//  · 거리 = 풍차 가운데 ↔ 건물 가운데(차지한 칸들의 가운데, 칸 단위). 딱 POWER_RANGE칸(경계)이면 들어옴(범위 고리 위 = 켜짐)
//  · 짓는 중인 풍차는 전기를 못 냄. 풍차를 철거하면 그 범위는 바로 꺼짐(다른 풍차가 덮고 있으면 그대로)
//  · 짓는 중인 건물·가로등은 전기를 못 받음(다 지어야 켜짐)
//  · 저장에는 따로 적지 않음 — 불러오면 건물 목록에서 다시 계산
import { BUILDINGS } from "../data/catalog.js";

export const POWER_RANGE = 18;                                                    // 풍차 전기가 닿는 칸 수(범위 고리의 반지름도 이 값)
/** 건물 가운데(칸 좌표, 연속): 차지한 칸들의 가운데 */
export function centerOf(b) {
  let x = 0, z = 0; for (const [cx, cz] of b.cells) { x += cx + 0.5; z += cz + 0.5; }
  return { x: x / b.cells.length, z: z / b.cells.length };
}
/** 불이 달린 건물인가: 가로등 · 등불 달린 건물(lit) · 집(창가 불빛) */
export const usesPower = def => !!def && (def.id === "streetlamp" || !!def.lit || !!def.house);
/** 전기를 내는 풍차들(다 지은 것)의 가운데. 건물이 놓이거나 다 지어지거나 철거될 때(world.powerRev)만 다시 셈 */
export function powerSources(world) {
  const c = world._power;
  if (c && c.rev === world.powerRev && c.n === world.buildings.size) return c.list;
  const list = []; for (const b of world.buildings.values()) if (BUILDINGS[b.defId].power && world.isDone(b)) list.push({ id: b.id, ...centerOf(b) });
  world._power = { rev: world.powerRev, n: world.buildings.size, list }; return list;
}
/** 칸 좌표 (x, z)에 전기가 들어오나 */
export function poweredAt(world, x, z) { for (const s of powerSources(world)) if (Math.hypot(s.x - x, s.z - z) <= POWER_RANGE) return true; return false; }
/** 이 건물에 전기가 들어오나(다 지은 건물만) */
export function powered(world, b) { if (!b || !world.isDone(b)) return false; const c = centerOf(b); return poweredAt(world, c.x, c.z); }
/** (x, z)를 가운데로 한 풍차 범위 안의, 불이 달린 다 지은 건물들(풍차 카드 「불 켜진 건물 N」· 범위 표시의 강조) */
export function litInRange(world, x, z) {
  const out = []; for (const b of world.buildings.values()) { if (!usesPower(BUILDINGS[b.defId]) || !world.isDone(b)) continue; const c = centerOf(b); if (Math.hypot(c.x - x, c.z - z) <= POWER_RANGE) out.push(b); }
  return out;
}
/** 「전기 없음」 배지를 띄울 건물인가: 불이 달렸고(usesPower) 다 지었는데 어느 풍차 범위에도 안 든 건물. 짓는 중(진행률 표시가 있음)·풍차·불 없는 건물은 아님 */
export function lacksPower(world, b) { return !!b && usesPower(BUILDINGS[b.defId]) && world.isDone(b) && !powered(world, b); }
/** 전기가 안 닿는 불 달린 건물 목록(render/noPower.js의 배지). powerSources처럼 건물이 놓이거나 다 지어지거나 철거될 때(world.powerRev)만 다시 셈 */
export function unpowered(world) {
  const c = world._unpowered;
  if (c && c.rev === world.powerRev && c.n === world.buildings.size) return c.list;
  const list = []; for (const b of world.buildings.values()) if (lacksPower(world, b)) list.push(b);
  world._unpowered = { rev: world.powerRev, n: world.buildings.size, list }; return list;
}
/** 「전기 없음」을 알려도 되나: 풍차를 이 마을 등급에서 지을 수 있거나(🏘 어촌부터) 이미 놓은 풍차가 있음. 그 전에는 고칠 길이 없으니 배지·까닭 글을 숨김 */
export function powerOpen(world) {
  if (Object.values(BUILDINGS).some(d => d.power && (d.rank || 0) <= (world.rank || 0))) return true;
  for (const b of world.buildings.values()) if (BUILDINGS[b.defId]?.power) return true;
  return false;
}
