// 검토 2묶음: 첫날 소음 줄이기(⚡✕는 풍차나 가로등을 놓은 뒤 · 첫날 부탁에 소환 없음 · 배고파요 칩은 손쓸 수 있을 때만 · 길 부탁은 하루 한 줄 · 공사장 길 막힘 배지)
// + 금고가 말라도 멈추지 않게(도장 동전 · 소원 구제 축하금 · 값싼 장식은 설계비 없이). node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { BUILDINGS } from "../src/data/catalog.js";
import { powerOpen, unpowered } from "../src/world/power.js";
import * as D from "../src/world/daily.js";
import { hungerCall, HUNGER_CHIP } from "../src/ui/hudParts.js";
import { siteStepOf } from "../src/ui/bldView.js";
import { makeGate, alertLine } from "../src/ui/newsAlerts.js";
import { askNoticeMany } from "../src/world/roadAsk.js";
import { rewardOf } from "../src/ui/rewardFx.js";
import { WISH_RESCUE, WISH_BY_ID } from "../src/world/wishes.js";
import * as BK from "../src/world/bank.js";

const fresh = () => World.create(7, seededRandom(3), { wild: true });
const placeNear = (w, defId, x0, z0, hits = 1e9) => { for (let r = 3; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); const q = w.placeBuilding(defId, x, z, 0, null, hits); if (q.ok) return q.building; } return null; };

test("⚡✕: 풍차는 처음부터 지을 수 있지만, 풍차나 가로등을 하나도 안 놓았으면 알리지 않음(첫 화면의 첫 집에 안 뜸), 놓으면 알림", () => {
  assert.equal(BUILDINGS.windmill.rank, undefined, "풍차는 🛖 갯마을부터");
  const w = fresh(); w.rank = 0; assert.equal(powerOpen(w), false, "아직 전기를 안 씀");
  w.rank = 3; assert.equal(powerOpen(w), false, "등급과 상관없음");
  const w2 = fresh(); w2.rank = 0; w2.summon(); const mill = placeNear(w2, "windmill", w2.center.x, w2.center.z, 0);
  assert.equal(w2.isDone(mill), false); assert.equal(powerOpen(w2), true, "짓는 중인 풍차도(범위가 모자란 곳을 알려 줌)");
  w2.removeBuilding(mill.id); assert.equal(powerOpen(w2), false, "철거하면 다시 숨김");
  const w3 = fresh(); w3.summon(); const lamp = placeNear(w3, "streetlamp", w3.center.x, w3.center.z);
  assert.equal(powerOpen(w3), true, "가로등만 놓았으면: 풍차가 있어야 켜진다는 뜻으로 알림"); assert.ok(unpowered(w3).includes(lamp));
  const w4 = fresh(); w4.rank = 0; w4.summon(); placeNear(w4, "windmill", w4.center.x, w4.center.z); assert.equal(powerOpen(w4), true, "불러온 섬에 풍차가 있으면");
});

test("첫 풍차: 처음부터 목수가 지을 수 있고 설계비 0(첫 시장처럼), 둘째부터 설계비 · 놓아도 돈의 합 그대로", () => {
  const M = w => w.bank.vault + w.units.reduce((a, u) => a + (u.coins || 0) + (u.saved || 0), 0) + [...w.buildings.values()].reduce((a, b) => a + (b.order?.left || 0), 0) + w.feesHeld();
  const w = fresh(); w.rank = 0; w.summon(); const c = w.center;
  assert.match(w.check("windmill", Math.floor(c.x) + 6, Math.floor(c.z) - 6, 0).reason || "", /목수/, "목수가 없으면 목수를 부르라고");
  placeNear(w, "house", c.x, c.z + 6); w.summon(); assert.ok(w.units.some(u => u.job === "carpenter"), "집 한 채 더 → 둘째 갈매미는 목수");
  assert.equal(w.feeFor("windmill"), 0); const m0 = M(w), v0 = w.bank.vault;
  const mill = placeNear(w, "windmill", c.x + 6, c.z - 6, null); assert.ok(mill, "🛖 갯마을에서 놓임"); assert.equal(mill.fee, 0); assert.equal(w.bank.vault, v0); assert.equal(M(w), m0, "돈이 오가지 않음");
  assert.equal(w.feeFor("windmill"), BK.FEE.windmill, "짓는 중인 풍차가 있으면 둘째부터는 설계비(새 섬 물가 1배)");
  const mill2 = placeNear(w, "windmill", c.x - 8, c.z - 8, null); assert.equal(mill2.fee, BK.FEE.windmill); assert.equal(w.bank.vault, v0 - BK.FEE.windmill); assert.equal(M(w), m0, "설계비는 금고가 맡아 둠(옮김)");
  w.removeBuilding(mill2.id); w.removeBuilding(mill.id); assert.equal(w.feeFor("windmill"), 0, "다 철거하면 다시 첫 풍차");
  assert.equal(w.feeFor("market"), 0, "첫 시장 규칙은 그대로");
});

