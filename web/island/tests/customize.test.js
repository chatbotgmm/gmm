// 섬 꾸미기(customize.js + World): 나무·야자수·바위·광석 바위 심기/치우기, 덤불·꽃, 지형지물 옮기기, 연못·물길 파기/메우기, 금고 값, 되돌리기, 저장.
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { UnitState } from "../src/data/types.js";
import { BUILDINGS } from "../src/data/catalog.js";
import * as CU from "../src/world/customize.js";
import { checkPlacement } from "../src/world/placement.js";

const wild = (r = 3) => World.create(7, seededRandom(r), { wild: true, firstGull: true });
/** 가운데에서 가까운 순서로 칸을 돌며 ok(x, z)가 참인 첫 칸(skip: 건너뛸 "x,z") */
const find = (w, ok, from = w.center, R = 60, skip = new Set()) => {
  const cx = Math.floor(from.x), cz = Math.floor(from.z);
  for (let r = 0; r <= R; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; const x = cx + dx, z = cz + dz;
    if (!skip.has(`${x},${z}`) && w.grid.inBounds(x, z) && ok(x, z)) return [x, z];
  }
  return null;
};
const canPlant = (w, kind = "tree") => (x, z) => w.placeNature(kind, x, z, { dry: true, free: true }).ok;
const record = (w, evs) => { const log = []; for (const e of evs) w.on(e, a => log.push([e, a])); return log; };
/** 둘레 3칸까지 모두 빈 평지 잔디(높이 0)인 칸 */
const openGrass = (w, r = 3) => (x, z) => {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const c = w.grid.get(x + dx, z + dz); if (!c || c.occupiedId || c.elevation !== 0 || c.groundType !== "Grass" || w.grid.doorOwner(x + dx, z + dz)) return false;
  }
  return !w.units.some(u => Math.abs(u.x - x - 0.5) < r + 1 && Math.abs(u.z - z - 0.5) < r + 1);
};
const setWater = (w, cells) => { for (const [x, z] of cells) w.grid.get(x, z).elevation = -1; w.grid.version++; };

test("나무 심기: 잔디에 묘목(금고 −2, 알림), 같은 칸·물·길·건물·문 앞·갈매미 칸은 까닭과 함께 거절, dry는 아무것도 안 바꿈", () => {
  const w = wild(), log = record(w, ["moduleAdded", "custom"]);
  const [x, z] = find(w, canPlant(w)); const v0 = w.bank.vault, n0 = w.trees.length, m0 = w.modules.length, id0 = w.nextId;
  const dry = w.placeNature("tree", x, z, { dry: true });
  assert.ok(dry.ok); assert.equal(dry.cost, 2); assert.equal(w.bank.vault, v0); assert.equal(w.trees.length, n0); assert.equal(w.nextId, id0); assert.equal(log.length, 0, "dry는 알림 없음");
  const r = w.placeNature("tree", x, z);
  assert.ok(r.ok, r.reason); assert.equal(r.cost, 2); assert.equal(w.bank.vault, v0 - 2); assert.equal(w.bank.custom, 2); assert.equal(w.bank.ledger.at(-1).custom, 2);
  assert.equal(w.trees.length, n0 + 1); assert.equal(w.modules.length, m0 + 1); assert.equal(w.grid.get(x, z).occupiedId, r.module.id);
  assert.match(r.module.id, /^tree-c\d+$/); assert.equal(r.module.by, "player"); assert.equal(r.module.grow, CU.TREE_GROW);
  assert.equal(r.tree.alive, false, "묘목"); assert.ok(r.tree.sapling); assert.ok(r.inverse?.token);
  assert.deepEqual(log.map(e => e[0]), ["moduleAdded", "custom"]); assert.equal(log[0][1].module, r.module); assert.equal(log[1][1].cost, 2);
  assert.equal(w.placeNature("tree", x, z).reason, "다른 것과 겹쳐요");
  const sea = find(w, (a, b) => w.grid.isWater(a, b) && !w.grid.get(a, b).occupiedId);
  assert.equal(w.placeNature("tree", ...sea).reason, "물에는 심을 수 없어요"); assert.equal(w.placeNature("beachRock", ...sea).reason, "물에는 놓을 수 없어요");
  const bank = w.bankB();
  assert.equal(w.placeNature("tree", bank.x, bank.z).reason, "다른 것과 겹쳐요");
  assert.equal(w.placeNature("tree", bank.door.x, bank.door.z).reason, "건물 문 앞이에요");
  const [px, pz] = find(w, canPlant(w), w.center, 60, new Set([`${x},${z}`])); assert.ok(w.paint(px, pz, "Cobble"));
  assert.equal(w.placeNature("tree", px, pz).reason, "길(돌길·데크)에는 심지 않아요"); assert.equal(w.placeNature("ore", px, pz).reason, "길(돌길·데크)에는 놓지 않아요");
  const sand = find(w, (a, b) => !w.grid.isWater(a, b) && w.grid.get(a, b).groundType === "Sand" && !w.grid.get(a, b).occupiedId);
  assert.equal(w.placeNature("tree", ...sand).reason, "나무는 잔디·흙에 심어요"); assert.equal(w.placeNature("auto", ...sand, { dry: true }).kind, "palm", "auto: 모래면 야자수");
  const [gx, gz] = find(w, canPlant(w)), u = w.units[0]; u.x = gx + 0.5; u.z = gz + 0.5;
  assert.equal(w.placeNature("tree", gx, gz).reason, "갈매미가 서 있어요");
  assert.equal(w.bank.vault, v0 - 2, "실패는 돈을 안 냄");
});

