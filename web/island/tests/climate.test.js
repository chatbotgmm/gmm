// 기온·체감·체온(climate.js) 시험: 설계 문서의 예시 숫자 그대로. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../src/world/climate.js";

const near = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;

test("공기 기온: 설계 예시 5개(시각을 알 때 4개 + 모를 때 1개)", () => {
  assert.equal(C.airTemp("winter", "snow", 1.0, 3), -6, "겨울 밤 3시 눈, 쌓인 눈 1.0");
  assert.equal(C.airTemp("winter", "clear", 0.55, 15), 2.9, "겨울 오후 3시 맑음, 눈 0.55");
  assert.equal(C.airTemp("summer", "clear", 0, 15), 32, "여름 오후 3시 맑음(땡볕 +2)");
  assert.equal(C.airTemp("autumn", "rain", 0, 6), 9.2, "가을 아침 6시 비");
  assert.equal(C.airTemp("spring", "clear", 0, null, false), 16, "봄 낮(시각 모름) 맑음");
  assert.equal(C.airTemp("spring", "clear", 0, null, true), 11, "봄 밤(시각 모름) −3");
  assert.equal(C.airTemp("winter", "clear", 0, null, null), 1, "낮밤을 모르면(시험) 하루 변화 0");
  assert.equal(C.airTemp(null, "storm", 1, 3, true), C.NEUTRAL_AIR, "계절을 모르면 늘 쾌적한 15°C");
  assert.equal(C.airTemp("summer", "clear", 0, null, true), 23, "여름 밤에는 땡볕 없음");
});

test("실내 기온: 바깥 −10~36°C에서 11~22.5°C로 늘 쾌적 범위(10~26), 체온 목표는 40", () => {
  assert.equal(C.indoorTemp(-6), 12); assert.equal(C.indoorTemp(32), 21.5); assert.equal(C.indoorTemp(-6, C.HEAT_POWER), 15, "전기 난방 +3");
  for (let t = -10; t <= 36; t += 0.5) { const i = C.indoorTemp(t); assert.ok(i >= C.COMFORT_LO && i <= C.COMFORT_HI, `${t} → ${i}`); assert.equal(C.bodyTarget(i), C.BODY_NORMAL); }
});

test("체감·체온 목표: 쾌적 범위 밖 1°C마다 0.15, 옷·일·종족 덤", () => {
  assert.equal(C.bodyTarget(18), 40); assert.ok(near(C.bodyTarget(-4), 37.9, 1e-9)); assert.ok(near(C.bodyTarget(34), 41.2, 1e-9));
  assert.equal(C.feelTemp(-6, { working: true }), -4, "일하는 중 +2");
  assert.equal(C.feelTemp(-6, { working: true, warmth: 12 }), 8, "목도리 4 + 외투 8");
  assert.equal(C.feelTemp(-6, { name: "불씨" }), -2); assert.equal(C.feelTemp(0, { name: "미니" }), -2); assert.equal(C.feelTemp(0, { name: "자이언트" }), 2);
  assert.ok(near(C.bodyTarget(C.feelTemp(-6, { working: true, warmth: 12 })), 39.7, 1e-9), "목도리+외투면 추워지지 않음(39.7 > 39.0)");
  assert.equal(C.bodyState(38.3), "freeze"); assert.equal(C.bodyState(39), "cold"); assert.equal(C.bodyState(39.01), null); assert.equal(C.bodyState(41), "hot");
});

test("체온 도달 시간: 겨울 밤 눈(옷 없음, 일하는 중) 추움 약 39초 · 꽁꽁 약 100초 · 실내에서 39.0 → 39.6 약 55초 · 여름 오후 더움 약 107초", () => {
  const tgt = C.bodyTarget(C.feelTemp(C.airTemp("winter", "snow", 1, 3), { working: true }));
  const cold = C.secsTo(40, tgt, C.COLD_AT), freeze = C.secsTo(40, tgt, C.FREEZE_AT), warm = C.secsTo(39, 40, C.WARM_DONE), hot = C.secsTo(40, C.bodyTarget(34), C.HOT_AT);
  assert.ok(near(cold, 38.8, 0.1), `추움 ${cold}`); assert.ok(near(freeze, 99.5, 0.2), `꽁꽁 ${freeze}`); assert.ok(near(warm, 55, 0.1), `녹기 ${warm}`); assert.ok(near(hot, 107.5, 0.2), `더움 ${hot}`);
  // stepBody를 0.1초씩 돌려도 같은 시간(±0.2초)
  let b = 40, t = 0; while (b > C.COLD_AT) { b = C.stepBody(b, tgt, 0.1); t += 0.1; } assert.ok(Math.abs(t - cold) < 0.2, `걸음 ${t}`);
  b = 40; t = 0; while (b > C.FREEZE_AT) { b = C.stepBody(b, tgt, 0.1, C.BODY_TAU); t += 0.1; } assert.ok(Math.abs(t - freeze) < 0.3, `걸음 ${t}`);
  assert.ok(C.secsTo(40, tgt, C.COLD_AT, C.bodyTau("미니")) < cold, "미니는 더 빨리 식음(시간 상수 40초)");
  assert.equal(C.secsTo(40, C.bodyTarget(C.feelTemp(-6, { working: true, warmth: 12 })), C.COLD_AT), Infinity, "옷을 다 입으면 추움에 닿지 않음");
  assert.equal(C.stepBody(40, 30, 1e9), 30, "큰 dt도 넘치지 않음");
});

test("계절을 모르거나 봄·여름·가을이면(시각 모름) 아무도 추워지지 않음(기존 규칙이 그대로 돌게). 더위는 표시만(규칙 효과는 2단계)", () => {
  for (const season of [null, "spring", "summer", "autumn"]) for (const w of ["clear", "cloudy", "rain", "storm", "snow"]) for (const night of [null, true, false]) for (const working of [false, true]) for (const name of ["기본", "미니", "불씨"]) {
    const t = C.bodyTarget(C.feelTemp(C.airTemp(season, w, 0, null, night), { working, name }));
    assert.ok(t > C.COLD_AT, `${season} ${w} ${night} ${working} ${name}: ${t}`);
    if (name !== "불씨") assert.ok(t < C.HOT_AT, `더위 ${season} ${w} ${night} ${working} ${name}: ${t}`);
  }
  assert.ok(C.bodyTarget(C.feelTemp(C.airTemp("summer", "clear", 0, null, false), { working: true, name: "불씨" })) > C.HOT_AT, "불씨(+4)는 여름 땡볕에 일하면 더워함(말풍선만)");
});
