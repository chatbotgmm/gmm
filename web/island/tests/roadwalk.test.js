// 길 위로 다니기: 포장 칸으로 들어가는 걸음 값이 싸서(pathfinding.js ROAD_COST) 조금 돌아가더라도 길로 가고,
// 산책 목적지를 둘레 포장 칸 쪽으로 고름(unitBrain.js STROLL_ROAD). 길이 없으면 예전과 똑같음.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../src/world/Grid.js";
import { findPath, ROAD_COST, ROAD_H } from "../src/world/pathfinding.js";
import { smoothPath, setIdle, _pokeApi, STROLL_ROAD, ROAD_SAY, SAME_BUBBLE_DAY, strollRoad } from "../src/units/unitBrain.js";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { GroundType } from "../src/data/types.js";

const roadRow = (g, z, x0, x1) => { const s = new Set(); for (let x = x0; x <= x1; x++) s.add(g.index(x, z)); return s; };
const onRoad = (g, s, p) => p.filter(([x, z]) => s.has(g.index(x, z))).length;
const len = (sx, sz, p) => { let L = 0, px = sx, pz = sz; for (const [x, z] of p) { L += x !== px && z !== pz ? Math.SQRT2 : 1; px = x; pz = z; } return L; };
/** 길의 모든 걸음이 걸을 수 있는 칸으로, 턱·모서리 가로지르기 없이 한 칸씩 */
function assertLegal(g, sx, sz, p) {
  let px = sx, pz = sz;
  for (const [x, z] of p) {
    assert.ok(Math.abs(x - px) <= 1 && Math.abs(z - pz) <= 1, `한 칸씩 ${px},${pz}→${x},${z}`);
    assert.ok(g.isWalkable(x, z) && g.canStep(px, pz, x, z), `막힌 칸 ${x},${z}`);
    if (x !== px && z !== pz) assert.ok(g.canStep(px, pz, x, pz) && g.canStep(px, pz, px, z), `모서리 가로지르기 ${x},${z}`);
    px = x; pz = z;
  }
}

test("값: 포장 칸 걸음 값 0.55~0.7배, 어림값 배수는 그 값과 1 사이(길로 돌아가는 길도 찾되 넓게 훑지 않게)", () => {
  assert.ok(ROAD_COST >= 0.55 && ROAD_COST <= 0.7);
  assert.ok(ROAD_H > ROAD_COST && ROAD_H < 1, "h × ROAD_H: 가장 싼 길의 ROAD_H/ROAD_COST배 안");
  assert.ok(STROLL_ROAD > 0.3 && STROLL_ROAD < 0.9, "산책 일부만 길로(다양함 유지)");
});

test("길찾기: 곧은 길에서 3칸 옆 돌길은 타고(조금 돌아감), 12칸 떨어진 돌길은 안 탐", () => {
  const g = new Grid(44, 30, 44), sx = 3, sz = 8, gx = 40, gz = 8;
  const straight = findPath(g, sx, sz, gx, gz, 30000);
  const near = roadRow(g, 11, 0, 43), p = findPath(g, sx, sz, gx, gz, 30000, near);
  assert.ok(onRoad(g, near, p) >= 25, `3칸 옆 길 위로 ${onRoad(g, near, p)}칸`);
  assert.ok(len(sx, sz, p) <= len(sx, sz, straight) + 4, `돌아가는 거리는 조금(${len(sx, sz, p).toFixed(1)} / 곧게 ${len(sx, sz, straight).toFixed(1)})`);
  const far = roadRow(g, 20, 0, 43), q = findPath(g, sx, sz, gx, gz, 30000, far);
  assert.equal(onRoad(g, far, q), 0, "멀리 돌아가야 하면 곧게"); assert.equal(len(sx, sz, q), len(sx, sz, straight));
  // 길이 바로 곧은 줄 위에 있으면 그대로 그 길
  const on = roadRow(g, 8, 0, 43), r = findPath(g, sx, sz, gx, gz, 30000, on);
  assert.equal(onRoad(g, on, r), r.length);
});

