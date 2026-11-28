// 건물 옮기기(world/relocate.js): 상태가 그대로 따라감 · 칸 비우고 차지 · 못 놓는 자리 · ↶ 되돌리기 · 저장/불러오기 · 갈매미 길 다시 찾기 · 풍차 전기 범위. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { UnitState } from "../src/data/types.js";
import { POWER_RANGE, centerOf } from "../src/world/power.js";
import { BUILDINGS } from "../src/data/catalog.js";
import { anchorFor } from "../src/world/placement.js";
import { relocInfo, relocHtml, relocStatus } from "../src/ui/moveView.js";

function town() {
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }); w.instantBuild = true;
  for (const n of ["목수", "미니"]) w.addUnitByName(n);
  w.bank.vault = 1e6; w.rank = 3;                                                // 풍차(항구 마을부터)도 지을 수 있게
  return w;
}
/** 가운데에서 가까운 순으로 ok(x, z)가 참인 칸 */
function near(w, ok, from = w.center, R = 50) {
  for (let r = 3; r < R; r++) for (let k = 0; k < 8 * r; k++) { const a = k / (8 * r) * 6.283, x = Math.floor(from.x + Math.cos(a) * r), z = Math.floor(from.z + Math.sin(a) * r); if (ok(x, z)) return [x, z]; }
  return null;
}
const place = (w, d, from) => { const s = near(w, (x, z) => w.check(d, x, z, 0).ok, from); assert.ok(s, `${d} 자리`); const r = w.placeBuilding(d, s[0], s[1], 0); assert.ok(r.ok, r.reason); return r.building; };
const moveSpot = (w, b, rot = b.rot, from = { x: b.x, z: b.z }, min = 6) => near(w, (x, z) => Math.hypot(x - b.x, z - b.z) >= min && w.moveBuilding(b.id, x, z, rot, { dry: true }).ok, from);
const occ = (w, cells) => cells.map(([x, z]) => w.grid.get(x, z).occupiedId);
const starter = w => [...w.buildings.values()].find(b => b.defId === "house");

test("집을 옮기면 id·주인·같이 사는 갈매미·대출·가구·공사 상태가 그대로이고, 옛 칸은 비고 새 칸을 차지함 · 돈은 안 듦", () => {
  const w = town(), h = starter(w), u = w.units[0];
  h.owner = u.unitId; u.home = h.id; u.loan = { left: 12, total: 30 }; h.interior.levels[0].furniture.push({ id: "bed", x: 0, z: 2, rot: 0 });
  const x0 = h.x, z0 = h.z, interior = h.interior, furn = JSON.stringify(h.interior), oldCells = h.cells.map(c => [...c]), oldDoor = { ...h.door }, vault = w.bank.vault, n = w.buildings.size;
  const s = moveSpot(w, h); assert.ok(s, "옮길 자리");
  const r = w.moveBuilding(h.id, s[0], s[1], h.rot);
  assert.ok(r.ok, r.reason);
  assert.equal(r.building, h, "같은 건물 자료(id 그대로)"); assert.equal(w.buildings.get(h.id), h); assert.equal(w.buildings.size, n);
  assert.equal(h.owner, u.unitId); assert.equal(u.home, h.id); assert.deepEqual(u.loan, { left: 12, total: 30 });
  assert.equal(h.interior, interior); assert.equal(JSON.stringify(h.interior), furn, "가구·바닥·벽지 그대로");
  assert.ok(w.isDone(h)); assert.equal(w.bank.vault, vault, "금고 그대로(옮기기는 공짜)");
  assert.deepEqual([h.x, h.z], s);
  assert.ok(occ(w, h.cells).every(id => id === h.id), "새 칸 차지");
  assert.ok(occ(w, oldCells.filter(([x, z]) => !h.cells.some(c => c[0] === x && c[1] === z))).every(id => id == null), "옛 칸은 빔");
  assert.equal(w.grid.doorOwner(h.door.x, h.door.z), h.id, "새 문 앞 비워 둠");
  if (oldDoor.x !== h.door.x || oldDoor.z !== h.door.z) assert.equal(w.grid.doorOwner(oldDoor.x, oldDoor.z), null, "옛 문 앞은 풀림");
  assert.deepEqual(r.undo.from, { x: x0, z: z0, rot: 0 }); assert.deepEqual(r.undo.to, { x: s[0], z: s[1], rot: 0 });
});

