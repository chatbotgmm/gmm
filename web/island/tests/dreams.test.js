// 꿈방울과 잠꼬대(world/dreams.js): 오늘 기억 링버퍼 · 밤에 자는 갈매미만 방울 · 마을 하루 상한 · 잠꼬대 문장 · 꿈속 소원이 다음 소원으로. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { NEWS_DAY_SECS } from "../src/world/news.js";
import { Dreams, remember, freshMemories, dreamTalk, dreamWishFor, dreamWishId, isAsleep, MEMORY_EVENTS, DREAM_MEM, DREAM_DAILY, DREAM_AFTER, DREAM_GAP } from "../src/world/dreams.js";
import { NEWS_EVENTS } from "../src/world/news.js";

const fresh = (seed = 3) => { const w = World.create(7, seededRandom(seed), { wild: true, firstGull: true }); w.instantBuild = true; return w; };
const sleepOut = u => { u.state = "Sleep"; u.insideBuildingId = null; };

test("기억으로 남기는 일은 모두 월드가 실제로 알리는 일 이름(소식 문장이 있는 일)", () => {
  for (const ev of MEMORY_EVENTS) assert.ok(NEWS_EVENTS.includes(ev) || ev === "pet", `${ev}`);
});

test("오늘 기억: 갈매미마다 최근 DREAM_MEM건만, 같은 일이 잇달면 한 번, 마을 하루가 지나면 꿈에 안 나옴", () => {
  const w = fresh(), u = w.units[0];
  for (let i = 0; i < DREAM_MEM + 3; i++) remember(w, "fishRecord", { u, fish: { name: "도미" }, size: 30 + i });
  assert.equal(u.dreamMem.length, DREAM_MEM);
  assert.match(u.dreamMem.at(-1).f, /도미 36센티/);
  remember(w, "pet", { u }); remember(w, "pet", { u }); assert.equal(u.dreamMem.filter(m => m.f.includes("쓰담")).length, 1, "잇단 같은 일은 한 번");
  assert.equal(freshMemories(u, w.time).length, DREAM_MEM);
  assert.equal(freshMemories(u, w.time + NEWS_DAY_SECS + 1).length, 0, "하루 지난 기억은 꿈에 안 나옴");
  assert.ok(!("dreamMem" in w.serialize().units[0]), "기억은 저장하지 않음");
});

test("친구가 되면 두 갈매미 모두 서로를 기억", () => {
  const w = fresh(), a = w.units[0], b = { name: "미니", unitId: 999 };
  remember(w, "friendship", { a, b, stage: 1 });
  assert.match(a.dreamMem[0].f, /미니… 우리 친구/); assert.match(b.dreamMem[0].f, new RegExp(`${a.name}… 우리 친구`));
});

test("방울: 밤에 DREAM_AFTER초 넘게 자는 갈매미만, 낮·깨어 있으면 없음 · 깨면 사라짐", () => {
  const w = fresh(), u = w.units[0], d = new Dreams(w);
  w.isNight = false; sleepOut(u); d.step(); w.time += DREAM_AFTER + 1; d.step(); assert.equal(d.sleepers.length, 0, "낮잠엔 방울 없음");
  w.isNight = true; d.step(); assert.equal(d.sleepers.length, 0, "막 잠듦");
  w.time += DREAM_AFTER; d.step(); assert.deepEqual(d.sleepers, [u]);
  u.state = "Idle"; d.step(); assert.equal(d.sleepers.length, 0, "깨면 사라짐");
  // 집 안에서 자는 것도 잠
  u.state = "Inside"; u.insideBuildingId = 1; u.insideAct = "sleep"; assert.ok(isAsleep(u)); u.insideAct = "warm"; assert.ok(!isAsleep(u));
});

test("상한: 마을 하루에 갈매미마다 DREAM_DAILY개, 다음 날 다시", () => {
  const w = fresh(), u = w.units[0], d = new Dreams(w); w.isNight = true; sleepOut(u);
  w.time = 1; let made = 0, popped = 0;
  for (let t = 0; t < NEWS_DAY_SECS - 2; t += 1) { w.time = 1 + t; const was = d.has(u); d.step(); if (!was && d.has(u)) made++; if (d.has(u) && d.pop(u)) popped++; }
  assert.equal(made, DREAM_DAILY); assert.equal(popped, DREAM_DAILY);
  w.time = NEWS_DAY_SECS + DREAM_GAP + DREAM_AFTER + 5; d.step(); w.time += DREAM_AFTER; d.step();
  assert.ok(d.has(u), "다음 마을 날엔 다시 뜸");
});

test("터뜨리기: 그날 기억으로 잠꼬대, 없으면 기본 꿈 · 두 번 터뜨릴 수 없음 · 돈·정은 그대로", () => {
  const w = fresh(), u = w.units[0], d = new Dreams(w); w.isNight = true; sleepOut(u);
  w.emit("fishRecord", { u, fish: { name: "도미", rarity: "common" }, size: 42, first: false });
  d.step(); w.time += DREAM_AFTER + 1; d.step();
  const coins = u.coins, bond = u.bond, vault = w.bank?.vault;
  const r = d.pop(u); assert.ok(r); assert.match(r.talk, /도미 42센티/); assert.match(r.line, new RegExp(`💤 ${u.name}의 잠꼬대`));
  assert.equal(d.pop(u), null, "이미 터짐");
  assert.equal(u.coins, coins); assert.equal(u.bond, bond); assert.equal(w.bank?.vault, vault);
  const v = { name: "물방울", unitId: 77 }, e = dreamTalk(w, v, 1); assert.ok(e.talk.length > 3); assert.match(e.line, /바다 조개|귀한 물고기/, "기억이 없으면 기본 꿈 + 좋아하는 것");
});

test("꿈속 소원: 미리 본 소원이 그 갈매미의 다음 소원으로 올라옴(난수 순서는 그대로)", () => {
  const w = fresh(5), u = w.units[0]; w.wishes.length = 0;
  const wd = dreamWishFor(w, u); assert.ok(wd, "빌 만한 소원이 있음");
  const r = dreamTalk(w, u, 0); assert.equal(r.wish?.id, wd.id); assert.equal(dreamWishId(u, w.time), wd.id);
  const wish = w.makeWish(); assert.equal(wish.unitId, u.unitId); assert.equal(wish.id, wd.id, "꿈에서 본 그 소원");
  assert.equal(u.dreamWish, null, "한 번 빌면 잊음");
  assert.equal(dreamWishId({ dreamWish: { id: "x", t: 0 } }, 3 * NEWS_DAY_SECS), null, "마을 이틀 지나면 잊음");
  // 같은 씨앗에서 꿈 없이 빈 경우와 난수를 같은 수만큼 씀
  const a = fresh(9), b = fresh(9); a.wishes.length = 0; b.wishes.length = 0; dreamTalk(b, b.units[0], 0);
  a.makeWish(); b.makeWish(); assert.equal(a.wrnd(), b.wrnd(), "소원 고르기 뒤 난수가 같음");
});
