// 2층집은 둘이 산다(사용자 요청 "2층집은 2인이 사는거로 하자."): 집마다 자리(homes.js) · 소환 자리 · 같이 살기(집값 절반을 주인에게, 돈 보존) ·
// 둘 다 집에서 잠(숙박비 없음, 침대 따로) · 철거 · 저장/불러오기 · 예전 저장. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { findPath } from "../src/world/pathfinding.js";
import { checkPlacement } from "../src/world/placement.js";
import { BUILDINGS } from "../src/data/catalog.js";
import * as HM from "../src/world/homes.js";
import * as F from "../src/world/furniture.js";
import * as P from "../src/world/population.js";
import { WISH_BY_ID } from "../src/world/wishes.js";
import { gullChips } from "../src/ui/gullView.js";
import { summonHtml, RULES } from "../src/ui/summonView.js";

const spotFor = (w, d) => { const c = w.center, bk = w.bankB().door;
  for (let r = 4; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + 6 + Math.cos(a) * r), z = Math.floor(c.z + 9 + Math.sin(a) * r), ck = checkPlacement(w.grid, BUILDINGS[d], x, z, 0, w.units); if (ck.ok && findPath(w.grid, bk.x, bk.z, ck.door.x, ck.door.z)) return [x, z]; }
  return null; };
const ready = (w, d = "house") => { const s = spotFor(w, d); return w.placeBuilding(d, s[0], s[1], 0, null, 1e9).building; };
const fresh = () => World.create(7, seededRandom(3), { wild: true });
/** 넓은 섬 + 목수·미니·황금 + 다 지은 시장 + 다 지은 2층집 하나. 첫 작은 집은 남의 집으로(매물·손님 잠자리 아님) */
function town() {
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }); w.instantBuild = true;
  for (const n of ["목수", "미니", "황금"]) w.addUnitByName(n);
  w.bank.vault = 1e6; assert.ok(w.placeBuilding("market", ...spotFor(w, "market"), 0).ok); w.instantBuild = false; w.bank.vault = 300;
  const c = ready(w, "cottage"); assert.ok(w.isDone(c));
  for (const b of w.buildings.values()) if (BUILDINGS[b.defId].house && b !== c) b.owner = 999;
  const [boss, carp, mini, gold] = ["기본", "목수", "미니", "황금"].map(n => w.units.find(u => u.name === n));
  return { w, c, boss, carp, mini, gold };
}
const money = w => w.units.reduce((s, u) => s + (u.coins || 0), 0) + w.bank.vault;

test("집마다 자리: 2층집 2, 작은 집·큰 집·자이언트의 집 1, 집 아닌 건물 0", () => {
  assert.equal(BUILDINGS.cottage.residents, 2);
  assert.deepEqual(["cottage", "house", "manor", "giantHouse", "market"].map(id => HM.homeCap(id)), [2, 1, 1, 1, 0]);
  assert.equal(HM.homeCap({ defId: "cottage" }), 2); assert.equal(HM.homeCap(BUILDINGS.house), 1);
  const b = { defId: "cottage", owner: 1, mates: [2] };
  assert.deepEqual(HM.residentsOf(b), [1, 2]); assert.equal(HM.roomLeft(b), 0); assert.equal(HM.roomLeft({ defId: "cottage", owner: 1 }), 1);
  assert.equal(HM.livesIn(b, { unitId: 2 }), true); assert.equal(HM.livesIn(b, { unitId: 3 }), false);
  assert.equal(HM.shareOf(50), 25); assert.equal(HM.shareOf(69), 34); assert.equal(HM.shareOf(1), 1);
  const units = [{ unitId: 1, name: "기본" }, { unitId: 2, name: "미니" }];
  assert.equal(HM.residentsText(b, units), "주민 2/2 · 주인 기본 · 같이 사는 미니");
  assert.equal(HM.residentsText({ defId: "cottage" }, units), "주민 0/2 · 주인 없음");
  assert.equal(HM.residentsText({ defId: "house", owner: 1 }, units), "주인 기본", "한 명 집은 예전 글 그대로");
});

