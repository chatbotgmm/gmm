// 쉬기 규칙 시험: 안 피곤하면 쉬지 않고 일하거나 움직이고, 피곤하면 쉬고, 기력이 차면 일어남. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import * as M from "../src/units/mind.js";
import * as J from "../src/world/jobs.js";

const village = (seed, names) => { const w = World.create(seed, seededRandom(seed * 31 + 1), { wild: true }); for (const n of names) w.addUnitByName(n); w.isNight = false; return w; };
const WORK = ["GoChop", "Chop", "GoMine", "Mine", "GoFish", "Fish", "GoBuild", "Build", "GoFarm", "Farm"];

test("쉬기 비중: 기력 50 이상이면 0(안 고름), 그 아래로 내려갈수록 커짐 · 일 사이 숨 고르기는 0.3~1초", () => {
  const u = { needs: { energy: 100, social: 50, fun: 50 } };
  for (const e of [100, 80, 50]) { u.needs.energy = e; assert.equal(M.needMult(u, "rest"), 0, `기력 ${e}: 쉬기 안 고름`); }
  u.needs.energy = 49; const a = M.needMult(u, "rest"); u.needs.energy = 30; const b = M.needMult(u, "rest");
  assert.ok(a > 0 && b > a, "피곤할수록 쉬기를 더 고름");
  u.needs.energy = 100; u.needs.social = 100; assert.ok(M.needMult(u, "enter") < 1, "기력·친구 욕구가 찼으면 집 구경도 덜 감");
  const rnd = seededRandom(5); for (let i = 0; i < 200; i++) { const s = M.pauseSecs(rnd); assert.ok(s >= 0.3 && s <= 1, `숨 고르기 ${s}`); }
  assert.ok(M.TIRED < M.REST_BELOW && M.REST_BELOW < M.REST_UNTIL);
});

test("일손 돕기 목록: 제 일거리가 없을 때 할 일 · 자재가 넉넉하면(창고 + 가방 30) 그 일은 돕지 않음", () => {
  const b = { job: "builder", inv: { wood: 0, stone: 0 } };
  assert.deepEqual(J.helpJobs(b, { wood: 0, stone: 0 }), ["chop", "mine"]);
  assert.deepEqual(J.helpJobs(b, { wood: 9, stone: 2 }), ["mine", "chop"], "모자란 자재부터");
  assert.deepEqual(J.helpJobs(b, { wood: J.HELP_STOCK, stone: 2 }), ["mine"], "나무가 넉넉하면 벌목은 안 도움");
  assert.deepEqual(J.helpJobs(b, { wood: J.HELP_STOCK, stone: J.HELP_STOCK }), [], "둘 다 넉넉하면 돕지 않음(끝없이 모으지 않음)");
  assert.deepEqual(J.helpJobs({ job: "builder", inv: { wood: J.HELP_STOCK, stone: 0 } }, {}), ["mine"], "가방에 든 것도 셈");
  assert.deepEqual(J.helpJobs({ job: "fisher" }, {}), ["chop"]); assert.deepEqual(J.helpJobs({ job: "farmer" }, {}), ["fish"]);
  assert.deepEqual(J.helpJobs({ job: "lumberjack" }, {}), ["mine"]); assert.deepEqual(J.helpJobs({ job: "miner" }, {}), ["chop"]);
});

test("안 피곤하면 쉬지 않음: 지을 것 없는 초반 마을(건축가·나무꾼·낚시꾼)에서 기력 50 이상인 동안 쉬기를 고르지 않고, 제 일이 없어도 일을 도움", () => {
  for (const seed of [7, 11]) {
    const w = village(seed, ["자이언트", "물방울"]), n = {}, restFresh = [], tot = { awake: 0, idle: 0, work: 0 };
    for (const u of w.units) n[u.name] = { work: 0, rest: 0 };
    for (let i = 0; i < 300 * 30; i++) {
      const before = w.units.map(u => u.needs.energy);
      w.update(1 / 30);
      w.units.forEach((u, k) => {
        const resting = u.activity === "rest" || u.state === "Sit" || u.state === "GoSit";
        if (resting) { n[u.name].rest++; if (!u.restSeen) { u.restSeen = true; if (!J.isLazy(u)) restFresh.push(before[k]); } } else u.restSeen = false;
        if (WORK.includes(u.state)) { n[u.name].work++; tot.work++; }
        tot.awake++; if (u.state === "Idle") tot.idle++;
      });
    }
    for (const e of restFresh) assert.ok(e < M.REST_BELOW + 1, `쉬기를 고른 순간 기력 ${e.toFixed(1)}: 피곤할 때만(씨앗 ${seed})`);
    assert.ok(n["기본"].work > 300 * 30 * 0.25, `건축가: 공사장이 없어도 자재를 모음(${n["기본"].work}/9000 틱, 씨앗 ${seed})`);
    assert.ok(n["물방울"].work > 300 * 30 * 0.1, `낚시꾼: 낚시터가 없어도 일을 도움(${n["물방울"].work}/9000 틱, 씨앗 ${seed})`);
    assert.ok(tot.idle / tot.awake < 0.2, `서 있는 시간(Idle) ${(100 * tot.idle / tot.awake).toFixed(1)}% < 20%(씨앗 ${seed})`);
    assert.equal(w.bank.issued, 0, "상인이 없으면 도운 일로 돈이 찍히지 않음");
  }
});

test("피곤하면 쉬고, 기력이 차면 일어남: 기력 25 → 쉬기 → 80쯤에서 다시 움직임(벤치 없으면 서서)", () => {
  const w = village(7, []), u = w.units[0];
  u.needs.energy = 25; u.full = 90; u.state = "Idle"; u.timer = 0; u.activity = null;
  let t = 0, started = -1, ended = -1, eEnd = 0;
  for (; t < 120 && ended < 0; t += 1 / 30) {
    u.full = 90; w.update(1 / 30);
    if (started < 0 && u.activity === "rest") started = t;
    else if (started >= 0 && u.activity !== "rest") { ended = t; eEnd = u.needs.energy; }
  }
  assert.ok(started >= 0 && started < 1, `피곤하면 바로 쉼(${started})`);
  assert.ok(ended > 0, "쉬다가 일어남"); assert.ok(eEnd >= M.REST_UNTIL - 2, `기력이 찬 뒤 일어남(${eEnd.toFixed(1)})`);
  assert.ok(ended - started < 35, `쉬는 시간 ${(ended - started).toFixed(1)}초(끝없이 쉬지 않음)`);
  let again = false; for (let k = 0; k < 30 * 30; k++) { u.full = 90; w.update(1 / 30); if (u.activity === "rest") again = true; }
  assert.equal(again, false, "기력이 찬 뒤 30초 동안은 다시 쉬지 않음");
});

test("밤잠은 그대로: 잘 시간이면 안 피곤해도 자러 감(야행성은 낮에)", () => {
  const w = village(7, ["그림자"]), u = w.units.find(o => o.name === "기본"), n = w.units.find(o => o.name === "그림자");
  w.isNight = true; let uSleep = 0, nSleep = 0;
  for (let k = 0; k < 120 * 30; k++) { for (const o of w.units) o.full = 90; w.update(1 / 30); if (u.state === "Sleep") uSleep++; if (n.state === "Sleep") nSleep++; }
  assert.ok(uSleep > 120 * 30 * 0.8, `밤: 보통 갈매미는 잠(${uSleep}/3600)`); assert.ok(nSleep < 120 * 30 * 0.2, `밤: 야행성은 깨어 있음(${nSleep}/3600)`);
});