test("돌려서 옮기기: 문 방향이 바뀌고, 한 칸만 비켜 놓기(자기 칸과 겹침)도 됨", () => {
  const w = town(), h = starter(w);
  const s1 = near(w, (x, z) => w.moveBuilding(h.id, x, z, 1, { dry: true }).ok, { x: h.x, z: h.z });
  assert.ok(s1); const r = w.moveBuilding(h.id, s1[0], s1[1], 1); assert.ok(r.ok, r.reason); assert.equal(h.rot, 1);
  const nudge = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [h.x + dx, h.z + dz]).find(([x, z]) => w.moveBuilding(h.id, x, z, 1, { dry: true }).ok);
  if (nudge) { const r2 = w.moveBuilding(h.id, nudge[0], nudge[1], 1); assert.ok(r2.ok); assert.ok(occ(w, h.cells).every(id => id === h.id)); }
});

test("못 놓는 자리: 같은 자리 · 물 · 다른 건물과 겹침 · 섬 밖 · 다리·계단은 못 옮김", () => {
  const w = town(), h = starter(w), bank = w.bankB();
  assert.match(w.moveBuilding(h.id, h.x, h.z, h.rot, { dry: true }).reason, /지금 자리와 같아요/);
  assert.match(w.moveBuilding(h.id, bank.x, bank.z, 0, { dry: true }).reason, /겹쳐요/);
  const sea = near(w, (x, z) => w.grid.inBounds(x, z) && w.grid.isWater(x, z) && w.grid.isWater(x + 2, z + 2), w.center, 120); assert.ok(sea);
  assert.match(w.moveBuilding(h.id, sea[0], sea[1], 0, { dry: true }).reason, /바다/);
  assert.equal(w.moveBuilding("없음", 0, 0, 0).ok, false);
  const before = occ(w, h.cells); assert.equal(w.moveBuilding(h.id, bank.x, bank.z, 0).ok, false); assert.deepEqual(occ(w, h.cells), before, "실패하면 아무것도 안 바뀜");
  const stairs = { id: "zz-s", defId: "stairs", cells: [[0, 0]] }, bridge = { id: "zz-b", defId: "bridge", cells: [[0, 0]] };
  w.buildings.set(stairs.id, stairs); w.buildings.set(bridge.id, bridge);
  assert.match(w.moveBlock(stairs), /계단/); assert.match(w.moveBlock(bridge), /다리/);
  w.buildings.delete("zz-s"); w.buildings.delete("zz-b");
  assert.equal(w.moveBlock(bank), "", "공식은행도 옮길 수 있음");
});

test("갈매미가 서 있는 칸에는 못 옮김", () => {
  const w = town(), h = starter(w), s = moveSpot(w, h), u = w.units[1];
  const fp = w.moveBuilding(h.id, s[0], s[1], h.rot, { dry: true }); const [cx, cz] = fp.cells[0];
  u.x = cx + 0.5; u.z = cz + 0.5; u.path = null; u.state = UnitState.Idle;
  assert.match(w.moveBuilding(h.id, s[0], s[1], h.rot, { dry: true }).reason, /갈매미/);
});

test("↶ 되돌리기: 옛 자리로(같은 칸·같은 문) · 한 번만 · 그사이 또 옮기면 안 됨 · 새 자리 바닥 맞춤도 되돌림", () => {
  const w = town(), h = starter(w), cells0 = JSON.stringify(h.cells), door0 = JSON.stringify(h.door), s = moveSpot(w, h);
  const r = w.moveBuilding(h.id, s[0], s[1], h.rot); assert.ok(r.ok);
  const u1 = w.undoMove(r.undo); assert.ok(u1.ok, u1.reason);
  assert.equal(JSON.stringify(h.cells), cells0); assert.equal(JSON.stringify(h.door), door0);
  for (const [x, z, , old] of r.undo.ground) assert.equal(w.grid.get(x, z).groundType, old);
  assert.equal(w.undoMove(r.undo).ok, false, "두 번은 안 됨(이미 옛 자리)");
  const r2 = w.moveBuilding(h.id, s[0], s[1], h.rot); assert.ok(r2.ok);
  const s3 = moveSpot(w, h); assert.ok(w.moveBuilding(h.id, s3[0], s3[1], h.rot).ok);
  assert.match(w.undoMove(r2.undo).reason, /또 옮겨서/);
});

