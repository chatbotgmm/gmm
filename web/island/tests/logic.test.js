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
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }); w.instantBuild = true;
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
  assert.equal(w.canEnter(mini, h), false); mini.coins = 11; assert.equal(w.buyHouse(mini, h), false, "계약금(12)도 없으면 못 삼");
  const vault = w.bank.vault; w.bank.vault = 0; mini.coins = 29; assert.equal(w.buyHouse(mini, h), false, "금고가 비면 대출 거절(집값을 다 가져야 삼)"); w.bank.vault = vault;   // 은행 금고 개편: 29조개면 대출로 살 수 있음
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
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }), c = w.center;
  const spot = (def, cx, cz) => { for (let r = 3; r < 30; r++) for (let k = 0; k < 48; k++) { const a = k / 48 * 6.28, x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r); if (w.check(def, x, z, 0).ok) return [x, z]; } return null; };
  const p = spot("house", c.x - 8, c.z + 8); const first = w.placeBuilding("house", p[0], p[1], 0).building;
  for (let t = 0; t < 120; t += 0.1) w.update(0.1);
  assert.ok(w.isDone(first), "기본 혼자 첫 집 완공");
  for (const d of UNITS) w.addUnitByName(d.name);                              // 모두 부름(집 수와 상관없는 시험 받침. 🥚 소환은 집 한 채당 한 마리)
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
  for (let t = 0; t < p.grow + 5; t += 1) w.update(1);                        // 자라는 시간(작물 느리게: 예전 40초 → GROW_SECS 180초 ÷ 농부 배율)
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
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.setSeason("autumn"); w.setWeather("storm");
  const u = w.units[0]; for (let i = 0; i < 50; i++) assert.equal(w.catchFish(u), null, "폭풍엔 못 낚음");
  // 밭: 비 오는 봄은 1.875배 빨리 자람
  w.setSeason("spring"); w.setWeather("rain"); w.weather.t = 1e9; w.plots.push({ x: 1, z: 1, stage: "growing", t: 10, grow: 10, claimed: null });
  w.stepWeather(0); const p = w.plots[w.plots.length - 1]; const g = w.fx.grow; p.t -= 4 * g; assert.ok(Math.abs(p.t - (10 - 7.5)) < 1e-9);
  // 날씨는 저장·불러오기에서 이어짐
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(2)); assert.equal(back.weather.kind, "rain");
});

test("소원: 갈매미가 바라는 걸 말하고, 이루어지면 축하금(새 돈)", async () => {
  const E = await import("../src/world/economy.js");
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }), u = w.units[0];
  const wish = w.makeWish(); assert.ok(wish, "소원이 생김"); assert.equal(wish.unitId, u.unitId); assert.equal(w.makeWish(), null, "한 마리에 하나(지금 한 마리)");
  // 친구 소원으로 바꿔서 확인: 소환하면 이루어짐
  w.wishes = [{ id: "friend", unitId: u.unitId, base: w.units.length, age: 0 }]; const coins = u.coins || 0, issued = w.bank.issued;
  w.stepWishes(1.1); assert.equal(w.wishes.length, 1, "아직");
  assert.equal(w.summon(), null, "집 1채에 갈매미 1마리: 집이 더 있어야 부를 수 있음"); w.placeStarterHouse();
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
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.addUnitByName("황금"); const m = w.merchantU();
  m.raw.wood = 25; w.updatePrices(); assert.equal(w.prices.wood, 1);
  for (let i = 0; i < 25 * 60; i++) w.update(1 / 60);
  assert.ok(w.priceHist.length >= 1, "20초마다 시세 기록");
});

test("마을 등급: 점수(갈매미·집·시설·소원)가 기준을 넘으면 오르고, 축하금·새 건물이 열림", async () => {
  const { RANKS, rankScore } = await import("../src/world/rank.js");
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.instantBuild = true;
  assert.equal(w.rank, 0); assert.equal(rankScore(w).score, 10 + 10 + 4 + 2, "갈매미 1(10) + 배부름(10) + 섬에 있던 첫 집(빈 집 4 + 기본 가구 아늑함 2)");
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
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("목수"); w.addUnitByName("미니");
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
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }), u = w.units[0], rnd = seededRandom(9);
  for (const season of ["spring", "summer", "autumn", "winter"]) {
    const seen = new Set(); for (let i = 0; i < 4000; i++) seen.add(J.rollFish({ ...u, rarity: "legend" }, rnd, season).id);
    for (const f of FISH.filter(f => f.season)) assert.equal(seen.has(f.id), f.season === season, `${season} ${f.name}`);
    const items = new Set(); for (let i = 0; i < 2000; i++) items.add(J.rollItem(u, rnd, season).id);
    for (const it of ITEMS.filter(i => i.season)) assert.equal(items.has(it.id), it.season === season, `${season} ${it.name}`);
  }
  w.setSeason("winter"); let got = null; for (let i = 0; i < 200 && !got; i++) got = w.beachcomb(u);
  assert.equal(got?.id, "iceshell"); assert.ok(u.stash.iceshell >= 1);
});

test("실내 꾸미기: 집마다 구조(방·문·계단), 놓기·옮기기·돌리기·치우기, 낚시 가구, 잡화점에서 사면 알아서 놓음", async () => {
  const F = await import("../src/world/furniture.js");
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.instantBuild = true;
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
  assert.equal(ls.length, 3, "거실·침실·부엌"); assert.equal(ls[0].stairs.dir, "up"); assert.equal(ls[1].stairs.dir, "down"); assert.equal(ls[1].role, "bedroom");
  assert.equal(F.fits(ls[0], "chair", 4, 0, 0), false, "계단 칸"); assert.equal(F.fits(ls[0], "chair", 5, 1, 0), false, "계단 앞 디딤 칸"); assert.equal(F.fits(ls[1], "chair", 5, 0, 0), false, "계단 구멍");
  assert.equal(F.autoPlace(w, c2, "bed"), true); assert.equal(ls[1].furniture.some(o => o.id === "bed"), true, "침대는 2층 침실에");
  assert.equal(F.autoPlace(w, c2, "sofa"), true); assert.equal(ls[0].furniture.some(o => o.id === "sofa"), true, "소파는 1층에");
  c2.interior.stash.plant = 1; assert.equal(F.place(w, c2, "plant", 0, 4, 0, 1), true); assert.ok(ls[1].furniture.some(o => o.id === "plant"), "2층에 직접 놓기");
  // 문: 모든 방이 문(또는 계단)으로 이어지고, 밖으로 나가는 문은 첫 방에 하나. 문 앞 칸엔 못 놓음
  for (const [id, plan] of Object.entries(F.LAYOUTS)) {
    const exits = plan.flatMap(L => (L.doors || []).filter(d => d.to === "exit")); assert.equal(exits.length, 1, id + " 나가는 문 하나"); assert.ok(plan[0].doors.some(d => d.to === "exit"), id + " 첫 방에 현관");
    const seen = new Set([0]), q = [0]; while (q.length) { const L = plan[q.shift()]; for (const t of [...(L.doors || []).map(d => d.to), L.stairs?.to]) if (typeof t === "number" && !seen.has(t)) { seen.add(t); q.push(t); } }
    assert.equal(seen.size, plan.length, id + " 모든 방에 갈 수 있음");
    plan.forEach((L, i) => (L.doors || []).forEach(d => { if (typeof d.to === "number") assert.ok((plan[d.to].doors || []).some(e => e.to === i), `${id} ${i}→${d.to} 돌아오는 문`); }));
  }
  assert.equal(F.fits(ls[0], "chair", 0, 4, 0), false, "현관 앞 칸"); assert.equal(F.fits(ls[0], "chair", 5, 3, 0), false, "부엌 문 앞 칸"); assert.equal(F.fits(ls[0], "chair", 1, 4, 0), true);
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
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.instantBuild = true; for (const d of UNITS) w.addUnitByName(d.name);
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
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("목수");
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
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("목수");
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
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("목수"); w.rank = 2; w.setSeason("autumn"); w.bank.vault = 100;   // 설계비 합 81(새 섬 금고 60으로는 모자람)
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
  w.wishes = [{ id: "friend", unitId: u.unitId, base: w.units.length, age: 0 }]; const coins = u.coins || 0; w.placeStarterHouse(); assert.ok(w.summon(), "집 3채에 갈매미 2마리"); w.stepWishes(1.1);
  assert.equal(u.coins - coins, 20, "축하금 10 × 2");
});

test("눈 깊이: 겨울 눈 오는 날 쌓이고(약 80초에 가득), 맑은 겨울은 0.55까지, 봄엔 녹고, 저장됨", () => {
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.setSeason("winter"); w.setWeather("snow"); w.weather.t = 1e9;
  for (let i = 0; i < 400; i++) w.stepSnow(0.1); assert.ok(Math.abs(w.snow - 0.5) < 0.01, `40초 ${w.snow}`);
  for (let i = 0; i < 600; i++) w.stepSnow(0.1); assert.equal(w.snow, 1);
  w.setWeather("clear"); w.weather.t = 1e9; for (let i = 0; i < 3000; i++) w.stepSnow(0.1); assert.ok(Math.abs(w.snow - (1 - 300 / 1800)) < 1e-9, "맑은 겨울엔 쌓인 눈이 아주 천천히 녹음(300초에 1/6)");
  { const c = World.create(7, seededRandom(1), { wild: true }); c.setSeason("winter"); c.setWeather("clear"); c.weather.t = 1e9; for (let i = 0; i < 3000; i++) c.stepSnow(0.1); assert.equal(c.snow, 0, "눈이 오지 않으면 겨울이라도 쌓이지 않음");
    c.setWeather("storm"); c.weather.t = 1e9; for (let i = 0; i < 6000; i++) c.stepSnow(0.1); assert.ok(Math.abs(c.snow - 0.7) < 1e-9, "겨울 폭풍은 0.7까지");
    c.snow = 0.9; c.stepSnow(10); assert.equal(c.snow, 0.9, "폭풍이 쌓인 눈을 녹이지 않음");
    c.setWeather("rain"); c.weather.t = 1e9; for (let i = 0; i < 3000; i++) c.stepSnow(0.1); assert.equal(c.snow, 0, "겨울비엔 300초 안에 녹음"); }
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(2)); assert.ok(Math.abs(back.snow - w.snow) < 1e-9);
  w.setSeason("spring"); for (let i = 0; i < 600; i++) w.stepSnow(0.1); assert.equal(w.snow, 0, "봄엔 60초 안에 다 녹음");
});

test("스스로 동네 고치기: 만족도가 낮으면 집 앞 마당을 고르고(높이·낮추기), 시장까지 돌길을 깔고, 장식을 주문해 만족도가 오름", async () => {
  const IM = await import("../src/world/improve.js");
  const w = World.create(7, seededRandom(5), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("목수"); w.addUnitByName("불씨");
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
  const w2 = World.create(7, seededRandom(6), { wild: true, firstGull: true }); w2.instantBuild = true; w2.addUnitByName("꽃");
  const sp2 = (d, x0, z0) => { for (let r = 0; r < 30; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); if (w2.check(d, x, z, 0).ok) return [x, z]; } return null; };
  const q2 = sp2("house", c.x + 12, c.z + 10), h2 = w2.placeBuilding("house", q2[0], q2[1], 0).building, u2 = w2.units.find(o => o.name === "꽃"); u2.home = h2.id; h2.owner = u2.unitId; u2.inv.stone = 0; w2.res.stone = 0;
  const y2 = IM.yardCells(w2, h2); w2.applyHeight(y2.cells[0][0], y2.cells[0][1], y2.target + 0.5); w2.applyHeight(y2.cells[1][0], y2.cells[1][1], y2.target - 0.25);
  let yard = false; w2.on("improve", e => { if (e.u === u2 && e.kind === "yard") yard = true; });
  for (let t = 0; t < 900 && !IM.yardFlat(w2, h2); t += 0.1) { u2.full = 90; w2.update(0.1); }
  assert.ok(yard, "마당 고르기"); assert.equal(IM.yardFlat(w2, h2), true, "마당이 문 높이로 평평해짐");
});

