// 톡톡 콕 찌르기(units/poke.js): 9종 반응 표 · 정·돈·쓰다듬기 횟수 그대로 · 월드 난수 안 씀 · 자는 갈매미 뒤척임 · 연타 뛰어놀기/삐침(저장 안 함). node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { PERSONA } from "../src/data/catalog.js";
import { Poke, POKE_TABLE, POKE_SLEEP, POKE_COMBO, POKE_COMBO_GAP, POKE_SULK, POKE_ZOOM_REST, comboKind } from "../src/units/poke.js";

const fresh = (seed = 3) => { const w = World.create(7, seededRandom(seed), { wild: true, firstGull: true }); w.instantBuild = true; return w; };
const idle = (u, w) => { u.state = "Idle"; u.once = null; u.path = null; u.insideBuildingId = null; u.timer = 5; };

test("반응 표: PERSONA 9종 모두, 대사 3~4개, 몸짓 이름이 정해진 것", () => {
  assert.deepEqual(Object.keys(POKE_TABLE).sort(), Object.keys(PERSONA).sort());
  assert.equal(Object.keys(POKE_TABLE).length, 9);
  for (const [n, r] of Object.entries(POKE_TABLE)) {
    assert.ok(r.lines.length >= 3 && r.lines.length <= 4, n);
    assert.ok(["hop", "flee", "slow", "aside", "look"].includes(r.act), n);
  }
  assert.equal(POKE_TABLE["미니"].act, "flee"); assert.equal(POKE_TABLE["자이언트"].act, "slow"); assert.equal(POKE_TABLE["그림자"].act, "aside");
});

test("톡: 정·돈·재미·쓰다듬기 횟수가 그대로고 월드 난수를 안 씀 · 말풍선이 뜨고 대사가 돌아가며 바뀜", () => {
  const w = fresh(), u = w.units[0], p = new Poke(w, 5); idle(u, w);
  let calls = 0; const r0 = w.rnd, wr0 = w.wrnd; w.rnd = () => { calls++; return r0(); }; w.wrnd = () => { calls++; return wr0(); };
  const before = JSON.stringify({ bond: u.bond, coins: u.coins, petN: u.petN, petDay: u.petDay, needs: u.needs, money: w.money });
  const lines = [];
  for (let i = 0; i < 4; i++) { p.step(POKE_COMBO_GAP + 0.1); idle(u, w); lines.push(p.poke(u, { x: u.x + 3, z: u.z }).line); }
  assert.equal(calls, 0, "월드 난수 안 씀");
  assert.equal(JSON.stringify({ bond: u.bond, coins: u.coins, petN: u.petN, petDay: u.petDay, needs: u.needs, money: w.money }), before);
  assert.equal(new Set(lines).size, 4, "대사 4개가 차례로");
  assert.ok(u.emoteText && u.emoteT > 0);
  assert.ok(Math.abs(Math.atan2(3, 0) - u.heading) < 1e-9 || u.once, "보는 사람 쪽을 봄");
});

test("미니는 폴짝 뛰고 도망, 그림자는 비켜섬, 자이언트는 한참 뒤에 대사", () => {
  const w = fresh(), u = w.units[0], p = new Poke(w, 5);
  u.form = "미니"; idle(u, w); const r = p.poke(u, { x: u.x + 3, z: u.z });
  assert.equal(r.act, "flee"); assert.equal(u.once?.key, "Jump"); u.once.then(); assert.equal(u.state, "Flee", "두 칸 도망");
  u.form = "그림자"; idle(u, w); p.step(5); assert.equal(p.poke(u, { x: u.x + 3, z: u.z }).act, "aside"); assert.equal(u.state, "Avoid");
  u.form = "자이언트"; idle(u, w); p.step(5); const g = p.poke(u, { x: u.x + 3, z: u.z });
  assert.equal(u.emoteText, "…"); p.step(1.0); assert.equal(u.emoteText, "…"); p.step(0.5); assert.equal(u.emoteText, g.line, "1.4초 뒤 천천히");
});

