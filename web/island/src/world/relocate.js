// 건물 옮기기(🏠 건설 모드의 ↔ 옮기기 도구 · 건물 카드의 「↔ 옮기기」). 꾸미기라 돈은 안 듦(금고 그대로), ↶로 제자리로.
// 규칙(놓기와 같은 판정 + 길):
//  · 놓는 규칙은 짓기와 같음(placement.js checkPlacement — 섬 안, 물·다른 건물·남의 문 앞이 아님, 평평함, 문 앞에 설 수 있음, 낚시터·선착장은 앞이 물).
//    자기 칸·자기 문 앞은 비어 있는 것으로 봄(한 칸만 비켜 놓기·제자리에서 돌리기). 밭 칸에는 못 놓음(옮기는 밭 자기 칸은 됨)
//  · 길: 옮기기 전에 은행(없으면 섬 가운데)에서 걸어서 닿던 문은 옮긴 뒤에도 닿아야 함. 다른 다 지은 건물 문과 밖에 있는 갈매미도 그대로 닿아야 함
//  · 못 옮김: 다리(물 위 줄 — 철거하고 다시 놓음), 계단(비탈 높이에 맞춘 것 — 철거하고 다시 놓음), 배를 타고 가는 갈매미가 쓰는 선착장
//  · 공식은행도 옮길 수 있음(마을 가운데·소환 자리·이름표가 은행을 따라감 — World.center)
// 그대로 가는 것: id · 주인·같이 사는 갈매미 · 대출 · 실내(가구·바닥·벽지) · 안에 있는 갈매미 · 공사 진행·맡은 건축가·재료 · 업그레이드 공사 · 주문 공사 맡긴 돈 · 설계비(맡아 둔 것 포함) · 당번 의사.
// 따라가는 것: 밭 칸(작물·물기·자란 정도를 칸 순서대로) · 낚시터 낚시 자리 · 풍차 전기 범위(powerRev) · 문 앞 길·만족도(updateRoads) · 길 부탁(지움, 다시 부탁함).
// 바닥: 떠난 자리는 그대로 둠(철거와 같음 — groundMatch.js). 새 자리는 새로 놓을 때처럼 둘레가 길이면 잔디만 길로 맞추고, 밭이면 흙으로. 바꾼 칸은 ↶가 되돌림.
// 갈매미: 그 건물로 가던·짓던 갈매미는 새 자리로 길을 다시 찾음(unitBrain.rerouteMoved), 앉아 있던 벤치·밭·낚시 자리·옮긴 집 마당 고르기 일은 그만둠.
// 저장: 새로 적는 것 없음(건물 x·z·rot만 바뀌고 불러올 때 같은 판정으로 다시 놓음).
import { BUILDINGS } from "../data/catalog.js";
import { UnitState, GroundType } from "../data/types.js";
import { checkPlacement } from "./placement.js";
import { matchGround } from "./groundMatch.js";
import { setIdle, rerouteMoved } from "../units/unitBrain.js";

/** 이 건물을 옮길 수 없는 까닭(되면 "") */
export function moveBlock(w, b) {
  if (!b || w.buildings.get(b.id) !== b) return "이미 없어요";
  const def = BUILDINGS[b.defId];
  if (def.bridge) return "다리는 옮길 수 없어요. 철거하고 다시 놓아요";
  if (def.stairs) return "계단은 비탈에 맞춰 놓아서 옮길 수 없어요. 철거하고 다시 놓아요";
  if (def.pier && w.units.some(u => u.ferry && (u.ferry.A === b.id || u.ferry.B === b.id))) return "배를 타는 갈매미가 있어요. 내린 뒤에 옮겨요";
  return "";
}

/** 같은 문 앞 칸을 같이 쓰는 다른 건물(놓기 판정이 문 앞끼리 겹치는 것은 막지 않음 — grid.doors에는 한 id만 적힘) */
function doorMate(w, b, k) {
  const g = w.grid; for (const o of w.buildings.values()) if (o !== b && !BUILDINGS[o.defId].bridge && g.index(o.door.x, o.door.z) === k) return o;
  return null;
}
/** 자기 칸·자기 문 앞을 잠깐 비운 채로 fn을 부름(grid.version·캐시는 그대로). 다른 건물과 같이 쓰는 문 앞은 그 건물 것으로 남김 */
function lifted(w, b, fn) {
  const g = w.grid, cells = b.cells.map(([x, z]) => g.get(x, z)).filter(c => c && c.occupiedId === b.id), doors = [];
  for (const [k, v] of g.doors) if (v === b.id) doors.push(k);
  for (const c of cells) c.occupiedId = null; for (const k of doors) { const o = doorMate(w, b, k); if (o) g.doors.set(k, o.id); else g.doors.delete(k); }
  try { return fn(); } finally { for (const c of cells) c.occupiedId = b.id; for (const k of doors) g.doors.set(k, b.id); }
}

