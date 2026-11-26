// 게임성 묶음 2 시험: 단차 채광·재료 한번에 모아 짓기·밭 물주기·작물 자라는 시간. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { Grid } from "../src/world/Grid.js";
import { seededRandom } from "../src/util.js";
import { MAX_STEP } from "../src/config.js";
import { interactNear, workCells, siteNeed, spareStock, LOAD_MAX } from "../src/units/unitBrain.js";
import { findPath } from "../src/world/pathfinding.js";
import { checkPlacement } from "../src/world/placement.js";
import { BUILDINGS } from "../src/data/catalog.js";
import * as E from "../src/world/economy.js";

/** 은행 문에서 걸어갈 수 있는 빈 자리(자리 규칙만 봄) */
const spotFor = (w, d, dx = 6, dz = 9) => { const c = w.center, bk = w.bankB().door;
  for (let r = 4; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + dx + Math.cos(a) * r), z = Math.floor(c.z + dz + Math.sin(a) * r), ck = checkPlacement(w.grid, BUILDINGS[d], x, z, 0, w.units); if (ck.ok && findPath(w.grid, bk.x, bk.z, ck.door.x, ck.door.z)) return [x, z]; }
  return null; };
/** 공사장(설계비 없이, 0%에서) */
const site = (w, d, dx, dz) => { const s = spotFor(w, d, dx, dz); return w.placeBuilding(d, s[0], s[1], 0, null, 0).building; };

/** 왼쪽(x<12) 0 m, 오른쪽(x≥12) 0.5 m(두 단 = 절벽). ramp면 맨 위 줄(z=0)에 한 단씩 오르는 비탈을 둠. 대상(광석·나무)은 아래층 (11,12) */
function cliffWorld(kind, ramp) {
  const g = new Grid(24, 24, 24);
  for (let z = 0; z < 24; z++) for (let x = 0; x < 24; x++) { g.get(x, z).groundType = "Grass"; g.get(x, z).elevation = x >= 12 ? 0.5 : 0; }
  if (ramp) g.get(12, 0).elevation = 0.25;
  const w = new World(g, [{ id: "m1", defId: kind, cells: [[11, 12]] }], seededRandom(3)); w.isNight = false;
  w.addUnitByName("기본"); const u = w.units[0]; u.x = 13.5; u.z = 12.5; u.y = 0.5; u.full = 90;
  return { w, g, u, t: (kind === "ore" ? w.ores : w.trees)[0] };
}
test("단차 채광: 절벽 위(0.5 m)에서 아래층(0 m) 광석·나무는 못 캐고, 같은 높이 칸까지 길이 있으면 그 칸에서 캔다", () => {
  for (const kind of ["ore", "tree"]) {
    const a = cliffWorld(kind, false);
    assert.equal(workCells(a.g, 11, 12).some(([x]) => x >= 12), false, "절벽 위 칸은 일하는 칸이 아님");
    let hits = 0; a.w.on(kind === "ore" ? "oreHit" : "treeHit", () => hits++);
    assert.equal(interactNear(a.u, a.w, seededRandom(1), 3), null, `${kind}: 아래층으로 가는 길이 없으면 못 함`);
    for (let i = 0; i < 400; i++) { a.u.full = 90; a.w.update(0.05); }
    assert.equal(hits, 0, `${kind}: 절벽 위에서 캐지 않음`);
    const b = cliffWorld(kind, true); let diff = 0, hb = 0;   // 비탈로 내려갈 수 있으면 아래층 이웃 칸에서
    b.w.on(kind === "ore" ? "oreHit" : "treeHit", () => { hb++; diff = Math.max(diff, Math.abs(b.g.walkHeight(Math.floor(b.u.x), Math.floor(b.u.z)) - 0)); });
    assert.equal(interactNear(b.u, b.w, seededRandom(1), 3)?.kind, kind === "ore" ? "mine" : "chop");
    for (let i = 0; i < 1600 && hb === 0; i++) { b.u.full = 90; b.w.update(0.05); }
    for (let i = 0; i < 100; i++) { b.u.full = 90; b.w.update(0.05); }
    assert.ok(hb > 0, `${kind}: 내려가서 캠`); assert.ok(diff <= MAX_STEP + 1e-6, `${kind}: 서서 캔 칸 높이 차 ${diff}`);
  }
});

