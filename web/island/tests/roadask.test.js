// 갈매미 길 부탁(roadAsk.js): 갈매미는 바닥을 바꾸지 않고 말풍선으로 부탁함 · 바라는 길 조건 · 차례(혼자·마을 전체) · 깔기 좋은 곧은 길(ㄱ자 → ㄹ자 → 길찾기)
import { test } from "node:test";
import assert from "node:assert/strict";
import * as RA from "../src/world/roadAsk.js";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { GroundType } from "../src/data/types.js";
import { alertLine, makeGate } from "../src/ui/newsAlerts.js";
import { NEWS_DAY_SECS } from "../src/world/news.js";

const open = () => true, walk = () => true;

test("바라는 길: 다 지은 내 집 · 상인 아님 · 집-시장/집-은행 길 없음 · 시장(없으면 은행)이 있을 때만", () => {
  const home = { id: 1, door: { x: 0, z: 0 } }, mk = { id: 2, door: { x: 5, z: 5 } }, bk = { id: 3, door: { x: 9, z: 0 } };
  const world = { buildings: new Map([[1, home], [2, mk], [3, bk]]), isDone: () => true, marketB: () => mk, bankB: () => bk };
  const u = { home: 1, job: "builder", satParts: [["기본", 40]] };
  assert.equal(RA.roadWant(world, u).label, "시장");
  assert.equal(RA.roadWant({ ...world, marketB: () => null }, u).label, "은행", "시장이 없으면 은행");
  assert.equal(RA.roadWant({ ...world, marketB: () => null, bankB: () => null }, u), null, "갈 곳이 없으면 안 바람");
  assert.equal(RA.roadWant(world, { ...u, job: "merchant" }), null, "상인은 안 바람");
  assert.equal(RA.roadWant(world, { ...u, home: null }), null, "집이 없으면 안 바람");
  assert.equal(RA.roadWant({ ...world, isDone: () => false }, u), null, "짓는 중인 집");
  assert.equal(RA.roadWant(world, { ...u, satParts: [["🛣 집-은행 포장도로", 15]] }), null, "이미 이어졌으면 안 바람");
});

test("글: 말풍선 3가지 · 알림 줄 '이름: 집에서 시장까지 길을 깔아 주세요'", () => {
  assert.equal(RA.askBubble("시장", () => 0), "🛣 집에서 시장까지 길이 있으면 좋겠어");
  assert.match(RA.askBubble("은행", () => 0.99), /은행/);
  assert.equal(RA.askNotice("불씨", "시장"), "불씨: 집에서 시장까지 길을 깔아 주세요");
});

test("차례: 같은 갈매미는 90~150초에 한 번, 마을 전체로도 25초에 한 번", () => {
  assert.equal(RA.nextGap(() => 0), RA.ASK_GAP_MIN); assert.equal(RA.nextGap(() => 1), RA.ASK_GAP_MAX);
  assert.ok(RA.ASK_GAP_MIN >= 90 && RA.ASK_GAP_MAX <= 150 && RA.ASK_GLOBAL_GAP >= 20);
  const u = { roadAskAt: 100 };
  assert.equal(RA.canAsk({ roadAskAt: null }, 1e9), false, "차례가 잡히지 않았으면 안 함");
  assert.equal(RA.canAsk(u, 99), false); assert.equal(RA.canAsk(u, 100), true);
  assert.equal(RA.canAsk(u, 110, 100), false, "다른 갈매미가 방금 부탁했으면 기다림");
  assert.equal(RA.canAsk(u, 100 + RA.ASK_GLOBAL_GAP, 100), true);
});

test("깔기 좋은 길: 막힘이 없으면 ㄱ자(꺾임 1번), 곧은 줄이면 꺾임 0", () => {
  const r = RA.suggestRoute([0, 0], [4, 3], open, walk);
  assert.equal(r.regular, true); assert.equal(r.turns, 1); assert.equal(r.cells.length, 4 + 3 + 1, "시작·끝 포함 맨해튼 길이");
  assert.deepEqual(r.cells[0], [0, 0]); assert.deepEqual(r.cells.at(-1), [4, 3]);
  for (let i = 1; i < r.cells.length; i++) assert.equal(Math.abs(r.cells[i][0] - r.cells[i - 1][0]) + Math.abs(r.cells[i][1] - r.cells[i - 1][1]), 1, "가로·세로로만 한 칸씩");
  const s = RA.suggestRoute([2, 1], [2, 6], open, walk); assert.equal(s.turns, 0); assert.equal(s.cells.length, 6);
});

