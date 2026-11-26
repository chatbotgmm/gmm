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
