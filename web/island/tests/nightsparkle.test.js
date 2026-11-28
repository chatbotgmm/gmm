// 🌙 밤 반짝이·밤 부탁·야행성 조기 소환(아이디어 문서 3번): 밤(world.isNight)에만 생기고, 전기 들어오는 가로등 둘레 먼저, 칸 수·수명은 낮 반짝이와 따로.
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { ITEMS, PERSONA } from "../src/data/catalog.js";
import { GroundType } from "../src/data/types.js";
import { seededRandom } from "../src/util.js";
import * as S from "../src/world/sparkles.js";
import * as D from "../src/world/daily.js";
import * as B from "../src/world/bond.js";

const NIGHT = ["fireflyJar", "starNote", "moonShell", "glowWeed"];
const placeAny = (w, defId, hits = 1e9, near = w.center, from = 2) => { for (let rr = from; rr < 40; rr++) for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) { const r = w.placeBuilding(defId, Math.floor(near.x) + dx, Math.floor(near.z) + dz, 0, null, hits); if (r.ok) return r.building; } return null; };
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
const town = () => { const w = World.create(7, seededRandom(1), { wild: true, firstGull: true }); w.instantBuild = true; return w; };

test("밤 반짝이 4종: ITEMS sparkleTime night, 낮/밤 거르기, 선물 갈래(그림자 편지·불씨 반짝이)", () => {
  const night = ITEMS.filter(i => i.sparkle && i.sparkleTime === "night");   // 드문 모습(rareOf)은 sparkle 키가 없어 따로 셈
  assert.deepEqual(night.map(i => i.id), NIGHT);
  assert.ok(night.every(i => i.gift && ["beach", "village"].includes(i.sparkle) && !i.price && !i.sparkleSeason), "값 없는 플레이어 몫 선물거리(돈을 찍지 않음)");
  for (const season of ["spring", "summer", "autumn", "winter", null]) {
    assert.deepEqual(S.sparkleKinds("village", season, true).map(i => i.id), ["fireflyJar", "starNote"]);
    assert.deepEqual(S.sparkleKinds("beach", season, true).map(i => i.id), ["moonShell", "glowWeed"]);
    assert.ok([...S.sparkleKinds("beach", season), ...S.sparkleKinds("village", season)].every(i => !i.sparkleTime), "낮엔 밤 반짝이가 안 섞임");
  }
  assert.deepEqual(NIGHT.map(id => B.giftDef(id).cat), ["shiny", "letter", "sea", "plant"]);
  assert.equal(B.giftTier("그림자", "starNote"), 2); assert.equal(B.giftTier("불씨", "fireflyJar"), 2);
  assert.ok(S.isNightSparkle("moonShell") && S.isNightSparkle({ k: "glowWeed" }) && !S.isNightSparkle("shell"));
  assert.equal(S.sparkleLife("fireflyJar"), S.SPARKLE_NIGHT_LIFE); assert.equal(S.sparkleLife("shell"), S.SPARKLE_LIFE);
});

test("밤엔 밤 반짝이만 · 낮엔 낮 반짝이만 · 칸 수는 따로(낮 2 꽉 차도 밤 1) · 밤 수명 1800초 · 해 뜨면 20초 안에 사라짐", () => {
  const w = town(); assert.equal(S.SPARKLE_NIGHT_MAX, 1);
  w.spawnSparkles(); w.spawnSparkles(); assert.equal(w.sparkles.length, S.SPARKLE_MAX); assert.ok(w.sparkles.every(s => !S.isNightSparkle(s)));
  w.isNight = true;
  const a = w.spawnSparkles(); assert.equal(a.length, 1, "낮 반짝이가 꽉 차도 밤 반짝이 자리는 따로");
  assert.ok(a.every(s => NIGHT.includes(s.k) && s.t === S.SPARKLE_NIGHT_LIFE));
  assert.deepEqual(w.spawnSparkles(), [], "밤 반짝이 1개면 건너뜀");
  assert.equal(w.sparkles.filter(S.isNightSparkle).length, S.SPARKLE_NIGHT_MAX);
  for (const s of w.sparkles) assert.ok(S.sparkleCellFree(w, s.x, s.z));
  for (let i = 0; i < w.sparkles.length; i++) for (let k = i + 1; k < w.sparkles.length; k++) assert.ok(cheb(w.sparkles[i], w.sparkles[k]) > S.SPARKLE_GAP, "간격 규칙은 낮·밤 모두");
  for (const s of w.sparkles) if (!S.isNightSparkle(s)) s.t = 1;   // 낮 반짝이는 그대로 600초(밤에 새로 생기지 않음)
  w.stepSparkles(2); assert.equal(w.sparkles.length, 1); assert.ok(w.sparkles.every(S.isNightSparkle));
  w.stepSparkles(700); assert.equal(w.sparkles.length, 1, "마을 하루(600초)보다 오래 남음 · 그사이 회차는 꽉 차서 건너뜀");
  // 해가 뜸
  w.isNight = false; w.stepSparkles(0.1); assert.ok(w.sparkles.every(s => s.t <= S.SPARKLE_DAWN_FADE));
  w.stepSparkles(S.SPARKLE_DAWN_FADE); assert.equal(w.sparkles.length, 0, "밤 전용: 낮까지 안 남음");
  const d = w.spawnSparkles(); assert.ok(d.length > 0 && d.every(s => !S.isNightSparkle(s)));
});

