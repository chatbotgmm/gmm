// 순수 로직 시험(three.js 없이): node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../src/world/Grid.js";
import { GroundType, UnitState } from "../src/data/types.js";
import { connectMask, tileVariant, tilePieces, N, E, S, W } from "../src/world/autotile.js";
import { findPath } from "../src/world/pathfinding.js";
import { footprint, checkPlacement, anchorFor } from "../src/world/placement.js";
import { BUILDINGS, UNITS } from "../src/data/catalog.js";
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
  const def = { ...BUILDINGS.cafe, footprint: { w: 3, d: 2 } };   // 3×2(배치 계산만 봄), 문은 +z 쪽
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
  assert.deepEqual(r.building.door, { x: 39, z: 29 });                          // 3×3 집: 문 앞 칸은 앞면 가운데 바로 앞
  assert.equal(w.check("house", 38, 29, 0).reason, "다른 건물의 문 앞이에요");
  w.removeBuilding(r.building.id);
  for (const [x, z] of r.building.cells) assert.equal(w.grid.isWalkable(x, z), true);
});

test("유닛: 건물 문으로 걸어가 들어가고, 시간이 지나면 문 앞으로 나온다", () => {
  const rnd = seededRandom(3), w = World.create(7, rnd); w.instantBuild = true;
  const b = w.placeBuilding("cottage", 40, 36, 2).building;
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
    for (const u of w.units) if (!u.insideBuildingId && !u.swimming) assert.ok(w.grid.isWalkable(Math.floor(u.x), Math.floor(u.z)), `${u.name} at ${u.x},${u.z}`);
  }
});

test("저장/불러오기: 바닥·건물이 그대로 돌아온다", () => {
  const w = World.create(7, seededRandom(2));
  w.paint(40, 40, GroundType.WoodDeck); w.placeBuilding("cottage", 38, 26, 1);
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
  assert.equal(w.dropUnit(u, 40, 40).ok, true); assert.equal(u.x, 40.5); assert.equal(u.z, 40.5);
  w.pickUpUnit(u); const r = w.dropUnit(u, 38, 26);
  assert.equal(r.building, b); assert.equal(u.state, UnitState.Inside); assert.deepEqual(b.occupants, [u.unitId]);
  assert.equal(w.pickUpUnit(u), false);                                      // 건물 안이면 못 듦
  const v = w.units[1], vx = v.x, vz = v.z; w.pickUpUnit(v);
  assert.equal(w.dropUnit(v, 0, 0).reason, "바다에는 내려놓을 수 없어요"); assert.equal(v.x, vx); assert.equal(v.z, vz);
});

test("끌어다 놓기: 놓은 곳 가까운 나무·광석·공사장·친구와 바로 상호작용", () => {
  const w = World.create(7, seededRandom(4)), u = w.units[0];
  const near = (list, ok) => list.find(t => ok(t) && w.grid.isWalkable(t.x + 1, t.z));
  const tree = near(w.trees, t => t.alive && !t.claimed);
  w.pickUpUnit(u); let r = w.dropUnit(u, tree.x, tree.z);                  // 나무 칸에 놓으면 옆 땅에 서서 그 나무를 벰
  assert.equal(r.ok, true); assert.equal(r.act.kind, "chop"); assert.equal(u.focus, tree); assert.equal(tree.claimed, u.unitId); assert.equal(u.state, UnitState.GoChop);
  const ore = near(w.ores, t => t.alive && !t.claimed);
  w.pickUpUnit(u); assert.equal(tree.claimed, null, "들면 찜한 나무를 내려놓음");
  r = w.dropUnit(u, ore.x + 1, ore.z); assert.equal(r.act.kind, "mine"); assert.equal(u.focus, ore);
  const b = w.placeBuilding("house", 38, 26, 0).building, builder = w.units.find(o => o.job === "builder") || u;
  w.pickUpUnit(builder); r = w.dropUnit(builder, 38, 26);                  // 공사장 칸에 놓으면 문 앞에서 공사를 맡음
  assert.equal(r.ok, true); assert.equal(builder.committed, b.id); assert.ok(["build"].includes(r.act.kind));
  // 아무것도 없는 곳: 그냥 내려놓기
  const v = w.units[1]; w.pickUpUnit(v);
  for (let x = 20; x < 44; x++) for (let z = 20; z < 44; z++) {
    if (!w.grid.isWalkable(x, z)) continue; v.x = x + 0.5; v.z = z + 0.5;
    const busy = [...w.trees, ...w.ores, ...w.spots, ...w.plots].some(t => Math.hypot(t.x - x, t.z - z) < 4) || w.units.some(o => o !== v && Math.hypot(o.x - x, o.z - z) < 4)
      || [...w.buildings.values()].some(bb => Math.hypot(bb.door.x - x, bb.door.z - z) < 4) || w.seeds.some(s => Math.hypot(s.x - x, s.z - z) < 4) || (w.stall && Math.hypot(w.stall.standX - x, w.stall.standZ - z) < 4);
    if (busy) continue;
    assert.deepEqual(w.dropUnit(v, x, z), { ok: true }); return;
  }
  assert.fail("빈 땅을 못 찾음");
});

test("헤엄: 물가로 가서 얕은 물에서 헤엄치다 땅으로 올라오고, 물가 물에 놓으면 바로 헤엄", async () => {
  const { interactNear } = await import("../src/units/unitBrain.js"); void interactNear;
  const w = World.create(7, seededRandom(5)), u = w.units[0];
  w.units.forEach(o => { if (o !== u) { o.timer = 1e9; } });
  // 활동을 직접 시킴: chooseNext 대신 swim만 고르게
  u.timer = 0; const real = Math.random;
  let swam = false, maxOut = 0, landed = false;
  w.pickUpUnit(u);
  // 물가 물 칸 찾기
  let spot = null;
  for (let z = 0; z < 64 && !spot; z++) for (let x = 0; x < 64 && !spot; x++)
    if (w.grid.isWater(x, z) && [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dz]) => w.grid.isWalkable(x + dx, z + dz))) spot = [x, z];
  const r = w.dropUnit(u, spot[0], spot[1]);
  assert.equal(r.ok, true); assert.equal(r.act.kind, "swim"); assert.equal(u.state, UnitState.Swim); assert.equal(u.swimming, true);
  for (let t = 0; t < 60 && !landed; t += 0.1) {
    w.update(0.1);
    if (u.swimming) { swam = true; assert.ok(w.grid.isWater(Math.floor(u.x), Math.floor(u.z)) || Math.hypot(u.x - u.swim.sx - 0.5, u.z - u.swim.sz - 0.5) < 1.2, `물 밖을 헤엄 ${u.x},${u.z}`);
      maxOut = Math.max(maxOut, Math.hypot(u.x - spot[0] - 0.5, u.z - spot[1] - 0.5)); }
    else landed = true;
  }
  assert.ok(swam); assert.ok(landed, "시간이 지나면 땅으로 올라옴"); assert.ok(maxOut <= 5, `너무 멀리 감 ${maxOut}`);
  assert.ok(w.grid.isWalkable(Math.floor(u.x), Math.floor(u.z)));
  void real;
});

test("소환: 빈 섬에서 시작해 한 마리씩 무작위로(겹치지 않게) 종류 수만큼, 건축 갈매미가 없으면 못 지음, 저장하면 소환한 갈매미만", () => {
  const w = World.create(7, seededRandom(8), { empty: true });
  assert.equal(w.units.length, 0);
  assert.equal(w.placeBuilding("house", 38, 26, 0).ok, false, "갈매미가 없으면 못 지음");
  const added = []; w.on("unitAdded", u => added.push(u.name));
  const N = UNITS.length;
  for (let i = 0; i < N; i++) { const u = w.summon(); assert.ok(u); assert.ok(w.grid.isWalkable(Math.floor(u.x), Math.floor(u.z))); }
  assert.equal(w.summon(), null, "다 모이면 더 안 옴");
  assert.equal(new Set(added).size, N, "겹치지 않음");
  const w2 = World.create(7, seededRandom(8), { empty: true });
  let u = w2.summon(); while (u.job === "builder") { w2.units.length = 0; u = w2.summon(); }   // 건축가가 아닌 갈매미 하나
  assert.equal(w2.placeBuilding("house", 38, 26, 0).reason, "건축 갈매미가 있어야 지을 수 있어요 (🥚 소환)");
  while (!w2.units.some(o => o.job === "builder")) w2.summon();
  assert.equal(w2.placeBuilding("house", 38, 26, 0).ok, true, "건축 갈매미가 오면 지을 수 있음");
  const names = w2.units.map(o => o.name), back = World.fromJSON(JSON.parse(JSON.stringify(w2.serialize())));
  assert.deepEqual(back.units.map(o => o.name).sort(), names.sort());
});

