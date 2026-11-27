// 바깥 세계 생성기(world/worldGen.js)·보기 격자(render/viewGrid.js) 시험. three 없이. node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { genChunk, cellAt, neighborArchipelago, islandsAround, WCH } from "../src/world/worldGen.js";
import { ViewGrid } from "../src/render/viewGrid.js";
import { SOFT } from "../src/world/chunkGrid.js";
import { generateWildIsland } from "../src/world/islandGen.js";
import { Grid } from "../src/world/Grid.js";
import { SEA_LEVEL } from "../src/config.js";

const fnv = c => { let h = 0x811c9dc5; for (const a of [c.elev, c.ground, c.sea]) for (const v of new Uint8Array(a.buffer)) h = Math.imul(h ^ v, 0x01000193); return (h >>> 0).toString(16); };

test("같은 씨앗·청크면 같은 배열(해시 고정: 생성 규칙을 바꾸면 GEN_WORLD_V를 올리고 이 값을 새로)", () => {
  const pinned = { "3,8": "9d74ff9", "2,8": "9675d1c5", "-27,-28": "d716770b", "-20,15": "8a65f7ba" };
  for (const [k, h] of Object.entries(pinned)) {
    const [cx, cz] = k.split(",").map(Number), a = genChunk(7, cx, cz), b = genChunk(7, cx, cz);
    assert.deepEqual(a.elev, b.elev); assert.deepEqual(a.ground, b.ground); assert.deepEqual(a.sea, b.sea);
    assert.equal(fnv(a), h, `청크 ${k}`);
  }
  assert.notEqual(fnv(genChunk(8, -27, -28)), fnv(genChunk(7, -27, -28)), "씨앗이 다르면 다른 세계");
});

test("청크·칸막이 경계: 청크가 계산한 값 = 둘레 5×5 칸막이를 다 보고 따로 잰 값(음수 좌표 포함), 경계에서 높이가 튀지 않음", () => {
  let cells = 0, landCells = 0;
  // 칸막이 경계(192의 배수)를 걸치는 곳: 음수 쪽 섬 무리와 양수 쪽, 그리고 시작 섬 이웃 군도(씨앗 7은 서쪽, x ≈ −42)
  const regions = [[-30, -24, -31, -26], [-4, 0, 1, 5], [5, 7, 5, 7], [11, 13, -7, -5]];
  for (const [ax, bx, az, bz] of regions) for (let cz = az; cz <= bz; cz++) for (let cx = ax; cx <= bx; cx++) {
    const c = genChunk(7, cx, cz);
    for (let i = 0; i < WCH * WCH; i++) {
      const x = cx * WCH + (i & 31), z = cz * WCH + (i >> 5), v = cellAt(7, x, z, 2);
      assert.equal(c.elev[i], v.elev, `높이 ${x},${z}`); assert.equal(c.ground[i], v.ground, `바닥 ${x},${z}`); assert.equal(c.sea[i], v.sea);
      cells++; if (c.elev[i] >= -200) landCells++;
    }
  }
  assert.ok(landCells > 500, `땅이 있는 곳을 봄(${landCells}/${cells})`);
  // 이음매: 청크 경계를 넘는 이웃 칸 높이 차의 최대가 청크 안 이웃 칸 차의 최대보다 크지 않음
  const v = new ViewGrid(new Grid(192, 192), 7); let inside = 0, across = 0;
  for (let z = -31 * 32; z < -26 * 32; z++) for (let x = -30 * 32; x < -24 * 32; x++) {
    const d = Math.abs(v.elev(x + 1, z) - v.elev(x, z)), e = Math.abs(v.elev(x, z + 1) - v.elev(x, z));
    if ((x & 31) === 31) across = Math.max(across, d); else inside = Math.max(inside, d);
    if ((z & 31) === 31) across = Math.max(across, e); else inside = Math.max(inside, e);
  }
  assert.ok(across <= inside, `경계 ${across} ≤ 안쪽 ${inside}`);
});