test("금고가 모자라면 { ok:false, reason } (금고 글), 아무것도 안 바뀜. 경제가 없는 예전 섬은 모든 값 0", () => {
  const w = wild(); w.bank.vault = 1; const [x, z] = find(w, canPlant(w)), n0 = w.trees.length;
  const r = w.placeNature("tree", x, z);
  assert.equal(r.ok, false); assert.equal(r.cost, 2); assert.match(r.reason, /금고에 조개가 모자라요 \(꾸미기 🪙2 · 금고 🪙1\)/); assert.equal(w.bank.vault, 1); assert.equal(w.trees.length, n0);
  assert.ok(w.placeNature("beachRock", x, z).ok, "바위(1)는 됨"); assert.equal(w.bank.vault, 0);
  assert.match(w.removeNature({ x, z }).reason, /금고/);
  assert.match(w.moveLandmark("cave", 0, 0, 0).reason, /이 섬에는|금고|섬 밖|물/);
  const old = World.create(7, seededRandom(1));
  assert.equal(old.economy, false); assert.equal(old.customCost("place", "ore"), 0); assert.equal(old.customCost("move", "pier"), 0); assert.equal(old.customCost("dig"), 0);
  const v = old.bank.vault, c = find(old, canPlant(old), old.center, 30); assert.ok(old.placeNature("tree", ...c).ok); assert.equal(old.bank.vault, v);
  const info = w.customInfo(); assert.equal(info.treeMax, 260); assert.equal(info.costs.place.ore, 4); assert.equal(info.costs.move.cave, 15); assert.equal(info.costs.dig, 1);
  assert.deepEqual(info.landmarks, ["cave", "lighthouse"]);
});

test("공짜 자원 막기: 묘목 300초·빈 광석 바위 600초 동안 벨 수 없고 갈매미가 찜하지 않음, 다 자라면 treeGrow/oreGrow. 심고 뽑으면 −3, 나무를 안 줌", () => {
  const w = wild(), log = record(w, ["treeGrow", "oreGrow"]), u = w.units[0];
  const [x, z] = find(w, canPlant(w)), t = w.placeNature("tree", x, z).tree;
  const [ox, oz] = find(w, canPlant(w, "ore"), w.center, 60, new Set([`${x},${z}`])), o = w.placeNature("ore", ox, oz).ore;
  assert.equal(o.alive, false); assert.equal(w.ores.at(-1), o);
  const wood0 = u.inv.wood; w.hitTree(t, u); w.hitOre(o, u); assert.equal(t.hp, 3); assert.equal(u.inv.wood, wood0, "묘목은 못 벰");
  w.stepCustom(299); assert.equal(t.alive, false); assert.equal(log.length, 0);
  w.stepCustom(1); assert.equal(t.alive, true); assert.equal(t.sapling, undefined); assert.deepEqual(log.map(e => e[0]), ["treeGrow"]); assert.equal(w.modules.find(m => m.id === t.id).grow, undefined);
  w.stepCustom(299); assert.equal(o.alive, false, "광석은 600초"); w.stepCustom(1); assert.equal(o.alive, true); assert.deepEqual(log.map(e => e[0]), ["treeGrow", "oreGrow"]);
  // 심기(2) + 뽑기(1) = 3, 나무·돌은 그대로
  const v0 = w.bank.vault, res0 = { ...w.res }, inv0 = { ...u.inv }, [qx, qz] = find(w, canPlant(w));
  const r = w.placeNature("tree", qx, qz); assert.ok(w.removeNature(r.module.id).ok);
  assert.equal(w.bank.vault, v0 - 3); assert.deepEqual(w.res, res0); assert.deepEqual(u.inv, inv0);
});

test("치우기: 찜한 갈매미는 그만두고(찜 풀림) 나무를 못 얻음, 다 베인 나무를 치우면 다시 자라지 않음, 지형지물은 옮기기만", () => {
  const w = wild(), u = w.units[0], log = record(w, ["moduleRemoved", "treeGrow"]);
  const t = w.trees[0]; t.claimed = u.unitId; u.focus = t; u.state = UnitState.Chop;
  const v0 = w.bank.vault, wood0 = u.inv.wood, r = w.removeNature(t.id);
  assert.ok(r.ok); assert.equal(r.cost, 1); assert.equal(w.bank.vault, v0 - 1);
  assert.equal(u.state, UnitState.Idle); assert.equal(u.focus, null); assert.equal(t.claimed, null); assert.equal(u.inv.wood, wood0);
  assert.ok(!w.trees.includes(t)); assert.ok(!w.modules.some(m => m.id === t.id)); assert.equal(w.grid.get(t.x, t.z).occupiedId, null);
  assert.equal(log[0][0], "moduleRemoved");
  const t2 = w.trees[1]; while (t2.alive) w.hitTree(t2, u); assert.ok(w.removeNature({ x: t2.x, z: t2.z }).ok, "그루터기도 치움");
  for (let i = 0; i < 50; i++) w.update(1); assert.ok(!log.some(e => e[0] === "treeGrow" && e[1] === t2), "치운 나무는 다시 자라지 않음");
  const cave = w.landmark("cave"); assert.equal(w.removeNature(cave.id).reason, "동굴은 옮기기만 할 수 있어요");
  assert.equal(w.removeNature("lighthouse-1").reason, "등대는 옮기기만 할 수 있어요"); assert.ok(w.landmark("cave") && w.landmark("lighthouse"));
  assert.equal(w.removeNature({ x: 0, z: 0 }).reason, "치울 게 없어요");
});

test("한도와 길 끊김: 나무는 260그루까지, 1칸 통로를 막는 나무는 거절", () => {
  const w = wild(); w.bank.vault = 1e6; const skip = new Set();
  while (w.trees.length < CU.LIMITS.trees) { const c = find(w, canPlant(w), w.center, 90, skip); skip.add(c.join(",")); assert.ok(w.placeNature("tree", ...c).ok); }
  const c = find(w, (x, z) => !w.landProblem(x, z, "tree") && !w.unitOn([[x, z]]));
  assert.equal(w.placeNature("tree", ...c).reason, "나무는 섬에 260그루까지예요");
  // 둘레 고리 모양 물(한 칸만 열림) 안쪽 땅으로 가는 길을 막으면 거절
  const v = wild(), [x, z] = find(v, openGrass(v, 4)), ring = [];
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === 2 && !(dx === 0 && dz === 2)) ring.push([x + dx, z + dz]);
  setWater(v, ring);
  assert.equal(v.placeNature("tree", x, z + 2).reason, "길이 막혀요(갈매미가 지나갈 틈을 남겨 주세요)");
  assert.ok(v.placeNature("tree", x, z).ok, "안쪽 가운데는 둘레가 이어져 있어 됨");
});

