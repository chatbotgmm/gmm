// 인구 = 집 수: 새 섬은 은행 + 다 지은 작은 집 한 채 + 금고 60으로 시작하고, 다 지은 집 한 채당 갈매미 한 마리까지만 🥚 소환할 수 있다(population.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { findPath } from "../src/world/pathfinding.js";
import { checkPlacement } from "../src/world/placement.js";
import { BUILDINGS, UNITS } from "../src/data/catalog.js";
import * as BK from "../src/world/bank.js";
import * as P from "../src/world/population.js";
import * as D from "../src/world/daily.js";
import { newsFor } from "../src/world/news.js";

const fresh = (rndSeed = 3) => World.create(7, seededRandom(rndSeed), { wild: true });
/** 은행 문에서 걸어갈 수 있는 빈 자리(자리 규칙만 봄: 금고·갈매미·등급과 상관없이) */
const spotFor = (w, d) => { const c = w.center, bk = w.bankB().door;
  for (let r = 4; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + 6 + Math.cos(a) * r), z = Math.floor(c.z + 9 + Math.sin(a) * r), ck = checkPlacement(w.grid, BUILDINGS[d], x, z, 0, w.units); if (ck.ok && findPath(w.grid, bk.x, bk.z, ck.door.x, ck.door.z)) return [x, z]; }
  return null; };
/** 다 지은 건물(시험 받침: 설계비 없음) */
const ready = (w, d = "house") => { const s = spotFor(w, d); return w.placeBuilding(d, s[0], s[1], 0, null, 1e9).building; };
const houses = w => [...w.buildings.values()].filter(b => BUILDINGS[b.defId].house);

test("새 섬: 공식은행 + 다 지은 작은 집 한 채(은행 옆, 문까지 걸어감, 씨앗마다 같은 자리) + 금고 60, 갈매미는 없음", () => {
  const w = fresh(), bk = w.bankB(), hs = houses(w);
  assert.equal(BK.VAULT_START, 300); assert.equal(w.bank.vault, BK.VAULT_START); assert.equal(w.units.length, 0, "첫 갈매미는 소환으로");
  assert.equal(hs.length, 1); const h = hs[0];
  assert.equal(h.defId, "house"); assert.ok(w.isDone(h)); assert.equal(h.hits, h.need); assert.equal(h.fee, 0); assert.ok(!h.owner, "주인 없는 집");
  assert.ok(h.interior.furnished, "새 집 기본 가구");
  assert.ok(Math.hypot(h.door.x - bk.door.x, h.door.z - bk.door.z) <= 8, "은행 가까이");
  assert.ok(findPath(w.grid, bk.door.x, bk.door.z, h.door.x, h.door.z), "은행 문에서 집 문까지 걸어감");
  assert.equal(w.bank.fees, 0); assert.equal(w.bank.issued, 0);
  const again = World.create(7, seededRandom(99), { wild: true }), h2 = houses(again)[0];
  assert.deepEqual([h2.x, h2.z, h2.rot], [h.x, h.z, h.rot], "난수와 상관없이 같은 자리");
  // 저장·불러오기: 집과 금고가 그대로, 갈매미 없는 섬도 열림
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(1));
  assert.equal(back.units.length, 0); assert.equal(houses(back).length, 1); assert.ok(back.isDone(houses(back)[0])); assert.equal(back.bank.vault, BK.VAULT_START);
  assert.equal(back.summonInfo().next, "기본");
  // 시험 받침 firstGull: 기본 갈매미를 미리 부름
  const t = World.create(7, seededRandom(3), { wild: true, firstGull: true }); assert.deepEqual(t.units.map(u => u.name), ["기본"]); assert.equal(houses(t).length, 1);
});