test("시작 섬 상자(둘레 2칸 포함) 안에는 바깥 섬이 없다: 생성 값이 모두 깊은 바다(−1.0) → 192 테두리와 이음매 없이 붙음", () => {
  for (const seed of [7, 1, 2, 42, 123456]) {
    for (let cz = -1; cz <= 6; cz++) for (let cx = -1; cx <= 6; cx++) {
      const c = genChunk(seed, cx, cz);
      for (let i = 0; i < WCH * WCH; i++) {
        const x = cx * WCH + (i & 31), z = cz * WCH + (i >> 5);
        if (x >= -2 && x < 194 && z >= -2 && z < 194) assert.equal(c.elev[i], -1000, `씨앗 ${seed} 칸 ${x},${z}`);
      }
    }
    for (const I of islandsAround(seed, 96, 96)) assert.ok(I.bx1 < -2 || I.bx0 > 194 || I.bz1 < -2 || I.bz0 > 194, "섬 상자가 시작 섬 상자와 안 겹침");
  }
});

test("이웃 군도: 시작 섬 해안에서 40~60칸, 다른 바깥 땅은 그보다 가깝지 않다(40칸 이상)", () => {
  for (const seed of [7, 1, 2]) {
    const g = generateWildIsland(seed).grid, L = (x, z) => g.inBounds(x, z) && g.get(x, z).elevation >= SEA_LEVEL, coast = [];
    for (let z = 0; z < 192; z++) for (let x = 0; x < 192; x++) if (L(x, z) && (!L(x + 1, z) || !L(x - 1, z) || !L(x, z + 1) || !L(x, z - 1))) coast.push([x, z]);
    const nb = neighborArchipelago(seed).islands; let nbMin = Infinity, anyMin = Infinity;
    for (let cz = -5; cz <= 10; cz++) for (let cx = -5; cx <= 10; cx++) {
      const c = genChunk(seed, cx, cz); if (!c.land) continue;
      for (let i = 0; i < WCH * WCH; i++) {
        if (c.elev[i] < -200) continue;
        const x = cx * WCH + (i & 31), z = cz * WCH + (i >> 5);
        let m = Infinity; for (const [lx, lz] of coast) { const d = Math.sqrt((lx - x) ** 2 + (lz - z) ** 2); if (d < m) m = d; }
        anyMin = Math.min(anyMin, m);
        if (nb.some(I => x >= I.bx0 && x <= I.bx1 && z >= I.bz0 && z <= I.bz1)) nbMin = Math.min(nbMin, m);
      }
    }
    assert.ok(nbMin >= 40 && nbMin <= 60, `씨앗 ${seed}: 이웃 군도 ${nbMin.toFixed(1)}칸`);
    assert.ok(anyMin >= 40, `씨앗 ${seed}: 가장 가까운 바깥 땅 ${anyMin.toFixed(1)}칸`);
  }
});

test("높이는 모두 1/1000의 배수(Int16 ×1000)이고, 물 판정이 정수 경계와 같다(Float32처럼 −0.2가 뒤집히지 않음)", () => {
  const v = new ViewGrid(new Grid(192, 192), 7);
  for (const [cx, cz] of [[-27, -28], [-26, -28], [-3, 2], [-2, 3]]) {
    const c = genChunk(7, cx, cz);
    for (let i = 0; i < WCH * WCH; i++) {
      const x = cx * WCH + (i & 31), z = cz * WCH + (i >> 5), e = v.get(x, z).elevation;
      assert.equal(Math.round(e * 1000), e * 1000); assert.equal(e * 1000, c.elev[i]);
      assert.equal(v.isWater(x, z), c.elev[i] < -200); assert.equal(v.elev(x, z), e);
    }
  }
  assert.ok(-200 / 1000 >= SEA_LEVEL && Math.fround(-0.2) < SEA_LEVEL, "double로 풀면 해수면 칸은 땅, Float32였다면 물이 됐을 것");
});