test("소환: 다 지은 2층집 한 채 = 두 자리(작은 집 1 + 2층집 2 = 갈매미 셋), 짓는 중인 2층집은 0", () => {
  const w = fresh(); let i = w.summonInfo(); assert.deepEqual([i.houses, i.homes], [1, 1]);
  const s = spotFor(w, "cottage"); w.bank.vault = 1e6; const r = w.placeBuilding("cottage", s[0], s[1], 0, null, 0); assert.ok(r.ok, r.reason); const site = r.building; assert.ok(!w.isDone(site));
  i = w.summonInfo(); assert.deepEqual([i.houses, i.homes], [1, 1], "짓는 중은 안 셈");
  w.finishAll(); i = w.summonInfo(); assert.deepEqual([i.houses, i.homes, i.free, i.count], [3, 2, 3, 3]);
  for (let k = 0; k < 3; k++) assert.ok(w.summon(), `${k + 1}마리째`);
  assert.equal(w.summon(), null); i = w.summonInfo(); assert.equal(i.can, false);
  assert.match(i.reason, /집 2채\(자리 3\) · 갈매미 3마리/);
  assert.match(summonHtml(i, w.units).head, /자리 <b>3<\/b>/); assert.match(RULES[0], /2층집은 두 마리/);
  assert.equal(P.houseSlots([{ defId: "cottage" }, { defId: "cottage" }, { defId: "giantHouse" }]), 4, "자이언트의 집은 보통 자리 아님");
});

test("같이 살기: 첫 갈매미가 사고(주인), 둘째가 집값 절반을 주인에게 내고 들어옴 — 금고·대출 안 씀, 돈 총량 그대로, 셋째는 자리 없음", () => {
  const { w, c, boss, mini, carp } = town();
  assert.deepEqual(w.housesToShare(mini), [], "주인 없는 집은 같이 살기 아님(사는 것)");
  boss.coins = 200; const m0 = money(w); assert.ok(w.buyHouse(boss, c)); assert.equal(money(w), m0, "집 사기: 갈매미 → 금고");
  assert.equal(c.owner, boss.unitId); assert.deepEqual(w.housesForSale(mini), [], "주인이 생기면 매물 아님");
  assert.deepEqual(w.housesToShare(mini).map(b => b.id), [c.id]);
  const price = w.housePrice(c), share = HM.shareOf(price); assert.equal(w.shareDeal(mini, c).share, share);
  mini.coins = share - 1; assert.equal(w.shareDeal(mini, c).ok, false); assert.equal(w.moveIn(mini, c), false, "현금이 모자라면 못 들어옴(대출 없음)");
  mini.coins = share + 5; const v0 = w.bank.vault, b0 = boss.coins, t0 = money(w);
  const evs = []; w.on("market", e => evs.push(e));
  assert.ok(w.moveIn(mini, c));
  assert.equal(mini.home, c.id); assert.deepEqual(c.mates, [mini.unitId]); assert.equal(mini.coins, 5); assert.equal(boss.coins, b0 + share);
  assert.equal(w.bank.vault, v0, "금고는 그대로"); assert.equal(money(w), t0, "돈이 생기거나 사라지지 않음"); assert.equal(mini.loan ?? null, null);
  assert.equal(evs.at(-1).kind, "share"); assert.equal(evs.at(-1).share, share);
  assert.ok(w.canEnter(mini, c) && w.canEnter(boss, c)); assert.equal(w.canEnter(carp, c), false);
  carp.coins = 500; assert.deepEqual(w.housesToShare(carp), [], "자리가 다 참"); assert.equal(w.moveIn(carp, c), false);
  assert.equal(w.moveIn(mini, c), false, "이미 집이 있음"); assert.equal(w.buyHouse(mini, ready(w, "house")), false, "같이 사는 갈매미는 집을 또 사지 않음");
  assert.equal(HM.residentsText(c, w.units), "주민 2/2 · 주인 기본 · 같이 사는 미니");
  assert.match(gullChips(mini, w).home, /🏠 2층집 · 같이 사는 기본/); assert.match(gullChips(boss, w).home, /같이 사는 미니/);
  // 한 명 집(작은 집)은 같이 살 수 없음
  const h = ready(w, "house"); carp.coins = 500; assert.ok(w.buyHouse(carp, h)); const gold = w.units.find(u => u.name === "황금"); gold.coins = 500;
  assert.ok(!w.housesToShare(gold).includes(h)); assert.equal(w.moveIn(gold, h), false);
});

