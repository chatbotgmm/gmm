// 선물 개편 시험(three.js 없이): 갈매미 소지품 · 스스로 팔기 · 잡은 갈매미의 수족관 기증 · ✨ 반짝이(내 주머니) · 도장 선물 · 저장·예전 저장 옮기기
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { UNITS, ITEMS, FISH, PERSONA, FURNITURE } from "../src/data/catalog.js";
import { UnitState, GroundType } from "../src/data/types.js";
import { seededRandom } from "../src/util.js";
import * as B from "../src/world/bond.js";
import * as J from "../src/world/jobs.js";
import * as D from "../src/world/daily.js";
import * as K from "../src/world/skywatch.js";
import * as S from "../src/world/sparkles.js";
import * as Be from "../src/world/belongings.js";
import * as F from "../src/world/furniture.js";

// 예전 ITEMS 앞부분(낚시 결과가 예전과 같으려면 순서가 그대로여야 함)
const OLD_ITEM_IDS = ["bottle", "pearl", "chair", "table", "bookshelf", "bed", "petal", "conch", "maple", "iceshell", "stardust",
  "festSpring", "festSummer", "festAutumn", "festWinter", "stampRug", "stampLamp", "stampShelf", "stampBed"];
/** 난수 하나가 이 물고기/물건을 뽑게 하는 값(jobs.js rollFish·rollItem과 같은 비중 셈) */
const fishPos = (u, id, season) => { const m = J.skillMult(u, "fish"), ws = FISH.map(f => J.inSeason(f, season) ? f.weight * (f.rarity === "common" ? 1 : m) : 0), tot = ws.reduce((a, b) => a + b, 0);
  let acc = 0; for (let i = 0; i < FISH.length; i++) { if (FISH[i].id === id) return (acc + ws[i] / 2) / tot; acc += ws[i]; } throw new Error(id); };
const itemPos = (u, id, season) => { const w = { common: 50, rare: 30, epic: 15, legend: 5 }, m = J.skillMult(u, "fish");
  const ws = ITEMS.map(i => J.inSeason(i, season) && !i.sky && !i.fest && !i.stamp && !i.gift ? w[i.rarity] * (i.rarity === "common" ? 1 : m) : 0), tot = ws.reduce((a, b) => a + b, 0);
  let acc = 0; for (let i = 0; i < ITEMS.length; i++) { if (ITEMS[i].id === id) return (acc + ws[i] / 2) / tot; acc += ws[i]; } throw new Error(id); };
/** 정해 둔 물고기(+ 물건)를 낚게 함. 쓴 난수 수를 calls에 셈 */
function land(w, u, fishId, itemId = null) {
  const seq = [fishPos(u, fishId, w.season), itemId ? 0 : 0.999, itemId ? itemPos(u, itemId, w.season) : 0.5]; let k = 0;
  const r = w.landFish(u, () => seq[k++]); r.calls = k; return r;
}
const spotFor = (w, d) => { const c = w.center; for (let r = 4; r < 60; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; };
const placeAny = (w, defId, hits = 1e9) => { const c = w.center; for (let rr = 2; rr < 40; rr++) for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) { const r = w.placeBuilding(defId, c.x + dx, c.z + dz, 0, null, hits); if (r.ok) return r.building; } return null; };
/** 수족관 공사를 놓고 다 지음(망치질이 끝난 것과 같은 길: buildingDone) */
const buildAquarium = w => { const b = placeAny(w, "aquarium", 0); assert.ok(b && !w.isDone(b)); w.finishAll(); return b; };
/** 경제 마을: 은행 + 시장 + 상인(황금) + 어부(물방울) */
function econ() {
  const w = World.create(7, seededRandom(1), { wild: true }); w.instantBuild = true; w.addUnitByName("목수"); w.addUnitByName("황금"); w.addUnitByName("물방울");
  const q = spotFor(w, "market"); assert.ok(q, "시장 자리"); w.placeBuilding("market", q[0], q[1], 0, null, 1e9); assert.ok(w.marketB() && w.economy);
  return { w, gold: w.units.find(u => u.name === "황금"), fisher: w.units.find(u => u.name === "물방울") };
}

