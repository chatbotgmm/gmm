// 잠은 집에서: 집 있는 갈매미는 밤잠·지쳐서 자는 잠 모두 내 집(멀어도, 카페·남의 건물 안 감),
// 집 없는 갈매미는 주인 없는 빈 집에서 손님 → 없으면 밖(만족도 하락), 집 길이 막히면 잠깐 졸고 다시 시도(상태 떨림 없음). node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { BUILDINGS } from "../src/data/catalog.js";
import { BLOCKED_NAP } from "../src/units/unitBrain.js";
import { ROUGH_SAT, ROUGH_SECS } from "../src/world/roads.js";

const placeAt = (w, defId, x0, z0, r0 = 0, r1 = 40) => { for (let r = r0; r < r1; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); const q = w.placeBuilding(defId, x, z, 0, null, 1e9); if (q.ok) return q.building; } return null; };
const dist = (u, b) => Math.hypot(b.door.x - u.x, b.door.z - u.z);
/** 넓은 섬: 기본(집 주인, 집은 20칸 넘게 멀리) + 기본 바로 곁에 카페. 첫 집은 주인 없이 둠 */
function farHome(seed = 3) {
  const w = World.create(7, seededRandom(seed), { wild: true, firstGull: true }); w.instantBuild = true; w.isNight = false;
  const u = w.units[0], c = w.center;
  const cafe = placeAt(w, "cafe", u.x, u.z, 2), h = placeAt(w, "house", c.x, c.z, 22);
  w.finishAll(); h.owner = u.unitId; u.home = h.id;
  for (const b of w.buildings.values()) if (BUILDINGS[b.defId].house && b !== h) b.owner = 999;   // 첫 집은 남의 집으로(빈 집 손님 길도 막음)
  return { w, u, h, cafe };
}

test("집 있는 갈매미: 밤잠은 멀어도(14칸 넘게) 내 집에서, 곁의 카페·남의 집에는 안 들어감", () => {
  const { w, u, h, cafe } = farHome(); assert.ok(dist(u, h) > 14, `집이 멂(${dist(u, h).toFixed(1)}칸)`); assert.ok(dist(u, cafe) < 14, "카페는 가까움");
  w.isNight = true; u.state = "Idle"; u.timer = 0; const went = new Set(); let outSleep = 0;
  for (let t = 0; t < 240; t += 0.1) { for (const o of w.units) o.full = 90; w.update(0.1); if (u.insideBuildingId) went.add(u.insideBuildingId); if (u.state === "Sleep") outSleep += 0.1; }
  assert.deepEqual([...went], [h.id], "들어간 건물은 내 집뿐"); assert.equal(u.insideBuildingId, h.id); assert.equal(u.insideAct, "sleep");
  assert.equal(outSleep, 0, "밖에서 자지 않음");
});

test("집 있는 갈매미: 낮에 지쳐도(기력 20 아래) 가까운 카페가 아니라 먼 내 집으로 가서 잠", () => {
  const { w, u, h } = farHome(5); const went = new Set(); let outSleep = 0, slept = false;
  u.state = "Idle"; u.timer = 0; u.needs.energy = 10; u.full = 90;
  for (let t = 0; t < 200 && !slept; t += 0.1) { for (const o of w.units) o.full = 90; w.update(0.1); if (u.insideBuildingId) went.add(u.insideBuildingId); if (u.state === "Sleep") outSleep += 0.1; if (u.insideBuildingId === h.id && u.insideAct === "sleep") slept = true; }
  assert.ok(slept, "내 집에서 잠"); assert.deepEqual([...went], [h.id], "다른 건물에 안 들어감"); assert.equal(outSleep, 0, "밖에서 자지 않음");
});

test("집 없는 갈매미: 주인 없는 다 지은 빈 집에서 손님으로 잠(주인은 안 됨)", () => {
  const w = World.create(7, seededRandom(4), { wild: true, firstGull: true }); w.instantBuild = true; w.isNight = true;
  const u = w.units[0], spare = [...w.buildings.values()].find(b => BUILDINGS[b.defId].house);
  assert.equal(u.home, null); assert.equal(spare.owner ?? null, null, "첫 집은 주인 없음");
  let guest = false, outSleep = 0;
  for (let t = 0; t < 120 && !guest; t += 0.1) { u.full = 90; w.update(0.1); if (u.state === "Sleep") outSleep += 0.1; if (u.insideBuildingId === spare.id && u.insideAct === "sleep") guest = true; }
  assert.ok(guest, "빈 집에 들어가 잠"); assert.equal(spare.owner ?? null, null, "주인이 되지 않음"); assert.equal(u.home, null); assert.equal(outSleep, 0);
});

