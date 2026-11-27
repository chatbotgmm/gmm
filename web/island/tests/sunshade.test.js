// 햇빛 쉐이딩: 그림자 범위(반경·텍셀 맞춤)·빛 높이 누르기·툰 그늘색 (src/render/sunShadow.js · src/render/dayKeys.js)
import test from "node:test";
import assert from "node:assert/strict";
import { shadowRadius, lightAxes, snapToTexels, needsRecenter, ahead } from "../src/render/sunShadow.js";
import { lightElev, shadeTint, dayLook, SHADE } from "../src/render/dayKeys.js";

const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test("그림자 반경: 가까이 26 m(전과 같음 — 비스듬한 근경에서 먼 나무 그림자가 사라지지 않게), 멀어질수록 4 m 단위로 넓게, 상한 36 m(원경 프레임 비용)", () => {
  assert.equal(shadowRadius(5), 26);
  assert.equal(shadowRadius(28.5), 26);                                            // 기본 근경(높이 15 m · 비스듬히)
  assert.equal(shadowRadius(40), 28);                                              // 40 × 0.62 = 24.8 → 28
  assert.equal(shadowRadius(80), 36);
  assert.equal(shadowRadius(80, 52), 52);
  for (let d = 2; d < 120; d += 0.37) { const r = shadowRadius(d); assert.ok(r === 26 || r % 4 === 0); assert.ok(r >= shadowRadius(d - 0.37)); }
});

test("그림자 카메라 축: three.js lookAt과 같은 직교 기저(가로는 수평)", () => {
  for (const d of [norm([-0.6, 0.55, 0.32]), norm([0.1, 0.9, -0.4]), norm([0, 0.07, 1])]) {
    const { x, y } = lightAxes(d);
    assert.ok(Math.abs(dot(x, x) - 1) < 1e-9 && Math.abs(dot(y, y) - 1) < 1e-9);
    assert.ok(Math.abs(dot(x, y)) < 1e-9 && Math.abs(dot(x, d)) < 1e-9 && Math.abs(dot(y, d)) < 1e-9);
    assert.equal(x[1], 0);
    assert.ok(y[1] > 0, "세로 축은 위쪽");
  }
});

test("텍셀 맞춤: 그림자 평면 좌표가 텍셀의 정수배, 해 방향(깊이)으로는 안 움직이고 반 텍셀 넘게 안 옮김", () => {
  const d = norm([-0.5, 0.62, 0.4]), texel = 2 * 26 / 2048, { x, y } = lightAxes(d);
  for (const p of [[3.3, 0, -7.1], [-41.77, 0, 12.05], [0.01, 0, 0.02]]) {
    const q = snapToTexels(p, d, texel), dq = q.map((v, i) => v - p[i]);
    for (const ax of [x, y]) { const u = dot(q, ax) / texel; assert.ok(Math.abs(u - Math.round(u)) < 1e-6); }
    assert.ok(Math.abs(dot(dq, d)) < 1e-9);
    assert.ok(Math.hypot(...dq) <= texel * Math.SQRT1_2 + 1e-9);
  }
});

test("그림자 중심은 보는 곳이 step m 넘게 벗어날 때만 옮김", () => {
  assert.equal(needsRecenter(null, [0, 0, 0], 2), true);
  assert.equal(needsRecenter([0, 0, 0], [1.2, 0, 1.2], 2), false);
  assert.equal(needsRecenter([0, 0, 0], [1.5, 0, 1.5], 2), true);
});

test("빛 높이: 30°까지 그대로, 그 위는 눌러서 한여름 정오도 50° 아래(단조 증가·이어짐)", () => {
  assert.equal(lightElev(10), 10); assert.equal(lightElev(30), 30);
  assert.ok(lightElev(76) < 50 && lightElev(52) < 40);
  for (let e = -10; e < 80; e += 0.5) assert.ok(lightElev(e + 0.5) > lightElev(e));
});

test("툰 그늘색: 낮엔 서늘한 파랑(파랑 > 빨강), 밝기(휘도)는 SHADE 근처", () => {
  const k = dayLook(40, 180), c = shadeTint(k, 0), lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(c[2] > c[1] && c[1] > c[0], "낮 그늘은 푸르스름");
  assert.ok(Math.abs(lum - SHADE) < 1e-6);
  const sun = [k[6], k[7], k[8]]; assert.ok(sun[0] > sun[2], "햇빛은 따뜻함(빨강 > 파랑)");
  const night = shadeTint(dayLook(-30, 0), 1); assert.ok(night[2] > night[0] && night.every(v => v >= 0));
});

test("그림자 중심 앞당기기: 비스듬히 보면 시선 쪽으로 반경의 30%까지, 내려다보면 거의 그대로", () => {
  const a = ahead([0, 0, 0], [0, 15, 24], 26);                                      // 북쪽(-z)을 비스듬히 봄
  assert.ok(a[2] < -6 && a[2] > -7.8 && Math.abs(a[0]) < 1e-9 && a[1] === 0);
  const b = ahead([5, 0, 5], [5, 60, 6], 30);                                       // 거의 바로 위
  assert.ok(Math.hypot(b[0] - 5, b[2] - 5) < 0.2);
});