test("길찾기: 포장 칸 모음에 막힌 칸(바다·벽)이 섞여 있어도 막힌 칸은 절대 안 지나고 모서리도 안 가로지름", () => {
  const g = new Grid(30, 30, 30), r = seededRandom(9);
  for (let i = 0; i < 160; i++) g.get(Math.floor(r() * 30), Math.floor(r() * 30)).elevation = -1;   // 바다 점점이
  for (let z = 0; z < 24; z++) g.get(15, z).elevation = -1;                                           // 바다 벽(아래로만 열림)
  const paved = new Set(); for (let z = 0; z < 30; z++) for (let x = 0; x < 30; x++) if ((x + z) % 3 === 0 || z === 26 || x === 15) paved.add(g.index(x, z));   // 막힌 칸도 일부러 넣음
  let found = 0;
  for (let k = 0; k < 60; k++) {
    const sx = Math.floor(r() * 14), sz = Math.floor(r() * 30), gx = 16 + Math.floor(r() * 14), gz = Math.floor(r() * 30);
    if (!g.isWalkable(sx, sz)) continue;
    const p = findPath(g, sx, sz, gx, gz, 30000, paved); if (!p) continue; found++;
    assertLegal(g, sx, sz, p); assert.deepEqual(p.at(-1), [gx, gz]);
    const s = smoothPath(g, sx, sz, p, paved);                                                       // 다듬은 길도 직선 구간마다 바다 없음
    let [px, pz] = [sx, sz];
    for (const [x, z] of s) { for (let i = 0; i <= 30; i++) { const cx = Math.floor(px + 0.5 + (x - px) * i / 30), cz = Math.floor(pz + 0.5 + (z - pz) * i / 30); assert.ok(g.isWalkable(cx, cz), `${cx},${cz}`); } [px, pz] = [x, z]; }
  }
  assert.ok(found >= 20, `찾은 길 ${found}`);
});

test("길이 없으면 예전과 똑같음: 포장 칸 없음·빈 모음·멀리 떨어진 길 → 같은 칸 목록, 다듬기도 같음", () => {
  const g = new Grid(48, 48, 48), r = seededRandom(3);
  for (let i = 0; i < 300; i++) g.get(Math.floor(r() * 48), Math.floor(r() * 48)).elevation = -1;
  for (let i = 0; i < 80; i++) g.get(Math.floor(r() * 48), Math.floor(r() * 48)).elevation = 0.8;      // 높은 턱(한 단 넘음)
  const farAway = new Set([g.index(47, 47)]);                                                          // 출발·도착 둘레(+여유) 밖 한 칸
  let n = 0;
  for (let k = 0; k < 120; k++) {
    const sx = Math.floor(r() * 12), sz = Math.floor(r() * 12), gx = Math.floor(r() * 12), gz = Math.floor(r() * 12);
    if (!g.isWalkable(sx, sz)) continue;
    const a = findPath(g, sx, sz, gx, gz, 30000);
    assert.deepEqual(findPath(g, sx, sz, gx, gz, 30000, null), a);
    assert.deepEqual(findPath(g, sx, sz, gx, gz, 30000, new Set()), a);
    assert.deepEqual(findPath(g, sx, sz, gx, gz, 30000, farAway), a, "길 네모가 멀면 셈하지 않음");
    if (a) { n++; assert.deepEqual(smoothPath(g, sx, sz, a, new Map()), smoothPath(g, sx, sz, a)); assert.deepEqual(smoothPath(g, sx, sz, a, farAway), smoothPath(g, sx, sz, a)); }
  }
  assert.ok(n >= 30, `견준 길 ${n}`);
});

test("길 다듬기: 길로 돌아온 구간을 풀밭 지름길로 다시 펴지 않음(ㄱ자 길 모퉁이를 지남)", () => {
  const g = new Grid(30, 30, 30), paved = new Set();
  for (let x = 2; x <= 22; x++) paved.add(g.index(x, 4));
  for (let z = 4; z <= 22; z++) paved.add(g.index(22, z));
  const raw = findPath(g, 2, 4, 22, 22, 30000, paved);
  assert.equal(onRoad(g, paved, raw), raw.length, "길만 따라감");
  const plain = smoothPath(g, 2, 4, raw), kept = smoothPath(g, 2, 4, raw, paved);
  const corner = ([x, z]) => Math.abs(x - 22) <= 1 && Math.abs(z - 4) <= 1;
  assert.ok(!plain.some(corner), `길을 모르면 모퉁이를 크게 가로지름: ${JSON.stringify(plain)}`);
  assert.ok(kept.some(corner), `모퉁이(한 칸 안)를 지남: ${JSON.stringify(kept)}`);
  let [px, pz] = [2, 4];                                                                              // 직선 구간이 모두 포장 칸 위
  for (const [x, z] of kept) { for (let i = 0; i <= 40; i++) { const cx = Math.floor(px + 0.5 + (x - px) * i / 40), cz = Math.floor(pz + 0.5 + (z - pz) * i / 40); assert.ok(paved.has(g.index(cx, cz)), `${cx},${cz}`); } [px, pz] = [x, z]; }
});

