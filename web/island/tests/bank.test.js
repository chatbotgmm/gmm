// 은행 금고 개편 시험(three.js 없이): 금고 = 플레이어 돈 · 설계비 · 품삯(금고에서, 밀림) · 집 대출·상환 · 세금 · 바닥 사태 말풍선·소식지 · 저장·예전 저장
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { newsDay, NEWS_DAY_SECS } from "../src/world/news.js";
import { orderDeco, orderCost, canOrder, planImprovement } from "../src/world/improve.js";
import * as BK from "../src/world/bank.js";
import * as E from "../src/world/economy.js";
import { UNITS } from "../src/data/catalog.js";

const spotFor = (w, d) => {
  const c = w.center, v = w.bank.vault; w.bank.vault = 1e9;                    // 자리만 찾음(설계비 검사는 빼고)
  try { for (let r = 4; r < 60; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + 6 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; }
  finally { w.bank.vault = v; }
};
const place = (w, d) => { const s = spotFor(w, d); return w.placeBuilding(d, s[0], s[1], 0); };
/** 넓은 섬 + 목수·미니(농부)·황금(상인) + 다 지은 시장. 금고는 vault로 맞춤. 중앙은행(monetary.js)은 끈 '지금 규칙'(bank.mon = null) — 중앙은행 규칙은 tests/monetary.test.js */
function town(vault = BK.VAULT_START) {
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }); w.instantBuild = true; w.bank.mon = null;
  for (const n of ["목수", "미니", "황금"]) w.addUnitByName(n);
  w.bank.vault = 1e6; assert.ok(place(w, "market").ok); w.instantBuild = false;
  Object.assign(w.bank, { vault, fees: 0, ledger: [] });
  return { w, boss: w.units[0], mini: w.units.find(u => u.name === "미니"), carp: w.units.find(u => u.name === "목수") };
}
/** 다 지은 빈 집(시험 받침: hits를 넘겨 설계비 없음) */
const readyHouse = (w, d = "house") => { const s = spotFor(w, d); return w.placeBuilding(d, s[0], s[1], 0, null, 1e9).building; };
const bankNews = w => w.newsLog.filter(e => /금고가 바닥/.test(e.text)).length;
const nextDay = w => { w.time = newsDay(w.time) * NEWS_DAY_SECS + 1; w.stepBank(); };

test("금고: 새 넓은 섬은 🪙60, 은행 없는 섬은 설계비·금고가 꺼져 있음", () => {
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true });
  assert.equal(w.bank.vault, BK.VAULT_START); assert.equal(w.bank.day, 1); assert.equal(w.vaultState(), "ok");
  const old = World.create(7, seededRandom(3)); assert.equal(old.economy, false);
  assert.equal(old.feeFor("house"), 0);
  const s = spotFor(old, "house"), v = old.bank.vault, r = old.placeBuilding("house", s[0], s[1], 0);
  assert.ok(r.ok); assert.equal(r.building.fee, 0); assert.equal(old.bank.vault, v, "예전 섬은 금고를 건드리지 않음");
  old.time = 2 * NEWS_DAY_SECS; old.stepBank(); assert.equal(old.bank.taxed, 0, "세금 없음"); assert.equal(old.bank.day, 3);
});

test("설계비: 놓을 때 금고에서, 모자라면 놓기 실패(사유 글), 불러오기·갈매미 주문 장식은 없음, 갈매미 돈은 안 씀", () => {
  const { w, boss, mini } = town(100);
  const coins0 = w.units.map(u => u.coins);
  const r = place(w, "house");
  assert.ok(r.ok); assert.equal(r.building.fee, 10); assert.equal(w.bank.vault, 90); assert.equal(w.bank.fees, 10);
  assert.equal(w.bank.ledger.at(-1).fees, 10, "오늘 장부");
  assert.deepEqual(w.units.map(u => u.coins), coins0, "갈매미 돈은 건설에 쓰지 않음");
  // 금고 9: 갈매미가 부자여도 못 놓음
  for (const u of w.units) u.coins = 1000;
  w.bank.vault = 9; const s = spotFor(w, "house"), c = w.check("house", s[0], s[1], 0);
  assert.equal(c.ok, false); assert.equal(c.fee, 10); assert.match(c.reason, /금고/); assert.match(c.reason, /🪙10/); assert.match(c.reason, /금고 🪙9/);
  const p = w.placeBuilding("house", s[0], s[1], 0);
  assert.equal(p.ok, false); assert.equal(p.reason, c.reason); assert.equal(w.bank.vault, 9);
  assert.ok(w.units.every(u => u.coins === 1000), "갈매미 돈 그대로");
  // 다른 거절 사유가 먼저(설계비는 맨 마지막)
  assert.doesNotMatch(w.check("post", s[0], s[1], 0).reason, /금고/);
  // 다리는 칸마다 1, 눈사람 0, 표에 없는 건물 5
  assert.equal(w.feeFor("bridge"), 1); assert.equal(w.feeFor("snowman"), 0); assert.equal(w.feeFor("??"), BK.FEE_UNKNOWN);
  // 불러오기·시험 받침(hits)은 설계비 없음
  w.bank.vault = 50; const h = readyHouse(w); assert.equal(h.fee, 0); assert.equal(w.bank.vault, 50);
  // 갈매미가 스스로 주문한 장식도 없음
  w.bank.vault = 0; void boss; void mini;
  const deco = orderDeco(w, h, seededRandom(1)); assert.ok(deco, "금고가 비어도 갈매미 주문 장식은 놓임"); assert.equal(deco.fee, 0); assert.equal(w.bank.vault, 0);
});