test("같이 사는 갈매미: 숙박비 없음 · 침대는 따로(사는 수만큼 침대를 사고 싶어 함) · 둘 다 밤에 내 집 2층 침실에서 잠", () => {
  const { w, c, boss, mini } = town(); w.instantBuild = true;
  boss.coins = 200; w.buyHouse(boss, c); mini.coins = 100; w.moveIn(mini, c);
  assert.equal(w.lodge(mini, c), -1); assert.equal(w.lodge(boss, c), -1);
  assert.equal(F.nextWant(c), "bed"); F.autoPlace(w, c, "bed"); assert.equal(F.nextWant(c), "bed", "둘이 사는데 침대 하나 → 하나 더");
  F.autoPlace(w, c, "bed"); assert.equal(F.bedCount(c), 2); assert.notEqual(F.nextWant(c), "bed");
  const ls = F.levels(c), beds = F.allFurniture(c).filter(o => o.id === "bed"); assert.equal(beds.length, 2);
  for (const o of beds) assert.equal(ls[ls.findIndex(L => L.furniture.includes(o))].role, "bedroom", "침대 둘 다 2층 침실");
  assert.equal(F.pickUse(c, true, () => 0, [beds[0]]), beds[1], "남이 쓰는 침대는 피함"); assert.equal(F.pickUse(c, true, () => 0, beds), beds[0]);
  const coins0 = [boss.coins, mini.coins]; w.isNight = true; let lodged = 0; w.on("lodging", () => lodged++);
  for (const u of [boss, mini]) { u.state = "Idle"; u.timer = 0; u.needs.energy = 10; }
  const slept = new Set();
  for (let t = 0; t < 200 && slept.size < 2; t += 0.1) { for (const o of w.units) o.full = 90; w.update(0.1); w.stepLodging?.();
    for (const u of [boss, mini]) if (u.insideBuildingId === c.id && u.insideAct === "sleep") slept.add(u.name); }
  assert.deepEqual([...slept].sort(), ["기본", "미니"].sort(), "둘 다 집에서 잠");
  assert.ok(boss.useFurni && mini.useFurni && boss.useFurni !== mini.useFurni, "침대 따로");
  assert.equal(lodged, 0); assert.ok(boss.lodgeNight == null && mini.lodgeNight == null, "숙박비를 걷지 않음");
  assert.ok(boss.coins >= coins0[0] - 6 && mini.coins >= coins0[1] - 6, "돈은 밥값 정도만 줄어듦");
});

test("집 없는 갈매미는 스스로 자리가 남은 2층집에 같이 살러 감(매물이 없을 때) — 단짝 소원도 한 집이면 이룸", () => {
  const { w, c, boss, mini } = town(); boss.coins = 200; w.buyHouse(boss, c);
  for (const u of w.units) if (u !== mini) u.home = u.home || 999;   // 다른 갈매미는 집 있는 셈(한 마리만 봄)
  mini.coins = 60; let t = 0;
  for (; t < 400 && !mini.home; t += 0.1) { for (const o of w.units) { o.full = 90; if (o.needs) o.needs.energy = 90; } w.update(0.1); }
  assert.equal(mini.home, c.id, `${t.toFixed(0)}초 안에 들어옴`); assert.deepEqual(c.mates, [mini.unitId]);
  const nb = WISH_BY_ID.neighbor; assert.equal(nb.done(w, mini, { base: "기본" }), true, "단짝 옆집 소원: 한 집에 같이 살면 이룸"); assert.equal(nb.lost(w, mini, { base: "기본" }), false);
});

