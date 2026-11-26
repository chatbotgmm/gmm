// 판(무료·유료)과 배속(src/systems/edition.js): 기본값 · 저장 읽기 실패 · 계정 값 덮어쓰기 · 무료면 배속 1 · 프레임당 update 횟수
import { test } from "node:test";
import assert from "node:assert/strict";
import { createEdition, normEdition, effectiveSpeed, nextSpeed, simSteps, EDITION_KEY, SPEED_KEY, MAX_STEPS } from "../src/systems/edition.js";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };

test("처음 기본값: 무료판 · 출처 local · 배속 ×1 · 손으로 바꿀 수 있음", () => {
  const e = createEdition(mem());
  assert.equal(e.edition, "free"); assert.equal(e.source, "local"); assert.equal(e.speed, 1); assert.equal(e.canPick, true); assert.equal(e.isPaid, false);
});

test("저장소가 없거나 읽기·쓰기가 던져도 무료판으로 시작하고, 바꾸기도 메모리에서는 됨", () => {
  for (const s of [null, broken]) {
    const e = createEdition(s); assert.equal(e.edition, "free"); assert.equal(e.speed, 1);
    assert.deepEqual(e.setLocal("paid"), { ok: true }); assert.equal(e.edition, "paid");
    assert.equal(e.setSpeed(3).ok, true); assert.equal(e.speed, 3);
  }
});

test("깨진 저장 값(JSON 아님·모르는 판·이상한 배속)은 기본값으로", () => {
  for (const v of ["{", "\"paid\"", JSON.stringify({ edition: "gold" }), "null"]) assert.equal(createEdition(mem({ [EDITION_KEY]: v })).edition, "free");
  const e = createEdition(mem({ [EDITION_KEY]: JSON.stringify({ edition: "paid", source: "local" }), [SPEED_KEY]: "7" }));
  assert.equal(e.edition, "paid"); assert.equal(e.speed, 1);
});

test("설정에서 고른 판·배속은 저장되고 다시 열면 그대로", () => {
  const s = mem(), a = createEdition(s); a.setLocal("paid"); a.setSpeed(2);
  const b = createEdition(s); assert.equal(b.edition, "paid"); assert.equal(b.source, "local"); assert.equal(b.speed, 2);
  assert.equal(JSON.parse(s.m.get(EDITION_KEY)).edition, "paid"); assert.equal(s.m.get(SPEED_KEY), "2");
});

test("무료판이면 배속은 늘 1: 고르기는 locked, 무료로 바꾸면 ×1로 돌아가고 저장도 1", () => {
  const s = mem(), e = createEdition(s);
  assert.deepEqual(e.setSpeed(3), { ok: false, reason: "locked", speed: 1 }); assert.equal(e.speed, 1);
  e.setLocal("paid"); e.setSpeed(3); assert.equal(e.speed, 3);
  e.setLocal("free"); assert.equal(e.speed, 1); assert.equal(e.chosenSpeed, 1); assert.equal(s.m.get(SPEED_KEY), "1");
  e.setLocal("paid"); assert.equal(e.speed, 1, "다시 유료로 가도 ×1부터");
  // 저장소를 손으로 고쳐 무료판 + 배속 3을 넣어도 적용은 1
  assert.equal(createEdition(mem({ [EDITION_KEY]: JSON.stringify({ edition: "free" }), [SPEED_KEY]: "3" })).speed, 1);
});

test("계정 값: 덮어쓰고 저장(출처 account) · 그 뒤 설정 손 전환은 잠김 · 모르는 값은 무시", () => {
  const s = mem(), e = createEdition(s); e.setLocal("paid"); e.setSpeed(3);
  assert.equal(e.applyAccountEdition("weird"), false); assert.equal(e.edition, "paid"); assert.equal(e.source, "local");
  assert.equal(e.applyAccountEdition("free"), true);
  assert.equal(e.edition, "free"); assert.equal(e.source, "account"); assert.equal(e.speed, 1); assert.equal(e.canPick, false);
  assert.deepEqual(e.setLocal("paid"), { ok: false, reason: "account" }); assert.equal(e.edition, "free");
  const again = createEdition(s); assert.equal(again.source, "account"); assert.equal(again.canPick, false);
  assert.equal(again.applyAccountEdition(true), true); assert.equal(again.edition, "paid");
  assert.equal(again.setSpeed(2).ok, true, "계정 유료판이면 배속은 고를 수 있음");
  again.releaseAccount(); assert.equal(again.source, "local"); assert.equal(again.edition, "paid"); assert.equal(again.setLocal("free").ok, true);
});

test("바뀔 때만 onChange가 알림", () => {
  const e = createEdition(mem()), got = []; const off = e.onChange(s => got.push(`${s.edition}/${s.speed}`));
  e.setLocal("free"); e.setLocal("paid"); e.setSpeed(2); e.setSpeed(2); e.cycleSpeed(); e.cycleSpeed(); off(); e.setSpeed(2);
  assert.deepEqual(got, ["paid/1", "paid/2", "paid/3", "paid/1"]);
});

test("배속 계산 함수", () => {
  assert.equal(normEdition(" PAID "), "paid"); assert.equal(normEdition("무료"), "free"); assert.equal(normEdition(false), "free"); assert.equal(normEdition(1), null);
  assert.equal(effectiveSpeed("free", 3), 1); assert.equal(effectiveSpeed("paid", 3), 3); assert.equal(effectiveSpeed("paid", 5), 1);
  assert.deepEqual([1, 2, 3].map(nextSpeed), [2, 3, 1]);
  assert.equal(simSteps(1, 1), 1); assert.equal(simSteps(1, 3), 3); assert.equal(simSteps(4, 2), 8); assert.equal(simSteps(8, 3), MAX_STEPS); assert.equal(simSteps(0, 0), 1);
});

test("×3(프레임마다 update 3번)으로 1분: 갈매미가 못 가는 칸(벽·건물·물 아닌 곳)에 서 있지 않고, 마을 시간이 3배로 감", () => {
  const run = steps => {
    const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }); for (const n of ["목수", "미니", "꽃", "황금"]) w.addUnitByName(n);
    let bad = 0, checks = 0;
    for (let f = 0; f < 60 * 30; f++) { for (let k = 0; k < steps; k++) w.update(1 / 30);
      if (f % 15) continue;
      for (const u of w.units) { if (u.insideBuildingId || u.swimming || u.sailing || u.state === "Held") continue; checks++;
        const x = Math.floor(u.x), z = Math.floor(u.z); if (!w.grid.isWalkable(x, z)) bad++; } }
    return { bad, checks, time: w.time };
  };
  const a = run(1), c = run(3);
  assert.ok(c.checks > 100); assert.equal(c.bad, 0, `×3에서 못 가는 칸에 선 횟수 ${c.bad}/${c.checks}`); assert.equal(a.bad, 0);
  assert.ok(Math.abs(c.time / a.time - 3) < 0.01, `시간 비율 ${c.time / a.time}`);
});