test("설계비 환불: 다 짓기 전에 철거하면 돌려주고, 다 지은 뒤엔 그대로", () => {
  const { w } = town(100);
  const a = place(w, "cottage").building; assert.equal(w.bank.vault, 85);
  w.removeBuilding(a.id); assert.equal(w.bank.vault, 100); assert.equal(w.bank.fees, 0);
  w.instantBuild = true; const b = place(w, "cottage").building; assert.ok(w.isDone(b)); assert.equal(w.bank.vault, 85);
  w.removeBuilding(b.id); assert.equal(w.bank.vault, 85, "다 지은 건물은 환불 없음"); assert.equal(w.bank.fees, 15);
});

test("품삯: 금고에서(발행 아님), 바닥나면 밀리고(말풍선·소식지 한 번), 돈이 들어오면 나눠 갚고 사태가 끝남", () => {
  const { w, boss, carp } = town(10);
  const issued = w.bank.issued; boss.coins = 0;
  w.payWage(boss); assert.equal(w.bank.vault, 8); assert.equal(boss.coins, 2); assert.equal(w.bank.issued, issued, "새로 찍지 않음"); assert.equal(w.bank.wages, 2);
  w.bank.vault = 0; carp.coins = 0;
  w.payWage(boss);
  assert.equal(boss.wageOwed, 2); assert.equal(w.bank.owed, 2); assert.equal(boss.coins, 2, "밀린 품삯은 아직 못 받음");
  assert.match(boss.emoteText, /밀렸/); assert.equal(w.bank.short, 1); assert.equal(bankNews(w), 1); assert.equal(w.vaultState(), "empty");
  w.payWage(boss); w.payWage(carp);
  assert.equal(boss.wageOwed, 4); assert.equal(carp.wageOwed, 2); assert.equal(w.bank.owed, 6); assert.equal(bankNews(w), 1, "사태마다 한 번");
  w.updateRoads(); assert.ok(boss.satParts.some(p => /밀린 품삯/.test(p[0]) && p[1] === -10));
  // 5가 들어옴 → 기본 4 다 받고, 목수는 1만(나눠 갚기)
  w.deposit(5); assert.equal(boss.wageOwed, 0); assert.equal(boss.coins, 6); assert.equal(carp.wageOwed, 1); assert.equal(w.bank.owed, 1); assert.equal(w.bank.vault, 0);
  assert.match(boss.emoteText, /밀린 품삯 받았다/); assert.equal(w.bank.short, 1, "아직 다 못 갚음");
  w.deposit(40); assert.equal(carp.wageOwed, 0); assert.equal(w.bank.owed, 0); assert.equal(w.bank.vault, 39);
  assert.equal(w.bank.short, 0); assert.equal(w.newsLog.filter(e => /다시 찼어요/.test(e.text)).length, 1, "회복 기사");
  // 다음 날 또 바닥나면 새 기사(같은 날 같은 글은 소식지가 한 번만 받음)
  w.time = NEWS_DAY_SECS + 5; w.bank.day = newsDay(w.time); w.bank.vault = 0; w.payWage(carp); assert.equal(bankNews(w), 2);
});

test("얼마 안 남음: 30 아래로 내려가면 한 번 알리고, 60까지 차야 다시 알림", () => {
  const { w } = town(35); const seen = []; w.on("vaultLow", e => seen.push(e.vault));
  place(w, "field"); assert.deepEqual(seen, [], "30은 아직 아님");
  place(w, "dock"); assert.deepEqual(seen, [27]); assert.equal(w.vaultState(), "low");
  place(w, "dock"); assert.equal(seen.length, 1, "한 번만");
  w.deposit(40); place(w, "market"); assert.equal(seen.length, 1, "64 → 49");
  w.deposit(20); assert.equal(w.bank.low, 0, "69까지 참"); w.bank.vault = 31; place(w, "field"); assert.deepEqual(seen, [27, 26]);
});