test("보기 격자: 시작 섬 안은 world.grid 칸 그대로, 밖은 생성, get은 null이 없고 칸 번호는 Smi", () => {
  const inner = new Grid(192, 192); inner.get(5, 5).elevation = 0.25;
  const v = new ViewGrid(inner, 7);
  assert.equal(v.get(5, 5), inner.get(5, 5)); assert.equal(v.elev(5, 5), 0.25);
  for (const [x, z] of [[-1, 0], [192, 191], [-600, -600], [SOFT + 5, 0], [-SOFT - 9, 3], [1e7, -1e7]]) assert.ok(v.get(x, z), `${x},${z}`);
  assert.ok(v.inBounds(-SOFT, SOFT - 1) && !v.inBounds(SOFT, 0) && !v.inBounds(0, -SOFT - 1));
  const idx = v.index(SOFT - 1, SOFT - 1); assert.ok(idx < 2 ** 30 && v.index(-SOFT, -SOFT) === 0, "Smi 범위");
  const seen = new Set(); for (let z = -40; z <= 40; z++) for (let x = -40; x <= 40; x++) seen.add(v.index(x, z));
  assert.equal(seen.size, 81 * 81, "음수 칸 번호가 다른 칸과 겹치지 않음");
  assert.equal(v.chunk, 16); assert.ok(v.innerPiece(0, 0) && v.innerPiece(11, 11) && !v.innerPiece(12, 0) && !v.innerPiece(-1, 3));
  inner.markDirty(5, 5); assert.ok(v.takeDirty().length > 0, "더러운 조각은 world.grid에서");
  // LRU: 데이터 청크 수가 한도를 넘지 않음
  const small = new ViewGrid(inner, 7, { dataChunks: 8, cellChunks: 2 });
  for (let k = 0; k < 40; k++) small.get(-1000 + k * 32, 500);
  assert.ok(small.data.size <= 8 && small.cells.size <= 2);
  assert.equal(small.get(-1000, 500).elevation, v.get(-1000, 500).elevation, "내렸다 다시 올린 청크도 같은 값");
});

test("바다뿐인 조각 판정: 섬 둘레 12칸까지는 메쉬를 만들고, 먼 바다만 뺀다", () => {
  const v = new ViewGrid(new Grid(192, 192), 7);
  assert.equal(v.seaOnlyPiece(-3, 6), false, "이웃 군도(서쪽 x ≈ −42) 조각");
  assert.equal(v.seaOnlyPiece(0, 0), false, "시작 섬 상자에 걸린 조각은 늘 그림");
  let sea = 0, n = 0; for (let pz = -40; pz < -20; pz++) for (let px = 20; px < 40; px++) { n++; if (v.seaOnlyPiece(px, pz)) sea++; }
  assert.ok(sea > n / 2, `먼 바다 조각 대부분은 메쉬 없음(${sea}/${n})`);
});

test("물 깊이 창: 32칸 타일로 읽은 값 = 칸마다 읽은 값(시작 섬 상자 걸침·음수 좌표), 먼 바다는 1.6 m 넘음(불투명)", async () => {
  const { waterDepths, DIST_CAP } = await import("../src/render/waterWindow.js");
  const { WATER_Y } = await import("../src/config.js");
  const v = new ViewGrid(generateWildIsland(7).grid, 7), x0 = -100, z0 = -60, W = 192, data = waterDepths(v, x0, z0, W);
  // 느린 기준: 칸마다 elev + 같은 BFS
  const el = [], dist = new Array(W * W).fill(-1), q = [];
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) { const e = v.elev(x0 + x, z0 + z); el.push(e); if (e >= -0.6) { dist[z * W + x] = 0; q.push(z * W + x); } }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, z = (i - x) / W; if (dist[i] >= DIST_CAP) continue;
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) if (nx >= 0 && nz >= 0 && nx < W && nz < W && dist[nz * W + nx] < 0) { dist[nz * W + nx] = dist[i] + 1; q.push(nz * W + nx); } }
  for (let i = 0; i < W * W; i++) { const d = Math.max(0, Math.min(3, WATER_Y - el[i] + (dist[i] < 0 ? DIST_CAP : dist[i]) * 0.07)); assert.equal(data[i], Math.round(d / 3 * 255)); }
  assert.ok(data[0] / 255 * 3 > 1.6, "먼 바다 칸");
});