test("덤불·꽃: 놓기(겹, 알림) · 이미 있으면 거절 · 지으면 지워짐 · 씨앗 소품 치우기(off) · 다시 치우면 돈 안 냄", () => {
  const w = wild(), log = record(w, ["decorChanged"]), [x, z] = find(w, openGrass(w, 2)), v0 = w.bank.vault;
  const r = w.placeDecor("bush", x, z, { v: 2 });
  assert.ok(r.ok); assert.equal(r.cost, 1); assert.deepEqual(w.decor.add.get(`${x},${z}`), { k: "bush", v: 2 }); assert.deepEqual(log[0][1], { x, z, k: "bush", v: 2, off: false });
  assert.equal(w.placeDecor("flower", x, z).reason, "이미 덤불이 있어요");
  assert.ok(w.placeDecor("flower", x + 1, z).ok); assert.equal(w.bank.vault, v0 - 2);
  const bank = w.bankB(); assert.equal(w.placeDecor("bush", bank.x, bank.z).reason, "다른 것과 겹쳐요");
  const cl = w.clearDecor(x + 2, z); assert.ok(cl.ok); assert.equal(cl.was, "seed"); assert.ok(w.decor.off.has(`${x + 2},${z}`));
  const again = w.clearDecor(x + 2, z); assert.equal(again.ok, false); assert.equal(again.reason, "치울 게 없어요"); assert.equal(w.bank.vault, v0 - 3);
  const back = w.clearDecor(x + 1, z); assert.deepEqual(back.was, { k: "flower", v: CU.variantAt(x + 1, z, 4) });
  // 놓은 칸에 건물을 지으면 지워짐
  w.placeDecor("bush", x, z - 1);
  const b = w.placeBuilding("bench", x, z - 1, 0, null, 1e9); assert.ok(b.ok, b.reason);
  assert.ok(!w.decor.add.has(`${x},${z - 1}`)); assert.deepEqual(log.at(-1)[1], { x, z: z - 1, k: null, v: 0, off: false });
});

test("동굴 옮기기: 평평한 2×2 + 입구 앞이 걸을 수 있어야 함, 금고 −15, 옛 칸 비고 이름표가 입구 앞으로, 한 칸 겹치게도 됨, 하나뿐", () => {
  const w = wild(), cave = w.landmark("cave"), old = cave.cells.map(c => [...c]), log = record(w, ["moduleMoved"]), zone = w.zones.find(o => o.id === "cave");
  assert.deepEqual(CU.caveLabelAt(old, 0), { x: zone.x, z: zone.z }, "섬 생성 이름표 자리와 같은 식");
  const [x, z] = find(w, openGrass(w, 7)), v0 = w.bank.vault;
  const ghost = w.landmarkCells("cave", x, z, 0); assert.deepEqual(ghost, [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]]);
  const r = w.moveLandmark("cave", x, z, 0);
  assert.ok(r.ok, r.reason); assert.equal(r.cost, 15); assert.equal(w.bank.vault, v0 - 15); assert.deepEqual(r.from.cells, old);
  for (const [a, b] of old) assert.equal(w.grid.get(a, b).occupiedId, null);
  for (const [a, b] of ghost) assert.equal(w.grid.get(a, b).occupiedId, cave.id);
  assert.deepEqual([zone.x, zone.z], [x + 1, z + 2]); assert.deepEqual(w.landmarkFront("cave"), { x, z: z + 2 });
  assert.equal(log.length, 1); assert.equal(log[0][1].module, cave);
  const one = w.moveLandmark("cave", x + 1, z, 0); assert.ok(one.ok, `한 칸 옆(자기 칸과 겹침): ${one.reason}`);
  const turned = w.moveLandmark("cave", x + 1, z, 1); assert.ok(turned.ok, turned.reason); assert.deepEqual(w.landmarkFront("cave"), { x: x + 3, z }, "rot 1 = +x로 열림(입구 앞 칸 중 z·x가 작은 쪽)");
  // 입구 앞을 물로 막으면 거절(R로 돌리면 됨)
  setWater(w, [[x + 1, z - 3], [x + 2, z - 3]]);
  const blocked = w.moveLandmark("cave", x + 1, z - 5, 0); assert.equal(blocked.reason, "동굴 입구 앞이 막혀 있어요(R로 방향 돌리기)");
  assert.ok(w.moveLandmark("cave", x + 1, z - 5, 2).ok, "반대로 돌리면 됨");
  assert.equal(w.modules.filter(m => m.defId === "cave").length, 1, "하나뿐");
  const sea = find(w, (a, b) => w.grid.isWater(a, b) && w.grid.isWater(a + 1, b + 1) && w.grid.isWater(a + 1, b) && w.grid.isWater(a, b + 1));
  assert.equal(w.moveLandmark("cave", ...sea, 0).reason, "물에는 놓을 수 없어요");
});

test("등대: 물에서 3칸 안(바닷가)에만, 부두·방파제는 넓은 섬엔 없음", () => {
  const w = wild(), [x, z] = find(w, openGrass(w, 4));
  assert.equal(w.moveLandmark("lighthouse", x, z, 0).reason, "등대는 바닷가(물에서 3칸 안)에 세워요");
  const coast = find(w, (a, b) => w.moveLandmark("lighthouse", a, b, 0, { dry: true }).ok, { x: x + 20, z });
  assert.ok(coast); const r = w.moveLandmark("lighthouse", ...coast, 0); assert.ok(r.ok, r.reason); assert.equal(r.cost, 15);
  assert.equal(w.moveLandmark("pier", 0, 0, 0).reason, "이 섬에는 없어요"); assert.equal(w.moveLandmark("breakwater", 0, 0, 0).reason, "이 섬에는 없어요");
  assert.equal(w.landmarkCells("pier", 0, 0, 0), null);
});