test("집 대출: 계약금 40% + 금고 대출, 금고가 모자라면 거절(말풍선·만족도), 집값을 다 가지면 현금", () => {
  const { w, mini } = town(100);
  const h = readyHouse(w);
  mini.coins = 11; assert.deepEqual(w.houseDeal(mini, h), { ok: false, price: 30, down: 12, loan: 18, reason: "coins" });
  assert.equal(w.buyHouse(mini, h), false); assert.equal(mini.loanRefused, false, "계약금 미달은 대출 거절이 아님");
  mini.coins = 12; assert.equal(w.buyHouse(mini, h), true);
  assert.equal(mini.coins, 0); assert.equal(w.bank.vault, 112, "계약금만 금고로"); assert.equal(w.bank.returned, 12);
  assert.deepEqual(mini.loan, { left: 18, per: 4 }); assert.equal(w.bank.lent, 18); assert.equal(h.owner, mini.unitId);
  assert.deepEqual(w.loanInfo(mini), { left: 18, per: 4, days: 5 });
  // 금고 37 < 18 + 20 → 거절
  const { w: w2, mini: m2 } = town(37), h2 = readyHouse(w2);
  m2.coins = 29; assert.equal(w2.houseDeal(m2, h2).reason, "vault"); assert.equal(w2.buyHouse(m2, h2), false);
  assert.equal(m2.loanRefused, true); assert.match(m2.emoteText, /은행에 돈이 없대/);
  assert.equal(w2.bank.short, 0, "금고 37 ≥ 30: 대출 거절이지만 바닥 사태는 아님"); assert.equal(bankNews(w2), 0); assert.equal(w2.vaultState(), "ok");
  w2.updateRoads(); assert.ok(m2.satParts.some(p => /집 대출을 못 받음/.test(p[0]) && p[1] === -10));
  m2.emoteText = ""; assert.equal(w2.buyHouse(m2, h2), false); assert.equal(m2.emoteText, "", "한 사태에 한 번만 말풍선");
  // 금고 38이면 빌려줌
  w2.bank.vault = 38; assert.equal(w2.houseDeal(m2, h2).ok, true);
  // 집값을 다 가지면 금고가 0이어도 현금
  w2.bank.vault = 0; m2.coins = 30; assert.equal(w2.buyHouse(m2, h2), true); assert.equal(m2.loan, null); assert.equal(m2.loanRefused, false); assert.equal(w2.bank.vault, 30);
});

test("상환·세금: 마을 날이 바뀔 때 상환 먼저(10은 남김) → 세금(20 넘는 돈의 5%, 최대 8), 하루 한 번, 5일에 다 갚음", () => {
  const { w, mini, boss, carp } = town();
  const h = readyHouse(w); mini.coins = 12; assert.ok(w.buyHouse(mini, h));
  const merchant = w.units.find(u => u.name === "황금");
  mini.coins = 14; boss.coins = 200; carp.coins = 5; merchant.coins = 39;
  const v0 = w.bank.vault, taxes = []; w.on("tax", e => taxes.push(e));
  nextDay(w);
  assert.equal(mini.loan.left, 14); assert.equal(mini.coins, 10, "상환 4, 세금 0(남은 10 ≤ 20)");
  assert.equal(boss.coins, 192, "세금 min(8, floor(180 × 5%) = 9) = 8"); assert.equal(carp.coins, 5); assert.equal(merchant.coins, 39, "39 이하는 세금 0");
  assert.equal(w.bank.vault, v0 + 4 + 8); assert.equal(w.bank.taxed, 8); assert.equal(w.bank.repaid, 4);
  assert.deepEqual(taxes, [{ total: 8, n: 1 }]);
  w.stepBank(); assert.equal(w.bank.taxed, 8, "같은 날 두 번 걷지 않음");
  // 못 갚는 날: 벌 없이 남은 날만 늘어남
  mini.coins = 10; nextDay(w); assert.equal(mini.loan.left, 14); assert.equal(mini.coins, 10); assert.match(mini.emoteText, /내일 갚을게/);
  const paid = []; w.on("loanPaid", e => paid.push(e.u.name));
  for (let d = 0; d < 4; d++) { mini.coins = 14; nextDay(w); }
  assert.equal(mini.loan, null); assert.deepEqual(paid, ["미니"]); assert.equal(w.bank.repaid, 18);
  assert.ok(w.newsLog.some(e => /집값을 다 갚았어요/.test(e.text)));
  assert.equal(w.bank.vault, BK.VAULT_START + w.bank.taxed + w.bank.returned - w.bank.fees - w.bank.wages, "금고 = 시작 + 세금 + 돌아온 돈 − 설계비 − 품삯");
});

test("집이 철거되면 남은 빚은 없애 줌", () => {
  const { w, mini } = town(100);
  const h = readyHouse(w); mini.coins = 12; assert.ok(w.buyHouse(mini, h));
  w.removeBuilding(h.id); assert.equal(mini.home, null); assert.equal(mini.loan, null); assert.equal(w.bank.forgiven, 18);
});

test("저장/불러오기: 금고·누계·사태·대출·밀린 품삯·설계비가 그대로", () => {
  const { w, mini, boss } = town(100);
  const h = readyHouse(w); mini.coins = 12; assert.ok(w.buyHouse(mini, h));
  const site = place(w, "house").building;
  w.bank.vault = 0; w.payWage(boss); nextDay(w);
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())));
  assert.deepEqual(back.bank, w.bank);
  const bm = back.units.find(u => u.name === "미니"), bb = back.units.find(u => u.name === "기본");
  assert.deepEqual(bm.loan, mini.loan); assert.equal(bb.wageOwed, boss.wageOwed); assert.ok(bb.wageOwed > 0);
  assert.equal(back.buildings.get(site.id).fee, 10);
  back.removeBuilding(site.id); assert.equal(back.bank.vault, w.bank.vault + 10 - Math.min(10, w.bank.owed), "불러온 뒤에도 공사 취소 환불(밀린 품삯부터 갚음)");
});

