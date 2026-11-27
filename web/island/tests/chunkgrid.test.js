// 오픈월드 1-B·2단계: 끝없는 시뮬 격자(ChunkGrid) · 청크 사이 덩어리·길찾기 · 바깥 섬 걷기·짓기 · 저장 델타·예전 저장 옮기기
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { Grid } from "../src/world/Grid.js";
import { ChunkGrid } from "../src/world/chunkGrid.js";
import { CompLabels } from "../src/world/chunkComps.js";
import { generateWildIsland } from "../src/world/islandGen.js";
import { findPath } from "../src/world/pathfinding.js";
import { neighborArchipelago, genChunk, WCH } from "../src/world/worldGen.js";
import { encodeBase, decodeBase } from "../src/world/saveDelta.js";
import { GROUND_TYPES } from "../src/data/types.js";
import { BUILDINGS } from "../src/data/catalog.js";
import { seededRandom } from "../src/util.js";

const wild = (seed = 1) => { const w = World.create(7, seededRandom(seed), { wild: true, firstGull: true }); w.instantBuild = true; w.isNight = false; return w; };
const cellsEq = (a, b) => Math.round(a.elevation * 1000) === Math.round(b.elevation * 1000) && a.groundType === b.groundType;
/** 씨앗 7 이웃 군도 본섬(시작 섬 서쪽)의 걸을 수 있는 평지 칸 하나: 가운데에서 가까운 순 */
function outerSpot(w, need = 1) {
  const I = neighborArchipelago(7).islands[0], g = w.grid;
  for (let r = 0; r < 14; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = Math.floor(I.x) + dx, z = Math.floor(I.z) + dz; let ok = true;
    for (let a = 0; a < need && ok; a++) for (let b = 0; b < need && ok; b++) { const c = g.get(x + a, z + b); ok = !!c && c.elevation === 0 && c.groundType === "Grass" && !c.occupiedId && g.isWalkable(x + a, z + b); }
    if (ok) return [x, z];
  }
  return null;
}

test("ChunkGrid: 같은 씨앗이면 만지는 순서와 상관없이 같은 칸 · 내렸다 다시 올린 청크도 같음 · 올리기·내리기는 version을 안 바꿈", () => {
  const a = new ChunkGrid(7), b = new ChunkGrid(7, { lruMax: 4 });
  const pts = []; for (let i = 0; i < 400; i++) pts.push([Math.floor(Math.sin(i * 7.1) * 900), Math.floor(Math.cos(i * 3.3) * 900)]);
  const v0 = b.version;
  for (const [x, z] of pts) a.get(x, z);
  for (const [x, z] of [...pts].reverse()) b.get(x, z);
  assert.ok(b.evicts > 50, `작은 LRU라 많이 내림(${b.evicts})`); assert.ok(b.loadedCount <= 4 + 1);
  for (const [x, z] of pts) assert.ok(cellsEq(a.get(x, z), b.get(x, z)), `${x},${z}`);
  assert.equal(b.version, v0, "청크를 올리고 내려도 version 그대로");
  // 생성기 값과 같음(Int16 ×1000 → double, Float32 반올림 없음)
  const d = genChunk(7, -2, 3), c = a.get(-2 * WCH + 5, 3 * WCH + 7), i = 7 * WCH + 5;
  assert.equal(c.elevation, d.elev[i] / 1000); assert.equal(c.groundType, GROUND_TYPES[d.ground[i]]);
  // 칸 번호는 Smi(2^30 아래) · 좌표로 되돌아옴
  for (const [x, z] of [[0, 0], [-16384, -16384], [16383, 16383], [-1, 5], [191, -33]]) { const k = a.index(x, z); assert.ok(k >= 0 && k < 2 ** 30); assert.deepEqual([a.xOf(k), a.zOf(k)], [x, z]); }
  assert.equal(a.get(16384, 0), null, "소프트 한계 밖은 지도 밖"); assert.equal(a.inBounds(-16385, 0), false);
});