test("부두·방파제(예전 섬): 부두를 옮기면 끝 낚시 자리가 같이 가고, 낚시하던 갈매미는 그만두고, 부두 위 갈매미는 땅으로. 방파제는 바다에만", () => {
  const w = World.create(7, seededRandom(1)), pier = w.landmark("pier"), old = pier.cells.map(c => [...c]);
  const onPier = w.spots.filter(s => old.some(([x, z]) => x === s.x && z === s.z)); assert.equal(onPier.length, 2);
  const fisher = w.units[0], rider = w.units[1];
  onPier[0].claimed = fisher.unitId; fisher.focus = onPier[0]; fisher.state = UnitState.Fish; fisher.x = onPier[0].x + 0.5; fisher.z = onPier[0].z + 0.5;
  rider.x = old[0][0] + 0.5; rider.z = old[0][1] + 0.5;
  let dest = null;
  for (let rot = 0; rot < 4 && !dest; rot++) dest = find(w, (a, b) => w.moveLandmark("pier", a, b, rot, { dry: true }).ok && (a !== old[0][0] || b !== old[0][1]), w.center, 40) && [rot];
  const rot = dest[0], at = find(w, (a, b) => w.moveLandmark("pier", a, b, rot, { dry: true }).ok && (a !== old[0][0] || b !== old[0][1]), w.center, 40);
  const r = w.moveLandmark("pier", ...at, rot); assert.ok(r.ok, r.reason); assert.equal(r.cost, 0, "경제 없는 섬");
  for (const s of onPier) { assert.ok(pier.cells.some(([x, z]) => x === s.x && z === s.z), "낚시 자리가 새 부두 위로"); assert.deepEqual(s.dir, CU.frontDir(rot)); assert.ok(w.grid.isWater(s.x + s.dir[0], s.z + s.dir[1])); }
  assert.equal(fisher.state, UnitState.Idle); assert.equal(onPier[0].claimed, null);
  assert.ok(w.grid.isWalkable(Math.floor(rider.x), Math.floor(rider.z)), "부두 위 갈매미는 걸을 수 있는 칸으로");
  const [lx, lz] = find(w, (a, b) => !w.grid.isWater(a, b) && !w.grid.get(a, b).occupiedId);
  assert.equal(w.moveLandmark("breakwater", lx, lz, 0).reason, "방파제는 바다에만 놓아요");
  assert.equal(w.removeNature("pier-1").reason, "부두는 옮기기만 할 수 있어요");
  assert.equal(w.modules.filter(m => m.defId === "pier").length, 1);
});

test("파기·메우기: 물(−0.6)·금고 −1·선 갈매미는 땅으로, 건물·문 앞·밭·낚시터 앞 물·먼 바다·떨어진 물은 거절, 높이 도구는 경계를 넘을 때만 값", () => {
  const w = wild(), [x, z] = find(w, openGrass(w, 2)), u = w.units[0], v0 = w.bank.vault, log = record(w, ["ground", "customRefused"]);
  u.x = x + 0.5; u.z = z + 0.5;
  const r = w.digCell(x, z); assert.ok(r.ok, r.reason); assert.equal(w.grid.get(x, z).elevation, CU.POND_DEPTH); assert.ok(w.grid.isWater(x, z)); assert.equal(w.bank.vault, v0 - 1);
  assert.ok(w.grid.isWalkable(Math.floor(u.x), Math.floor(u.z)), "선 갈매미는 가까운 땅으로"); assert.ok(log.some(e => e[0] === "ground"));
  assert.equal(w.digCell(x, z).reason, "이미 물이에요");
  const bank = w.bankB(); assert.equal(w.digCell(bank.x, bank.z).reason, "건물·나무가 있는 칸은 팔 수 없어요"); assert.equal(w.digCell(bank.door.x, bank.door.z).reason, "건물 문 앞은 팔 수 없어요");
  const f = w.fillCell(x, z); assert.ok(f.ok, f.reason); assert.equal(w.grid.get(x, z).elevation, 0); assert.equal(w.grid.get(x, z).groundType, "Sand"); assert.equal(w.bank.vault, v0 - 2);
  const deep = find(w, (a, b) => w.grid.get(a, b).elevation === -1 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !w.grid.isWater(a + dx, b + dz)));
  if (deep) assert.equal(w.fillCell(...deep).reason, "먼 바다는 메울 수 없어요");
  const lone = find(w, (a, b) => w.grid.get(a, b).elevation > CU.FILL_MIN && w.grid.isWater(a, b) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => w.grid.isWater(a + dx, b + dz)));
  assert.equal(w.fillCell(...lone).reason, "땅에 붙은 물만 메울 수 있어요");
  // 판 칸은 높이 도구로 더 깊게 파도 다시 메울 수 있음(dug)
  const [px, pz] = find(w, openGrass(w, 2), { x: x + 8, z }); w.digCell(px, pz); w.applyHeight(px, pz, -1); assert.ok(w.fillCell(px, pz).ok, "플레이어가 판 칸");
  // 높이 도구: 경계 안 높낮이는 공짜, 넘으면 1, 금고 0이면 막힘 + customRefused
  const [hx, hz] = find(w, openGrass(w, 2), { x: x - 8, z }); const v1 = w.bank.vault;
  assert.ok(w.reshape(hx, hz, "raise")); assert.equal(w.bank.vault, v1, "땅 위 높낮이는 공짜");
  assert.ok(w.reshape(hx, hz, "lower")); assert.ok(w.reshape(hx, hz, "lower")); assert.ok(w.grid.isWater(hx, hz)); assert.equal(w.bank.vault, v1 - 1, "땅→물 한 번만 1");
  assert.ok(w.reshape(hx, hz, "lower")); assert.equal(w.bank.vault, v1 - 1, "물 안에서 더 파기는 공짜");
  w.bank.vault = 0; const [kx, kz] = find(w, openGrass(w, 2), { x: x, z: z + 8 });
  assert.equal(w.reshape(kx, kz, "lower"), false, "0 → −0.5는 땅→물"); assert.ok(!w.grid.isWater(kx, kz)); assert.ok(w.reshape(kx, kz, "raise"), "땅 위 높이기는 금고 0이어도 됨");
  assert.match(log.filter(e => e[0] === "customRefused").at(-1)[1].reason, /금고/);
  // 섬이 만든 먼 바다는 높이 도구로도 높이지 못함
  if (deep) { assert.equal(w.reshape(...deep, "raise"), false); assert.equal(log.at(-1)[1].reason, "먼 바다는 메울 수 없어요"); }
});