test("예전 저장: 금고가 없으면 100 + 돌아온 돈, 세금 날은 불러온 날(바로 걷지 않음), 대출·밀린 품삯 없음", () => {
  const { w } = town(100); readyHouse(w);
  w.time = 10 * NEWS_DAY_SECS + 30;
  const j = JSON.parse(JSON.stringify(w.serialize()));
  j.bank = { issued: 9189, returned: 496 };
  for (const u of j.units) { delete u.loan; delete u.wageOwed; delete u.loanRefused; u.coins = 500; }
  for (const b of j.buildings) delete b.fee;
  const back = World.fromJSON(j);
  assert.equal(back.bank.vault, 596); assert.equal(back.bank.day, 11); assert.equal(back.bank.issued, 9189); assert.equal(back.bank.returned, 496);
  assert.equal(back.bank.owed, 0); assert.ok(back.units.every(u => u.loan === null && u.wageOwed === 0));
  assert.ok([...back.buildings.values()].every(b => b.fee === 0));
  back.update(0.1); assert.equal(back.bank.taxed, 0, "불러오자마자 세금 없음");
  // 은행 기록이 아예 없는 예전 섬 저장
  const old = World.create(7, seededRandom(3)), oj = JSON.parse(JSON.stringify(old.serialize())); delete oj.bank;
  const ob = World.fromJSON(oj); assert.equal(ob.bank.vault, BK.VAULT_LEGACY); assert.equal(ob.bank.issued, 0);
  // 이상한 값
  assert.equal(BK.bankFromSave({ vault: -5 }).vault, 0); assert.equal(BK.bankFromSave({ vault: "x" }).vault, 0);
});

test("화면용 API 모양(나중 UI)과 hud·main이 쓰는 이름이 그대로", () => {
  const { w, mini } = town(100);
  for (const k of ["issued", "returned", "vault", "taxed", "fees", "wages", "owed", "lent", "repaid", "day", "short", "low", "ledger"]) assert.ok(k in w.bank, k);
  assert.equal(typeof w.moneySupply(), "number"); assert.equal(w.economy, true);
  assert.equal(w.feeFor("house"), 10); assert.ok(["ok", "low", "empty"].includes(w.vaultState()));
  const s = spotFor(w, "house"), c = w.check("house", s[0], s[1], 0); assert.equal(c.ok, true); assert.equal(c.fee, 10);
  assert.equal(w.loanInfo(mini), null);
  const d = w.houseDeal(mini, readyHouse(w)); assert.deepEqual(Object.keys(d).sort(), ["down", "loan", "ok", "price", "reason"]);
  const ev = []; w.on("market", e => ev.push(e)); mini.coins = 20; w.buyHouse(mini, [...w.buildings.values()].find(b => b.defId === "house" && !b.owner));
  assert.equal(ev[0].kind, "house"); assert.equal(ev[0].down, 12); assert.equal(ev[0].loan, 18);
  const fees = []; w.on("fee", e => fees.push(e.fee)); place(w, "bench"); assert.deepEqual(fees, [2]);
});

test("결정성: 같은 씨앗이면 금고·돈이 같고, 세금·상환은 난수를 쓰지 않음", () => {
  const run = () => { const w = World.create(7, seededRandom(5), { wild: true, firstGull: true }); for (const d of UNITS) w.addUnitByName(d.name); for (let t = 0; t < 700; t += 0.1) w.update(0.1); return [w.bank.vault, w.bank.taxed, ...w.units.map(u => u.coins)]; };
  const a = run(); assert.deepEqual(run(), a); assert.ok(a[1] > 0, "첫날이 지나 세금을 걷음");
  const { w, mini } = town(100); let n = 0; const r = w.rnd; w.rnd = () => { n++; return r(); };
  mini.coins = 12; w.buyHouse(mini, readyHouse(w)); for (const u of w.units) u.coins += 300;
  nextDay(w); assert.equal(n, 0); assert.ok(w.bank.taxed > 0);
});

test("흐름: 넓은 섬 보통 놀이 3일 — 금고가 마르지 않고, 집이 팔리고(대출 포함), 세금이 들어오고, 날 끝엔 밀린 품삯이 없음", () => {
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }), c = w.center;
  const at = (d, cx, cz) => { const v = w.bank.vault; w.bank.vault = 1e9; let q = null;
    for (let r = 3; r < 40 && !q; r++) for (let k = 0; k < 64 && !q; k++) { const a = k / 64 * 6.28, x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) q = [x, z]; }
    w.bank.vault = v; return q && w.placeBuilding(d, q[0], q[1], 0).ok; };
  const plan = [[0, () => at("house", c.x - 8, c.z + 8)], [120, () => { for (const d of UNITS) w.addUnitByName(d.name); for (const d of ["market", "field", "house", "house"]) at(d, c.x + 6, c.z + 8); }],
    [1200, () => { for (const d of ["storehouse", "house", "cottage"]) at(d, c.x + 6, c.z + 8); }]];
  const coinsSpent = []; let ends = [];
  for (let t = 0, i = 0; t < 3 * NEWS_DAY_SECS; t += 0.1) {
    while (i < plan.length && plan[i][0] <= w.time) plan[i++][1]();
    const d0 = newsDay(w.time); w.update(0.1);
    if (newsDay(w.time) !== d0) ends.push({ vault: w.bank.vault, owed: w.bank.owed });
    if (w.bank.vault < 0) coinsSpent.push(w.time);
  }
  assert.deepEqual(coinsSpent, [], "금고는 음수가 되지 않음");
  assert.ok(ends.length >= 2 && ends.every(e => e.vault > 0 && e.owed === 0), JSON.stringify(ends));
  assert.ok(w.units.filter(u => u.home).length >= 3, "집이 팔림");
  assert.ok(w.bank.taxed > 0 && w.bank.fees > 0 && w.bank.wages > 0);
  assert.equal(Math.round(w.bank.vault), BK.VAULT_START + w.bank.taxed + w.bank.returned + w.bank.printed - w.bank.fees - w.bank.wages - w.bank.bought - w.bank.granted - w.bank.interest, "금고 = 시작 + 세금 + 돌아온 돈 + 찍은 돈 − 설계비 − 품삯 − 매입 − 축하금 등 − 이자(MON-5)");
  assert.equal(w.bank.seig, 0, "발행 수수료(새 돈)는 없어짐"); assert.equal(w.bank.issued, 0, "찍지 않으면 새 돈 0(MON-5)"); assert.ok(w.bank.bought > 0, "가공품은 금고 돈으로 삼");
  void E;
});