test("카탈로그: 반짝이 9 + 도장 선물 7은 플레이어 몫 선물거리, 기존 줄·도장 가구는 그대로, 갈매미마다 계절마다 좋아하는 반짝이가 있음", () => {
  const gifts = ITEMS.filter(i => i.gift);
  assert.equal(gifts.length, 16); assert.deepEqual(ITEMS.slice(0, OLD_ITEM_IDS.length).map(i => i.id), OLD_ITEM_IDS, "앞부분 순서 그대로");
  assert.ok(ITEMS.slice(OLD_ITEM_IDS.length).every(i => i.gift), "새 줄은 모두 맨 뒤");
  for (const i of gifts) {
    assert.ok(!i.furniture && !i.price && !("season" in i) && !("stamp" in i) && !i.sky && !i.fest, i.id);
    const d = B.giftDef(i.id); assert.equal(d.kind, "item"); assert.ok(B.GIFT_CAT_NAME[d.cat], `${i.name} 갈래`);
    assert.equal(Be.stashDef(i.id), null, "플레이어 몫은 소지품이 될 수 없음");
  }
  assert.equal(gifts.filter(i => i.sparkle).length, 9); assert.ok(gifts.filter(i => i.sparkle).every(i => ["beach", "village"].includes(i.sparkle)));
  assert.equal(D.STAMP_SHOP.length, 4); assert.ok(D.STAMP_SHOP.every(s => FURNITURE[s.furniture]), "도장 가게 가구는 예전 그대로(화면이 FURNITURE로 읽음)");
  assert.equal(D.STAMP_GIFTS.length, 7); assert.deepEqual([...new Set(D.STAMP_GIFTS.map(i => B.giftDef(i.id).cat))].sort(), ["best", "fish", "ice", "letter", "plant", "sea", "shiny"]);
  assert.ok(D.STAMP_GIFTS.every(i => D.stampCost(i) > 0)); assert.equal(D.stampCost(ITEMS.find(i => i.id === "crownCookie")), 2); assert.equal(D.stampCost(null), 0);
  for (const name of Object.keys(PERSONA)) for (const season of ["spring", "summer", "autumn", "winter", null]) {
    const kinds = [...S.sparkleKinds("beach", season), ...S.sparkleKinds("village", season)];
    assert.ok(kinds.some(i => B.giftTier(name, i.id) === 2), `${name} ${season}: 좋아하는 반짝이`);
  }
  for (const name of Object.keys(PERSONA)) assert.equal(B.giftTier(name, "crownCookie"), 2, "왕관 쿠키는 누구나");
  assert.deepEqual(S.sparkleKinds("village", "winter").map(i => i.id), ["postcard", "pinecone", "icicle"]);
  assert.deepEqual(S.sparkleKinds("village", null).map(i => i.id), ["postcard", "clover"]);
  // 낚시·바닷가로는 플레이어 몫이 안 나옴
  const r = seededRandom(5), u = { skill: {} }, got = new Set();
  for (const season of ["spring", "summer", "autumn", "winter", null]) for (let i = 0; i < 2000; i++) got.add(J.rollItem(u, r, season, 3).id);
  assert.ok(![...got].some(id => ITEMS.find(i => i.id === id).gift), "rollItem에 선물거리 없음");
  assert.equal(B.pocketCount({ items: { shell: 2, chair: 1, goldLetter: 1, pearl: 1 } }), 4, "가구 빼고 선물거리만");
});

test("소지품: 잡은 희귀 물고기·덤 물건·바닷가 물건·별조각은 잡은 갈매미 것(마을 가방·선물 목록에 없음), 난수 수는 그대로", () => {
  const w = World.create(7, seededRandom(3), { empty: true }); w.instantBuild = true; const u = w.addUnit(UNITS[5], 5, w.center.x + 0.5, w.center.z + 0.5);
  assert.deepEqual(u.stash, {});
  let r = land(w, u, "flatfish"); assert.equal(r.fish.id, "flatfish"); assert.equal(r.calls, 2); assert.equal(u.stash.flatfish, 1);
  assert.equal(w.treasures.flatfish, undefined); assert.equal(w.collection.flatfish, 1, "도감은 마을 기록");
  r = land(w, u, "anchovy", "bottle"); assert.equal(r.item.id, "bottle"); assert.equal(r.calls, 3); assert.equal(u.stash.bottle, 1); assert.equal(w.items.bottle, undefined);
  assert.equal(u.stash.anchovy, undefined, "흔한 물고기는 음식");
  r = land(w, u, "anchovy", "chair"); assert.equal(r.item.id, "chair"); assert.equal(u.stash.chair, 1, "집이 없으면 가구도 들고 다님"); assert.equal(w.items.chair, undefined);
  assert.deepEqual(B.giftables(w), [], "갈매미 소지품은 선물로 못 씀");
  assert.equal(w.giveGift(u, "flatfish"), null); assert.equal(w.giveGift(u, "bottle"), null);
  // 집이 있으면 낚은 가구는 그 집에(자리가 없으면 창고)
  const h = placeAny(w, "house"); assert.ok(h); u.home = h.id; const it = F.room(h), before = it.levels[0].furniture.length + (it.stash.coralTable || 0);
  r = land(w, u, "anchovy", "table"); assert.equal(r.item.id, "table"); assert.equal(u.stash.table, undefined);
  assert.equal(it.levels[0].furniture.filter(o => o.id === "coralTable").length + (it.stash.coralTable || 0), 1); assert.ok(it.levels[0].furniture.length + (it.stash.coralTable || 0) > before);
  // 바닷가 계절 물건
  w.setSeason("winter"); let got = null; for (let i = 0; i < 300 && !got; i++) got = w.beachcomb(u);
  assert.equal(got?.id, "iceshell"); assert.ok(u.stash.iceshell >= 1); assert.equal(w.items.iceshell, undefined);
  // 별조각: 주운 야행성 갈매미 것
  const s = World.create(7, seededRandom(1), { wild: true }); s.setSeason("summer"); s.addUnitByName("불씨"); const fire = s.units.find(x => x.name === "불씨");
  s.weather = { kind: "clear", t: 1e9 }; s.isNight = true; s.skyRnd = () => 0; fire.state = UnitState.Idle; s.startSky("meteor", true);
  const stars = []; s.on("starPiece", e => stars.push(e.u.name)); s.stepSky(K.STAR_CHECK_SECS);
  assert.deepEqual(stars, ["불씨"]); assert.equal(fire.stash.stardust, 1); assert.equal(s.items.stardust, undefined);
  assert.deepEqual(Be.stashList(u).map(x => [x.id, x.kind]), [["flatfish", "fish"], ["bottle", "item"], ["chair", "item"], ["iceshell", "item"]]);
  assert.equal(Be.stashList(u).find(x => x.id === "chair").furniture, true); assert.equal(Be.stashCount(u), 3 + u.stash.iceshell);
});

