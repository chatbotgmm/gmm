// 잠은 피로(기력)로 · 체질(아침형·야행성): 기력이 가득이면 밤에도 깨고, 지치면 낮에도 잠.
// 아침형은 밤에·야행성은 낮에 피로가 OFF_FATIGUE배로 쌓임(회복은 같음). 카드 표시 · 저장 호환. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { BUILDINGS } from "../src/data/catalog.js";
import * as CH from "../src/units/chrono.js";
import * as M from "../src/units/mind.js";
import * as F from "../src/world/furniture.js";

/** 넓은 섬 + 기본(아침형) + 그림자(야행성). 첫 집은 주인 없음(빈 집 손님) */
function isle(seed = 4) {
  const w = World.create(7, seededRandom(seed), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("그림자");
  return { w, u: w.units.find(o => o.name === "기본"), n: w.units.find(o => o.name === "그림자"), h: [...w.buildings.values()].find(b => BUILDINGS[b.defId].house) };
}
const asleep = o => o.state === "Sleep" || o.insideAct === "sleep";
/** 일하는 동작에 묶어 둠(한 동작이 끝나지 않게): 기력이 닳는 빠르기만 봄 */
const holdChop = o => { o.state = "Chop"; o.once = { key: "Attack", t: 0, len: 1e9, hit: 1e9, onHit: null, then: null }; o.sick = null; };

test("체질: 기본은 아침형, 불씨·그림자는 야행성 · 어긋난 시간 = 아침형의 밤·야행성의 낮 · 밤낮을 모르면 효과 없음", () => {
  const day = { isNight: false }, night = { isNight: true }, none = {};
  assert.equal(CH.isNocturnal({ name: "기본" }), false); assert.equal(CH.isNocturnal({ name: "불씨" }), true); assert.equal(CH.isNocturnal({ name: "그림자" }), true);
  assert.equal(CH.offHours({ name: "기본" }, night), true); assert.equal(CH.offHours({ name: "기본" }, day), false);
  assert.equal(CH.offHours({ name: "그림자" }, day), true); assert.equal(CH.offHours({ name: "그림자" }, night), false);
  assert.equal(CH.fatigueMult({ name: "기본" }, none), 1); assert.equal(CH.fatigueMult({ name: "기본" }, night), CH.OFF_FATIGUE);
  assert.equal(CH.sleepBelow({ name: "기본" }, day), CH.SLEEP_BELOW); assert.equal(CH.sleepBelow({ name: "기본" }, night), CH.SLEEP_BELOW_OFF);
});

test("체질별 피로 배율: 일 10초에 기력 −5.5(맞는 시간) · −8.25(어긋난 시간, ×1.5) — 아침형의 밤·야행성의 낮", () => {
  for (const [who, night, k] of [["기본", false, 1], ["기본", true, CH.OFF_FATIGUE], ["그림자", true, 1], ["그림자", false, CH.OFF_FATIGUE]]) {
    const { w, u, n } = isle(); const o = who === "기본" ? u : n; w.isNight = night;
    for (const g of w.units) { g.full = 90; holdChop(g); g.needs.energy = 80; }
    for (let i = 0; i < 100; i++) { for (const g of w.units) g.full = 90; w.update(0.1); }
    assert.ok(Math.abs((80 - o.needs.energy) - 5.5 * k) < 0.05, `${who} ${night ? "밤" : "낮"}: 기력 −${(80 - o.needs.energy).toFixed(2)} (기대 −${(5.5 * k).toFixed(2)})`);
  }
});

test("잠 회복 속도 값: 밖 0.08 · 건물 안 0.12 · 침대 0.16(초당) — 침대 > 건물 안 > 밖, 기력 25 → 가득에 밖 약 931초", () => {
  assert.deepEqual({ ...M.SLEEP_GAIN }, { out: 0.08, inside: 0.12, bed: 0.16 });
  assert.ok(M.SLEEP_GAIN.bed > M.SLEEP_GAIN.inside && M.SLEEP_GAIN.inside > M.SLEEP_GAIN.out, "침대 > 건물 안 > 밖");
  assert.ok(Object.isFrozen(M.SLEEP_GAIN), "고정 값");
  assert.ok(Math.abs((CH.WAKE_AT - 25) / M.SLEEP_GAIN.out - 931.25) < 1e-6, "한 번 잠(밖, 기력 25 → 99.5) = 74.5 / 0.08 = 931초");
});

test("회복 속도는 체질과 상관없이 같음: 밖에서 자면 초당 +0.08(아침형의 밤·낮, 야행성 모두)", () => {
  for (const night of [false, true]) {
    const { w, u, n } = isle(); w.isNight = night;
    for (const o of [u, n]) { o.state = "Sleep"; o.timer = 999; o.nap = false; o.needs.energy = 30; o.full = 90; }
    for (let i = 0; i < 500; i++) { for (const o of w.units) o.full = 90; w.update(0.1); }
    assert.ok(Math.abs(u.needs.energy - 34) < 0.05 && Math.abs(n.needs.energy - 34) < 0.05, `50초 잠 → 34 (${u.needs.energy.toFixed(2)}, ${n.needs.energy.toFixed(2)})`);
  }
});

test("잠자리별 회복: 빈 집 손님(건물 안) 초당 +0.12 · 내 집 침대 +0.16 · 밖 +0.08 — 같은 50초에 침대가 가장 많이 참", () => {
  const gain = {};
  { const { w, u } = isle(); w.isNight = true; u.state = "Sleep"; u.timer = 999; u.nap = false; u.needs.energy = 30;
    for (let i = 0; i < 500; i++) { u.full = 90; w.update(0.1); } gain.out = u.needs.energy - 30; }
  for (const bed of [false, true]) {
    const { w, u, h } = isle(); w.isNight = true; if (bed) { h.owner = u.unitId; u.home = h.id; F.autoPlace(w, h, "bed"); }
    u.needs.energy = 10; u.state = "Idle"; u.timer = 0; let e0 = -1, t0 = -1, e1 = -1;
    for (let t = 0; t < 400 && e1 < 0; t += 0.1) { u.full = 90; w.update(0.1); const inBed = u.insideBuildingId === h.id && u.insideAct === "sleep";
      if (inBed && e0 < 0) { e0 = u.needs.energy; t0 = t; } else if (inBed && t - t0 >= 50 - 1e-6) e1 = u.needs.energy; }
    assert.ok(e0 >= 0 && e1 >= 0, (bed ? "침대" : "손님") + "로 50초 넘게 잠");
    gain[bed ? "bed" : "inside"] = e1 - e0;
  }
  assert.ok(Math.abs(gain.out - 4) < 0.05, `밖 50초 +${gain.out.toFixed(2)}(기대 +4)`);
  assert.ok(Math.abs(gain.inside - 6) < 0.1, `건물 안 50초 +${gain.inside.toFixed(2)}(기대 +6)`);
  assert.ok(Math.abs(gain.bed - 8) < 0.1, `침대 50초 +${gain.bed.toFixed(2)}(기대 +8)`);
});

test("기력이 가득(피로 0)이면 밤에도 깸: 빈 집에서 자던 아침형이 밤인데 나와서 다른 일을 함 · 밖에서 자던 갈매미도", () => {
  const { w, u, h } = isle(); w.isNight = true; u.needs.energy = 10; u.state = "Idle"; u.timer = 0;
  let slept = -1, out = -1, eOut = 0;
  for (let t = 0; t < 900 && out < 0; t += 0.1) { u.full = 90; w.update(0.1); if (slept < 0 && u.insideBuildingId === h.id && u.insideAct === "sleep") slept = t; else if (slept >= 0 && !u.insideBuildingId) { out = t; eOut = u.needs.energy; } }
  assert.ok(slept >= 0, "지쳐서 빈 집에 들어가 잠"); assert.ok(out > slept, "밤인데 나옴"); assert.ok(eOut >= CH.WAKE_AT, `기력이 가득 차서(${eOut.toFixed(1)})`);
  let back = 0; for (let t = 0; t < 30; t += 0.1) { u.full = 90; w.update(0.1); if (asleep(u)) back++; }
  assert.equal(back, 0, "깬 뒤 30초 동안 다시 자지 않음(밤이라고 억지로 안 잠)");
  // 밖에서 자던 갈매미(잘 곳 없음): 타이머가 남아 있어도 가득 차면 바로 깸
  const g = isle(5); for (const b of g.w.buildings.values()) if (BUILDINGS[b.defId].house) b.owner = 999;
  g.w.isNight = true; g.u.state = "Sleep"; g.u.timer = 999; g.u.nap = false; g.u.needs.energy = 90; let woke = -1;
  for (let t = 0; t < 150 && woke < 0; t += 0.1) { g.u.full = 90; g.w.update(0.1); if (g.u.state !== "Sleep") woke = t; }
  assert.ok(woke >= 0 && Math.abs(woke - 9.5 / 0.08) < 1, `기력 90 → 가득까지 9.5 / 0.08 = 약 119초 만에 깸(${woke.toFixed(1)}초)`);
});

test("기력이 낮으면 낮에도 잠: 아침형 기력 15 → 낮에 빈 집에서 손님으로 잠 · 기력 25는 낮엔 서서 쉬고 밤엔 바로 자러 감", () => {
  const { w, u, h } = isle(); w.isNight = false; u.needs.energy = 15; u.state = "Idle"; u.timer = 0;
  let slept = false; for (let t = 0; t < 120 && !slept; t += 0.1) { u.full = 90; w.update(0.1); if (u.insideBuildingId === h.id && u.insideAct === "sleep") slept = true; }
  assert.ok(slept, "낮에도 지치면 잠");
  for (const night of [false, true]) {
    const g = isle(6); g.w.isNight = night; g.u.needs.energy = 25; g.u.state = "Idle"; g.u.timer = 0; g.u.activity = null; let sleepy = false, rest = false;
    for (let t = 0; t < 3; t += 0.1) { g.u.full = 90; g.w.update(0.1); if (g.u.sleepy || asleep(g.u)) sleepy = true; if (g.u.activity === "rest") rest = true; }
    if (night) assert.ok(sleepy && !rest, "아침형의 밤: 기력 25면 자러 감"); else assert.ok(rest && !sleepy, "낮: 기력 25면 서서 쉼(잠은 20 아래)");
  }
});

test("초반: 첫 갈매미(아침형) 혼자인 섬에서도 기력이 있으면 밤에 일함", () => {
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }); w.instantBuild = true; w.isNight = true;
  const u = w.units[0]; u.needs.energy = 100; let work = 0, sleep = 0;
  for (let t = 0; t < 300; t += 0.1) { u.full = 90; w.update(0.1); if (["Chop", "Mine", "Build", "Farm", "Trade", "Fish", "Improve", "GoChop", "GoMine", "Forage"].includes(u.state)) work += 0.1; if (asleep(u)) sleep += 0.1; }
  assert.ok(work > 30, `밤 5분 동안 일한 시간 ${work.toFixed(0)}초`); assert.ok(sleep < 150, `잔 시간 ${sleep.toFixed(0)}초(절반 아래)`);
});

