// 깜짝 소동과 착지 반응(units/fuss.js): 미니 바위 위 · 야행성 낮 졸기 · 들어 옮기면 풀림(하트·구경·소식) · 하루 상한 · 깨어 있는 갈매미만 · 흔들면 어질어질. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { UNITS } from "../src/data/catalog.js";
import { updateUnit } from "../src/units/unitBrain.js";
import { Fuss, FUSS_DAILY, FUSS_FIRST, FUSS_SEE, FUSS_GAP, FUSS_LIFE, DIZZY_SECS, rockTop, fussAwake, shakeStep } from "../src/units/fuss.js";
import { SLEEP_BELOW } from "../src/units/chrono.js";

const fresh = (seed = 3) => { const w = World.create(7, seededRandom(seed), { wild: true, firstGull: true }); w.instantBuild = true; w.isNight = false; return w; };
const awake = u => { u.state = "Idle"; u.once = null; u.path = null; u.insideBuildingId = null; u.timer = 5; u.full = 80; u.sick = null; if (u.needs) u.needs.energy = 90; };
/** 미니 하나 + 4칸 옆 자이언트 + 미니 2칸 옆 해변 바위 */
function perchSetup(seed = 3) {
  const w = fresh(seed), mini = w.units[0]; mini.name = "미니"; awake(mini);
  const g = w.grid; let spot = null;
  for (let z = g.box.z0 + 2; z < g.box.z1 - 2 && !spot; z++) for (let x = g.box.x0 + 6; x < g.box.x1 - 6 && !spot; x++)
    if ([0, 1, 2, -3].every(d => g.isWalkable(x + d, z) && !g.get(x + d, z).occupiedId)) spot = [x, z];
  const [x, z] = spot; mini.x = x + 0.5; mini.z = z + 0.5;
  w.modules = w.modules.filter(m => m.defId !== "beachRock");   // 섬에 원래 있던 바위는 빼고 시험 바위 하나만
  w.modules.push({ id: "rock-t", defId: "beachRock", cells: [[x + 2, z]], rot: 0, variant: 0 });
  const giant = w.addUnit(UNITS.find(d => d.name === "자이언트"), 7, x - 3.5, z + 0.5); awake(giant);
  return { w, mini, giant, rock: [x + 2, z] };
}

test("미니가 자이언트를 피해 바위 위로: Idle 위에 얹은 소동, 바위 꼭대기에 붙잡혀 있고 unitBrain이 움직이지 않음", () => {
  const { w, mini, rock } = perchSetup(), f = new Fuss(w, 5);
  const c = f.start("perch", mini); assert.ok(c);
  assert.equal(f.of(mini), "perch"); assert.equal(mini.state, "Idle"); assert.ok(mini.fuss?.pin);
  assert.equal(mini.x, rock[0] + 0.5); assert.equal(mini.z, rock[1] + 0.5);
  assert.ok(Math.abs(mini.y - (w.standHeight(mini.x, mini.z) + rockTop({ variant: 0 }))) < 1e-9);
  for (let i = 0; i < 60; i++) { updateUnit(mini, 0.1, w, w.rnd); f.step(0.1); }
  assert.equal(mini.x, rock[0] + 0.5, "6초 지나도 그 자리"); assert.equal(mini.state, "Idle");
  assert.match(mini.emoteText, /🆘/);
});

test("길게 눌러 들어 옮기면 풀림: 💕 말풍선 · 주변 갈매미 '!' 구경(notice) · 소식(fussSolved) · 돈·정 그대로", () => {
  const { w, mini, giant } = perchSetup(), f = new Fuss(w, 5); f.start("perch", mini);
  const seen = []; w.on("fussSolved", e => seen.push(e)); const before = JSON.stringify({ bond: mini.bond, coins: mini.coins, money: w.money, vault: w.bank.vault });
  assert.ok(w.pickUpUnit(mini)); f.step(0.05); assert.equal(f.of(mini), "perch", "들고 있는 동안은 아직 소동");
  const r = w.dropUnit(mini, Math.floor(giant.x) + 1, Math.floor(giant.z)); assert.ok(r.ok);
  giant.curious = null; w.rnd = () => 0;                                          // notice 확률을 늘 통과하게
  f.step(0.05);
  assert.equal(f.of(mini), null); assert.equal(mini.fuss, null); assert.equal(f.solved, 1);
  assert.match(mini.emoteText, /💕/);
  assert.equal(seen.length, 1); assert.equal(seen[0].kind, "perch");
  assert.equal(giant.curious?.kind, "fuss", "구경 거리는 fuss(unitBrain 호기심 말풍선 기본값 '!')");
  assert.equal(JSON.stringify({ bond: mini.bond, coins: mini.coins, money: w.money, vault: w.bank.vault }), before);
  assert.ok(w.newsLog.some(n => /내려 줬어요/.test(n.text)), "소식지에 한 줄");
});

