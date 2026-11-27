// 판 3(오픈월드) 저장도 계정 저장 서버(deploy/island-save-v5/island-save.js checkIslandBody)의 모양 검사를 통과해야 함:
// version 정수 ≥ 1, grid.w·grid.h 정수 8~512. 서버 모듈은 운영 전용 모듈을 불러와 여기서 직접 못 부르므로 같은 조건을 옮겨 둠.
import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
test("판 3 저장의 grid에 서버 모양 검사용 w·h가 있음", () => {
  let s = 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const j = JSON.parse(JSON.stringify(World.create(7, rnd, { wild: true }).serialize()));
  assert.equal(j.version, 3);
  const g = j.grid;
  assert.ok(Number.isInteger(g.w) && Number.isInteger(g.h) && g.w >= 8 && g.h >= 8 && g.w <= 512 && g.h <= 512, `w·h=${g.w}·${g.h}`);
  assert.deepEqual([g.w, g.h], [g.box[2] - g.box[0], g.box[3] - g.box[1]]);
  assert.ok(World.fromJSON(j));
});