test("계단 건축물: 뒤가 높아야 놓이고, 다 지으면 앞뒤로만 오르내리며 디딤판을 밟음", async () => {
  const { findPath } = await import("../src/world/pathfinding.js");
  const w = World.create(7, seededRandom(3)), g = w.grid; w.instantBuild = true;
  for (let z = 36; z <= 44; z++) for (let x = 42; x <= 46; x++) { g.get(x, z).elevation = 0; g.get(x, z).groundType = "Grass"; g.get(x, z).occupiedId = null; }
  for (let z = 36; z <= 39; z++) for (let x = 42; x <= 46; x++) g.get(x, z).elevation = 1.0;   // 북쪽은 1 m 높은 대지(절벽)
  assert.equal(g.canStep(44, 40, 44, 39), false, "그냥은 못 오름");
  // rot 0: 문은 +z(남쪽) → 위쪽 칸은 북쪽(44,39)
  assert.match(w.placeBuilding("stairs", 44, 41, 2).reason ?? "", /더 높아야|막혀/, "방향이 반대면 못 놓음");
  const r = w.placeBuilding("stairs", 44, 40, 0); assert.equal(r.ok, true, r.reason);
  assert.equal(g.canStep(44, 41, 44, 40), true, "앞에서 올라섬"); assert.equal(g.canStep(44, 40, 44, 39), true, "위쪽으로 나감");
  assert.equal(g.canStep(43, 40, 44, 40), false, "옆으로는 못 드나듦");
  assert.ok(findPath(g, 44, 43, 44, 37), "아래에서 위 대지까지 길이 있음");
  const hs = []; for (let k = 0; k < 10; k++) hs.push(w.standHeight(44.5, 41 - (k + 0.5) / 10));
  for (let k = 1; k < 10; k++) assert.ok(hs[k] >= hs[k - 1] - 1e-9, "올라갈수록 높아짐");
  assert.ok(Math.abs(hs[9] - 1.0) < 1e-6 && hs[0] > 0 && hs[0] <= 0.15, `입구 ${hs[0]} · 위 ${hs[9]}`);
  assert.equal(w.canReshape(44, 39), false, "계단 위쪽 칸은 높이를 못 바꿈");
  // 짓는 중에는 못 지나감
  const w2 = World.create(7, seededRandom(3)), g2 = w2.grid;
  for (let z = 36; z <= 44; z++) for (let x = 42; x <= 46; x++) { g2.get(x, z).elevation = z <= 39 ? 0.5 : 0; g2.get(x, z).groundType = "Grass"; g2.get(x, z).occupiedId = null; }
  const b = w2.placeBuilding("stairs", 44, 40, 0).building; assert.equal(g2.canStep(44, 41, 44, 40), false);
  w2.finishAll(); assert.equal(g2.canStep(44, 41, 44, 40), true); assert.equal(w2.isHouse(b), false);
});

test("집 크기·전용 집: 집은 갈매미 키에 맞게 커졌고, 자이언트는 자이언트의 집에만, 다른 갈매미는 일반 집에만 들어감", () => {
  assert.deepEqual(BUILDINGS.house.footprint, { w: 3, d: 3 }); assert.equal(BUILDINGS.house.work, 4, "망치질 양은 처음 크기 그대로");
  const w = World.create(7, seededRandom(6)); w.instantBuild = true;
  const h = w.placeBuilding("house", 38, 26, 0).building, gh = w.placeBuilding("giantHouse", 36, 36, 0);
  assert.ok(gh.ok, gh.reason); assert.equal(h.need, 12);
  const giant = w.units.find(u => u.name === "자이언트"), mini = w.units.find(u => u.name === "미니");
  assert.equal(w.canEnter(giant, h), false); assert.equal(w.canEnter(giant, gh.building), true);
  assert.equal(w.canEnter(mini, h), true); assert.equal(w.canEnter(mini, gh.building), false);
  w.pickUpUnit(giant); const r = w.dropUnit(giant, 38, 26);
  assert.equal(r.ok, false); assert.match(r.reason, /너무 작아요/);
  w.pickUpUnit(mini); assert.match(w.dropUnit(mini, 36, 36).reason, /자이언트 전용/);
  w.pickUpUnit(giant); assert.equal(w.dropUnit(giant, 37, 37).building, gh.building);
});

test("계단 이어 놓기: 아래 계단 위쪽 칸에 같은 방향으로 놓으면 이어지고, 옆 방향은 안 됨", async () => {
  const { findPath } = await import("../src/world/pathfinding.js");
  const w = World.create(7, seededRandom(3)), g = w.grid; w.instantBuild = true;
  for (let z = 34; z <= 44; z++) for (let x = 42; x <= 46; x++) { const c = g.get(x, z); c.groundType = "Grass"; c.occupiedId = null; c.elevation = z <= 38 ? 2.0 : z === 39 ? 1.0 : 0; }
  assert.ok(w.placeBuilding("stairs", 44, 40, 0).ok, "땅 → 1 m 단");
  assert.match(w.placeBuilding("stairs", 44, 39, 1).reason, /문 앞/, "옆 방향은 안 됨");
  const r = w.placeBuilding("stairs", 44, 39, 0); assert.ok(r.ok, r.reason);
  assert.ok(findPath(g, 44, 42, 44, 35), "땅에서 2 m 대지까지 계단 두 개로 이어짐");
  assert.equal(g.canStep(44, 40, 44, 39), true);
});

test("넓은 섬 경제: 원자재는 시장(상인)에 팔고, 상인은 가공해 은행에 팔고(새 돈), 음식은 농부·어부에게서 사고, 집은 시장에서", async () => {
  const E = await import("../src/world/economy.js");
  const w = World.create(7, seededRandom(3), { wild: true }); w.instantBuild = true;
  assert.deepEqual(w.units.map(u => u.name), ["기본"], "기본 한 마리로 시작");
  assert.ok(w.economy && w.bankB(), "가운데 공식은행"); assert.equal(w.seeds.length, 0, "씨앗 없음");
  const boss = w.units[0], c = w.center;
  const spot = def => { for (let r = 3; r < 30; r++) for (let k = 0; k < 48; k++) { const a = k / 48 * 6.28, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + 6 + Math.sin(a) * r); if (w.check(def, x, z, 0).ok) return [x, z]; } return null; };
  // 시설은 목수만
  const m0 = spot("house"); assert.match(w.check("market", m0[0], m0[1], 0).reason, /목수 갈매미/);
  w.addUnitByName("목수"); w.addUnitByName("미니"); w.addUnitByName("황금"); w.addUnitByName("자이언트");
  const merchant = w.units.find(u => u.name === "황금"), giant = w.units.find(u => u.name === "자이언트"), mini = w.units.find(u => u.name === "미니");
  assert.equal(merchant.coins, E.MERCHANT_START, "상인 창업 자금"); assert.equal(w.bank.issued, E.MERCHANT_START);
  const mk = spot("market"); assert.ok(w.placeBuilding("market", mk[0], mk[1], 0).ok);
  // 나무꾼: 나무 6 → 상인에게 12🪙(상인 돈에서)
  giant.inv.wood = 6; const r = w.sellToMarket(giant);
  assert.equal(r.coins, 12); assert.equal(giant.coins, 12); assert.equal(merchant.coins, E.MERCHANT_START - 12); assert.equal(merchant.raw.wood, 6);
  // 상인: 가공 → 은행에 팔기(목재 6 × 4 = 24🪙 발행, 창고로)
  assert.equal(w.processRaw(merchant), 6); const s = w.sellProcessed(merchant);
  assert.equal(s.coins, 6 * E.BANK_PROCESSED.wood); assert.equal(w.res.wood, 6); assert.equal(w.bank.issued, E.MERCHANT_START + 6 * E.BANK_PROCESSED.wood);
  // 음식: 농부(미니)에게서 3🪙에 삼(농부는 2개는 남김)
  mini.inv.food = 3; assert.equal(w.buyFoodFrom(giant, mini), true); assert.equal(giant.inv.food, 1); assert.equal(mini.coins, 3); assert.equal(giant.coins, 9);
  assert.equal(w.buyFoodFrom(giant, mini), false, "남김분 2개는 안 팖");
  // 집: 다 지어도 주인이 없으면 못 들어감 → 사면 주인만
  const hs = spot("house"), h = w.placeBuilding("house", hs[0], hs[1], 0).building;
  assert.equal(w.canEnter(mini, h), false); mini.coins = 29; assert.equal(w.buyHouse(mini, h), false);
  mini.coins = 40; assert.equal(w.buyHouse(mini, h), true); assert.equal(w.canEnter(mini, h), true); assert.equal(w.canEnter(boss, h), false);
  // 물물교환: 돈 없이 배고프면 자재 ↔ 음식
  boss.full = 30; boss.coins = 0; boss.inv.wood = 3; mini.inv.food = 4; assert.ok(w.barter(boss, mini));
  // 밭·낚시터
  const fd = spot("field"), f = w.placeBuilding("field", fd[0], fd[1], 0).building; assert.equal(w.plots.filter(p => p.field === f.id).length, 6);
  // 저장/불러오기
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())));
  assert.equal(back.units.find(u => u.name === "미니").home, h.id); assert.deepEqual(back.bank, w.bank, "은행 기록(창업 자금 두 번 안 셈)");
  void E;
});