test("소환: 갈매미 수 < 다 지은 집 수일 때만 · 첫 갈매미는 건축가(기본) · 막히면 null + 까닭(summonBlocked·말풍선)", () => {
  const w = fresh(); const blocked = []; w.on("summonBlocked", e => blocked.push(e));
  let info = w.summonInfo();
  assert.deepEqual([info.can, info.houses, info.gulls, info.free, info.left, info.next, info.gated], [true, 1, 0, 1, UNITS.length, "기본", true]);
  assert.equal(info.reason, ""); assert.equal(info.needGiantHouse, true, "자이언트의 집이 아직 없음");
  const first = w.summon(); assert.equal(first.name, "기본"); assert.equal(first.job, "builder", "첫 갈매미가 집을 지을 수 있음");
  assert.ok(w.grid.isWalkable(Math.floor(first.x), Math.floor(first.z)));
  info = w.summonInfo(); assert.equal(info.can, false); assert.equal(info.needHouse, true); assert.deepEqual(info.candidates, []);
  assert.match(info.reason, /집이 모자라요 — 집을 한 채 더 지으면 부를 수 있어요/); assert.match(info.reason, /집 1채 · 갈매미 1마리/);
  assert.equal(w.summon(), null, "집 1채에 갈매미 1마리 → 못 부름(main.js는 falsy를 봄)"); assert.equal(w.units.length, 1);
  assert.equal(blocked.length, 1); assert.equal(blocked[0].reason, info.reason);
  assert.match(first.emoteText, /집이 더 있어야/, "밖에 있는 갈매미가 말풍선으로 알려 줌(화면을 고치지 않아도 보임)");
  assert.deepEqual(newsFor("summonBlocked", blocked[0], w), { icon: "🥚", text: info.reason, weight: 0 }, "알림 줄용 문장(소식지에는 안 실음)");
  assert.equal(w.newsLog.some(e => /집이 모자라요/.test(e.text)), false);
  // 짓는 중인 집은 세지 않음 → 다 지으면 한 마리
  const s = spotFor(w, "house"), site = w.placeBuilding("house", s[0], s[1], 0); assert.ok(site.ok); assert.equal(w.bank.vault, BK.VAULT_START - 10, "설계비 10");
  assert.equal(w.summonInfo().can, false, "짓는 중"); assert.equal(w.summon(), null);
  w.finishAll(); assert.equal(w.summonInfo().houses, 2); assert.equal(w.summonInfo().can, true);
  const second = w.summon(); assert.equal(second.name, "목수", "둘째는 목수(시장을 지음)"); assert.equal(w.summon(), null);
  // 시험·개발용 addUnitByName은 집 수와 상관없음
  assert.ok(w.addUnitByName("미니")); assert.equal(w.units.length, 3); assert.equal(w.summonInfo().gulls, 3);
});

test("오는 순서: 건축가 → 목수 → 상인, 그다음은 무작위 · 자이언트는 다 지은 빈 자이언트의 집이 있어야 오고 보통 집 자리와 따로 셈", () => {
  const w = fresh(5); const order = [];
  for (let k = 0; k < 7; k++) ready(w);                                        // 보통 집 8채
  assert.equal(w.summonInfo().houses, 8);
  for (let u; (u = w.summon());) order.push(u.name);
  assert.deepEqual(order.slice(0, 3), ["기본", "목수", "황금"]);
  assert.equal(order.length, 8); assert.ok(!order.includes("자이언트"), "자이언트는 보통 집으로는 안 옴");
  assert.equal(new Set(order).size, 8);
  let info = w.summonInfo(); assert.deepEqual([info.can, info.left, info.needHouse, info.needGiantHouse], [false, 1, false, true]);
  assert.equal(info.reason, P.REASON_GIANT);
  ready(w); info = w.summonInfo(); assert.equal(info.houses, 9); assert.equal(info.free, 1); assert.equal(info.can, false, "보통 집이 남아도 자이언트는 못 옴");
  const s = spotFor(w, "giantHouse"); w.bank.vault = 100; const g = w.placeBuilding("giantHouse", s[0], s[1], 0).building;
  assert.equal(w.summonInfo().can, false, "짓는 중인 자이언트의 집");
  w.finishAll(); info = w.summonInfo(); assert.equal(info.can, true); assert.equal(info.next, "자이언트"); assert.equal(info.needGiantHouse, false); assert.equal(info.houses, 9, "자이언트의 집은 보통 집으로 세지 않음");
  assert.equal(w.summon().name, "자이언트"); assert.equal(w.units.length, UNITS.length);
  info = w.summonInfo(); assert.equal(info.can, false); assert.equal(info.reason, P.REASON_ALL); assert.equal(info.gulls, 8, "자이언트는 보통 갈매미 수에 안 들어감");
  const n = []; w.on("summonBlocked", e => n.push(e)); assert.equal(w.summon(), null); assert.equal(n.length, 0, "다 모였을 때는 집이 모자란 게 아님");
  void g;
  // 자이언트의 집이 먼저 있으면: 보통 집 자리가 없어도 자이언트는 옴. 자이언트의 집은 다른 갈매미 자리가 아님
  const w2 = fresh(); assert.equal(w2.summon().name, "기본"); ready(w2, "giantHouse");
  info = w2.summonInfo(); assert.deepEqual(info.candidates, ["자이언트"]); assert.equal(info.houses, 1);
  assert.equal(w2.summon().name, "자이언트"); assert.equal(w2.summon(), null); assert.match(w2.summonInfo().reason, /집이 모자라요/);
  // 순수 계산: 난수를 쓰지 않음
  const pure = P.summonInfoFor([{ name: "기본", job: "builder" }], [{ defId: "house" }, { defId: "cottage" }, { defId: "giantHouse", owner: "u9" }, { defId: "market" }], true);
  assert.deepEqual([pure.houses, pure.gulls, pure.free, pure.next, pure.needGiantHouse], [2, 1, 1, "목수", true], "주인 있는 자이언트의 집·시장은 자리가 아님");
});

