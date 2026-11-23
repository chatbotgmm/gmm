// 순수 로직 시험(three.js 없이): node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../src/world/Grid.js";
import { GroundType, UnitState } from "../src/data/types.js";
import { connectMask, tileVariant, tilePieces, N, E, S, W } from "../src/world/autotile.js";
import { findPath } from "../src/world/pathfinding.js";
import { footprint, checkPlacement, anchorFor } from "../src/world/placement.js";
import { BUILDINGS } from "../src/data/catalog.js";
import { World } from "../src/world/World.js";
import { generateIsland } from "../src/world/islandGen.js";
import { seededRandom, josa } from "../src/util.js";

test("바닥을 바꾸면 그 칸이 속한 청크만 다시 그린다(이웃이 다른 청크면 그 청크도)", () => {
  const g = new Grid(64, 64, 16); g.takeDirty();
  g.setGround(5, 5, GroundType.Cobble);
  assert.deepEqual(g.takeDirty(), ["0,0"]);
  g.setGround(15, 5, GroundType.Cobble);                  // 청크 오른쪽 끝 칸: 오른쪽 청크도
  assert.deepEqual(g.takeDirty().sort(), ["0,0", "1,0"]);
  assert.equal(g.setGround(15, 5, GroundType.Cobble), false); // 같은 종류면 아무것도 안 함
  assert.deepEqual(g.takeDirty(), []);
});

test("오토타일: 상하좌우 비트마스크로 조각 종류를 고른다", () => {
  const g = new Grid(8, 8, 8);
  for (const [x, z] of [[3, 3], [4, 3], [3, 4], [3, 2]]) g.setGround(x, z, GroundType.Cobble);
  assert.equal(connectMask(g, 3, 3), N | E | S);
  assert.deepEqual(tileVariant(connectMask(g, 3, 3)), { kind: "tee", rot: 3 });
  assert.deepEqual(tileVariant(connectMask(g, 4, 3)), { kind: "end", rot: 3 });      // 서쪽으로만 이어짐
  assert.deepEqual(tileVariant(0), { kind: "isolated", rot: 0 });
  assert.deepEqual(tileVariant(N | S), { kind: "straight", rot: 0 });
  assert.deepEqual(tileVariant(N | E), { kind: "corner", rot: 0 });
  assert.deepEqual(tileVariant(N | E | S | W), { kind: "cross", rot: 0 });
  for (let m = 0; m < 16; m++) assert.ok(tileVariant(m), `mask ${m}`);
  // 3×3 면: 가운데 칸은 빈틈 없이 덮고, 바깥 가장자리 칸은 바깥쪽에 테두리가 남는다
  const h = new Grid(8, 8, 8); for (let z = 1; z <= 3; z++) for (let x = 1; x <= 3; x++) h.setGround(x, z, GroundType.WoodDeck);
  const area = (x, z) => tilePieces(h, x, z).reduce((s, [a, b, c, d]) => s + (c - a) * (d - b), 0);
  assert.ok(Math.abs(area(2, 2) - 1) < 1e-9, `center ${area(2, 2)}`);
  assert.ok(Math.abs(area(1, 1) - 0.86 * 0.86) < 1e-9, `corner ${area(1, 1)}`);
});

test("길찾기: 바다·건물·높은 턱은 돌아가고, 막히면 null", () => {
  const g = new Grid(10, 10, 10);
  for (let z = 0; z < 9; z++) g.get(5, z).elevation = -1;     // 바다 벽, z = 9만 열림
  const p = findPath(g, 1, 1, 8, 1);
  assert.ok(p && p.some(([x, z]) => x === 5 && z === 9));
  g.occupy([[5, 9]], "b1", { kind: "building", walkable: false });
  assert.equal(findPath(g, 1, 1, 8, 1), null);
  g.release("b1"); g.get(5, 9).elevation = 0.6;               // 턱이 0.6이면 못 오름
  assert.equal(findPath(g, 1, 1, 8, 1), null);
  g.get(5, 9).elevation = 0.2;                                // 0.2는 오를 수 있음
  assert.ok(findPath(g, 1, 1, 8, 1));
});