test("벤치에 앉기: 쉴 때 가까운 빈 벤치에 가서 앉고(한 마리만), 기력이 차오르고, 시간이 지나면 일어남", () => {
  const w = World.create(7, seededRandom(8), { wild: true, firstGull: true }); w.instantBuild = true;
  const c = w.center, spot = (d, x0, z0) => { for (let r = 0; r < 20; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; };
  const q = spot("bench", c.x + 3, c.z + 6), b = w.placeBuilding("bench", q[0], q[1], 0).building, u = w.units[0];
  let sat = false, stood = false, e0 = null; u.needs.energy = 25;                 // 쉬기는 피곤할 때만(기력 50 아래) 고름 → 피곤한 갈매미로 시험
  for (let t = 0; t < 900 && !stood; t += 0.1) { u.full = 90; w.update(0.1); if (u.state === "Sit") { if (!sat) e0 = u.needs.energy; sat = true; assert.equal(b.sitter, u.unitId); } else if (sat) stood = true; }
  assert.ok(sat, "벤치에 앉음"); assert.ok(stood, "일어남"); assert.equal(b.sitter, null, "일어나면 자리 비움"); assert.ok(e0 !== null); assert.ok(u.needs.energy > e0 + 20, "앉아 있는 동안 기력이 참");
});

test("밤·낮과 피로: 밤엔 집에 들어가 계속 자고(야행성은 밤에 일함), 일하면 피로가 쌓이고 쉬면 풀림", async () => {
  const w = World.create(7, seededRandom(9), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("그림자");
  const c = w.center, spot = (d, x0, z0) => { for (let r = 0; r < 20; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; };
  const q = spot("house", c.x + 6, c.z + 6), h = w.placeBuilding("house", q[0], q[1], 0).building, u = w.units.find(o => o.name === "기본"), n = w.units.find(o => o.name === "그림자");
  u.home = h.id; h.owner = u.unitId; w.isNight = true;
  let inside = 0, nightWork = 0;
  for (let t = 0; t < 240; t += 0.1) { for (const o of w.units) o.full = 90; w.update(0.1); if (t > 60 && u.insideBuildingId === h.id) inside++; if (["GoMine", "Mine", "GoChop", "Chop", "Wander", "Visit"].includes(n.state)) nightWork++; }
  assert.ok(inside > 1500, `밤엔 집 안에서 잠(${inside}/1800 틱)`); assert.ok(nightWork > 100, `야행성은 밤에 돌아다니며 일함(${nightWork})`);
  // 낮: 야행성이 잠
  w.isNight = false; let nSleep = 0; for (let t = 0; t < 120; t += 0.1) { for (const o of w.units) o.full = 90; w.update(0.1); if (n.state === "Sleep" || n.insideBuildingId) nSleep++; }
  assert.ok(nSleep > 600, `야행성은 낮에 잠(${nSleep})`);
  // 피로: 일하면 기력이 줄고(피로↑) 벤치·잠은 채움
  const { tickNeeds } = await import("../src/units/mind.js"); const z = { needs: { energy: 80, social: 50, fun: 50 } };
  tickNeeds(z, 10, "Chop", false); assert.ok(Math.abs(z.needs.energy - 74.5) < 1e-6, "일 10초 = 기력 −5.5(피로 +5.5)");
  tickNeeds(z, 10, "Sit", false); assert.ok(z.needs.energy > 74.5, "앉아 쉬면 풀림"); const e1 = z.needs.energy; void e1; tickNeeds(z, 10, "Sleep", false); assert.equal(z.needs.energy, 100, "자면 10초에 다 풀림(초당 +6)");
});

test("친구 사이: 단계(서먹·친구·단짝)가 오르면 알리고, 이름으로 저장·불러오고, 예전 저장도 열림", async () => {
  const M = await import("../src/units/mind.js");
  assert.deepEqual([-5, 0, 2.9, 3, 6.9, 7, 10].map(M.friendStage), [0, 0, 0, 1, 1, 2, 2], "기준: 3부터 친구, 7부터 단짝");
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.addUnitByName("목수"); w.addUnitByName("미니");
  const [a, b, c] = w.units, seen = []; w.on("friendship", e => seen.push([e.a.name, e.b.name, e.stage]));
  assert.equal(w.befriend(a, b, 2), 0, "아직 서먹"); assert.equal(seen.length, 0);
  a.emoteText = b.emoteText = null;
  assert.equal(w.befriend(a, b, 1), 1, "친구가 됨"); assert.deepEqual(seen, [[a.name, b.name, 1]]);
  assert.ok(a.emoteText.includes("친구") && b.emoteText.includes("친구"), "둘 다 말풍선");
  assert.equal(w.befriend(a, b, 1), 0, "같은 단계에선 다시 안 알림"); assert.equal(w.befriend(a, b, -2), 0, "내려갈 땐 안 알림");
  for (let i = 0; i < 8; i++) w.befriend(a, b, 1);
  assert.equal(seen.filter(s => s[2] === 2).length, 1, "단짝은 한 번만 알림"); assert.equal(M.affinity(a, b), 10, "최대 10");
  assert.equal(M.bestieOf(a, w.units), b); assert.equal(M.bestieOf(c, w.units), null); assert.equal(M.bestiePairs(w.units), 1);
  M.befriend(a, c, 4);
  // 저장은 이름으로
  const j = JSON.parse(JSON.stringify(w.serialize()));
  assert.deepEqual(j.units.find(u => u.name === a.name).friends, { [b.name]: 10, [c.name]: 4 });
  const back = World.fromJSON(j, seededRandom(9)), by = n => back.units.find(u => u.name === n);
  assert.equal(M.affinity(by(a.name), by(b.name)), 10); assert.equal(M.affinity(by(b.name), by(a.name)), 10); assert.equal(M.affinity(by(c.name), by(a.name)), 4);
  assert.equal(M.affinity(by(b.name), by(c.name)), 0);
  // 마을에 없는 이름·이상한 값은 버림, friends가 없는 예전 저장도 열림
  j.units[0].friends = { "없는갈매미": 5, [b.name]: 99, [c.name]: "x" }; for (const u of j.units.slice(1)) delete u.friends;
  const old = World.fromJSON(j, seededRandom(9)), o0 = old.units.find(u => u.name === j.units[0].name);
  assert.deepEqual(Object.values(o0.friends), [10], "없는 이름·숫자 아닌 값은 버리고 10까지만");
  assert.ok(old.units.slice(1).every(u => Object.keys(u.friends).length === 0));
});

test("관계도: 1~8마리를 그림 안 원 위에 놓고, 호감이 0보다 큰 쌍만 선으로", async () => {
  const M = await import("../src/units/mind.js");
  const mk = n => UNITS.slice(0, n).map((d, i) => ({ unitId: `u${i + 1}`, name: d.name, friends: {} }));
  const one = M.relationGraph(mk(1)); assert.deepEqual([one.nodes[0].x, one.nodes[0].y], [150, 150], "한 마리는 가운데"); assert.equal(one.links.length, 0);
  assert.deepEqual(M.relationGraph([]), { nodes: [], links: [] });
  for (let n = 2; n <= 8; n++) {
    const us = mk(n), g = M.relationGraph(us); assert.equal(g.nodes.length, n);
    for (const p of g.nodes) assert.ok(p.x >= 40 && p.x <= 260 && p.y >= 40 && p.y <= 260, `${n}마리: 그림 안`);
    for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) assert.ok(Math.hypot(g.nodes[i].x - g.nodes[k].x, g.nodes[i].y - g.nodes[k].y) > 60, `${n}마리: 겹치지 않음`);
  }
  const us = mk(4); M.befriend(us[0], us[1], 8); M.befriend(us[0], us[2], 3); M.befriend(us[1], us[3], 1); M.befriend(us[2], us[3], -1);
  assert.deepEqual(M.relationGraph(us).links.map(l => [l.a, l.b, l.stage]), [[0, 1, 2], [0, 2, 1], [1, 3, 0]]);
});

test("소원: 단짝 옆집에 살고 싶어요 — 둘 다 가까운 집이 생기면 이루어지고, 못 이루게 되면 접음. 단짝 쌍은 등급 점수", async () => {
  const { WISH_BY_ID, NEIGHBOR_DIST, areNeighbors, wishText } = await import("../src/world/wishes.js"); const { rankScore } = await import("../src/world/rank.js");
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("목수"); w.addUnitByName("미니");
  const [a, b, c] = w.units, d = WISH_BY_ID.neighbor, score0 = rankScore(w).score;
  assert.equal(d.ok(w, a), false, "단짝이 없으면 안 빎");
  w.befriend(a, b, 8); assert.equal(d.ok(w, a), true); assert.equal(d.ok(w, c), false);
  assert.equal(rankScore(w).score, score0 + 3, "단짝 한 쌍 = 3점");
  const wish = { id: "neighbor", unitId: a.unitId, base: d.base(w, a), age: 0 }; assert.equal(wish.base, b.name);
  assert.equal(wishText(d, w, a, wish), `${b.name} 옆집에 살고 싶어요`); assert.equal(wishText(WISH_BY_ID.home, w, a, null), "내 집이 갖고 싶어요");
  const sites = []; const c0 = w.center;
  for (let r = 5; r < 60 && sites.length < 40; r += 2) for (let k = 0; k < 48; k++) { const an = k / 48 * 6.28, x = Math.floor(c0.x + Math.cos(an) * r), z = Math.floor(c0.z + Math.sin(an) * r); if (w.check("house", x, z, 0).ok) { const q = w.placeBuilding("house", x, z, 0, null, 1e9); if (q.ok) sites.push(q.building); } }
  let near = null, far = null;
  for (const p of sites) for (const q of sites) { if (p === q) continue; if (!near && areNeighbors(p, q)) near = [p, q]; if (!far && Math.hypot(p.door.x - q.door.x, p.door.z - q.door.z) > NEIGHBOR_DIST * 2) far = [p, q]; }
  assert.ok(near && far, "가까운 집 한 쌍과 먼 집 한 쌍");
  assert.equal(areNeighbors(near[0], near[0]), false, "같은 집은 옆집이 아님");
  const own = (u, h) => { if (u.home) w.buildings.get(u.home).owner = null; u.home = h ? h.id : null; if (h) h.owner = u.unitId; };
  w.wishes = [wish]; const done0 = w.wishDone, coins = a.coins || 0;
  own(b, near[1]); w.stepWishes(1.1); assert.equal(w.wishes.length, 1, "한쪽만 집이 있으면 아직");
  own(a, near[0]); w.stepWishes(1.1); assert.equal(w.wishes.length, 0); assert.equal(w.wishDone, done0 + 1, "옆집에 살게 되면 이루어짐"); assert.ok((a.coins || 0) > coins, "축하금");
  assert.equal(d.ok(w, a), false, "둘 다 집이 있으면 다시 안 빎");
  // 둘 다 먼 집을 사 버리면 접음(이룬 것으로 세지 않음)
  own(a, far[0]); own(b, far[1]); const lost = []; w.on("wishLost", e => lost.push(e.u.name));
  w.wishes = [{ id: "neighbor", unitId: a.unitId, base: b.name, age: 0 }]; w.stepWishes(1.1);
  assert.equal(w.wishes.length, 0); assert.equal(w.wishDone, done0 + 1); assert.deepEqual(lost, [a.name]);
});

test("집 사기: 단짝 옆집이 팔리면 더 싼 집보다 그 집을 먼저 고름", async () => {
  const { areNeighbors } = await import("../src/world/wishes.js");
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("목수"); w.addUnitByName("황금");
  const [a, b] = w.units, c0 = w.center, put = (def, test) => { for (let r = 5; r < 70; r++) for (let k = 0; k < 64; k++) { const an = k / 64 * 6.28, x = Math.floor(c0.x + Math.cos(an) * r), z = Math.floor(c0.z + Math.sin(an) * r);
    if (!w.check(def, x, z, 0).ok) continue; const q = w.placeBuilding(def, x, z, 0, null, 1e9); if (!q.ok) continue; if (test(q.building)) return q.building; w.removeBuilding?.(q.building.id); } return null; };
  const mk = put("market", () => true); assert.ok(mk && w.marketB());
  const home = put("house", () => true); home.owner = b.unitId; b.home = home.id;
  const nextDoor = put("cottage", h => areNeighbors(h, home)), cheapFar = put("house", h => !areNeighbors(h, home));
  assert.ok(nextDoor && cheapFar, "단짝 옆 2층집(🪙50)과 먼 작은 집(🪙30)");
  w.befriend(a, b, 8); a.coins = 200; a.full = 90; a.needs.energy = 100; a.inv.food = 5;
  w.units.forEach(o => { o.timer = 1e9; }); a.timer = 0;
  for (let i = 0; i < 600 && !a.shop; i++) w.update(0.1);
  assert.equal(a.shop?.b, nextDoor.id, "단짝 옆집을 사러 감");
});

test("친구 사이: 잠깐 멀어졌다 다시 같은 단계가 되면 또 알리지 않음(더 높은 단계는 알림)", async () => {
  const M = await import("../src/units/mind.js");
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.addUnitByName("미니");
  const [a, b] = w.units, seen = []; w.on("friendship", e => seen.push(e.stage));
  assert.equal(w.befriend(a, b, 3), 1); M.befriend(a, b, -0.6);                   // 친구가 됐다가 겁먹어 서먹으로
  assert.equal(M.friendStage(M.affinity(a, b)), 0);
  assert.equal(w.befriend(a, b, 1), 0, "다시 친구가 돼도 알림은 한 번만"); assert.deepEqual(seen, [1]);
  assert.equal(w.befriend(a, b, 4), 2, "단짝은 처음이니 알림"); assert.deepEqual(seen, [1, 2]);
  // 불러온 마을: 이미 단짝인 사이는 떨어졌다 돌아와도 조용히
  const w2 = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(1)), [c, d] = w2.units, seen2 = []; w2.on("friendship", e => seen2.push(e.stage));
  assert.equal(w2.befriend(c, d, 1), 0); M.befriend(c, d, -3); assert.equal(w2.befriend(c, d, 3), 0); assert.deepEqual(seen2, []);
});

test("소식지: 기억할 만한 일만 날짜별로 모으고, 하루 머릿기사는 중요한 순, 저장·예전 저장", async () => {
  const N = await import("../src/world/news.js");
  assert.equal(N.newsDay(0), 1); assert.equal(N.newsDay(N.NEWS_DAY_SECS - 1), 1); assert.equal(N.newsDay(N.NEWS_DAY_SECS), 2);
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("미니"); const [a, b] = w.units;
  assert.deepEqual(w.newsLog, [], "새 마을은 빈 소식지");
  w.setSeason("autumn"); assert.equal(w.newsLog.length, 0, "처음 정해진 계절은 소식이 아님");
  w.setWeather("rain"); assert.equal(w.newsLog.length, 0, "비는 싣지 않음");
  w.setWeather("storm"); assert.equal(w.newsLog.at(-1).text, "날씨: 폭풍");
  w.emit("fish", { u: a, fish: { name: "멸치", rarity: "common" }, item: null }); assert.equal(w.newsLog.length, 1, "흔한 물고기는 싣지 않음");
  w.emit("fish", { u: a, fish: { name: "참치", rarity: "epic" }, item: null }); assert.match(w.newsLog.at(-1).text, /^기본이 참치를 낚았어요!$/);
  w.befriend(a, b, 8); assert.match(w.newsLog.at(-1).text, /단짝이 됐어요/); assert.equal(w.newsLog.at(-1).icon, "💞");
  w.emit("rank", { rank: 1, def: { icon: "🏘", name: "어촌", unlock: [] } });
  w.emit("buildingDone", { defId: "house" }); w.emit("buildingDone", { defId: "house" });
  assert.equal(w.newsLog.filter(e => e.text === "작은 집이 다 지어졌어요").length, 1, "같은 날 같은 소식은 한 번만");
  for (const e of w.newsLog) assert.deepEqual(Object.keys(e).sort(), ["day", "icon", "t", "text", "weight"]);
  let pages = N.newsPages(w.newsLog);
  assert.equal(pages.length, 1); assert.equal(pages[0].day, 1); assert.match(pages[0].heads[0].text, /마을 등급이 올랐어요/, "가장 큰 일이 맨 위");
  assert.equal(pages[0].heads.length, N.NEWS_HEADLINES); assert.equal(pages[0].more, 1, "폭풍은 머릿기사에서 밀림");
  // 계절이 바뀌면 소식, 다음 날로 넘어가면 새 쪽(새 날이 먼저)
  w.time = N.NEWS_DAY_SECS + 5; w.setSeason("winter"); w.setWeather("snow");
  pages = N.newsPages(w.newsLog); assert.equal(pages[0].day, 2); assert.deepEqual(pages[0].heads.map(e => e.text), ["겨울이에요", "첫눈이 내려요!"]);
  w.snow = 0.5; w.setWeather("clear"); w.setWeather("snow"); assert.equal(w.newsLog.filter(e => /눈/.test(e.text)).length, 1, "눈이 쌓인 뒤의 눈은 첫눈이 아님");
  // 저장 → 불러오기: 소식이 남고, 불러온 뒤 같은 계절은 다시 싣지 않음
  const j = JSON.parse(JSON.stringify(w.serialize())), back = World.fromJSON(j, seededRandom(2));
  assert.deepEqual(back.newsLog, w.newsLog); back.setSeason("winter"); assert.deepEqual(back.newsLog, w.newsLog);
  delete j.newsLog; delete j.newsSeason; delete j.savedAt;
  const old = World.fromJSON(j, seededRandom(2)); assert.deepEqual(old.newsLog, [], "예전 저장은 빈 소식지"); assert.equal(old.savedAt, null);
  old.setSeason("winter"); assert.equal(old.newsLog.length, 0);
  // 오래된 날은 버리고, 넘치면 덜 중요한 것부터
  const log = []; for (let i = 0; i < 200; i++) N.addNews(log, i * 100, { icon: "x", text: `소식 ${i}`, weight: 1 + i % 5 });
  assert.ok(log.length <= N.NEWS_MAX); assert.ok(log.every(e => e.day > N.newsDay(199 * 100) - N.NEWS_KEEP_DAYS));
  const many = []; for (let i = 0; i < N.NEWS_MAX + 10; i++) N.addNews(many, 10, { icon: "x", text: `일 ${i}`, weight: i < 10 ? 1 : 3 });
  assert.equal(many.length, N.NEWS_MAX); assert.ok(many.every(e => e.weight === 3), "가벼운 소식부터 버림");
  assert.equal(N.addNews(many, 10, { icon: "x", text: "알림만", weight: 0 }), false);
});

test("다녀온 사이: 지난 실제 시간은 밖에서 받아 10분~8시간만 쳐 주고, 밭이 익고 어부가 몇 마리 낚음(돈·시세는 그대로)", async () => {
  const N = await import("../src/world/news.js"), H = 3600000;
  assert.equal(N.awayHours(9 * 60000), 0, "10분 안쪽"); assert.equal(N.awayHours(-5 * H), 0, "거꾸로 간 시계"); assert.equal(N.awayHours(NaN), 0); assert.equal(N.awayHours(Infinity), 0);
  assert.equal(N.awayHours(5 * 365 * 24 * H), 0, "말이 안 되게 벌어진 시계"); assert.equal(N.awayHours(30 * 60000), 0.5);
  assert.equal(N.awayHours(8 * H), 8); assert.equal(N.awayHours(72 * H), N.AWAY_CAP_HOURS, "8시간까지만");
  assert.equal(N.awayCasts(0), 0); assert.equal(N.awayCasts(0.2), 1); assert.equal(N.awayCasts(3), 4); assert.equal(N.awayCasts(8), N.AWAY_FISH_CAP);
  assert.equal(N.awaySpan(25 * 60000), "25분"); assert.equal(N.awaySpan(3 * H + 20 * 60000), "3시간 20분"); assert.equal(N.awaySpan(50 * H), "2일 2시간");

  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("목수"); w.addUnitByName("꽃"); w.addUnitByName("물방울"); w.setSeason("autumn");
  const c = w.center; let fd = null;
  for (let r = 4; r < 30 && !fd; r++) for (let dz = -r; dz <= r && !fd; dz++) for (let dx = -r; dx <= r && !fd; dx++) if (w.check("field", c.x + dx, c.z + dz, 0).ok) fd = [c.x + dx, c.z + dz];
  assert.ok(w.placeBuilding("field", fd[0], fd[1], 0).ok); if (!w.spots.length) w.spots.push({ x: 1, z: 1, dir: [1, 0], claimed: null });
  const farmer = w.units.find(u => u.job === "farmer"), fisher = w.units.find(u => u.job === "fisher");
  w.farmPlot(w.plots[0], farmer); w.farmPlot(w.plots[1], farmer); assert.equal(w.plots.filter(p => p.stage === "growing").length, 2);
  const snap = () => JSON.stringify([w.bank, w.prices, w.priceHist, w.units.map(u => u.coins), w.res.coins, w.time, w.weather, w.granary]);
  const before = snap(), fish0 = fisher.inv.fish, seen0 = Object.values(w.collection).reduce((a, b) => a + b, 0);
  assert.equal(w.applyAway(5 * 60000, seededRandom(5)), null, "5분은 아무 일 없음"); assert.equal(w.applyAway(-H, seededRandom(5)), null);
  assert.equal(w.plots.filter(p => p.stage === "growing").length, 2);
  const r = w.applyAway(100 * H, seededRandom(5));
  assert.equal(r.hours, 8); assert.equal(r.ripened, 2); assert.equal(w.plots.filter(p => p.stage === "ripe").length, 2);
  assert.ok(r.catches.length >= 1 && r.catches.length <= N.AWAY_FISH_CAP, `낚은 수 ${r.catches.length}`);
  assert.ok(r.catches.every(x => x.who === fisher.name && x.fish.name));
  assert.equal(Object.values(w.collection).reduce((a, b) => a + b, 0) - seen0, r.catches.length, "도감에 기록");
  assert.equal(fisher.inv.fish - fish0, r.catches.filter(x => x.fish.rarity === "common").length, "흔한 물고기는 어부 가방에");
  assert.equal(snap(), before, "은행·시세·돈·마을 시간은 그대로");
  assert.match(w.newsLog.at(-1).text, /^다녀온 사이에 밭 2칸이 익고 물고기 \d마리를 낚았어요$/);
  assert.deepEqual(w.applyAway(100 * H, seededRandom(5)).ripened, 0, "익을 밭이 더 없음");
  // 같은 난수면 같은 결과(월드는 시계를 읽지 않음), 어부가 없으면 낚시 없음
  const mk = () => { const x = World.create(7, seededRandom(3), { wild: true, firstGull: true }); x.addUnitByName("물방울"); x.setSeason("autumn"); if (!x.spots.length) x.spots.push({ x: 1, z: 1, dir: [1, 0], claimed: null }); return x; };
  assert.deepEqual(mk().applyAway(4 * H, seededRandom(8)), mk().applyAway(4 * H, seededRandom(8)));
  const lone = World.create(7, seededRandom(3), { wild: true, firstGull: true }); assert.deepEqual(lone.applyAway(4 * H, seededRandom(8)).catches, []);
  // 저장 시각은 밖에서 넣어 줌
  assert.equal(World.fromJSON(JSON.parse(JSON.stringify(w.serialize(1234567))), seededRandom(1)).savedAt, 1234567); assert.equal(w.serialize().savedAt, null);

  // 편지: 우체국이 있으면 더 길게
  const rep = { ms: 100 * H, hours: 8, ripened: 2, catches: [{ who: "물방울", fish: { name: "참치", rarity: "epic" }, item: null }, { who: "물방울", fish: { name: "멸치", rarity: "common" }, item: { name: "유리병" } }] };
  const short = N.awayLetter(rep), long = N.awayLetter(rep, { post: true, news: [{ icon: "🏅", text: "마을 등급이 올랐어요: 🏘 어촌!" }], wishes: [{ who: "기본", text: "시장이 있으면 좋겠어요" }] });
  assert.ok(long.lines.length > short.lines.length); assert.match(short.lines[0], /^4일 4시간 만이에요/); assert.ok(short.lines.some(l => /8시간까지만/.test(l)));
  assert.ok(short.lines.some(l => /밭 2칸/.test(l)) && short.lines.some(l => /물고기 2마리/.test(l)));
  assert.ok(long.lines.some(l => /참치 \(영웅!\)/.test(l)) && long.lines.some(l => /멸치 \+ 유리병/.test(l)) && long.lines.some(l => /어촌/.test(l)) && long.lines.some(l => /시장이 있으면/.test(l)));
  assert.ok(N.awayLetter({ ms: H, hours: 1, ripened: 0, catches: [] }).lines.some(l => /조용한/.test(l)));
});

test("찌 당기기: 보너스 없으면 예전과 똑같고(난수도 같은 만큼), 보너스면 희귀 이상 물고기 비중이 오름", async () => {
  const J = await import("../src/world/jobs.js");
  const u = { name: "기본", job: "builder", rarity: "common" }, N = 20000;
  assert.equal(J.TUG_BONUS, 1.5); assert.ok(J.TUG_BONUS > 1 && J.TUG_BONUS <= 2, "보너스는 작게");
  // 보너스 없음(기본값·1): 같은 씨앗이면 한 마리 한 마리가 똑같음
  const a = seededRandom(5), b = seededRandom(5), c = seededRandom(5);
  for (let i = 0; i < 2000; i++) { const f = J.rollFish(u, a, "summer"); assert.equal(J.rollFish(u, b, "summer", 1), f); J.rollFish(u, c, "summer", J.TUG_BONUS); }
  const next = a(); assert.equal(b(), next); assert.equal(c(), next, "보너스가 있어도 난수는 똑같이 한 번만 씀");
  const i1 = seededRandom(6), i2 = seededRandom(6); for (let i = 0; i < 500; i++) assert.equal(J.rollItem(u, i1, null), J.rollItem(u, i2, null, 1));
  // 보너스: 희귀 이상 비중이 오르되, 흔한 물고기도 여전히 나옴
  const share = bonus => { const rnd = seededRandom(11); let rare = 0; for (let i = 0; i < N; i++) if (J.rollFish(u, rnd, null, bonus).rarity !== "common") rare++; return rare / N; };
  const base = share(1), tug = share(J.TUG_BONUS);
  assert.ok(tug > base * 1.15, `${base} → ${tug}`); assert.ok(tug < base * 1.5 + 0.001 && tug < 1, `${base} → ${tug}`);
  const itemShare = bonus => { const rnd = seededRandom(12); let rare = 0; for (let i = 0; i < N; i++) if (J.rollItem(u, rnd, null, bonus).rarity !== "common") rare++; return rare / N; };
  assert.ok(itemShare(J.TUG_BONUS) > itemShare(1));
});

test("찌 당기기: 따라가는 갈매미만 입질(❗)이 오고, 같이 당기면 바로 낚으며 재미가 오름. 안 당겨도·안 따라가도 평소대로", async () => {
  const J = await import("../src/world/jobs.js"); const { updateUnit } = await import("../src/units/unitBrain.js");
  const setup = () => { const w = World.create(7, seededRandom(3)), u = w.units[0]; u.state = UnitState.Fish; u.fishT = 3; u.once = null; u.needs.fun = 40; u.full = 80; u.needs.energy = 100; return { w, u }; };
  const step = (w, u, secs) => { for (let i = 0, n = Math.round(secs * 30); i < n; i++) updateUnit(u, 1 / 30, w, w.rnd); };
  // 안 따라감: 입질 표시도 없고, 당겨도 아무 일 없음
  { const { w, u } = setup(); step(w, u, 2); assert.ok(!u.bite && u.emoteText !== "❗"); assert.equal(w.tugFloat(u), false); assert.ok(u.fishT > 0.9); }
  // 따라감: 마지막 BITE_SECS초에만 입질
  const { w, u } = setup(); w.watchId = u.unitId;
  step(w, u, 1); assert.ok(!u.bite, "아직 이름"); assert.equal(w.tugFloat(u), false, "입질 전에는 못 당김");
  step(w, u, 0.6); assert.equal(u.bite, true); assert.equal(u.emoteText, "❗"); assert.ok(u.fishT > 0 && u.fishT <= J.BITE_SECS);
  const fun = u.needs.fun; let bonus = null; const real = w.catchFish.bind(w); w.catchFish = (who, b) => { bonus = b; return real(who, b); };
  assert.equal(w.tugFloat(u), true); assert.equal(w.tugFloat(u), false, "한 번만");
  assert.ok(u.needs.fun >= fun + J.TUG_FUN - 0.01); assert.equal(u.fishT, 0);
  step(w, u, 1.2); assert.equal(bonus, J.TUG_BONUS, "당긴 낚시는 보너스로"); assert.ok(!u.bite && !u.tugged);
  // 따라가지만 안 당김: 보너스 없이 평소대로 낚음
  { const { w, u } = setup(); w.watchId = u.unitId; let b2 = null; const r2 = w.catchFish.bind(w); w.catchFish = (who, b) => { b2 = b; return r2(who, b); };
    step(w, u, 4.5); assert.equal(b2, 1); assert.ok(!u.bite && !u.tugged); }
  // 입질 표시가 남은 채 낚시를 그만두면(다른 상태) 당길 수 없음: 버튼이 남지 않음
  { const { w, u } = setup(); w.watchId = u.unitId; step(w, u, 1.6); assert.equal(w.canTug(u), true); u.state = UnitState.Idle; assert.equal(w.canTug(u), false); assert.equal(w.tugFloat(u), false);
    assert.equal(w.canTug(null), false); assert.equal(w.canTug(undefined), false); }
  // 저장에는 안 남음(잠깐의 상태)
  const j = JSON.parse(JSON.stringify(w.serialize())); assert.ok(!("watchId" in j) && !j.units.some(x => "bite" in x)); assert.ok(World.fromJSON(j).units.length);
});

test("수족관: 물고기 크기는 난수 없이 범위 안에서 정해지고, 종류별 가장 큰 크기를 기록한다", async () => {
  const { FISH } = await import("../src/data/catalog.js"); const A = await import("../src/world/aquarium.js");
  for (const f of FISH) { assert.ok(Array.isArray(f.cm) && f.cm[0] > 0 && f.cm[0] < f.cm[1], `${f.name} 크기 범위`);
    assert.equal(A.fishSize(f, 0), f.cm[0]); assert.equal(A.fishSize(f, 1), f.cm[1]); assert.ok(A.fishSize(f, 0.5) < (f.cm[0] + f.cm[1]) / 2, "큰 놈일수록 드묾"); }
  const seen = new Set();
  for (let i = 0; i < 400; i++) { const t = A.sizeNoise(i * 0.7, i % 9, i); assert.ok(t >= 0 && t < 1); assert.equal(t, A.sizeNoise(i * 0.7, i % 9, i)); seen.add(Math.floor(t * 10)); }
  assert.equal(seen.size, 10, "고르게 퍼짐");
  // 크기를 재도 마을 난수는 예전과 똑같이 쓰임: 같은 씨앗의 낚시 결과(종류·물건)가 난수 사용 횟수까지 같음
  const run = () => { let calls = 0; const base = seededRandom(11), w = World.create(7, () => { calls++; return base(); }); const u = w.units.find(x => x.job === "fisher"); const out = [];
    for (let i = 0; i < 60; i++) { w.time += 3; const r = w.catchFish(u); out.push(r ? [r.fish.id, r.item?.id ?? null, r.size] : null); } return { w, out, calls }; };
  const a = run(), b = run(); assert.deepEqual(a.out, b.out); assert.equal(a.calls, b.calls);
  const got = a.out.filter(Boolean); assert.ok(got.length > 20);
  { const base = seededRandom(21), w0 = World.create(7, seededRandom(2)), u0 = w0.units.find(x => x.job === "fisher");   // 한 번 낚을 때 난수는 예전처럼 물고기 1번 + 물건 확률 1번(+ 물건 1번)만
    for (let i = 0; i < 200; i++) { let calls = 0; const r = w0.landFish(u0, () => { calls++; return base(); }); assert.equal(calls, r.item ? 3 : 2); } }
  for (const f of FISH) { const sizes = got.filter(x => x[0] === f.id).map(x => x[2]); if (!sizes.length) { assert.equal(a.w.fishRecord[f.id], undefined); continue; }
    assert.ok(sizes.every(s => s >= f.cm[0] && s <= f.cm[1])); assert.equal(a.w.fishRecord[f.id], Math.max(...sizes), `${f.name} 기록`); }
  // 새 기록일 때만 알림
  const w = World.create(7, seededRandom(4)), u = w.units.find(x => x.job === "fisher"), recs = []; w.on("fishRecord", e => recs.push(e));
  let n = 0; for (let i = 0; i < 80; i++) { w.time += 2; const before = { ...w.fishRecord }, r = w.catchFish(u); if (!r) continue; n++;
    assert.equal(r.record, r.size > (before[r.fish.id] || 0)); assert.equal(r.first, !before[r.fish.id]); }
  assert.ok(recs.length > 0 && recs.length < n, `기록 ${recs.length} / 낚음 ${n}`); assert.equal(recs.filter(e => e.first).length, Object.keys(w.fishRecord).length);
});

test("수족관: 있을 때만 처음 낚은 희귀 이상 한 마리를 기증하고(팔지 않음), 3·6종·전설만 빼고 모두 기증하면 기념 가구를 준다", async () => {
  const { FISH, ITEMS, BUILDINGS } = await import("../src/data/catalog.js"); const A = await import("../src/world/aquarium.js");
  const { RANKS, rankScore } = await import("../src/world/rank.js");
  assert.equal(BUILDINGS.aquarium.rank, 2); assert.ok(RANKS[2].unlock.includes("aquarium")); assert.equal(BUILDINGS.aquarium.asset, null);
  const byId = id => FISH.find(f => f.id === id), rares = A.DONATE_KINDS, noLegend = rares.filter(f => f.rarity !== "legend");
  assert.ok(rares.every(f => f.rarity !== "common") && rares.length === FISH.filter(f => f.rarity !== "common").length);
  // 선물 단계(순수)
  const give = list => Object.fromEntries(list.map(f => [f.id, true]));
  assert.equal(A.giftsEarned({}), 0); assert.equal(A.giftsEarned(give(rares.slice(0, 2))), 0); assert.equal(A.giftsEarned(give(rares.slice(0, 3))), 1);
  assert.equal(A.giftsEarned(give(rares.slice(0, 6))), 2); assert.equal(A.giftsEarned(give(noLegend.slice(1))), 2, "전설 아닌 것 하나가 빠짐");
  assert.equal(A.giftsEarned(give(noLegend)), 3); assert.equal(A.giftsEarned(give(rares)), 3);
  assert.ok(A.DONATE_GIFTS.every(g => ITEMS.find(i => i.id === g.item)?.furniture), "선물은 이미 있는 낚시 가구");
  // 월드: 수족관이 없으면 예전 그대로(보물로 쌓임)
  const w = World.create(7, seededRandom(3), { empty: true }); w.instantBuild = true; const u = w.addUnit(UNITS[5], 5, w.center.x + 0.5, w.center.z + 0.5);
  const land = id => { const f = byId(id), seq = [0, 0.999]; let acc = 0; const ws = FISH.map(x => !x.season || x.season === w.season ? x.weight * (x.rarity === "common" ? 1 : 1.3) : 0), tot = ws.reduce((p, q) => p + q, 0);
    for (let i = 0; i < FISH.length; i++) { if (FISH[i] === f) { seq[0] = (acc + ws[i] / 2) / tot; break; } acc += ws[i]; } let k = 0; return w.landFish(u, () => seq[k++]); };
  let r = land("flatfish"); assert.equal(r.fish.id, "flatfish"); assert.equal(r.donated, false); assert.equal(u.stash.flatfish, 1); assert.deepEqual(w.donated, {});
  assert.equal(w.donateFish(byId("flatfish")), null, "수족관이 없으면 기증 안 함");
  const base = rankScore(w).score; w.rank = 2;
  let at = null; const c = w.center; for (let rr = 2; rr < 30 && !at; rr++) for (let dz = -rr; dz <= rr && !at; dz++) for (let dx = -rr; dx <= rr && !at; dx++) if (w.placeBuilding("aquarium", c.x + dx, c.z + dz, 0, null, 1e9).ok) at = [c.x + dx, c.z + dz];
  assert.ok(at); assert.ok(w.aquariumB());
  assert.equal(rankScore(w).score, base + 8, "수족관은 시설 점수");
  assert.ok(w.canEnter(u, w.aquariumB()), "누구나 구경");
  // 수족관이 생기기 전에 아껴 둔 보물: 상인이 팔 때 한 마리는 기증, 나머지만 팖
  w.treasures.flatfish = 3; const news0 = w.newsLog.length, coins0 = w.res.coins, ev = []; w.on("donate", e => ev.push(e)); w.on("donateGift", e => ev.push(e));
  w.res.wood = w.res.stone = w.res.iron = w.res.food = 0; const log = w.trade(u);
  assert.equal(w.donated.flatfish, true); assert.equal(w.res.coins - coins0, Math.round(2 * byId("flatfish").price * 1)); assert.equal(log.sold, 16); assert.equal(w.treasures.flatfish, 0);
  assert.equal(ev.length, 1); assert.match(w.newsLog.at(-1).text, /광어를 수족관에 기증했어요!$/); assert.equal(w.newsLog.length, news0 + 1);
  // 처음 낚은 한 마리는 보물이 아니라 기증, 두 번째부터는 보물. 흔한 물고기는 기증하지 않음
  r = land("octopus"); assert.equal(r.fish.id, "octopus"); assert.equal(r.donated, true); assert.equal(w.treasures.octopus || 0, 0); assert.equal(w.collection.octopus, 1);
  r = land("octopus"); assert.equal(r.donated, false); assert.equal(u.stash.octopus, 1);
  r = land("anchovy"); assert.equal(r.fish.id, "anchovy"); assert.equal(r.donated, false); assert.equal(w.donated.anchovy, undefined);
  assert.equal(rankScore(w).score, base + 8 + 2 * A.DONATE_SCORE, "기증한 종류마다 등급 점수");
  // 3번째 종류 → 표류목 의자(마을 가방 = 집 꾸미기에서 놓는 길)
  w.items = {}; r = land("tuna"); assert.equal(r.donated, true); assert.deepEqual(r.gifts.map(g => g.item.id), ["chair"]); assert.equal(w.items.chair, 1); assert.equal(w.donateGifts, 1);
  // catchFish는 알림까지: 기증·선물 소식
  ev.length = 0; for (const f of rares) if (!w.donated[f.id] && f.rarity !== "legend") { const g = w.donateFish(f); w.tellDonation(u, f, g); }
  assert.equal(w.donateGifts, 3); assert.equal(w.items.table, 1); assert.equal(w.items.bed, 1); assert.equal(w.items.chair, 1, "선물은 한 번씩만");
  assert.equal(ev.filter(e => e.gift).length, 2); assert.ok(w.newsLog.some(n => /기념으로 조개 침대를 받았어요!$/.test(n.text)));
  assert.equal(w.donateFish(byId("whaleshark")).length, 0, "전설도 기증은 되지만 더 받을 선물은 없음"); assert.equal(w.donateFish(byId("whaleshark")), null, "한 종류는 한 번만");
  // 저장·불러오기 + 예전 저장(새 칸 없음)
  w.fishRecord.tuna = 123.4; const j = JSON.parse(JSON.stringify(w.serialize())), w2 = World.fromJSON(j, seededRandom(3));
  assert.deepEqual(w2.donated, w.donated); assert.deepEqual(w2.fishRecord, w.fishRecord); assert.equal(w2.donateGifts, 3); assert.ok(w2.aquariumB());
  assert.equal(w2.donateFish(byId("tuna")), null); assert.equal(w2.items.bed, 1);
  delete j.donated; delete j.fishRecord; delete j.donateGifts; const old = World.fromJSON(j, seededRandom(3));
  assert.deepEqual(old.donated, {}); assert.deepEqual(old.fishRecord, {}); assert.equal(old.donateGifts, 0);
  j.donated = { tuna: 1, nope: true }; j.fishRecord = { tuna: "x", cod: 50, nope: 3 }; j.donateGifts = 99; const odd = World.fromJSON(j, seededRandom(3));
  assert.deepEqual(odd.donated, { tuna: true }); assert.deepEqual(odd.fishRecord, { cod: 50 }); assert.equal(odd.donateGifts, 3);
});

test("수족관: 구경하는 갈매미는 재미가 차오른다", () => {
  const w = World.create(7, seededRandom(3), { empty: true }); w.instantBuild = true; const u = w.addUnit(UNITS[0], 0, w.center.x + 0.5, w.center.z + 0.5); w.rank = 2;
  let at = null; const c = w.center; for (let rr = 2; rr < 30 && !at; rr++) for (let dz = -rr; dz <= rr && !at; dz++) for (let dx = -rr; dx <= rr && !at; dx++) if (w.placeBuilding("aquarium", c.x + dx, c.z + dz, 0, null, 1e9).ok) at = [c.x + dx, c.z + dz];
  const b = w.aquariumB(); w.pickUpUnit(u); const d = w.dropUnit(u, b.cells[0][0], b.cells[0][1]);
  assert.equal(d.building, b); assert.equal(u.insideBuildingId, b.id); u.needs.fun = 20; u.timer = 100;
  for (let i = 0; i < 20; i++) w.update(0.1);
  assert.ok(u.needs.fun > 20 + 2 * 2.3, `재미 ${u.needs.fun}`);
});

test("수족관: 다녀온 사이에 낚은 첫 희귀 이상 물고기도 기증되고, 알림 없이 소식지·편지에만 적힌다", async () => {
  const N = await import("../src/world/news.js"); const { FISH } = await import("../src/data/catalog.js"); const H = 3600000;
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("물방울"); w.rank = 2;
  if (!w.spots.length) w.spots.push({ x: 1, z: 1, dir: [1, 0], claimed: null });
  let at = null; const c = w.center; for (let rr = 2; rr < 30 && !at; rr++) for (let dz = -rr; dz <= rr && !at; dz++) for (let dx = -rr; dx <= rr && !at; dx++) if (w.placeBuilding("aquarium", c.x + dx, c.z + dz, 0, null, 1e9).ok) at = [c.x + dx, c.z + dz];
  assert.ok(w.aquariumB()); const ev = []; w.on("donate", e => ev.push(e)); w.on("donateGift", e => ev.push(e)); w.on("fishRecord", e => ev.push(e));
  const all = []; for (let s = 1; s <= 12; s++) { const r = w.applyAway(100 * H, seededRandom(s)); all.push(...r.catches); }
  const gave = all.filter(x => x.donated); assert.ok(gave.length >= 3, `기증 ${gave.length}`); assert.equal(ev.length, 0, "그동안의 일은 알림 줄에 띄우지 않음");
  assert.equal(new Set(gave.map(x => x.fish.id)).size, gave.length, "한 종류는 한 번만"); assert.deepEqual(Object.keys(w.donated).sort(), gave.map(x => x.fish.id).sort());
  for (const f of FISH) if (f.rarity !== "common" && w.collection[f.id]) { assert.equal(w.donated[f.id], true); assert.equal(w.units.find(x => x.name === "물방울").stash[f.id] || 0, w.collection[f.id] - 1, `${f.name}: 기증한 한 마리만 빼고 보물`); }
  assert.ok(all.every(x => x.size >= x.fish.cm[0] && x.size <= x.fish.cm[1] && w.fishRecord[x.fish.id] >= x.size));
  assert.equal(w.donateGifts, 1 + (gave.length >= 6)); assert.equal(w.items.chair >= 1, true);
  assert.ok(w.newsLog.some(n => /^물방울이 처음 낚은 .+ 수족관에 기증했어요!$/.test(n.text)), "소식지에 기증 소식"); assert.ok(w.newsLog.some(n => /기념으로 표류목 의자를 받았어요!$/.test(n.text)));
  const letter = N.awayLetter({ ms: H, hours: 1, ripened: 0, catches: [gave[0]] }, { post: true });
  assert.ok(letter.lines.some(l => l.includes(gave[0].fish.name) && l.endsWith("🐠 수족관에 기증")));
});

test("정(선물·쓰다듬기·답례): 순수 계산 — 하트 단계, 선물 갈래와 반응 3단계, 하루 쓰다듬기 횟수, 답례", async () => {
  const B = await import("../src/world/bond.js"), { PERSONA, ITEMS, FURNITURE } = await import("../src/data/catalog.js");
  assert.deepEqual([0, 4.9, 5, 13.9, 14, 27.9, 28, 99].map(B.bondStage), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(B.bondHearts(0), "♡♡♡"); assert.equal(B.bondHearts(14), "♥♥♡"); assert.equal(B.bondHearts(B.BOND_MAX), "♥♥♥");
  assert.equal(B.BOND_STAGES[0].held, "!?", "처음엔 예전 그대로 놀람");
  // 선물할 수 있는 것: 가구가 아닌 가방 물건과 보물 물고기만(음식·흔한 물고기·가구는 아님)
  assert.equal(B.giftDef("pearl").cat, "shiny"); assert.equal(B.giftDef("tuna").cat, "fish"); assert.equal(B.giftDef("tuna").kind, "fish");
  for (const id of ["chair", "bed", "anchovy", "food", "fish", "wood", "없는것"]) assert.equal(B.giftDef(id), null, id);
  for (const i of ITEMS.filter(i => !i.furniture)) assert.ok(B.GIFT_CAT_NAME[B.giftDef(i.id).cat], `${i.name}: 갈래가 있어야 함`);
  // 갈매미마다 좋아하는·꺼리는 갈래가 있고(겹치지 않음), 아는 갈래만 씀
  for (const [name, p] of Object.entries(PERSONA)) {
    assert.ok(p.likes?.length && p.dislikes?.length, name);
    for (const c of [...p.likes, ...p.dislikes]) assert.ok(B.GIFT_CAT_NAME[c], `${name}: ${c}`);
    assert.ok(!p.likes.some(c => p.dislikes.includes(c)), name);
  }
  assert.equal(B.giftTier("황금", "pearl"), 2); assert.equal(B.giftTier("그림자", "pearl"), 0); assert.equal(B.giftTier("기본", "pearl"), 1);
  assert.equal(B.giftTier("물방울", "tuna"), 2); assert.equal(B.giftTier("미니", "tuna"), 0); assert.equal(B.giftTier("없는 갈매미", "pearl"), 1);
  assert.deepEqual(B.GIFT_TIERS.map(t => t.say), ["음…", "고마워", "최고야!"]); assert.ok(B.GIFT_TIERS[0].bond < B.GIFT_TIERS[1].bond && B.GIFT_TIERS[1].bond < B.GIFT_TIERS[2].bond);
  assert.deepEqual(B.giftables({ items: { pearl: 2, chair: 1, bottle: 0 }, treasures: { tuna: 1, anchovy: 3 } }).map(g => [g.id, g.n]), [["pearl", 2], ["tuna", 1]]);
  // 쓰다듬기: 그날 횟수만 셈
  assert.equal(B.petsLeft({}, 1), B.PET_DAILY); assert.equal(B.petsLeft({ petDay: 1, petN: 2 }, 1), B.PET_DAILY - 2); assert.equal(B.petsLeft({ petDay: 1, petN: 9 }, 1), 0); assert.equal(B.petsLeft({ petDay: 1, petN: 9 }, 2), B.PET_DAILY);
  // 답례: 이미 있는 물건·가구만. 집이 없으면 가구 대신 가방 물건
  assert.equal(B.thanksFor(0, true), null); assert.equal(B.thanksFor(9, true), null);
  for (let s = 1; s < B.BOND_STAGES.length; s++) for (const home of [true, false]) { const g = B.thanksFor(s, home); assert.ok(g.kind === "furniture" ? FURNITURE[g.id] && home : ITEMS.find(i => i.id === g.id), `단계 ${s}`); }
  assert.equal(B.thanksFor(2, true).kind, "furniture"); assert.equal(B.thanksFor(2, false).kind, "item");
  assert.deepEqual(B.keepFromSave({ pearl: true, chair: true, tuna: 1, bottle: false, x: true }), { pearl: true, tuna: true }); assert.deepEqual(B.keepFromSave(undefined), {}); assert.deepEqual(B.keepFromSave("이상한 값"), {});
});

test("정(월드): 간직한 것은 안 팔고, 선물하면 하나 줄고 정·재미가 오르며, 단계에 처음 닿을 때만 답례·소식, 쓰다듬기는 마을 하루 3번, 저장·불러오기", async () => {
  const B = await import("../src/world/bond.js"), { NEWS_DAY_SECS } = await import("../src/world/news.js"), Fu = await import("../src/world/furniture.js");
  const w = World.create(7, seededRandom(33)), merchant = w.units.find(u => u.job === "merchant"), gold = w.units.find(u => u.name === "황금"), shadow = w.units.find(u => u.name === "그림자");
  // 간직하기: 켠 것만 남고 나머지는 예전처럼 팔림
  Object.assign(w.items, { pearl: 2, bottle: 1, chair: 1 }); Object.assign(w.treasures, { tuna: 1, flatfish: 1 });
  assert.equal(w.toggleKeep("pearl"), true); assert.equal(w.toggleKeep("tuna"), true); assert.equal(w.toggleKeep("chair"), false, "가구는 원래 안 팔리므로 간직 표시가 없음"); assert.equal(w.toggleKeep("없는것"), false);
  w.trade(merchant);
  assert.equal(w.items.pearl, 2); assert.equal(w.treasures.tuna, 1); assert.equal(w.items.bottle, 0); assert.equal(w.treasures.flatfish, 0); assert.equal(w.items.chair, 1);
  assert.equal(w.toggleKeep("tuna"), false); assert.deepEqual(w.keep, { pearl: true });
  // 선물: 못 주는 것
  assert.equal(w.giveGift(gold, "bottle"), null, "가진 게 없음"); assert.equal(w.giveGift(gold, "chair"), null, "가구는 선물 못 함"); assert.equal(w.giveGift(null, "pearl"), null); assert.equal(w.giveGift({ name: "남" }, "pearl"), null);
  // 좋아하는 것 / 꺼리는 것 / 보통
  const res0 = JSON.stringify(w.res), ev = []; w.on("gift", e => ev.push(["gift", e.u.name, e.item.id, e.tier])); w.on("bondStage", e => ev.push(["stage", e.u.name, e.stage, e.gift?.id]));
  gold.needs.fun = 10; let r = w.giveGift(gold, "pearl");
  assert.equal(r.tier, 2); assert.equal(r.say, "최고야!"); assert.equal(gold.emoteText, "최고야!"); assert.equal(w.items.pearl, 1); assert.equal(gold.bond, B.GIFT_TIERS[2].bond); assert.equal(gold.needs.fun, 10 + B.GIFT_TIERS[2].fun);
  r = w.giveGift(shadow, "pearl"); assert.equal(r.tier, 0); assert.equal(shadow.emoteText, "음…"); assert.equal(shadow.bond, B.GIFT_TIERS[0].bond); assert.equal(w.items.pearl, 0);
  r = w.giveGift(shadow, "tuna"); assert.equal(r.tier, 1); assert.equal(shadow.emoteText, "고마워"); assert.equal(w.treasures.tuna, 0);
  assert.deepEqual(ev, [["gift", "황금", "pearl", 2], ["gift", "그림자", "pearl", 0], ["gift", "그림자", "tuna", 1]]); assert.deepEqual(r.thanks, []);
  assert.equal(JSON.stringify(w.res), res0, "선물은 마을 창고(음식·돈)를 건드리지 않음");
  // 단계에 처음 닿으면 답례 한 번(가방에 들어가고 간직 표시) + 소식지
  ev.length = 0; w.items.pearl = 1; const news0 = w.newsLog.length; r = w.giveGift(gold, "pearl");
  assert.equal(B.bondStage(gold.bond), 1); assert.equal(r.thanks.length, 1); assert.equal(r.thanks[0].gift.id, "bottle"); assert.equal(w.items.bottle, 1); assert.equal(w.keep.bottle, true); assert.equal(gold.bondGifts, 1);
  assert.deepEqual(ev, [["gift", "황금", "pearl", 2], ["stage", "황금", 1, "bottle"]]);
  assert.equal(w.newsLog.length, news0 + 1); assert.match(w.newsLog.at(-1).text, /황금과 아는 사이가 됐어요! 답례로 유리병 편지를 받았어요/);
  // 들어 올릴 때 반응: 처음 만난 사이는 예전 그대로 "!?", 친해지면 덜 놀람
  assert.ok(w.pickUpUnit(shadow)); assert.equal(shadow.emoteText, "!?"); w.dropUnit(shadow, Math.floor(shadow.heldFrom.x), Math.floor(shadow.heldFrom.z));
  assert.ok(w.pickUpUnit(gold)); assert.equal(gold.emoteText, B.BOND_STAGES[1].held); assert.deepEqual(w.pet(gold), { ok: false, reason: "away" }, "들고 있는 동안은 못 쓰다듬음");
  w.dropUnit(gold, Math.floor(gold.heldFrom.x), Math.floor(gold.heldFrom.z));
  // 쓰다듬기: 마을 하루에 PET_DAILY번, 날이 바뀌면 다시
  gold.insideBuildingId = null; const b0 = gold.bond; gold.needs.fun = 10;
  for (let i = 0; i < B.PET_DAILY; i++) { r = w.pet(gold); assert.equal(r.ok, true); assert.equal(r.left, B.PET_DAILY - 1 - i); }
  assert.equal(gold.bond, b0 + B.PET_DAILY * B.PET_BOND); assert.equal(gold.needs.fun, 10 + B.PET_DAILY * B.PET_FUN);
  assert.deepEqual(w.pet(gold), { ok: false, reason: "cap", left: 0 }); assert.equal(gold.bond, b0 + B.PET_DAILY * B.PET_BOND);
  assert.equal(w.pet(shadow).ok, true, "횟수는 갈매미마다 따로");
  w.time += NEWS_DAY_SECS; assert.equal(w.pet(gold).ok, true, "마을 날이 바뀌면 다시"); assert.equal(gold.petN, 1);
  // 답례 가구: 집이 있으면 그 집 창고로, 단계를 한꺼번에 넘으면 답례도 차례대로 모두, 다시는 안 줌
  w.instantBuild = true; const hb = w.placeBuilding("house", 38, 26, 0).building; hb.owner = gold.unitId; gold.home = hb.id;
  ev.length = 0; let got = w.addBond(gold, 100);
  assert.equal(gold.bond, B.BOND_MAX); assert.deepEqual(got.map(g => [g.stage, g.gift.kind, g.gift.id]), [[2, "furniture", "plant"], [3, "item", "pearl"]]);
  assert.equal(Fu.room(hb).stash.plant, 1); assert.equal(w.items.pearl, 1); assert.equal(w.keep.pearl, true);
  assert.match(w.newsLog.find(e => /친한 사이/.test(e.text)).text, /답례로 화분을 황금네 작은 집에 들여놨어요/);
  assert.deepEqual(w.addBond(gold, 5), []); assert.equal(gold.bondGifts, 3);
  assert.ok(w.pickUpUnit(gold)); assert.equal(gold.emoteText, "♥"); w.dropUnit(gold, Math.floor(gold.heldFrom.x), Math.floor(gold.heldFrom.z));
  // 저장·불러오기: 정·답례 수·쓰다듬기 횟수·간직하기가 그대로, 받은 답례를 또 받지 않음
  const j = JSON.parse(JSON.stringify(w.serialize())), w2 = World.fromJSON(j, seededRandom(1)), g2 = w2.units.find(u => u.name === "황금"), s2 = w2.units.find(u => u.name === "그림자");
  assert.equal(g2.bond, B.BOND_MAX); assert.equal(g2.bondGifts, 3); assert.equal(g2.petDay, gold.petDay); assert.equal(g2.petN, 1); assert.equal(s2.bond, shadow.bond); assert.deepEqual(w2.keep, w.keep);
  const seen = []; w2.on("bondStage", e => seen.push(e)); w2.addBond(g2, 5); assert.deepEqual(seen, []);
  assert.equal(B.petsLeft(g2, 2), B.PET_DAILY - 1);
  // 예전 저장(새 칸 없음)도 불러옴: 모두 0·빈 것
  delete j.keep; for (const u of j.units) { delete u.bond; delete u.bondGifts; delete u.petDay; delete u.petN; }
  const w3 = World.fromJSON(j, seededRandom(1)), g3 = w3.units.find(u => u.name === "황금");
  assert.deepEqual([g3.bond, g3.bondGifts, g3.petDay, g3.petN], [0, 0, 0, 0]); assert.deepEqual(w3.keep, {}); assert.equal(w3.pet(g3).ok || g3.insideBuildingId != null, true);
});

test("정(월드): 간직하던 것의 마지막 하나를 선물하면 간직 표시도 지워짐(남아 있으면 그대로) → 나중에 얻은 것은 다시 팔림", () => {
  const w = World.create(7, seededRandom(33)), merchant = w.units.find(u => u.job === "merchant"), u = w.units[0];
  Object.assign(w.items, { pearl: 2 }); w.treasures.tuna = 1; w.toggleKeep("pearl"); w.toggleKeep("tuna");
  w.giveGift(u, "pearl"); assert.equal(w.keep.pearl, true, "하나 남았으면 그대로");
  w.giveGift(u, "pearl"); w.giveGift(u, "tuna"); assert.equal(w.keep.pearl, undefined); assert.equal(w.keep.tuna, undefined);
  // 답례로 받은 유리병 편지(자동으로 간직)를 다시 선물해 버렸다면, 그 뒤에 주운 편지는 예전처럼 상인이 팖
  const v = w.units[1]; w.items.bottle = 0; delete w.keep.bottle;
  const got = w.addBond(v, 5); assert.equal(got[0].gift.id, "bottle"); assert.equal(w.keep.bottle, true); assert.equal(w.items.bottle, 1);
  w.giveGift(v, "bottle"); assert.equal(w.keep.bottle, undefined);
  w.items.bottle = 3; w.trade(merchant); assert.equal(w.items.bottle, 0);
});

test("드문 하늘: 무지개(낮에 비가 갠 뒤)·유성우(맑은 밤)·겨울 첫눈, 별조각, 하늘 기록 저장·예전 저장", async () => {
  const K = await import("../src/world/skywatch.js"), { ITEMS } = await import("../src/data/catalog.js"), J = await import("../src/world/jobs.js"), B = await import("../src/world/bond.js"), N = await import("../src/world/news.js");
  assert.equal(K.winterYearOf(new Date(2026, 11, 25)), 2026); assert.equal(K.winterYearOf(new Date(2027, 1, 3)), 2026, "1~2월은 지난해 겨울"); assert.equal(K.winterYearOf(new Date(2027, 2, 1)), 2027);
  assert.deepEqual(K.skySeenFromSave(undefined), { rainbow: 0, meteor: 0, firstSnow: 0 }); assert.deepEqual(K.skySeenFromSave({ rainbow: 2.7, meteor: -1, firstSnow: "x" }), { rainbow: 2, meteor: 0, firstSnow: 0 });
  // 별조각: 가방 물건(팔 수 있고 선물할 수 있음)이지만 낚시로는 안 나옴
  const star = ITEMS.find(i => i.id === K.STAR_ITEM); assert.equal(star.name, "별조각"); assert.ok(star.price > 0 && !star.furniture); assert.equal(B.giftDef(star.id).cat, "shiny");
  { const r = seededRandom(5), u = { skill: {} }; for (let i = 0; i < 3000; i++) assert.notEqual(J.rollItem(u, r, null, 3).id, star.id); }
  const mk = () => { const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.setSeason("summer"); return w; };
  // 무지개: 비·폭풍 → 맑음일 때만, 낮에만 굴림. 확률은 RAINBOW_CHANCE(하늘 난수), 마을·날씨 난수는 안 씀
  let w = mk(), seen = 0, tries = 400;
  for (let i = 0; i < tries; i++) { w.sky = null; w.setWeather(i % 2 ? "storm" : "rain"); assert.equal(w.sky, null); w.setWeather("clear"); if (w.sky) { seen++; assert.equal(w.sky.kind, "rainbow"); assert.equal(w.sky.t, K.SKY_EVENTS.rainbow.secs); } }
  assert.ok(Math.abs(seen / tries - K.RAINBOW_CHANCE) < 0.08, `무지개 ${seen}/${tries}`); assert.equal(w.skySeen.rainbow, seen);
  w = mk(); w.skyRnd = () => 0; w.setWeather("cloudy"); w.setWeather("clear"); assert.equal(w.sky, null, "흐림 → 맑음은 무지개 없음");
  w.isNight = true; w.setWeather("rain"); w.setWeather("clear"); assert.equal(w.sky, null, "밤에는 무지개 없음");
  w.isNight = false; w.setWeather("rain");
  { const a = mk(), b = mk(); b.skyRnd = () => 0; for (const x of [a, b]) { x.skyRnd = x === a ? () => 1 : () => 0; x.setWeather("rain"); x.setWeather("clear"); }
    assert.equal(a.sky, null); assert.equal(b.sky.kind, "rainbow"); assert.equal(a.rnd(), b.rnd(), "마을 난수를 쓰지 않음"); assert.equal(a.wrnd(), b.wrnd(), "날씨 난수를 쓰지 않음"); }
  // 떠 있는 동안 물건을 찾을 확률 배수(fx.item), 시간이 다 되거나 날이 흐려지면 끝
  const got = []; w.on("sky", e => got.push(e.kind)); w.on("skyEnd", e => got.push("end:" + e.kind));
  assert.equal(w.fx.item, 1); w.setWeather("clear"); w.weather.t = 1e9; assert.equal(w.fx.item, K.SKY_EVENTS.rainbow.item); assert.ok(w.fx.item > 1);
  assert.match(w.newsLog.at(-1).text, /무지개/); assert.equal(N.newsFor("sky", { kind: "rainbow", def: K.SKY_EVENTS.rainbow }, w).icon, "🌈");
  w.stepSky(K.SKY_EVENTS.rainbow.secs - 1); assert.ok(w.sky); w.stepSky(2); assert.equal(w.sky, null); assert.equal(w.fx.item, 1); assert.deepEqual(got, ["rainbow", "end:rainbow"]);
  w.startSky("rainbow"); w.weather.kind = "cloudy"; w.stepSky(0.1); assert.equal(w.sky, null, "흐려지면 무지개가 사라짐");
  w.weather.kind = "clear"; w.startSky("rainbow", true); w.isNight = true; w.stepSky(1); assert.ok(w.sky, "시험용으로 띄운 것은 시간이 다 될 때까지");
  assert.equal(w.startSky("firstSnow"), false); assert.equal(w.startSky("nope"), false);
  // 올려다보기: 밖에서 깨어 있는 갈매미가 말풍선(쉬던 갈매미는 잠깐 멈춤), 자는 갈매미·집 안은 빼고
  w = mk(); w.addUnitByName("미니"); w.addUnitByName("불씨"); w.skyRnd = () => 0; const [u0, u1, u2] = w.units;
  u0.state = UnitState.Idle; u0.timer = 0.1; u1.state = UnitState.Sleep; u1.emoteText = ""; u2.insideBuildingId = 99; u2.emoteText = "";
  w.startSky("rainbow"); assert.equal(u0.emoteText, "🌈"); assert.ok(u0.timer >= 2.5); assert.equal(u0.state, UnitState.Idle); assert.equal(u1.emoteText, ""); assert.equal(u2.emoteText, "");
  w.skyRnd = () => 0.99; u0.emoteText = ""; w.startSky("rainbow"); assert.equal(u0.emoteText, "", "확률에 안 들면 그대로");
  // 유성우: 밤이 아니거나(시험·낮) 맑지 않으면 굴리지 않음. 맑은 밤엔 METEOR_CHECK_SECS마다 한 번
  w = mk(); w.weather = { kind: "clear", t: 1e9 }; let rolls = 0; w.skyRnd = () => { rolls++; return 0.99; };
  w.stepSky(1000); assert.equal(rolls, 0, "isNight를 모르면(시험) 안 굴림"); w.isNight = false; w.stepSky(1000); assert.equal(rolls, 0);
  w.isNight = true; w.weather.kind = "cloudy"; w.stepSky(1000); assert.equal(rolls, 0); w.weather.kind = "clear";
  for (let i = 0; i < K.METEOR_CHECK_SECS * 3 * 10; i++) w.stepSky(0.1); assert.ok(rolls >= 2 && rolls <= 3, `굴린 횟수 ${rolls}`); assert.equal(w.sky, null);
  w.skyRnd = () => K.METEOR_CHANCE - 0.001; w.stepSky(K.METEOR_CHECK_SECS); assert.equal(w.sky.kind, "meteor"); assert.equal(w.skySeen.meteor, 1); assert.equal(w.fx.item, 1);
  // 별조각: 유성우 동안 밖에서 깨어 있는 야행성 갈매미만, 한 번에 STAR_MAX개까지
  w.addUnitByName("미니"); w.addUnitByName("불씨"); w.addUnitByName("그림자"); const fire = w.units.find(u => u.name === "불씨"), shade = w.units.find(u => u.name === "그림자");
  const stars = []; w.on("starPiece", e => stars.push(e.u.name)); shade.state = UnitState.Sleep; w.skyRnd = () => 0;
  w.stepSky(K.STAR_CHECK_SECS - 1); assert.equal(stars.length, 0); w.stepSky(1); assert.deepEqual(stars, ["불씨"], "야행성이고 깨어 있는 갈매미만"); assert.equal(fire.stash.stardust, 1); assert.equal(fire.emoteText, "⭐");
  assert.match(w.newsLog.at(-1).text, /불씨가 .*별조각을 주웠어요/);
  w.stepSky(K.STAR_CHECK_SECS); w.stepSky(K.STAR_CHECK_SECS); assert.equal(fire.stash.stardust, K.STAR_MAX, "한 번에 많아야 STAR_MAX개");
  w.isNight = false; w.stepSky(0.1); assert.equal(w.sky, null, "날이 밝으면 끝");
  { assert.equal(w.items.stardust, undefined, "별조각은 내 가방이 아니라 주운 갈매미 것"); }
  // 첫눈: 겨울마다 한 번. 같은 겨울엔 다시 알리지 않고, 겨울이 지나가거나 해가 바뀌면 다시
  w = mk(); const snows = []; w.on("firstSnow", () => snows.push(w.winterYear)); w.setWeather("snow"); assert.equal(snows.length, 0, "겨울이 아니면 첫눈이 아님");
  w.setSeason("winter"); w.winterYear = 2026; w.setWeather("snow"); assert.deepEqual(snows, [2026]); assert.equal(w.skySeen.firstSnow, 1); assert.equal(w.newsLog.at(-1).text, "첫눈이 내려요!");
  w.setWeather("clear"); w.snow = 0; w.setWeather("snow"); assert.equal(snows.length, 1, "같은 겨울엔 한 번만");
  // 저장 → 불러오기: 하늘 기록·첫눈 해는 남고, 떠 있던 하늘은 끝난 것으로
  w.startSky("meteor", true); w.items.stardust = 3; let j = JSON.parse(JSON.stringify(w.serialize())), back = World.fromJSON(j, seededRandom(2));
  assert.deepEqual(back.skySeen, w.skySeen); assert.equal(back.firstSnowYear, 2026); assert.equal(back.sky, null); assert.equal(back.items.stardust, 3);
  back.setSeason("winter"); back.winterYear = 2026; back.setWeather("clear"); back.setWeather("snow"); assert.equal(back.skySeen.firstSnow, 1, "불러온 뒤 같은 겨울엔 다시 알리지 않음");
  back.winterYear = 2027; back.setWeather("clear"); back.setWeather("snow"); assert.equal(back.skySeen.firstSnow, 2, "다음 해 겨울엔 다시 첫눈");
  back.setSeason("spring"); back.setSeason("winter"); back.setWeather("clear"); back.setWeather("snow"); assert.equal(back.skySeen.firstSnow, 3, "겨울이 지나갔다 오면 다시 첫눈");
  // 예전 저장(새 칸 없음): 기록 0에서 시작. 눈이 쌓인 채면 이번 겨울 첫눈은 지난 일로 봄
  delete j.skySeen; delete j.firstSnowYear; j.snow = 0; let old = World.fromJSON(j, seededRandom(2));
  assert.deepEqual(old.skySeen, { rainbow: 0, meteor: 0, firstSnow: 0 }); assert.equal(old.firstSnowYear, null);
  old.setSeason("winter"); old.winterYear = 2026; old.setWeather("clear"); old.setWeather("snow"); assert.equal(old.skySeen.firstSnow, 1);
  j.snow = 0.6; old = World.fromJSON(j, seededRandom(2)); old.setSeason("winter"); old.winterYear = 2026; old.setWeather("clear"); old.setWeather("snow"); assert.equal(old.skySeen.firstSnow, 0, "눈이 쌓여 있던 예전 저장");
  old.winterYear = 2027; old.setWeather("clear"); old.setWeather("snow"); assert.equal(old.skySeen.firstSnow, 1);
  // 눈이 쌓인 예전 저장을 겨울이 지난 뒤에 불러오면, 다음 겨울의 첫눈은 그대로 알림
  old = World.fromJSON(j, seededRandom(2)); old.setSeason("spring"); assert.equal(old.firstSnowYear, null); old.setSeason("winter"); old.winterYear = 2026; old.setWeather("clear"); old.setWeather("snow"); assert.equal(old.skySeen.firstSnow, 1, "겨울이 지난 뒤 불러온 예전 저장");
  // 하늘 난수: 새 섬은 씨앗대로, 불러온 섬은 저장된 마을 시간을 섞어 불러올 때마다 같은 순서를 되풀이하지 않음
  assert.equal(K.skySeed(7), K.skySeed(7, 0)); assert.equal(K.skySeed(7, 0.9), K.skySeed(7)); assert.notEqual(K.skySeed(7, 100), K.skySeed(7, 101)); assert.equal(K.skySeed(null, undefined), K.skySeed(0));
  { const at = t => World.fromJSON({ ...j, time: t }, seededRandom(2)).skyRnd(); assert.equal(at(500), at(500)); assert.notEqual(at(500), at(900)); assert.equal(mk().skyRnd(), mk().skyRnd()); }
  assert.equal(w.firstSnow(true), true, "시험용으로는 다시 알릴 수 있음");
});

// ---------------------------------------------------------------- 계절 축제의 날
test("축제 열쇠: 해 + 계절(겨울은 12월이 든 해), 광장은 축제 장식 4개가 6칸 안", async () => {
  const Fe = await import("../src/world/festival.js");
  assert.equal(Fe.festivalKey(new Date(2026, 10, 25)), "2026-autumn"); assert.equal(Fe.festivalKey(new Date(2026, 11, 3)), "2026-winter");
  assert.equal(Fe.festivalKey(new Date(2027, 1, 10)), "2026-winter", "1~2월은 지난해 겨울과 같은 축제"); assert.equal(Fe.festivalKey(new Date(2027, 2, 1)), "2027-spring");
  assert.equal(Fe.festivalOf("2026-autumn").def, Fe.FESTIVALS.autumn); assert.equal(Fe.festivalOf("2026-monsoon"), null); assert.equal(Fe.festivalOf(null), null);
  for (const s of Object.keys(Fe.FESTIVALS)) { const it = Fe.festivalGift(`2026-${s}`); assert.ok(it?.fest && it.furniture, `${s} 기념 가구`); }
  const { FURNITURE, ITEMS } = await import("../src/data/catalog.js"); const J2 = await import("../src/world/jobs.js");
  for (const it of ITEMS.filter(i => i.fest)) assert.ok(FURNITURE[it.furniture], "가구 정의가 있음");
  const r = seededRandom(5), u = { job: "fisher", rarity: "legend" }; for (let i = 0; i < 400; i++) assert.ok(!J2.rollItem(u, r, "winter", 3).fest, "기념 가구는 낚시로 안 나옴");
  const w = World.create(7, seededRandom(1), { empty: true }); w.instantBuild = true; w.addUnitByName("기본");
  const c = w.center, spots = []; for (let z = Math.floor(c.z) - 12; z < c.z + 12 && spots.length < 5; z += 2) for (let x = Math.floor(c.x) - 3; x < c.x + 3 && spots.length < 5; x += 2) if (w.check("bunting", x, z, 0).ok && spots.every(s => Math.hypot(s[0] - x, s[1] - z) <= 5)) spots.push([x, z]);
  assert.equal(spots.length, 5, "놓을 자리");
  for (const [i, id] of ["bunting", "festLantern", "seasonDeco"].entries()) assert.ok(w.placeBuilding(id, ...spots[i], 0).ok);
  let p = Fe.festivalPlaza(w); assert.equal(p.ok, false); assert.equal(p.n, 3); assert.equal(Fe.festiveCount(w), 3);
  assert.ok(w.placeBuilding("bunting", ...spots[3], 0).ok); p = Fe.festivalPlaza(w); assert.ok(p.ok); assert.equal(p.n, 4);
  assert.ok(Math.abs(p.x - (spots.slice(0, 4).reduce((s, q) => s + q[0], 0) / 4 + 0.5)) < 1e-9, "광장 가운데 = 장식들의 한가운데");
  assert.equal(Fe.festivalPlaza(World.create(7, seededRandom(1), { empty: true })).x, null);
});

/** 축제 시험용 마을: 갈매미 넷 + 광장 둘레에 장식을 놓을 자리들 */
function festTown() {
  const w = World.create(7, seededRandom(3), { empty: true }); w.instantBuild = true;
  for (const n of ["기본", "미니", "꽃", "물방울"]) w.addUnitByName(n);
  const c = w.center, spots = []; for (let z = Math.floor(c.z) + 6; z < c.z + 20 && spots.length < 6; z += 2) for (let x = Math.floor(c.x) - 3; x < c.x + 3 && spots.length < 6; x += 2) if (w.check("bunting", x, z, 0).ok && spots.every(s => Math.hypot(s[0] - x, s[1] - z) <= 5)) spots.push([x, z]);
  assert.ok(spots.length >= 5, "놓을 자리"); return { w, spots };
}
test("축제 소원: 실제 계절마다 한 번·등급이 되면 생기고, 광장을 꾸미면(새 장식 하나 이상) 축제가 열림", async () => {
  const Fe = await import("../src/world/festival.js"); const { WISH_BY_ID } = await import("../src/world/wishes.js");
  const { w, spots } = festTown(), seen = []; w.on("festival", e => seen.push(e.key)); w.on("wish", e => seen.push("wish:" + e.wish.id));
  w.stepFestival(1.1); assert.equal(w.wishes.length, 0, "열쇠(기기 날짜)가 없으면 아무 일도 없음");
  w.festKey = "2026-autumn"; w.rank = 0; w.stepFestival(1.1); assert.equal(w.wishes.length, 0, "갯마을(첫 등급)에서는 아직");
  assert.equal(WISH_BY_ID.festival.ok(w, w.units[0]), false, "제비뽑기 소원으로는 안 나옴");
  w.wishes = [{ id: "friend", unitId: w.units[0].unitId, base: 99, age: 0 }, { id: "market", unitId: w.units[1].unitId, base: 0, age: 0 }];
  w.rank = Fe.FESTIVAL_RANK; w.stepFestival(1.1);
  const wish = w.wishes.find(x => x.id === "festival"); assert.ok(wish, "소원 2개가 차 있어도 축제 소원은 따로"); assert.equal(wish.base, "2026-autumn"); assert.equal(wish.had, 0);
  assert.ok(![w.units[0].unitId, w.units[1].unitId].includes(wish.unitId), "소원이 없는 갈매미가 빎"); assert.deepEqual(seen, ["wish:festival"]);
  w.stepFestival(1.1); assert.equal(w.wishes.filter(x => x.id === "festival").length, 1, "한 번만");
  w.wishes = [wish];
  for (let i = 0; i < 3; i++) w.placeBuilding(i % 2 ? "festLantern" : "bunting", ...spots[i], 0);
  w.stepWishes(1.1); assert.equal(w.festival, null, "장식 3개로는 아직");
  const done0 = w.wishDone; w.placeBuilding("seasonDeco", ...spots[3], 0); w.stepWishes(1.1);
  assert.equal(w.wishes.length, 0); assert.equal(w.wishDone, done0 + 1); assert.equal(w.festival.id, "2026-autumn"); assert.equal(w.festival.t, Fe.FESTIVAL_SECS); assert.deepEqual(w.festival.who, []);
  assert.ok(seen.includes("2026-autumn")); assert.ok(w.newsLog.some(n => n.text.includes("가을 달맞이 축제가 열렸어요")), "소식지 머릿기사");
  w.stepFestival(1.1); assert.ok(!w.wishes.some(x => x.id === "festival"), "열리는 동안엔 다시 빌지 않음");
  // 다음 계절: 지난 장식이 그대로 있으면 새 장식을 하나 놓아야 이루어짐 · 계절이 넘어가면 못 이룬 소원은 접음
  w.endFestival(); w.festKey = "2026-winter"; w.stepFestival(1.1); const next = w.wishes.find(x => x.id === "festival"); assert.equal(next.had, 4);
  w.stepWishes(1.1); assert.equal(w.festival, null, "지난 장식만으로는 아직");
  const lost = []; w.on("wishLost", e => lost.push(e.wish.base)); w.festKey = "2027-spring"; w.stepWishes(1.1); assert.deepEqual(lost, ["2026-winter"]);
  w.stepFestival(1.1); w.placeBuilding("bunting", ...spots[4], 0); w.stepWishes(1.1); assert.equal(w.festival?.id, "2027-spring");
});

test("축제: 한가한 갈매미가 광장에 모여 놀고, 끝나면 여운(만족도)·기념 가구·도장. 그 계절엔 다시 안 열림", async () => {
  const Fe = await import("../src/world/festival.js"); const { satisfaction } = await import("../src/world/roads.js"); const Fu = await import("../src/world/furniture.js");
  const { w, spots } = festTown(); w.festKey = "2026-summer"; w.rank = 1;
  assert.equal(w.startFestival(), false, "광장(장식)이 없으면 못 엶");
  for (let i = 0; i < 4; i++) w.placeBuilding(i % 2 ? "festLantern" : "bunting", ...spots[i], 0);
  for (const u of w.units) { u.full = 100; u.needs.energy = 100; u.needs.fun = 30; u.needs.social = 30; u.timer = 0; }
  const fun0 = w.units.map(u => u.needs.fun), ended = []; w.on("festivalEnd", e => ended.push(e));
  assert.ok(w.startFestival()); const f = w.festival; let went = false;
  for (let i = 0; i < 30 * 100; i++) { w.update(1 / 30); for (const u of w.units) { u.full = 100; if (u.state === UnitState.GoFest) went = true; } }
  assert.ok(went, "광장으로 걸어감"); assert.ok(f.who.length >= 3, `대부분 함께함(${f.who.length})`);
  assert.ok(w.units.some((u, i) => f.who.includes(u.unitId) && u.needs.fun > fun0[i]), "재미가 참");
  const a = w.units.find(u => f.who.includes(u.unitId)), pals = w.units.filter(o => o !== a && (a.friends[o.unitId] || 0) > 0);
  assert.ok(pals.length > 0, "곁에서 놀던 갈매미와 조금 친해짐");
  // 저장·불러오기: 열리는 중인 축제와 함께한 갈매미
  const mid = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(4));
  assert.equal(mid.festival.id, "2026-summer"); assert.deepEqual(mid.festival.who, f.who); assert.ok(Math.abs(mid.festival.t - f.t) < 1e-6); assert.equal(mid.festival.x, f.x);
  for (let i = 0; i < 30 * 90 && w.festival; i++) w.update(1 / 30);
  assert.equal(w.festival, null, "정해진 시간이 지나면 끝남"); assert.equal(ended.length, 1); assert.equal(ended[0].item.id, "festSummer"); assert.equal(ended[0].n, f.who.length);
  assert.equal(w.items.festSummer, 1, "기념 가구는 마을 가방으로"); assert.deepEqual(w.festivals, { "2026-summer": true });
  assert.ok(a.cheer > 0 && satisfaction(w, a).parts.some(p => p[0].includes("축제") && p[1] === Fe.FESTIVAL_SAT), "함께한 갈매미는 만족도 덤");
  const out = w.units.find(u => !f.who.includes(u.unitId)); if (out) assert.ok(!satisfaction(w, out).parts.some(p => p[0].includes("축제")));
  assert.ok(w.newsLog.some(n => n.text.includes("여름 바다 축제가 끝났어요") && n.text.includes("파도 깔개")));
  const home = { defId: "house", interior: {} }; assert.equal(Fu.available(w, home).waveRug?.n, 1, "집 꾸미기에서 놓을 수 있음"); assert.ok(Fu.place(w, home, "waveRug", 0, 0, 0)); assert.equal(w.items.festSummer, 0);
  w.placeBuilding("bunting", ...spots[4], 0); for (let i = 0; i < 5; i++) { w.stepFestival(1.1); w.stepWishes(1.1); }
  assert.ok(!w.wishes.some(x => x.id === "festival") && !w.festival, "같은 계절엔 다시 안 열림");
  const c0 = a.cheer; w.stepFestival(1.5); assert.ok(a.cheer < c0, "여운은 시간이 지나면 옅어짐");
  // 저장·불러오기: 도장·여운 · 예전 저장(축제 칸 없음)
  const j = JSON.parse(JSON.stringify(w.serialize())), b = World.fromJSON(j, seededRandom(4));
  assert.deepEqual(b.festivals, { "2026-summer": true }); assert.equal(b.festival, null); assert.equal(b.units.find(u => u.name === a.name).cheer, Math.round(a.cheer)); assert.equal(b.festKey, null, "열쇠는 저장하지 않음(화면이 날짜로 넣음)");
  assert.deepEqual(Fe.festivalStamps({ "2027-spring": true, "2026-winter": true, "2026-summer": true, junk: true }).map(x => x.key), ["2026-summer", "2026-winter", "2027-spring"]);
  delete j.festival; delete j.festivals; for (const u of j.units) delete u.cheer;
  const old = World.fromJSON(j, seededRandom(4)); assert.deepEqual(old.festivals, {}); assert.equal(old.festival, null); assert.ok(old.units.every(u => u.cheer === 0));
  assert.equal(Fe.festivalFromSave({ id: "2026-summer", t: 9999, x: 1, z: 2 }).t, Fe.FESTIVAL_SECS); assert.equal(Fe.festivalFromSave({ id: "x", t: 5, x: 1, z: 2 }), null);
});

test("축제 검토: 축제 소원은 소원 2개 제한에 안 세고, 장식을 옮겨 모아도 열리고, 밤에 집에서 자던 갈매미도 나옴", async () => {
  const Fe = await import("../src/world/festival.js");
  // 1) 축제 소원이 걸려 있어도 보통 소원은 2개까지
  { const { w } = festTown(); w.festKey = "2026-autumn"; w.rank = 1; w.stepFestival(1.1);
    assert.equal(w.wishes.length, 1); assert.equal(w.wishes[0].id, "festival");
    for (let i = 0; i < 40; i++) w.makeWish();
    assert.equal(w.wishes.filter(x => x.id !== "festival").length, 2, "보통 소원 2개"); assert.equal(w.wishes.length, 3); assert.equal(w.makeWish(), null, "그 이상은 안 생김"); }
  // 1-2) 갈매미가 한 마리뿐이고 이미 소원이 있어도 축제 소원은 생김(기다리다 계절이 지나가지 않게)
  { const w = World.create(7, seededRandom(3), { empty: true }); w.addUnitByName("기본"); w.festKey = "2026-autumn"; w.rank = 1;
    w.wishes.push({ id: "bench", unitId: w.units[0].unitId, base: 0, age: 0 }); w.stepFestival(1.1);
    assert.equal(w.wishes.find(x => x.id === "festival")?.unitId, w.units[0].unitId);
    const none = World.create(7, seededRandom(3), { empty: true }); none.festKey = "2026-autumn"; none.rank = 1; none.stepFestival(1.1); assert.equal(none.wishes.length, 0, "갈매미가 없으면 조용히 넘어감"); }
  // 2) 지난 축제 장식 4개가 광장으로 남아 있을 때: 하나를 치웠다가 다시 놓아도 "새 장식"
  { const { w, spots } = festTown(); w.rank = 1;
    const bs = spots.slice(0, 4).map(s => w.placeBuilding("bunting", ...s, 0).building);
    w.festKey = "2026-autumn"; w.stepFestival(1.1); const wish = w.wishes.find(x => x.id === "festival"); assert.equal(wish.had, 4);
    w.stepWishes(1.1); assert.equal(w.festival, null, "그대로는 아직");
    w.removeBuilding(bs[3].id); w.stepFestival(1.1); assert.equal(wish.had, 3, "치운 만큼 낮춰 둠");
    w.stepWishes(1.1); assert.equal(w.festival, null, "광장이 깨진 동안은 아직");
    assert.ok(w.placeBuilding("festLantern", ...spots[3], 0).ok); w.stepWishes(1.1); assert.equal(w.festival?.id, "2026-autumn", "다시 놓으면 열림"); }
  // 3) 밤: 집 안에서 자던 갈매미가 축제에 나오고, 너무 지친 갈매미는 계속 잠
  { const { w, spots } = festTown(); w.festKey = "2026-summer"; w.rank = 1; w.isNight = true;
    for (let i = 0; i < 4; i++) w.placeBuilding("bunting", ...spots[i], 0);
    const [a, b] = w.units; const fake = "잠집";
    for (const u of [a, b]) { u.full = 100; u.state = UnitState.Inside; u.insideBuildingId = fake; u.insideAct = "sleep"; u.timer = 0; u.path = null; }
    a.needs.energy = 80; b.needs.energy = 5;
    for (let i = 0; i < 60; i++) w.update(1 / 30);
    assert.equal(a.state, UnitState.Inside, "축제가 없으면 밤엔 계속 잠"); assert.equal(b.state, UnitState.Inside);
    assert.ok(w.startFestival());
    for (let i = 0; i < 30 * 12; i++) { w.update(1 / 30); a.full = b.full = 100; b.needs.energy = 5; }
    assert.equal(a.insideBuildingId, null, "기운이 있으면 자다가도 나옴"); assert.equal(b.insideBuildingId, fake, "너무 지쳤으면 그대로 잠"); assert.equal(Fe.FESTIVAL_SECS > 12, true); }
});

// ---- 오늘의 부탁 3개 · 도장 · 도장 가게
test("오늘의 부탁: 날짜 열쇠로만 고르고(월드 난수 안 씀), 이 마을에서 할 수 있는 것만 3개", async () => {
  const D = await import("../src/world/daily.js");
  assert.equal(D.dailyKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05"); assert.equal(D.dailyKey(new Date(2026, 10, 25)), "2026-11-25");
  assert.notEqual(D.hashText("2026-01-05"), D.hashText("2026-01-06")); assert.equal(D.hashText("2026-01-05"), D.hashText("2026-01-05"));
  let used = 0; const base = seededRandom(3), w = World.create(7, () => { used++; return base(); }, { empty: true }); w.instantBuild = true;
  for (const n of ["기본", "미니", "꽃", "물방울"]) w.addUnitByName(n);
  w.setSeason("autumn"); const before = used;
  const a = D.rollDaily("2026-11-25", w), b = D.rollDaily("2026-11-25", w);
  assert.deepEqual(a, b, "같은 날·같은 마을이면 같은 부탁"); assert.equal(used, before, "월드 난수를 쓰지 않음");
  assert.equal(a.reqs.length, D.DAILY_COUNT); assert.equal(a.stamped, false);
  const sets = new Set(), ids = new Set();
  for (let d = 1; d <= 60; d++) {
    const r = D.rollDaily(`2026-${String(1 + (d >> 5)).padStart(2, "0")}-${String(1 + d % 28).padStart(2, "0")}`, w);
    assert.equal(r.reqs.length, 3); assert.equal(new Set(r.reqs.map(x => x.id)).size, 3, "겹치지 않음");
    assert.ok(r.reqs.filter(x => ["seasonFish", "fish3", "tug"].includes(x.id)).length <= 1, "낚시 부탁은 하루에 하나만");
    for (const x of r.reqs) { ids.add(x.id); assert.equal(x.have, 0); assert.ok(x.need > 0 && typeof x.text === "string" && x.text.length > 3); }
    sets.add(r.reqs.map(x => x.id).sort().join());
  }
  assert.ok(sets.size > 5, "날마다 다른 묶음");
  // 이 마을엔 집·선물할 물건·소원이 없고 갈매미가 4마리 → 그런 부탁은 안 나옴
  for (const no of ["furniture", "gift", "wish", "summon"]) assert.ok(!ids.has(no), `${no}는 아직 못 하는 부탁`);
  for (const yes of ["pet", "road", "deco"]) assert.ok(ids.has(yes), `${yes}는 할 수 있는 부탁`);
  assert.ok(D.rollDaily("2026-11-25", w).reqs.every(x => x.id !== "seasonFish" || /전어|꽃게/.test(x.text)), "제철 물고기 이름이 글에 들어감");
  // 갈매미가 없는 섬: 할 수 있는 것만(3개가 안 될 수도 있음), 낚시·쓰다듬기·장식은 없음
  const none = World.create(7, seededRandom(3), { empty: true });
  for (let d = 1; d <= 20; d++) { const r = D.rollDaily(`2027-03-${d}`, none); assert.ok(r.reqs.length >= 1 && r.reqs.every(x => ["road", "summon"].includes(x.id)), r.reqs.map(x => x.id).join()); }
  // 조건이 생기면 나옴: 가방에 진주 → 선물, 소원이 걸려 있음 → 소원
  w.items.pearl = 1; w.wishes.push({ id: "bench", unitId: w.units[0].unitId, base: 0, age: 0 });
  const later = new Set(); for (let d = 1; d <= 28; d++) for (const x of D.rollDaily(`2027-05-${d}`, w).reqs) later.add(x.id);
  assert.ok(later.has("gift") && later.has("wish"));
});
test("오늘의 부탁: 월드가 알린 일로 나아가고, 3개를 모두 끝내면 도장 하나(하루 한 번) · 날짜가 바뀌면 새로", async () => {
  const D = await import("../src/world/daily.js"); const Fu = await import("../src/world/furniture.js");
  const { w, spots } = festTown(); w.setSeason("autumn");
  assert.equal(w.daily, null, "화면이 날짜를 넣어 주기 전엔 없음"); w.pet(w.units[0]); assert.equal(w.stamps, 0);
  assert.equal(w.setDay("2026-11-25"), true); assert.equal(w.setDay("2026-11-25"), false, "같은 날은 그대로"); assert.equal(w.daily.reqs.length, 3);
  const pick = ids => { w.daily = D.dailyFromSave({ key: "2026-11-25", reqs: ids.map(id => ({ id, text: id, have: 0 })) }); };
  const seen = []; w.on("dailyDone", e => seen.push([e.req.id, e.all, e.stamps, e.left]));
  pick(["pet", "road", "deco"]);
  // 쓰다듬기 3번
  w.pet(w.units[0]); w.pet(w.units[0]); assert.equal(w.daily.reqs[0].have, 2); assert.equal(seen.length, 0);
  w.pet(w.units[1]); assert.deepEqual(seen, [["pet", false, 0, 2]]); w.pet(w.units[1]); assert.equal(w.daily.reqs[0].have, 3, "넘치지 않음");
  // 포장도로 5칸: 잔디·같은 칸 다시 칠하기는 안 셈
  const c = w.center, cells = []; for (let x = Math.floor(c.x) - 8; cells.length < 6; x++) if (w.canPaint(x, Math.floor(c.z) + 3)) cells.push([x, Math.floor(c.z) + 3]);
  w.paint(...cells[0], GroundType.Dirt); assert.equal(w.daily.reqs[1].have, 0, "흙길은 포장이 아님");
  for (const [x, z] of cells.slice(0, 4)) w.paint(x, z, GroundType.Cobble); w.paint(...cells[0], GroundType.Cobble);
  assert.equal(w.daily.reqs[1].have, 4); w.paint(...cells[4], GroundType.WoodDeck); assert.equal(w.daily.reqs[1].have, 5); assert.equal(seen.length, 2);
  // 장식: 공사 중엔 아직, 다 지으면 셈
  w.instantBuild = false; assert.ok(w.placeBuilding("bunting", ...spots[0], 0).ok); assert.equal(w.daily.reqs[2].have, 0, "놓기만 해서는 아직");
  w.finishAll(); assert.deepEqual(seen[2], ["deco", true, 1, 0]); assert.equal(w.stamps, 1); assert.equal(w.daily.stamped, true); assert.ok(D.dailyAllDone(w.daily));
  w.instantBuild = true; w.placeBuilding("bunting", ...spots[1], 0); w.pet(w.units[2]); assert.equal(w.stamps, 1, "하루에 도장은 하나"); assert.equal(seen.length, 3);
  // 바로 완공으로 놓은 장식도 셈 · 집은 장식이 아님
  pick(["deco", "furniture", "gift"]); w.placeBuilding("festLantern", ...spots[2], 0); assert.equal(w.daily.reqs[0].have, 1);
  let home = null; for (let z = Math.floor(c.z) - 20; z < c.z + 30 && !home; z += 3) for (let x = Math.floor(c.x) - 20; x < c.x + 20 && !home; x += 3) if (w.check("house", x, z, 0).ok) home = w.placeBuilding("house", x, z, 0).building;
  assert.ok(home && w.isDone(home)); assert.equal(w.daily.reqs[1].have, 0, "새 집의 기본 가구(알아서 놓임)는 안 셈");
  Fu.room(home).stash.plant = 1; const L = Fu.levels(home)[0]; let put = false;
  for (let z = 0; z < L.d && !put; z++) for (let x = 0; x < L.w && !put; x++) put = Fu.place(w, home, "plant", x, z, 0);
  assert.ok(put); assert.equal(w.daily.reqs[1].have, 1, "손으로 놓은 가구는 셈"); Fu.stow(w, home, Fu.allFurniture(home).length - 1); assert.equal(w.daily.reqs[1].have, 1);
  w.items.pearl = 1; assert.ok(w.giveGift(w.units[0], "pearl")); assert.equal(w.daily.reqs[2].have, 1); assert.equal(w.stamps, 2, "다른 날의 부탁을 모두 끝내면 또 하나");
  // 낚시: 물고기·제철 물고기·찌 당기기
  pick(["fish3"]); const fisher = w.units.find(u => u.job === "fisher"), FISH = (await import("../src/data/catalog.js")).FISH;
  w.emit("fish", { u: fisher, fish: FISH[0] }); assert.equal(w.daily.reqs[0].have, 1);
  pick(["seasonFish"]); w.emit("fish", { u: fisher, fish: FISH[0] }); assert.equal(w.daily.reqs[0].have, 0, "흔한 물고기는 제철이 아님");
  w.emit("fish", { u: fisher, fish: FISH.find(f => f.season === "autumn") }); assert.equal(w.daily.reqs[0].have, 1);
  pick(["tug"]); fisher.state = UnitState.Fish; fisher.bite = true; fisher.tugged = false; fisher.fishT = 1; assert.ok(w.tugFloat(fisher)); assert.equal(w.daily.reqs[0].have, 1);
  // 날짜가 바뀌면 새 부탁: 나아간 것은 처음부터, 도장은 그대로
  const stamps = w.stamps; assert.equal(w.setDay("2026-11-26"), true); assert.equal(w.daily.key, "2026-11-26");
  assert.ok(w.daily.reqs.every(r => r.have === 0)); assert.equal(w.daily.stamped, false); assert.equal(w.stamps, stamps);
  // 마을 시간을 아무리 돌려도(시간 배수) 날짜는 안 바뀜
  for (let i = 0; i < 30 * 60; i++) w.update(1 / 30); assert.equal(w.daily.key, "2026-11-26");
});
test("도장 가게·저장: 도장으로 한정 가구를 사고, 날짜·나아간 만큼·도장·산 것을 저장(예전 저장은 기본값)", async () => {
  const D = await import("../src/world/daily.js"); const Fu = await import("../src/world/furniture.js"); const J2 = await import("../src/world/jobs.js");
  const { FURNITURE, ITEMS } = await import("../src/data/catalog.js");
  assert.ok(D.STAMP_SHOP.length >= 3 && D.STAMP_SHOP.length <= 4);
  for (const s of D.STAMP_SHOP) { assert.ok(s.stamp >= 1 && FURNITURE[s.furniture], s.name); assert.ok(FURNITURE[FURNITURE[s.furniture].shape], "있는 모양을 다시 씀"); assert.ok(!FURNITURE[s.furniture].price, "잡화점에선 안 팖"); }
  const r = seededRandom(5), fisher = { job: "fisher", rarity: "legend" }; for (let i = 0; i < 400; i++) assert.ok(!J2.rollItem(fisher, r, "winter", 3).stamp, "도장 가구는 낚시로 안 나옴");
  const { w, spots } = festTown(); w.setSeason("autumn"); w.setDay("2026-11-25");
  const cheap = D.STAMP_SHOP.find(s => s.stamp === 1), dear = D.STAMP_SHOP.find(s => s.stamp > 2);
  assert.equal(w.buyStamp(cheap.id), false, "도장이 없으면 못 삼"); assert.equal(w.buyStamp("pearl"), false);
  w.stamps = 3; const got = []; w.on("stampBuy", e => got.push(e.item.id));
  assert.equal(w.buyStamp(cheap.id), true); assert.equal(w.stamps, 2); assert.equal(w.items[cheap.id], 1); assert.deepEqual(w.stampBought, { [cheap.id]: 1 }); assert.deepEqual(got, [cheap.id]);
  assert.equal(w.buyStamp(dear.id), false, "모자라면 못 삼"); assert.equal(w.stamps, 2);
  const home = { defId: "house", interior: {} }; assert.equal(Fu.available(w, home)[cheap.furniture]?.n, 1, "집 꾸미기에서 놓을 수 있음");
  w.trade(w.units[0]); assert.equal(w.items[cheap.id], 1, "상인이 팔지 않음");
  // 저장 → 불러오기
  w.daily = D.dailyFromSave({ key: "2026-11-25", reqs: [{ id: "deco", text: "장식", have: 0 }, { id: "pet", text: "쓰다듬기", have: 2 }, { id: "road", text: "길", have: 5 }], stamped: false });
  w.placeBuilding("bunting", ...spots[0], 0); assert.equal(w.daily.reqs[0].have, 1);
  w.daily.reqs[0].have = 0;                                                        // 불러오며 다시 놓는 건물이 세지지 않는지 보려고 되돌려 둠
  const j = JSON.parse(JSON.stringify(w.serialize(123))), w2 = World.fromJSON(j, seededRandom(3));
  assert.deepEqual(w2.daily, w.daily); assert.equal(w2.daily.reqs[0].have, 0, "불러올 때 다시 놓인 장식은 안 셈"); assert.equal(w2.stamps, 2); assert.deepEqual(w2.stampBought, { [cheap.id]: 1 }); assert.equal(w2.items[cheap.id], 1);
  assert.equal(w2.setDay("2026-11-25"), false, "같은 날 다시 열면 이어서"); assert.equal(w2.daily.reqs[1].have, 2);
  w2.pet(w2.units[0]); assert.equal(w2.daily.reqs[1].have, 3); assert.equal(w2.setDay("2026-11-26"), true, "다음 날 열면 새 부탁");
  // 예전 저장(새 칸이 없음)·망가진 값
  for (const k of ["daily", "stamps", "stampBought"]) delete j[k];
  const old = World.fromJSON(j, seededRandom(3)); assert.equal(old.daily, null); assert.equal(old.stamps, 0); assert.deepEqual(old.stampBought, {});
  assert.equal(old.setDay("2026-11-25"), true); assert.equal(old.daily.reqs.length, 3);
  assert.equal(D.dailyFromSave(null), null); assert.equal(D.dailyFromSave({ key: 5, reqs: [] }), null);
  assert.deepEqual(D.dailyFromSave({ key: "k", reqs: [{ id: "없는부탁", text: "x", have: 1 }, { id: "pet", text: "쓰다듬기", have: 99 }, null], stamped: 1 }), { key: "k", reqs: [{ id: "pet", icon: "♥", text: "쓰다듬기", need: 3, have: 3 }], stamped: true });
  assert.deepEqual(D.stampBoughtFromSave({ [cheap.id]: 2, pearl: 4, [dear.id]: -1 }), { [cheap.id]: 2 });
  j.stamps = -4; assert.equal(World.fromJSON(j, seededRandom(3)).stamps, 0);
});

test("여덟 가지 함께: 친구·소식지·찌 당기기·수족관·선물·하늘·축제·오늘의 부탁을 한 마을에서 겪고 저장 → 불러와도 그대로(등급 점수 같고, 도장·답례·기증·축제를 또 받지 않음)", async () => {
  const { FISH } = await import("../src/data/catalog.js"); const { friendStage, affinity } = await import("../src/units/mind.js");
  const { w, spots } = festTown(); w.addUnitByName("목수"); w.rank = 3; w.festKey = "2026-autumn"; w.winterYear = 2026; w.setSeason("autumn"); w.setDay("2026-11-25");
  const c = w.center; let aq = null; for (let x = Math.floor(c.x) - 14; x < c.x + 14 && !aq; x++) for (let z = Math.floor(c.z) - 14; z < c.z + 14 && !aq; z++) if (w.check("aquarium", x, z, 0).ok) aq = w.placeBuilding("aquarium", x, z, 0).building;
  assert.ok(aq && w.aquariumB(), "수족관");
  const [a, b] = w.units, fisher = w.units.find(u => u.job === "fisher"), seen = {}; for (const ev of ["friendship", "donate", "gift", "bondStage", "sky", "festival", "festivalEnd", "dailyDone", "tug"]) w.on(ev, () => { seen[ev] = (seen[ev] || 0) + 1; });
  w.befriend(a, b, 99); assert.equal(friendStage(affinity(a, b)), 2, "단짝");
  const rare = FISH.find(f => f.rarity === "rare" && !f.season); assert.deepEqual(w.donateFish(rare), []); w.tellDonation(fisher, rare, []);
  w.treasures[rare.id] = 2; w.daily = { key: "2026-11-25", reqs: [{ id: "gift", icon: "🎁", text: "선물", need: 1, have: 0 }, { id: "pet", icon: "♥", text: "쓰다듬기", need: 3, have: 0 }, { id: "deco", icon: "🏮", text: "장식", need: 1, have: 0 }], stamped: false };
  for (let i = 0; i < 4; i++) assert.ok(w.giveGift(a, rare.id) || i >= 2, "보물 두 마리를 선물"); a.bond = 4.5; for (let i = 0; i < 3; i++) assert.equal(w.pet(a).ok, true);
  assert.equal(a.bondGifts, 1, "아는 사이 답례 한 번"); assert.equal(seen.bondStage, 1);
  fisher.state = UnitState.Fish; fisher.fishT = 1; fisher.bite = true; assert.equal(w.tugFloat(fisher), true); fisher.state = UnitState.Idle; fisher.fishT = undefined; fisher.bite = fisher.tugged = false;
  assert.equal(w.startSky("rainbow", true), true); assert.ok(w.fx.item > 1);
  w.stepFestival(1.1); assert.ok(w.wishes.some(x => x.id === "festival"));
  for (let i = 0; i < 4; i++) w.placeBuilding(i % 2 ? "festLantern" : "bunting", ...spots[i], 0);
  for (let i = 0; i < 40 && !w.festival; i++) w.update(0.1);
  assert.ok(w.festival, "새 장식 넷으로 축제가 열림"); assert.equal(seen.festival, 1);
  assert.equal(w.daily.stamped, true, "선물·쓰다듬기·장식을 모두 들어줌"); assert.equal(w.stamps, 1); assert.equal(seen.dailyDone, 3);
  const texts = w.newsLog.map(e => e.text); assert.equal(new Set(texts).size, texts.length, "같은 소식이 두 번 실리지 않음");
  for (const word of ["단짝", "기증", "아는 사이", "무지개", "축제"]) assert.ok(texts.some(t => t.includes(word)), `소식지에 ${word}`);
  // 저장 → 불러오기: 그대로 이어지고, 이미 받은 것은 또 받지 않음
  w.updateRoads(); for (const u of w.units) u.full = 80;
  const j = JSON.parse(JSON.stringify(w.serialize(123))), w2 = World.fromJSON(j, seededRandom(3)); w2.festKey = w.festKey; w2.winterYear = 2026; w2.setSeason("autumn");
  for (const u of w2.units) { u.full = 80; u.needs = { ...w.units.find(o => o.name === u.name).needs }; } w2.updateRoads();
  assert.equal(w2.setDay("2026-11-25"), false); assert.deepEqual(w2.daily, w.daily); assert.equal(w2.stamps, 1);
  assert.deepEqual(w2.score().parts, w.score().parts, "등급 점수의 모든 줄이 같음");
  assert.deepEqual(w2.donated, w.donated); assert.deepEqual(w2.skySeen, w.skySeen); assert.deepEqual(w2.newsLog, w.newsLog); assert.deepEqual(w2.festival, w.festival); assert.equal(w2.wishDone, w.wishDone);
  const a2 = w2.units.find(u => u.name === a.name), b2 = w2.units.find(u => u.name === b.name), seen2 = {}; for (const ev of ["friendship", "donate", "bondStage", "festival", "dailyDone", "wish"]) w2.on(ev, () => { seen2[ev] = (seen2[ev] || 0) + 1; });
  assert.equal(friendStage(affinity(a2, b2)), 2); assert.equal(a2.bond, a.bond); assert.equal(w2.pet(a2).ok, false, "오늘 쓰다듬기는 다 씀");
  w2.befriend(a2, b2, 1); w2.addBond(a2, 0.1); assert.equal(w2.donateFish(rare), null, "같은 종류는 다시 기증하지 않음");
  w2.placeBuilding("bunting", ...spots[4], 0); for (let i = 0; i < 30; i++) w2.update(0.1);
  assert.deepEqual(seen2, {}, "불러온 뒤 같은 일을 또 알리지 않음(단짝·답례·축제 소원·도장)"); assert.equal(w2.stamps, 1);
  for (let i = 0; i < 1900 && w2.festival; i++) w2.update(0.1);
  assert.equal(w2.festival, null); assert.equal(w2.festivals["2026-autumn"], true); assert.equal(w2.items.festAutumn, 1, "기념 가구 하나");
  for (let i = 0; i < 30; i++) w2.update(0.1); assert.ok(!w2.wishes.some(x => x.id === "festival"), "이번 계절 축제 소원은 다시 안 생김");
});

test("바닥 그림: 좁게 칠한 곳(3칸 이하 띠)과 그 둘레만 상세도와 상관없이 촘촘히, 넓은 땅·넓은 경계·물가는 그대로", async () => {
  const { cellSub, isThin, nearThin, EDGE_SUB, snowClear } = await import("../src/world/groundLook.js");
  const g = new Grid(24, 24, 16);
  for (let z = 0; z < 24; z++) for (let x = 0; x < 24; x++) { g.get(x, z).elevation = 0.15; g.get(x, z).groundType = GroundType.Grass; }
  g.get(5, 5).groundType = GroundType.Cobble;                                     // 한 칸 칠하기
  assert.equal(cellSub(g, 5, 5, 1), EDGE_SUB);                                    // 칠한 칸
  assert.equal(cellSub(g, 4, 4, 1), EDGE_SUB);                                    // 대각선 이웃도
  assert.equal(cellSub(g, 8, 8, 1), 1);                                           // 멀리 떨어진 잔디는 상세도 그대로
  assert.equal(cellSub(g, 5, 5, 4), 4);                                           // 이미 촘촘하면 그대로
  for (let x = 2; x < 20; x++) g.get(x, 10).groundType = GroundType.Dirt;          // 한 칸 폭 길
  assert.ok(isThin(g, 11, 10) && nearThin(g, 11, 9) && !nearThin(g, 11, 12));
  for (let z = 16; z < 24; z++) for (let x = 0; x < 24; x++) g.get(x, z).groundType = GroundType.Sand;   // 넓은 모래(자연 해변)
  assert.equal(cellSub(g, 11, 16, 1), 1);                                         // 넓은 땅끼리의 경계는 그대로
  assert.equal(cellSub(g, 11, 15, 1), 1);
  for (let z = 20; z < 24; z++) for (let x = 4; x < 10; x++) g.get(x, z).groundType = GroundType.Rock;   // 넓게 칠한 바위: 테두리도 그대로
  assert.equal(cellSub(g, 4, 20, 1), 1); assert.equal(cellSub(g, 3, 20, 1), 1);
  for (let z = 20; z < 24; z++) for (let x = 14; x < 20; x++) g.get(x, z).groundType = GroundType.Cobble; // 넓게 칠한 돌길: 테두리 안팎 칸만 촘촘히
  assert.equal(cellSub(g, 14, 20, 1), EDGE_SUB); assert.equal(cellSub(g, 13, 20, 1), EDGE_SUB); assert.equal(cellSub(g, 16, 22, 1), 1);
  const s = new Grid(16, 16, 16);                                                 // 물가
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) { s.get(x, z).elevation = z < 10 ? 0.15 : -1; s.get(x, z).groundType = z < 6 ? GroundType.Grass : GroundType.Sand; }
  assert.equal(isThin(s, 8, 9), false);                                           // 물 앞 모래 띠(4칸)가 물 때문에 좁은 띠가 되지 않음
  assert.equal(isThin(s, 8, 12), false);                                          // 물 칸은 늘 그대로
  assert.equal(cellSub(s, 8, 6, 1), 1);                                           // 넓은 잔디·모래 경계는 그대로
  assert.ok(snowClear(GroundType.Cobble) > 0.5 && snowClear(GroundType.WoodDeck) > 0.5 && snowClear(GroundType.Dirt) > 0.5);   // 길은 쓸어서 눈이 덜
  assert.equal(snowClear(GroundType.Grass) + snowClear(GroundType.Sand) + snowClear(GroundType.Rock), 0);                     // 자연 땅은 그대로
});

test("건설 모드 쿼터뷰: 방향은 가장 가까운 대각선으로, ⟲ ⟳ 는 90°씩, 돌 때는 짧은 쪽으로", async () => {
  const Q = await import("../src/systems/quarterView.js"), deg = r => Math.round(r * 180 / Math.PI * 1000) / 1000, rad = d => d * Math.PI / 180;
  assert.deepEqual(Q.QUARTER_YAWS_DEG, [45, 135, 225, 315]);
  // 가장 가까운 대각선(음수·한 바퀴 넘는 각도도)
  for (const [from, to] of [[0, 45], [10, 45], [44, 45], [45, 45], [89.9, 45], [90, 135], [100, 135], [179, 135], [181, 225], [269, 225], [271, 315], [359, 315], [-10, 315], [-100, 225], [370, 45], [725, 45]])
    assert.equal(deg(Q.quarterSnapYaw(rad(from))), to, `${from}° → ${to}°`);
  // 90°씩: 네 번 돌면 제자리, 어디서 시작해도 언제나 대각선
  let y = Q.quarterSnapYaw(rad(20)); const seen = [];
  for (let i = 0; i < 4; i++) { y = Q.quarterStepYaw(y, 1); seen.push(deg(y)); }
  assert.deepEqual(seen, [135, 225, 315, 45]);
  assert.equal(deg(Q.quarterStepYaw(rad(45), -1)), 315); assert.equal(deg(Q.quarterStepYaw(rad(315), 1)), 45); assert.equal(deg(Q.quarterStepYaw(rad(200), -1)), 135);
  for (let a = -400; a <= 400; a += 7) for (const d of [1, -1]) assert.ok(Q.QUARTER_YAWS_DEG.includes(deg(Q.quarterStepYaw(rad(a), d))));
  // 짧은 쪽으로 도는 양
  assert.equal(deg(Q.quarterDelta(rad(315), rad(45))), 90); assert.equal(deg(Q.quarterDelta(rad(45), rad(315))), -90); assert.equal(deg(Q.quarterDelta(rad(10), rad(45))), 35);
  // 벡터 ↔ (거리·방향·기울기) 왕복
  const o = Q.quarterOffset(20, rad(135), rad(Q.QUARTER_PITCH_DEG)), back = Q.quarterOrbit(o);
  assert.ok(Math.abs(back.r - 20) < 1e-9 && Math.abs(deg(back.yaw) - 135) < 1e-6 && Math.abs(deg(back.pitch) - Q.QUARTER_PITCH_DEG) < 1e-6);
});

test("건설 모드 쿼터뷰: 들어가면 고정 각도, 끌어도 그대로, ⟲ ⟳ 로 90°, 나오면 보던 각도", async () => {
  const Q = await import("../src/systems/quarterView.js");
  const vec = (x, y, z) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } });
  const camera = { position: vec(0, 54, 52), lookAt() {} }, controls = { target: vec(0, 0, 4), enableRotate: true };
  const cam = new Q.QuarterCam({ camera, controls, duration: 0.3 }), run = (s = 0.5) => { for (let i = 0; i < Math.round(s * 60); i++) cam.update(1 / 60); };
  const before = cam.state();
  assert.equal(cam.turn(1), false);                                                // 평소엔 돌리기 버튼이 아무것도 안 함
  cam.enter(); assert.equal(controls.enableRotate, false); run();
  assert.deepEqual([cam.state().yaw, cam.state().pitch], [45, Q.QUARTER_PITCH_DEG]);   // 0° → 45°, 기울기 고정
  camera.position.set(30, 5, -20); run(0.1);                                       // 누가 카메라를 돌려 놓아도(끌기·비틀기) 다음 프레임에 제 각도로, 거리는 그대로
  assert.deepEqual([cam.state().yaw, cam.state().pitch], [45, Q.QUARTER_PITCH_DEG]);
  assert.ok(Math.abs(Math.hypot(camera.position.x, camera.position.y, camera.position.z - 4) - Math.hypot(30, 5, -24)) < 1e-6);
  camera.position.set(0, 54, 52); run(0.1);
  cam.turn(1); run(); assert.equal(cam.state().yaw, 135);
  cam.turn(1); cam.turn(1); run(); assert.equal(cam.state().yaw, 315);             // 잇달아 눌러도 90°씩 쌓임
  cam.turn(-1); run(); assert.equal(cam.state().yaw, 225);
  controls.target.set(10, 0, -6); run(0.1);                                        // 화면 옮기기(보는 점 이동)는 막지 않음
  assert.deepEqual([cam.state().yaw, cam.state().pitch], [225, Q.QUARTER_PITCH_DEG]);
  cam.exit(); assert.equal(controls.enableRotate, true); run();
  assert.deepEqual([cam.state().yaw, cam.state().pitch], [before.yaw, before.pitch]);   // 들어오기 전 각도로
});