test("저장 호환: 체질은 이름에서 나와 저장 칸이 늘지 않음(기력·상태는 원래 저장 안 함) · 불러온 뒤에도 체질 배율이 그대로", () => {
  const { w } = isle(); w.isNight = true;
  const save = JSON.parse(JSON.stringify(w.serialize()));
  for (const su of save.units) assert.ok(!Object.keys(su).some(k => /chrono|nocturnal|sleep/i.test(k)), "새 저장 칸 없음: " + Object.keys(su).join(","));
  const back = World.fromJSON(save); back.isNight = true;
  const bu = back.units.find(o => o.name === "기본"), bn = back.units.find(o => o.name === "그림자");
  assert.equal(CH.chronoLabel(bu), "🌅 아침형"); assert.equal(CH.chronoLabel(bn), "🌙 야행성");
  assert.equal(CH.fatigueMult(bu, back), CH.OFF_FATIGUE, "아침형의 밤"); assert.equal(CH.fatigueMult(bn, back), 1);
  for (const g of back.units) { g.full = 90; holdChop(g); g.needs.energy = 80; }
  for (let i = 0; i < 100; i++) { for (const g of back.units) g.full = 90; back.update(0.1); }
  assert.ok(Math.abs(80 - bu.needs.energy - 8.25) < 0.05 && Math.abs(80 - bn.needs.energy - 5.5) < 0.05, `불러온 뒤 일 10초: 기본 −${(80 - bu.needs.energy).toFixed(2)} · 그림자 −${(80 - bn.needs.energy).toFixed(2)}`);
});

test("카드 글: 체질 이름과 지금 피로 영향(어긋난 시간일 때만)", () => {
  assert.equal(CH.chronoLabel({ name: "기본" }), "🌅 아침형"); assert.equal(CH.chronoLabel({ name: "불씨" }), "🌙 야행성");
  assert.equal(CH.chronoNote({ name: "기본" }, { isNight: true }), "밤이라 더 빨리 지쳐요"); assert.equal(CH.chronoNote({ name: "기본" }, { isNight: false }), "");
  assert.equal(CH.chronoNote({ name: "그림자" }, { isNight: false }), "낮이라 더 빨리 지쳐요"); assert.equal(CH.chronoNote({ name: "그림자" }, { isNight: true }), "");
  assert.equal(CH.chronoNote({ name: "기본" }, {}), "", "밤낮을 모르면 없음");
});