test("소원 「밤에도 창문이 환했으면」: 등급과 상관없이 집이 있고 목수가 있을 때 · 힌트는 목수가 풍차를 짓는다고", () => {
  const P = WISH_BY_ID.power, w = fresh(); w.rank = 0; w.summon(); const u = w.units[0];
  u.home ??= [...w.buildings.values()].find(b => BUILDINGS[b.defId].house && !BUILDINGS[b.defId].forUnit)?.id; assert.ok(u.home);
  assert.equal(P.ok(w, u), false, "목수가 없으면 고칠 길이 없어서 안 빎");
  placeNear(w, "house", w.center.x, w.center.z + 6); w.summon(); assert.equal(P.ok(w, u), true, "🛖 갯마을이어도 목수가 오면");
  assert.match(P.hint, /목수가 풍차 발전소를 지어요/); assert.doesNotMatch(P.hint, /어촌|별을|등급/);
  placeNear(w, "windmill", w.center.x, w.center.z); assert.equal(P.ok(w, u), false); assert.equal(P.done(w, u), true);
});

test("새 섬 첫날: 집 한 채 → 둘째 갈매미(목수) → 첫 풍차를 마을 하루(600초) 안에 다 지음(시작 재료 없이 나무·돌을 모아서)", () => {
  const w = World.create(3, seededRandom(40), { wild: true }); w.isNight = false; w.hour = 10;
  let t = 0; const run = (sec, done) => { for (let i = 0; i < sec * 10 && !done(); i++) { w.update(0.1); t += 0.1; } };
  w.summon(); const c = w.center, house = placeNear(w, "house", c.x, c.z + 6, null); run(300, () => w.isDone(house)); assert.ok(w.isDone(house), "첫 집");
  assert.equal(w.summon().job, "carpenter"); const t0 = t;
  const mill = placeNear(w, "windmill", c.x + 8, c.z - 6, null); assert.ok(mill); run(600, () => w.isDone(mill));
  assert.ok(w.isDone(mill), `풍차 다 지음(${Math.round(t - t0)}초)`); assert.ok(t - t0 < 600, "목수가 오고 마을 하루 안");
});

test("첫날 부탁: 갈매미가 없는 새 섬에는 「새 갈매미 부르기」가 안 나옴(처음 안내에서 부르면 저절로 끝나 버림)", () => {
  const w = fresh(); assert.equal(w.units.length, 0);
  for (let d = 1; d <= 28; d++) assert.ok(!D.rollDaily(`2026-12-${d}`, w).reqs.some(r => r.id === "summon"));
});

test("첫날 부탁 채우기: 갈매미 없이 골라 모자란 부탁은 첫 갈매미가 오면 같은 날짜 열쇠로 덧붙임(나아간 것은 그대로, 도장 뒤에는 안 늘림)", () => {
  const w = fresh(); w.isNight = false; w.hour = 10; w.setDay("2026-11-28"); const n0 = w.daily.reqs.length; assert.ok(n0 < D.DAILY_COUNT, `갈매미 없는 첫날은 ${n0}개`);
  const r0 = w.daily.reqs[0]; r0.have = 1;
  assert.equal(w.setDay("2026-11-28"), false); assert.equal(w.daily.reqs.length, n0, "갈매미 수가 그대로면 그대로");
  w.summon(); w.setDay("2026-11-28");
  assert.ok(w.daily.reqs.length > n0, "첫 갈매미가 오면 덧붙임"); assert.equal(w.daily.reqs[0], r0); assert.equal(r0.have, 1);
  assert.ok(!w.daily.reqs.some(r => r.id === "summon" && r.have > 0), "막 온 갈매미로 저절로 끝나지 않음");
  assert.equal(new Set(w.daily.reqs.map(r => r.id)).size, w.daily.reqs.length, "같은 부탁 두 번 없음");
  const again = fresh(); again.isNight = false; again.hour = 10; again.setDay("2026-11-28"); again.summon(); again.setDay("2026-11-28");
  assert.deepEqual(again.daily.reqs.map(r => r.id), w.daily.reqs.map(r => r.id), "같은 날·같은 섬이면 같은 부탁(난수는 날짜 열쇠로만)");
  const s = fresh(); s.isNight = false; s.hour = 10; s.setDay("2026-11-28"); s.daily.stamped = true; const k = s.daily.reqs.length; s.summon(); s.setDay("2026-11-28"); assert.equal(s.daily.reqs.length, k, "도장 뒤에는 안 늘림");
});