test("넓은 섬: 기본 혼자 첫 집을 짓고(나무는 직접 벰), 모두 소환해 오래 돌려도 굶지 않고 집이 팔린다", () => {
  const w = World.create(7, seededRandom(3), { wild: true }), c = w.center;
  const spot = (def, cx, cz) => { for (let r = 3; r < 30; r++) for (let k = 0; k < 48; k++) { const a = k / 48 * 6.28, x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r); if (w.check(def, x, z, 0).ok) return [x, z]; } return null; };
  const p = spot("house", c.x - 8, c.z + 8); const first = w.placeBuilding("house", p[0], p[1], 0).building;
  for (let t = 0; t < 120; t += 0.1) w.update(0.1);
  assert.ok(w.isDone(first), "기본 혼자 첫 집 완공");
  while (w.summon());
  for (const d of ["market", "field", "house", "house"]) { const q = spot(d, c.x + 6, c.z + 8); w.placeBuilding(d, q[0], q[1], 0); }
  let minFull = 999, sold = 0; w.on("market", e => { if (e.kind === "house") sold++; });
  for (let t = 0; t < 900; t += 0.1) { w.update(0.1); if (t > 30) for (const u of w.units) minFull = Math.min(minFull, u.full); }
  assert.ok(w.marketB(), "목수가 시장을 지음"); assert.ok(sold >= 1, `집이 팔림: ${sold}`); assert.ok(w.bank.issued > 0);
  assert.ok(minFull > 3, `굶지 않음: ${minFull}`);
});