test("배치: 회전한 차지 칸과 문 위치, 실패 이유", () => {
  const def = BUILDINGS.cafe;                                  // 3×2, 문은 +z 쪽
  const f0 = footprint(def, 10, 10, 0);
  assert.deepEqual(f0.cells.map(c => c.join()).sort(), ["10,10", "10,11", "11,10", "11,11", "12,10", "12,11"]);
  assert.deepEqual(f0.door, { x: 11, z: 12 });
  const f1 = footprint(def, 10, 10, 1);                        // 90°: 2×3, 문은 +x 쪽
  assert.deepEqual(f1.size, { w: 2, d: 3 });
  assert.deepEqual(f1.cells.map(c => c.join()).sort(), ["10,10", "10,11", "10,12", "11,10", "11,11", "11,12"]);
  assert.deepEqual(f1.door, { x: 12, z: 11 });
  for (let r = 0; r < 4; r++) {                                // 어느 회전이든 문은 차지 칸 바로 옆
    const f = footprint(def, 20, 20, r), inside = new Set(f.cells.map(c => c.join()));
    assert.ok(!inside.has(`${f.door.x},${f.door.z}`));
    assert.ok(f.cells.some(([x, z]) => Math.abs(x - f.door.x) + Math.abs(z - f.door.z) === 1), `rot ${r}`);
  }
  const g = new Grid(20, 20, 10);
  assert.equal(checkPlacement(g, def, 2, 2, 0).ok, true);
  g.get(3, 3).elevation = -1; assert.equal(checkPlacement(g, def, 2, 2, 0).reason, "바다에는 지을 수 없어요");
  g.get(3, 3).elevation = 0.1; assert.equal(checkPlacement(g, def, 2, 2, 0).reason, "바닥이 평평하지 않아요");
  g.get(3, 3).elevation = 0; g.get(3, 4).elevation = -1; assert.equal(checkPlacement(g, def, 2, 2, 0).reason, "문 앞이 막혀 있어요");
  assert.equal(checkPlacement(g, def, 18, 2, 0).reason, "섬 밖이에요");
  assert.deepEqual(anchorFor(def, 11, 11, 0), { x: 10, z: 11 });
});

test("섬: 가운데는 평평한 땅, 둘레는 바다, 해안 모듈이 놓임", () => {
  const { grid, modules } = generateIsland(7);
  assert.equal(grid.get(32, 32).elevation, 0);
  assert.ok(grid.isWater(0, 0) && grid.isWater(63, 63) && grid.isWater(0, 32));
  assert.deepEqual(modules.map(m => m.defId).slice(0, 3), ["pier", "lighthouse", "breakwater"]);
  assert.ok(modules.every(m => m.cells.length > 0));
});

test("월드: 건물을 지으면 칸이 차지되고 길찾기에서 빠지며, 철거하면 돌아온다", () => {
  const w = World.create(7, seededRandom(1));
  const v0 = w.grid.version;
  const r = w.placeBuilding("house", 38, 26, 0);
  assert.equal(r.ok, true, r.reason);
  assert.ok(w.grid.version > v0);
  for (const [x, z] of r.building.cells) { assert.equal(w.grid.get(x, z).occupiedId, r.building.id); assert.equal(w.grid.isWalkable(x, z), false); }
  assert.equal(w.check("house", 38, 26, 0).ok, false);                       // 같은 자리에 또는 못 지음
  assert.equal(w.check("house", 38, 25, 0).reason, "다른 건물·시설과 겹쳐요");
  assert.equal(w.check("house", 38, 28, 0).reason, "다른 건물의 문 앞이에요"); // 문 앞 칸(38,28)
  w.removeBuilding(r.building.id);
  for (const [x, z] of r.building.cells) assert.equal(w.grid.isWalkable(x, z), true);
});

