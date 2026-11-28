// 검토 2묶음: 첫날 소음 줄이기(⚡✕는 풍차가 열린 뒤 · 첫날 부탁에 소환 없음 · 배고파요 칩은 손쓸 수 있을 때만 · 길 부탁은 하루 한 줄 · 공사장 길 막힘 배지)
// + 금고가 말라도 멈추지 않게(도장 동전 · 소원 구제 축하금 · 값싼 장식은 설계비 없이). node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { BUILDINGS } from "../src/data/catalog.js";
import { powerOpen } from "../src/world/power.js";
import * as D from "../src/world/daily.js";
import { hungerCall, HUNGER_CHIP } from "../src/ui/hudParts.js";
import { siteStepOf } from "../src/ui/bldView.js";
import { makeGate, alertLine } from "../src/ui/newsAlerts.js";
import { askNoticeMany } from "../src/world/roadAsk.js";
import { rewardOf } from "../src/ui/rewardFx.js";
import { WISH_RESCUE } from "../src/world/wishes.js";
import * as BK from "../src/world/bank.js";

const fresh = () => World.create(7, seededRandom(3), { wild: true });
const placeNear = (w, defId, x0, z0, hits = 1e9) => { for (let r = 3; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); const q = w.placeBuilding(defId, x, z, 0, null, hits); if (q.ok) return q.building; } return null; };

test("⚡✕: 풍차를 아직 못 짓는 등급이면 알리지 않음, 등급이 오르거나 풍차가 있으면 알림", () => {
  const w = fresh(); w.rank = 0; assert.equal(powerOpen(w), false, "🏘 어촌 전: 고칠 길이 없음");
  w.rank = BUILDINGS.windmill.rank; assert.equal(powerOpen(w), true);
  const w2 = fresh(); w2.rank = 0; w2.summon(); placeNear(w2, "windmill", w2.center.x, w2.center.z); assert.equal(powerOpen(w2), true, "불러온 섬에 풍차가 있으면");
});

test("첫날 부탁: 갈매미가 없는 새 섬에는 「새 갈매미 부르기」가 안 나옴(처음 안내에서 부르면 저절로 끝나 버림)", () => {
  const w = fresh(); assert.equal(w.units.length, 0);
  for (let d = 1; d <= 28; d++) assert.ok(!D.rollDaily(`2026-12-${d}`, w).reqs.some(r => r.id === "summon"));
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
