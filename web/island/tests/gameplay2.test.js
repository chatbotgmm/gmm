// 게임성 묶음 2 시험: 단차 채광·재료 한번에 모아 짓기·밭 물주기·작물 자라는 시간. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { Grid } from "../src/world/Grid.js";
import { seededRandom } from "../src/util.js";
import { MAX_STEP } from "../src/config.js";
import { interactNear, workCells } from "../src/units/unitBrain.js";

/** 왼쪽(x<12) 0 m, 오른쪽(x≥12) 0.5 m(두 단 = 절벽). ramp면 맨 위 줄(z=0)에 한 단씩 오르는 비탈을 둠. 대상(광석·나무)은 아래층 (11,12) */
function cliffWorld(kind, ramp) {
  const g = new Grid(24, 24, 24);
  for (let z = 0; z < 24; z++) for (let x = 0; x < 24; x++) { g.get(x, z).groundType = "Grass"; g.get(x, z).elevation = x >= 12 ? 0.5 : 0; }
  if (ramp) g.get(12, 0).elevation = 0.25;
  const w = new World(g, [{ id: "m1", defId: kind, cells: [[11, 12]] }], seededRandom(3)); w.isNight = false;
  w.addUnitByName("기본"); const u = w.units[0]; u.x = 13.5; u.z = 12.5; u.y = 0.5; u.full = 90;
  return { w, g, u, t: (kind === "ore" ? w.ores : w.trees)[0] };
}
test("단차 채광: 절벽 위(0.5 m)에서 아래층(0 m) 광석·나무는 못 캐고, 같은 높이 칸까지 길이 있으면 그 칸에서 캔다", () => {
  for (const kind of ["ore", "tree"]) {
    const a = cliffWorld(kind, false);
    assert.equal(workCells(a.g, 11, 12).some(([x]) => x >= 12), false, "절벽 위 칸은 일하는 칸이 아님");
    let hits = 0; a.w.on(kind === "ore" ? "oreHit" : "treeHit", () => hits++);
    assert.equal(interactNear(a.u, a.w, seededRandom(1), 3), null, `${kind}: 아래층으로 가는 길이 없으면 못 함`);
    for (let i = 0; i < 400; i++) { a.u.full = 90; a.w.update(0.05); }
    assert.equal(hits, 0, `${kind}: 절벽 위에서 캐지 않음`);
    const b = cliffWorld(kind, true); let diff = 0, hb = 0;   // 비탈로 내려갈 수 있으면 아래층 이웃 칸에서
    b.w.on(kind === "ore" ? "oreHit" : "treeHit", () => { hb++; diff = Math.max(diff, Math.abs(b.g.walkHeight(Math.floor(b.u.x), Math.floor(b.u.z)) - 0)); });
    assert.equal(interactNear(b.u, b.w, seededRandom(1), 3)?.kind, kind === "ore" ? "mine" : "chop");
    for (let i = 0; i < 1600 && hb === 0; i++) { b.u.full = 90; b.w.update(0.05); }
    for (let i = 0; i < 100; i++) { b.u.full = 90; b.w.update(0.05); }
    assert.ok(hb > 0, `${kind}: 내려가서 캠`); assert.ok(diff <= MAX_STEP + 1e-6, `${kind}: 서서 캔 칸 높이 차 ${diff}`);
  }
});