test("철거·예전 저장: 집이 갈매미보다 적어져도 갈매미는 그대로, 새 소환만 막힘(집이 갈매미보다 많아지면 다시 됨)", () => {
  const w = fresh(); const extra = [ready(w), ready(w)];
  for (let k = 0; k < 3; k++) assert.ok(w.summon());
  assert.equal(w.summon(), null);
  for (const b of extra) w.removeBuilding(b.id);
  assert.equal(w.units.length, 3, "철거해도 안 떠남"); let info = w.summonInfo(); assert.deepEqual([info.houses, info.gulls, info.free, info.can], [1, 3, 0, false]);
  ready(w); ready(w); assert.equal(w.summonInfo().can, false, "집 3 = 갈매미 3");
  ready(w); assert.equal(w.summonInfo().can, true); assert.ok(w.summon());
  // 예전 저장: 갈매미 4마리 · 집 0채 → 모두 그대로, 소환만 막힘
  const old = World.create(7, seededRandom(3), { wild: true, firstGull: true }); for (const b of houses(old)) old.removeBuilding(b.id);
  for (const n of ["목수", "미니", "황금"]) old.addUnitByName(n); old.units[0].coins = 33; old.bank.vault = 100;
  const back = World.fromJSON(JSON.parse(JSON.stringify(old.serialize())), seededRandom(2));
  assert.deepEqual(back.units.map(u => u.name).sort(), ["기본", "목수", "미니", "황금"].sort()); assert.equal(back.units.find(u => u.name === "기본").coins, 33); assert.equal(back.bank.vault, 100);
  assert.equal(houses(back).length, 0, "예전 저장에 집을 새로 주지 않음");
  info = back.summonInfo(); assert.deepEqual([info.houses, info.gulls, info.can, info.needHouse], [0, 4, false, true]); assert.equal(back.summon(), null);
  for (let k = 0; k < 4; k++) ready(back); assert.equal(back.summon(), null, "집 4 = 갈매미 4");
  ready(back); assert.ok(back.summon(), "집 5 > 갈매미 4");
});

test("막힘 방지: 건축가가 없으면 기본은 집 수와 상관없이 옴 · 금고가 바닥나고 집이 모자라면 작은 집 한 채는 설계비 없이", () => {
  // 갈매미 0 · 집 0(첫 집을 철거한 섬, 또는 예전 저장)
  const w = fresh(); for (const b of houses(w)) w.removeBuilding(b.id);
  let info = w.summonInfo(); assert.deepEqual([info.houses, info.can, info.next], [0, true, "기본"]); assert.deepEqual(info.candidates, ["기본"]);
  assert.equal(w.summon().name, "기본"); assert.equal(w.summon(), null);
  // 건축가가 아닌 갈매미만 있는 섬
  const w2 = fresh(); w2.addUnitByName("미니"); assert.equal(w2.summonInfo().next, "기본"); assert.equal(w2.summon().name, "기본"); assert.equal(w2.summon(), null);
  // 금고 0 · 갈매미 1 = 집 1: 작은 집 한 채는 설계비 0(그 밖의 건물은 그대로 못 놓음)
  const w3 = fresh(); w3.summon(); w3.bank.vault = 0;
  assert.equal(w3.rescueHouse("house"), true); assert.equal(w3.feeFor("house"), 0); assert.equal(w3.feeFor("cottage"), 15); assert.equal(w3.feeFor("bench"), 2);
  const sb = spotFor(w3, "bench"); assert.equal(w3.placeBuilding("bench", sb[0], sb[1], 0).ok, false, "장식은 금고가 있어야");
  const s = spotFor(w3, "house"), r = w3.placeBuilding("house", s[0], s[1], 0); assert.ok(r.ok); assert.equal(r.building.fee, 0); assert.equal(w3.bank.vault, 0); assert.equal(w3.bank.fees, 0);
  assert.equal(w3.rescueHouse("house"), false, "짓는 중인 집이 있으면 한 채만"); assert.equal(w3.feeFor("house"), 10);
  const s2 = spotFor(w3, "house"); assert.equal(w3.placeBuilding("house", s2[0], s2[1], 0).ok, false);
  w3.finishAll(); assert.equal(w3.feeFor("house"), 10, "집 자리가 남으면(소환할 수 있으면) 다시 설계비"); assert.equal(w3.summon().name, "목수");
  assert.equal(w3.feeFor("house"), 0, "또 막히면 또 한 채"); assert.equal(w3.feeFor("market"), 0, "첫 시장은 원래 설계비 없음");
  // 금고가 설계비 이상이면 그대로 냄
  w3.bank.vault = 10; assert.equal(w3.feeFor("house"), 10); assert.equal(w3.rescueHouse("house"), false);
  // 모두 모였거나 자이언트만 남았으면 없음
  const w4 = fresh(); for (const d of UNITS) if (d.name !== "자이언트") w4.addUnitByName(d.name); w4.bank.vault = 0;
  assert.equal(w4.summonInfo().needHouse, false); assert.equal(w4.feeFor("house"), 10);
});

