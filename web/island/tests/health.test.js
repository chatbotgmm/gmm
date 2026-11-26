// 체온·추위 행동·옷·감기·의원 시험(갈매미에 붙인 규칙). node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { BUILDINGS } from "../src/data/catalog.js";
import * as CLIM from "../src/world/climate.js";

/** 넓은 섬 + 기본 갈매미(첫 집 주인) · 낮 · 겨울 날씨 고정 */
function winterVillage(seed = 3, weather = "snow", snow = 1) {
  const w = World.create(7, seededRandom(seed), { wild: true, firstGull: true }); w.isNight = false; w.instantBuild = true;
  const u = w.units[0], h = [...w.buildings.values()].find(b => BUILDINGS[b.defId].house); h.owner = u.unitId; u.home = h.id;
  w.setSeason("winter"); w.setWeather(weather); w.weather.t = 1e9; w.snow = snow;
  return { w, u, h };
}
const placeNear = (w, defId, x0, z0) => { for (let r = 3; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); const q = w.placeBuilding(defId, x, z, 0, null, 1e9); if (q.ok) return q.building; } return null; };

test("체온: 겨울 눈 오는 날 밖에서 식고(꽁꽁까지), 계절을 모르거나 가을이면 40.0 그대로", () => {
  const { w, u } = winterVillage(); u.home = null;                              // 집이 없어도 공공건물(은행)로 녹이러 가므로, 식는 것만 보려고 은행도 못 쓰게
  w.air = w.airNow(); assert.equal(w.air, 1 + 2 - 2 - 2, "겨울(1) 낮(+2) 눈(−2) 쌓인 눈(−2) → −1");
  for (let t = 0; t < 10; t += 0.1) w.update(0.1);
  assert.ok(u.bodyT < 40, `식기 시작 ${u.bodyT}`);
  const a = World.create(7, seededRandom(3), { wild: true, firstGull: true }); a.isNight = false; a.setSeason("autumn");
  for (let t = 0; t < 120; t += 0.1) a.update(0.1); assert.equal(a.units[0].bodyT, 40, "가을엔 그대로");
  const n = World.create(7, seededRandom(3), { wild: true, firstGull: true }); for (let t = 0; t < 60; t += 0.1) n.update(0.1); assert.equal(n.units[0].bodyT, 40, "계절을 모르면(시험) 그대로");
});

test("추우면 몸 녹이러 집에 들어가 체온 39.6까지 있다가 나옴 · 만족도 −8 · 배고픔 ×1.1 · 능률 ×0.85 · 처음 추워지면 feltCold +1·chill 알림", () => {
  const { w, u, h } = winterVillage(); for (const o of w.units) o.full = 90;
  const chills = []; w.on("chill", e => chills.push(e.u.name));
  u.bodyT = 39.05; u.state = "Idle"; u.timer = 0; u.needs.energy = 90;
  let went = false, inside = false, out = false, tIn = 0;
  for (let t = 0; t < 300 && !out; t += 0.1) {
    u.full = 90; w.update(0.1);
    if (u.state === "GoToBuilding" && u.goFor === "warm") went = true;
    if (u.insideBuildingId === h.id && u.insideAct === "warm") { inside = true; tIn += 0.1; }
    if (inside && !u.insideBuildingId) out = true;
  }
  assert.ok(went && inside && out, `집에 가서(${went}) 들어갔다(${inside}) 나옴(${out})`);
  assert.ok(u.bodyT >= CLIM.WARM_DONE - 0.05, `녹고 나옴 ${u.bodyT}`); assert.ok(tIn > 20 && tIn < 120, `안에 있던 시간 ${tIn.toFixed(1)}초`);
  assert.deepEqual(chills, ["기본"]); assert.ok(u.feltCold >= 1);
  // 만족도 −8(추울 때만)
  u.bodyT = 38.9; w.updateRoads(); assert.ok(u.satParts.some(p => p[0] === "🥶 추움" && p[1] === -8)); u.bodyT = 40; w.updateRoads(); assert.ok(!u.satParts.some(p => p[0] === "🥶 추움"));
  // 배고픔 ×1.1 · 능률 ×0.85(같은 상태 둘을 한 프레임 돌려 비교)
  const z = winterVillage(4), v = z.u; z.w.update(0.01); v.full = 80; v.bodyT = 39.5; v.state = "Held"; z.w.season = null; z.w.rankClock = -1e9; z.w.update(1);
  const warmDrop = 80 - v.full, warmEff = v.eff; v.full = 80; v.bodyT = 38.95; z.w.update(1);
  assert.ok(Math.abs((80 - v.full) / warmDrop - CLIM.COLD_HUNGER) < 1e-6, "배고파짐 ×1.1"); assert.ok(Math.abs(v.eff / warmEff - CLIM.COLD_EFF) < 1e-6, "능률 ×0.85");
});