test("유닛: 건물 문으로 걸어가 들어가고, 시간이 지나면 문 앞으로 나온다", () => {
  const rnd = seededRandom(3), w = World.create(7, rnd); w.instantBuild = true;
  const b = w.placeBuilding("post", 40, 36, 2).building;
  w.units.forEach(u => { u.timer = 1e9; });                                   // 다른 유닛은 가만히
  const u = w.units[0];
  u.state = UnitState.GoToBuilding; u.targetBuildingId = b.id;
  u.path = findPath(w.grid, Math.floor(u.x), Math.floor(u.z), b.door.x, b.door.z); u.pathIndex = 0; u.goal = { ...b.door };
  assert.ok(u.path, "문까지 길이 있어야 함");
  for (let t = 0; t < 60 && u.state !== UnitState.Inside; t += 1 / 30) w.update(1 / 30);
  assert.equal(u.state, UnitState.Inside); assert.deepEqual(b.occupants, [u.unitId]);
  u.timer = 0; w.update(1 / 30);
  assert.equal(u.insideBuildingId, null); assert.deepEqual(b.occupants, []);
  assert.ok(Math.abs(Math.floor(u.x) - b.door.x) + Math.abs(Math.floor(u.z) - b.door.z) <= 1);
});

test("유닛: 가는 길에 건물이 생기면 다시 길을 찾고, 바다에 빠지지 않는다", () => {
  const w = World.create(7, seededRandom(5));
  for (let i = 0; i < 6; i++) w.placeBuilding(["house", "cafe", "shop"][i % 3], 26 + (i % 3) * 5, 38 + Math.floor(i / 3) * 5, i % 4);
  for (let t = 0; t < 120; t += 1 / 30) {
    w.update(1 / 30);
    if (Math.abs(t - 30) < 1e-3) w.placeBuilding("post", 36, 30, 0);
    for (const u of w.units) if (!u.insideBuildingId) assert.ok(w.grid.isWalkable(Math.floor(u.x), Math.floor(u.z)), `${u.name} at ${u.x},${u.z}`);
  }
});

test("저장/불러오기: 바닥·건물이 그대로 돌아온다", () => {
  const w = World.create(7, seededRandom(2));
  w.paint(40, 40, GroundType.WoodDeck); w.placeBuilding("cafe", 38, 26, 1);
  const j = JSON.parse(JSON.stringify(w.serialize())), w2 = World.fromJSON(j, seededRandom(2));
  assert.equal(w2.grid.get(40, 40).groundType, GroundType.WoodDeck);
  assert.equal(w2.buildings.size, 1);
  assert.deepEqual([...w2.buildings.values()][0].cells, [...w.buildings.values()][0].cells);
  assert.equal(w2.paint(0, 0, GroundType.Cobble), false);                    // 바다는 칠할 수 없음
});

test("조사: 받침에 따라 을/를", () => {
  assert.equal(josa("작은 집", "을", "를"), "작은 집을");
  assert.equal(josa("카페", "을", "를"), "카페를");
  assert.equal(josa("우체국", "을", "를"), "우체국을");
  assert.equal(josa("잡화점", "을", "를"), "잡화점을");
});

test("갈매미 들어 옮기기: 땅에 내려놓기 / 건물에 넣기 / 바다면 제자리", () => {
  const w = World.create(7, seededRandom(4)), u = w.units[0];
  w.instantBuild = true;
  const b = w.placeBuilding("house", 38, 26, 0).building;
  const x0 = u.x, z0 = u.z;
  assert.equal(w.pickUpUnit(u), true); assert.equal(u.state, UnitState.Held);
  w.update(1); assert.equal(u.x, x0);                                        // 들려 있는 동안 AI가 움직이지 않음
  assert.deepEqual(w.dropUnit(u, 40, 40), { ok: true }); assert.equal(u.x, 40.5); assert.equal(u.z, 40.5); assert.equal(u.state, UnitState.Idle);
  w.pickUpUnit(u); const r = w.dropUnit(u, 38, 26);
  assert.equal(r.building, b); assert.equal(u.state, UnitState.Inside); assert.deepEqual(b.occupants, [u.unitId]);
  assert.equal(w.pickUpUnit(u), false);                                      // 건물 안이면 못 듦
  const v = w.units[1], vx = v.x, vz = v.z; w.pickUpUnit(v);
  assert.equal(w.dropUnit(v, 0, 0).reason, "바다에는 내려놓을 수 없어요"); assert.equal(v.x, vx); assert.equal(v.z, vz);
});