test("새 자리 둘레가 돌길이면 건물 밑 잔디를 맞추고, ↶하면 잔디로", () => {
  const w = town(), h = starter(w), s = moveSpot(w, h);
  const fp = w.moveBuilding(h.id, s[0], s[1], h.rot, { dry: true });
  for (const [cx, cz] of fp.cells) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const x = cx + dx, z = cz + dz; if (!fp.cells.some(c => c[0] === x && c[1] === z) && w.grid.get(x, z) && !w.grid.isWater(x, z)) w.grid.setGround(x, z, "Cobble"); }
  for (const [x, z] of fp.cells) w.grid.setGround(x, z, "Grass");
  const r = w.moveBuilding(h.id, s[0], s[1], h.rot); assert.ok(r.ok, r.reason);
  assert.ok(h.cells.every(([x, z]) => w.grid.get(x, z).groundType === "Cobble"), "둘레 바닥으로 맞춤");
  assert.equal(r.undo.ground.length, h.cells.length);
  assert.ok(w.undoMove(r.undo).ok);
  assert.ok(fp.cells.every(([x, z]) => w.grid.get(x, z).groundType === "Grass" || w.grid.get(x, z).occupiedId), "↶하면 잔디로");
});

test("저장·불러오기: 옮긴 자리·방향·가구·주인이 그대로", () => {
  const w = town(), h = starter(w), u = w.units[0]; h.owner = u.unitId; u.home = h.id; h.interior.levels[0].wallpaper = "mint";
  const s = near(w, (x, z) => Math.hypot(x - h.x, z - h.z) > 6 && w.moveBuilding(h.id, x, z, 3, { dry: true }).ok, { x: h.x, z: h.z }); assert.ok(s);
  assert.ok(w.moveBuilding(h.id, s[0], s[1], 3).ok);
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize()))), b2 = back.buildings.get(h.id);
  assert.ok(b2, "같은 id"); assert.deepEqual([b2.x, b2.z, b2.rot], [s[0], s[1], 3]); assert.deepEqual(b2.cells, h.cells); assert.deepEqual(b2.door, h.door);
  assert.equal(b2.interior.levels[0].wallpaper, "mint"); assert.equal(b2.owner, u.unitId);
  assert.ok(b2.cells.every(([x, z]) => back.grid.get(x, z).occupiedId === h.id));
});

test("갈매미: 그 집으로 가던 갈매미는 새 문으로 길을 다시 찾고, 안에 있던 갈매미는 그대로 있다가 새 문으로 나옴", () => {
  const w = town(), h = starter(w), [a, c] = w.units;
  a.state = UnitState.GoToBuilding; a.targetBuildingId = h.id; a.path = [[Math.floor(a.x), Math.floor(a.z)]]; a.pathIndex = 0; a.goal = { ...h.door };
  c.state = UnitState.Inside; c.insideBuildingId = h.id; c.timer = 99; h.occupants.push(c.unitId);
  const s = moveSpot(w, h, h.rot, { x: h.x, z: h.z }, 8); assert.ok(w.moveBuilding(h.id, s[0], s[1], h.rot).ok);
  assert.equal(a.state, UnitState.GoToBuilding); assert.deepEqual(a.goal, { x: h.door.x, z: h.door.z }, "새 문으로");
  assert.equal(c.insideBuildingId, h.id, "안에 있던 갈매미는 그대로");
  c.timer = 0; c.insideAct = null;
  for (let i = 0; i < 3 && c.insideBuildingId; i++) w.update(0.1);
  assert.equal(c.insideBuildingId, null); assert.ok(Math.hypot(c.x - (h.door.x + 0.5), c.z - (h.door.z + 0.5)) < 3, "새 문 앞으로 나옴");
});