test("시작 섬: Grid(192)와 ChunkGrid가 같은 길찾기·같은 덩어리 나눔", () => {
  const g = generateWildIsland(7).grid, cg = ChunkGrid.fromStart(7, g), r = seededRandom(4);
  for (let z = 0; z < 192; z += 7) for (let x = 0; x < 192; x += 5) assert.ok(cellsEq(g.get(x, z), cg.get(x, z)));
  const land = []; for (let z = 0; z < 192; z++) for (let x = 0; x < 192; x++) if (g.isWalkable(x, z)) land.push([x, z]);
  const A = new CompLabels(g), B = new CompLabels(cg);
  for (let k = 0; k < 60; k++) {
    const [ax, az] = land[Math.floor(r() * land.length)], [bx, bz] = land[Math.floor(r() * land.length)];
    assert.equal(A.at(ax, az) === A.at(bx, bz), B.at(ax, az) === B.at(bx, bz), "같은 덩어리인지가 같음");
    const p = findPath(g, ax, az, bx, bz, 30000), q = findPath(cg, ax, az, bx, bz, 30000);
    assert.deepEqual(q, p, `길 ${ax},${az} → ${bx},${bz}`);
  }
});

test("청크 경계를 넘는 길·덩어리: 바깥 섬 안에서 여러 청크를 지나는 길, 안 가 본 곳도 compAt이 −1이 아님(배 길로 빠지지 않음)", () => {
  const w = wild(), g = w.grid, I = neighborArchipelago(7).islands[0];
  const land = []; for (let z = Math.floor(I.z - I.r); z <= I.z + I.r; z++) for (let x = Math.floor(I.x - I.r); x <= I.x + I.r; x++) if (g.isWalkable(x, z)) land.push([x, z]);
  assert.ok(land.length > 500, `바깥 섬 땅 ${land.length}칸`);
  const a = land[0], b = land[land.length - 1], p = findPath(g, a[0], a[1], b[0], b[1], 30000);
  assert.ok(p && p.length > 20, "바깥 섬을 가로지르는 길");
  const chunksOn = new Set(p.map(([x, z]) => `${x >> 5},${z >> 5}`)); assert.ok(chunksOn.size >= 2, `청크 ${chunksOn.size}개를 지남`);
  const k = w.compAt(a[0], a[1]); assert.ok(k >= 0); assert.equal(w.compAt(b[0], b[1]), k, "같은 섬 = 같은 덩어리");
  assert.notEqual(k, w.compAt(w.bankB().door.x, w.bankB().door.z), "시작 섬과는 따로(바다)");
  const far = new ChunkGrid(7); assert.equal(new CompLabels(far).at(a[0], a[1]) >= 0, true, "처음 만지는 청크도 답이 있음");
});

test("카메라·도구가 어디를 만지든(바깥 청크를 올렸다 내렸다) 시뮬 결과가 같음", () => {
  const run = (poke) => {
    const w = wild(9); w.addUnitByName("목수"); w.addUnitByName("물방울"); if (poke) w.grid.lruMax = 3;
    for (let i = 0; i < 1500; i++) {
      if (poke) for (let k = 0; k < 6; k++) w.grid.get(((i * 37 + k * 211) % 1400) - 700, ((i * 53 + k * 97) % 1400) - 700);   // 보는 곳·마우스가 먼 바다를 지나감
      w.update(0.1);
    }
    return w.units.map(u => [u.name, u.x.toFixed(4), u.z.toFixed(4), u.state]);
  };
  assert.deepEqual(run(true), run(false));
});