test("수족관: 처음 낚은 종류는 바로 기증, 수족관 전에 낚아 둔 것은 다 지어지면 그 갈매미가 기증(아껴 둔), 기념 가구는 내 가방", () => {
  const w = World.create(7, seededRandom(3), { empty: true }); w.instantBuild = true; const u = w.addUnit(UNITS[5], 5, w.center.x + 0.5, w.center.z + 0.5);
  land(w, u, "flatfish"); land(w, u, "flatfish"); assert.equal(u.stash.flatfish, 2);
  const ev = []; w.on("donate", e => ev.push(e)); w.rank = 2;
  const pre = World.create(7, seededRandom(3), { empty: true }), pu = pre.addUnit(UNITS[5], 5, pre.center.x + 0.5, pre.center.z + 0.5); land(pre, pu, "flatfish"); placeAny(pre, "aquarium");
  assert.equal(pu.stash.flatfish, 1, "놓자마자 완공(시험·불러오기)에는 기증하지 않음 → 팔러 갈 때 기증"); assert.deepEqual(pre.sellStash(pu).donated, [], "시장이 없으면 아무 일 없음");
  buildAquarium(w); assert.ok(w.aquariumB());
  assert.equal(w.donated.flatfish, true); assert.equal(u.stash.flatfish, 1, "한 마리만 기증"); assert.equal(ev.length, 1); assert.equal(ev[0].u, u); assert.equal(ev[0].kept, true);
  assert.match(w.newsLog.at(-1).text, /^물방울이 아껴 둔 광어를 수족관에 기증했어요!$/);
  let r = land(w, u, "octopus"); assert.equal(r.donated, true); assert.equal(u.stash.octopus, undefined); assert.equal(ev.length, 1, "landFish는 알림 없이");
  r = land(w, u, "octopus"); assert.equal(r.donated, false); assert.equal(u.stash.octopus, 1);
  r = land(w, u, "tuna"); assert.equal(r.donated, true); assert.deepEqual(r.gifts.map(g => g.item.id), ["chair"]); assert.equal(w.items.chair, 1, "기념 가구는 내 가방(집 꾸미기)");
  assert.deepEqual(w.donateFromStash(u), [], "이미 기증한 종류는 또 안 함");
  // catchFish로 낚으면 기증 알림의 u = 낚은 갈매미
  const N = [];
  const w2 = World.create(7, seededRandom(3), { empty: true }); const u2 = w2.addUnit(UNITS[5], 5, w2.center.x + 0.5, w2.center.z + 0.5); w2.rank = 2; placeAny(w2, "aquarium"); w2.on("donate", e => N.push(e));
  for (let i = 0; i < 400 && !N.length; i++) { w2.time += 1; w2.catchFish(u2); }
  assert.ok(N.length > 0); assert.equal(N[0].u, u2); assert.ok(!N[0].kept);
});