test("짓던 건축가: 망치질 중에 옮기면 새 공사장으로 가서 재료를 또 쓰지 않고 바로 망치질", () => {
  const w = town(); w.instantBuild = false;
  const site = place(w, "house"); const u = w.units.find(o => o.job === "builder");
  u.committed = site.id; site.busy = u.unitId; u.focus = site; u.state = UnitState.Build; u.work = { t: 0, done: 1 };
  const res = JSON.stringify(w.res), s = moveSpot(w, site, site.rot, { x: site.x, z: site.z }, 5); assert.ok(s);
  assert.ok(w.moveBuilding(site.id, s[0], s[1], site.rot).ok);
  assert.equal(u.state, UnitState.GoBuild); assert.equal(u.paidCycle, true); assert.equal(u.committed, site.id);
  for (let t = 0; t < 30 && u.state === UnitState.GoBuild; t += 0.1) w.update(0.1);
  assert.equal(u.state, UnitState.Build, "도착하면 바로 망치질"); assert.equal(JSON.stringify(w.res), res, "재료를 또 쓰지 않음");
  assert.equal(site.undoable, true, "방금 놓은 공사장이면 짓기 되돌리기도 그대로");
});

test("풍차를 옮기면 전기 범위가 따라감", () => {
  const w = town(), mill = place(w, "windmill"), lamp = place(w, "streetlamp", { x: centerOf(mill).x, z: centerOf(mill).z + 8 });
  assert.ok(w.powered(lamp), "처음엔 가로등에 전기");
  const lc = centerOf(lamp);
  const s = near(w, (x, z) => { const fp = w.moveBuilding(mill.id, x, z, 0, { dry: true }); if (!fp.ok) return false; const c = { x: fp.center.x, z: fp.center.z }; return Math.hypot(c.x - lc.x, c.z - lc.z) > POWER_RANGE + 1; }, w.center, 90);
  assert.ok(s, "멀리 옮길 자리"); const rev = w.powerRev;
  const r = w.moveBuilding(mill.id, s[0], s[1], 0); assert.ok(r.ok, r.reason);
  assert.ok(w.powerRev > rev); assert.equal(w.powered(lamp), false, "풍차가 멀어지면 꺼짐");
  assert.ok(w.undoMove(r.undo).ok); assert.ok(w.powered(lamp), "↶하면 다시 켜짐");
});

test("밭을 옮기면 작물이 칸 순서대로 따라감", () => {
  const w = town(), field = place(w, "field");
  const plots = w.plots.filter(p => field.cells.some(([x, z]) => x === p.x && z === p.z)); assert.equal(plots.length, field.cells.length);
  plots[0].stage = "grown"; plots[0].t = 7; const first = plots[0], i0 = field.cells.findIndex(([x, z]) => x === first.x && z === first.z);
  const s = moveSpot(w, field); assert.ok(s); assert.ok(w.moveBuilding(field.id, s[0], s[1], field.rot).ok);
  assert.deepEqual([first.x, first.z], field.cells[i0], "같은 칸 순서"); assert.equal(first.stage, "grown");
  assert.ok(field.cells.every(([x, z]) => w.isPlot(x, z) && w.grid.get(x, z).groundType === "Dirt"));
  const u = w.undoMove({ id: field.id, from: { x: field.x, z: field.z, rot: field.rot }, to: { x: field.x, z: field.z, rot: field.rot } }); assert.equal(u.ok, false, "같은 자리로는 못 감");
});

test("확인 카드 글: 공짜 · 못 놓는 까닭", () => {
  const w = town(), h = starter(w), s = moveSpot(w, h), def = BUILDINGS[h.defId];
  const ok = relocInfo(w, h, w.moveBuilding(h.id, s[0], s[1], h.rot, { dry: true })); assert.equal(ok.ok, true);
  assert.match(relocHtml(ok), /옮기기/); assert.match(relocHtml(ok), /공짜/); assert.doesNotMatch(relocHtml(ok), /[()]/);
  const home = relocInfo(w, h, w.moveBuilding(h.id, h.x, h.z, h.rot, { dry: true })); assert.equal(home.ok, false); assert.equal(home.home, true); assert.match(relocHtml(home), /옮길 자리를/); assert.doesNotMatch(relocHtml(home), /못 놓아요/);
  const bank = w.bankB(), bad = relocInfo(w, h, w.moveBuilding(h.id, bank.x, bank.z, 0, { dry: true })); assert.equal(bad.home, false); assert.match(relocHtml(bad), /못 놓아요.*겹쳐요/);
  assert.match(relocStatus(def.name, "picked"), /옮길 자리/);
  const a = anchorFor(def, h.x + 1, h.z + 1, 0); assert.deepEqual([a.x, a.z], [h.x, h.z], "들면 고스트가 제자리에서 시작(가운데 칸 기준)");
});