test("바깥 섬에 짓기·칠하기·파기: 청크가 상주하고, 다리로 이으면 갈매미가 걸어가 그 섬을 돌아다님", () => {
  const w = wild(), g = w.grid; w.bank.vault = 10000; w.res.wood = 999; w.addUnitByName("목수");   // 다리는 목수가 있어야 지음
  const s = outerSpot(w, 6); assert.ok(s, "바깥 섬 평지");
  const r = w.placeBuilding("house", s[0], s[1], 0); assert.ok(r.ok, r.reason); const h = r.building;
  assert.ok(g.isResidentChunk(s[0] >> 5, s[1] >> 5), "지은 청크는 상주");
  assert.ok(w.paint(s[0] - 2, s[1], "Cobble"), "칠하기"); assert.equal(g.get(s[0] - 2, s[1]).groundType, "Cobble");
  // 시작 섬 서쪽 해안 → 바깥 섬 동쪽 해안: 같은 줄(z)의 물 칸에 다리
  const z = h.door.z; let x1 = null; for (let x = 120; x > 0; x--) if (g.isWalkable(x, z) && !g.isWalkable(x - 1, z) && g.isWater(x - 1, z)) { x1 = x; break; }
  assert.ok(x1 !== null, "시작 섬 서쪽 해안");
  let x0 = x1 - 1; while (g.isWater(x0, z) && x0 > -200) x0--;
  assert.ok(x0 > -60, `바다 건너 바깥 섬(${x0})`);
  for (let x = x0 + 1; x < x1; x++) { const rb = w.placeBuilding("bridge", x, z, 0); assert.ok(rb.ok, `다리 ${x} ${rb.reason}`); }
  const home = w.compAt(w.bankB().door.x, w.bankB().door.z); assert.equal(w.compAt(h.door.x, h.door.z), home, "다리로 이어진 한 덩어리");
  assert.ok(findPath(g, w.bankB().door.x, w.bankB().door.z, h.door.x, h.door.z, 30000), "은행 문 → 바깥 섬 집 문 길");
  // 갈매미를 바깥 섬 집 문 앞에 내려놓고 마을을 돌리면, 바깥 섬 칸 위를 걸어 다님(물에 빠지거나 −1 덩어리에 갇히지 않음)
  const u = w.units[0]; assert.ok(w.pickUpUnit(u)); assert.ok(w.dropUnit(u, h.door.x, h.door.z + 1).ok || w.dropUnit(u, h.door.x, h.door.z).ok);
  const seen = new Set(); let outer = 0;
  for (let t = 0; t < 120; t += 0.1) { w.update(0.1); if (u.insideBuildingId) continue; const cx = Math.floor(u.x), cz = Math.floor(u.z); seen.add(`${cx},${cz}`); if (cx < 0) outer++;
    assert.ok(g.isWalkable(cx, cz) || u.swimming || u.sailing, `걸을 수 있는 칸 ${cx},${cz}`); }
  assert.ok(outer > 50 && seen.size > 5, `바깥 섬에서 움직임(칸 ${seen.size}, 바깥 ${outer}틱)`);
  // 파기: 바깥 섬 칸도 파고 메움
  const d = outerSpot(w, 3); assert.ok(w.digCell(d[0] + 1, d[1] + 1).ok, "바깥 섬 파기"); assert.ok(g.isWater(d[0] + 1, d[1] + 1));
});

