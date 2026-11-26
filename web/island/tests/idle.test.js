// 쉬기 규칙 시험: 안 피곤하면 쉬지 않고 일하거나 움직이고, 피곤하면 쉬고, 기력이 차면 일어남. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import * as M from "../src/units/mind.js";
import * as J from "../src/world/jobs.js";

const village = (seed, names) => { const w = World.create(seed, seededRandom(seed * 31 + 1), { wild: true, firstGull: true }); for (const n of names) w.addUnitByName(n); w.isNight = false; return w; };
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

test("음식 사러 가는 길: 파는 갈매미가 동작 중(밭일·낚시 한 동작)이어도 그만두지 않고 가서 삼(제자리에서 '음식 사러!'만 되풀이하지 않음)", () => {
  const w = village(7, ["꽃"]), u = w.units.find(o => o.name === "기본"), host = w.units.find(o => o.name === "꽃");
  assert.equal(host.job, "farmer"); assert.ok(w.economy, "은행이 있어 사고팖");
  host.inv.food = 6; u.inv.food = 0; u.inv.fish = 0; u.coins = 20; u.full = 20; u.state = "Idle"; u.timer = 0; u.activity = null;
  let sales = 0, quits = 0, tries = 0, prev = u.state; w.on("foodSale", () => sales++);
  for (let k = 0; k < 20 * 30 && !sales; k++) {
    host.once = { key: "Attack", t: 0, len: 1e9, hit: 1e9, onHit: null, then: null };   // 파는 갈매미는 내내 동작 중(밭일 한 동작처럼)
    u.full = 20; w.update(1 / 30);
    if (prev !== "Visit" && u.state === "Visit") tries++; if (prev === "Visit" && u.state === "Idle") quits++;
    prev = u.state;
  }
  assert.equal(sales, 1, `동작 중인 농부에게서 음식을 삼(가려던 횟수 ${tries}, 그만둔 횟수 ${quits})`);
  assert.equal(tries, 1, "한 번 가서 삼"); assert.equal(quits, 0, "가다가 그만두지 않음");
  assert.equal(u.inv.food, 1); assert.equal(host.inv.food, 5);
});

test("피곤하면(기력 30 아래) 동네 고치기를 새로 시작하지 않고 먼저 쉼: 만족도가 낮아도 길 깔기는 쉬고 나서", async () => {
  const { setIdle } = await import("../src/units/unitBrain.js");
  const w = World.create(7, seededRandom(5), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("목수"); w.addUnitByName("불씨");
  const c = w.center, spot = (d, x0, z0) => { for (let r = 0; r < 30; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; };
  const hq = spot("house", c.x + 12, c.z + 10), h = w.placeBuilding("house", hq[0], hq[1], 0).building, mq = spot("market", c.x + 2, c.z + 14); w.placeBuilding("market", mq[0], mq[1], 0);
  const u = w.units.find(o => o.name === "불씨"); u.home = h.id; h.owner = u.unitId; u.inv.stone = 0; w.res.stone = 10; u.coins = 0;
  w.updateRoads(); assert.ok(u.sat < 75, `만족도 ${u.sat}: 고칠 마음이 있음`);
  const trial = energy => {                                                   // 한 번 고르게 해 보고 무엇을 시작했는지
    setIdle(u, w.rnd, w, 0); u.needs.energy = energy; u.full = 90; u.activity = null;
    for (let k = 0; k < 90 && u.state === "Idle" && u.activity !== "rest"; k++) w.update(1 / 30);
    return u.state === "GoImprove" || u.state === "Improve" ? "improve" : u.activity === "rest" || u.state === "GoSit" ? "rest" : u.state;
  };
  const tired = Array.from({ length: 30 }, () => trial(25)), fresh = Array.from({ length: 30 }, () => trial(90));
  assert.ok(fresh.includes("improve"), `안 피곤하면 동네를 고침(${fresh.filter(x => x === "improve").length}/30)`);
  assert.deepEqual(tired.filter(x => x !== "rest"), [], "피곤하면 30번 모두 쉬기부터");
});

test("피곤하면(기력 30 아래) 심부름을 새로 시작하지 않고 먼저 쉼: 가공품을 든 상인도 은행은 쉬고 나서", async () => {
  const { setIdle } = await import("../src/units/unitBrain.js");
  const w = World.create(7, seededRandom(5), { wild: true, firstGull: true }); w.instantBuild = true; w.addUnitByName("목수"); w.addUnitByName("황금"); w.isNight = false;   // 시장을 지으려면 목수가 있어야 함
  const c = w.center, spot = (d, x0, z0) => { for (let r = 0; r < 30; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); if (w.check(d, x, z, 0).ok) return [x, z]; } return null; };
  const mq = spot("market", c.x + 2, c.z + 14); w.placeBuilding("market", mq[0], mq[1], 0);
  const u = w.units.find(o => o.name === "황금"); assert.equal(u.job, "merchant"); assert.ok(w.economy && w.bankB());
  const trial = (energy, bag) => {                                            // 한 번 고르게 해 보고 무엇을 시작했는지
    setIdle(u, w.rnd, w, 0); u.needs.energy = energy; u.full = 90; u.activity = null; u.sat = 100;
    u.goods = { wood: 0, stone: 0, iron: 0 }; u.raw = { wood: 0, stone: 0, iron: 0 }; Object.assign(bag === "goods" ? u.goods : u.raw, { wood: 5 });
    for (let k = 0; k < 90 && u.state === "Idle" && u.activity !== "rest"; k++) w.update(1 / 30);
    return u.activity === "rest" || u.state === "GoSit" ? "rest" : u.state === "Sleep" ? "sleep" : u.state;
  };
  for (let i = 0; i < 10; i++) {
    assert.equal(trial(90, "goods"), "GoBank", "안 피곤하면 가공품을 은행에");
    assert.equal(trial(90, "raw"), "GoMarket", "안 피곤하면 원자재를 가공하러");
    assert.equal(trial(25, "goods"), "rest", "피곤하면 은행보다 쉬기 먼저"); assert.equal(u.goods.wood, 5, "가공품은 그대로 들고 있음");
    assert.equal(trial(25, "raw"), "rest", "피곤하면 가공보다 쉬기 먼저");
    assert.equal(trial(15, "goods"), "sleep", "지쳤으면(기력 20 아래) 잠");
  }
});
