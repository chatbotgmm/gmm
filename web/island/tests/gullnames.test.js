// 갈매미 이름(gullNames.js): 섬 씨앗으로 섞은 풀에서 겹치지 않게 고르고, 다 쓰면 "보리 2". 이름 규칙은 허용 목록.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GULL_NAMES, BANNED_NAMES, pickName, validName, nameOrder } from "../src/data/gullNames.js";

test("이름 고르기: 섬 씨앗마다 같은 차례 · 마을에 없는 이름 · 풀을 다 쓰면 숫자를 붙임", () => {
  assert.deepEqual(nameOrder(7), nameOrder(7)); assert.notDeepEqual(nameOrder(7), nameOrder(8));
  const taken = []; for (let i = 0; i < GULL_NAMES.length + 5; i++) taken.push(pickName(7, taken));
  assert.equal(new Set(taken).size, taken.length, "모두 다름");
  assert.ok(taken.slice(GULL_NAMES.length).every(n => / 2$/.test(n)), "다 쓰면 '○○ 2'");
  assert.ok(GULL_NAMES.every(n => !BANNED_NAMES.has(n)), "풀에 모습·직업 이름 없음");
  assert.ok(GULL_NAMES.every(n => validName(n).ok), "풀 이름은 모두 규칙에 맞음");
});

test("이름 규칙: 앞뒤 공백 자름 · 1~8자 · 한글/영문/숫자만 · 모습 이름 금지 · 겹침 금지", () => {
  assert.deepEqual(validName("  보  리 "), { ok: true, name: "보 리", reason: "" });
  assert.equal(validName("").ok, false); assert.equal(validName("   ").ok, false);
  assert.equal(validName("가나다라마바사아자").ok, false, "9자");
  assert.equal(validName("<b>x</b>").ok, false, "태그 글자");
  assert.equal(validName("a\nb").ok, true, "줄바꿈은 공백 하나로 다듬음");
  assert.equal(validName("a\u0007").ok, false, "제어 문자");
  assert.equal(validName("물방울").ok, false); assert.equal(validName("Gull-2").ok, true);
  assert.equal(validName("보리", ["보리"]).ok, false);
});