test("재료 한번에 모으기: 공사를 맡으면 남은 재료를 다 모은 뒤(은행 창고 → 벌목·채광) 한 번만 가서 짓고, 짓다가 재료 구하러 떠나지 않음 · 품삯은 바퀴마다 그대로", () => {
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }); w.isNight = false;
  const u = w.units[0], b = site(w, "cottage"); w.res.wood = 4; w.res.stone = 0; u.inv = E.newBag();
  const plan = siteNeed(b, u); assert.deepEqual(plan.total, { wood: 5, stone: 5 }, "2층집: 일반 건축가 0.8 × 3 → 다섯 바퀴 × 나무 1·돌 1");
  assert.ok(plan.tripCycles === plan.cycles && 10 <= LOAD_MAX, "한 번에 들 수 있음");
  const wages0 = w.bank.wages; let prev = null, arrive = 0, leave = 0, fetched = false, gathered = false, firstBuild = null;
  for (let t = 0; t < 1500 && !w.isDone(b); t += 0.05) {
    u.full = 90; u.needs.energy = 100; w.update(0.05);
    if (u.state === "GoFetch") fetched = true;
    if (["GoChop", "Chop", "GoMine", "Mine"].includes(u.state) && u.committed === b.id) gathered = true;
    if (u.state === "Build" && prev === "GoBuild") { arrive++; firstBuild ??= { wood: u.inv.wood + (u.load?.wood || 0) + 1, stone: u.inv.stone + (u.load?.stone || 0) + 1 }; }   // 도착하며 첫 바퀴 몫(1·1)을 이미 씀
    if (prev === "Build" && u.state !== "Build" && !w.isDone(b)) leave++;
    prev = u.state;
  }
  assert.ok(w.isDone(b), `완공: ${b.hits}/${b.need}`);
  for (let t = 0; t < 2; t += 0.05) { u.full = 90; w.update(0.05); }          // 마지막 망치질 동작이 끝나면 마지막 품삯
  assert.ok(fetched, "은행 창고의 나무 4개를 먼저 꺼내 옴"); assert.ok(gathered, "모자란 것(나무 1·돌 5)은 캐서 모음");
  assert.ok(firstBuild.wood >= 5 && firstBuild.stone >= 5, `처음 망치질할 때 다 들고 있음: ${JSON.stringify(firstBuild)}`);
  assert.equal(arrive, 1, "공사장에 한 번만 감"); assert.equal(leave, 0, "짓다가 떠나지 않음");
  assert.equal(w.bank.wages - wages0, plan.cycles * E.WAGE, "품삯은 한 바퀴마다");
  assert.equal(b.supply, null, "다 지으면 준비 표시도 지움"); assert.ok(!u.load, "남은 짐 없음(창고로 돌려놓음)"); assert.ok(w.res.wood >= 0 && w.res.stone >= 0);
});

test("재료 예약: 은행 창고의 자재는 먼저 가지러 간 건축가 몫으로 잡혀 다른 건축가가 겹쳐 가지러 가지 않고, 짐 한도를 넘는 큰 공사는 몫을 나눠 나름", () => {
  const w = World.create(7, seededRandom(5), { wild: true, firstGull: true }); w.isNight = false;
  const a = w.units[0], o = w.addUnitByName("꽃"); o.job = "builder"; o.rarity = "common"; o.x = a.x; o.z = a.z;
  const b1 = site(w, "house", 6, 9), b2 = site(w, "house", -8, 9); w.res.wood = 5;
  for (const u of [a, o]) { u.inv = E.newBag(); u.timer = 0; u.full = 90; u.needs.energy = 100; }
  a.committed = b1.id; o.committed = b2.id;                                    // 둘이 서로 다른 공사장을 맡음(맡은 공사가 먼저)
  w.update(0.05);
  const fetching = [a, o].filter(u => u.state === "GoFetch");
  assert.equal(fetching.length, 1, `한 명만 창고로: ${a.state}/${o.state}`);
  assert.equal(fetching[0].fetch.take.wood, 5, "작은 집 다섯 바퀴 몫 나무 5개를 예약");
  const other = fetching[0] === a ? o : a; assert.equal(spareStock(w, "wood", other), 0, "남은 건축가에겐 꺼낼 게 없음"); assert.notEqual(other.state, "GoFetch");
  for (const u of [a, o]) assert.ok(w.buildings.get(u.committed).supply?.by === u.unitId, "공사장에 누가 무엇을 모으는지 보임");
  // 큰 집(큰 집 work 12 → 36칸, 바퀴당 나무 3·돌 2): 한 번에 LOAD_MAX 안에서 바퀴 단위
  const big = siteNeed({ defId: "manor", need: 36, hits: 0 }, a);
  assert.equal(big.cycles, 15); assert.equal(big.tripCycles, Math.floor(LOAD_MAX / 5)); assert.ok(big.trip.wood + big.trip.stone <= LOAD_MAX);
});