test("내려놓기가 실패해 바위로 돌아오면 소동이 이어짐", () => {
  const { w, mini, rock } = perchSetup(), f = new Fuss(w, 5); f.start("perch", mini);
  w.pickUpUnit(mini); f.step(0.05);
  const sea = (() => { for (let z = w.grid.box.z0; z < w.grid.box.z1; z++) for (let x = w.grid.box.x0; x < w.grid.box.x1; x++) if (w.grid.isWater(x, z) && !w.grid.isWalkable(x, z)) { let near = false; for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (w.grid.isWalkable(x + dx, z + dz)) near = true; if (!near) return [x, z]; } })();
  const r = w.dropUnit(mini, ...sea); assert.equal(r.ok, false);
  f.step(0.05); assert.equal(f.of(mini), "perch"); assert.equal(mini.x, rock[0] + 0.5);
});

test("야행성은 낮에만 꾸벅: 밤이 되거나 FUSS_LIFE초가 지나면 혼자 풀림(하트·소식 없음)", () => {
  const w = fresh(), u = w.units[0]; u.name = "불씨"; awake(u); const f = new Fuss(w, 5), seen = []; w.on("fussSolved", e => seen.push(e));
  const x0 = u.x; assert.ok(f.start("doze", u)); assert.equal(u.x, x0, "그 자리에서 졺");
  for (let t = 0; t < 30; t++) { updateUnit(u, 0.5, w, w.rnd); f.step(0.5); }
  assert.equal(f.of(u), "doze"); w.isNight = true; f.step(0.1); assert.equal(f.of(u), null, "밤엔 깸");
  w.isNight = false; f.lastEnd = -1e9; awake(u); f.start("doze", u); f.step(FUSS_LIFE + 1); assert.equal(f.of(u), null);
  assert.equal(seen.length, 0); assert.equal(f.solved, 0);
});

test("깨어 있는 갈매미만: 자는·졸린·배고픈·아픈 갈매미는 소동 안 함 · 소동 중 기력이 잠 문턱 가까이 떨어지면 풀림(잠이 먼저)", () => {
  const w = fresh(), u = w.units[0]; u.name = "불씨"; awake(u);
  assert.ok(fussAwake(u, w));
  u.needs.energy = SLEEP_BELOW + 5; assert.ok(!fussAwake(u, w), "기력 25(잠 문턱 20 + FUSS_AWAKE 이하)");
  awake(u); u.state = "Sleep"; assert.ok(!fussAwake(u, w));
  awake(u); u.full = 20; assert.ok(!fussAwake(u, w));
  awake(u); u.sick = { kind: "cold", left: 10 }; assert.ok(!fussAwake(u, w));
  awake(u); const f = new Fuss(w, 5); f.start("doze", u); u.needs.energy = SLEEP_BELOW + 1; f.step(0.1); assert.equal(f.of(u), null);   // 잠 문턱(체질 상관없이 20) + 2 이하 → 풀림
});

test("하루 상한: 마을 하루에 FUSS_DAILY번, 처음엔 FUSS_FIRST초 기다리고 끝난 뒤 FUSS_GAP초 쉼", () => {
  const w = fresh(), u = w.units[0]; u.name = "불씨"; const f = new Fuss(w, 5); f.rnd = () => 0;
  awake(u); assert.equal(f.roll(), null, "연 지 얼마 안 됨");
  w.time += FUSS_FIRST; assert.ok(f.roll()); assert.equal(f.roll(), null, "한 번에 하나");
  f.end(false); awake(u); assert.equal(f.roll(), null, "쉬는 중"); w.time += FUSS_GAP;
  for (let i = 1; i < FUSS_DAILY; i++) { awake(u); assert.ok(f.roll()); f.end(false); w.time += FUSS_GAP; }
  awake(u); assert.equal(f.roll(), null, "오늘은 다 씀"); assert.equal(f.n, FUSS_DAILY);
  w.time += 600; awake(u); assert.ok(f.roll(), "다음 날은 다시");
});

