// 「처음이에요」 말풍선 규칙(편의성 점검 13번): 몇 초 뒤 접힘 · 건설 모드·방 안에서는 숨김. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { COACH_FOLD_MS, momentShowable, pickMoment, momentFolded } from "../src/ui/coachRules.js";

test("보일 곳: 선물·입질 안내는 둘러보기에서만, 방 안내는 방 안에서만", () => {
  assert.equal(momentShowable("gift", {}), true);
  assert.equal(momentShowable("gift", { editMode: true }), false);
  assert.equal(momentShowable("tug", { inRoom: true }), false);
  assert.equal(momentShowable("room", { inRoom: true }), true);
  assert.equal(momentShowable("room", {}), false);
});

test("대기열: 보일 수 없는 안내는 건너뛰고 다음 것을(방 안에서 선물 안내가 방 안내를 막지 않음)", () => {
  assert.equal(pickMoment(["gift", "room"], { inRoom: true }), "room");
  assert.equal(pickMoment(["gift", "tug"], { editMode: true }), null);
  assert.equal(pickMoment(["tug", "gift"], {}), "tug");
});

test("접힘: 처음 보인 뒤 몇 초(2~10초) 지나면 · 펼쳐 두기를 누른 안내는 안 접음", () => {
  assert.ok(COACH_FOLD_MS >= 2000 && COACH_FOLD_MS <= 10000);
  assert.equal(momentFolded(1000, 1000 + COACH_FOLD_MS - 1), false);
  assert.equal(momentFolded(1000, 1000 + COACH_FOLD_MS), true);
  assert.equal(momentFolded(1000, 1000 + COACH_FOLD_MS * 3, true), false);
  assert.equal(momentFolded(null, 99999), false);
});