test("밭 물주기 규칙: 촉촉함은 맑은 날 마르고(여름 빨리·겨울 천천히) 비에 젖으며, 마른 밭은 죽지 않고 1/4 빠르기로 자람", async () => {
  const FM = await import("../src/world/farming.js");
  const p = { moisture: 1 }; FM.stepMoisture(p, FM.DAY_SECS / 2, "autumn", "clear"); assert.ok(Math.abs(p.moisture - 0.55) < 1e-9, `가을 맑음 반나절: ${p.moisture}`);
  assert.ok(-FM.moistRate("summer", "clear") > -FM.moistRate("spring", "clear") && -FM.moistRate("winter", "clear") < -FM.moistRate("autumn", "cloudy") * 1.01, "여름 빨리, 겨울 천천히");
  FM.stepMoisture(p, FM.DAY_SECS / 10, "autumn", "rain"); assert.equal(p.moisture, 1, "비 한 시간이면 다 젖음");
  assert.equal(FM.waterFactor(1), 1); assert.equal(FM.waterFactor(FM.MOIST_OK), 1); assert.equal(FM.waterFactor(0), FM.MOIST_SLOW); assert.ok(FM.waterFactor(0.2) > FM.MOIST_SLOW && FM.waterFactor(0.2) < 1);
  // 마을: 같은 밭 두 칸(젖은 칸·마른 칸)을 같이 심으면 젖은 칸이 먼저 익고, 마른 칸도 결국 익음(죽지 않음)
  const w = World.create(7, seededRandom(3), { wild: true }); w.setSeason("autumn"); w.setWeather("cloudy"); w.weather.t = 1e9;
  const wet = { x: 1, z: 1, stage: "growing", t: 60, grow: 60, claimed: null, moisture: 1 }, dry = { x: 2, z: 1, stage: "growing", t: 60, grow: 60, claimed: null, moisture: 0 };
  w.plots.push(wet, dry); const ripeAt = {}; w.on("plot", q => { if (q.stage === "ripe") ripeAt[q === wet ? "wet" : "dry"] = w.time; });
  for (let t = 0; t < 400 && !ripeAt.dry; t += 0.5) { w.update(0.5); wet.moisture = 1; dry.moisture = 0; }
  assert.ok(ripeAt.wet < 61 && ripeAt.dry > 200, `젖은 칸 ${ripeAt.wet}초, 마른 칸 ${ripeAt.dry}초(1/4 빠르기 → 240초)`);
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(1));
  assert.equal(back.plots.find(q => q.x === 2 && q.z === 1).moisture, 0, "촉촉함은 저장됨");
});

test("밭 물주기: 농부가 물가에서 물을 떠(쪼기 동작) 마른 밭에 붓고(쪼그려 톡톡), 한 번 뜬 물로 3칸까지", () => {
  const w = World.create(7, seededRandom(4), { wild: true, firstGull: true }); w.isNight = false; w.setSeason("autumn"); w.setWeather("clear"); w.weather.t = 1e9;
  const f = w.addUnitByName("미니"); f.x = w.units[0].x; f.z = w.units[0].z;
  const s = spotFor(w, "field", -8, 8), field = w.placeBuilding("field", s[0], s[1], 0, null, 1e9).building, plots = w.plots.filter(p => p.field === field.id);
  for (const p of plots) { p.stage = "growing"; p.t = p.grow = 1e6; p.moisture = 0.1; }
  w.units[0].timer = 1e9; let fillAt = null, pours = 0, anims = new Set();
  w.on("plotWater", ({ u }) => { if (u === f) pours++; });
  for (let t = 0; t < 300 && pours < 3; t += 0.05) {
    f.full = 90; f.needs.energy = 100; w.units[0].timer = 1e9; w.update(0.05);
    if (f.state === "Water") { anims.add(f.anim); if (f.anim === "Attack" && !fillAt) fillAt = [Math.floor(f.x), Math.floor(f.z)]; }
  }
  assert.ok(fillAt, "물가에서 물을 뜸"); assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.grid.isWater(fillAt[0] + dx, fillAt[1] + dz)), `물 뜬 칸 옆이 물: ${fillAt}`);
  assert.ok(anims.has("Attack") && anims.has("Pave"), [...anims].join(","));
  assert.ok(pours >= 3, `밭 ${pours}칸에 물을 줌`); assert.equal(plots.filter(p => p.moisture > 0.9).length >= 3, true);
});