test("집이 없으면: 카페가 있고 돈이 있으면 코코아(2🪙 → 금고, 체온 +0.6), 돈이 없으면 가까운 공공건물(은행)에 무료로 들어가 녹임", () => {
  const { w, u } = winterVillage(5); for (const o of w.units) o.full = 90;
  const hb = w.buildings.get(u.home); hb.owner = null; u.home = null;
  const cafe = placeNear(w, "cafe", u.x, u.z); assert.ok(cafe);
  u.coins = 5; u.bodyT = 38.95; u.state = "Idle"; u.timer = 0; const v0 = w.bank.vault, r0 = w.bank.returned;
  const cocoa = []; w.on("cocoa", e => cocoa.push(e.price));
  let inCafe = false; for (let t = 0; t < 200 && !inCafe; t += 0.1) { u.full = 90; w.update(0.1); if (u.insideBuildingId === cafe.id) inCafe = true; }
  assert.ok(inCafe, "카페로"); assert.deepEqual(cocoa, [2]); assert.equal(u.coins, 3); assert.equal(w.bank.vault - v0, 2); assert.equal(w.bank.returned - r0, 2, "돌아온 돈으로 셈(금고 항등식 그대로)");
  assert.equal(u.insideAct, "warm");
  // 돈이 없으면 공공건물(가까운 것: 카페도 공공건물이라 무료로 들어감, 코코아는 없음)
  for (let t = 0; t < 200 && u.insideBuildingId; t += 0.1) { u.full = 90; w.update(0.1); }
  w.removeBuilding(cafe.id); u.coins = 0; u.bodyT = 38.95; u.state = "Idle"; u.timer = 0;
  let inBank = false; for (let t = 0; t < 300 && !inBank; t += 0.1) { u.full = 90; w.update(0.1); if (u.insideBuildingId && w.buildings.get(u.insideBuildingId).defId === "bank") inBank = true; }
  assert.ok(inBank, "은행에서 몸을 녹임(무료)"); assert.equal(cocoa.length, 1);
});

test("잘 시간이고 밖이 추우면 몸 녹이던 건물에서 그대로 잠 · 밖에서 자다가 추워지면 일어나 녹이러 감", () => {
  const { w, u } = winterVillage(6); for (const o of w.units) o.full = 90;
  const hb = w.buildings.get(u.home); hb.owner = null; u.home = null;          // 집 없는 갈매미
  w.isNight = true; u.state = "Sleep"; u.timer = 30; u.bodyT = 38.95;
  let sheltered = null; for (let t = 0; t < 200 && !sheltered; t += 0.1) { u.full = 90; w.update(0.1); if (u.insideBuildingId) sheltered = w.buildings.get(u.insideBuildingId); }
  assert.ok(sheltered && sheltered.defId === "bank", "밖에서 자다가 깨어 은행으로");
  for (let t = 0; t < 200; t += 0.1) { u.full = 90; w.update(0.1); }
  assert.equal(u.insideBuildingId, sheltered.id, "밤새 안에서(체온이 다 올라도)"); assert.ok(u.bodyT > 39.9);
  w.isNight = false; let out = false; for (let t = 0; t < 30 && !out; t += 0.1) { u.full = 90; w.update(0.1); if (!u.insideBuildingId) out = true; }
  assert.ok(out, "아침이면 나옴");
});

