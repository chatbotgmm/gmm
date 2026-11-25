// 은행 금고 개편 시험(three.js 없이): 금고 = 플레이어 돈 · 설계비 · 품삯(금고에서, 밀림) · 집 대출·상환 · 세금 · 바닥 사태 말풍선·소식지 · 저장·예전 저장
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { newsDay, NEWS_DAY_SECS } from "../src/world/news.js";
import { orderDeco } from "../src/world/improve.js";
import * as BK from "../src/world/bank.js";
import * as E from "../src/world/economy.js";

const spotFor = (w, d) => {
  const c = w.center, v = w.bank.vault; w.bank.vault = 1e9;                    // 자리만 찾음(설계비 검사는 빼고)
  try { for (let r = 4; r < 60; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + 6 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; }
  finally { w.bank.vault = v; }
};
const place = (w, d) => { const s = spotFor(w, d); return w.placeBuilding(d, s[0], s[1], 0); };
/** 넓은 섬 + 목수·미니(농부)·황금(상인) + 다 지은 시장. 금고는 vault로 맞춤 */
function town(vault = BK.VAULT_START) {
  const w = World.create(7, seededRandom(3), { wild: true }); w.instantBuild = true;
  for (const n of ["목수", "미니", "황금"]) w.addUnitByName(n);
  w.bank.vault = 1e6; assert.ok(place(w, "market").ok); w.instantBuild = false;
  Object.assign(w.bank, { vault, fees: 0, ledger: [] });
  return { w, boss: w.units[0], mini: w.units.find(u => u.name === "미니"), carp: w.units.find(u => u.name === "목수") };
}
/** 다 지은 빈 집(시험 받침: hits를 넘겨 설계비 없음) */
const readyHouse = (w, d = "house") => { const s = spotFor(w, d); return w.placeBuilding(d, s[0], s[1], 0, null, 1e9).building; };
const bankNews = w => w.newsLog.filter(e => /금고가 바닥/.test(e.text)).length;
const nextDay = w => { w.time = newsDay(w.time) * NEWS_DAY_SECS + 1; w.stepBank(); };

test("금고: 새 넓은 섬은 🪙100, 은행 없는 섬은 설계비·금고가 꺼져 있음", () => {
  const w = World.create(7, seededRandom(3), { wild: true });
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
  assert.equal(m2.loanRefused, true); assert.match(m2.emoteText, /은행에 돈이 없대/); assert.equal(w2.bank.short, 1); assert.equal(bankNews(w2), 1);
  w2.updateRoads(); assert.ok(m2.satParts.some(p => /집 대출을 못 받음/.test(p[0]) && p[1] === -10));
  m2.emoteText = ""; assert.equal(w2.buyHouse(m2, h2), false); assert.equal(m2.emoteText, "", "한 사태에 한 번만 말풍선");
  // 금고 38이면 빌려줌
  w2.bank.vault = 38; assert.equal(w2.houseDeal(m2, h2).ok, true);
  // 집값을 다 가지면 금고가 0이어도 현금
  w2.bank.vault = 0; m2.coins = 30; assert.equal(w2.buyHouse(m2, h2), true); assert.equal(m2.loan, null); assert.equal(m2.loanRefused, false); assert.equal(w2.bank.vault, 30);
});

test("상환·세금: 마을 날이 바뀔 때 상환 먼저(10은 남김) → 세금(20 넘는 돈의 5%, 최대 8), 하루 한 번, 5일에 다 갚음", () => {
  const { w, mini, boss, carp } = town(100);
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
  const ob = World.fromJSON(oj); assert.equal(ob.bank.vault, BK.VAULT_START); assert.equal(ob.bank.issued, 0);
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
  const run = () => { const w = World.create(7, seededRandom(5), { wild: true }); while (w.summon()); for (let t = 0; t < 700; t += 0.1) w.update(0.1); return [w.bank.vault, w.bank.taxed, ...w.units.map(u => u.coins)]; };
  const a = run(); assert.deepEqual(run(), a); assert.ok(a[1] > 0, "첫날이 지나 세금을 걷음");
  const { w, mini } = town(100); let n = 0; const r = w.rnd; w.rnd = () => { n++; return r(); };
  mini.coins = 12; w.buyHouse(mini, readyHouse(w)); for (const u of w.units) u.coins += 300;
  nextDay(w); assert.equal(n, 0); assert.ok(w.bank.taxed > 0);
});

test("흐름: 넓은 섬 보통 놀이 3일 — 금고가 마르지 않고, 집이 팔리고(대출 포함), 세금이 들어오고, 날 끝엔 밀린 품삯이 없음", () => {
  const w = World.create(7, seededRandom(3), { wild: true }), c = w.center;
  const at = (d, cx, cz) => { const v = w.bank.vault; w.bank.vault = 1e9; let q = null;
    for (let r = 3; r < 40 && !q; r++) for (let k = 0; k < 64 && !q; k++) { const a = k / 64 * 6.28, x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) q = [x, z]; }
    w.bank.vault = v; return q && w.placeBuilding(d, q[0], q[1], 0).ok; };
  const plan = [[0, () => at("house", c.x - 8, c.z + 8)], [120, () => { while (w.summon()); for (const d of ["market", "field", "house", "house"]) at(d, c.x + 6, c.z + 8); }],
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
  assert.equal(Math.round(w.bank.vault), BK.VAULT_START + w.bank.taxed + w.bank.returned - w.bank.fees - w.bank.wages, "금고 = 시작 + 세금 + 돌아온 돈 − 설계비 − 품삯");
  void E;
});