test("공식은행이 없는 예전 섬은 예전 그대로(집 수와 상관없이 무작위) · 오늘의 부탁 '소환'은 부를 수 있을 때만", () => {
  const old = World.create(7, seededRandom(8), { empty: true }); assert.equal(old.economy, false);
  let info = old.summonInfo(); assert.deepEqual([info.gated, info.can, info.next, info.candidates.length], [false, true, null, UNITS.length]);
  for (let k = 0; k < UNITS.length; k++) assert.ok(old.summon()); assert.equal(old.summon(), null);
  // 오늘의 부탁
  const has = w => { for (let d = 1; d <= 28; d++) if (D.rollDaily(`2027-04-${d}`, w).reqs.some(x => x.id === "summon")) return true; return false; };
  const w = fresh(); assert.equal(has(w), true, "새 섬: 첫 갈매미를 부를 수 있음");
  w.summon(); assert.equal(has(w), false, "집 1 = 갈매미 1 → 부탁에 안 나옴");
  ready(w); assert.equal(has(w), true); w.summon(); assert.equal(has(w), false);
  ready(w); ready(w); w.summon(); w.summon(); ready(w); assert.equal(w.units.length, 4); assert.equal(w.summonInfo().can, true); assert.equal(has(w), false, "4마리부터는 예전처럼 안 나옴");
});

test("검토 회귀: 가운데 바닥이 평평하지 않은 섬 씨앗(1·213821·944352)도 공식은행 + 첫 집 + 금고 60으로 시작하고 집 수 규칙이 켜짐", () => {
  for (const seed of [1, 213821, 944352]) {
    const w = World.create(seed, seededRandom(3), { wild: true }), bk = w.bankB(), c = w.center;
    assert.ok(bk, `씨앗 ${seed}: 공식은행`); assert.equal(w.economy, true);
    const mid = { x: w.grid.w / 2, z: w.grid.h / 2 }, bx = Math.floor(mid.x) - Math.floor(BUILDINGS.bank.footprint.w / 2), bz = Math.floor(mid.z) - Math.floor(BUILDINGS.bank.footprint.d / 2);   // center는 이제 은행을 따라가므로 지도 한가운데 기준으로 잼
    assert.ok(Math.hypot(bk.x - bx, bk.z - bz) <= 3, "가운데에서 세 칸 안"); assert.ok(Math.hypot(bk.x - bx, bk.z - bz) > 0, "가운데에는 못 놓는 씨앗");
    const hs = houses(w); assert.equal(hs.length, 1); assert.ok(w.isDone(hs[0])); assert.ok(findPath(w.grid, bk.door.x, bk.door.z, hs[0].door.x, hs[0].door.z));
    assert.equal(w.bank.vault, BK.VAULT_START); assert.equal(w.units.length, 0); assert.equal(w.summonInfo().gated, true);
    assert.equal(w.summon().name, "기본"); assert.equal(w.summon(), null, "집 1 = 갈매미 1");
    const again = World.create(seed, seededRandom(8), { wild: true }); assert.deepEqual([again.bankB().x, again.bankB().z], [bk.x, bk.z], "난수와 상관없이 같은 자리");
  }
  const w7 = World.create(7, seededRandom(3), { wild: true }), c = w7.center;   // 가운데가 평평한 섬은 예전 그대로 한가운데
  assert.deepEqual([w7.bankB().x, w7.bankB().z], [c.x - Math.floor(BUILDINGS.bank.footprint.w / 2), c.z - Math.floor(BUILDINGS.bank.footprint.d / 2)]);
});

test("검토 회귀: 은행 기록이 아예 없는 예전 저장도 금고 100(금고 칸만 없는 저장과 같게), 새 섬은 60", () => {
  assert.equal(BK.bankFromSave(undefined).vault, BK.VAULT_LEGACY); assert.equal(BK.bankFromSave(null, 50).vault, 100);
  assert.equal(BK.bankFromSave({ returned: 7 }).vault, 107); assert.equal(BK.bankFromSave({ vault: 3 }).vault, 3); assert.equal(BK.newBank().vault, BK.VAULT_START);
  const w = fresh(), j = JSON.parse(JSON.stringify(w.serialize())); delete j.bank;
  assert.equal(World.fromJSON(j, seededRandom(1)).bank.vault, 100);
});