test("검토 수정: 집 문까지 길이 끊긴 갈매미도 추우면 가까운 공공건물(은행)에서 녹임(예전엔 집 하나만 보고 포기해 겨울 내내 밖에서 떪)", () => {
  const { w, u, h } = winterVillage(8); for (const o of w.units) o.full = 90;
  w.grid.setElevation(h.door.x, h.door.z, -1); w.recomputeComps?.();           // 집 문 칸을 물로: 집은 그대로 내 집이지만 걸어갈 수 없음
  u.coins = 0; u.bodyT = 38.95; u.state = "Idle"; u.timer = 0; u.needs.energy = 90;
  let warmB = null; for (let t = 0; t < 300 && !warmB; t += 0.1) { u.full = 90; w.update(0.1); if (u.insideBuildingId && u.insideAct === "warm") warmB = w.buildings.get(u.insideBuildingId); }
  assert.ok(warmB && warmB.defId === "bank", `은행에서 녹임(${warmB?.defId})`);
});

test("검토 수정: 녹일 곳이 하나도 없으면 밖에서 자던 갈매미가 두 프레임마다 깼다 잤다 하지 않고 그대로 잠", () => {
  const { w, u } = winterVillage(9, "clear", 0); w.instantBuild = false;
  for (const b of w.buildings.values()) { b.owner = null; b.hits = 0; } u.home = null;   // 다 지은 집·공공건물이 없는 겨울 마을
  w.isNight = true; u.state = "Sleep"; u.timer = 15; u.bodyT = 38.95; u.needs.energy = 15;
  let flips = 0, last = u.state, slept = 0;
  for (let t = 0; t < 60; t += 0.1) { u.full = 90; w.update(0.1); if (u.state !== last) { flips++; last = u.state; } if (u.state === "Sleep") slept += 0.1; }
  assert.ok(u.bodyT <= CLIM.COLD_AT, `추운 채로(${u.bodyT.toFixed(2)})`);
  assert.ok(flips <= 4, `상태가 바뀐 횟수 ${flips}`); assert.ok(slept > 55, `잔 시간 ${slept.toFixed(1)}초`);
});

test("저장·불러오기: 체온·추웠던 횟수 · 예전 저장(칸 없음)은 40.0 · 0", () => {
  const { w, u } = winterVillage(7); u.bodyT = 38.74; u.feltCold = 3;
  const j = JSON.parse(JSON.stringify(w.serialize())); assert.equal(j.units[0].bodyT, 38.7);
  const back = World.fromJSON(j, seededRandom(1)); assert.equal(back.units[0].bodyT, 38.7); assert.equal(back.units[0].feltCold, 3);
  delete j.units[0].bodyT; delete j.units[0].feltCold; const old = World.fromJSON(j, seededRandom(1)); assert.equal(old.units[0].bodyT, 40); assert.equal(old.units[0].feltCold, 0);
});

test("옷: 털목도리는 14°C 이하, 누빔 외투는 4°C 이하에 입고(가진 것만), 보온은 4·8 · 겨울 낮 목도리면 추워지지 않음", async () => {
  const CLO = await import("../src/world/clothes.js");
  const u = { clothes: ["scarf", "coat"], wear: CLO.emptyWear() };
  assert.deepEqual(CLO.outfitFor(u, 15), { neck: null, body: null, head: null }); assert.deepEqual(CLO.outfitFor(u, 14), { neck: "scarf", body: null, head: null });
  assert.deepEqual(CLO.outfitFor(u, 4), { neck: "scarf", body: "coat", head: null }); assert.deepEqual(CLO.outfitFor({ clothes: ["coat"] }, 10), { neck: null, body: null, head: null }, "외투만 있으면 10°C엔 안 입음");
  let r = CLO.dress(u, 2); assert.equal(r.changed, true); assert.deepEqual(r.put, ["scarf", "coat"]); assert.equal(CLO.warmthOf(u), 12);
  r = CLO.dress(u, 2); assert.equal(r.changed, false, "그대로면 안 바꿈"); r = CLO.dress(u, 20); assert.equal(r.changed, true); assert.equal(CLO.warmthOf(u), 0, "따뜻하면 벗음");
  assert.equal(CLO.nextClothes({ clothes: [] }), "scarf"); assert.equal(CLO.nextClothes({ clothes: ["scarf"] }), "coat"); assert.equal(CLO.nextClothes({ clothes: ["scarf", "coat"] }), null);
  // 겨울 아침(−2°C 근처) 옷 없이 feel 0 → 38.5 추움, 목도리면 feel 4 → 39.1 괜찮음(설계 숫자)
  assert.ok(CLIM.bodyTarget(CLIM.feelTemp(-2, { working: true })) < CLIM.COLD_AT); assert.ok(CLIM.bodyTarget(CLIM.feelTemp(-2, { working: true, warmth: 4 })) > CLIM.COLD_AT);
});

