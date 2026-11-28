// 🏛 중앙은행 판(ui/monView.js, DOM 없이): 핵심 숫자 넷 · 🖨 찍어내기 단추와 확인창 글 · 금리·매입 예산 손잡이 · 접기 셋 · 탭
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import * as MON from "../src/world/monetary.js";
import { monHtml, monArrow, printAsk, printPick, printRise, flowWeek, bankAppHtml } from "../src/ui/monView.js";
import { setAdv } from "../src/ui/viewPrefs.js";
/** 🔧 자세히 보기(관리자)를 켠 채로 fn을 돌림(끝나면 쉬운 보기로 되돌림) */
const withAdv = fn => { setAdv(true); try { return fn(); } finally { setAdv(false); } };

function town() {
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true });
  for (const n of ["목수", "미니"]) w.addUnitByName(n);
  w.units.forEach((u, i) => { u.coins = 400 + i * 100; });
  w.bank.vault = 300; return w;
}
const details = html => [...html.matchAll(/<details class="more" data-more="([^"]+)"/g)].map(m => m[1]);

test("핵심 숫자 넷(금고·마을 돈·물가·금리)이 맨 위, 접기 셋은 처음 닫힘, 빈 값 글자 없음", () => {
  const w = town(), h = monHtml(w), A = w.moneySupply();
  const kpi = h.indexOf("mon-kpis"), print = h.indexOf("mon-print");
  assert.ok(kpi >= 0 && kpi < print, "핵심 칸이 찍어내기보다 위");
  assert.match(h, /🏦 금고[\s\S]*🪙300/); assert.match(h, new RegExp(`🪙${A.toLocaleString("ko-KR")}`));
  assert.match(h, /금고의 \d/); assert.match(h, /📈 물가[\s\S]*>100 /); assert.match(h, /🐷 금리[\s\S]*1%/);
  assert.deepEqual(details(h), ["mon.hist", "mon.flow", "mon.help"]);
  assert.ok(!/ open/.test(h.match(/<details[^>]*>/g).join("")), "처음엔 닫힘");
  assert.ok(!/undefined|NaN/.test(h));
});

test("🖨 찍어내기: 단계 50·100·200, 하루 300을 넘는 단계는 꺼짐, 다 찍으면 큰 단추도 꺼짐", () => {
  const w = town();
  assert.match(monHtml(w, { pstep: 100 }), /data-mon="print" data-v="100">🖨 🪙100 찍어 금고에 넣기/);
  assert.equal(w.print(200), 200); assert.equal(w.printLeft(), 100);
  const h = monHtml(w, { pstep: 200 });
  assert.match(h, /data-mon="pstep" data-v="200" aria-pressed="false" disabled/, "남은 100보다 큰 200은 꺼짐");
  assert.match(h, /data-mon="print" data-v="100"/, "고른 200이 안 되면 찍을 수 있는 가장 큰 단계로");
  assert.match(h, /오늘 더 찍을 수 있는 돈 <b>🪙100<\/b> \/ 300/);
  w.print(100); assert.match(monHtml(w), /data-mon="print" data-v="0" disabled>🖨 오늘은 다 찍었어요/);
  assert.equal(printPick(200, 300), 200); assert.equal(printPick(200, 150), 100); assert.equal(printPick(100, 40), null);
});

test("확인창 글: 물가가 오를 수 있다는 말 + 예상(마을 돈 → +n, 몇 %) + 찍은 뒤 남은 양", () => {
  const a = printAsk(100, { pocket: 1000, printLeft: 300 }, { easy: false });
  const e = printAsk(100, { pocket: 1000, printLeft: 300 });   // 쉬운 보기(기본): 물가 셈 없이 한 문장
  assert.equal(e.title, "🖨 동전 🪙100을 찍을까요?"); assert.ok(!/%|물가/.test(e.body)); assert.equal(e.ok, "🖨 🪙100 찍기");
  assert.equal(a.title, "🖨 새 동전 🪙100을 찍을까요?");
  assert.match(a.body, /물가가 오를 수 있어요/); assert.match(a.body, /🪙1,000에서 🪙1,100까지 10% 늘면, 물가도/); assert.match(a.body, /오늘 더 찍을 수 있는 돈 🪙200/);
  assert.equal(printRise(50, 0), null); assert.ok(!/예상/.test(printAsk(50, { pocket: 0, printLeft: 300 }, { easy: false }).body), "마을 돈이 0이면 % 예상은 뺌");
});