test("첫 시장은 설계비 없음: 시장을 짓기 전에 금고를 다 써도 빠져나올 길이 있음(검토 회귀)", () => {
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true });
  for (const n of ["목수", "미니", "황금"]) w.addUnitByName(n);
  assert.equal(w.economy, true); assert.equal(w.marketB(), null);
  w.bank.vault = 0; for (const u of w.units) u.coins = 0;
  assert.equal(w.feeFor("market"), 0, "시장이 하나도 없으면 0");
  const s = spotFor(w, "market"), c = w.check("market", s[0], s[1], 0); assert.equal(c.ok, true); assert.equal(c.fee, 0);
  const r = w.placeBuilding("market", s[0], s[1], 0); assert.ok(r.ok); assert.equal(r.building.fee, 0); assert.equal(w.bank.vault, 0);
  assert.equal(w.feeFor("market"), BK.FEE.market, "공사 중인 시장이 있으면 둘째부터는 설계비");
  const s2 = spotFor(w, "market"); assert.match(w.check("market", s2[0], s2[1], 0).reason, /금고/);
  w.removeBuilding(r.building.id); assert.equal(w.feeFor("market"), 0, "철거하면 다시 첫 시장");
});

test("대출 거절 ≠ 바닥 사태: 금고가 넉넉하면 비싼 집 하나 거절로 사태·기사가 나지 않고, 금고가 30 아래면 사태(검토 회귀)", () => {
  // 검토 REPRO A: 2층집(대출 30 → 50 필요)만 팔리고 금고 48
  const { w, mini, boss } = town(48), h = readyHouse(w, "cottage");
  mini.coins = 20; assert.equal(w.buyHouse(mini, h), false); assert.equal(mini.loanRefused, true); assert.equal(w.bank.need, 50);
  assert.equal(w.bank.short, 0); assert.equal(w.vaultState(), "ok"); assert.equal(bankNews(w), 0);
  w.payWage(boss); assert.equal(boss.wageOwed || 0, 0, "품삯은 그대로 나감"); assert.equal(w.bank.vault, 46);
  w.updateRoads(); assert.ok(mini.satParts.some(p => /집 대출을 못 받음/.test(p[0])), "거절된 갈매미 만족도는 그대로");
  w.deposit(4); assert.equal(mini.loanRefused, false, "금고가 50이 되면 거절 표시를 풂"); assert.equal(w.bank.need, 0);
  assert.equal(w.buyHouse(mini, h), true);
  // 금고 25: 대출 거절이 바닥 사태(기사 한 번), 금고 30이 되면 사태 끝(need 38은 따로)
  const { w: w2, mini: m2 } = town(25), h2 = readyHouse(w2);
  m2.coins = 12; assert.equal(w2.buyHouse(m2, h2), false); assert.equal(w2.bank.short, 1); assert.equal(bankNews(w2), 1);
  assert.ok(w2.newsLog.some(e => /집 대출이 멈췄어요/.test(e.text))); assert.equal(w2.vaultState(), "empty");
  w2.deposit(5); assert.equal(w2.bank.short, 0, "밀린 품삯 없고 30 → 사태 끝"); assert.equal(m2.loanRefused, true, "38까지는 아직 거절");
  w2.deposit(8); assert.equal(m2.loanRefused, false);
});

test("밀린 품삯을 갚아 금고가 30 아래로 내려가도 '얼마 안 남음' 알림(검토 회귀)", () => {
  const { w, boss } = town(0); const seen = []; w.on("vaultLow", e => seen.push(e.vault));
  w.bank.low = 0; boss.wageOwed = 50; w.bank.owed = 50;
  w.deposit(45); assert.equal(w.bank.vault, 0); assert.equal(boss.wageOwed, 5); assert.deepEqual(seen, [0]); assert.equal(w.bank.low, 1);
});