test("팔기: 갈매미가 소지품을 시장에서 스스로 팖 — 조개는 주인에게, 상인 몫 1개에 1, 좋아하는 건 하나 간직, 가구는 안 팖, 은행이 새 돈", () => {
  const { w, gold, fisher } = econ();
  fisher.stash = { tuna: 2, bottle: 1, chair: 1 }; const f0 = fisher.coins || 0, g0 = gold.coins, issued = w.bank.issued, ev = []; w.on("stashSale", e => ev.push(e));
  assert.deepEqual(Be.stashSellable(fisher), { tuna: 1, bottle: 1 }, "물방울은 물고기를 좋아해서 참치 하나는 간직");
  const r = w.sellStash(fisher);
  assert.equal(r.n, 2); assert.equal(r.coins, 25 + 4); assert.equal(r.cut, 2); assert.deepEqual(r.items, [{ id: "tuna", n: 1 }, { id: "bottle", n: 1 }]);
  assert.equal(fisher.coins, f0 + 27); assert.equal(gold.coins, g0 + 2); assert.equal(w.bank.issued, issued + 29); assert.deepEqual(fisher.stash, { tuna: 1, chair: 1 });
  assert.equal(ev.length, 1); assert.equal(ev[0].u, fisher);
  assert.equal(w.sellStash(fisher).n, 0, "남은 건 간직하는 것과 가구뿐");
  // 상인 자신이 팔 때는 몫 없음
  gold.stash = { pearl: 2, maple: 1 }; const g1 = gold.coins; const r2 = w.sellStash(gold);
  assert.deepEqual(r2.items, [{ id: "pearl", n: 1 }, { id: "maple", n: 1 }]); assert.equal(r2.cut, 0); assert.equal(gold.coins, g1 + 25); assert.deepEqual(gold.stash, { pearl: 1 });
  // 집을 사면 들고 다니던 낚시 가구는 그 집 창고로
  const q = spotFor(w, "house"); const h = w.placeBuilding("house", q[0], q[1], 0, null, 1e9).building; fisher.coins = 100;
  assert.ok(w.buyHouse(fisher, h)); assert.equal(fisher.stash.chair, undefined); assert.equal(F.room(h).stash.driftChair, 1);
  // 시장이 없으면 아무 일 없음
  const w0 = World.create(7, seededRandom(1), { wild: true }); w0.addUnitByName("황금"); const b = w0.units[0]; b.stash = { tuna: 3 };
  assert.deepEqual(w0.sellStash(b), { n: 0, coins: 0, cut: 0, items: [], donated: [] }); assert.deepEqual(b.stash, { tuna: 3 });
  // 수족관이 있으면 팔기 전에 아껴 둔 종류를 기증
  w.rank = 2; fisher.stash = { octopus: 3 }; placeAny(w, "aquarium"); assert.equal(fisher.stash.octopus, 3, "놓자마자 완공은 기증 안 함");
  const r3 = w.sellStash(fisher); assert.deepEqual(r3.donated.map(f => f.id), ["octopus"], "팔러 가서 먼저 기증"); assert.equal(w.donated.octopus, true); assert.deepEqual(fisher.stash, { octopus: 1 }, "좋아하는 물고기 하나는 간직");
});

test("팔기: 경제 마을에서 팔 것이 모인 갈매미는 스스로 시장에 가서 팖(peddle)", () => {
  const { w, fisher } = econ(); fisher.stash = { flatfish: 2, octopus: 2, bottle: 1 }; const sold = [];
  w.on("stashSale", e => sold.push(e.u.name));
  for (const u of w.units) { u.full = 90; if (u.needs) Object.assign(u.needs, { energy: 100, social: 100, fun: 100 }); }
  fisher.state = UnitState.Idle; fisher.timer = 0; fisher.committed = null;
  for (let i = 0; i < 1500 && !sold.includes("물방울"); i++) w.update(0.1);
  assert.ok(sold.includes("물방울"), "물방울이 소지품을 팖"); assert.equal(fisher.stash.bottle, undefined); assert.equal(fisher.stash.flatfish, 1); assert.equal(fisher.stash.octopus, 1);
});

test("옛 섬 가판대(trade)는 내 주머니의 반짝이·도장 선물을 팔지 않음", () => {
  const w = World.create(7, seededRandom(33)), merchant = w.units.find(u => u.job === "merchant");
  Object.assign(w.items, { shell: 2, goldLetter: 1, bottle: 1 }); w.trade(merchant);
  assert.equal(w.items.shell, 2); assert.equal(w.items.goldLetter, 1); assert.equal(w.items.bottle, 0, "예전 칸의 물건은 예전처럼 팖"); assert.ok(Number.isFinite(w.res.coins));
});