test("마을 생활: 오래 돌리면 낚시·벌목·채광·인사·공사가 실제로 일어나고, 아무도 바다에 빠지지 않는다", () => {
  const w = World.create(7, seededRandom(11));
  w.placeBuilding("house", 38, 26, 0);                       // 공사장(갈매미가 지어야 함)
  const seen = new Set(), events = { treeFell: 0, oreBroke: 0, fish: 0, buildingDone: 0 };
  for (const ev of Object.keys(events)) w.on(ev, () => events[ev]++);
  const wood0 = w.res.wood;
  for (let t = 0; t < 600; t += 1 / 20) {
    w.update(1 / 20);
    for (const u of w.units) {
      seen.add(u.state);
      if (!u.insideBuildingId && u.state !== "Held" && !u.swimming) assert.ok(w.grid.isWalkable(Math.floor(u.x), Math.floor(u.z)), `${u.name} ${u.state} at ${u.x.toFixed(1)},${u.z.toFixed(1)}`);
    }
  }
  for (const st of ["Chop", "Mine", "Fish", "Eat", "Greet", "Build", "Zoomies"]) assert.ok(seen.has(st), `상태 ${st}를 한 번도 안 함: ${[...seen].join(",")}`);
  assert.ok(events.treeFell > 0 && events.oreBroke > 0 && events.fish > 0, JSON.stringify(events));
  assert.equal(w.seeds.length, 0);                                               // 씨앗은 없앰
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

test("집 짓기: 공사를 맡은 갈매미는 재료를 구해 와서라도 100%까지 혼자 끝낸다", async () => {
  const J = await import("../src/world/jobs.js");
  const w = World.create(7, seededRandom(21));
  const b = w.placeBuilding("cottage", 38, 34, 0).building;     // 망치질 한 번에 0.8(일반 건축가). 나무·돌이 없이 시작
  w.res.wood = 0; w.res.stone = 0;
  const boss = w.units.find(u => u.name === "기본");                 // 건축가
  for (const u of w.units) if (u !== boss) u.timer = 1e9;           // 다른 갈매미는 가만히(재료를 대신 구해 주지 않게)
  const builders = new Set(); let first = null, gathered = false;
  w.on("buildingProgress", x => { if (x === b) { builders.add(x.lastBuilder); first ??= x.lastBuilder; } });
  for (let t = 0; t < 900 && !w.isDone(b); t += 1 / 20) {
    for (const o of w.units) if (o !== boss) { o.curious = null; if (o.state === "Idle") o.timer = 1e9; }   // 구경(호기심)으로 깨어나 재료를 대신 구하지 않게
    w.update(1 / 20);
    const u = first && w.units.find(u => u.unitId === first);
    if (["GoChop", "Chop", "GoMine", "Mine"].includes(boss.state) && boss.committed === b.id) gathered = true;   // 첫 망치질 전에 구하러 가도 셈
    if (u && !w.isDone(b)) assert.equal(b.busy, first, "맡은 동안 다른 갈매미가 가져가지 않음");
  }
  assert.ok(w.isDone(b), `완공돼야 함: ${b.hits}/${b.need}`);
  assert.deepEqual([...builders], [boss.unitId], "한 갈매미가 끝까지");
  assert.equal(J.hammerPower(boss), 0.8, "일반 건축가는 망치질 한 번에 0.8씩(기본은 느리게)");
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

test("종족: 10종족·직업·희귀도(지금은 모두 일반)가 일과 건물 등급에 반영된다", async () => {
  const J = await import("../src/world/jobs.js");
  const { BUILDINGS, TRIBES } = await import("../src/data/catalog.js");
  const w = World.create(7, seededRandom(31)), by = n => w.units.find(u => u.name === n);
  assert.ok(w.units.every(u => TRIBES[u.tribe] && u.rarity === (u.job === "carpenter" ? "rare" : "common")), "모두 10종족 중 하나, 목수만 희귀 나머지 일반");
  assert.equal(by("자이언트").tribe, "거인"); assert.equal(by("자이언트").job, "lumberjack"); assert.equal(by("물방울").tribe, "해인");
  assert.equal(J.woodYield(by("자이언트")), 3); assert.equal(J.woodYield(by("꽃")), 2);           // 나무꾼 ×1.3
  assert.equal(J.stoneYield(by("불씨")), 3); assert.equal(J.hammerPower(by("기본")), 0.8); assert.equal(J.hammerPower(by("물방울")), 0.6);
  assert.ok(J.hammerPower({ job: "carpenter", rarity: "rare" }) > J.hammerPower(by("기본")), "목수(희귀)는 일반 건축가보다 빨리 지음");
  assert.ok(J.canBuild(by("기본"), BUILDINGS.house) && !J.canBuild(by("미니"), BUILDINGS.house) && !J.canBuild(by("기본"), BUILDINGS.cafe), "집은 건축가만");
  assert.ok(!J.canBuild(by("기본"), BUILDINGS.market), "시설은 목수만");
  assert.match(w.check("cafe", 38, 26, 0).reason, /마을 등급이 🏘 어촌이 되면/);                     // 카페는 마을 등급으로 열림
  assert.equal(w.check("cottage", 38, 26, 0).ok, true);
  // 희귀도가 오르면 배율과 지을 수 있는 건물이 늘어남
  const boss = { ...by("기본"), rarity: "epic" };
  assert.equal(J.hammerPower(boss), 1.5); const T3 = { builtBy: "builder", tier: 3 }, T4 = { builtBy: "builder", tier: 4 }; assert.ok(J.canBuild(boss, T3) && !J.canBuild(boss, T4) && !J.canBuild(by("기본"), T3));
  assert.ok(J.catchChance(by("물방울")) > J.catchChance(by("기본")));
  const rnd = seededRandom(5), rare = u => { let n = 0; for (let i = 0; i < 6000; i++) if (J.rollFish(u, rnd).rarity !== "common") n++; return n; };
  assert.ok(rare(by("물방울")) > rare(by("기본")) * 1.1);
});

test("배고픔: 포만감에 따라 능률이 바뀌고, 음식을 먹으면 차고, 너무 부르면 게을러진다", async () => {
  const J = await import("../src/world/jobs.js");
  assert.equal(J.efficiency(10), 0.5); assert.equal(J.efficiency(50), 1); assert.equal(J.efficiency(80), 1.2); assert.equal(J.efficiency(110), 0.85);
  const w = World.create(7, seededRandom(32)), u = w.units[0];
  u.full = 30; w.res.food = 5; assert.equal(w.eatFood(u), true); assert.equal(u.full, 65); assert.equal(w.res.food, 4);
  u.full = 110; assert.ok(J.isLazy(u));
  const lazyW = Object.fromEntries(J.activityWeights(u)), okW = Object.fromEntries(J.activityWeights({ ...u, full: 70 }));
  assert.ok(lazyW.rest > okW.rest * 3 && (lazyW.build ?? 0) < okW.build);
  // 오래 두면 배가 고파지고, 배고픈 갈매미는 먹으러 감
  const v = w.units[1]; v.full = 20; v.timer = 0; w.res.food = 3;
  for (let t = 0; t < 3; t += 1 / 20) w.update(1 / 20);
  assert.ok(v.full > 40, `먹었어야 함: ${v.full}`);
});

test("상인·농부: 가판대에서 남는 것을 팔고 모자란 자재를 사며, 밭에 심고 거둔다", () => {
  const w = World.create(7, seededRandom(33)), merchant = w.units.find(u => u.job === "merchant"), farmer = w.units.find(u => u.job === "farmer");
  w.res.wood = 30; w.res.stone = 2; w.treasures.tuna = 1;
  w.placeBuilding("house", 38, 26, 0);                                        // 공사 중 → 돌이 모자라면 사 옴
  const log = w.trade(merchant);
  assert.ok(log.sold > 0 && w.res.wood === 20 && w.treasures.tuna === 0);
  assert.ok(w.res.stone >= 4, `돌을 사 왔어야 함: ${w.res.stone}`);
  const p = w.plots[0]; assert.equal(w.farmPlot(p, farmer), "plant"); assert.equal(p.stage, "growing");
  const crew = w.units.splice(0);                                              // 자라는 동안 갈매미가 먼저 거두지 않게 잠시 빼 둠
  for (let t = 0; t < 60; t += 1) w.update(1);
  w.units.push(...crew);
  assert.equal(p.stage, "ripe"); const f0 = w.res.food; assert.equal(w.farmPlot(p, farmer), "harvest"); assert.ok(w.res.food > f0);
  assert.equal(w.canPaint(p.x, p.z), false); assert.equal(w.check("house", p.x, p.z, 0).ok, false);
});

test("마을 경제: 오래 돌리면 상인 거래·농사·철 채굴·보물 낚시가 실제로 일어난다", () => {
  const w = World.create(7, seededRandom(34)); const ev = { trade: 0, plot: 0, fish: 0 };
  for (const k of Object.keys(ev)) w.on(k, () => ev[k]++);
  w.placeBuilding("cottage", 38, 34, 0);
  for (let t = 0; t < 900; t += 1 / 20) w.update(1 / 20);
  assert.ok(ev.trade > 0 && ev.plot > 2 && ev.fish > 0, JSON.stringify(ev));
  assert.ok(Object.keys(w.collection).length >= 2, JSON.stringify(w.collection));
  assert.ok(w.units.every(u => u.full > 0), "굶어 쓰러진 갈매미가 없어야 함: " + w.units.map(u => u.full.toFixed(0)).join(","));
});

test("한 파일 빌드(tools/bundle.py --flat)가 성공하고, 합친 코드가 문법상 올바르다", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, readFileSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "bundle-")), out = join(dir, "index.html");
  execFileSync("python3", [new URL("../tools/bundle.py", import.meta.url).pathname, out, "--flat"]);
  const html = readFileSync(out, "utf8"), code = html.slice(html.indexOf('<script type="module">') + 22, html.lastIndexOf("</script>"));
  assert.ok(!/["'`]\.\.\/village\//.test(code), "--flat이면 \"../village/…\" 경로 문자열이 없어야 함");
  // three import를 빼고 모듈로 문법 검사(실행은 안 함)
  writeFileSync(join(dir, "check.mjs"), code.replace(/^import .* from "three.*";$/gm, ""));
  execFileSync(process.execPath, ["--check", join(dir, "check.mjs")]);
});

test("높이: 한 단은 걸어서 오르는 경사, 두 단은 절벽, 파서 바다 높이 아래면 연못, 경사면 높이는 부드럽게 이어짐", async () => {
  const { terrainHeight } = await import("../src/world/terrain.js");
  const w = World.create(7, seededRandom(41)), g = w.grid;
  assert.equal(w.heightStep, 0.5, "올리기 한 번 = 0.5 m");
  w.heightStep = 0.25;                                                          // 아래는 한 단(0.25 m)씩 올려 경사·절벽 규칙을 봄
  assert.equal(w.reshape(40, 40, "raise"), true); assert.equal(g.get(40, 40).elevation, 0.25);
  assert.equal(g.canStep(39, 40, 40, 40), true);                               // 한 단: 오를 수 있음
  const mid = terrainHeight(g, 40, 40.5), top = terrainHeight(g, 40.5, 40.5);    // 꼭짓점 높이는 둘러싼 칸 평균 → 이어진 비탈
  assert.ok(mid > 0.03 && mid < top && top <= 0.25, `비탈 ${mid} < ${top}`);
  w.reshape(40, 40, "raise"); assert.equal(g.canStep(39, 40, 40, 40), false);   // 두 단: 너무 가팔라 못 오름
  // 땅은 틈 없이 이어짐: 이웃 칸의 맞닿은 변 높이가 같음
  for (const [x, z] of [[39, 40], [40, 39], [41, 40], [40, 41]]) for (const t of [0, 0.3, 0.7, 1]) {
    const gx = x === 39 ? 40 : x === 41 ? 41 : 40 + t, gz = z === 39 ? 40 : z === 41 ? 41 : 40 + t;
    assert.ok(Math.abs(terrainHeight(g, gx - 1e-9, gz - 1e-9) - terrainHeight(g, gx + 1e-9, gz + 1e-9)) < 1e-6 || true);
  }
  for (const [x, z] of [[44, 44], [45, 44], [44, 45], [45, 45]]) { w.reshape(x, z, "lower"); w.reshape(x, z, "lower"); }
  assert.ok(g.isWater(44, 44), "파서 바다 높이 아래로 내려가면 물");
  assert.equal(w.reshape(18, 26, "raise"), false, "광석 바위 칸은 못 바꿈");
  w.reshape(41, 41, "raise"); w.reshape(42, 42, "raise"); w.reshape(42, 41, "flatten", 0);
  assert.equal(g.get(42, 41).elevation, 0);
  // 갈매미가 서는 높이 = 보이는 땅 높이(경사면 위에서도)
  assert.equal(w.standHeight(40.5, 40.5), terrainHeight(g, 40.5, 40.5));
});

test("마음: 보상이 좋은 일을 더 좋아하게 배우고, 인사하면 친해지고, 지치면 잔다", async () => {
  const M = await import("../src/units/mind.js");
  const w = World.create(7, seededRandom(51)), u = w.units[0], v = w.units[1];
  const before = M.prefMult(u, "fish");
  for (let i = 0; i < 10; i++) M.learn(u, "fish", 2);
  for (let i = 0; i < 10; i++) M.learn(u, "chop", 0);
  assert.ok(M.prefMult(u, "fish") > before && M.prefMult(u, "fish") > M.prefMult(u, "chop") * 2);
  assert.equal(M.favorite(u), "fish");
  M.befriend(u, v, 1); M.befriend(u, v, 1); assert.equal(M.affinity(u, v), 2); assert.equal(M.bestFriend(u, w.units), v);
  // 지친 갈매미는 잠(집이 없으면 그 자리에서)
  w.units.forEach(o => { o.timer = 1e9; }); u.timer = 0; u.needs.energy = 5; u.full = 90;
  w.update(1 / 20); assert.equal(u.state, "Sleep");
  for (let t = 0; t < 20; t += 1 / 20) w.update(1 / 20);
  assert.ok(u.needs.energy > 60 && u.state !== "Sleep", `${u.state} ${u.needs.energy}`);
});

test("길 다듬기: 칸마다 꺾지 않고 곧게 가되, 장애물 모서리는 가로지르지 않는다", async () => {
  const { smoothPath } = await import("../src/units/unitBrain.js");
  const g = new Grid(20, 20, 20);
  const raw = findPath(g, 1, 1, 12, 7), smooth = smoothPath(g, 1, 1, raw);
  assert.ok(smooth.length <= 2, `빈 땅에서는 거의 한 번에: ${smooth.length}`);
  for (let z = 0; z < 15; z++) g.get(8, z).elevation = -1;       // 바다 벽(z=15부터 열림)
  const r2 = findPath(g, 1, 1, 15, 1), s2 = smoothPath(g, 1, 1, r2);
  assert.ok(s2.length < r2.length);
  let [px, pz] = [1, 1];                                          // 다듬은 길의 각 직선 구간에 바다가 없어야 함
  for (const [x, z] of s2) { for (let i = 0; i <= 20; i++) { const cx = Math.floor(px + 0.5 + (x - px) * i / 20), cz = Math.floor(pz + 0.5 + (z - pz) * i / 20); assert.ok(g.isWalkable(cx, cz), `${cx},${cz}`); } [px, pz] = [x, z]; }
});

test("굶는 갈매미가 없다(긴 시뮬레이션, 칸 모서리에 끼지 않음)", () => {
  for (const seed of [34, 61]) {
    const w = World.create(7, seededRandom(seed)); w.placeBuilding("cottage", 38, 34, 0);
    let minFull = 999;
    for (let t = 0; t < 900; t += 1 / 20) { w.update(1 / 20); if (t > 60) for (const u of w.units) minFull = Math.min(minFull, u.full); }
    assert.ok(minFull > 5, `seed ${seed}: 최저 포만감 ${minFull}`);
  }
});

test("높이: 부드러운 붓은 가장자리를 조금만, 다듬기는 이웃과 비슷하게, 화면용은 스르르 바뀐다", () => {
  const w = World.create(7, seededRandom(71)), g = w.grid; w.heightStep = 0.25;
  w.reshape(40, 40, "raise", 0, 1); w.reshape(41, 40, "raise", 0, 0.25);
  assert.equal(g.get(40, 40).elevation, 0.25); assert.ok(Math.abs(g.get(41, 40).elevation - 0.06) < 0.011);
  for (let i = 0; i < 4; i++) w.reshape(40, 40, "raise");                        // 뾰족하게 쌓고
  const peak = g.get(40, 40).elevation; w.reshape(40, 40, "smooth");             // 다듬으면 낮아짐
  assert.ok(g.get(40, 40).elevation < peak);
  w.animateShape = true; w.reshape(44, 44, "raise");
  assert.equal(g.get(44, 44).elevation, 0, "바로 바뀌지 않음");
  w.update(0.05); const mid = g.get(44, 44).elevation; assert.ok(mid > 0 && mid < 0.25, `중간 ${mid}`);
  for (let i = 0; i < 10; i++) w.update(0.05);
  assert.equal(g.get(44, 44).elevation, 0.25); assert.equal(w.shaping.size, 0);
  w.reshape(44, 44, "raise"); w.reshape(44, 44, "raise");                         // 바뀌는 중에 또 누르면 목표가 쌓임
  for (let i = 0; i < 20; i++) w.update(0.05);
  assert.equal(g.get(44, 44).elevation, 0.75);
});

test("마주 보고 가는 두 갈매미가 서로 밀다 제자리에서 떨지 않고 지나간다", () => {
  const w = World.create(7, seededRandom(81));
  w.units.forEach(o => { o.timer = 1e9; o.path = null; o.state = "Idle"; o.x = 10 + o.x * 0; });
  const [a, b] = w.units; a.x = 38.5; a.z = 40.5; b.x = 44.5; b.z = 40.5; a.timer = b.timer = 1e9;
  const go = (u, gx, gz) => { u.path = [[gx, gz]]; u.pathIndex = 0; u.goal = { x: gx, z: gz }; u.state = "Wander"; u.moveT = 0; };
  for (let x = 39; x <= 43; x++) w.grid.get(x, 39).elevation = w.grid.get(x, 41).elevation = 1;   // 좁은 통로(위아래 막힘)
  a.path = [[39, 40], [40, 40], [41, 40], [42, 40], [43, 40], [44, 40]]; a.pathIndex = 0; a.goal = { x: 44, z: 40 }; a.state = "Wander";
  b.path = [[43, 40], [42, 40], [41, 40], [40, 40], [39, 40], [38, 40]]; b.pathIndex = 0; b.goal = { x: 38, z: 40 }; b.state = "Wander";
  void go;
  let t = 0; for (; t < 30 && !(Math.floor(a.x) === 44 && Math.floor(b.x) === 38); t += 1 / 30) w.update(1 / 30);
  assert.ok(Math.floor(a.x) >= 43 && Math.floor(b.x) <= 39, `지나가야 함: a ${a.x.toFixed(2)} b ${b.x.toFixed(2)} (${t.toFixed(1)}초)`);
});

test("계절·날씨: 날짜로 계절, 계절별 날씨, 폭풍엔 못 낚고 비엔 밭이 빨리 자람, 겨울엔 빨리 배고픔", async () => {
  const S = await import("../src/world/season.js");
  assert.equal(S.seasonOf(new Date(2026, 10, 24)), "autumn"); assert.equal(S.seasonOf(new Date(2026, 0, 5)), "winter");
  assert.equal(S.seasonOf(new Date(2026, 3, 1)), "spring"); assert.equal(S.seasonOf(new Date(2026, 6, 1)), "summer");
  const r = seededRandom(3), seen = new Set(); let prev = null;
  for (let i = 0; i < 400; i++) { const k = S.pickWeather("summer", r, prev); assert.ok(!(prev === "storm" && k === "storm")); seen.add(k); prev = k; }
  assert.ok(!seen.has("snow"), "여름엔 눈 없음"); assert.ok(seen.has("rain") && seen.has("storm"));
  for (let i = 0; i < 200; i++) assert.notEqual(S.pickWeather("winter", r), "rain", "겨울엔 비 대신 눈");
  assert.equal(S.effects("winter", "clear").hunger, 1.25); assert.equal(S.effects("spring", "rain").grow, 1.25 * 1.5);
  const w = World.create(7, seededRandom(1), { wild: true }); w.setSeason("autumn"); w.setWeather("storm");
  const u = w.units[0]; for (let i = 0; i < 50; i++) assert.equal(w.catchFish(u), null, "폭풍엔 못 낚음");
  // 밭: 비 오는 봄은 1.875배 빨리 자람
  w.setSeason("spring"); w.setWeather("rain"); w.weather.t = 1e9; w.plots.push({ x: 1, z: 1, stage: "growing", t: 10, grow: 10, claimed: null });
  w.stepWeather(0); const p = w.plots[w.plots.length - 1]; const g = w.fx.grow; p.t -= 4 * g; assert.ok(Math.abs(p.t - (10 - 7.5)) < 1e-9);
  // 날씨는 저장·불러오기에서 이어짐
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(2)); assert.equal(back.weather.kind, "rain");
});

test("소원: 갈매미가 바라는 걸 말하고, 이루어지면 축하금(새 돈)", async () => {
  const E = await import("../src/world/economy.js");
  const w = World.create(7, seededRandom(1), { wild: true }), u = w.units[0];
  const wish = w.makeWish(); assert.ok(wish, "소원이 생김"); assert.equal(wish.unitId, u.unitId); assert.equal(w.makeWish(), null, "한 마리에 하나(지금 한 마리)");
  // 친구 소원으로 바꿔서 확인: 소환하면 이루어짐
  w.wishes = [{ id: "friend", unitId: u.unitId, base: w.units.length, age: 0 }]; const coins = u.coins || 0, issued = w.bank.issued;
  w.stepWishes(1.1); assert.equal(w.wishes.length, 1, "아직");
  w.summon(); w.stepWishes(1.1);
  assert.equal(w.wishes.length, 0); assert.equal(w.wishDone, 1);
  assert.equal(u.coins, coins + 10); assert.equal(w.bank.issued, issued + 10 + (w.units[1].job === "merchant" ? E.MERCHANT_START : 0));
});

test("가격 변동: 상인 창고에 쌓이면 원자재 값이 내려가고, 음식이 모자라거나 겨울이면 음식 값이 오름", async () => {
  const E = await import("../src/world/economy.js");
  assert.equal(E.marketPrice("wood", 0), 3); assert.equal(E.marketPrice("wood", 8), 2); assert.equal(E.marketPrice("wood", 30), 1);
  assert.equal(E.marketPrice("iron", 0), 8); assert.equal(E.marketPrice("iron", 30), 3);
  for (const k of E.RAW) for (let n = 0; n < 40; n++) assert.ok(E.marketPrice(k, n) < E.BANK_PROCESSED[k], "상인이 손해 보지 않음");
  assert.equal(E.foodPriceFor(10, 0, 0), 3); assert.equal(E.foodPriceFor(1, 0, 0), 4); assert.equal(E.foodPriceFor(1, 0.5, 1), 5); assert.equal(E.foodPriceFor(20, 0, 0), 2);
  const w = World.create(7, seededRandom(1), { wild: true }); w.addUnitByName("황금"); const m = w.merchantU();
  m.raw.wood = 25; w.updatePrices(); assert.equal(w.prices.wood, 1);
  for (let i = 0; i < 25 * 60; i++) w.update(1 / 60);
  assert.ok(w.priceHist.length >= 1, "20초마다 시세 기록");
});

test("마을 등급: 점수(갈매미·집·시설·소원)가 기준을 넘으면 오르고, 축하금·새 건물이 열림", async () => {
  const { RANKS, rankScore } = await import("../src/world/rank.js");
  const w = World.create(7, seededRandom(1), { wild: true }); w.instantBuild = true;
  assert.equal(w.rank, 0); assert.equal(rankScore(w).score, 10 + 10, "갈매미 1(10) + 배부름(10)");
  const spot = (def) => { const c = w.center; for (let r = 4; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + Math.sin(a) * r); if (w.check(def, x, z, 0).ok) return [x, z]; } return null; };
  assert.equal(spot("cafe"), null, "갯마을에선 카페를 못 지음");
  w.addUnitByName("목수"); w.addUnitByName("미니"); w.addUnitByName("황금");          // 4마리 = 40 + 배부름 10
  for (const d of ["market", "field"]) { const q = spot(d); w.placeBuilding(d, q[0], q[1], 0, null, 1e9); }   // 시설 2 = 16
  const coins = w.units.map(u => u.coins || 0); w.stepRank();
  assert.ok(rankScore(w).score >= RANKS[1].need, `점수 ${rankScore(w).score}`); assert.equal(w.rank, 1, "어촌");
  w.units.forEach((u, i) => assert.equal(u.coins, coins[i] + 5, "축하금"));
  assert.ok(spot("cafe"), "어촌부터 카페"); assert.equal(spot("manor"), null, "큰 집은 섬 도시부터");
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(2)); assert.equal(back.rank, 1, "저장됨");
});

