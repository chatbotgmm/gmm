// 건물 밑 바닥 칠하기·자동 맞춤(groundMatch.js): 건물 칸도 칠함, 밭·계단·나무는 거절, 길 연결은 건물을 지나지 않음, 둘레가 길이면 잔디만 맞춤
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { GroundType } from "../src/data/types.js";
import { roadNet, isPaved } from "../src/world/roads.js";
import { ringGround, MATCH_MIN } from "../src/world/groundMatch.js";

const town = () => { const w = World.create(7, seededRandom(2)); w.instantBuild = true; return w; };
/** 둘레까지 모두 잔디인 빈 땅(x-2~x+4, z-2~z+4) */
const grassy = (w, x, z) => { for (let dz = -2; dz <= 4; dz++) for (let dx = -2; dx <= 4; dx++) { const c = w.grid.get(x + dx, z + dz); if (!c || c.groundType !== GroundType.Grass || c.occupiedId || w.grid.isWater(x + dx, z + dz) || w.grid.doorOwner(x + dx, z + dz)) return false; } return true; };
/** 건물을 놓을 빈 자리(가운데에서 가까운 순) */
const spot = (w, defId, skip = () => false) => {
  const cx = Math.floor(w.center.x), cz = Math.floor(w.center.z);
  for (let r = 4; r < 30; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; const x = cx + dx, z = cz + dz;
    if (!skip(x, z) && grassy(w, x, z) && w.check(defId, x, z, 0).ok) return [x, z];
  }
  return null;
};

test("건물 칸도 칠할 수 있고, 칠한 건물 칸은 길 연결에 들지 않음", () => {
  const w = town(), [ax, az] = spot(w, "cottage"), b = w.placeBuilding("cottage", ax, az, 0).building;
  for (const [x, z] of b.cells) { assert.ok(w.canPaint(x, z), `건물 칸 ${x},${z}`); assert.ok(w.paint(x, z, GroundType.Cobble)); }
  assert.ok(b.cells.every(([x, z]) => w.grid.get(x, z).groundType === GroundType.Cobble));
  assert.ok(b.cells.every(([x, z]) => !isPaved(w, x, z)), "건물 칸은 포장도로가 아님");
  // 건물 양쪽에 돌길 한 칸씩: 건물 밑이 돌길이어도 두 칸은 다른 도로망(건물은 지나갈 수 없음)
  const xs = b.cells.map(c => c[0]), zs = b.cells.map(c => c[1]), x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, zm = Math.min(...zs);
  assert.ok(w.paint(x0, zm, GroundType.Cobble) && w.paint(x1, zm, GroundType.Cobble));
  const net = roadNet(w), W = w.grid.w;
  assert.ok(net[zm * W + x0] >= 0 && net[zm * W + x1] >= 0);
  assert.notEqual(net[zm * W + x0], net[zm * W + x1], "건물 밑 돌길이 양쪽을 잇지 않음");
  // 철거하면 칠한 바닥이 그대로 남고, 그때부터는 길로 이어짐
  w.removeBuilding(b.id);
  assert.equal(w.grid.get(b.cells[0][0], b.cells[0][1]).groundType, GroundType.Cobble);
  const net2 = roadNet(w); assert.equal(net2[zm * W + x0], net2[zm * W + x1]);
});

test("밭·계단·나무 칸, 물 칸은 지금처럼 칠할 수 없음", () => {
  const w = town(), [fx, fz] = spot(w, "field"), f = w.placeBuilding("field", fx, fz, 0).building;
  for (const [x, z] of f.cells) assert.equal(w.canPaint(x, z), false, "밭");
  const t = w.trees[0]; assert.ok(t); assert.equal(w.canPaint(t.x, t.z), false, "나무");
  assert.equal(w.paint(0, 0, GroundType.Cobble), false, "바다");
  const st = [...w.buildings.values()].find(b => b.ramp);
  if (st) for (const [x, z] of st.cells) assert.equal(w.canPaint(x, z), false, "계단");
});

test("자동 맞춤: 둘레가 돌길이면 건물 밑 잔디가 돌길로, 칠한 바닥은 그대로", () => {
  const w = town(), [ax, az] = spot(w, "cottage"), probe = w.placeBuilding("cottage", ax, az, 0).building, cells = probe.cells.map(c => [...c]);
  w.removeBuilding(probe.id);
  const own = new Set(cells.map(c => c.join())), ring = [];
  for (const [cx, cz] of cells) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const k = `${cx + dx},${cz + dz}`; if (!own.has(k) && !ring.includes(k)) ring.push(k); }
  for (const k of ring) w.paint(...k.split(",").map(Number), GroundType.Cobble);
  w.paint(...cells[0], GroundType.WoodDeck);                                   // 플레이어가 미리 칠한 칸
  const seen = []; w.on("ground", e => seen.push(e));
  const b = w.placeBuilding("cottage", ax, az, 0).building;
  assert.equal(w.grid.get(...cells[0]).groundType, GroundType.WoodDeck, "칠한 칸은 덮어쓰지 않음");
  for (const [x, z] of cells.slice(1)) assert.equal(w.grid.get(x, z).groundType, GroundType.Cobble);
  assert.equal(seen.length, cells.length - 1); assert.ok(seen.every(e => e.type === undefined), "부탁(포장도로 칠하기)에 세지 않게 type 없이");
  assert.ok(ringGround(w, b).share >= MATCH_MIN);
  w.removeBuilding(b.id); assert.equal(w.grid.get(...cells[1]).groundType, GroundType.Cobble, "철거해도 그대로");
});

test("자동 맞춤: 둘레가 반쯤만 길이면, 또 불러오기에선 바꾸지 않음", () => {
  const w = town(), [ax, az] = spot(w, "cottage"), probe = w.placeBuilding("cottage", ax, az, 0).building, cells = probe.cells.map(c => [...c]);
  w.removeBuilding(probe.id);
  const own = new Set(cells.map(c => c.join())), ring = [];
  for (const [cx, cz] of cells) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const k = `${cx + dx},${cz + dz}`; if (!own.has(k) && !ring.includes(k)) ring.push(k); }
  ring.slice(0, Math.floor(ring.length / 2)).forEach(k => w.paint(...k.split(",").map(Number), GroundType.Cobble));
  w.placeBuilding("cottage", ax, az, 0);
  assert.ok(cells.every(([x, z]) => w.grid.get(x, z).groundType === GroundType.Grass), "절반이면 잔디 그대로");
  // 불러오기(placeBuilding에 hits를 넘김)는 저장된 바닥을 그대로
  const w2 = town(); ring.forEach(k => w2.paint(...k.split(",").map(Number), GroundType.Cobble));
  w2.placeBuilding("cottage", ax, az, 0, null, 1e9);
  assert.ok(cells.every(([x, z]) => w2.grid.get(x, z).groundType === GroundType.Grass));
});

test("paintableUnder: 계단·다리·밭·모듈(나무 등)은 밑을 칠하지 않음", async () => {
  const { paintableUnder } = await import("../src/world/groundMatch.js");
  const w = { buildings: new Map([["s", { defId: "stairs", ramp: {} }], ["b", { defId: "bridge" }], ["f", { defId: "field" }], ["h", { defId: "cottage" }]]) };
  assert.equal(paintableUnder(w, null), true); assert.equal(paintableUnder(w, "h"), true);
  for (const id of ["s", "b", "f", "m1"]) assert.equal(paintableUnder(w, id), false, id);
});