test("반짝이: 20초 뒤 바닷가 1·마을 1, 칸 조건·간격, 하루에 많아야 6개·수명, 따로 굴리는 난수, 같은 씨앗이면 같은 자리, 줍기 → 내 주머니 → 선물", () => {
  const w = World.create(7, seededRandom(1), { wild: true }), spawned = [], gone = [];
  w.on("sparkleSpawn", s => spawned.push(s)); w.on("sparkleGone", s => gone.push(s));
  for (let i = 0; i < (S.SPARKLE_FIRST - 1) * 2; i++) w.update(0.5); assert.equal(w.sparkles.length, 0);
  for (let i = 0; i < 4; i++) w.update(0.5);
  assert.equal(w.sparkles.length, 2); assert.equal(spawned.length, 2);
  const sand = s => w.grid.get(s.x, s.z).groundType === GroundType.Sand;
  assert.equal(w.sparkles.filter(sand).length, 1, "바닷가 하나"); assert.equal(w.sparkles.filter(s => !sand(s)).length, 1, "마을 하나");
  for (const s of w.sparkles) {
    assert.ok(S.sparkleCellFree(w, s.x, s.z)); assert.ok(!w.grid.isWater(s.x, s.z)); assert.ok(ITEMS.find(i => i.id === s.k).sparkle === (sand(s) ? "beach" : "village"));
    assert.ok(s.t > 0 && s.t <= S.SPARKLE_LIFE);
  }
  const vil = w.sparkles.find(s => !sand(s)), bank = w.bankB(); assert.ok(bank.cells.some(([x, z]) => Math.max(Math.abs(x - vil.x), Math.abs(z - vil.z)) <= S.SPARKLE_NEAR), "마을 = 건물 둘레");
  // 다른 난수를 쓰지 않음
  let used = 0; const count = f => () => { used++; return f(); }; w.rnd = count(w.rnd); w.wrnd = count(w.wrnd); w.skyRnd = count(w.skyRnd);
  w.spawnSparkles(); w.stepSparkles(1); assert.equal(used, 0, "마을·날씨·하늘 난수는 그대로");
  assert.equal(w.sparkles.length, 4);
  for (let i = 0; i < w.sparkles.length; i++) for (let k = i + 1; k < w.sparkles.length; k++) { const a = w.sparkles[i], b = w.sparkles[k]; assert.ok(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z)) > S.SPARKLE_GAP, "간격"); }
  w.spawnSparkles(); assert.equal(w.sparkles.length, 6); assert.deepEqual(w.spawnSparkles(), [], "꽉 차면 건너뜀"); assert.equal(w.sparkles.length, S.SPARKLE_MAX);
  // 수명
  const first = w.sparkles[0]; first.t = 1; w.stepSparkles(1.5); assert.ok(!w.sparkles.includes(first)); assert.ok(gone.some(s => s.id === first.id));
  // 하루를 돌려도 많아야 6개, 다 사라지고 새로 생김
  const v = World.create(9, seededRandom(2), { wild: true }); let most = 0, made = 0; v.on("sparkleSpawn", () => made++);
  for (let i = 0; i < 1500; i++) { v.update(1); most = Math.max(most, v.sparkles.length); }
  assert.ok(most <= S.SPARKLE_MAX); assert.ok(made >= 14, `생긴 수 ${made}`); assert.ok(v.sparkles.every(s => s.t <= S.SPARKLE_LIFE));
  // 같은 씨앗이면 같은 자리·종류
  const a = World.create(7, seededRandom(1), { wild: true }), b = World.create(7, seededRandom(5), { wild: true });
  const pick = x => [x.spawnSparkles(), x.spawnSparkles()].flat().map(s => [s.k, s.x, s.z]);
  assert.deepEqual(pick(a), pick(b));
  // 줍기
  const u = w.units[0], s = w.sparkles[0], near = w.sparkleNear(s.x + 0.5, s.z + 0.5);
  assert.equal(near, s); assert.equal(w.sparkleNear(s.x + 0.5 + 5, s.z + 0.5 + 5, 1), w.sparkles.find(o => Math.hypot(o.x - s.x - 5, o.z - s.z - 5) <= 1) || null);
  const got = []; w.on("sparkle", e => got.push(e.item.id)); const n0 = w.sparkles.length;
  const item = w.pickSparkle(s.id); assert.equal(item.id, s.k); assert.equal(w.items[s.k], 1); assert.equal(w.sparkles.length, n0 - 1); assert.deepEqual(got, [s.k]);
  assert.equal(w.pickSparkle(s.id), null, "두 번은 못 주움"); assert.equal(w.pickSparkle(9999), null);
  assert.deepEqual(B.giftables(w).map(g => [g.id, g.n]), [[s.k, 1]]);
  const r = w.giveGift(u, s.k); assert.equal(r.tier, B.giftTier(u.name, s.k)); assert.equal(u.bond, B.GIFT_TIERS[r.tier].bond); assert.equal(w.items[s.k], 0);
  // 그사이 그 칸에 건물이 들어서면 사라짐
  const t = w.sparkles[0]; w.grid.get(t.x, t.z).occupiedId = "막음"; w.stepSparkles(0.1); assert.ok(!w.sparkles.includes(t)); w.grid.get(t.x, t.z).occupiedId = null;
});