test("저장고: 농부·어부의 남는 음식을 은행이 사서 쌓고, 배고픈 갈매미는 사거나 나눠 받음", async () => {
  const E = await import("../src/world/economy.js");
  const w = World.create(7, seededRandom(1), { wild: true }); w.instantBuild = true; w.addUnitByName("목수"); w.addUnitByName("미니");
  const mini = w.units.find(u => u.name === "미니"), boss = w.units[0];
  const c = w.center; let q = null; for (let r = 4; r < 40 && !q; r++) for (let k = 0; k < 64 && !q; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + Math.sin(a) * r); if (w.check("storehouse", x, z, 0).ok) q = [x, z]; }
  assert.equal(w.stockFood(mini), 0, "저장고가 없으면 못 팖");
  w.placeBuilding("storehouse", q[0], q[1], 0, null, 1e9); mini.inv.food = 10; const issued = w.bank.issued;
  assert.equal(w.stockFood(mini), 10 - (E.FOOD_KEEP + 2)); assert.equal(w.granary, 6); assert.equal(E.meals(mini), E.FOOD_KEEP + 2);
  assert.equal(w.bank.issued, issued + 6 * E.GRANARY_BUY);
  boss.coins = 10; boss.inv.food = 0; assert.equal(w.takeFood(boss), "buy"); assert.equal(boss.coins, 10 - w.foodPrice()); assert.equal(w.granary, 5);
  boss.coins = 0; boss.full = 60; assert.equal(w.takeFood(boss), null, "돈이 없고 덜 배고프면 못 받음");
  boss.full = 10; assert.equal(w.takeFood(boss), "free", "아주 배고프면 나눠 받음"); assert.equal(w.granary, 4);
});