test("낚시터 앞 물은 메우지 못함, 바라보는 물이 땅이 된 해안 낚시 자리는 지워짐(예전 섬), 밭은 못 팜", () => {
  const w = wild(); w.addUnitByName("목수"); w.instantBuild = true; w.bank.vault = 999;
  let dock = null;
  for (let z = 40; z < 150 && !dock; z++) for (let x = 40; x < 150 && !dock; x++) for (let r = 0; r < 4 && !dock; r++) if (w.check("dock", x, z, r).ok) dock = w.placeBuilding("dock", x, z, r).building;
  assert.ok(dock); const berth = w.berth(dock); assert.equal(w.fillCell(berth.x, berth.z).reason, "낚시터 앞 물이에요");
  const old = World.create(7, seededRandom(1)), shore = old.spots.find(s => !old.landmark("pier").cells.some(([x, z]) => x === s.x && z === s.z));
  assert.ok(shore); const fx = shore.x + shore.dir[0], fz = shore.z + shore.dir[1], u = old.units[0];
  shore.claimed = u.unitId; u.focus = shore; u.state = UnitState.GoFish;
  const r = old.fillCell(fx, fz); assert.ok(r.ok, r.reason); assert.ok(!old.spots.includes(shore), "바라보는 물이 땅이 된 자리"); assert.equal(u.state, UnitState.Idle);
  const p = old.plots[0]; assert.equal(old.digCell(p.x, p.z).reason, "밭은 팔 수 없어요");
});

test("파기로 은행 가는 길을 끊으면 거절(다리를 먼저)", () => {
  const w = wild(); let site = null;
  const def = BUILDINGS.house;
  site = find(w, (x, z) => openGrass(w, 6)(x + 1, z + 1) && checkPlacement(w.grid, def, x, z, 0, w.units).ok, { x: w.center.x + 20, z: w.center.z });
  assert.ok(site); const h = w.placeBuilding("house", site[0], site[1], 0, null, 1e9).building;
  const cs = [...h.cells, [h.door.x, h.door.z]], xs = cs.map(c => c[0]), zs = cs.map(c => c[1]);
  const x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2, z0 = Math.min(...zs) - 2, z1 = Math.max(...zs) + 2, ring = [], gap = [h.door.x, z1];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if ((x === x0 || x === x1 || z === z0 || z === z1) && !(x === gap[0] && z === gap[1])) ring.push([x, z]);
  setWater(w, ring);
  assert.equal(w.digCell(...gap).reason, "길이 끊겨요(다리를 먼저 놓아요)");
  assert.equal(w.digCell(gap[0], gap[1] + 1).reason, "길이 끊겨요(다리를 먼저 놓아요)", "틈 바로 바깥 칸도 유일한 길");
  assert.ok(w.digCell(x1 + 1, z1 + 1).ok, "고리 밖 다른 칸은 팔 수 있음");
});

test("되돌리기: 심기 → 되돌리면 없어지고 환불, 두 번째는 실패, 다 자란 뒤엔 실패. 치우기 → 같은 id·모양으로 돌아옴. 파기 묶음 → 높이·바닥 원래대로", () => {
  const w = wild(), v0 = w.bank.vault, [x, z] = find(w, canPlant(w));
  const r = w.placeNature("tree", x, z), back = w.applyInverse(r.inverse);
  assert.ok(back.ok, back.reason); assert.equal(back.refund, 2); assert.equal(w.bank.vault, v0); assert.equal(w.bank.custom, 0); assert.equal(w.grid.get(x, z).occupiedId, null);
  assert.equal(w.applyInverse(r.inverse).ok, false, "한 번만");
  const r2 = w.placeNature("tree", x, z); w.stepCustom(CU.TREE_GROW); assert.match(w.applyInverse(r2.inverse).reason, /그사이 바뀌어서/);
  const t = w.trees[0], m = w.modules.find(o => o.id === t.id), snap = JSON.stringify(m), rm = w.removeNature(t.id);
  const un = w.applyInverse(rm.inverse); assert.ok(un.ok, un.reason); assert.equal(un.refund, 1);
  assert.equal(JSON.stringify(w.modules.find(o => o.id === t.id)), snap, "같은 id·variant·rot"); assert.ok(w.trees.find(o => o.id === t.id).alive, "다 자란 나무는 다 자란 채로");
  const [dx, dz] = find(w, openGrass(w, 2), { x: x + 6, z }), cells = [[dx, dz], [dx + 1, dz], [dx, dz + 1]], g0 = cells.map(([a, b]) => [w.grid.get(a, b).elevation, w.grid.get(a, b).groundType]);
  const v1 = w.bank.vault, d = w.digCells(cells); assert.equal(d.done, 3); assert.equal(d.cost, 3); assert.equal(w.bank.vault, v1 - 3);
  const ud = w.applyInverse(d.inverse); assert.ok(ud.ok, ud.reason); assert.equal(ud.refund, 3); assert.equal(w.bank.vault, v1);
  assert.deepEqual(cells.map(([a, b]) => [w.grid.get(a, b).elevation, w.grid.get(a, b).groundType]), g0);
  // 동굴 옮기기 되돌리기 · 덤불
  const cave = w.landmark("cave"), was = cave.cells.map(c => [...c]), [cx, cz] = find(w, openGrass(w, 3), { x: x - 10, z });
  const mv = w.moveLandmark("cave", cx, cz, 0); assert.ok(mv.ok, mv.reason); const umv = w.applyInverse(mv.inverse); assert.ok(umv.ok, umv.reason); assert.deepEqual(cave.cells, was); assert.equal(umv.refund, 15);
  const pd = w.placeDecor("flower", dx, dz); assert.ok(w.applyInverse(pd.inverse).ok); assert.ok(!w.decor.add.has(`${dx},${dz}`));
  const cd = w.clearDecor(dx, dz); assert.ok(w.applyInverse(cd.inverse).ok); assert.ok(!w.decor.off.has(`${dx},${dz}`));
  // 돈이 떨어지면 거기서 멈춤
  w.bank.vault = 2; const many = w.digCells([[dx, dz], [dx + 1, dz], [dx, dz + 1]]); assert.equal(many.done, 2); assert.equal(many.skipped.length, 1); assert.match(many.skipped[0].reason, /금고/);
});