test("장부: 전날 놓은 공사장을 오늘 철거하면 오늘 칸에 환불(refunds)로 적고 설계비는 음수가 되지 않음(검토 회귀)", () => {
  const { w } = town(100);
  const site = place(w, "house").building; assert.equal(w.bank.ledger.at(-1).fees, 10);
  w.time = NEWS_DAY_SECS + 5; w.removeBuilding(site.id);
  assert.deepEqual(w.bank.ledger.map(e => [e.day, e.fees, e.refunds]), [[1, 10, 0], [2, 0, 10]]);
  assert.equal(w.bank.fees, 0, "누계는 환불을 뺌"); assert.equal(w.bank.vault, 100);
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize()))); assert.equal(back.bank.ledger.at(-1).refunds, 10);
  assert.equal(BK.bankFromSave({ ledger: [{ day: 1, fees: 3 }] }).ledger[0].refunds, 0, "예전 장부엔 없음 → 0");
});

test("물가: 배수 = 1 + 0.15 × (등급 − 1) + 0.06 × (다 지은 집·시설 − 8), 최대 3 · 설계비·집값(계약금·대출)에 곱함 · 새 섬은 1배", () => {
  assert.equal(BK.priceMult(0, 0), 1); assert.equal(BK.priceMult(1, 8), 1, "어촌 · 8채까지는 그대로");
  assert.equal(BK.priceMult(2, 8), 1.15); assert.equal(BK.priceMult(3, 8), 1.3); assert.equal(BK.priceMult(1, 9), 1.06);
  assert.equal(BK.priceMult(2, 12), 1.39); assert.equal(BK.priceMult(3, 200), BK.PRICE_CAP);
  assert.equal(BK.scaled(10, 1.39), 14); assert.equal(BK.scaled(30, 1.39), 42); assert.equal(BK.scaled(0, 3), 0, "0은 0"); assert.equal(BK.scaled(1, 1.06), 1);
  const { w, mini } = town(1000);
  assert.deepEqual(w.priceInfo(), { mult: 1, rank: 0, n: 2, free: 8, rankPart: 0, buildPart: 0, cap: 3, nextAt: 9 }, "새 섬: 첫 집 + 시장 = 2채, 1배");
  assert.equal(w.feeFor("house"), 10); assert.equal(w.housePrice("house"), 30);
  // 장식·계단·짓는 중인 건물은 세지 않음
  w.instantBuild = true; place(w, "bench"); place(w, "stairs"); w.instantBuild = false; place(w, "house");
  assert.equal(w.priceInfo().n, 2);
  for (let k = 0; k < 10; k++) readyHouse(w);                                // 첫 집 + 다 지은 집 10채 + 시장 = 12
  w.rank = 2;
  const pi = w.priceInfo(); assert.equal(pi.n, 12); assert.equal(pi.mult, 1.39); assert.equal(pi.rankPart, 0.15); assert.equal(pi.buildPart, 0.24); assert.equal(pi.nextAt, 13);
  assert.equal(w.feeFor("house"), 14); assert.equal(w.feeFor("cottage"), 21); assert.equal(w.feeFor("snowman"), 0); assert.equal(w.feeFor("bridge"), 1);
  const s = spotFor(w, "house"), c = w.check("house", s[0], s[1], 0); assert.equal(c.fee, 14);
  const v0 = w.bank.vault, r = w.placeBuilding("house", s[0], s[1], 0); assert.equal(r.building.fee, 14); assert.equal(w.bank.vault, v0 - 14);
  w.removeBuilding(r.building.id); assert.equal(w.bank.vault, v0, "환불은 낸 설계비 그대로");
  // 집값: 42 → 계약금 17 · 대출 25(금고 대출금 + 20)
  const h = [...w.buildings.values()].find(b => b.defId === "house" && w.isDone(b) && !b.owner);
  mini.coins = 41; const d = w.houseDeal(mini, h); assert.deepEqual(d, { ok: true, price: 42, down: 17, loan: 25, reason: null });
  mini.coins = 16; assert.equal(w.houseDeal(mini, h).reason, "coins");
  mini.coins = 20; const v1 = w.bank.vault; assert.equal(w.buyHouse(mini, h), true);
  assert.deepEqual(mini.loan, { left: 25, per: 5 }); assert.equal(mini.coins, 3); assert.ok(w.bank.vault - v1 >= 16, "금고엔 계약금(상인 몫 1 뺌)");
  // 첫 시장은 여전히 0(시장이 하나도 없을 때)
  const w2 = World.create(7, seededRandom(3), { wild: true, firstGull: true }); w2.addUnitByName("목수"); w2.rank = 3; assert.equal(w2.feeFor("market"), 0);
  // 은행 없는 섬은 늘 1배
  assert.equal(World.create(7, seededRandom(3)).priceMult(), 1);
});