test("철거: 주인·같이 사는 갈매미 모두 집 없음, 주인의 남은 빚은 없애 줌 · 다시 같이 살 수 있음", () => {
  const { w, c, boss, mini } = town(); boss.coins = 30; assert.ok(w.buyHouse(boss, c)); assert.ok(boss.loan, "대출로 삼");
  mini.coins = 100; assert.ok(w.moveIn(mini, c)); const left = boss.loan.left, f0 = w.bank.forgiven || 0;
  w.removeBuilding(c.id);
  assert.equal(boss.home, null); assert.equal(mini.home, null); assert.equal(boss.loan, null); assert.equal(w.bank.forgiven, f0 + left);
  assert.ok(!w.buildings.has(c.id));
});

test("저장/불러오기: 같이 사는 갈매미가 그대로(들어가기·숙박비 없음) · 예전 저장(mates 없음) → 빈 목록 · 망가진 기록 정리", () => {
  const { w, c, boss, mini } = town(); boss.coins = 200; w.buyHouse(boss, c); mini.coins = 100; w.moveIn(mini, c);
  const j = JSON.parse(JSON.stringify(w.serialize())); const back = World.fromJSON(j), bc = back.buildings.get(c.id);
  const bm = back.units.find(u => u.name === "미니"), bb = back.units.find(u => u.name === "기본");
  assert.equal(bc.owner, bb.unitId); assert.deepEqual(bc.mates, [bm.unitId]); assert.equal(bm.home, c.id); assert.ok(back.canEnter(bm, bc)); assert.equal(back.lodge(bm, bc), -1);
  assert.equal(JSON.stringify(back.serialize().buildings.find(b => b.id === c.id).mates), JSON.stringify([bm.unitId]));
  // 예전 저장: mates가 없음
  const old = JSON.parse(JSON.stringify(j)); for (const b of old.buildings) delete b.mates; for (const u of old.units) if (u.name === "미니") u.home = null;
  const ob = World.fromJSON(old), oc = ob.buildings.get(c.id); assert.deepEqual(oc.mates, []); assert.equal(HM.roomLeft(oc), 1);
  assert.ok(old.buildings.filter(b => b.defId === "house").every(b => !("mates" in b)));
  assert.ok(!("mates" in back.serialize().buildings.find(b => b.defId === "market")), "같이 사는 갈매미가 없으면 저장에 안 씀");
  // 망가진 기록: 집을 두지 않은 갈매미·없는 갈매미는 빼고, 주인이 마을에 없으면 같이 사는 갈매미가 주인
  const bad = JSON.parse(JSON.stringify(j)), bcs = bad.buildings.find(b => b.id === c.id); bcs.mates = [bm.unitId, 4242, bb.unitId]; bcs.owner = 777;
  const xb = World.fromJSON(bad), xc = xb.buildings.get(c.id); assert.equal(xc.owner, bm.unitId); assert.deepEqual(xc.mates, [bb.unitId], "기본은 그 집을 집으로 두니 같이 사는 갈매미로 남음");
  // 한 명 집에 mates가 적혀 있으면 넘치는 쪽은 집 없음
  const over = JSON.parse(JSON.stringify(j)), small = over.buildings.find(b => b.defId === "house"); small.owner = bb.unitId; small.mates = [bm.unitId];
  over.buildings.find(b => b.id === c.id).mates = []; over.units.find(u => u.name === "미니").home = small.id;
  const yb = World.fromJSON(over); assert.deepEqual(yb.buildings.get(small.id).mates, []); assert.equal(yb.units.find(u => u.name === "미니").home, null);
});