test("저장·불러오기: 묘목 남은 시간·치운 것·옮긴 동굴·덤불 겹·판 칸·금고 꾸미기 장부가 그대로, 새 칸 없는 예전 저장도 열림, 낚시터 철거 버그 회귀", () => {
  const w = wild(); w.bank.vault = 500; const [x, z] = find(w, canPlant(w));
  const sap = w.placeNature("tree", x, z).module; w.stepCustom(100);
  const gone = w.trees[0].id; w.removeNature(gone);
  const [cx, cz] = find(w, openGrass(w, 3), { x: x + 10, z }); assert.ok(w.moveLandmark("cave", cx, cz, 1).ok);
  const [bx, bz] = find(w, openGrass(w, 2), { x: x - 10, z }); w.placeDecor("bush", bx, bz, { v: 3 }); w.clearDecor(bx + 1, bz);
  const [px, pz] = find(w, openGrass(w, 2), { x, z: z + 10 }); w.digCell(px, pz); w.applyHeight(px, pz, -1);
  const j = JSON.parse(JSON.stringify(w.serialize())), b = World.fromJSON(j, seededRandom(4));
  assert.equal(b.modules.length, w.modules.length); assert.ok(!b.modules.some(m => m.id === gone));
  const bt = b.trees.find(t => t.id === sap.id); assert.equal(bt.alive, false); assert.equal(bt.grow, 200); assert.equal(b.modules.find(m => m.id === sap.id).by, "player");
  assert.deepEqual(b.landmark("cave").cells, w.landmark("cave").cells); assert.equal(b.landmark("cave").rot, 1); assert.deepEqual(b.zones.find(o => o.id === "cave"), w.zones.find(o => o.id === "cave"));
  assert.deepEqual(b.decor.add.get(`${bx},${bz}`), { k: "bush", v: 3 }); assert.ok(b.decor.off.has(`${bx + 1},${bz}`));
  assert.equal(b.bank.custom, w.bank.custom); assert.equal(b.bank.ledger.at(-1).custom, w.bank.ledger.at(-1).custom);
  assert.ok(b.dug.has(`${px},${pz}`)); assert.ok(b.fillCell(px, pz).ok, "불러온 뒤에도 판 칸은 메움");
  b.stepCustom(200); assert.ok(bt.alive);
  // 예전 저장: decor·dug·by·grow·bank.custom이 없음
  const o = JSON.parse(JSON.stringify(j)); delete o.decor; delete o.dug; delete o.bank.custom; for (const e of o.bank.ledger) delete e.custom; for (const m of o.modules) { delete m.by; delete m.grow; }
  const ob = World.fromJSON(o, seededRandom(4)); assert.equal(ob.decor.add.size, 0); assert.equal(ob.bank.custom, 0); assert.ok(ob.trees.find(t => t.id === sap.id).alive, "예전 저장은 다 자란 나무로");
  const [qx, qz] = find(ob, canPlant(ob)); assert.ok(ob.placeNature("tree", qx, qz).ok); assert.equal(ob.bank.ledger.at(-1).custom, 2, "예전 장부에도 더함");
  // 다 지은 낚시터 → 저장·불러오기 → 철거하면 낚시 자리도 사라짐
  const v = wild(); v.addUnitByName("목수"); v.instantBuild = true; v.bank.vault = 999; let dock = null;
  for (let zz = 40; zz < 150 && !dock; zz++) for (let xx = 40; xx < 150 && !dock; xx++) for (let r = 0; r < 4 && !dock; r++) if (v.check("dock", xx, zz, r).ok) dock = v.placeBuilding("dock", xx, zz, r).building;
  assert.equal(v.spots.length, 1); const vj = JSON.parse(JSON.stringify(v.serialize())); assert.equal(vj.spots[0].dock, dock.id);
  const vb = World.fromJSON(vj, seededRandom(2)); vb.removeBuilding(dock.id); assert.equal(vb.spots.length, 0);
  delete vj.spots[0].dock; const vo = World.fromJSON(vj, seededRandom(2)); vo.removeBuilding(dock.id); assert.equal(vo.spots.length, 0, "dock 표시가 없는 예전 저장도");
});