/** 길 검사: 옮긴 뒤에도 문·다른 건물 문·갈매미가 은행(없으면 섬 가운데)과 걸어서 이어지나. 문제가 있으면 까닭 */
export function moveLinkProblem(w, b, fp) {
  const g = w.grid, bank = w.bankB(), B = g.box, c = w.center;
  const ref0 = bank ? bank.door : { x: Math.floor(c?.x ?? (B.x0 + B.x1) / 2), z: Math.floor(c?.z ?? (B.z0 + B.z1) / 2) };
  const before = w.comps(), at = p => before.at(p.x, p.z), home = at(ref0); if (home < 0) return "";
  const ref = bank === b ? fp.door : ref0, linked = at(b.door) === home;
  if (g.occupants.get(b.id)?.walkable) return linked && at(fp.door) !== home ? "문 앞까지 걸어갈 길이 없어요" : "";   // 걸어 다니는 시설(다 지은 밭·낚시터·선착장)은 길을 막지 않음 — 닿던 문만 그대로 닿게
  const doors = [...w.buildings.values()].filter(o => o !== b && w.isDone(o) && !BUILDINGS[o.defId].bridge && at(o.door) === home).map(o => o.door);
  const gulls = w.units.filter(u => !u.insideBuildingId && u.state !== UnitState.Held && !u.sailing)
    .map(u => u.swimming && u.swim ? { x: u.swim.sx, z: u.swim.sz } : { x: Math.floor(u.x), z: Math.floor(u.z) }).filter(p => at(p) === home);
  const after = w.probeComps(fp.cells, b.cells, null, [ref, fp.door, ...doors, ...gulls].map(p => [p.x, p.z])), aid = p => after.at(p.x, p.z), h = aid(ref);
  if (h < 0) return "은행 문 앞이 막혀요";
  if (linked && aid(fp.door) !== h) return bank && bank !== b ? "그 자리에서는 은행까지 걸어갈 길이 없어요" : "문 앞까지 걸어갈 길이 없어요";
  if (!doors.every(d => aid(d) === h)) return "다른 건물로 가는 길이 막혀요";
  if (!gulls.every(p => aid(p) === h)) return "그러면 갈매미가 갇혀요";
  return "";
}

/** 옮길 수 있나: { ok, reason, cells, door, center, angle, elevation, … }. opt.links === false면 길 검사를 건너뜀(빈 자리 찾기용 빠른 판정) */
export function moveCheck(w, id, ax, az, rot, opt = {}) {
  const b = w.buildings.get(id), why = moveBlock(w, b); rot = ((rot | 0) % 4 + 4) % 4;
  if (why) return { ok: false, reason: why };
  const def = BUILDINGS[b.defId], r = lifted(w, b, () => checkPlacement(w.grid, def, ax, az, rot, w.units)), fail = reason => ({ ...r, ok: false, reason });
  if (!r.ok) return r;
  if (ax === b.x && az === b.z && rot === b.rot) return fail("지금 자리와 같아요");
  const own = new Set(b.cells.map(([x, z]) => `${x},${z}`));
  if (r.cells.some(([x, z]) => w.isPlot(x, z) && !own.has(`${x},${z}`))) return fail("밭에는 놓을 수 없어요");
  if (opt.links !== false) { const lw = moveLinkProblem(w, b, r); if (lw) return fail(lw); }
  return { ...r, rot };
}