test("잡화점에서 옷 사기: 추웠던 적이 있으면 자기 돈으로 목도리(6🪙 → 금고) → 바로 두르고, 추웠던 횟수는 0(외투는 다시 추워 봐야 삼)", () => {
  const { w, u } = winterVillage(8, "cloudy", 0.55); for (const o of w.units) o.full = 90;
  const shop = placeNear(w, "shop", u.x, u.z); assert.ok(shop && w.shopB());
  u.coins = 40; u.feltCold = 1; u.bodyT = 40; u.state = "Idle"; u.timer = 0; u.needs.energy = 90; const v0 = w.bank.vault;
  const bought = []; w.on("buyClothes", e => bought.push(e.id));
  for (let t = 0; t < 200 && !bought.length; t += 0.1) { u.full = 90; u.bodyT = 40; w.update(0.1); }
  assert.deepEqual(bought, ["scarf"]); assert.equal(u.coins, 34); assert.equal(w.bank.vault - v0, 6); assert.deepEqual(u.clothes, ["scarf"]); assert.equal(u.feltCold, 0);
  assert.equal(u.wear.neck, "scarf", "공기 −1.1°C(흐림·눈 0.55·낮) → 바로 두름"); assert.equal(w.warmthOf(u), 4);
  for (let t = 0; t < 60; t += 0.1) { u.full = 90; u.bodyT = 40; w.update(0.1); } assert.deepEqual(bought, ["scarf"], "다시 추워 보기 전엔 외투를 안 삼");
  // 돈이 밥값 두 번어치 + 값보다 적으면 안 삼
  u.feltCold = 1; u.coins = 14 + 2 * w.foodPrice() - 1; for (let t = 0; t < 60; t += 0.1) { u.full = 90; u.bodyT = 40; w.update(0.1); } assert.deepEqual(bought, ["scarf"]);
  // 잡화점이 없으면 안 삼
  w.removeBuilding(shop.id); u.coins = 100; for (let t = 0; t < 60; t += 0.1) { u.full = 90; u.bodyT = 40; w.update(0.1); } assert.deepEqual(bought, ["scarf"]);
});

test("도장 가게 '손뜨개 목도리': 도장 1개로 사서 주면 정이 두 배로 오르고 그 갈매미 옷이 되어 바로 두름 · 저장·예전 저장 호환", () => {
  const { w, u } = winterVillage(9); w.stamps = 1;
  assert.equal(w.buyStamp("knitScarf"), true); assert.equal(w.items.knitScarf, 1);
  const r = w.giveGift(u, "knitScarf"); assert.equal(r.tier, 1, "누구에게나 보통(고마워)"); assert.equal(u.bond, 4, "보통 2 × 도장 선물 2배");
  assert.deepEqual(u.clothes, ["scarf"]); assert.equal(u.wear.neck, "scarf"); assert.equal(w.warmthOf(u), 4);
  const j = JSON.parse(JSON.stringify(w.serialize())); const back = World.fromJSON(j, seededRandom(1)).units[0];
  assert.deepEqual(back.clothes, ["scarf"]); assert.equal(back.wear.neck, "scarf");
  j.units[0].clothes = ["scarf", "nope", "scarf"]; j.units[0].wear = { neck: "coat", body: "coat", head: 3 }; const odd = World.fromJSON(j, seededRandom(1)).units[0];
  assert.deepEqual(odd.clothes, ["scarf"]); assert.deepEqual(odd.wear, { neck: null, body: null, head: null }, "없는 옷·안 맞는 자리는 버림");
  delete j.units[0].clothes; delete j.units[0].wear; const old = World.fromJSON(j, seededRandom(1)).units[0]; assert.deepEqual(old.clothes, []); assert.deepEqual(old.wear, { neck: null, body: null, head: null });
});