test("결정성: 꾸미기는 마을 난수를 쓰지 않고, 같은 씨앗 + 같은 조작이면 이후 600초가 같음", () => {
  const ops = w => {
    w.bank.vault = 300; const [x, z] = find(w, canPlant(w));
    w.placeNature("tree", x, z); w.placeNature("ore", x + 2, z); w.removeNature(w.trees[3].id); w.placeDecor("bush", x, z + 2); w.clearDecor(x + 1, z + 2);
    const [cx, cz] = find(w, openGrass(w, 3), { x: x + 12, z }); w.moveLandmark("cave", cx, cz, 0); w.digCells([[x - 4, z], [x - 4, z + 1]]);
  };
  const a = wild(5), b = wild(5), c = wild(5); ops(a); ops(b);
  assert.equal(a.rnd(), c.rnd(), "꾸미기 뒤에도 마을 난수 순서가 같음(일을 멈춘 갈매미가 없을 때)");
  b.rnd();
  for (let i = 0; i < 3000; i++) { a.update(0.2); b.update(0.2); }
  assert.deepEqual(a.units.map(u => [u.x.toFixed(4), u.z.toFixed(4), u.state]), b.units.map(u => [u.x.toFixed(4), u.z.toFixed(4), u.state]));
  assert.deepEqual(a.weather, b.weather); assert.deepEqual(a.sparkles, b.sparkles); assert.equal(a.bank.vault, b.bank.vault);
  assert.deepEqual(a.modules.map(m => m.id + m.variant + m.rot), b.modules.map(m => m.id + m.variant + m.rot));
});

test("많이 꾸민 뒤 마을 3일: 오류 없이 돌고, 갈매미가 사라진 나무를 붙잡거나 물에 갇히지 않음", () => {
  const w = wild(11); for (const n of ["목수", "미니", "황금", "불씨"]) w.addUnitByName(n);
  w.bank.vault = 2000; const skip = new Set(); let planted = 0, removed = 0;
  for (let i = 0; i < 40; i++) { const c = find(w, canPlant(w, i % 5 === 0 ? "ore" : "tree"), w.center, 70, skip); if (!c) break; skip.add(c.join(",")); if (w.placeNature(i % 5 === 0 ? "ore" : "tree", ...c).ok) planted++; }
  for (let i = 0; i < 25; i++) { const t = w.trees[(i * 7) % w.trees.length]; if (w.removeNature(t.id).ok) removed++; }
  const [cx, cz] = find(w, openGrass(w, 3), { x: w.center.x - 15, z: w.center.z }); assert.ok(w.moveLandmark("cave", cx, cz, 2).ok);
  const coast = find(w, (a, b) => w.moveLandmark("lighthouse", a, b, 0, { dry: true }).ok, { x: w.center.x, z: w.center.z + 25 }); assert.ok(w.moveLandmark("lighthouse", ...coast, 0).ok);
  const [px, pz] = find(w, openGrass(w, 3), { x: w.center.x + 15, z: w.center.z + 10 }), pond = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) pond.push([px + dx, pz + dz]);
  assert.equal(w.digCells(pond).done, 9);
  for (let i = 0; i < 40; i++) { const c = find(w, openGrass(w, 1), { x: w.center.x + (i % 8) * 3 - 12, z: w.center.z - 12 - Math.floor(i / 8) * 3 }); if (c) w.placeDecor(i % 2 ? "bush" : "flower", ...c); }
  // 다 베어 가는 나무를 노리는 갈매미가 있는 채로 치우기도 섞음
  let errors = 0, removedMid = 0; const moved = new Map(w.units.map(u => [u.unitId, 0])), last = new Map(w.units.map(u => [u.unitId, [u.x, u.z]]));
  for (let step = 0; step < 9000; step++) {
    try { w.update(0.2); } catch (e) { errors++; throw e; }
    if (step % 600 === 300) { const t = w.trees.find(t => t.claimed); if (t && w.removeNature(t.id).ok) removedMid++; }
    for (const u of w.units) { const p = last.get(u.unitId); moved.set(u.unitId, moved.get(u.unitId) + Math.hypot(u.x - p[0], u.z - p[1])); last.set(u.unitId, [u.x, u.z]); }
  }
  assert.equal(errors, 0);
  for (const u of w.units) {
    if (u.focus && ("alive" in u.focus) && "hp" in u.focus) assert.ok(w.trees.includes(u.focus) || w.ores.includes(u.focus), `${u.name}이 치운 나무·광석을 붙잡고 있음`);
    const x = Math.floor(u.x), z = Math.floor(u.z);
    assert.ok(u.insideBuildingId || u.swimming || u.sailing || w.grid.isWalkable(x, z) || u.state === UnitState.Held, `${u.name}이 걸을 수 없는 칸(${x},${z}) ${u.state}`);
    assert.ok(moved.get(u.unitId) > 20, `${u.name}이 3일 동안 거의 안 움직임(${moved.get(u.unitId).toFixed(1)})`);
  }
  assert.ok(w.trees.every(t => !t.sapling), "3일이면 묘목은 다 자람"); assert.ok(planted >= 30);
  console.log(`# 3일 시뮬: 심음 ${planted} · 치움 ${removed} + 일하는 중 치움 ${removedMid} · 나무 ${w.trees.length} · 광석 ${w.ores.length} · 덤불·꽃 ${w.decor.add.size} · 꾸미기에 쓴 돈 ${w.bank.custom} · 금고 ${Math.floor(w.bank.vault)} · 갈매미 이동(칸) ${[...moved.values()].map(v => v.toFixed(0)).join("/")}`);
});

test("검토 수정: 스르르 높이 바꾸기(animateShape)로 물↔땅을 넘어도 끝에서 판 칸(dug)·모래·낚시 자리를 정리", () => {
  const w = wild(), [x, z] = find(w, openGrass(w, 2)); w.bank.vault = 100;
  assert.ok(w.digCell(x, z).ok); assert.ok(w.dug.has(`${x},${z}`));
  w.grid.setGround(x, z, "Grass"); w.animateShape = true;
  assert.ok(w.reshape(x, z, "raise")); assert.ok(w.reshape(x, z, "raise"));           // −0.6 → −0.1 → 0.4(두 번째에 물 → 땅, 값 1)
  for (let i = 0; i < 20 && w.shaping.size; i++) w.update(0.1);
  assert.equal(w.shaping.size, 0); assert.ok(!w.grid.isWater(x, z));
  assert.ok(!w.dug.has(`${x},${z}`), "땅이 된 칸은 판 칸 목록에서 빠짐(중간 높이가 먼저 물 높이를 넘어도)"); assert.equal(w.grid.get(x, z).groundType, "Sand");
  // 예전 섬: 해안 낚시 자리가 바라보는 물을 스르르 메우면 낚시 자리가 지워짐
  const o = World.create(7, seededRandom(1)); o.animateShape = true;
  const s = o.spots.find(p => !p.dock && o.grid.isWalkable(p.x, p.z) && o.reshape && o.checkFill(p.x + p.dir[0], p.z + p.dir[1], { free: true, cur: o.grid.get(p.x + p.dir[0], p.z + p.dir[1]).elevation }).ok);
  assert.ok(s, "메울 수 있는 물을 바라보는 낚시 자리"); const fx = s.x + s.dir[0], fz = s.z + s.dir[1];
  assert.ok(o.reshape(fx, fz, "flatten", 0, 1)); for (let i = 0; i < 20 && o.shaping.size; i++) o.update(0.1);
  assert.ok(!o.grid.isWater(fx, fz)); assert.ok(!o.spots.includes(s), "바라보는 물이 땅이 된 낚시 자리는 지워짐");
});