test("일하는 중이면 말풍선만(하던 일을 안 끊음)", () => {
  const w = fresh(), u = w.units[0], p = new Poke(w, 5);
  u.state = "Build"; u.once = null; const r = p.poke(u);
  assert.equal(r.act, "say"); assert.equal(u.state, "Build"); assert.equal(u.once, null);
  // 낚시·앉기는 시작할 때 한 번만 방향을 정함: 톡·삐침에도 바다(벤치) 쪽을 그대로 봄
  for (const st of ["Fish", "Sit", "Trade"]) {
    const q = new Poke(w, 9); u.state = st; u.once = null; u.heading = 1.234;
    q.poke(u, { x: u.x + 3, z: u.z }); assert.equal(u.heading, 1.234, st);
    for (let i = 0; i < POKE_COMBO; i++) q.poke(u, { x: u.x + 3, z: u.z });
    assert.ok(q.sulking(u)); q.poke(u, { x: u.x + 3, z: u.z }); assert.equal(u.heading, 1.234, st + " 삐침"); assert.equal(u.state, st);
  }
});

test("자는 갈매미: 💤가 커졌다가 뒤척임, 깨우지 않음", () => {
  const w = fresh(), u = w.units[0], p = new Poke(w, 5); u.state = "Sleep"; u.insideBuildingId = null; u.heading = 0;
  const r = p.poke(u); assert.equal(r.kind, "sleep"); assert.ok(POKE_SLEEP.includes(r.line)); assert.equal(u.emoteText, "💤💤");
  p.step(0.9); assert.equal(u.emoteText, r.line); assert.notEqual(u.heading, 0, "뒤척"); assert.equal(u.state, "Sleep", "안 깸");
});

test("연타 5번: 활발한 갈매미는 뛰어놀기, 바로 또 연타하면 삐침 · 간격이 길면 연타가 아님", () => {
  const w = fresh(), u = w.units[0], p = new Poke(w, 5); u.form = "물방울"; idle(u, w);
  for (let i = 0; i < POKE_COMBO - 1; i++) { assert.equal(p.poke(u).kind, "poke"); p.step(0.3); idle(u, w); }
  const z = p.poke(u); assert.equal(z.kind, "zoom"); assert.equal(u.state, "Zoomies"); assert.equal(u.activity, null, "배움(활동 선호)도 안 바꿈");
  idle(u, w); p.step(1);
  for (let i = 0; i < POKE_COMBO - 1; i++) { p.poke(u); p.step(0.3); idle(u, w); }
  assert.equal(p.poke(u).kind, "sulkStart", `뛰어논 뒤 ${POKE_ZOOM_REST}초 안 연타 = 삐침`);
  assert.equal(p.poke(u).kind, "sulk"); p.step(POKE_SULK + 0.1); idle(u, w); assert.equal(p.poke(u).kind, "poke", "삐침은 10초 뒤 풀림");
  const q = new Poke(w, 5); for (let i = 0; i < POKE_COMBO + 2; i++) { assert.equal(q.poke(u).kind, "poke"); q.step(POKE_COMBO_GAP + 0.05); idle(u, w); }
});

test("연타 끝: 자이언트·그림자·잠·지침은 삐침, 삐침은 저장하지 않음", () => {
  const w = fresh(), u = w.units[0];
  idle(u, w); u.form = "자이언트"; assert.equal(comboKind(u), "sulk");
  u.form = "그림자"; assert.equal(comboKind(u), "sulk");
  u.form = "기본"; assert.equal(comboKind(u), "zoom"); u.needs.energy = 10; assert.equal(comboKind(u), "sulk"); u.needs.energy = 80;
  u.state = "Sleep"; assert.equal(comboKind(u), "sulk");
  const p = new Poke(w, 5); for (let i = 0; i < POKE_COMBO; i++) p.poke(u);
  assert.equal(u.state, "Sleep", "자는 갈매미는 삐쳐도 안 깸"); assert.ok(p.sulking(u));
  const s = JSON.stringify(w.serialize()); assert.ok(!/sulk|poke/i.test(s), "저장 데이터에 없음");
});

test("폴짝(톡 반응) 중에 다섯 번째 톡이 와도 뛰어놀기 · stepReal은 실제 ms로 셈(프레임 dt 상한과 무관)", () => {
  const w = fresh(), u = w.units[0], p = new Poke(w, 5); u.form = "기본"; idle(u, w);
  for (let i = 0; i < POKE_COMBO - 1; i++) { p.poke(u); p.step(0.3); }
  assert.equal(u.once?.key, "Jump", "기본 갈매미 반응 = 폴짝");
  assert.equal(p.poke(u).kind, "zoom"); assert.equal(u.state, "Zoomies"); assert.equal(u.once, null);
  const q = new Poke(w, 5); q.stepReal(1000); q.stepReal(1700); assert.ok(Math.abs(q.now - 0.7) < 1e-9); q.stepReal(9000); assert.ok(Math.abs(q.now - 1.7) < 1e-9, "멈췄다 돌아오면 1초까지만");
});