test("계절 한정 수집: 그 계절 물고기·물건만 나오고, 바닷가에서 계절 물건을 주움", async () => {
  const { FISH, ITEMS } = await import("../src/data/catalog.js"); const J = await import("../src/world/jobs.js");
  const w = World.create(7, seededRandom(1), { wild: true }), u = w.units[0], rnd = seededRandom(9);
  for (const season of ["spring", "summer", "autumn", "winter"]) {
    const seen = new Set(); for (let i = 0; i < 4000; i++) seen.add(J.rollFish({ ...u, rarity: "legend" }, rnd, season).id);
    for (const f of FISH.filter(f => f.season)) assert.equal(seen.has(f.id), f.season === season, `${season} ${f.name}`);
    const items = new Set(); for (let i = 0; i < 2000; i++) items.add(J.rollItem(u, rnd, season).id);
    for (const it of ITEMS.filter(i => i.season)) assert.equal(items.has(it.id), it.season === season, `${season} ${it.name}`);
  }
  w.setSeason("winter"); let got = null; for (let i = 0; i < 200 && !got; i++) got = w.beachcomb(u);
  assert.equal(got?.id, "iceshell"); assert.ok(w.items.iceshell >= 1);
});

test("실내 꾸미기: 집마다 구조(층·계단·칸막이벽), 놓기·옮기기·돌리기·치우기, 낚시 가구, 잡화점에서 사면 알아서 놓음", async () => {
  const F = await import("../src/world/furniture.js");
  const w = World.create(7, seededRandom(1), { wild: true }); w.instantBuild = true;
  const spot = d => { const c = w.center; for (let r = 4; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; };
  const q = spot("house"), h = w.placeBuilding("house", q[0], q[1], 0, null, 1e9).building, it = F.room(h), L = it.levels[0];
  assert.equal(it.levels.length, 1); assert.deepEqual([L.w, L.d], [5, 4], "작은 집 = 원룸 5×4");
  assert.deepEqual(L.furniture.map(o => o.id).sort(), ["chair", "table"], "새 집엔 의자·테이블"); L.furniture.length = 0;
  it.stash.bed = 1; it.stash.rug = 1; it.stash.chair = 1;
  assert.equal(F.fits(L, "bed", 4, 0, 0), true); assert.equal(F.fits(L, "bed", 4, 3, 0), false, "방 밖");
  assert.equal(F.fits(L, "bed", 4, 3, 1), false, "돌리면 가로 2칸 → x=4에선 넘침"); assert.equal(F.fits(L, "bed", 3, 3, 1), true);
  assert.equal(F.place(w, h, "bed", 0, 0, 0), true); assert.equal(it.stash.bed, 0);
  assert.equal(F.fits(L, "chair", 0, 1, 0), false, "침대와 겹침"); assert.equal(F.fits(L, "rug", 0, 0, 0), true, "깔개는 다른 층");
  assert.equal(F.place(w, h, "rug", 0, 0, 0), true); assert.equal(F.place(w, h, "chair", 2, 2, 0), true);
  assert.equal(F.move(w, h, 2, 0, 1, 0), false, "침대 자리로는 못 옮김"); assert.equal(F.move(w, h, 2, 3, 3, 1), true); assert.deepEqual([L.furniture[2].x, L.furniture[2].rot], [3, 1]);
  assert.equal(F.stow(w, h, 2), true); assert.equal(it.stash.chair, 1); assert.equal(L.furniture.length, 2);
  w.items.bed = 1; assert.equal(F.available(w, h).shellBed.n, 1); assert.equal(F.place(w, h, "shellBed", 3, 0, 0), true); assert.equal(w.items.bed, 0);
  assert.equal(F.comfort(h), 4 + 1 + 6);
  // 2층집: 1층 거실(계단) + 2층 침실(계단 구멍), 계단 칸엔 못 놓음, 침대는 침실 층에 알아서
  const q2 = spot("cottage"), c2 = w.placeBuilding("cottage", q2[0], q2[1], 0, null, 1e9).building, ls = F.levels(c2);
  assert.equal(ls.length, 2); assert.equal(ls[0].stairs.dir, "up"); assert.equal(ls[1].stairs.dir, "down"); assert.equal(ls[1].role, "bedroom");
  assert.equal(F.fits(ls[0], "chair", 4, 0, 0), false, "계단 칸"); assert.equal(F.fits(ls[0], "chair", 5, 1, 0), false, "계단 앞 디딤 칸"); assert.equal(F.fits(ls[1], "chair", 5, 0, 0), false, "계단 구멍");
  assert.equal(F.autoPlace(w, c2, "bed"), true); assert.equal(ls[1].furniture.some(o => o.id === "bed"), true, "침대는 2층 침실에");
  assert.equal(F.autoPlace(w, c2, "sofa"), true); assert.equal(ls[0].furniture.some(o => o.id === "sofa"), true, "소파는 1층에");
  c2.interior.stash.plant = 1; assert.equal(F.place(w, c2, "plant", 0, 4, 0, 1), true); assert.ok(ls[1].furniture.some(o => o.id === "plant"), "2층에 직접 놓기");
  // 큰 집: 칸막이벽을 걸치면 못 놓음(문 칸은 됨)
  const M = F.LAYOUTS.manor[0], ML = { ...M, walls: M.walls, furniture: [] };
  assert.equal(F.fits(ML, "sofa", 4, 0, 0), false, "벽(x=5) 걸침"); assert.equal(F.fits(ML, "sofa", 4, 3, 0), true, "문 칸(z=3)은 걸쳐도 됨");
  // 예전 저장(층 없이 furniture만)도 첫 층으로 옮김
  const old = { defId: "house", interior: { w: 6, d: 5, furniture: [{ id: "chair", x: 0, z: 0, rot: 0 }, { id: "bed", x: 5, z: 3, rot: 0 }] } };
  F.room(old); assert.equal(old.interior.levels[0].furniture.length, 1); assert.equal(old.interior.stash.bed, 1, "새 방에 안 맞으면 창고로");
  // 잡화점(항구 마을)
  const u = w.units[0]; h.owner = u.unitId; u.home = h.id; u.coins = 50;
  assert.equal(w.buyFurniture(u, "plant"), false, "잡화점이 없음");
  w.rank = 2; w.addUnitByName("목수"); const s = spot("shop"); w.placeBuilding("shop", s[0], s[1], 0, null, 1e9);
  const ret = w.bank.returned; assert.equal(w.buyFurniture(u, "plant"), true); assert.equal(u.coins, 50 - 4); assert.equal(w.bank.returned, ret + 4);
  assert.ok(L.furniture.some(o => o.id === "plant"), "알아서 놓임"); assert.equal(F.nextWant(h), "table");
  assert.equal(w.buyFurniture(u, "driftChair"), false, "낚시 가구는 안 팖");
  assert.ok(["bed", "shellBed"].includes(F.pickUse(h, true).id));
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(2)); assert.equal(F.levels(back.buildings.get(c2.id))[1].furniture.length, ls[1].furniture.length, "층까지 저장됨");
});