test("깔기 좋은 길: ㄱ자 두 가지가 다 막히면 ㄹ자(가운데 줄은 한가운데부터), 그것도 안 되면 길찾기 길", () => {
  // (0,0) → (6,4): 꺾임 모서리 (6,0)·(0,4)가 막힘
  const blocked = new Set(["6,0", "0,4"]), ok = (x, z) => !blocked.has(`${x},${z}`);
  const r = RA.suggestRoute([0, 0], [6, 4], ok, walk);
  assert.equal(r.regular, true); assert.equal(r.turns, 2); assert.ok(r.cells.every(([x, z]) => ok(x, z)));
  assert.ok(r.cells.some(([x, z]) => x === 3 && z > 0 && z < 4) || r.cells.some(([x, z]) => z === 2 && x > 0 && x < 6), "가운데 줄이 한가운데(x=3 또는 z=2)");
  // 벽으로 둘러싸 곧은 길이 없음 → 길찾기 길(못 까는 칸은 뺌)
  const wall = (x, z) => !(x === 3 && z !== 9);
  const f = RA.suggestRoute([0, 0], [6, 0], wall, walk, () => [[1, 0], [2, 1], [3, 9], [4, 1], [5, 0], [6, 0]]);
  assert.equal(f.regular, false); assert.deepEqual(f.cells[0], [0, 0]); assert.ok(f.cells.every(([x, z]) => wall(x, z)));
  assert.equal(RA.suggestRoute([0, 0], [6, 0], () => false, walk, () => null), null, "갈 수 없으면 null");
  // 걸을 수 없는 이음(높은 턱)도 막힘으로 봄
  const step = (ax, az, bx, bz) => !(ax === 1 && bx === 2 && az === 0);
  const t = RA.suggestRoute([0, 0], [4, 0], open, step); assert.ok(t.turns >= 2, "턱을 돌아감");
});

test("월드: 갈매미는 바닥을 바꾸지 않고, 집이 시장과 안 이어졌으면 말풍선으로 부탁(알림은 같은 갈매미 하루 한 번), 길을 깔면 부탁이 사라짐", () => {
  const w = World.create(7, seededRandom(5), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("목수"); w.addUnitByName("불씨");
  const c = w.center, spot = (d, x0, z0) => { for (let r = 0; r < 30; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; };
  const hq = spot("house", c.x + 12, c.z + 10), h = w.placeBuilding("house", hq[0], hq[1], 0).building, mq = spot("market", c.x + 2, c.z + 14), mk = w.placeBuilding("market", mq[0], mq[1], 0).building;
  const u = w.units.find(o => o.name === "불씨"); u.home = h.id; h.owner = u.unitId; u.inv.stone = 10; w.res.stone = 10;
  w.updateRoads();
  const ground = () => w.grid.cells.map(x => x.groundType).join(",");
  const g0 = ground(), asks = [], bubbles = new Set(); w.on("roadAsk", e => asks.push(e));
  for (let t = 0; t < 900; t += 0.1) { for (const o of w.units) o.full = 90; w.update(0.1); if (u.emoteText?.startsWith("🛣")) bubbles.add(u.emoteText); }
  assert.equal(ground(), g0, "갈매미가 바닥 종류를 하나도 바꾸지 않음");
  const mine = asks.filter(a => a.u === u);
  assert.ok(mine.length >= 2, `여러 번 부탁(${mine.length})`); assert.ok(mine.length <= 900 / RA.ASK_GAP_MIN + 1, "너무 자주는 아님");
  assert.ok([...bubbles].some(b => b.includes("시장")), `말풍선: ${[...bubbles].join(" / ")}`);
  for (let i = 1; i < asks.length; i++) assert.ok(asks[i].t - asks[i - 1].t >= RA.ASK_GLOBAL_GAP - 1e-9, "마을 전체 간격");
  const a = mine.at(-1); assert.equal(a.label, "시장"); assert.ok(a.cells.length >= 2);
  assert.deepEqual(a.cells[0], [h.door.x, h.door.z]); assert.deepEqual(a.cells.at(-1), [mk.door.x, mk.door.z]);
  assert.ok(w.roadAsks.get(u.unitId), "world.roadAsks에 부탁한 길");
  // 알림 줄: 같은 갈매미는 마을 하루에 한 번
  const pass = makeGate();
  assert.equal(alertLine("roadAsk", a, w), "🛣 불씨: 집에서 시장까지 길을 깔아 주세요 (🖌 바닥 칠하기 → 돌길·데크)");
  assert.equal(pass("roadAsk", a, 100), true); assert.equal(pass("roadAsk", a, 300), false); assert.equal(pass("roadAsk", a, 100 + NEWS_DAY_SECS), true);
  // 플레이어가 알려 준 길대로 깔면 이어지고 더는 부탁하지 않음
  for (const [x, z] of a.cells) if (w.canPaint(x, z)) w.paint(x, z, GroundType.Cobble);
  w.updateRoads(); assert.ok(u.satParts.some(p => p[0].includes("집-시장")), `이어짐(${u.satParts.map(p => p[0]).join(",")})`);
  const n = asks.length; for (let t = 0; t < 400; t += 0.1) { for (const o of w.units) o.full = 90; w.update(0.1); }
  assert.equal(asks.filter(x => x.u === u).length, mine.length, "길이 이어지면 더 부탁하지 않음"); assert.equal(w.roadAsks.has(u.unitId), false);
  assert.ok(asks.length >= n);
});