test("가로등 둘레 먼저: 전기 들어오는 다 지은 가로등 3칸 안 · 전기 없는 가로등은 아님 · 낮엔 가로등과 상관없음", () => {
  const w = town(), far = { x: w.center.x + 14, z: w.center.z + 6 };
  const lamp = placeAny(w, "streetlamp", 1e9, far); assert.ok(lamp && w.isDone(lamp)); assert.equal(w.powered(lamp), false);
  let cells = S.sparkleCells(w); assert.equal(cells.lamp.beach.length + cells.lamp.village.length, 0, "전기 없음 → 가로등 칸 없음");
  const mill = placeAny(w, "windmill", 1e9, far, 4); assert.ok(mill && w.isDone(mill)); assert.equal(w.powered(lamp), true);
  cells = S.sparkleCells(w); const lit = [...cells.lamp.beach, ...cells.lamp.village];
  assert.ok(lit.length > 0); assert.ok(lit.every(([x, z]) => lamp.cells.some(([lx, lz]) => Math.max(Math.abs(lx - x), Math.abs(lz - z)) <= S.SPARKLE_LAMP_R)));
  w.isNight = true; const made = w.spawnSparkles(); assert.equal(made.length, 1);
  const nearLamp = s => lamp.cells.some(([x, z]) => cheb({ x, z }, s) <= S.SPARKLE_LAMP_R);
  assert.ok(nearLamp(made[0]), "첫 밤 반짝이는 가로등 아래");
  for (const s of made) assert.equal(ITEMS.find(i => i.id === s.k).sparkle, w.grid.get(s.x, s.z).groundType === GroundType.Sand ? "beach" : "village", "모래면 바닷가 종류");
  // 낮 굴림은 예전 그대로(가로등 칸을 따로 고르지 않음): 같은 씨앗 두 마을의 낮 반짝이가 가로등 유무와 상관없이 칸 목록의 앞쪽 규칙을 따름
  const day = S.rollSparkles(cells, [], "summer", seededRandom(4)), dayNoLamp = S.rollSparkles({ beach: cells.beach, village: cells.village }, [], "summer", seededRandom(4));
  assert.deepEqual(day, dayNoLamp);
});

test("해가 지면 첫 밤 반짝이는 20초 안에 · 밤을 모르면(시험 받침) 낮으로 봄 · 저장은 밤/낮 상한을 따로", () => {
  const w = town(); w.stepSparkles(0); w.sparkClock = 0;
  w.isNight = true; w.stepSparkles(0); assert.equal(w.sparkClock, S.SPARKLE_EVERY - S.SPARKLE_FIRST);
  for (let i = 0; i < S.SPARKLE_FIRST * 2 + 1; i++) w.stepSparkles(0.5);
  assert.ok(w.sparkles.some(S.isNightSparkle), "해 지고 20초 뒤 밤 반짝이");
  const v = town(); assert.equal(v.isNight, undefined); v.spawnSparkles(); assert.ok(v.sparkles.every(s => !S.isNightSparkle(s)));
  // 저장·불러오기
  const j = JSON.parse(JSON.stringify(w.serialize())); const back = World.fromJSON(j, seededRandom(1));
  assert.deepEqual(back.sparkles.map(s => [s.k, s.x, s.z, s.t]), w.sparkles.map(s => [s.k, s.x, s.z, s.t]));
  const list = [...Array(8)].map((_, i) => ({ k: "shell", x: i * 5, z: 1, t: 10 })).concat([...Array(5)].map((_, i) => ({ k: "moonShell", x: i * 5, z: 9, t: 1500 })), [{ k: "shell", x: 3, z: 3, t: 900 }]);
  const got = S.sparklesFromSave(list);
  assert.equal(got.filter(s => s.k === "shell").length, S.SPARKLE_MAX); assert.equal(got.filter(s => s.k === "moonShell").length, S.SPARKLE_NIGHT_MAX);
  // 예전 저장(낮 6·밤 3까지 있던 때): 새 상한 2·1로 줄임 — 드문 반짝이 먼저, 그다음 저장 차례(같은 저장이면 늘 같은 것) · 남은 것의 차례는 저장 차례
  const old = [{ k: "shell", x: 0, z: 0, t: 50 }, { k: "acorn", x: 5, z: 0, t: 60 }, { k: "moonShell", x: 0, z: 9, t: 900 }, { k: "goby", x: 10, z: 0, t: 70 },
    { k: "postcard", x: 15, z: 0, t: 80, r: 1 }, { k: "glowWeed", x: 5, z: 9, t: 800, r: 1 }, { k: "seaglass", x: 20, z: 0, t: 90 }, { k: "moonShell", x: 10, z: 9, t: 700 }, { k: "clover", x: 25, z: 0, t: 99 }];
  const trim = S.sparklesFromSave(old); assert.deepEqual(S.sparklesFromSave(old), trim, "결정적");
  assert.deepEqual(trim.map(s => [s.k, s.x, !!s.rare]), [["shell", 0, false], ["postcard", 15, true], ["glowWeed", 5, true]], "드문 엽서·드문 야광 해초는 남고, 보통 것은 저장 차례로");
  const ow = town(); const oj = JSON.parse(JSON.stringify(ow.serialize())); oj.sparkles = old; const ob = World.fromJSON(oj, seededRandom(1));
  assert.ok(ob.sparkles.filter(s => !S.isNightSparkle(s)).length <= S.SPARKLE_MAX && ob.sparkles.filter(S.isNightSparkle).length <= S.SPARKLE_NIGHT_MAX, "불러온 마을도 새 상한 안");
  assert.ok(!got.some(s => s.t === 900), "낮 반짝이 수명(600초)을 넘는 것은 버림");
});