test("도장 선물: 도장으로 사서 내 주머니로, 정이 두 배, 왕관 쿠키는 누구나 좋아함, 도장 가구도 예전처럼, 부탁 '선물 주기'는 주머니에 선물거리가 있을 때만", () => {
  const w = World.create(7, seededRandom(33)), shadow = w.units.find(u => u.name === "그림자"), fire = w.units.find(u => u.name === "불씨"), buys = [];
  w.on("stampBuy", e => buys.push(e.item.id));
  w.stamps = 3; assert.equal(w.buyStamp("goldLetter"), true); assert.equal(w.stamps, 2); assert.equal(w.items.goldLetter, 1); assert.equal(w.stampBought.goldLetter, 1);
  let r = w.giveGift(shadow, "goldLetter"); assert.equal(r.tier, 2); assert.equal(r.say, "최고야!"); assert.equal(shadow.bond, B.GIFT_TIERS[2].bond * B.STAMP_GIFT_BOND);
  assert.equal(w.buyStamp("crownCookie"), true); assert.equal(w.stamps, 0); r = w.giveGift(fire, "crownCookie"); assert.equal(r.tier, 2); assert.equal(fire.bond, 8);
  assert.equal(w.buyStamp("bouquet"), false, "도장이 모자람"); assert.equal(w.buyStamp("nope"), false); assert.equal(w.buyStamp("pearl"), false, "가게 물건이 아님");
  w.stamps = 1; assert.equal(w.buyStamp("stampRug"), true); assert.equal(w.items.stampRug, 1, "도장 가구는 예전처럼 내 가방(집 꾸미기)");
  assert.deepEqual(buys, ["goldLetter", "crownCookie", "stampRug"]);
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(1));
  assert.deepEqual(back.stampBought, { goldLetter: 1, crownCookie: 1, stampRug: 1 });
  assert.deepEqual(D.stampBoughtFromSave({ goldLetter: 2, crownCookie: -1, nope: 3 }), { goldLetter: 2 });
  // 부탁: 주머니에 선물거리가 있을 때만(지도에 반짝이만 있고 주머니가 비면 고르지 않음 — 줍지 못하면 그날 도장이 막힘)
  const gift = D.DAILY_POOL.find(d => d.id === "gift"), v = World.create(7, seededRandom(1), { wild: true });
  assert.equal(gift.ok(v), false); v.spawnSparkles(); assert.ok(v.sparkles.length > 0); assert.equal(gift.ok(v), false, "반짝이만 있고 주머니는 빔");
  const s0 = v.sparkles[0]; assert.ok(v.pickSparkle(s0.id)); assert.equal(gift.ok(v), true, "주운 뒤엔 할 수 있음");
});

