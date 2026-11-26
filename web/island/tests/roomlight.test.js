// 방 조명 판정(render/roomLight.js — 바깥 시간대 × 집 전기 → 빛 세기·색) 시험. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { roomLight, roomLux, roomPhase, ROOM_KEYS, ROOM_DARK_WHY, ROOM_DARK_AT } from "../src/render/roomLight.js";
import { POWER_RANGE } from "../src/world/power.js";

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test("낮: 전기와 무관하게 전에 늘 쓰던 값(하늘빛 1.1 + 햇빛 1.6), 스탠드 꺼짐, 까닭 안 띄움", () => {
  for (const p of [0, 1]) {
    const o = roomLight(0, p);
    assert.equal(o.hemi, 1.1); assert.equal(o.keyI, 1.6); assert.equal(o.lamp, 0); assert.equal(o.dark, false);
    assert.deepEqual(o.sky, ROOM_KEYS.day.sky); assert.equal(o.winI, 0.35);
  }
});

test("밤 + 전기: 실내등이 켜져 낮의 85% 넘게 밝고 따뜻한 색(빨강 > 파랑), 스탠드 켜짐", () => {
  const o = roomLight(1, 1), day = roomLux(roomLight(0, 1));
  assert.equal(o.lamp, 1); assert.equal(o.dark, false);
  assert.ok(roomLux(o) / day > 0.85, `밝기 비 ${roomLux(o) / day}`);
  assert.ok(o.key[0] > o.key[2] * 1.5 && o.sky[0] > o.sky[2], "따뜻한 빛");
});

test("밤 + 전기 없음: 푸른 달빛만(낮의 10~25%), 스탠드 꺼짐, 까닭 한 줄", () => {
  const o = roomLight(1, 0), r = roomLux(o) / roomLux(roomLight(0, 0));
  assert.equal(o.lamp, 0); assert.equal(o.dark, true);
  assert.ok(r > 0.1 && r < 0.25, `밝기 비 ${r}`);                                   // 아주 깜깜하진 않게(10% 넘게), 확실히 어둡게(25% 밑)
  assert.ok(o.key[2] > o.key[0] && o.sky[2] > o.sky[0], "푸른 빛");
  assert.ok(o.winI > ROOM_KEYS.day.winI, "창(밤하늘)이 방에서 가장 밝은 곳 중 하나");
});

test("저녁(어스름)은 낮과 밤 사이, 전기 없으면 까닭은 어둠이 ROOM_DARK_AT를 넘을 때부터", () => {
  const lux = (g, p) => roomLux(roomLight(g, p));
  for (const p of [0, 1]) for (let g = 0; g < 1; g += 0.1) assert.ok(lux(g + 0.1, p) <= lux(g, p) + 1e-9, `어둠이 늘면 밝기가 줄거나 같음 g=${g} p=${p}`);
  assert.equal(roomLight(ROOM_DARK_AT - 0.01, 0).dark, false); assert.equal(roomLight(ROOM_DARK_AT, 0).dark, true);
  assert.equal(roomLight(0.5, 1).dark, false);
});

test("전기가 바뀌는 동안(부드럽게 0→1) 값이 이어짐, 범위 밖·이상한 입력은 0~1로", () => {
  const a = roomLight(1, 0.5);
  assert.ok(near(a.hemi, (ROOM_KEYS.moon.hemi + ROOM_KEYS.lamp.hemi) / 2)); assert.ok(near(a.lamp, 0.5));
  assert.deepEqual(roomLight(2, -1), roomLight(1, 0)); assert.deepEqual(roomLight(NaN, undefined), roomLight(0, 0));
});

test("out 객체를 다시 씀(매 프레임 새 객체 없음)", () => {
  const out = roomLight(0, 0), again = roomLight(1, 1, out);
  assert.equal(again, out); assert.equal(out.lamp, 1);
});

test("시간대 이름은 섬 시계 아이콘과 같은 기준, 까닭 문장에 풍차 범위 칸 수", () => {
  assert.equal(roomPhase(30), "day"); assert.equal(roomPhase(6.1), "day"); assert.equal(roomPhase(6), "dusk"); assert.equal(roomPhase(-1), "dusk"); assert.equal(roomPhase(-2), "night"); assert.equal(roomPhase(-15), "night");
  assert.ok(ROOM_DARK_WHY.includes(`${POWER_RANGE}칸`) && ROOM_DARK_WHY.startsWith("⚡"));
});
