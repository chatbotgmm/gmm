// 바다 물가 자료(world/shore.js): 해안선 거리 부호 · 모래사장/바위 해안 구분 · 바다와 이어진 물만 파도 · 쓸려 올라오는 물 판 칸
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../src/world/Grid.js";
import { shoreData, swashCells, SD_SCALE } from "../src/world/shore.js";

/** 40×40: 위쪽 절반은 바다, 아래 절반은 땅. 땅의 바닷가 2줄은 모래(-0.15), 그 안은 잔디(0). x ≥ 30은 바위 절벽(1.0)이 바다에 바로 닿음.
 *  땅 한가운데(20,32)에 3×3 연못. */
function makeGrid() {
  const g = new Grid(40, 40, 8);
  for (let z = 0; z < 40; z++) for (let x = 0; x < 40; x++) {
    const c = g.get(x, z);
    if (z < 20) { c.elevation = -0.6; c.groundType = "Sand"; }
    else if (x >= 30) { c.elevation = 1.0; c.groundType = "Rock"; }
    else if (z < 22) { c.elevation = -0.15; c.groundType = "Sand"; }
    else { c.elevation = 0; c.groundType = "Grass"; }
  }
  for (let z = 31; z < 34; z++) for (let x = 19; x < 22; x++) { const c = g.get(x, z); c.elevation = -0.5; c.groundType = "Dirt"; }
  return g;
}
const at = (r, g, x, z) => { const i = z * g.w + x; return { R: r.data[i * 4], sd: (r.data[i * 4 + 1] - 128) / SD_SCALE, B: r.data[i * 4 + 2], A: r.data[i * 4 + 3] }; };

test("물가 자료: 해안선 거리는 땅 +, 물 −, 맞닿은 두 칸이 ±0.5", () => {
  const g = makeGrid(), r = shoreData(g);
  assert.equal(at(r, g, 10, 20).sd, 0.5);
  assert.equal(at(r, g, 10, 19).sd, -0.5);
  assert.equal(at(r, g, 10, 16).sd, -3.5);
  assert.equal(at(r, g, 10, 23).sd, 3.5);
  assert.ok(at(r, g, 10, 19).R > 0 && at(r, g, 10, 20).R === 0, "물 칸만 깊이가 있음");
});

test("물가 자료: 모래사장 앞바다는 B=255, 바위 절벽 앞바다는 0", () => {
  const g = makeGrid(), r = shoreData(g);
  assert.equal(at(r, g, 10, 18).B, 255);
  assert.equal(at(r, g, 36, 18).B, 0);
});

test("물가 자료: 탁 트인 바다는 파도 세기 최대, 섬 안 연못은 0", () => {
  const g = makeGrid(), r = shoreData(g);
  assert.equal(at(r, g, 10, 19).A, 255);
  assert.equal(at(r, g, 20, 32).A, 0);
  assert.equal(at(r, g, 10, 20).A, 255, "모래 칸은 가장 가까운 바닷물의 세기");
});

test("물가 자료: 좁은 물길(폭 1칸)은 바다와 이어져도 파도가 약함", () => {
  const g = makeGrid();
  for (let z = 20; z < 36; z++) { const c = g.get(12, z); c.elevation = -0.5; }   // 바다에서 땅 안으로 1칸 물길
  const r = shoreData(g);
  assert.ok(at(r, g, 12, 32).A < 30, `물길 안쪽 세기 ${at(r, g, 12, 32).A}`);
});

test("쓸려 올라오는 물 판: 모래사장 물가 땅·물 칸만, 바위 해안·연못·안쪽 잔디는 없음", () => {
  const g = makeGrid(), r = shoreData(g), pick = swashCells(g, r.data, r.sd), on = (x, z) => pick[z * g.w + x] === 1;
  assert.ok(on(10, 20) && on(10, 21) && on(10, 19), "모래 두 줄 + 앞 물 칸");
  assert.ok(!on(10, 18) && !on(10, 23), "먼 물·안쪽 땅은 없음");
  assert.ok(!on(35, 20) && !on(35, 19), "바위 절벽 해안은 없음");
  assert.ok(!on(20, 32) && !on(20, 30), "연못은 없음");
});
