// 🏦 은행 앱 화면(bankView.js, DOM 없이): 내 금고 머리 · 오늘 들어온/나간 돈 · 접기 다섯 · 대출 줄 · 마을에 도는 돈 · 날 끝 금고
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { newsDay, NEWS_DAY_SECS } from "../src/world/news.js";
import * as BK from "../src/world/bank.js";
import { bankHtml, dayFlow, todayOf, weekRows } from "../src/ui/bankView.js";

const spotFor = (w, d) => { const c = w.center; for (let r = 4; r < 60; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + 6 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; };
function town() {
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }); w.instantBuild = true;
  for (const n of ["목수", "미니", "황금"]) w.addUnitByName(n);
  w.bank.vault = 1e6; const s = spotFor(w, "market"); assert.ok(w.placeBuilding("market", s[0], s[1], 0).ok); w.instantBuild = false;
  Object.assign(w.bank, { vault: 100, fees: 0, wages: 0, taxed: 0, returned: 0, ledger: [] });
  w.setRate(0);                                                                     // 중앙은행 금리 0%: 계약금 비율 40%(예전 값)
  return w;
}
const details = html => [...html.matchAll(/<details class="more" data-more="([^"]+)"( open)?/g)].map(m => [m[1], !!m[2]]);

test("은행 앱: 내 금고 머리(큰 숫자·상태) + 접기 다섯(처음엔 닫힘), 마을 돈 접기 열쇠는 bank.town", () => {
  const w = town(), h = bankHtml(w);
  assert.match(h, /class="sum" data-tone="ok"/); assert.match(h, /sum-big">🪙100</); assert.match(h, /내 금고/); assert.match(h, /넉넉해요/);
  assert.deepEqual(details(h), [["bank.today", false], ["bank.week", false], ["bank.loan", false], ["bank.town", false], ["bank.goods", false]]);
  w.bank.vault = 25; assert.match(bankHtml(w), /data-tone="low"[\s\S]*얼마 안 남음/);
  w.bank.vault = 1; assert.match(bankHtml(w), /data-tone="empty"[\s\S]*바닥/);
  w.bank.owed = 4; assert.match(bankHtml(w), /밀린 품삯 🪙4/);
  const opened = bankHtml(w, (k, t, html, o) => `<details class="more" data-more="${k}"${k === "bank.town" ? " open" : ""}>${html}</details>`);
  assert.deepEqual(details(opened).find(d => d[0] === "bank.town"), ["bank.town", true], "hud.more의 기억한 펼침을 그대로 씀");
  const old = World.create(7, seededRandom(3)); assert.match(bankHtml(old), /공식은행이 없어요/);
  assert.ok(!/undefined|NaN/.test(bankHtml(town())), "빈 값 글자 없음");
});

test("은행 앱: 오늘 들어온 돈 − 나간 돈 = 오늘 금고 변화, 몫 칸이 장부 줄로, 빌려준 돈은 나간 돈에 안 셈", () => {
  const w = town(), mini = w.units.find(u => u.name === "미니"), v0 = w.bank.vault;
  w.units.find(u => u.name === "황금").state = "Idle";
  const s = spotFor(w, "house"), h = w.placeBuilding("house", s[0], s[1], 0, null, 1e9).building;
  mini.coins = 12; assert.ok(w.buyHouse(mini, h));                                  // 계약금 12 + 대출 18
  const s2 = spotFor(w, "house"); assert.ok(w.placeBuilding("house", s2[0], s2[1], 0).ok);   // 설계비 10
  w.deposit(5, "tax"); w.payWage(w.units[0]);                                        // 세금 5 · 품삯
  const f = dayFlow(todayOf(w));
  assert.equal(f.inSum - f.outSum, w.bank.vault - v0, "오늘 +/− = 금고 변화");
  assert.equal(f.lent, 18);
  const html = bankHtml(w);
  assert.match(html, /🏠 집 계약금<\/td><td>12</); assert.match(html, /📐 설계비<\/td><td>10</); assert.match(html, /🧾 세금<\/td><td>5</);
  assert.match(html, /<tr class="zero"><td>🧣 옷<\/td><td>0</, "0인 줄은 흐리게");
  assert.match(html, /빌려준 집값 🪙18/);
  // 대출 줄 = loanInfo
  const li = w.loanInfo(mini); assert.ok(html.includes(`남은 🪙${li.left} · 하루 ${li.per} · ${li.days}일`)); assert.match(html, /1건 · 남은 🪙18/);
});

test("은행 앱: 최근 7일 — 날 끝 금고를 지금 금고에서 거꾸로 셈, 마을 돈은 갈매미별(많은 순)과 합계", () => {
  const w = town(); const [a, b, c] = w.units; a.coins = 50; b.coins = 7; c.coins = 0;
  w.deposit(10, "tax");                                                             // 1일째 +10 → 110
  w.time = newsDay(w.time) * NEWS_DAY_SECS + 1; w.deposit(3);                       // 2일째 +3 → 113
  const wk = weekRows(w);
  assert.deepEqual(wk.map(d => [d.day, d.inSum, d.end]), [[1, 10, 110], [2, 3, 113]]);
  const html = bankHtml(w);
  assert.ok(html.indexOf(`<td>${a.name}</td><td>🪙50`) < html.indexOf(`<td>${b.name}</td><td>🪙7`), "많은 순");
  assert.ok(html.includes(`마을에 도는 돈 <b>${w.moneySupply()}</b>`));
  assert.equal(BK.LEDGER_PARTS.length, 7);
});
