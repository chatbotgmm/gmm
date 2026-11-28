// 갈매미 이름표 규칙(ui/nameTagRules.js): 보이기 갈래·거리에 따라 옅어짐·따라가기는 늘·건설 모드는 옅게·크기 범위·수 제한·겹침
import { test } from "node:test";
import assert from "node:assert/strict";
import { TAG_MODES, TAG_MODE_DEFAULT, TAG_FADE, TAG_SCALE, TAG_BUILD_DIM, tagMode, tagAlpha, tagScale, tagCap, tagText, pickTags } from "../src/ui/nameTagRules.js";
import { NEAR_VIEW } from "../src/systems/viewCam.js";

test("보이기 갈래: 가까이 볼 때(기본)·항상·끄기 — 모르는 값은 기본", () => {
  assert.deepEqual(TAG_MODES, ["near", "always", "off"]); assert.equal(TAG_MODE_DEFAULT, "near");
  assert.equal(tagMode("always"), "always"); assert.equal(tagMode(undefined), "near"); assert.equal(tagMode("<b>"), "near");
});

test("가까이 볼 때: 기본 시점(폰 30 m·넓은 화면 26 m, 머리까지 조금 더)은 다 보이고, 멀어지면 옅어지다 사라짐", () => {
  for (const d of [NEAR_VIEW.dist.portrait, NEAR_VIEW.dist.wide]) assert.equal(tagAlpha(d + 4, "near"), 1, `${d} m`);
  const [full, end] = TAG_FADE.near, mid = tagAlpha((full + end) / 2, "near");
  assert.ok(mid > 0.4 && mid < 0.6); assert.equal(tagAlpha(end, "near"), 0); assert.equal(tagAlpha(NEAR_VIEW.max + 5, "near"), 0, "가장 멀리 본 전체 보기에선 안 보임");
  assert.ok(tagAlpha(full + 1, "near") > tagAlpha(full + 5, "near"), "멀수록 옅게");
});

test("항상: 훨씬 멀리서도 보임 · 끄기: 따라가는 갈매미도 안 보임", () => {
  assert.equal(tagAlpha(62, "always"), 1); assert.equal(tagAlpha(62, "near"), 0); assert.equal(tagAlpha(TAG_FADE.always[1] + 1, "always"), 0);
  assert.equal(tagAlpha(5, "off"), 0); assert.equal(tagAlpha(5, "off", true), 0);
});

test("따라가는 갈매미는 멀어도 늘 보임 · 건설 모드는 지우지 않고 옅게", () => {
  assert.equal(tagAlpha(200, "near", true), 1);
  assert.equal(tagAlpha(10, "near", false, true), TAG_BUILD_DIM); assert.equal(tagAlpha(200, "near", true, true), TAG_BUILD_DIM);
  assert.ok(TAG_BUILD_DIM > 0.3 && TAG_BUILD_DIM < 0.8);
});

test("크기: 멀수록 작게, 범위 안에서만", () => {
  assert.equal(tagScale(0), TAG_SCALE[1]); assert.equal(tagScale(500), TAG_SCALE[0]);
  assert.ok(tagScale(20) > tagScale(40)); for (let d = 0; d < 120; d += 7) { const s = tagScale(d); assert.ok(s >= TAG_SCALE[0] && s <= TAG_SCALE[1]); }
});

test("글: 이름 그대로(HTML로 해석하지 않음 — 화면엔 textContent) · 너무 긴 이름은 자름 · 없으면 빈 글", () => {
  assert.equal(tagText({ name: " 모래 " }), "모래"); assert.equal(tagText({ name: "<img src=x onerror=1>" }), "<img src=x onerr");
  assert.equal(tagText({}), ""); assert.equal(tagText(null), ""); assert.equal(tagText({ name: 3 }), "");
  assert.equal(tagCap("portrait") < tagCap("wide"), true); assert.equal(tagCap("??"), tagCap("wide"));
});

