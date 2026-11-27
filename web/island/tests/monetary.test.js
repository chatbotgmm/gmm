// 중앙은행 1단계 규칙(monetary.js + World 연결): 물가 식 · 한도·수수료 · 이자 상한 · 장보기 · 상인 헛걸음 0 · 자동 와인드업 방지 · 저장 호환 · 옛 저장 4일 적응
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { UNITS } from "../src/data/catalog.js";
import { newsDay, NEWS_DAY_SECS } from "../src/world/news.js";
import * as MON from "../src/world/monetary.js";
import * as E from "../src/world/economy.js";
import { satisfaction } from "../src/world/roads.js";
import { rankScore } from "../src/world/rank.js";
import { dayFlow, todayOf, IN_NAMES } from "../src/ui/bankView.js";

const nextDay = w => { w.time = newsDay(w.time) * NEWS_DAY_SECS + 1; w.stepBank(); };
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≈ ${b}`);
/** 넓은 섬 + 목수·미니(농부)·황금(상인) + 다 지은 시장(중앙은행 켬, 새 섬 기본) */
function town() {
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }); w.instantBuild = true;
  for (const n of ["목수", "미니", "황금"]) w.addUnitByName(n);
  w.bank.vault = 1e6; const c = w.center;
  let ok = false; for (let r = 3; r < 30 && !ok; r++) for (let k = 0; k < 48 && !ok; k++) { const a = k / 48 * 6.28, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + 6 + Math.sin(a) * r); if (w.check("market", x, z, 0).ok) ok = w.placeBuilding("market", x, z, 0).ok; }
  assert.ok(ok, "시장"); w.instantBuild = false; w.bank.vault = 300;
  return { w, mon: w.bank.mon, m: w.units.find(u => u.name === "황금"), mini: w.units.find(u => u.name === "미니") };
}

test("물가 식(설계 §4-5 계산 예 두 개): P* = 주머니 돈 ÷ (4 × √(Ȳ × 70 × 마릿수)), π = 0.35 ln(P*/P)를 −2%~+3%로", () => {
  const ye = MON.yEff(550, 9); near(ye, 588.6, 0.1, "Yeff = √(550 × 630)");
  const ps = MON.targetP(2842, ye); near(ps, 1.207, 0.001, "P* = 2,842 ÷ 2,354");
  near(MON.piOf(ps, 1.207), 0, 0.0005, "전날 P 1.207이면 π ≈ 0");
  const ye2 = MON.yEff(849, 9), ps2 = MON.targetP(2154, ye2); near(ps2, 0.736, 0.001, "10일째 예 P*");
  near(0.35 * Math.log(ps2 / 0.904), -0.0719, 0.0005, "날 값 −7.19%"); assert.equal(MON.piOf(ps2, 0.904), -0.02, "하한 −2%");
  assert.equal(MON.piOf(100, 1), 0.03, "상한 +3%");
  assert.equal(MON.nextP(0.71, -0.02), MON.P_MIN, "바닥"); assert.equal(MON.nextP(2.95, 0.03), MON.P_MAX, "천장 3");
  assert.equal(MON.P_MIN, 0.7, "바닥은 0.7(디플레가 금고 공짜 이득이 되지 않게)");
  assert.deepEqual(MON.STEPS, [0, 15, 30, 45, 60, 90], "발행 단계(맨 위 90)");
  assert.equal(MON.saveShare(0), 0.1); assert.equal(MON.saveShare(0.01), 0.2); assert.equal(MON.saveShare(0.05), 0.6);
  assert.equal(MON.downShare(0.01), 0.44); assert.equal(MON.downShare(0.05), 0.6);
});

test("발행 한도·수수료: 오늘 한도(단계 × 마릿수) 안에서만 사고, 찍은 돈의 10%는 금고로(새 돈). 남은 가공품은 상인 가방에 남아 다음 날 팖", () => {
  const { w, mon, m } = town(), n = w.units.length;
  assert.equal(w.monOn(), true, "새 섬은 중앙은행 켬"); assert.equal(mon.auto, true, "자동으로 시작"); assert.equal(mon.step, 60); assert.equal(mon.rate, 1);
  assert.equal(w.monLeft(), 60 * n, "한도 = 60 × 마릿수"); assert.equal(w.procPrice("wood"), E.BANK_PROCESSED.wood, "P = 1이면 값 그대로");
  m.goods.wood = 100; const v0 = w.bank.vault, iss0 = w.bank.issued, c0 = m.coins;
  const r = w.sellProcessed(m), can = Math.floor(60 * n / 4);
  assert.equal(r.items.wood, can, "한도만큼만 삼"); assert.equal(r.coins, can * 4); assert.equal(m.goods.wood, 100 - can, "나머지는 가방에");
  assert.equal(m.coins - c0, can * 4, "상인에게 새 돈"); assert.equal(w.bank.vault - v0, Math.floor(can * 4 * MON.SEIG), "수수료 10% → 금고");
  assert.equal(w.bank.issued - iss0, can * 4 + Math.floor(can * 4 * 0.1), "둘 다 새 돈"); assert.equal(w.bank.seig, Math.floor(can * 4 * 0.1));
  assert.equal(w.bankCanBuy(m), false, "오늘 한도로는 더 못 삼 → 은행에 안 감");
  assert.ok(w.newsLog.length >= 0 && mon.flags.cap === 1, "한도 참 알림(하루 한 번)");
  const again = w.sellProcessed(m); assert.equal(again.coins, 0);
  nextDay(w); assert.equal(w.bankCanBuy(m), true, "다음 날 한도가 다시 참");
  assert.ok(w.sellProcessed(m).coins > 0);
  // 단계 바꾸기: 다음 날부터 · 자동이 꺼짐
  assert.equal(w.setIssue(15), true); assert.equal(mon.auto, false, "칩을 누르면 자동 꺼짐"); assert.equal(w.setIssue(130), false, "없는 단계");
  nextDay(w); assert.equal(mon.cap, 15 * n);
  assert.equal(w.setIssue(0), true); nextDay(w); m.goods.wood = 5; assert.equal(w.bankCanBuy(m), false, "멈춤이면 은행에 안 감");
});

test("예금 이자: 은행이 새로 찍음(금고는 안 냄) · 한 마리 ICAP × P까지만 · 금리 0~5", () => {
  assert.equal(MON.ICAP, 60, "이자 상한 60(금리 높게 고정 시 긴 오름 줄임)");
  assert.equal(MON.interestOf(1000, 0.05, 1), 3, "상한 60 × 5%"); assert.equal(MON.interestOf(1000, 0.05, 2), 6, "상한도 × P");
  assert.equal(MON.interestOf(50, 0.05, 1), 2); assert.equal(MON.interestOf(1000, 0, 1), 0);
  const { w, mon, mini } = town();
  assert.equal(w.setRate(6), false); assert.equal(w.setRate(-1), false); assert.equal(w.setRate(5), true); assert.equal(mon.rate, 5);
  mini.saved = 500; mini.coins = 0; const v0 = w.bank.vault, iss0 = w.bank.issued;
  for (const u of w.units) if (u !== mini) { u.coins = 0; u.saved = 0; }
  nextDay(w);
  assert.equal(w.bank.interest, 3, "이자 = min(500, 60) × 5%"); assert.equal(w.bank.vault, v0, "금고는 그대로");
  assert.equal(w.bank.issued - iss0, 3 - w.bank.retired, "이자는 새 돈(꺼낸 예금으로 장 본 몫은 거둬짐)"); assert.equal(mini.intDay, newsDay(w.time), "🐷 오늘 이자 받음");
  assert.ok(satisfaction(w, mini).parts.some(p => p[0].includes("저금") && p[1] === MON.SAT_INTEREST));
});

test("저녁 장보기: 여윳돈의 25% → 60%는 상인에게, 40%는 은행 가게(창고 가공품 30개 넘게 있으면 그것부터)에서 써서 없어짐 · 금고 몫 0 · 돈 검산", () => {
  const { w, mon, m, mini } = town();
  for (const u of w.units) { u.coins = 0; u.saved = 0; u.loan = null; }
  mini.coins = 220; m.coins = 0; w.res.wood = 40; w.res.stone = 0; w.setRate(0);
  const v0 = w.bank.vault, iss0 = w.bank.issued;
  nextDay(w);
  // 세금 = (220 − 20) × 5% = 10 → 210 · 예금(금리 0, 10%) 목표 floor((210 − 20) × 0.1) = 19 → 절반 round(9.5) = 10 → 주머니 200
  assert.equal(w.bank.vault - v0, 8, "세금 상한 8만 금고로(장보기 금고 몫 0)");
  assert.equal(mini.saved, 10);
  const s = MON.shopOf(220 - 8 - 10, 1, false, true);   // 여윳돈 (202 − 20) × 0.25 = 45 → 상인 27 · 은행 가게 18
  assert.deepEqual(s, { x: 45, toM: 27, rest: 18 });
  assert.equal(m.coins, 27, "상인 몫"); assert.equal(mini.coins, 202 - 45);
  assert.equal(w.res.wood, 36, "창고 나무 40 → 30개 넘는 것 중 목재 4개(18 ÷ 4 = 4)를 씀");
  assert.equal(w.bank.retired, 18, "거둔 돈 18(목재 16 + 생활용품 2)"); assert.equal(w.bank.issued - iss0, -18, "거둔 돈은 issued에서 빠짐");
  assert.equal(mini.shopDay, newsDay(w.time)); assert.ok(satisfaction(w, mini).parts.some(p => p[0].includes("장 봤다") && p[1] === MON.SAT_SHOP));
  // 검산: 마을 돈(주머니 + 예금) 변화 = 이자 − 거둠 − 세금 − 상환
  const before = w.units.reduce((a, u) => a + u.coins + (u.saved || 0), 0), tax0 = w.bank.taxed, ret0 = w.bank.retired, int0 = w.bank.interest, rep0 = w.bank.repaid;
  w.setRate(3); nextDay(w);
  const after = w.units.reduce((a, u) => a + u.coins + (u.saved || 0), 0);
  assert.equal(after - before, (w.bank.interest - int0) - (w.bank.retired - ret0) - (w.bank.taxed - tax0) - (w.bank.repaid - rep0));
  assert.ok(mon.days >= 2);
});

test("물가가 곱해지는 곳: 가공품 값·원자재 기본값·품삯·설계비·집값·음식 / 안 곱하는 곳: 세금 상한·한도", () => {
  const { w, mon, m } = town();
  mon.P = 1.5;
  assert.equal(w.procPrice("wood"), 6); assert.equal(w.procPrice("iron"), 15); assert.equal(w.rawBase("stone"), 5); assert.equal(w.wage(), 3);
  assert.equal(w.priceMult(), 1.5, "설계비·집값 배수 = 마을 성장 × 물가"); assert.equal(w.priceInfo().mult, 1, "화면의 마을 성장은 따로");
  assert.equal(w.feeFor("house"), 15); assert.equal(w.housePrice("house"), 45);
  w.updatePrices(); assert.ok(w.prices.food >= 3, "음식 값 × P"); assert.ok(w.prices.wood <= w.procPrice("wood") - 1, "시세는 가공품 값보다 1 아래까지");
  assert.equal(mon.cap === 0 || mon.cap === 60 * w.units.length, true);
  nextDay(w); assert.equal(mon.cap, mon.step * w.units.length, "한도는 조개 개수(물가 안 곱함)");
  void m;
});

test("집 거래: 예금도 집값에 쓰고(살 때 다 꺼냄), 계약금 비율은 금리를 따라감(1% → 44%)", () => {
  const { w, mini } = town(); const s = (() => { const c = w.center; for (let r = 3; r < 30; r++) for (let k = 0; k < 48; k++) { const a = k / 48 * 6.28, x = Math.floor(c.x - 6 + Math.cos(a) * r), z = Math.floor(c.z - 6 + Math.sin(a) * r); if (w.check("house", x, z, 0).ok) return [x, z]; } })();
  const b = w.placeBuilding("house", s[0], s[1], 0, null, 1e9).building;
  mini.coins = 10; mini.saved = 5; let d = w.houseDeal(mini, b);
  assert.equal(d.down, 14, "30 × 44% → 14"); assert.equal(d.ok, true, "주머니 10 + 예금 5 ≥ 14");
  assert.equal(w.buyHouse(mini, b), true); assert.equal(mini.saved, 0, "예금을 꺼내 씀"); assert.equal(mini.coins, 1); assert.equal(mini.loan.left, 16);
  nextDay(w); assert.ok(mini.loan.left >= 16, "대출 이자(금리 + 1%p)가 붙음");
  void d;
});

test("자동 모드: 물가가 오르면 한 칸 내리고, 내리면 올림 — 단 어제 매입이 한도의 80% 이상일 때만 올림(와인드업 방지)", () => {
  const i60 = MON.STEPS.indexOf(60);
  assert.equal(MON.autoStep(i60, 0.02, 1.0), i60 - 1, "오르면 내림"); assert.equal(MON.autoStep(i60, 0, 1.1), i60 - 1, "P > 1.05면 내림");
  assert.equal(MON.autoStep(i60, -0.02, 0.95, 0, 0.9), i60 + 1, "많이 쓰였는데 값이 내리면 올림");
  assert.equal(MON.autoStep(i60, -0.02, 0.95, 0, 0), i60, "한도를 다 못 썼으면(물건이 모자람) 그대로");
  assert.equal(MON.autoStep(i60, -0.02, 0.95, 0, 0.79), i60, "79%도 그대로");
  assert.equal(MON.autoStep(i60, 0, 1, 0.3, 0.8), i60 + 1, "일감 없음이 많으면 올림(80% 쓰였을 때)");
  assert.equal(MON.autoStep(MON.STEPS.length - 1, -0.02, 0.9, 0, 1), MON.STEPS.length - 1, "맨 위(90)에서 멈춤");
  assert.equal(MON.autoStep(1, 0.03, 2), 1, "맨 아래는 '아주 적게'(멈춤까지는 안 감)");
  // 월드: 한도를 하나도 안 쓴 날에 값이 내려도 단계를 올리지 않음
  const { w, mon } = town(); mon.adapt = 0; mon.P = 0.9; mon.step = 60; mon.cap = 540; mon.used = 0;
  for (const u of w.units) { u.coins = 0; u.saved = 0; } nextDay(w);
  assert.ok(mon.pi < 0, "값이 내림"); assert.equal(mon.step, 60, "쓰지 않은 한도를 올려 두지 않음");
  mon.used = mon.cap; nextDay(w); assert.equal(mon.step, 90, "다 쓴 날엔 올림");
});

test("상인 헛걸음 0: 한도가 차면 은행에 가지 않음(조이기 15로 2일, 0원 방문 0번) · 조건을 빼면 헛걸음이 생김", () => {
  const run = (guard) => {
    const w = World.create(7, seededRandom(5), { wild: true, firstGull: true }); for (const d of UNITS) w.addUnitByName(d.name);
    w.setIssue(15); if (!guard) w.bankCanBuy = u => E.total(u?.goods) > 0;
    let zero = 0, visits = 0; const sp = w.sellProcessed.bind(w); w.sellProcessed = m => { const r = sp(m); visits++; if (!r.coins) zero++; return r; };
    w.instantBuild = true; const c = w.center; w.bank.vault = 1e6;
    for (let r = 3, ok = false; r < 30 && !ok; r++) for (let k = 0; k < 48 && !ok; k++) { const a = k / 48 * 6.28, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + 6 + Math.sin(a) * r); if (w.check("market", x, z, 0).ok) ok = w.placeBuilding("market", x, z, 0).ok; }
    w.instantBuild = false; w.bank.vault = 300;
    for (let t = 0; t < 2 * NEWS_DAY_SECS; t += 0.1) w.update(0.1);
    return { zero, visits, bought: w.bank.seig };
  };
  const g = run(true); assert.equal(g.zero, 0, `0원 방문 ${g.zero}/${g.visits}`); assert.ok(g.visits > 0 && g.bought > 0, "은행에는 가서 팖");
  const ng = run(false); assert.ok(ng.zero > g.zero, `조건 없으면 헛걸음 ${ng.zero}번`);
});

test("저장/불러오기: 물가·단계·금리·자동·최근 생산·적응·예금·장부 칸이 그대로", () => {
  const { w, mon, mini } = town();
  w.setIssue(45); w.setRate(3); mon.P = 1.234; mon.Yd = [100, 200, 300]; mon.adapt = 0; mon.days = 9; mini.saved = 77; w.led("seig", 4);
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize()))), bm = back.bank.mon;
  assert.equal(bm.P, 1.234); assert.equal(bm.step, 45); assert.equal(bm.rate, 3); assert.equal(bm.auto, false); assert.deepEqual(bm.Yd, [100, 200, 300]);
  assert.equal(bm.adapt, 0); assert.equal(bm.days, 9); assert.equal(back.units.find(u => u.name === "미니").saved, 77);
  assert.equal(back.bank.ledger.at(-1).seig, 4); assert.equal(back.bank.seig, w.bank.seig);
  const bad = MON.monFromSave({ P: "x", step: 7, rate: 99, Yd: "no", adapt: 40 });
  assert.equal(bad.P, 1); assert.equal(bad.step, 60); assert.equal(bad.rate, 5); assert.deepEqual(bad.Yd, []); assert.equal(bad.adapt, MON.ADAPT_DAYS);
  const off = JSON.parse(JSON.stringify(w.serialize())); off.bank.mon = null; assert.equal(World.fromJSON(off).monOn(), false, "null = 중앙은행을 끈 지금 규칙");
});

test("옛 저장(중앙은행 없음): 돈은 그대로 + 4일 적응(물가 안 움직임) + 자동 켬 + 소식 한 번", () => {
  const { w } = town(); for (const u of w.units) u.coins = 400;
  const j = JSON.parse(JSON.stringify(w.serialize())); delete j.bank.mon; for (const u of j.units) delete u.saved;
  const o = World.fromJSON(j), m = o.bank.mon;
  assert.deepEqual(o.units.map(u => u.coins), w.units.map(u => u.coins), "돈은 옮기지 않음"); assert.ok(o.units.every(u => !u.saved));
  assert.equal(m.adapt, 4); assert.equal(m.auto, true); assert.equal(m.P, 1); assert.equal(m.step, 60); assert.equal(m.rate, 1);
  const pis = []; for (let d = 0; d < 6; d++) { nextDay(o); pis.push(m.pi); }
  assert.deepEqual(pis.slice(0, 4), [0, 0, 0, 0], "4일은 π = 0"); assert.ok(pis[4] !== 0, "5일째부터 움직임");
  assert.equal(o.newsLog.filter(e => /중앙은행 판이 생겼어요/.test(e.text)).length, 1);
  assert.equal(World.create(7, seededRandom(3)).monOn(), false, "경제 없는 예전 섬은 규칙 꺼짐");
});

test("🎁 축하 나눠주기는 하루 한 번 round(10 × P) · 물가 안정 3일이면 마을 점수 +10 · 값이 2% 넘게 오르면 만족 −5", () => {
  const { w, mon } = town(); mon.P = 1.26; const n = w.units.length, iss0 = w.bank.issued;
  assert.equal(w.giftAll(), 13 * n); assert.equal(w.giftAll(), 0, "같은 날 두 번 안 됨"); assert.equal(w.bank.issued - iss0, 13 * n);
  nextDay(w); assert.ok(w.giftAll() > 0, "다음 날 다시");
  const base = rankScore(w).parts.find(p => p[0].includes("물가 안정")); assert.ok(base, "점수 줄이 있음");
  mon.stableRun = 3; assert.equal(rankScore(w).parts.find(p => p[0].includes("물가 안정"))[3], MON.STABLE_SCORE);
  mon.pi = 0.025; assert.ok(satisfaction(w, w.units[0]).parts.some(p => p[0].includes("값이 자꾸") && p[1] === MON.SAT_PRICEUP));
  mon.pi = 0.01; assert.ok(!satisfaction(w, w.units[0]).parts.some(p => p[0].includes("값이 자꾸")));
});

test("은행 앱 장부: 발행 수수료도 '들어온 돈' 줄로(오늘 +/− = 금고 변화가 맞게)", () => {
  const { w, m } = town(); w.time = newsDay(w.time) * NEWS_DAY_SECS + 1; w.stepBank(); w.bank.ledger = [];
  const v0 = w.bank.vault; m.goods.stone = 20; const r = w.sellProcessed(m);
  const f = dayFlow(todayOf(w)), sg = Math.floor(r.coins * MON.SEIG);
  assert.ok(sg > 0); assert.ok(f.inRows.some(([k, v]) => k === IN_NAMES.seig && v === sg), JSON.stringify(f.inRows));
  assert.equal(f.inSum - f.outSum, w.bank.vault - v0);
});