// ---------------------------------------------------------------- 감기·의원(health.js)
test("감기 숫자: 동시 환자 상한(9마리 → 3) · 회복 빠르기(밖 600초 · 집 300 · 침대 150 · 의원 100 · 의원+의사+약 약 27초) · 아플 때 비중", async () => {
  const HL = await import("../src/world/health.js");
  assert.equal(HL.sickCap(9), 3); assert.equal(HL.sickCap(2), 1); assert.equal(HL.sickCap(1), 1); assert.equal(HL.sickCap(12), 4);
  const s = HL.newSick(); assert.equal(s.left, 300);
  assert.deepEqual(["out", "inside", "bed", "clinic"].map(w => HL.secsLeft(s, w)), [600, 300, 150, 100]);
  assert.equal(HL.takeMedicine(s), true); assert.equal(s.left, 180); assert.equal(HL.takeMedicine(s), false, "한 번 앓을 때 한 번");
  assert.equal(HL.secsLeft(s, "doctor"), 27, "(300 − 120) / (4.5 × 1.5) = 26.7 → 27초");
  const u = { sick: HL.newSick() }; assert.equal(HL.sickWeight(u, "chop"), 0.5); assert.equal(HL.sickWeight(u, "enter"), 3); assert.equal(HL.sickWeight(u, "wander"), 1); assert.equal(HL.sickWeight({}, "chop"), 1);
  assert.equal(HL.sickFromSave({ kind: "cold", left: 9999 }).left, 300); assert.equal(HL.sickFromSave({ kind: "flu", left: 3 }), null); assert.equal(HL.sickFromSave(null), null);
});

test("감기 걸림: 30초마다 꽁꽁(38.3 이하)·밖인 갈매미만 hrnd로 굴림(5%) · 면역·동시 상한이면 안 걸림 · 기존 난수(world.rnd)는 안 씀", () => {
  const { w, u } = winterVillage(10); const sick = []; w.on("sick", e => sick.push(e));
  let calls = 0; const rnd0 = w.rnd; w.rnd = () => { calls++; return rnd0(); };
  w.hrnd = () => 0.049; u.bodyT = 38.4; w.healthClock = 29.95; w.stepHealth(0.1); assert.equal(u.sick, undefined, "38.4는 꽁꽁이 아님");
  u.bodyT = 38.3; w.stepHealth(29.9); assert.equal(u.sick, undefined, "30초가 안 됨"); w.stepHealth(0.2);
  assert.equal(u.sick?.kind, "cold"); assert.equal(sick.length, 1); assert.equal(sick[0].first, true); assert.equal(calls, 0, "world.rnd는 안 씀");
  assert.equal(w.newsLog.at(-1).text, "기본이 감기에 걸렸어요. 따뜻한 데서 푹 쉬면 나아요", "마을 첫 병 소식(무게 3)"); assert.equal(w.newsLog.at(-1).weight, 3);
  w.heal(u); assert.equal(u.immune, 600); w.stepHealth(30); assert.equal(u.sick, null, "면역 동안은 안 걸림");
  u.immune = 0; w.hrnd = () => 0.05; w.stepHealth(30); assert.equal(u.sick, null, "5% 밖(0.05)이면 안 걸림");
  u.insideBuildingId = "x"; w.hrnd = () => 0; w.stepHealth(30); assert.equal(u.sick, null, "건물 안이면 안 굴림"); u.insideBuildingId = null;
  // 동시 상한: 3마리 마을이면 1마리까지
  w.addUnitByName("목수"); w.addUnitByName("미니"); const [a, b, c] = w.units; for (const o of w.units) { o.bodyT = 38; o.immune = 0; o.sick = null; }
  w.stepHealth(30); assert.equal(w.units.filter(o => o.sick).length, 1, `상한 ${[a, b, c].map(o => !!o.sick)}`);
});