test("흔들었다 놓으면 DIZZY_SECS초 어질어질 걷기, 그냥 놓으면 안 함 · 눈·모래 착지 콜백(onLand)", () => {
  const w = fresh(), u = w.units[0]; awake(u); const f = new Fuss(w, 5), lands = []; f.onLand = (v, shook) => { lands.push(shook); return "sand"; };
  const x = Math.floor(u.x), z = Math.floor(u.z);
  w.pickUpUnit(u); for (let i = 0; i < 10; i++) f.step(0.05); w.dropUnit(u, x, z); f.step(0.05);
  assert.deepEqual(lands, [false]); assert.equal(u.fuss, null); assert.equal(u.emoteText, "쿵!");
  w.pickUpUnit(u); for (let i = 0; i < 24; i++) { u.x = x + 0.5 + (i % 2 ? 0.9 : -0.9); f.step(0.05); }   // 1.2초 동안 1.8 m씩 왔다 갔다
  u.x = x + 0.5; w.dropUnit(u, x, z); f.step(0.05);
  assert.deepEqual(lands, [false, true]); assert.equal(u.fuss?.kind, "dizzy"); assert.match(u.emoteText, /어질어질/);
  const p0 = { x: u.x, z: u.z }; let moved = 0;
  for (let t = 0; t < DIZZY_SECS - 0.2; t += 0.1) { updateUnit(u, 0.1, w, w.rnd); f.step(0.1); moved = Math.max(moved, Math.hypot(u.x - p0.x, u.z - p0.z)); }
  assert.ok(moved > 0.3, "비틀비틀 걸음"); assert.equal(u.fuss?.kind, "dizzy");
  f.step(0.3); assert.equal(u.fuss, null); assert.equal(u.anim, null);
});

test("소동 풀기 중 흔들었으면 💕 뒤에 @_@ (어질어질은 이어 감)", () => {
  const { w, mini, giant } = perchSetup(), f = new Fuss(w, 5); f.start("perch", mini);
  w.pickUpUnit(mini); const x0 = mini.x; for (let i = 0; i < 24; i++) { mini.x = x0 + (i % 2 ? 0.9 : -0.9); f.step(0.05); }
  w.dropUnit(mini, Math.floor(giant.x) + 1, Math.floor(giant.z)); f.step(0.05);
  assert.equal(f.of(mini), null); assert.equal(mini.fuss?.kind, "dizzy"); assert.match(mini.emoteText, /💕.*@_@/);
});

test("흔들기 판정(shakeStep): 쭉 끌기·작은 손떨림은 아님, 0.6 m 폭으로 초당 4프레임(느린 PC)만 찍혀도 흔든 것", () => {
  const run = pts => { const h = { t: 0, a: { x: pts[0][1], z: 0 }, far: null, dir: null, revs: [] }; let hit = false; for (const [t, x] of pts) { h.t = t; if (shakeStep(h, x, 0)) hit = true; } return hit; };
  assert.equal(run(Array.from({ length: 60 }, (_, i) => [i / 30, i * 0.1])), false, "한쪽으로 6 m 끌기");
  assert.equal(run(Array.from({ length: 60 }, (_, i) => [i / 30, (i % 2) * 0.3])), false, "0.3 m 손떨림");
  assert.equal(run(Array.from({ length: 6 }, (_, i) => [i / 4, i % 2 ? 0.6 : 0])), true, "0.6 m씩 왔다 갔다 · 0.25초마다");
  assert.equal(run([[0, 0], [0.25, 0.6], [1.2, 0], [2.2, 0.6], [3.2, 0]]), false, "천천히 몇 번 옮긴 것(창 1.5초 밖)");
});

test("화면 중심(near)에서 FUSS_SEE칸 넘게 떨어진 갈매미는 소동 안 함 · 소동 중 톡은 🆘 말풍선만(nudge)", () => {
  const w = fresh(), u = w.units[0]; u.name = "불씨"; const f = new Fuss(w, 5); f.rnd = () => 0; w.time += FUSS_FIRST; awake(u);
  f.near = () => ({ x: u.x + FUSS_SEE + 1, z: u.z }); assert.equal(f.roll(), null, "화면 밖");
  f.near = () => ({ x: u.x + FUSS_SEE - 1, z: u.z }); assert.ok(f.roll(), "화면 안");
  assert.equal(f.nudge(w.units.find(o => o !== u) || {}), false);
  u.emoteText = ""; assert.equal(f.nudge(u), true); assert.match(u.emoteText, /🆘/);
});