test("마을 생활: 오래 돌리면 낚시·벌목·채광·씨앗·인사·공사가 실제로 일어나고, 아무도 바다에 빠지지 않는다", () => {
  const w = World.create(7, seededRandom(11));
  w.placeBuilding("house", 38, 26, 0);                       // 공사장(갈매미가 지어야 함)
  const seen = new Set(), events = { treeFell: 0, oreBroke: 0, fish: 0, buildingDone: 0 };
  for (const ev of Object.keys(events)) w.on(ev, () => events[ev]++);
  const wood0 = w.res.wood;
  for (let t = 0; t < 600; t += 1 / 20) {
    w.update(1 / 20);
    for (const u of w.units) {
      seen.add(u.state);
      if (!u.insideBuildingId && u.state !== "Held") assert.ok(w.grid.isWalkable(Math.floor(u.x), Math.floor(u.z)), `${u.name} ${u.state} at ${u.x.toFixed(1)},${u.z.toFixed(1)}`);
    }
  }
  for (const st of ["Chop", "Mine", "Fish", "Eat", "Greet", "Build", "Zoomies"]) assert.ok(seen.has(st), `상태 ${st}를 한 번도 안 함: ${[...seen].join(",")}`);
  assert.ok(events.treeFell > 0 && events.oreBroke > 0 && events.fish > 0, JSON.stringify(events));
  assert.ok(w.res.eaten > 0);
  assert.equal(events.buildingDone, 1, "갈매미가 공사장을 완공해야 함");
  assert.ok(w.trees.every(t => t.claimed === null || w.units.some(u => u.unitId === t.claimed)), "찜한 나무는 실제 갈매미 것");
  assert.ok(wood0 >= 0);
});

test("찜(나무·낚시 자리)은 하던 갈매미를 들어 올리면 풀린다", () => {
  const w = World.create(7, seededRandom(12));
  for (let t = 0; t < 300 && !w.units.some(u => u.state === "GoFish" || u.state === "Fish"); t += 1 / 20) w.update(1 / 20);
  const u = w.units.find(u => u.state === "GoFish" || u.state === "Fish"); assert.ok(u, "낚시하러 가는 갈매미가 있어야 함");
  const spot = w.spots.find(s => s.claimed === u.unitId); assert.ok(spot);
  w.pickUpUnit(u); assert.equal(spot.claimed, null); assert.equal(u.tool, null);
});

test("집 짓기: 공사를 맡은 갈매미는 재료를 구해 와서라도 100%까지 혼자 끝낸다", () => {
  const w = World.create(7, seededRandom(21));
  const b = w.placeBuilding("manor", 38, 34, 0).building;       // 4×3 → 망치질 36번, 나무·돌 각 12 필요(처음엔 6씩)
  const builders = new Set(); let first = null, gathered = false;
  w.on("buildingProgress", x => { if (x === b) { builders.add(x.lastBuilder); first ??= x.lastBuilder; } });
  for (let t = 0; t < 900 && !w.isDone(b); t += 1 / 20) {
    w.update(1 / 20);
    const u = first && w.units.find(u => u.unitId === first);
    if (u && ["GoChop", "Chop", "GoMine", "Mine"].includes(u.state) && u.committed === b.id) gathered = true;
    if (u && !w.isDone(b)) assert.equal(b.busy, first, "맡은 동안 다른 갈매미가 가져가지 않음");
  }
  assert.ok(w.isDone(b), `완공돼야 함: ${b.hits}/${b.need}`);
  assert.deepEqual([...builders], [first], "한 갈매미가 끝까지");
  assert.ok(gathered, "재료가 모자라 구하러 다녀옴");
  for (let t = 0; t < 2; t += 1 / 20) w.update(1 / 20);          // 마지막 망치질 동작이 끝나면 맡은 일을 내려놓음
  const u = w.units.find(u => u.unitId === first);
  assert.equal(u.committed, null); assert.equal(b.busy, null);
});

test("공사를 맡은 갈매미를 들어 올리면 공사장이 풀린다", () => {
  const w = World.create(7, seededRandom(22));
  const b = w.placeBuilding("house", 38, 26, 0).building;
  for (let t = 0; t < 400 && !b.busy; t += 1 / 20) w.update(1 / 20);
  const u = w.units.find(u => u.unitId === b.busy); assert.ok(u);
  w.pickUpUnit(u); assert.equal(b.busy, null); assert.equal(u.committed, null);
});