test("감기 옮음: 밖에 있는 감기 갈매미 2칸 안 · 30초마다 2%(목도리면 1%) · 멀거나 건물 안이면 안 옮음", () => {
  const { w, u } = winterVillage(11); const o = w.addUnitByName("목수"); w.addUnitByName("미니"); w.addUnitByName("꽃");   // 4마리 → 상한 1이 되지 않게 6마리
  w.addUnitByName("황금"); w.addUnitByName("물방울");
  for (const x of w.units) { x.bodyT = 40; x.x = 1000; x.z = 1000; } u.x = 50; u.z = 50; o.x = 51.5; o.z = 50; u.sick = { kind: "cold", left: 300, med: false };
  const got = []; w.on("sick", e => got.push(e)); w.healthStats.sick = 5;
  w.hrnd = () => 0.021; w.stepHealth(30); assert.equal(o.sick, undefined, "2.1%면 안 옮음");
  o.wear = { neck: "scarf", body: null, head: null }; w.hrnd = () => 0.015; w.stepHealth(30); assert.equal(o.sick, undefined, "목도리면 1%까지만");
  o.wear = null; o.x = 52.5; w.hrnd = () => 0; w.stepHealth(30); assert.equal(o.sick, undefined, "2.5칸이면 안 옮음");
  o.x = 51.9; o.insideBuildingId = "h"; w.stepHealth(30); assert.equal(o.sick, undefined, "건물 안이면 안 옮음"); o.insideBuildingId = null;
  w.stepHealth(30); assert.equal(o.sick?.kind, "cold"); assert.equal(got.at(-1).from, u); assert.equal(w.newsLog.at(-1).text, "목수가 기본에게서 감기가 옮았어요");
});

test("갈매미 의원: 아프면 빈 침대가 있는 의원에 가서 진료비 3🪙(금고·장부 clinic) · 침대 회복 3/초로 약 100초 · 다 나으면 나와 면역 · 새 공사를 안 맡음", () => {
  const { w, u } = winterVillage(12, "clear", 0); for (const o of w.units) o.full = 90;
  const cl = placeNear(w, "clinic", u.x, u.z); assert.ok(cl && w.clinics().length === 1);
  assert.equal(w.canEnter(u, cl), false, "건강하면 못 들어감(구경 안 감)");
  { const c = (() => { for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (w.buildingAt(cl.x + dx, cl.z + dz) === cl) return [cl.x + dx, cl.z + dz]; })();   // 검토 수정: 건강한 갈매미를 의원에 내려놓으면 "너무 작아요"가 아니라 의원 규칙을 알려 줌
    assert.ok(w.pickUpUnit(u)); const r = w.dropUnit(u, c[0], c[1]); assert.equal(r.ok, false); assert.equal(r.reason, "의원에는 아픈 갈매미와 당번 의사만 들어가요"); assert.equal(u.insideBuildingId, null); }
  u.sick = { kind: "cold", left: 300, med: false }; u.coins = 10; u.state = "Idle"; u.timer = 0; u.needs.energy = 90; const v0 = w.bank.vault;
  assert.equal(w.canEnter(u, cl), true);
  const visits = [], healed = []; w.on("clinicVisit", e => visits.push(e)); w.on("healed", e => healed.push(e));
  let tIn = 0, out = false;
  for (let t = 0; t < 400 && !out; t += 0.1) { u.full = 90; w.update(0.1); if (u.insideBuildingId === cl.id) tIn += 0.1; else if (tIn > 0) out = true; }
  assert.equal(visits.length, 1); assert.equal(visits[0].fee, 3); assert.equal(visits[0].medicine, 0, "의사가 없으면 약 없음"); assert.equal(u.coins, 7); assert.equal(w.bank.vault - v0, 3); assert.equal(w.bank.ledger.at(-1).clinic, 3);
  assert.equal(healed.length, 1); assert.equal(healed[0].where, "clinic"); assert.ok(tIn > 85 && tIn < 115, `의원에 누운 시간 ${tIn.toFixed(1)}초`); assert.ok(out); assert.equal(u.sick, null); assert.ok(u.immune > 500);
  // 돈이 없으면 진료비 무료
  u.sick = { kind: "cold", left: 30, med: false }; u.coins = 0; u.immune = 0; u.state = "Idle"; u.timer = 0;
  for (let t = 0; t < 120 && visits.length < 2; t += 0.1) { u.full = 90; w.update(0.1); } assert.equal(visits[1].fee, 0);
  for (let t = 0; t < 60 && u.sick; t += 0.1) { u.full = 90; w.update(0.1); }
  // 아프면 새 공사를 안 맡음(의원·집에 못 갈 때도)
  const site = w.placeBuilding("house", ...(() => { for (let r = 3; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(u.x + Math.cos(a) * r), z = Math.floor(u.z + Math.sin(a) * r); if (w.check("house", x, z, 0).ok) return [x, z]; } })(), 0, null, 0).building;
  w.removeBuilding(cl.id); const hb = w.buildings.get(u.home); hb.owner = null; u.home = null; u.sick = { kind: "cold", left: 300, med: false }; u.committed = null;
  for (let t = 0; t < 60; t += 0.1) { u.full = 90; u.sick.left = 300; w.update(0.1); assert.notEqual(u.committed, site.id, "아픈 동안 공사를 안 맡음"); }
});