test("집 없고 빈 집도 없으면 밖에서 잠: 말풍선 + 만족도 −5(ROUGH_SECS 동안), 집이 있으면 깎이지 않음", () => {
  const w = World.create(7, seededRandom(4), { wild: true, firstGull: true }); w.instantBuild = true; w.isNight = true;
  const u = w.units[0]; for (const b of w.buildings.values()) if (BUILDINGS[b.defId].house) b.owner = 999;   // 빈 집 없음
  w.updateRoads(); const sat0 = u.sat; u.state = "Idle"; u.timer = 0; let said = false;
  for (let t = 0; t < 3 && u.state !== "Sleep"; t += 0.1) { u.full = 90; w.update(0.1); if (/밖에서 자요/.test(u.emoteText || "")) said = true; }
  assert.equal(u.state, "Sleep"); assert.ok(said, "집이 없어 밖에서 잔다는 말풍선"); assert.equal(u.insideBuildingId ?? null, null);
  w.updateRoads(); assert.ok(u.satParts.some(([k, v]) => /밖에서 잠/.test(k) && v === ROUGH_SAT), JSON.stringify(u.satParts)); assert.equal(u.sat, Math.max(0, sat0 + ROUGH_SAT));
  w.time += ROUGH_SECS + 1; w.updateRoads(); assert.equal(u.sat, sat0, "시간이 지나면 돌아옴");
});

test("집 길이 막히면: 다른 건물·빈 집으로 가지 않고 그 자리에서 잠깐(BLOCKED_NAP초) 졸고 다시 시도 — 상태가 떨리지 않음", () => {
  const { w, u, h } = farHome(8); for (const b of w.buildings.values()) if (BUILDINGS[b.defId].house && b !== h) b.owner = null;   // 빈 집이 있어도 손님으로 가지 않음
  w.grid.setElevation(h.door.x, h.door.z, -1); w.recomputeComps?.();           // 집 문 칸을 물로: 걸어갈 수 없음
  w.isNight = true; u.state = "Idle"; u.timer = 0; let flips = 0, last = u.state, slept = 0, naps = 0; const went = new Set();
  for (let t = 0; t < 120; t += 0.1) {
    for (const o of w.units) o.full = 90; w.update(0.1);
    if (u.state !== last) { if (u.state === "Sleep") naps++; flips++; last = u.state; }
    if (u.state === "Sleep") slept += 0.1; if (u.insideBuildingId) went.add(u.insideBuildingId);
  }
  assert.deepEqual([...went], [], "다른 건물에 안 들어감");
  assert.ok(naps >= 2 && naps <= Math.ceil(120 / BLOCKED_NAP) + 1, `졸았다 다시 시도한 횟수 ${naps}`);
  assert.ok(flips <= 4 * Math.ceil(120 / BLOCKED_NAP), `상태 바뀐 횟수 ${flips}`); assert.ok(slept > 80, `대부분 졸며 쉼(${slept.toFixed(1)}초)`);
  w.updateRoads(); assert.ok(!u.satParts.some(([k]) => /밖에서 잠/.test(k)), "집이 있으니 만족도는 안 깎임");
});

test("손님으로 자던 빈 집을 다른 갈매미가 사면: 손님은 깨서 나와 다시 잠자리를 고름(남의 집에서 계속 자지 않음)", () => {
  const w = World.create(7, seededRandom(4), { wild: true, firstGull: true }); w.instantBuild = true; w.isNight = true;
  const u = w.units[0], spare = [...w.buildings.values()].find(b => BUILDINGS[b.defId].house);
  for (let t = 0; t < 120 && u.insideBuildingId !== spare.id; t += 0.1) { u.full = 90; w.update(0.1); }
  assert.equal(u.insideBuildingId, spare.id, "빈 집에서 손님으로 잠");
  spare.owner = 999; let left = -1;
  for (let t = 0; t < 40 && left < 0; t += 0.1) { u.full = 90; w.update(0.1); if (u.insideBuildingId !== spare.id) left = t; }
  assert.ok(left >= 0 && left <= 30, `깨서 나옴(${left.toFixed(1)}초)`);
});
