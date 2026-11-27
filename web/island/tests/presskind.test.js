import { test } from "node:test";
import assert from "node:assert/strict";
import { pressKind, tapTool, TAP_PX, TAP_MS } from "../src/systems/pressKind.js";

test("문턱 숫자: 터치 10px · 마우스 5px · 500ms", () => {
  assert.equal(TAP_PX.touch, 10); assert.equal(TAP_PX.mouse, 5); assert.equal(TAP_MS, 500);
});
test("짧고 거의 안 움직였으면 tap", () => {
  assert.equal(pressKind({ dist: 0, ms: 80, pointer: "touch" }), "tap");
  assert.equal(pressKind({ dist: 10, ms: 500, pointer: "touch" }), "tap");      // 문턱 그대로는 tap
  assert.equal(pressKind({ dist: 5, ms: 120, pointer: "mouse" }), "tap");
});
test("문턱을 넘게 움직이면 drag(화면 옮기기) — 손을 떼도 자리를 고르지 않음", () => {
  assert.equal(pressKind({ dist: 10.5, ms: 100, pointer: "touch" }), "drag");
  assert.equal(pressKind({ dist: 6, ms: 100, pointer: "mouse" }), "drag");
  assert.equal(pressKind({ dist: 200, ms: 300, pointer: "touch" }), "drag");
});
test("오래 누르면(500ms 넘게) drag", () => {
  assert.equal(pressKind({ dist: 0, ms: 501, pointer: "touch" }), "drag");
  assert.equal(pressKind({ dist: 2, ms: 900, pointer: "mouse" }), "drag");
});
test("두 손가락이 닿았던 누르기는 언제나 drag", () => {
  assert.equal(pressKind({ dist: 0, ms: 50, pointer: "touch", multi: true }), "drag");
});
test("모르는 포인터는 터치 문턱", () => {
  assert.equal(pressKind({ dist: 8, ms: 100, pointer: "pen" }), "tap");
  assert.equal(pressKind({ dist: 8, ms: 100, pointer: "x" }), "tap");
});
test("톡 = 고르기 도구: 짓기·철거·지형지물 옮기기만", () => {
  assert.equal(tapTool("build"), true); assert.equal(tapTool("demolish"), true); assert.equal(tapTool("nature", "move"), true);
  for (const k of ["place", "decor", "clear", "dig", "fill"]) assert.equal(tapTool("nature", k), false);
  assert.equal(tapTool("paint"), false); assert.equal(tapTool("height"), false); assert.equal(tapTool("view"), false);
});