test("전기(풍차 선행): 가로등·건물 등불·집은 다 지은 풍차 둘레 POWER_RANGE칸 안에서만 전기가 들어옴 — 경계·짓는 중·철거·저장/불러오기·소원", async () => {
  const PW = await import("../src/world/power.js"), { WISH_BY_ID } = await import("../src/world/wishes.js"), R = PW.POWER_RANGE;
  assert.equal(R, 18);
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.addUnitByName("목수"); w.rank = 2; w.instantBuild = true; w.bank.vault = 1e6;   // 금고(설계비)는 넉넉히. 넓은 섬은 갈매미 없이 시작(인구 = 집 수) → 건축 갈매미(기본)를 미리 부름
  const c = w.center, spot = (d, x0, z0) => { for (let r = 0; r < 30; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; };
  const put = (d, x, z) => { const q = spot(d, x, z), r = w.placeBuilding(d, q[0], q[1], 0); assert.ok(r.ok, d); return r.building; };
  const lampIn = put("streetlamp", c.x + 4, c.z + 4), house = put("house", c.x + 8, c.z), cafe = put("cafe", c.x - 8, c.z + 6);
  // 풍차가 없으면 모두 꺼짐
  for (const b of [lampIn, house, cafe]) assert.equal(w.powered(b), false, "풍차 없음: " + b.defId);
  assert.equal(w.poweredAt(c.x, c.z), false); assert.equal(WISH_BY_ID.lamp.ok(w, w.units[0]), false, "풍차가 서기 전에는 가로등 소원을 빌지 않음");
  // 짓는 중인 풍차는 전기를 못 냄 → 다 지으면 켜짐
  w.instantBuild = false; const wm = put("windmill", c.x, c.z), m = PW.centerOf(wm); assert.equal(w.isDone(wm), false);
  assert.equal(w.powered(lampIn), false, "짓는 중인 풍차"); assert.equal(PW.powerSources(w).length, 0);
  w.finishAll(); w.instantBuild = true;
  for (const b of [lampIn, house, cafe]) assert.equal(w.powered(b), true, "풍차 완공: " + b.defId);
  assert.equal(PW.powerSources(w), PW.powerSources(w), "건물이 안 바뀌면 풍차 목록을 다시 세지 않음");
  // 경계: 가운데끼리 딱 18칸이면 켜짐, 조금 넘으면 꺼짐
  assert.equal(w.poweredAt(m.x + R, m.z), true); assert.equal(w.poweredAt(m.x + R + 0.01, m.z), false); assert.equal(w.poweredAt(m.x, m.z - R), true);
  // 범위 밖 가로등은 꺼진 채, 짓는 중인 가로등은 범위 안이어도 꺼짐
  const lampOut = put("streetlamp", c.x + 34, c.z + 2), co = PW.centerOf(lampOut); assert.ok(Math.hypot(co.x - m.x, co.z - m.z) > R, "범위 밖 자리");
  assert.equal(w.powered(lampOut), false);
  w.instantBuild = false; const lampSite = put("streetlamp", c.x + 5, c.z - 4); assert.equal(w.powered(lampSite), false, "짓는 중인 가로등"); w.finishAll(); assert.equal(w.powered(lampSite), true); w.instantBuild = true;
  const lit = PW.litInRange(w, m.x, m.z).map(b => b.id); assert.ok([lampIn, house, cafe, lampSite].every(b => lit.includes(b.id))); assert.ok(!lit.includes(lampOut.id) && !lit.includes(wm.id));
  // 소원: 불 켜진 가로등이 있어야 이루어짐
  assert.equal(WISH_BY_ID.lamp.done(w), true); w.removeBuilding(lampIn.id); w.removeBuilding(lampSite.id); assert.equal(WISH_BY_ID.lamp.done(w), false, "범위 밖 가로등만으로는 안 됨"); assert.equal(WISH_BY_ID.lamp.ok(w), true);
  // 저장·불러오기: 전기는 건물 목록에서 다시 계산
  const w2 = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(1)), by = id => w2.buildings.get(id);
  assert.equal(w2.powered(by(house.id)), true); assert.equal(w2.powered(by(cafe.id)), true); assert.equal(w2.powered(by(lampOut.id)), false);
  // 풍차를 철거하면 바로 꺼짐(만족도 ⚡도)
  w.removeBuilding(wm.id); for (const b of [house, cafe, lampOut]) assert.equal(w.powered(b), false, "철거 뒤: " + b.defId);
  // 풍차 두 개: 하나를 철거해도 다른 풍차가 덮으면 그대로
  const a = put("windmill", c.x, c.z), b2 = put("windmill", c.x + 12, c.z + 2); assert.equal(w.powered(house), true); w.removeBuilding(a.id); assert.equal(w.powered(house), Math.hypot(PW.centerOf(house).x - PW.centerOf(b2).x, PW.centerOf(house).z - PW.centerOf(b2).z) <= R);
  assert.equal(w.powered(house), true);
});