test("물가 화살표: 오름 ▲ · 내림 ▼ · 그대로 → · 적응 중 ⏸", () => {
  assert.equal(monArrow(0.012).icon, "▲"); assert.equal(monArrow(0.012).text, "+1.2%/일");
  assert.equal(monArrow(-0.02).icon, "▼"); assert.equal(monArrow(-0.02).text, "−2%/일");
  assert.equal(monArrow(0.001).icon, "→"); assert.equal(monArrow(0.03, 2).text, "적응 중 2일");
});

test("손잡이: 금리 0~5 · 매입 예산 자동이면 단계 칸 숨김, 직접이면 여섯 칸", () => {
  const w = town(); let h = monHtml(w);
  assert.equal([...h.matchAll(/data-mon="rate"/g)].length, MON.RATE_MAX + 1);
  assert.match(h, /data-mon="rate" data-v="1" class="on"/);
  assert.ok(!/data-mon="issue"/.test(h), "자동이면 단계 칸 없음");
  w.setIssue(30); h = monHtml(w);
  assert.equal([...h.matchAll(/data-mon="issue"/g)].length, MON.STEPS.length); assert.match(h, /data-mon="issue" data-v="30" class="on"/); assert.match(h, /다음 날부터 하루 🪙/, "단계를 바꾸면 한도는 다음 날부터라고 알림");
});

test("돈 흐름 표: 찍은 돈은 새 돈, 품삯은 금고 → 마을, 탭은 중앙은행이 있을 때만", () => {
  const w = town(); w.print(100); w.led("wages", 7); w.led("tax", 3);
  const f = flowWeek(w);
  assert.equal(f.neu[0][1], 100); assert.equal(f.out.find(r => r[0].includes("품삯"))[1], 7); assert.equal(f.back.find(r => r[0].includes("세금"))[1], 3);
  withAdv(() => {
    assert.match(bankAppHtml(w), /data-banktab="vault" aria-selected="true"/);
    assert.match(bankAppHtml(w, undefined, { tab: "mon" }), /data-banktab="mon" aria-selected="true"[\s\S]*mon-kpis/);
    const old = World.create(7, seededRandom(3)); assert.ok(!/data-banktab/.test(bankAppHtml(old)), "예전 섬은 탭 없음");
  });
  // 쉬운 보기(기본): 탭·중앙은행 판·세금·물가 없이 금고 하나 + 🖨 동전 찍기(새 돈이 생기는 유일한 길이라 남김)
  for (const tab of ["vault", "mon"]) { const h = bankAppHtml(w, undefined, { tab });
    assert.ok(!/data-banktab|mon-kpis|금리|물가|세금|숙박|대출|마을에 도는 돈|×\d/.test(h), `쉬운 은행(${tab})엔 속사정 없음`);
    assert.match(h, /내 금고/); assert.match(h, /data-mon="print" data-v="100"/); assert.match(h, /갈매미들이 낸 돈/); }
});

test("🎁 축하 단추: 금고에 품삯 몫(BUY_KEEP × P)이 남을 때만 켜짐, 모자라면 까닭 한 줄", () => {
  const w = town(), n = w.units.length, per = MON.scaleP(MON.GIFT_PER, w.bank.mon.P), keep = Math.ceil(MON.BUY_KEEP * w.bank.mon.P);
  const btn = h => h.match(/<button class="mon-gift"[^>]*>/)[0];
  w.bank.vault = per * n + keep; assert.ok(!/disabled/.test(btn(monHtml(w))), "합계 + 품삯 몫이면 켜짐");
  w.bank.vault = per * n + keep - 1; const h = monHtml(w);
  assert.match(btn(h), /disabled/, "품삯 몫을 헐게 되면 꺼짐"); assert.match(h, /축하금은 못 줘요/);
});