test("배고파요 칩: 시장·저장고가 없을 때만, 글은 손쓸 일 하나", () => {
  const w = fresh(); w.summon(); const u = w.units[0]; u.full = 5;
  assert.equal(hungerCall(w, 30), u); assert.equal(HUNGER_CHIP, "😣 시장을 지으면 배불러요");
  const m = placeNear(w, "market", w.center.x, w.center.z, 0); assert.ok(m); assert.equal(hungerCall(w, 30), u, "짓는 중인 시장은 아직");
  m.hits = m.need; assert.equal(hungerCall(w, 30), null, "다 지은 시장이 있으면 갈매미가 알아서 먹으러 감");
  u.full = 90; w.removeBuilding(m.id); assert.equal(hungerCall(w, 30), null, "배부르면 없음");
});

test("공사장 배지: 맡은 이가 없고 문 앞 길이 막혔으면 기다림 대신 🚧 길이 막혔어요", () => {
  const w = fresh(); w.summon(); const u = w.units[0], b = placeNear(w, "house", u.x, u.z, 0);
  assert.equal(siteStepOf(b, w).text, "⏳ 일꾼을 기다려요");
  u.noWay = { [b.id]: w.time + 30 }; assert.deepEqual(siteStepOf(b, w), { step: "blocked", text: "🚧 길이 막혔어요" });
  w.time += 31; assert.equal(siteStepOf(b, w).step, "wait", "막힘 표시가 지나면 다시 기다림");
});

test("길 부탁 알림: 마을 하루에 한 줄, 여러 마리가 바라면 한 줄로 묶음", () => {
  const pass = makeGate(), a = { u: { unitId: 1, name: "목수" }, label: "시장" }, b = { u: { unitId: 2, name: "불씨" }, label: "시장" };
  assert.equal(pass("roadAsk", a, 10), true); assert.equal(pass("roadAsk", b, 40), false, "다른 갈매미도 같은 날은 안 띄움");
  assert.equal(askNoticeMany(3, "시장"), "갈매미 3마리가 집에서 시장까지 길을 바라요");
  const many = { units: [{}, {}], buildings: new Map(), isDone: () => true, marketB: () => null, bankB: () => null };
  assert.equal(alertLine("roadAsk", a, many), "🛣 목수: 집에서 시장까지 길을 깔아 주세요", "바라는 갈매미를 셀 수 없으면 이름 한 줄");
});

test("도장: 세 부탁을 다 들어주면 금고에 🪙20, 찍은 돈 장부에(돈의 합은 찍은 돈만큼만)", () => {
  const w = fresh(); w.summon(); const v0 = w.bank.vault, p0 = w.bank.printed; let ev = null; w.on("dailyDone", e => { if (e.all) ev = e; });
  w.daily = { key: "2026-12-01", reqs: [{ id: "pet", icon: "♥", text: "갈매미 3번 쓰다듬기", need: 1, have: 0 }], stamped: false };
  w.noteDaily("pet");
  assert.ok(ev, "도장 이벤트"); assert.equal(ev.coins, D.STAMP_COINS); assert.equal(w.bank.vault - v0, D.STAMP_COINS); assert.equal(w.bank.printed - p0, D.STAMP_COINS);
  assert.match(rewardOf("dailyDone", ev, w).line, /금고에 🪙20/);
  w.noteDaily("pet"); assert.equal(w.bank.vault - v0, D.STAMP_COINS, "하루 한 번");
});

test("소원 구제: 금고가 바닥일 때 소원이 이루어지면 금고에도 🪙20, 넉넉하면 없음", () => {
  const w = fresh(); w.summon(); const u = w.units[0]; let got = null; w.on("wishDone", e => { got = e; });
  const bench = placeNear(w, "bench", u.x, u.z); assert.ok(bench); w.wishT = 1e9;
  w.bank.vault = 5; w.wishes.push({ id: "bench", unitId: u.unitId, base: 0, age: 0 }); w.wishClock = 1; w.stepWishes(0.01);
  assert.ok(got, "소원이 이루어짐"); assert.equal(got.rescue, WISH_RESCUE); assert.ok(w.bank.vault >= 5 + WISH_RESCUE - 1, `금고 ${w.bank.vault}`);
  assert.match(rewardOf("wishDone", got, w).line, /금고에 🪙20/);
  got = null; w.bank.vault = 500; w.wishes.push({ id: "bench", unitId: u.unitId, base: 0, age: 0 }); w.wishClock = 1; w.stepWishes(0.01);
  assert.ok(got); assert.equal(got.rescue, 0, "금고가 넉넉하면 구제 없음"); assert.doesNotMatch(rewardOf("wishDone", got, w).line, /금고/);
  assert.ok(BK.VAULT_LOW > 5 && BK.VAULT_LOW < 500);
});