test("저장 델타 왕복: 바깥 섬·시작 섬에서 바꾼 칸·지은 것이 그대로, 다시 저장해도 같은 격자 칸", () => {
  const w = wild(); w.bank.vault = 10000; w.res.wood = 999;
  const s = outerSpot(w, 6); assert.ok(w.placeBuilding("house", s[0], s[1], 0).ok);
  w.paint(s[0] - 2, s[1] + 1, "WoodDeck"); w.grid.setElevation(s[0] - 3, s[1] + 4, 0.25);
  const c = w.center; w.paint(Math.floor(c.x) + 7, Math.floor(c.z) + 9, "Dirt");
  const far = [3000, -2500]; w.grid.setGround(far[0], far[1], "Rock"); w.grid.setElevation(far[0], far[1], 0.123);   // 아주 먼 바다 칸
  const j = JSON.parse(JSON.stringify(w.serialize(1)));
  assert.equal(j.version, 3); assert.equal(j.grid.kind, "chunks"); assert.equal(j.grid.genV, 1); assert.equal(j.grid.seed, 7); assert.ok(j.grid.n >= 4 && j.grid.n < 50, `바뀐 칸 ${j.grid.n}`);
  assert.deepEqual(j.grid.genOff, []); assert.equal(j.grid.grid, undefined);
  const b = World.fromJSON(j, seededRandom(2));
  for (const [x, z] of [[s[0] - 2, s[1] + 1], [s[0] - 3, s[1] + 4], [Math.floor(c.x) + 7, Math.floor(c.z) + 9], far]) assert.ok(cellsEq(w.grid.get(x, z), b.grid.get(x, z)), `${x},${z}`);
  assert.equal(b.grid.get(far[0], far[1]).elevation, 0.123);
  const hb = [...b.buildings.values()].find(o => o.x === s[0] && o.z === s[1]); assert.ok(hb && BUILDINGS[hb.defId].house, "바깥 섬 집");
  assert.equal(b.grid.get(s[0], s[1]).occupiedId, hb.id);
  for (let z = 0; z < 192; z += 3) for (let x = 0; x < 192; x += 3) assert.ok(cellsEq(w.grid.get(x, z), b.grid.get(x, z)));
  const j2 = JSON.parse(JSON.stringify(b.serialize(1))); assert.deepEqual(j2.grid, j.grid, "다시 저장해도 같은 격자 칸");
  // 시작 섬 기준(base) 반복 줄임은 그대로 풀림
  const be = new Int16Array([5, 5, 5, -1000, -1000, 0, 32767, -32768]), bg = new Uint8Array([0, 0, 1, 4, 4, 4, 2, 2]), back = decodeBase(encodeBase(be, bg), 8);
  assert.deepEqual([...back.be], [...be]); assert.deepEqual([...back.bg], [...bg]);
  assert.throws(() => World.fromJSON({ ...j, grid: { ...j.grid, genV: 99 } }), /새 판/);
});

test("예전 저장(판 2, 192칸 격자 전체) → 판 3으로 옮김: 칸·건물 그대로, 바깥은 씨앗으로", () => {
  const w = wild(); w.bank.vault = 1000; const c = w.center; w.paint(Math.floor(c.x) + 5, Math.floor(c.z) + 6, "Cobble");
  const old = JSON.parse(JSON.stringify(w.serialize(1))), g = new Grid(192, 192);
  for (let z = 0; z < 192; z++) for (let x = 0; x < 192; x++) { const a = w.grid.get(x, z), o = g.get(x, z); o.elevation = a.elevation; o.groundType = a.groundType; }
  old.version = 2; old.grid = g.serialize();                                        // 예전 판 2 모양
  const m = World.fromJSON(old, seededRandom(3));
  assert.ok(m.grid instanceof ChunkGrid); assert.deepEqual(m.grid.box, { x0: 0, z0: 0, x1: 192, z1: 192 });
  for (let z = 0; z < 192; z += 2) for (let x = 0; x < 192; x += 2) assert.ok(cellsEq(w.grid.get(x, z), m.grid.get(x, z)), `${x},${z}`);
  assert.equal(m.buildings.size, w.buildings.size); assert.ok(m.grid.get(-40, 96).elevation === w.grid.get(-40, 96).elevation, "바깥은 같은 씨앗으로");
  const j3 = m.serialize(1); assert.equal(j3.version, 3); assert.equal(j3.grid.n, 0, "옮긴 직후 바뀐 칸 없음(그 격자가 기준)");
  const again = World.fromJSON(JSON.parse(JSON.stringify(j3)));
  assert.ok(cellsEq(again.grid.get(Math.floor(c.x) + 5, Math.floor(c.z) + 6), { elevation: 0, groundType: "Cobble" }) || again.grid.get(Math.floor(c.x) + 5, Math.floor(c.z) + 6).groundType === "Cobble");
  // 옛 작은 섬(64칸, 시험 받침)은 계속 Grid
  const small = World.create(7, seededRandom(1)); assert.ok(small.grid instanceof Grid); assert.equal(small.serialize(1).version, 2);
  assert.ok(World.fromJSON(JSON.parse(JSON.stringify(small.serialize(1)))).grid instanceof Grid);
});

