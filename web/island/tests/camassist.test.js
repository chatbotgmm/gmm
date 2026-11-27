// 시점 편의(편의성 점검 1·3·9번): 따라가기 가까이 붙기 거리 · 갈매미 누르기 판정 반지름 · 마을 전체 보기 목표. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOME_OFF, HOME_TARGET, FOLLOW_NEAR, PICK_PX, followZoomLen, followBackLen, nearestOnScreen, ndcToScreen, overviewGoal, showOverviewBtn } from "../src/systems/camAssist.js";

test("따라가기 가까이: 멀면(83.8 m·72.2 m) 10 m로, 이미 가까우면 그대로", () => {
  assert.equal(followZoomLen(83.8), FOLLOW_NEAR); assert.equal(followZoomLen(72.2), 10);
  assert.equal(followZoomLen(12), null); assert.equal(followZoomLen(10), null);
});

test("돌아갈 거리: 처음 따라갈 때의 거리를 기억 · 다른 갈매미로 바꿔도 처음 거리 그대로 · 가까이 보던 중이면 기억 안 함", () => {
  assert.equal(followBackLen(null, 83.8), 83.8);
  assert.equal(followBackLen(83.8, 10), 83.8, "따라가는 중 다른 갈매미(이미 10 m)");
  assert.equal(followBackLen(null, 9), null);
});

test("누르기 판정: 반지름 안의 가장 가까운 갈매미 · 10·20 px 비켜도 잡힘 · 반지름 밖은 없음", () => {
  assert.ok(PICK_PX >= 24 && PICK_PX <= 32);
  const pts = [{ x: 100, y: 100, id: "a" }, { x: 130, y: 100, id: "b" }];
  assert.equal(nearestOnScreen(pts, 110, 100)?.id, "a");
  assert.equal(nearestOnScreen(pts, 120, 100)?.id, "b", "가까운 쪽");
  assert.equal(nearestOnScreen(pts, 100, 120)?.id, "a", "20 px 비켜 누름");
  assert.equal(nearestOnScreen(pts, 100, 140), null, "40 px 밖");
  assert.equal(nearestOnScreen([], 0, 0), null);
});

test("NDC → 화면 px: 가운데·모서리 · 카메라 뒤는 null", () => {
  const r = { left: 10, top: 20, width: 400, height: 800 };
  assert.deepEqual(ndcToScreen({ x: 0, y: 0, z: 0.5 }, r), { x: 210, y: 420 });
  assert.deepEqual(ndcToScreen({ x: -1, y: 1, z: 0.5 }, r), { x: 10, y: 20 });
  assert.equal(ndcToScreen({ x: 0, y: 0, z: 1.2 }, r), null);
});

test("마을 전체 보기: 처음 중심·높이·거리로(세로 83.8 m · 가로 72.2 m) · 보던 가로 방향은 그대로", () => {
  const p = overviewGoal({ x: 0, y: 3, z: 5 }, true);
  assert.deepEqual(p.target, HOME_TARGET); assert.deepEqual(p.off, { ...HOME_OFF.portrait });
  assert.ok(Math.abs(p.len - 83.8) < 0.1);
  const w = overviewGoal({ x: 0, y: 1, z: 1 }, false); assert.ok(Math.abs(w.len - 72.2) < 0.1);
  const side = overviewGoal({ x: -8, y: 2, z: 0 }, false);                     // 서쪽에서 보던 중
  assert.ok(Math.abs(side.off.x + 48) < 1e-9 && Math.abs(side.off.z) < 1e-9 && side.off.y === 54);
  const top = overviewGoal({ x: 0, y: 30, z: 0 }, false);                      // 바로 위에서(가로 방향 없음) → 처음 방향
  assert.deepEqual(top.off, { ...HOME_OFF.wide });
});

test("🏝 전체 보기 단추: 따라가거나 가까이 볼 때만 · 건설 모드·방 안에서는 숨김", () => {
  assert.equal(showOverviewBtn({ len: 83.8, following: false, portrait: true, mode: "view" }), false);
  assert.equal(showOverviewBtn({ len: 25, following: false, portrait: false, mode: "view" }), true);
  assert.equal(showOverviewBtn({ len: 83.8, following: true, portrait: true, mode: "view" }), true);
  assert.equal(showOverviewBtn({ len: 10, following: true, portrait: true, mode: "build" }), false);
  assert.equal(showOverviewBtn({ len: 10, following: true, portrait: true, mode: "view", inRoom: true }), false);
});