const run = (cands, cap) => {
  const n = cands.length, A = k => Float32Array.from(cands, c => c[k] ?? 0);
  const order = new Int32Array(n), show = new Uint8Array(n), focus = Uint8Array.from(cands, c => c.f ? 1 : 0);
  const shown = pickTags(n, A("x"), A("y"), A("w"), A("h"), A("d"), focus, cap, order, show);
  return { shown, show: [...show] };
};

test("수 제한: 가까운 것부터 cap개", () => {
  const cands = Array.from({ length: 10 }, (_, i) => ({ x: i * 100, y: 300, w: 60, h: 18, d: 40 - i }));   // 서로 안 겹침 · 뒤로 갈수록 가까움
  const r = run(cands, 4); assert.equal(r.shown, 4); assert.deepEqual(r.show, [0, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
});

test("겹침: 화면에서 겹치면 가까운 쪽만 · 옆으로 비켜 있으면 둘 다 · 따라가는 갈매미는 멀어도 먼저", () => {
  assert.deepEqual(run([{ x: 100, y: 200, w: 60, h: 18, d: 30 }, { x: 120, y: 205, w: 60, h: 18, d: 20 }], 8).show, [0, 1]);
  assert.deepEqual(run([{ x: 100, y: 200, w: 60, h: 18, d: 30 }, { x: 200, y: 200, w: 60, h: 18, d: 20 }], 8).show, [1, 1]);
  assert.deepEqual(run([{ x: 100, y: 200, w: 60, h: 18, d: 30 }, { x: 100, y: 240, w: 60, h: 18, d: 20 }], 8).show, [1, 1], "위아래로 떨어지면 둘 다");
  assert.deepEqual(run([{ x: 100, y: 200, w: 60, h: 18, d: 45, f: 1 }, { x: 110, y: 200, w: 60, h: 18, d: 10 }], 8).show, [1, 0]);
  assert.equal(run([], 8).shown, 0);
});

test("남의 말풍선 밑의 이름표는 옅어짐(말풍선이 이김) · 제 말풍선은 안 가림 · 비켜 있으면 그대로", async () => {
  const { blockedBy } = await import("../src/ui/nameTagRules.js");
  const B = (...r) => r.map(v => Float32Array.from(v)), [x0, y0, x1, y1] = B([80], [150], [160], [190]), own = Int32Array.from([2]);
  assert.equal(blockedBy(100, 185, 50, 16, 1, 1, x0, y0, x1, y1, own), true);
  assert.equal(blockedBy(100, 185, 50, 16, 2, 1, x0, y0, x1, y1, own), false, "제 말풍선");
  assert.equal(blockedBy(300, 185, 50, 16, 1, 1, x0, y0, x1, y1, own), false, "옆");
  assert.equal(blockedBy(100, 240, 50, 16, 1, 1, x0, y0, x1, y1, own), false, "아래");
  assert.equal(blockedBy(100, 185, 50, 16, 1, 0, x0, y0, x1, y1, own), false, "가림 칸 없음");
});

test("남의 말풍선 밑이라 쉬는 이름표(skip)는 안 띄우고, 수·겹침 자리도 차지하지 않음", () => {
  const n = 3, F = a => Float32Array.from(a), order = new Int32Array(n), show = new Uint8Array(n);
  // 0: 가장 가깝지만 가려짐 · 1: 0과 겹침 · 2: 떨어져 있음 · cap 1
  const shown = pickTags(n, F([100, 110, 400]), F([200, 200, 200]), F([60, 60, 60]), F([18, 18, 18]), F([10, 20, 30]), new Uint8Array(n), 1, order, show, Uint8Array.from([1, 0, 0]));
  assert.equal(shown, 1); assert.deepEqual([...show], [0, 1, 0], "가린 0 대신 겹치던 1이 뜸(cap도 0이 먹지 않음)");
});