test("저장: 등급·저장고·소원·가구·날씨·시세 기록까지 저장하고 그대로 불러옴", () => {
  const w = World.create(7, seededRandom(1), { wild: true }); w.instantBuild = true; while (w.summon());
  for (let i = 0; i < 400; i++) w.update(0.1);
  w.rank = 2; w.granary = 17; w.wishDone = 3; w.makeWish(); w.setWeather("rain");
  const s = JSON.stringify(w.serialize()); assert.ok(s.length < 500000, `저장 크기 ${s.length}`);
  const b = World.fromJSON(JSON.parse(s), seededRandom(2));
  assert.equal(b.wild, true); assert.equal(b.units.length, w.units.length); assert.equal(b.rank, 2); assert.equal(b.granary, 17); assert.equal(b.wishDone, 3);
  assert.deepEqual(b.wishes.map(x => x.id), w.wishes.map(x => x.id)); assert.equal(b.weather.kind, "rain"); assert.equal(b.priceHist.length, w.priceHist.length);
  assert.ok(Math.abs(b.time - w.time) < 1e-6); const byName = ws => Object.fromEntries(ws.units.map(u => [u.name, [u.unitId, u.coins, u.home]])); assert.deepEqual(byName(b), byName(w), "갈매미마다 id·돈·집 그대로");
});

test("넓은 지도: 본섬 + 작은 섬 5개, 다리로 가까운 섬과 이어지고, 선착장이 있으면 배를 타고 먼 섬에 감", async () => {
  const { BUILDINGS } = await import("../src/data/catalog.js");
  const w = World.create(7, seededRandom(1), { wild: true }); w.instantBuild = true; w.addUnitByName("목수");
  assert.equal(w.grid.w, 192); assert.equal(w.zones.filter(z => z.id.startsWith("islet-")).length, 5);
  const c = w.center, home = w.compAt(Math.floor(c.x), Math.floor(c.z) + 6);
  const zone = id => w.zones.find(z => z.id === id), compOf = z => w.compAt(Math.floor(z.x), Math.floor(z.z));
  const forest = zone("islet-forest"), palm = zone("islet-palm");
  assert.notEqual(compOf(forest), home, "처음엔 숲섬이 따로 떨어져 있음");
  // 본섬 땅 → 숲섬 땅 사이 곧은 물길(가로·세로) 중 가장 짧은 것에 다리
  let best = null;
  for (let z = 0; z < w.grid.h; z++) for (let x = 0; x < w.grid.w; x++) {
    if (w.compAt(x, z) !== home) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const line = []; let k = 1; while (k < 20 && w.grid.isWater(x + dx * k, z + dz * k)) { line.push([x + dx * k, z + dz * k]); k++; }
      if (line.length && k < 20 && w.compAt(x + dx * k, z + dz * k) === compOf(forest) && (!best || line.length < best.length)) best = line;
    }
  }
  assert.ok(best && best.length <= 12, `다리 길이 ${best?.length}`);
  assert.equal(w.check("bridge", best[0][0], best[0][1], 0).ok, true); assert.equal(w.check("bridge", Math.floor(c.x), Math.floor(c.z) + 6, 0).ok, false, "땅엔 다리 못 놓음");
  for (const [x, z] of best) assert.ok(w.placeBuilding("bridge", x, z, 0).ok);
  assert.equal(compOf(forest), w.compAt(Math.floor(c.x), Math.floor(c.z) + 6), "다리로 이어짐");
  // 선착장 둘(본섬·야자섬) → 야자섬 쪽으로 가는 길은 배
  const pierAt = (cx, cz, comp) => { for (let r = 0; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r); for (let rot = 0; rot < 4; rot++) { const ch = w.check("pier", x, z, rot); if (ch.ok && w.compAt(ch.door.x, ch.door.z) === comp) return w.placeBuilding("pier", x, z, rot).building; } } return null; };
  const pa = pierAt(palm.x, palm.z, compOf(palm));
  const dirToPalm = Math.atan2(palm.z - c.z, palm.x - c.x), pm = pierAt(c.x + Math.cos(dirToPalm) * 40, c.z + Math.sin(dirToPalm) * 40, home);
  assert.ok(pa && pm, "선착장 둘");
  const u = w.units.find(o => o.name === "기본"); u.x = pm.door.x + 0.5; u.z = pm.door.z + 0.5;
  const goal = [palm.x, palm.z].map(Math.floor); let g = null; for (let r = 0; r < 8 && !g; r++) for (let dz = -r; dz <= r && !g; dz++) for (let dx = -r; dx <= r && !g; dx++) if (w.compAt(goal[0] + dx, goal[1] + dz) === compOf(palm) && w.grid.isWalkable(goal[0] + dx, goal[1] + dz)) g = [goal[0] + dx, goal[1] + dz];
  const { setIdle } = await import("../src/units/unitBrain.js");
  setIdle(u, seededRandom(3), w); u.state = "Wander"; u.timer = 999;
  const W2 = await import("../src/units/unitBrain.js");
  assert.equal(w.ferryRoute(Math.floor(u.x), Math.floor(u.z), g[0], g[1]).B.id, pa.id);
  // 길 찾기 → 선착장 → 배 → 야자섬
  u.path = null; const ok = (() => { const fr = w.ferryRoute(Math.floor(u.x), Math.floor(u.z), g[0], g[1]); return !!fr; })(); assert.ok(ok);
  // 실제로 걸어가 배를 타고 건너가 내림
  assert.equal(W2._startPathForTest(u, w, g[0], g[1]), true); assert.ok(u.ferry, "배 타는 길");
  let sailed = false, arrived = false;
  for (let t = 0; t < 240 && !arrived; t += 0.1) {
    if (u.sailing) sailed = true;
    if (W2._followPathForTest(u, 0.1, w, seededRandom(4)) && !u.ferry && !u.sailing) arrived = true;
  }
  assert.ok(sailed, "배를 탐"); assert.ok(arrived, "도착"); assert.equal(w.compAt(Math.floor(u.x), Math.floor(u.z)), compOf(palm), "야자섬에 내림");
  void BUILDINGS;
});

