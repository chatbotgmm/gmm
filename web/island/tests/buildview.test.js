// 건설 확인창·갤러리 카드의 설계비·금고(ui/buildView.js, 순수 — DOM 없이 HTML 글만 봄)
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { BUILDINGS } from "../src/data/catalog.js";
import { checkPlacement } from "../src/world/placement.js";
import { planInfo, bridgeInfo, planHtml, cardMeta, MONEY_HINT } from "../src/ui/buildView.js";

const fresh = () => { const w = World.create(7, seededRandom(3), { wild: true }); w.summon(); return w; };   // 건축가 한 마리
const spotFor = (w, d) => { const c = w.center;
  for (let r = 4; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + 6 + Math.cos(a) * r), z = Math.floor(c.z + 9 + Math.sin(a) * r);
    if (checkPlacement(w.grid, BUILDINGS[d], x, z, 0, w.units).ok) return [x, z]; }
  return null; };

test("확인창: 금고 60에서 작은 집 → 설계비 10 · 금고 60 → 50, 지을 수 있음", () => {
  const w = fresh(); w.bank.vault = 60; const [x, z] = spotFor(w, "house"), r = w.check("house", x, z, 0);   // 금고 60일 때의 확인창 글(새 섬 시작 금고와 상관없이)
  assert.ok(r.ok, r.reason); const info = planInfo(w, "house", r);
  assert.deepEqual([info.fee, info.vault, info.after, info.ok], [10, 60, 50, true]);
  const html = planHtml(info);
  assert.match(html, /설계비 <b>🪙10<\/b>/); assert.match(html, /금고 🪙60 → <b>🪙50<\/b>/); assert.doesNotMatch(html, /착공 불가/);
  assert.match(html, /🔨 건축가/); assert.match(html, /다 지으면 🪙\d+에 팔려요/);
  assert.ok(info.mats.length >= 1 && info.mats.every(([, n, have]) => n > 0 && have >= 0), "공사 끝까지 드는 재료 + 창고에 있는 수");
});

test("확인창: 금고가 모자라면 '착공 불가' + 모자란 만큼 + 돈 안내, 금고 줄엔 '→' 없음(자리 까닭은 그대로)", () => {
  const w = fresh(); w.bank.vault = 5; const [x, z] = spotFor(w, "cottage"), r = w.check("cottage", x, z, 0);
  assert.equal(r.ok, false); const info = planInfo(w, "cottage", r);
  assert.equal(info.moneyShort, true); const html = planHtml(info);
  assert.match(html, /🚫 착공 불가/); assert.match(html, /금고가 🪙10 모자라요/, "모자란 만큼(15 − 5)"); assert.ok(html.includes(MONEY_HINT));
  assert.match(r.reason, /설계비 🪙15 · 금고 🪙5/, "자세한 까닭(check)은 상태 줄에");
  assert.doesNotMatch(html, /→/);
  // 자리 때문에 못 지으면 돈 안내는 없음
  const bad = planInfo(w, "house", { ok: false, reason: "물 위에는 지을 수 없어요" });
  assert.equal(bad.moneyShort, false); assert.ok(!planHtml(bad).includes(MONEY_HINT)); assert.match(planHtml(bad), /착공 불가<\/b> · 물 위에는 지을 수 없어요/, "자리 까닭은 그대로");
});

test("확인창: 집이 모자라고 금고가 바닥이면 작은 집은 설계비 0과 그 까닭(은행이 대신 냄)", () => {
  const w = fresh(); w.bank.vault = 5; const [x, z] = spotFor(w, "house"), r = w.check("house", x, z, 0);
  assert.ok(r.ok, r.reason); const info = planInfo(w, "house", r);
  assert.equal(info.fee, 0); assert.match(planHtml(info), /설계비 🪙0: 집이 모자라 은행이 대신 내요/);
});

test("다리 줄: 칸마다 설계비 — 금고가 모자라면 앞 k칸만, 한 칸도 못 내면 착공 불가", () => {
  const w = fresh(), fee = w.feeFor("bridge"); assert.ok(fee > 0);
  w.bank.vault = fee * 3; let b = bridgeInfo(w, 5, 5);
  assert.deepEqual([b.n, b.k, b.total, b.after, b.ok], [5, 3, fee * 3, 0, true]); assert.match(planHtml(b), /앞 3칸만 놓여요/);
  w.bank.vault = 0; b = bridgeInfo(w, 0, 5); assert.equal(b.ok, false); assert.equal(b.moneyShort, true); assert.match(planHtml(b), /착공 불가/);
  w.bank.vault = 50; b = bridgeInfo(w, 0, 0); assert.equal(b.ok, false); assert.equal(b.moneyShort, false); assert.match(planHtml(b), /놓을 수 있는 물 칸이 없어요/);
});

test("갤러리 카드: 메뉴 건물 모두 설계비 = world.feeFor, 금고보다 비싸면 short(빨간 숫자)", () => {
  const w = fresh(), defs = Object.values(BUILDINGS).filter(d => d.menu !== false);
  assert.ok(defs.length >= 20);
  for (const d of defs) { const m = cardMeta(w, d); assert.equal(m.fee, w.feeFor(d.id), d.id); assert.ok(m.html.includes(`🪙${m.fee}`), d.id); assert.equal(m.short, m.fee > 60, d.id); }
  w.bank.vault = 12; assert.equal(cardMeta(w, BUILDINGS.cottage).short, true); assert.match(cardMeta(w, BUILDINGS.cottage).html, /fee-short/);
  // 예전 섬(경제 없음): 재료만
  const old = World.create(7, seededRandom(3), {}); if (!old.economy) assert.doesNotMatch(cardMeta(old, BUILDINGS.house).html, /🪙/);
});