test("검토 수정: 헤엄치는 갈매미가 올라올 땅 칸에는 나무·바위·지형지물을 못 놓음(올라와서 바위 속에 갇히던 것)", async () => {
  const { startSwimHere } = await import("../src/units/unitBrain.js");
  const w = wild(), [x, z] = find(w, openGrass(w, 3)); w.bank.vault = 100;
  assert.ok(w.digCell(x + 1, z).ok); const u = w.units[0];
  u.x = x + 1.5; u.z = z + 0.5; startSwimHere(u, w, seededRandom(2), x, z); u.timer = 0.5;
  const r = w.placeNature("beachRock", x, z); assert.equal(r.ok, false); assert.equal(r.reason, "갈매미가 서 있어요");
  assert.equal(w.placeNature("tree", x, z).reason, "갈매미가 서 있어요");
  for (let i = 0; i < 100 && u.swimming; i++) w.update(0.1);
  assert.ok(!u.swimming); assert.ok(w.grid.isWalkable(Math.floor(u.x), Math.floor(u.z)), "헤엄을 마치고 걸을 수 있는 칸에 섬");
});

test("검토 수정: 낚시 자리 칸에는 나무·바위·지형지물을 못 놓고(덤불·꽃은 됨), 방파제·부두는 낚시 자리 앞 물에 못 놓음", () => {
  const o = World.create(7, seededRandom(1)), s = o.spots.find(p => !p.dock && !o.grid.get(p.x, p.z).occupiedId && o.grid.isWalkable(p.x, p.z));
  assert.ok(s); const n = o.spots.length;
  assert.equal(o.placeNature("beachRock", s.x, s.z).reason, "낚시 자리예요"); assert.equal(o.placeNature("ore", s.x, s.z).reason, "낚시 자리예요");
  assert.equal(o.spots.length, n);
  const fx = s.x + s.dir[0], fz = s.z + s.dir[1], bw = o.landmark("breakwater"); let seen = 0;
  for (let rot = 0; rot < 4; rot++) for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
    const cells = o.landmarkCells("breakwater", fx + dx, fz + dz, rot); if (!cells.some(([a, b]) => a === fx && b === fz)) continue;
    const r = o.moveLandmark("breakwater", fx + dx, fz + dz, rot, { dry: true }); assert.equal(r.ok, false, "낚시 자리 앞 물을 덮는 방파제");
    if (r.reason === "낚시 자리 앞 물이에요") seen++;
  }
  assert.ok(seen > 0); assert.ok(bw);
});

test("검토 수정: 붓·고스트 길 검사는 가까이에서 이어지면 섬 전체를 다시 세지 않음(7×7 파기 미리보기·실제가 덩어리 세기 0번)", () => {
  const w = wild(); w.bank.vault = 1000; const [x, z] = find(w, openGrass(w, 4)); let floods = 0; const f0 = w.floodComps.bind(w); w.floodComps = () => { floods++; return f0(); };
  const cells = []; for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) cells.push([x + dx, z + dz]);
  w.comps(); const dry = w.digCells(cells, { dry: true }); assert.equal(dry.done, 49); assert.equal(floods, 0, "미리보기");
  assert.ok(w.placeNature("tree", x + 6, z, { dry: true }).ok); assert.equal(floods, 0, "나무 고스트");
  const r = w.digCells(cells); assert.equal(r.done, 49); assert.equal(floods, 0, "실제 파기");
});

test("검토 수정: 파서 갈매미를 물로 둘러싸 가두지 못함(마지막 칸 거절), 갈매미 없는 땅은 됨", () => {
  const w = wild(); for (const n of ["목수", "미니"]) w.addUnitByName(n); w.bank.vault = 1000;
  const [cx, cz] = find(w, openGrass(w, 4), { x: w.center.x + 14, z: w.center.z + 6 }); const u = w.units[0];
  for (const o of w.units) if (o !== u && Math.abs(o.x - cx) < 4 && Math.abs(o.z - cz) < 4) { o.x = w.bankB().door.x + 0.5; o.z = w.bankB().door.z + 0.5; }
  u.x = cx + 0.5; u.z = cz + 0.5; u.path = null;
  const ring = []; for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === 2) ring.push([cx + dx, cz + dz]);
  const r = w.digCells(ring); assert.equal(r.done, 15); assert.equal(r.skipped.length, 1); assert.equal(r.skipped[0].reason, "갈매미가 갇혀요(물로 둘러싸지 말아 주세요)");
  assert.equal(w.compAt(cx, cz), w.compAt(w.bankB().door.x, w.bankB().door.z), "갈매미 자리는 은행과 이어짐");
  u.x = w.bankB().door.x + 0.5; u.z = w.bankB().door.z + 0.5; const [sx, sz] = [r.skipped[0].x, r.skipped[0].z];
  assert.ok(w.digCell(sx, sz).ok, "갈매미가 떠나면 빈 땅은 섬으로 떼어 낼 수 있음");
});