test("당번 의사(world.setDoctor): 플레이어가 마을 갈매미를 정하면 환자가 있을 때 의원에 가서 약(4🪙, −120) · 회복 4.5×1.5 · 나을 때마다 품삯 2🪙(금고에서) · 환자가 없으면 나옴", () => {
  const { w, u } = winterVillage(13, "clear", 0); const doc = w.addUnitByName("목수"); for (const o of w.units) { o.full = 90; o.needs.energy = 90; }
  const cl = placeNear(w, "clinic", u.x, u.z);
  assert.equal(w.setDoctor("nope", doc.unitId).ok, false); assert.equal(w.setDoctor(cl.id, "nobody").ok, false);
  const r = w.setDoctor(cl.id, doc.unitId); assert.equal(r.ok, true); assert.equal(cl.doctor, "목수"); assert.equal(w.dutyClinic(doc), cl); assert.equal(w.canEnter(doc, cl), true, "당번은 의원에 들어감");
  assert.equal(w.newsLog.at(-1).text, "목수가 갈매미 의원 당번 의사가 됐어요");
  u.sick = { kind: "cold", left: 300, med: false }; u.coins = 20; u.state = "Idle"; u.timer = 0; doc.state = "Idle"; doc.timer = 5; doc.coins = 0;
  const v0 = w.bank.vault, healed = []; w.on("healed", e => healed.push(e)); let docIn = false, docOut = false, med = null;
  for (let t = 0; t < 300 && !docOut; t += 0.1) {
    for (const o of w.units) o.full = 90; w.update(0.1);
    if (doc.insideBuildingId === cl.id) docIn = true; else if (docIn) docOut = true;
    if (u.sick?.med && med === null) med = u.sick.left;
  }
  assert.ok(docIn, "당번이 의원에 들어감"); assert.ok(med !== null && med <= 180, `약을 먹어 −120(${med})`); assert.equal(healed.length, 1); assert.equal(healed[0].doctor, "목수");
  assert.equal(u.coins, 20 - 3 - 4, "진료비 3 + 약 4"); assert.equal(doc.coins, 2, "의사 품삯 2"); assert.equal(Math.round(w.bank.vault - v0), 3 + 4 - 2, "금고 +5"); assert.ok(docOut, "환자가 없으면 나옴");
  assert.equal(w.newsLog.some(n => n.text === "기본이 감기가 다 나았어요 (당번 목수 선생님 덕분)"), true);
  // 당번 비우기 · 다른 의원 당번이 되면 앞 의원은 풀림
  const cl2 = placeNear(w, "clinic", u.x + 8, u.z + 8); w.setDoctor(cl2.id, "목수"); assert.equal(cl.doctor, null); assert.equal(cl2.doctor, "목수");
  assert.equal(w.setDoctor(cl2.id, null).ok, true); assert.equal(cl2.doctor, null);
});