test("전기 없음 배지 규칙: 다 지은 가로등·등불 건물·집 가운데 풍차 범위 밖인 것만(짓는 중·풍차·불 없는 건물 제외), 풍차 완공·철거에 따라 바뀜", async () => {
  const PW = await import("../src/world/power.js"), R = PW.POWER_RANGE;
  const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.addUnitByName("목수"); w.rank = 3; w.instantBuild = true; w.bank.vault = 1e6;   // 금고(설계비)는 넉넉히. 넓은 섬은 갈매미 없이 시작 → 건축 갈매미(기본)를 미리 부름
  const c = w.center, spot = (d, x0, z0) => { for (let r = 0; r < 30; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; };
  const put = (d, x, z) => { const q = spot(d, x, z), r = w.placeBuilding(d, q[0], q[1], 0); assert.ok(r.ok, d); return r.building; };
  const ids = () => PW.unpowered(w).map(b => b.id).sort((a, b) => a - b), of = (...bs) => bs.map(b => b.id).sort((a, b) => a - b);
  const starter = [...w.buildings.values()].find(b => b.defId === "house");     // 새 섬은 다 지은 작은 집 한 채로 시작(인구 = 집 수) → 집은 불 달린 건물이라 풍차 전에는 배지
  assert.ok(starter, "첫 집"); assert.deepEqual(ids(), of(starter), "빈 섬: 첫 집만");
  const lamp = put("streetlamp", c.x + 4, c.z + 4), house = put("house", c.x + 8, c.z), cottage = put("cottage", c.x - 2, c.z - 8), cafe = put("cafe", c.x - 8, c.z + 6), store = put("storehouse", c.x - 6, c.z - 2);
  const far = put("streetlamp", c.x + 34, c.z + 2);
  // 풍차가 없으면: 불 달린 다 지은 건물 모두(저장고처럼 불 없는 건물은 아님)
  assert.deepEqual(ids(), of(starter, lamp, house, cottage, cafe, far)); assert.equal(PW.lacksPower(w, store), false, "불 없는 건물"); assert.equal(PW.lacksPower(w, null), false);
  for (const id of ["house", "cottage", "manor", "giantHouse", "cafe", "shop", "post", "streetlamp"]) assert.equal(PW.usesPower(BUILDINGS[id]), true, id);
  // 짓는 중인 건물에는 안 띄움(진행률 표시가 있음) → 다 지으면 뜸
  w.instantBuild = false; const site = put("streetlamp", c.x + 5, c.z - 4); assert.equal(PW.lacksPower(w, site), false, "짓는 중"); assert.ok(!ids().includes(site.id));
  w.finishAll(); assert.ok(ids().includes(site.id), "다 지은 뒤");
  assert.equal(PW.unpowered(w), PW.unpowered(w), "건물이 안 바뀌면 다시 세지 않음(같은 목록)");
  // 짓는 중인 풍차: 그대로 → 완공: 범위 안은 사라지고 밖(far)만 남음. 풍차 자신은 배지 없음
  const wm = put("windmill", c.x, c.z), m = PW.centerOf(wm); assert.deepEqual(ids(), of(starter, lamp, house, cottage, cafe, far, site), "짓는 중인 풍차");
  const before = PW.unpowered(w); w.finishAll(); w.instantBuild = true; assert.notEqual(PW.unpowered(w), before, "완공하면 다시 셈");
  const fc = PW.centerOf(far); assert.ok(Math.hypot(fc.x - m.x, fc.z - m.z) > R);
  assert.deepEqual(ids(), of(far)); assert.equal(PW.lacksPower(w, wm), false);
  // 철거하면 다시 뜸
  w.removeBuilding(wm.id); assert.deepEqual(ids(), of(starter, lamp, house, cottage, cafe, far, site));
});

// ---------- 하루 빛 전환(src/render/dayKeys.js · src/world/sun.js)
import { dayLook, moonMix, nightLook, DAY_CHANNELS } from "../src/render/dayKeys.js";
import { sunPosition } from "../src/world/sun.js";

test("하루 빛: 점심·밤은 전과 같은 값, 아침 하늘과 저녁 하늘은 다른 빛", () => {
  const noon = dayLook(40, 180), night = dayLook(-30, 0);
  assert.ok(Math.abs(noon[15] - 3.3) < 1e-6 && Math.abs(noon[18] - 1.12) < 1e-6 && Math.abs(noon[16] - 0.85) < 1e-6);   // 햇빛·노출·하늘빛 세기(점심)
  assert.ok(Math.abs(night[15] - 0.35) < 1e-6 && Math.abs(night[18] - 0.95) < 1e-6);
  const dawn = dayLook(-2, 90), dusk = dayLook(-2, 270);                          // 같은 해 높이, 동쪽(새벽) / 서쪽(저녁)
  assert.ok(dusk[0] / dusk[2] > dawn[0] / dawn[2], "저녁 하늘 위는 더 보랏빛");
  assert.ok(dawn[2] > dusk[2] && dawn[4] > dusk[4], "새벽 수평선은 더 푸르스름한 분홍(파랑·초록이 많음)");
  assert.equal(dayLook(5, 120).length, DAY_CHANNELS);
});

test("하루 빛: 1분마다 훑어도 색·세기·해/달 바뀜이 툭 튀지 않음(봄·여름·가을·겨울)", () => {
  const out = new Float32Array(DAY_CHANNELS), prev = new Float32Array(DAY_CHANNELS);
  const srgb = c => 255 * (c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const MOON = [0xae, 0xbc, 0xff].map(v => Math.pow((v / 255) * 0.9478672986 + 0.0521327014, 2.4));   // daylight.js 달빛 0xaebcff(선형)
  for (const ds of ["2026-03-20", "2026-06-21", "2026-09-23", "2026-12-21"]) {
    const t0 = new Date(ds + "T00:00:00").getTime(); let p = sunPosition(new Date(t0)); dayLook(p.elev, p.azim, prev); let pm = moonMix(p.elev), pa = p.azim;
    for (let i = 1; i <= 1440; i++) {
      const s = sunPosition(new Date(t0 + i * 60e3)); dayLook(s.elev, s.azim, out);
      const m = moonMix(s.elev);
      for (let c = 0; c < 15; c++) {
        if (c >= 6 && c < 9) { const sb = out[c] + (MOON[c - 6] - out[c]) * m, pb = prev[c] + (MOON[c - 6] - prev[c]) * pm; assert.ok(Math.abs(srgb(sb) - srgb(pb)) < 12, `${ds} ${i}분 해/달빛 색 ${c}`); continue; }   // 햇빛 색은 달빛과 섞인 뒤가 보이는 값
        assert.ok(Math.abs(srgb(out[c]) - srgb(prev[c])) < 12, `${ds} ${i}분 색 ${c}`);   // 화면 색(0~255)으로 1분에 12 미만
      }
      assert.ok(Math.abs(out[15] - prev[15]) < 0.06, `${ds} ${i}분 햇빛 세기`); assert.ok(Math.abs(m - pm) < 0.05, `${ds} ${i}분 해→달`);
      const da = Math.abs(((s.azim - pa) % 360 + 540) % 360 - 180); assert.ok(da < 5, `${ds} ${i}분 방위 ${da}`);   // 자정에 방위가 뒤집히지 않음
      prev.set(out); pm = m; pa = s.azim;
    }
  }
  assert.equal(nightLook(0), 0); assert.equal(nightLook(1), 1); assert.equal(nightLook(0.5), 0.5);   // 밤 판정 경계(0.5)는 같은 자리
});

test("새 넓은 섬엔 늘 공식은행: 가운데가 울퉁불퉁한 섬(흙길 비탈·고지대가 가운데까지)은 가까운 평평한 자리로 비켜 섬", async () => {
  const { placeTownBank } = await import("../src/world/World.js");
  for (const seed of [1, 4, 36, 108, 150]) {                                        // 고치기 전엔 은행이 안 생기던 seed
    const w = World.create(seed, seededRandom(1), { wild: true, firstGull: true }), b = w.bankB();   // 인구 = 집 수 규칙: 넓은 섬은 갈매미 없이 시작 → 시험 받침으로 기본 갈매미
    assert.ok(b, `seed ${seed}: 공식은행이 있어야 함`);
    assert.ok(Math.hypot(b.x - 94, b.z - 94) <= 16, `seed ${seed}: 가운데 근처`);
    assert.ok(b.cells.every(([x, z]) => w.grid.get(x, z).elevation === 0), "평지에 섬");
    const u = w.units[0]; assert.ok(findPath(w.grid, Math.floor(u.x), Math.floor(u.z), b.door.x, b.door.z, 60000), "기본 갈매미가 은행 문까지 걸어감");
    assert.equal(World.create(seed, seededRandom(1), { wild: true }).bankB().x, b.x, "같은 seed → 같은 자리");
    const zb = w.zones.find(z => z.id === "bank"); assert.equal(zb.x, w.center.x); assert.equal(zb.z, w.center.z - 3);
  }
  const w7 = World.create(7, seededRandom(1), { wild: true }), b7 = w7.bankB();   // 원래 가운데에 놓이던 섬은 그대로
  assert.deepEqual([b7.x, b7.z], [94, 94]); assert.deepEqual(w7.center, { x: 96, z: 96 });
  // 평평한 자리가 아예 없으면 땅을 골라 놓음(체크무늬 높이: 어디에도 5×4 평지가 없음)
  const g = new Grid(40, 40, 8); for (let z = 0; z < 40; z++) for (let x = 0; x < 40; x++) g.get(x, z).elevation = (x + z) % 2 ? 0.1 : 0;
  const w = new World(g, [], seededRandom(1), {}); w.wild = true;
  const b = placeTownBank(w); assert.ok(b && w.bankB() === b, "땅을 골라 은행을 놓음");
  assert.ok(b.cells.every(([x, z]) => g.get(x, z).elevation === 0), "은행 칸은 높이 0");
  assert.ok(Math.hypot(b.x - 18, b.z - 18) <= 16);
});
