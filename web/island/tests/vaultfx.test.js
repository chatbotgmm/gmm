// 건축에서 금고 돈이 나갈 때 보이는 효과의 순수 로직(ui/vaultFx.js)과 World가 내는 이벤트. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as V from "../src/ui/vaultFx.js";

test("siteSpendText: 설계비·품삯·밀림 글", () => {
  assert.equal(V.siteSpendText("fee", 12), "설계비 🪙−12");
  assert.equal(V.siteSpendText("wage", 2), "🪙−2");
  assert.equal(V.siteSpendText("owed", 4), "💸 품삯 밀림 4");
  assert.equal(V.siteSpendText("owed", 0), "💸 품삯 밀림");
  assert.equal(V.siteSpendText("wage", 2.6), "🪙−3", "정수로");
});

test("chipSpendText·makeSpendSum: 3초 안에 이어서 나가면 합치고, 지나면 새로", () => {
  const s = V.makeSpendSum(3000);
  assert.equal(s.add(-12, 0).sum, -12);
  assert.equal(s.add(-2, 1000).sum, -14);
  assert.equal(V.chipSpendText(s.sum), "−14");
  assert.equal(s.add(-2, 3999).sum, -16, "마지막 뒤 3초 안이면 계속 합침");
  assert.equal(s.add(-2, 7100).sum, -2, "3초가 지나면 새로");
  assert.equal(s.add(5, 7200).sum, 3); assert.equal(V.chipSpendText(3), "+3"); assert.equal(V.chipSpendText(0), "");
});

test("countAt: 처음·끝은 정확히, 사이는 줄어드는 정수(ease-out)", () => {
  assert.equal(V.countAt(100, 88, 0), 100); assert.equal(V.countAt(100, 88, 1), 88); assert.equal(V.countAt(100, 88, 2), 88);
  const mid = V.countAt(100, 88, 0.5); assert.ok(mid < 94 && mid > 88, "ease-out: 반에서 이미 반 넘게");
  let prev = 101; for (let k = 0; k <= 1.0001; k += 0.1) { const v = V.countAt(100, 88, k); assert.ok(v <= prev); prev = v; }
});

test("makeSiteGate: 같은 공사장은 합치고, 새로 띄우기는 간격·상한", () => {
  const g = V.makeSiteGate({ life: 1800, gap: 2500, max: 2 });
  let r = g.push("a", "wage", 2, 0); assert.equal(r.act, "new"); assert.equal(r.pop.n, 2);
  r = g.push("a", "wage", 2, 500); assert.equal(r.act, "merge"); assert.equal(r.pop.n, 4, "떠 있는 동안 합침");
  assert.ok(r.pop.end <= r.pop.t0 + 1800 * 1.5, "합쳐도 오래 남지 않음");
  r = g.push("a", "wage", 2, 2400); assert.equal(r.act, "skip"); assert.equal(r.why, "gap", "끝났지만 간격 안");
  r = g.push("a", "wage", 2, 2600); assert.equal(r.act, "new");
  assert.equal(g.push("b", "wage", 2, 2600).act, "new");
  r = g.push("c", "wage", 2, 2600); assert.equal(r.act, "skip"); assert.equal(r.why, "max", "한꺼번에 상한");
  assert.equal(g.push("c", "wage", 2, 5000).act, "new", "끝난 것이 지워지면 다시");
});

test("makeSiteGate: 설계비는 간격과 상관없이 · 밀림이 품삯 표시를 이김 · 밀림 위에 품삯은 안 덮음", () => {
  const g = V.makeSiteGate({ life: 1800, gap: 2500, max: 6 });
  g.push("a", "wage", 2, 0); g.sweep(2000);
  assert.equal(g.push("a", "fee", 30, 2100).act, "new", "놓는 순간 설계비는 언제나");
  assert.equal(g.push("a", "wage", 2, 2200).why, "fee", "설계비 표시 동안 품삯은 칩에만");
  const h = V.makeSiteGate();
  h.push("x", "wage", 2, 0); const r = h.push("x", "owed", 2, 100); assert.equal(r.act, "merge"); assert.equal(r.pop.kind, "owed");
  assert.equal(V.siteSpendText(r.pop.kind, r.pop.n), "💸 품삯 밀림 2");
  assert.equal(h.push("x", "wage", 2, 200).why, "owed");
  h.clear(); assert.equal(h.live.size, 0);
});

test("상한 숫자: 효과 시간·개수", () => {
  assert.ok(V.VF_MAX <= 6 && V.VF_FLY_MAX <= 3);
  assert.ok(V.VF_LIFE_MS < V.VF_SITE_GAP_MS, "한 공사장에 표시가 끊김 없이 붙어 뜨지 않게");
  assert.ok(V.VF_COUNT_MS <= 800 && V.VF_FLY_MS <= 800);
});