test("보기 격자 + 시뮬 격자: 올라온 시뮬 칸은 같은 객체(바꾸면 바로 보임), 안 올라온 곳은 만들지 않고 생성 값 · 바깥 조각 다시 그리기는 outerDirty로", async () => {
  const { ViewGrid } = await import("../src/render/viewGrid.js");
  const w = wild(), g = w.grid, v = new ViewGrid(g, 7); g.takeDirty();
  const n0 = g.loadedCount, far = [900, -700];
  assert.ok(cellsEq(v.get(...far), new ChunkGrid(7).get(...far))); assert.equal(g.loadedCount, n0, "보기는 시뮬 청크를 만들지 않음");
  const s = outerSpot(w, 1); assert.equal(v.get(...s), g.get(...s), "올라온 칸은 같은 객체");
  assert.ok(w.paint(s[0], s[1], "Cobble")); assert.equal(v.get(...s).groundType, "Cobble");
  assert.deepEqual(v.takeDirty(), [], "시작 섬 조각은 없음"); assert.ok(v.outerDirty.has(`${Math.floor(s[0] / 16)},${Math.floor(s[1] / 16)}`), "바깥 조각은 outerDirty");
  const c = w.center; w.paint(Math.floor(c.x) + 7, Math.floor(c.z) + 9, "Dirt"); assert.ok(v.takeDirty().length > 0, "시작 섬 조각은 GroundChunks로");
  assert.equal(v.innerPiece(0, 0), true); assert.equal(v.innerPiece(-1, 0), false); assert.equal(v.innerPiece(11, 11), true); assert.equal(v.innerPiece(12, 3), false);
});

test("LRU가 꽉 찬 뒤 처음 만진 청크에 지어도(차지·칠하기) 사라지지 않음 — 막 만든 청크가 바로 내려가던 것", () => {
  const g = new ChunkGrid(7, { lruMax: 4 });
  for (let i = 0; i < 6; i++) g.get(1000 + i * 32, 1000);                          // LRU를 채움(먼 바다)
  g.occupy([[2001, 2000]], "B", { kind: "building" });                             // 처음 만지는 청크에 차지
  assert.ok(g.loadedChunk(2001 >> 5, 2000 >> 5), "올라온 청크 목록에 있음"); assert.ok(g.isResidentChunk(2001 >> 5, 2000 >> 5), "상주");
  g.get(0, 0); for (let i = 0; i < 6; i++) g.get(-1000 - i * 32, -1000);
  assert.equal(g.get(2001, 2000).occupiedId, "B", "다른 곳을 오가도 차지가 남음");
  for (let i = 0; i < 6; i++) g.get(1000 + i * 32, 3000);
  g.setGround(2500, 2500, "Rock"); for (let i = 0; i < 6; i++) g.get(-3000 - i * 32, 0);
  assert.equal(g.get(2500, 2500).groundType, "Rock", "칠한 칸도 남음");
});

test("반짝이 후보: 바깥 섬을 칠했다 되돌리거나 지었다 헐어도, 저장해서 다시 불러온 섬과 같은 후보", async () => {
  const { sparkleCells } = await import("../src/world/sparkles.js");
  const w = wild(); w.bank.vault = 10000; w.res.wood = 999;
  const s = outerSpot(w, 6), sand = []; for (let dz = -40; dz <= 40 && sand.length < 1; dz++) for (let dx = -40; dx <= 40; dx++) { const c = w.grid.get(s[0] + dx, s[1] + dz); if (c.groundType === "Sand" && c.elevation >= 0 && !c.occupiedId) { sand.push([s[0] + dx, s[1] + dz]); break; } }
  assert.ok(sand.length, "바깥 섬 모래");
  const [x, z] = sand[0]; assert.ok(w.grid.setGround(x, z, "Grass")); assert.ok(w.grid.setGround(x, z, "Sand"));   // 칠했다 되돌림
  const before = sparkleCells(w), b = World.fromJSON(JSON.parse(JSON.stringify(w.serialize(1))), seededRandom(2)), after = sparkleCells(b);
  assert.deepEqual(after, before);
});