/** 건물 옮기기. 성공: { ok, building, undo: { id, from, to, ground } } — undo는 ↶(undoMove)에 그대로 넘김. opt.dry: 판정만, opt.noMatch: 바닥 맞춤 안 함(되돌리기), opt.matched: 되돌릴 때 짓기 되돌리기 바닥 기록을 옛것으로 */
export function moveBuilding(w, id, ax, az, rot, opt = {}) {
  const r = moveCheck(w, id, ax, az, rot, opt); if (!r.ok || opt.dry) return r;
  const b = w.buildings.get(id), def = BUILDINGS[b.defId], g = w.grid, rnd = w.rnd;
  const from = { x: b.x, z: b.z, rot: b.rot, cells: b.cells.map(c => [c[0], c[1]]), door: { ...b.door } }, matched = b.matched || null;
  // 일을 그만둘 갈매미: 벤치에 앉은(일어나 옛 자리 문 앞에) · 이 밭 칸·낚시 자리를 찜한
  const plots = def.field ? from.cells.map(([x, z]) => w.plots.find(p => p.x === x && p.z === z) || null) : [];
  const spots = w.spots.filter(s => s.dock === id);
  for (const u of w.units) if (u.sitOn === id || (u.focus && (plots.includes(u.focus) || spots.includes(u.focus))) || (u.improve && u.home === id && !u.insideBuildingId)) setIdle(u, rnd, w);   // 마당 고르기는 옛 문 높이·옛 마당 칸이라 그만둠
  // 칸 옮기기
  const info = g.occupants.get(id) || { kind: "building", walkable: false, surface: 0 };
  g.release(id);
  { const k = g.index(from.door.x, from.door.z), o = doorMate(w, b, k); if (o) g.reserveDoor(from.door.x, from.door.z, o.id); }   // 같이 쓰던 문 앞은 남은 건물 것으로
  b.x = ax; b.z = az; b.rot = r.rot; b.cells = r.cells.map(c => [c[0], c[1]]); b.door = { ...r.door }; b.elevation = r.elevation; b.matched = null;   // ↶ 짓기 되돌리기의 바닥 기록은 옛 자리 것이라 버림(새 자리에서 맞춘 바닥으로 다시 적음)
  g.occupy(b.cells, id, { ...info, surface: r.elevation });
  if (!def.bridge) g.reserveDoor(b.door.x, b.door.z, id);
  w.dropDecor(b.cells);
  // 바닥: 새 자리만(떠난 자리는 그대로)
  const ground = [], was = b.cells.map(([x, z]) => g.get(x, z).groundType);
  plots.forEach((p, i) => { if (!p) return; w.emit("plotRemoved", p); [p.x, p.z] = b.cells[i]; });
  if (def.field) { if (w.isDone(b)) for (const [x, z] of b.cells) if (g.setGround(x, z, GroundType.Dirt)) w.emit("ground", { x, z }); }
  else if (!opt.noMatch) matchGround(w, b);
  b.cells.forEach(([x, z], i) => { const t = g.get(x, z).groundType; if (t !== was[i]) ground.push([x, z, t, was[i]]); });
  if (b.undoable) b.matched = opt.matched !== undefined ? opt.matched : ground.length ? ground.map(a => [...a]) : null;   // 옮긴 공사장도 ↶ 짓기 되돌리기가 새 자리 바닥을 되돌림
  for (const p of plots) if (p) w.emit("plotAdded", p);
  for (const s of spots) { const [x, z] = b.cells[0]; s.x = x; s.z = z; s.dir = [x - b.door.x, z - b.door.z]; }
  // 따라 다시 셈: 전기 · 길 부탁 · 만족도 · 은행 이름표
  w.powerRev++;
  if (w.roadAsks) for (const [k, a] of [...w.roadAsks]) if (def.market || def.bank || a.u?.home === id) w.roadAsks.delete(k);
  w.updateRoads?.();
  if (def.bank && w.wild) { const zb = w.zones.find(z => z.id === "bank"), c = w.center; if (zb) { zb.x = c.x; zb.z = c.z - 3; } }
  for (const u of w.units) rerouteMoved(u, w, b, rnd);
  w.emit("buildingMoved", { b, from });
  return { ok: true, reason: "", building: b, undo: { id, from: { x: from.x, z: from.z, rot: from.rot }, to: { x: b.x, z: b.z, rot: b.rot }, ground, matched } };
}

/** ↶ 옮기기 되돌리기: 그사이 그 건물이 또 옮겨지거나 없어지지 않았으면 옛 자리로. 옮길 때 바꾼 새 자리 바닥(그 뒤 손으로 다시 칠하지 않은 칸)도 되돌림.
 *  성공하면 ↷용 { ok, redo: undo 그대로 } */
export function undoMove(w, rec) {
  const b = rec && w.buildings.get(rec.id);
  if (!b) return { ok: false, reason: "이미 없어요" };
  if (b.x !== rec.to.x || b.z !== rec.to.z || b.rot !== rec.to.rot) return { ok: false, reason: "그사이 또 옮겨서 되돌릴 수 없어요" };
  const r = moveBuilding(w, rec.id, rec.from.x, rec.from.z, rec.from.rot, { noMatch: true, matched: rec.matched ?? null });
  if (!r.ok) return { ok: false, reason: `그사이 바뀌어서 되돌릴 수 없어요. ${r.reason}` };
  for (const [x, z, t, old] of rec.ground || []) if (w.grid.get(x, z)?.groundType === t && !w.isPlot(x, z) && w.grid.setGround(x, z, old)) w.emit("ground", { x, z });
  return { ok: true, reason: "", building: b, redo: rec };
}