test("저장·불러오기: 소지품·반짝이·시계가 남고, 예전 저장은 한 번만 옮김(보물 → 낚시꾼, 간직 안 한 물건 → 갈매미, 별조각 → 야행성, 간직한 것·가구 → 내 가방)", () => {
  const w = World.create(7, seededRandom(1), { wild: true }); for (const n of ["물방울", "불씨", "황금"]) w.addUnitByName(n);
  const fisher = w.units.find(u => u.name === "물방울"), fire = w.units.find(u => u.name === "불씨");
  fisher.stash = { tuna: 2, chair: 1 }; w.spawnSparkles(); w.sparkClock = 77.5; w.sparkles[0].t = 123.25;
  const j = JSON.parse(JSON.stringify(w.serialize())); assert.equal(j.ownership, 1); assert.equal(j.version, 2);
  const back = World.fromJSON(j, seededRandom(2));
  assert.deepEqual(back.units.find(u => u.name === "물방울").stash, { tuna: 2, chair: 1 }); assert.deepEqual(back.units.find(u => u.name === "기본").stash, {});
  assert.deepEqual(back.sparkles.map(({ k, x, z, t }) => [k, x, z, t]), w.sparkles.map(({ k, x, z, t }) => [k, x, z, t])); assert.equal(back.sparkClock, 77.5);
  assert.ok(back.sparkles.every(s => Number.isInteger(s.id))); assert.equal(back.migrated, undefined, "새 저장은 옮기지 않음");
  { const ids = back.sparkles.map(s => s.id); assert.equal(new Set(ids).size, ids.length); const s = back.spawnSparkles()[0]; if (s) assert.ok(!ids.includes(s.id), "새 반짝이 id가 겹치지 않음"); }
  // 망가진 값은 걸러짐
  const odd = JSON.parse(JSON.stringify(j)); odd.units.find(u => u.name === "황금").stash = { tuna: -1, nope: 3, bottle: "2", shell: 4, flatfish: 1.7 };
  odd.sparkles = [{ k: "shell", x: 1.5, z: 2, t: 10 }, { k: "nope", x: 1, z: 1, t: 10 }, { k: "pearl", x: 1, z: 1, t: 10 }, { k: j.sparkles[0].k, x: j.sparkles[0].x, z: j.sparkles[0].z, t: 9999 }, j.sparkles[1]];
  odd.sparkClock = 1e9; const o = World.fromJSON(odd, seededRandom(2));
  assert.deepEqual(o.units.find(u => u.name === "황금").stash, { flatfish: 1, bottle: 2 }); assert.deepEqual(o.sparkles.map(s => s.k), [j.sparkles[1].k]); assert.equal(o.sparkClock, S.SPARKLE_EVERY);
  assert.deepEqual(Be.stashFromSave("x"), {}); assert.deepEqual(S.sparklesFromSave(null), []);
  // 예전 저장 흉내(소지품 개편 전): 마을 가방에 갈매미가 잡은 것이 쌓여 있음
  const old = JSON.parse(JSON.stringify(j)); delete old.ownership; delete old.sparkles; delete old.sparkClock; for (const u of old.units) delete u.stash;
  old.treasures = { tuna: 3, flatfish: 0 }; old.items = { pearl: 2, bottle: 1, stardust: 1, chair: 1, festSummer: 1 }; old.keep = { pearl: true, tuna: true };
  const m = World.fromJSON(old, seededRandom(2)), T = Be.stashTotals(m);
  assert.deepEqual(m.migrated, { fish: 3, items: 2, kept: 2 });
  assert.equal(m.units.find(u => u.name === "물방울").stash.tuna, 3, "보물 물고기는 낚시꾼에게"); assert.equal(m.treasures.tuna, undefined); assert.equal(m.treasures.flatfish, undefined);
  assert.equal(m.units.find(u => u.name === "불씨").stash.stardust, 1, "별조각은 야행성에게"); assert.equal(T.bottle, 1); assert.equal(m.items.bottle, undefined); assert.equal(m.items.stardust, undefined);
  assert.equal(m.items.pearl, 2, "간직한 것(답례)은 내 주머니"); assert.equal(m.items.chair, 1); assert.equal(m.items.festSummer, 1, "가구는 내 가방");
  assert.deepEqual(m.keep, { pearl: true }); assert.deepEqual(B.giftables(m).map(g => g.id), ["pearl"]);
  assert.equal(m.newsLog.filter(n => n.icon === "📦").length, 1); assert.match(m.newsLog.find(n => n.icon === "📦").text, /물고기 3마리·물건 2개를 갈매미들이 나눠 가졌어요/);
  assert.equal(m.sparkClock, S.SPARKLE_EVERY - S.SPARKLE_FIRST); assert.deepEqual(m.sparkles, []);
  // 옮긴 마을을 다시 저장·불러와도 또 옮기지 않음
  const again = World.fromJSON(JSON.parse(JSON.stringify(m.serialize())), seededRandom(2));
  assert.equal(again.migrated, undefined); assert.deepEqual(Be.stashTotals(again), T); assert.equal(again.newsLog.filter(n => n.icon === "📦").length, 1);
  // 낚시꾼이 없는 예전 저장: 모두에게 돌아가며
  const old2 = JSON.parse(JSON.stringify(old)); old2.units = old2.units.filter(u => u.name !== "물방울"); old2.treasures = { tuna: 3 };
  const m2 = World.fromJSON(old2, seededRandom(2)); assert.equal(Be.stashTotals(m2).tuna, 3); assert.ok(m2.units.filter(u => u.stash.tuna).length >= 2);
  void fire;
});

test("화면(hud.js·main.js)이 부르는 이름과 돌려주는 모양은 그대로", () => {
  const w = World.create(7, seededRandom(33)), u = w.units.find(x => x.name === "황금");
  for (const k of ["items", "treasures", "keep", "collection", "donated", "fishRecord", "stampBought"]) assert.equal(typeof w[k], "object", k);
  assert.equal(typeof w.stamps, "number"); assert.equal(typeof w.donateGifts, "number");
  w.items.shell = 2; w.treasures.tuna = 1;
  const list = B.giftables(w); assert.deepEqual(list.map(g => [g.id, g.kind, g.cat, g.n]), [["shell", "item", "sea", 2], ["tuna", "fish", "fish", 1]]); assert.ok(list.every(g => typeof g.name === "string"));
  assert.equal(w.toggleKeep("shell"), true); assert.equal(w.toggleKeep("shell"), false); assert.equal(w.toggleKeep("chair"), false);
  const r = w.giveGift(u, "shell"); assert.deepEqual(Object.keys(r).sort(), ["bond", "item", "say", "thanks", "tier"]); assert.ok(Array.isArray(r.thanks));
  assert.equal(w.buyStamp("stampRug"), false); assert.ok(D.STAMP_SHOP.find(s => s.id === "stampRug").name);
  assert.ok(D.STAMP_SHOP.every(s => FURNITURE[s.furniture].colors), "hud.js 233줄: FURNITURE[s.furniture].colors");
  for (const k of Object.keys(B.GIFT_CAT_NAME)) assert.equal(typeof B.GIFT_CAT_NAME[k], "string");
  assert.equal(typeof w.pickSparkle, "function"); assert.equal(typeof w.sparkleNear, "function"); assert.ok(Array.isArray(w.sparkles));
  assert.deepEqual(Be.stashList({ stash: {} }), []); assert.deepEqual(Be.stashTotals(w), {});
});