test("밤 부탁: 밤에 고를 때만 후보 · 밤 반짝이 2개 주우면 채움(낮 반짝이는 안 셈) · 저장에서 읽힘", () => {
  const req = D.DAILY_POOL.find(d => d.id === "nightSparkle"); assert.ok(req); assert.equal(req.need, 2);
  const w = town(); assert.equal(req.ok(w), false); w.isNight = false; assert.equal(req.ok(w), false); w.isNight = true; assert.equal(req.ok(w), true);
  let key = null; for (let d = 1; d <= 400 && !key; d++) { const k = `2026-${String(1 + (d % 12)).padStart(2, "0")}-${String(1 + (d % 28)).padStart(2, "0")}-${d}`; if (D.rollDaily(k, w).reqs.some(r => r.id === "nightSparkle")) key = k; }
  assert.ok(key, "밤에는 고를 수 있음");
  w.isNight = false; assert.ok(!D.rollDaily(key, w).reqs.some(r => r.id === "nightSparkle"), "같은 날짜라도 낮에 고르면 안 낌");
  // 자정~새벽(자정에 날짜가 바뀌며 고를 때)은 밤이어도 안 낌: 그 부탁이 그날 낮까지 남아 낮에만 하는 사람의 도장을 막으므로. 저녁 밤은 낌
  w.isNight = true; w.hour = 0; assert.equal(req.ok(w), false); w.hour = 4.5; assert.ok(!D.rollDaily(key, w).reqs.some(r => r.id === "nightSparkle"), "자정 넘어 고르면 안 낌");
  w.hour = 21; assert.equal(req.ok(w), true); w.hour = null;
  w.isNight = true; w.daily = D.rollDaily(key, w);
  w.isNight = false; const day = w.spawnSparkles()[0]; w.pickSparkle(day.id);
  const r = () => w.daily.reqs.find(q => q.id === "nightSparkle"); assert.equal(r().have, 0, "낮 반짝이는 안 셈");
  w.isNight = true; const ns = [];   // 밤 반짝이는 한 번에 1개(SPARKLE_NIGHT_MAX): 주우면 다음 회차에 또 하나 → 2개 부탁은 회차 두 번(해 지고 20초 + 300초쯤)
  for (let k = 0; k < 2; k++) {
    const [s] = w.spawnSparkles(); assert.ok(s && S.isNightSparkle(s)); assert.deepEqual(w.spawnSparkles(), [], "줍기 전엔 더 안 생김");
    const it = w.pickSparkle(s.id); assert.equal(it.id, s.rare ? S.rareSparkleOf(s.k).id : s.k); ns.push(it.id);
  }
  assert.equal(r().have, 2); assert.equal(ns.reduce((n, id) => n + (w.items[id] > 0 ? 1 : 0), 0), 2, "주운 밤 반짝이는 내 주머니로");
  assert.deepEqual(D.dailyFromSave(JSON.parse(JSON.stringify(w.daily))).reqs.find(q => q.id === "nightSparkle").have, 2);
});

test("밤 친구 일찍(SUMMON_FIRST 대신): 성향 덱에서 밤 성향이 앞 3마리 안 — 셋째쯤 소환되는 기본 갈매미가 반야행성으로 밤에 깨어 있음", async () => {
  const EV = await import("../src/world/evolve.js"), CH = await import("../src/units/chrono.js");
  for (const seed of [1, 7, 42]) assert.ok([0, 1, 2].some(n => EV.dispFor(seed, n) === "night"), `씨앗 ${seed}`);
  const u = { form: "기본", disp: "night", evo: null };
  assert.equal(CH.nightOwl(u), true, "별조각을 주울 수 있음"); assert.equal(CH.fatigueMult(u, { isNight: true }), 1); assert.equal(CH.fatigueMult(u, { isNight: false }), CH.HALF_NIGHT_FATIGUE);
});
