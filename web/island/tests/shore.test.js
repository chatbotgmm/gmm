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

test("물가 창(보기 격자): 시작 섬 안은 shoreData와 같고, 섬 안 연못은 창이 걸쳐도 파도 0, 바깥 생성 섬 해변에도 파도", async () => {
  const { ViewGrid } = await import("../src/render/viewGrid.js");
  const { shoreWindow } = await import("../src/render/waterWindow.js");
  const g = makeGrid(), v = new ViewGrid(g, 7);
  const r = shoreData(g), w = shoreWindow(v, -12, -12, 64);
  for (let z = 0; z < 40; z++) for (let x = 0; x < 40; x++) {
    const i = z * 40 + x, j = (z + 12) * 64 + x + 12;
    if (z < 20 || z > 30 || x < 10 || x > 29) continue;                            // 시작 섬 땅 쪽(지도 밖과 8칸 안은 창이 실제 바깥 바다를 봐서 다름)
    assert.equal(w.data[j * 4 + 1], r.data[i * 4 + 1], `G ${x},${z}`); assert.equal(w.data[j * 4 + 2], r.data[i * 4 + 2], `B ${x},${z}`);
  }
  assert.equal(w.data[((32 + 12) * 64 + 20 + 12) * 4 + 3], 0, "연못 파도 0");
  const w2 = shoreWindow(v, 20 - 2, 31 - 1, 64);                                   // 창 가장자리가 연못을 지나도 연못은 바다가 아님
  assert.equal(w2.data[((32 - 30) * 64 + 2) * 4 + 3], 0, "창 끝에 걸친 연못도 파도 0");
  // 바깥 생성 섬(씨앗 7 이웃 군도, 시작 섬 서쪽): 모래 해변 앞바다에 파도
  const v7 = new ViewGrid(new Grid(192, 192), 7), x0 = -160, z0 = -32, W = 256, o = shoreWindow(v7, x0, z0, W);
  let beach = 0; for (let i = 0; i < W * W; i++) if (o.sd[i] < 0 && o.sd[i] > -2 && o.data[i * 4 + 2] && o.data[i * 4 + 3] > 200) beach++;
  assert.ok(beach > 50, `바깥 섬 모래 해변 앞 파도 칸 ${beach}`);
});