test("갈매미 주문 장식: 주문한 갈매미가 값을 맡기고(설계비 없음) 품삯·자재값을 거기서 냄 · 금고는 품삯을 안 냄 · 다 지으면 남은 돈 돌려받음", () => {
  assert.equal(orderCost("bench"), 12); assert.equal(orderCost("flowerbed"), 12);
  const { w, mini, boss } = town(0), h = readyHouse(w);
  mini.coins = 30; const deco = orderDeco(w, h, seededRandom(1), mini);
  assert.ok(deco); assert.equal(deco.fee, 0); assert.deepEqual(deco.order, { by: mini.unitId, left: 12 }); assert.equal(mini.coins, 18); assert.equal(w.bank.vault, 0);
  // 품삯: 금고 0이어도 밀리지 않고 맡긴 돈에서
  boss.coins = 0; w.payWage(boss, deco);
  assert.equal(boss.coins, 2); assert.equal(boss.wageOwed || 0, 0); assert.equal(w.bank.owed, 0); assert.equal(w.bank.short, 0); assert.equal(w.bank.vault, 0); assert.equal(deco.order.left, 10);
  // 자재: 은행 창고 나무 1 → 금고로 시장 값 2, 짓는 갈매미 가방의 나무 1 → 그 갈매미에게 2
  w.orderMaterials(deco, boss, {}, { wood: 1 }); assert.equal(w.bank.vault, 2); assert.equal(w.bank.returned >= 2, true); assert.equal(deco.order.left, 8);
  w.orderMaterials(deco, boss, { wood: 1 }, {}); assert.equal(boss.coins, 4); assert.equal(deco.order.left, 6);
  // 다 지은 뒤 마지막 품삯 → 남은 4를 돌려받음, 주문 끝
  deco.hits = deco.need; w.payWage(boss, deco); assert.equal(boss.coins, 6); assert.equal(deco.order, null); assert.equal(mini.coins, 22);
  // 맡긴 돈이 떨어지면 주문한 갈매미 지갑에서, 그래도 없으면 덜 받음(금고는 대신 내지 않음)
  const d2 = orderDeco(w, h, seededRandom(2), mini); assert.equal(mini.coins, 10);
  d2.order.left = 0; mini.coins = 1; w.payWage(boss, d2); assert.equal(boss.coins, 7); assert.equal(mini.coins, 0); assert.equal(d2.order.unpaid, 1); assert.equal(w.bank.vault, 2);
  // 짓기 전에 철거하면 남은 돈을 돌려받음
  mini.coins = 30; const d3 = orderDeco(w, h, seededRandom(3), mini); assert.equal(mini.coins, 18);
  w.payWage(boss, d3); w.removeBuilding(d3.id); assert.equal(mini.coins, 28, "12 − 품삯 2 = 10 돌려받음");
  // 돈이 모자라면 주문하지 않음(맡길 12 + 밥값 10)
  mini.coins = 21; assert.equal(canOrder(w, mini), false, "계획(planImprovement)은 맡길 돈 + 밥값이 있어야 주문");
  mini.coins = 22; assert.equal(canOrder(w, mini), true);
  mini.coins = 11; assert.equal(orderDeco(w, h, seededRandom(4), mini), null, "맡길 돈이 없으면 놓지 않음"); assert.equal(mini.coins, 11);
});

test("갈매미 주문 장식: 돈이 없으면 고치기 계획에 장식 주문이 안 나옴 · 저장/불러오기에 맡긴 돈이 남음 · 다 지었는데 끊긴 주문은 다음 날 돌려줌", () => {
  const { w, mini } = town(100), h = readyHouse(w);
  mini.home = h.id; h.owner = mini.unitId; w.updateRoads();
  mini.coins = 0; const p0 = planImprovement(w, mini); assert.ok(!p0 || p0.kind !== "deco", "돈 없으면 장식 주문 없음");
  mini.coins = 500; mini.satParts = [["집-시장", 1], ["집-은행", 1]];
  const deco = orderDeco(w, h, seededRandom(1), mini);
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())));
  const b2 = back.buildings.get(deco.id); assert.deepEqual(b2.order, { by: mini.unitId, left: 12 });
  const m2 = back.units.find(u => u.name === "미니"); assert.equal(m2.coins, mini.coins);
  b2.hits = b2.need; back.time = NEWS_DAY_SECS + 1; back.stepBank();
  assert.equal(b2.order, null); assert.ok(m2.coins >= mini.coins + 12 - BK.TAX_CAP, "맡긴 12를 돌려받음(그날 세금은 따로)");
});

test("갈매미 주문 장식: 다 지은 뒤 마지막 품삯 전에 날이 바뀌어 정산돼도(stepBank) 그 품삯은 금고가 아니라 주문한 갈매미 지갑에서(검토 회귀)", () => {
  const { w, mini, boss } = town(50), h = readyHouse(w);
  mini.coins = 30; boss.coins = 0; const deco = orderDeco(w, h, seededRandom(1), mini);
  while (!w.isDone(deco)) w.hammer(deco, boss);                                // 망치질로 다 지음(마지막 바퀴 품삯은 아직)
  assert.deepEqual(deco.order, { by: mini.unitId, left: 12 });
  nextDay(w); assert.equal(deco.order, null, "날이 바뀌며 정산"); assert.equal(deco.orderBy, mini.unitId);
  const v = w.bank.vault, wg = w.bank.wages, m = mini.coins, bc = boss.coins;
  w.payWage(boss, deco);
  assert.equal(w.bank.vault, v, "금고는 그대로"); assert.equal(w.bank.wages, wg); assert.equal(w.bank.owed, 0);
  assert.equal(mini.coins, m - E.WAGE, "주문한 갈매미가 냄"); assert.equal(boss.coins, bc + E.WAGE);
  // 주문한 갈매미 돈이 없으면 덜 받음(금고는 대신 내지 않음, 밀리지도 않음)
  mini.coins = 0; w.payWage(boss, deco); assert.equal(w.bank.vault, v); assert.equal(boss.coins, bc + E.WAGE); assert.equal(boss.wageOwed || 0, 0);
  // 플레이어가 놓은 건물은 그대로 금고에서
  const hs = place(w, "house").building, v2 = w.bank.vault; w.payWage(boss, hs); assert.equal(w.bank.vault, v2 - E.WAGE);
});