test("아픈데 의원이 없으면 집에서 쉼 · 만족도 −10 · 가까운 의원 +3 · 능률 ×0.7", () => {
  const { w, u, h } = winterVillage(14, "clear", 0); for (const o of w.units) o.full = 90;
  u.sick = { kind: "cold", left: 300, med: false }; u.state = "Idle"; u.timer = 0; u.needs.energy = 90;
  let inHome = false; for (let t = 0; t < 120 && !inHome; t += 0.1) { u.full = 90; w.update(0.1); if (u.insideBuildingId === h.id && u.insideAct === "sick") inHome = true; }
  assert.ok(inHome, "집에서 쉼");
  w.updateRoads(); assert.ok(u.satParts.some(p => p[0] === "🤧 감기" && p[1] === -10));
  placeNear(w, "clinic", h.door.x, h.door.z); w.updateRoads(); assert.ok(u.satParts.some(p => p[0] === "🏥 가까운 의원" && p[1] === 3));
  // 능률·기력(같은 상태 둘을 비교)
  const z = winterVillage(15, "clear", 0), v = z.u; z.w.season = null; z.w.rankClock = -1e9; v.state = "Held"; v.full = 80; z.w.update(0.01); v.needs.energy = 80; z.w.update(1); const effOk = v.eff;
  v.sick = { kind: "cold", left: 300, med: false }; v.needs.energy = 80; z.w.update(1);
  assert.ok(Math.abs(v.eff / effOk - 0.7) < 1e-6, "능률 ×0.7");
});

test("저장·불러오기: 병·면역·당번 의사·병 기록 · 예전 저장(칸 없음)은 건강 · 마을에 없는 당번은 비움 · 의원 catalog·등급·설계비", () => {
  const { w, u } = winterVillage(16, "clear", 0); const doc = w.addUnitByName("목수"); const cl = placeNear(w, "clinic", u.x, u.z);
  w.setDoctor(cl.id, doc.unitId); u.sick = { kind: "cold", left: 123.4, med: true }; doc.immune = 250.4; w.makeSick(w.units[1]) ;
  const j = JSON.parse(JSON.stringify(w.serialize())); const back = World.fromJSON(j, seededRandom(1));
  const bu = back.units.find(o => o.name === "기본"), bd = back.units.find(o => o.name === "목수");
  assert.deepEqual(bu.sick, { kind: "cold", left: 123, med: true }); assert.equal(bd.immune, 250); assert.equal(back.buildings.get(cl.id).doctor, "목수"); assert.equal(back.healthStats.sick, w.healthStats.sick);
  const o = JSON.parse(JSON.stringify(j)); for (const x of o.units) { delete x.sick; delete x.immune; } delete o.healthStats; for (const b of o.buildings) delete b.doctor; for (const e of o.bank.ledger) delete e.clinic;
  const old = World.fromJSON(o, seededRandom(1)); assert.ok(old.units.every(x => !x.sick && !x.immune)); assert.equal(old.healthStats.sick, 0); assert.equal(old.buildings.get(cl.id).doctor, null); assert.equal(old.bank.ledger.every(e => e.clinic === 0), true);
  const gone = JSON.parse(JSON.stringify(j)); gone.units = gone.units.filter(x => x.name !== "목수"); assert.equal(World.fromJSON(gone, seededRandom(1)).buildings.get(cl.id).doctor, null);
  const RK = BUILDINGS.clinic; assert.equal(RK.builtBy, "carpenter"); assert.equal(RK.beds, 3); assert.equal(RK.rank, 1);
});