/** 넓은 섬 · 갈매미 하나 · 갈매미 옆을 지나는 돌길(가로 한 줄 + 세로 한 줄) */
function roadWorld(paint = true) {
  const w = World.create(7, seededRandom(4), { wild: true, firstGull: true }), u = w.units[0];
  const [ux, uz] = [Math.floor(u.x), Math.floor(u.z)], cells = [];
  for (let d = -9; d <= 9; d++) { cells.push([ux + d, uz + 2]); cells.push([ux - 3, uz + d]); }
  if (paint) for (const [x, z] of cells) if (w.canPaint(x, z)) w.paint(x, z, GroundType.Cobble);
  w.updateRoads();
  return { w, u, ux, uz };
}
/** 산책을 n번 시작해 목적지가 포장 칸인 비율 */
function strollShare(w, u, ux, uz, net, n = 300) {
  const rnd = seededRandom(11); let hit = 0, ok = 0;
  for (let k = 0; k < n; k++) {
    setIdle(u, rnd, w); u.x = ux + 0.5; u.z = uz + 0.5; u.emoteText = null; u.emoteT = 0; w.time = 1000 + k * 0.37;
    if (!_pokeApi.startActivity(u, "wander", w, rnd)) continue; ok++;
    if (net.has(w.grid.index(u.goal.x, u.goal.z))) hit++;
  }
  return { share: hit / Math.max(1, ok), ok };
}

test("산책: 길이 있으면 둘레 포장 칸으로 가는 일이 확실히 많고(다 그렇지는 않음), 길이 없으면 예전 그대로", () => {
  const A = roadWorld(true), net = A.w.roads.net; assert.ok(net.size >= 20, `포장 칸 ${net.size}`);
  const withRoad = strollShare(A.w, A.u, A.ux, A.uz, net);
  const B = roadWorld(false); assert.equal(B.w.roads.net.size, 0);
  const without = strollShare(B.w, B.u, B.ux, B.uz, net);                                              // 같은 칸 모음으로 견줌(우연히 그 칸에 감)
  assert.ok(withRoad.ok >= 250 && without.ok >= 250);
  assert.ok(without.share < 0.25, `길 없을 때 우연히 그 칸 ${without.share.toFixed(2)}`);
  assert.ok(withRoad.share >= without.share + 0.3, `길로 ${withRoad.share.toFixed(2)} vs ${without.share.toFixed(2)}`);
  assert.ok(withRoad.share <= 0.9, `늘 길만은 아님 ${withRoad.share.toFixed(2)}`);
  // 길로 갈지는 해시(월드 난수 안 씀): 대략 STROLL_ROAD 비율
  let yes = 0; for (let k = 0; k < 2000; k++) { A.w.time = k * 0.25; if (strollRoad(A.u, A.w)) yes++; }
  assert.ok(Math.abs(yes / 2000 - STROLL_ROAD) < 0.06, `해시 비율 ${yes / 2000}`);
  // 길이 없으면 산책 고르기가 쓰는 난수 수도 예전과 같음(같은 씨앗 → 같은 목적지 줄)
  const goals = (w, u, ux, uz) => { const rnd = seededRandom(5), out = []; for (let k = 0; k < 40; k++) { setIdle(u, rnd, w); u.x = ux + 0.5; u.z = uz + 0.5; w.time = k; out.push(_pokeApi.startActivity(u, "wander", w, rnd) ? `${u.goal.x},${u.goal.z}` : "-"); } return out; };
  const B2 = roadWorld(false), noRoads = goals(B2.w, B2.u, B2.ux, B2.uz);
  B2.w.roads = undefined; assert.deepEqual(goals(B2.w, B2.u, B2.ux, B2.uz), noRoads, "roads가 아직 없어도 같음");
});

test("산책 말풍선: 길 위로 산책을 나서면 가끔 흐뭇한 한마디, 같은 갈매미는 하루 3번까지(chatter)", () => {
  const { w, u, ux, uz } = roadWorld(true), rnd = seededRandom(2); let said = 0;
  for (let k = 0; k < 400; k++) {
    setIdle(u, rnd, w); u.x = ux + 0.5; u.z = uz + 0.5; u.emoteText = null; u.emoteT = 0; w.time = 50 + k;   // 마을 하루(600초) 안
    if (_pokeApi.startActivity(u, "wander", w, rnd) && ROAD_SAY.includes(u.emoteText)) said++;
  }
  assert.ok(said >= 1, "가끔 말함"); assert.ok(said <= SAME_BUBBLE_DAY, `하루 ${said}번`);
  for (const t of ROAD_SAY) assert.doesNotMatch(t, /[0-9()]|요$/, "반말 혼잣말");
});
