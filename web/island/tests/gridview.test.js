// 건설 모드 격자선(▦ 격자): 보일지 판정 · 저장값 읽기/쓰기(DOM 없이). node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridShown, readGridPref, saveGridPref, GRID_PREF_KEY } from "../src/ui/gridView.js";

test("gridShown: 건설 모드(view가 아닌 모든 도구) + 켜짐 + 방이 아닐 때만", () => {
  for (const mode of ["build", "paint", "height", "nature", "demolish"]) assert.equal(gridShown({ mode, on: true, room: false }), true, mode);
  assert.equal(gridShown({ mode: "view", on: true, room: false }), false, "평소 화면엔 안 보임");
  assert.equal(gridShown({ mode: "build", on: false, room: false }), false, "토글 끄면 안 보임");
  assert.equal(gridShown({ mode: "build", on: true, room: true }), false, "방 화면엔 안 보임");
  assert.equal(gridShown({ mode: "paint" }), true, "토글 값이 없으면 켜짐으로 봄");
  assert.equal(gridShown({ mode: undefined, on: true }), false, "도구가 아직 없으면(불러오는 중) 안 보임");
  assert.equal(gridShown({ mode: "", on: true }), false);
  assert.equal(gridShown(), false);
});

test("readGridPref: 처음(null)·켜짐은 true, 'off'만 false, 읽다 예외가 나도 켜짐", () => {
  const store = new Map(), get = k => store.get(k) ?? null;
  assert.equal(readGridPref(get), true, "처음엔 켜짐");
  store.set(GRID_PREF_KEY, "off"); assert.equal(readGridPref(get), false);
  store.set(GRID_PREF_KEY, "on"); assert.equal(readGridPref(get), true);
  store.set(GRID_PREF_KEY, "이상한 값"); assert.equal(readGridPref(get), true, "모르는 값은 켜짐");
  assert.equal(readGridPref(() => { throw new Error("SecurityError"); }), true, "저장소를 못 쓰는 곳(사생활 보호 창)");
});

test("saveGridPref: 쓰고 다시 읽으면 같은 값, 쓰기 예외는 false로 조용히", () => {
  const store = new Map(), set = (k, v) => store.set(k, v), get = k => store.get(k) ?? null;
  assert.equal(saveGridPref(set, false), true); assert.equal(readGridPref(get), false);
  assert.equal(saveGridPref(set, true), true); assert.equal(readGridPref(get), true);
  assert.equal(saveGridPref(() => { throw new Error("QuotaExceeded"); }, false), false);
});