test("장부 몫 칸: 집값(계약금)·상환·옷·가게(코코아·저장고·가구)·진료를 returned 안의 몫으로 따로 적고, 금고·returned 합은 그대로", () => {
  const { w, mini } = town();
  const r0 = w.rank; w.rank = 3; w.bank.vault = 1e6; w.instantBuild = true; assert.ok(place(w, "shop").ok, "잡화점"); assert.ok(place(w, "storehouse").ok, "저장고"); w.instantBuild = false; w.rank = r0;
  assert.equal(w.priceMult(), 1, "물가 1배(계약금 12)");
  Object.assign(w.bank, { vault: 100, fees: 0, wages: 0, taxed: 0, returned: 0, ledger: [] });
  const merchant = w.units.find(u => u.name === "황금"); merchant.state = "Idle";   // 상인 몫(계약금에서 1)이 빠지지 않게
  const h = readyHouse(w); mini.coins = 12; assert.ok(w.buyHouse(mini, h));
  assert.equal(w.bank.ledger.at(-1).house, 12, "계약금 → house"); assert.equal(w.bank.ledger.at(-1).returned, 12);
  mini.coins = 14; nextDay(w);
  let e = w.bank.ledger.at(-1); assert.equal(e.repay, 4, "상환 → repay"); assert.equal(e.house, 0, "새 날은 0부터");
  mini.coins = 100;
  assert.ok(w.buyClothes(mini, "scarf")); assert.ok(w.buyCocoa(mini)); assert.ok(w.buyFurniture(mini, "chair"));
  w.granary = 3; assert.equal(w.takeFood(mini), "buy");
  e = w.bank.ledger.at(-1);
  assert.equal(e.clothes, 6); assert.equal(e.shop, 2 + 6 + w.foodPrice(), "코코아 2 + 의자 6 + 저장고 음식");
  const parts = BK.LEDGER_PARTS.reduce((s, k) => s + e[k], 0);
  assert.equal(parts, e.returned, "몫 합 = 그날 돌아온 돈(이 받침엔 '그 밖'이 없음)");
  assert.equal(w.bank.returned, w.bank.ledger.reduce((s, d) => s + d.returned, 0));
  assert.equal(w.bank.vault, 100 + w.bank.taxed + w.bank.returned - w.bank.fees - w.bank.wages - (w.bank.custom || 0), "금고 항등식 그대로");
  // 저장/불러오기: 몫 칸이 그대로 · 예전 장부(몫 칸 없음)는 0
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())));
  for (const k of BK.LEDGER_PARTS) assert.equal(back.bank.ledger.at(-1)[k], e[k], k);
  const old = BK.bankFromSave({ ledger: [{ day: 2, returned: 9, clinic: 3 }] }).ledger[0];
  assert.deepEqual([old.returned, old.clinic, old.house, old.repay, old.clothes, old.shop], [9, 3, 0, 0, 0, 0]);
});

test("장부 몫 칸: 몫 없이 들어온 돈(주문 장식 자재값 등)은 '그 밖'으로 남고 세금은 몫에 안 섞임", () => {
  const { w } = town(50);
  w.deposit(7); w.deposit(5, "tax"); w.deposit(3, "returned", "nope");
  const e = w.bank.ledger.at(-1);
  assert.equal(e.returned, 10); assert.equal(e.tax, 5); assert.equal(BK.LEDGER_PARTS.reduce((s, k) => s + e[k], 0), 0);
  assert.equal(w.bank.vault, 65);
});

test("금고 돈이 나가는 이벤트(화면 효과용): 설계비 fee{b,fee} · 품삯 wage{u,b,n} · 밀림 wageOwed{u,n,b} · 주문 공사는 금고 이벤트 없음", () => {
  const { w, boss, mini } = town(100), got = [];
  for (const ev of ["fee", "wage", "wageOwed", "wagePaid"]) w.on(ev, e => got.push([ev, e]));
  w.instantBuild = false; const site = place(w, "cottage").building;
  assert.deepEqual(got.map(g => g[0]), ["fee"]); assert.equal(got[0][1].b, site); assert.ok(got[0][1].fee > 0);
  got.length = 0; w.payWage(boss, site);
  assert.deepEqual(got.map(g => g[0]), ["wage"]); assert.equal(got[0][1].b, site); assert.equal(got[0][1].n, E.WAGE); assert.equal(got[0][1].u, boss);
  got.length = 0; w.bank.vault = 0; w.payWage(boss, site);
  assert.deepEqual(got.map(g => g[0]), ["wageOwed"]); assert.equal(got[0][1].b, site, "밀림도 어느 공사장인지");
  got.length = 0; w.bank.vault = 0; boss.wageOwed = 0; w.bank.owed = 0;
  const h = readyHouse(w); mini.coins = 30; const deco = orderDeco(w, h, seededRandom(1), mini); got.length = 0;
  w.payWage(boss, deco); assert.deepEqual(got, [], "주문 공사(갈매미 돈)는 금고 효과 없음");
});