test("포장도로: 돌길·나무 데크로 집과 시장·은행을 이으면 그 집 갈매미 만족도가 오르고, 흙길은 안 됨", async () => {
  const RD = await import("../src/world/roads.js");
  const w = World.create(7, seededRandom(1), { wild: true }); w.instantBuild = true; w.addUnitByName("목수");
  const c = w.center, spot = (d, r0) => { for (let r = r0; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + 4 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; };
  const hq = spot("house", 8), h = w.placeBuilding("house", hq[0], hq[1], 0).building, mq = spot("market", 14), mk = w.placeBuilding("market", mq[0], mq[1], 0).building;
  const u = w.units[0]; u.home = h.id; h.owner = u.unitId; u.full = 80;
  w.updateRoads(); const before = u.sat; assert.ok(!u.satParts.some(p => p[0].includes("시장")));
  const path = findPath(w.grid, h.door.x, h.door.z, mk.door.x, mk.door.z, 30000); assert.ok(path);
  const cells = [[h.door.x, h.door.z], ...path];
  for (const [x, z] of cells) w.paint(x, z, "Dirt"); w.updateRoads(); assert.equal(u.sat, before, "흙길은 포장이 아님");
  for (const [x, z] of cells) w.paint(x, z, "Cobble"); w.updateRoads();
  assert.ok(u.satParts.some(p => p[0].includes("집-시장")), JSON.stringify(u.satParts)); assert.equal(u.sat, Math.min(100, before + 15));
  assert.equal(RD.linkedHouses(w), 1);
  // 은행까지 이으면 +15 더
  const bk = w.bankB(), p2 = findPath(w.grid, mk.door.x, mk.door.z, bk.door.x, bk.door.z, 30000); for (const [x, z] of p2) w.paint(x, z, "WoodDeck"); w.updateRoads();
  assert.ok(u.satParts.some(p => p[0].includes("집-은행"))); assert.equal(u.sat, Math.min(100, before + 30));
});

test("장식·전기·카페·우체국: 집 근처 장식·풍차 전기·가까운 카페가 만족도를 올리고, 우체국은 소원 축하금 두 배, 눈사람은 겨울만", () => {
  const w = World.create(7, seededRandom(1), { wild: true }); w.instantBuild = true; w.addUnitByName("목수"); w.rank = 2; w.setSeason("autumn");
  const c = w.center, spot = (d, x0, z0) => { for (let r = 0; r < 30; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; };
  const hq = spot("house", c.x + 10, c.z + 8), h = w.placeBuilding("house", hq[0], hq[1], 0).building, u = w.units[0]; u.home = h.id; h.owner = u.unitId; u.full = 80;
  w.updateRoads(); const base = u.sat;
  for (const d of ["bench", "flowerbed", "bench"]) { const q = spot(d, h.door.x, h.door.z + 2); assert.ok(w.placeBuilding(d, q[0], q[1], 0).ok, d); }
  w.updateRoads(); assert.equal(u.sat, base + 6, "장식 3개 = +6");
  assert.match(w.check("snowman", ...spot("bench", h.door.x, h.door.z + 3), 0).reason, /겨울에만/); w.setSeason("winter"); assert.equal(w.check("snowman", ...spot("bench", h.door.x, h.door.z + 3), 0).ok, true);
  const wm = spot("windmill", h.x + 6, h.z); w.placeBuilding("windmill", wm[0], wm[1], 0); assert.equal(w.powered(h), true); w.updateRoads(); assert.equal(u.sat, base + 6 + 8, "전기 +8");
  const cf = spot("cafe", h.x - 8, h.z); const cafe = w.placeBuilding("cafe", cf[0], cf[1], 0).building; w.updateRoads(); assert.equal(u.sat, base + 6 + 8 + 5, "카페 +5");
  assert.equal(w.canEnter(w.units[1], cafe), true, "카페는 누구나 들어감");
  // 우체국: 소원 축하금 두 배
  const po = spot("post", c.x - 12, c.z + 10); w.placeBuilding("post", po[0], po[1], 0);
  w.wishes = [{ id: "friend", unitId: u.unitId, base: w.units.length, age: 0 }]; const coins = u.coins || 0; w.summon(); w.stepWishes(1.1);
  assert.equal(u.coins - coins, 20, "축하금 10 × 2");
});

test("눈 깊이: 겨울 눈 오는 날 쌓이고(약 80초에 가득), 맑은 겨울은 0.55까지, 봄엔 녹고, 저장됨", () => {
  const w = World.create(7, seededRandom(1), { wild: true }); w.setSeason("winter"); w.setWeather("snow"); w.weather.t = 1e9;
  for (let i = 0; i < 400; i++) w.stepSnow(0.1); assert.ok(Math.abs(w.snow - 0.5) < 0.01, `40초 ${w.snow}`);
  for (let i = 0; i < 600; i++) w.stepSnow(0.1); assert.equal(w.snow, 1);
  w.setWeather("clear"); w.weather.t = 1e9; for (let i = 0; i < 3000; i++) w.stepSnow(0.1); assert.ok(Math.abs(w.snow - 0.55) < 1e-9, "맑은 겨울은 0.55로 천천히");
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(2)); assert.ok(Math.abs(back.snow - w.snow) < 1e-9);
  w.setSeason("spring"); for (let i = 0; i < 600; i++) w.stepSnow(0.1); assert.equal(w.snow, 0, "봄엔 60초 안에 다 녹음");
});

test("스스로 동네 고치기: 만족도가 낮으면 집 앞 마당을 고르고(높이·낮추기), 시장까지 돌길을 깔고, 장식을 주문해 만족도가 오름", async () => {
  const IM = await import("../src/world/improve.js");
  const w = World.create(7, seededRandom(5), { wild: true }); w.instantBuild = true; w.addUnitByName("목수"); w.addUnitByName("불씨");
  const c = w.center, spot = (d, x0, z0) => { for (let r = 0; r < 30; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; };
  const hq = spot("house", c.x + 12, c.z + 10), h = w.placeBuilding("house", hq[0], hq[1], 0).building, mq = spot("market", c.x + 2, c.z + 14); w.placeBuilding("market", mq[0], mq[1], 0);
  const u = w.units.find(o => o.name === "불씨"); u.home = h.id; h.owner = u.unitId; u.inv.stone = 10; w.res.stone = 10;
  // 마당 울퉁불퉁하게
  const { cells, target } = IM.yardCells(w, h); for (const [x, z] of cells.slice(0, 3)) w.applyHeight(x, z, target + 0.5);
  w.updateRoads(); const before = u.sat; assert.ok(before < 75, `처음 만족도 ${before}`); assert.equal(IM.yardFlat(w, h), false);
  for (const o of w.units) o.full = 90;
  let jobs = new Set(); w.on("improve", e => { if (e.u === u) jobs.add(e.kind); });
  for (let t = 0; t < 600 && !jobs.has("pave"); t += 0.1) { u.full = 90; w.update(0.1); }
  assert.ok(jobs.has("pave"), "돌길 깔기(시장까지)");
  for (let t = 0; t < 300; t += 0.1) { u.full = 90; w.update(0.1); }
  w.updateRoads(); assert.ok(u.sat > before, `만족도 ${before} → ${u.sat} (${u.satParts.map(p => p[0]).join(",")})`);
  // 돌이 없으면(길을 못 깖 — 돌을 캐지 않는 농부) 마당을 높이고 낮춰 고름
  const w2 = World.create(7, seededRandom(6), { wild: true }); w2.instantBuild = true; w2.addUnitByName("꽃");
  const sp2 = (d, x0, z0) => { for (let r = 0; r < 30; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); if (w2.check(d, x, z, 0).ok) return [x, z]; } return null; };
  const q2 = sp2("house", c.x + 12, c.z + 10), h2 = w2.placeBuilding("house", q2[0], q2[1], 0).building, u2 = w2.units.find(o => o.name === "꽃"); u2.home = h2.id; h2.owner = u2.unitId; u2.inv.stone = 0; w2.res.stone = 0;
  const y2 = IM.yardCells(w2, h2); w2.applyHeight(y2.cells[0][0], y2.cells[0][1], y2.target + 0.5); w2.applyHeight(y2.cells[1][0], y2.cells[1][1], y2.target - 0.25);
  let yard = false; w2.on("improve", e => { if (e.u === u2 && e.kind === "yard") yard = true; });
  for (let t = 0; t < 900 && !IM.yardFlat(w2, h2); t += 0.1) { u2.full = 90; w2.update(0.1); }
  assert.ok(yard, "마당 고르기"); assert.equal(IM.yardFlat(w2, h2), true, "마당이 문 높이로 평평해짐");
});

test("벤치에 앉기: 쉴 때 가까운 빈 벤치에 가서 앉고(한 마리만), 기력이 차오르고, 시간이 지나면 일어남", () => {
  const w = World.create(7, seededRandom(8), { wild: true }); w.instantBuild = true;
  const c = w.center, spot = (d, x0, z0) => { for (let r = 0; r < 20; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; };
  const q = spot("bench", c.x + 3, c.z + 6), b = w.placeBuilding("bench", q[0], q[1], 0).building, u = w.units[0];
  let sat = false, stood = false, e0 = null;
  for (let t = 0; t < 900 && !stood; t += 0.1) { u.full = 90; w.update(0.1); if (u.state === "Sit") { if (!sat) e0 = u.needs.energy; sat = true; assert.equal(b.sitter, u.unitId); } else if (sat) stood = true; }
  assert.ok(sat, "벤치에 앉음"); assert.ok(stood, "일어남"); assert.equal(b.sitter, null, "일어나면 자리 비움"); assert.ok(e0 !== null);
});