test("검토 수리: ⚡ 바로 완공 수족관도 아껴 둔 물고기를 기증, 수족관 있는 예전 저장은 옮긴 뒤 바로 기증, 갈매미 없던 예전 저장은 첫 갈매미 때 옮김, 반짝이 난수는 섬 씨앗마다", () => {
  // R1: instantBuild로 놓자마자 완공된 수족관(좋아하는 갈래 1개라 peddle로는 영영 안 감)
  { const { w, fisher } = econ(); w.rank = Math.max(w.rank, 2); fisher.stash = { tuna: 1 };
    const b = placeAny(w, "aquarium", null); assert.ok(b && w.isDone(b)); assert.equal(w.donated.tuna, true); assert.deepEqual(fisher.stash, {}); }
  // 불러오기(hits를 넘김)는 다 지은 일로 치지 않음
  { const { w, fisher } = econ(); w.rank = Math.max(w.rank, 2); fisher.stash = { tuna: 1 }; assert.ok(placeAny(w, "aquarium", 1e9)); assert.equal(w.donated.tuna, undefined); }
  // R2: 수족관이 있는 예전 저장 → 옮겨 받은 보물 물고기를 불러올 때 기증(소식지에 한 줄)
  { const { w } = econ(); w.rank = Math.max(w.rank, 2); assert.ok(placeAny(w, "aquarium", 1e9));
    const j = JSON.parse(JSON.stringify(w.serialize())); delete j.ownership; j.treasures = { tuna: 2 };
    const m = World.fromJSON(j, seededRandom(2)); assert.equal(m.donated.tuna, true); assert.equal(m.units.find(u => u.name === "물방울").stash.tuna, 1, "한 마리 기증, 한 마리는 낚시꾼이 간직");
    assert.ok(m.newsLog.some(n => /참치/.test(n.text) && /기증/.test(n.text)));
    const again = World.fromJSON(JSON.parse(JSON.stringify(m.serialize())), seededRandom(2)); assert.equal(again.units.find(u => u.name === "물방울").stash.tuna, 1); }
  // R3: 갈매미가 없는 예전 저장 → 다시 저장해도 옮기기를 미뤄 두고, 첫 갈매미가 오면 옮김
  { const w = World.create(7, seededRandom(1), { empty: true }); const j = JSON.parse(JSON.stringify(w.serialize())); delete j.ownership; j.treasures = { tuna: 2 }; j.items = { bottle: 3, pearl: 1 }; j.keep = { pearl: true };
    const w2 = World.fromJSON(j, seededRandom(2)); assert.equal(w2.units.length, 0); assert.equal(w2.ownershipPending, true);
    const j2 = JSON.parse(JSON.stringify(w2.serialize())); assert.equal(j2.ownership, 0, "아직 안 옮겼다는 표시");
    const w3 = World.fromJSON(j2, seededRandom(2)); const u = w3.addUnitByName("물방울"); assert.ok(u);
    assert.deepEqual(u.stash, { tuna: 2, bottle: 3 }); assert.deepEqual(B.giftables(w3).map(g => g.id), ["pearl"]); assert.equal(w3.ownershipPending, false);
    assert.equal(JSON.parse(JSON.stringify(w3.serialize())).ownership, 1);
    const w4 = World.fromJSON(j2, seededRandom(2)); const s = w4.summon(); assert.ok(s); assert.equal(Be.stashTotals(w4).tuna, 2, "소환으로 와도 옮김"); }
  // R4: 새 섬의 반짝이 난수는 섬 씨앗에 따라 다르고, 같은 씨앗이면 같음
  { const a = World.create(7, seededRandom(1), { wild: true }), b = World.create(12345, seededRandom(1), { wild: true }), c = World.create(12345, seededRandom(9), { wild: true });
    const sb = [b.sparkRnd(), b.sparkRnd()]; assert.notDeepEqual([a.sparkRnd(), a.sparkRnd()], sb); assert.deepEqual([c.sparkRnd(), c.sparkRnd()], sb); }
});
