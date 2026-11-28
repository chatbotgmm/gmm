// 갈매미 성장·변신(evolve.js + World): 언제나 기본으로 소환, 숨은 성향과 단서, 자란 방식이 결과를 바꿈, 변신 시기, 드문 모습, 자이언트의 집, 같은 모습 여럿·고유 이름, 이름 바꾸기, 저장·옛 저장 옮기기, id로 기억하는 친구.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as EV from "../src/world/evolve.js";
import { simulate, raise } from "../tools/evosim.mjs";
import { seededRandom } from "../src/util.js";

const gull = (disp, job = "builder", growth = {}, id = "u10") => ({ unitId: id, disp, job, growth: { ...growth }, evo: null, bornDay: 0 });

test("pickForm: 같은 밤 성향도 혼자 지내면 그림자, 따뜻하게 지내면 불씨 · 물가 성향도 공사장만 돌면 목수 · 고르게·적게 자라면 기본", () => {
  assert.equal(EV.pickForm(gull("night", "miner", { night: 8, alone: 8, big: 3 })).form, "그림자");
  assert.equal(EV.pickForm(gull("night", "miner", { night: 8, warm: 8, big: 3 })).form, "불씨");
  assert.equal(EV.pickForm(gull("sea", "builder", { craft: 18, sea: 3 })).form, "목수");
  assert.equal(EV.pickForm(gull("sea", "builder", { sea: 10, craft: 6 })).form, "물방울");
  assert.equal(EV.pickForm(gull("craft", "builder", { craft: 3, sea: 2 })).form, "기본", "카운터 12 미만");
  const even = Object.fromEntries(EV.GROWTH_KEYS.map(k => [k, 2]));
  assert.equal(EV.pickForm(gull("easy", "builder", even)).form, "기본", "고르게 자람 + 느긋");
});

test("pickForm: 결정적(같은 씨앗·갈매미·카운터 → 같은 결과) · 드문 관문(비율 미달이면 다음 모습)", () => {
  const u = gull("big", "lumberjack", { big: 14, craft: 4 });
  assert.equal(EV.pickForm(u, 7).form, EV.pickForm({ ...u }, 7).form);
  const low = gull("big", "lumberjack", { big: 6, sea: 6, craft: 6 });            // 먹보 비율 0.33 미만 → 자이언트 못 됨
  assert.notEqual(EV.pickForm(low).form, "자이언트");
  let giants = 0; for (let i = 0; i < 200; i++) if (EV.pickForm(gull("big", "lumberjack", { big: 16, craft: 2 }, `u${i + 10}`)).form === "자이언트") giants++;
  assert.ok(giants > 60 && giants < 140, `성향이 맞으면 반쯤(${giants}/200)`);
});

test("growthAdd: 직업 일 ×0.4 · 하루 상한(스스로 3 · 플레이어 6) · 변신 뒤엔 안 셈", () => {
  const u = gull("sea");
  assert.equal(EV.growthAdd(u, "craft", 5, "job", 0), 2); assert.equal(EV.growthAdd(u, "craft", 5, "job", 0), 1, "스스로 3까지");
  assert.equal(EV.growthAdd(u, "craft", 5, "free", 0), 0);
  assert.equal(EV.growthAdd(u, "craft", 10, "player", 0), 6); assert.equal(u.growth.craft, 9);
  assert.equal(EV.growthAdd(u, "craft", 1, "job", 1), 0.4, "다음 날 상한이 풀림");
  u.evo = { day: 2, from: "기본", to: "목수" }; assert.equal(EV.growthAdd(u, "sea", 3, "free", 3), 0);
});

test("변신 시기: 3일 + 아는 사이 + 카운터 12면 빠른 길 · 6일이면 무조건 · 하루 한 마리(밀리면 두 마리)", () => {
  const u = gull("sea", "fisher", { sea: 12 });
  assert.equal(EV.evoDue(u, 2, 1), false); assert.equal(EV.evoDue(u, 3, 0), false, "정이 없으면 빠른 길 아님");
  assert.equal(EV.evoDue(u, 3, 1), true); assert.equal(EV.evoDue(gull("sea"), 6, 0), true, "늦은 길");
  const many = n => Array.from({ length: n }, (_, i) => ({ ...gull("sea"), unitId: `u${10 + i}`, bornDay: i % 2 }));
  assert.equal(EV.evoQueue(many(3), 7).length, 1); assert.equal(EV.evoQueue(many(5), 7).length, 2);
  assert.equal(EV.evoQueue(many(5), 7)[0].bornDay, 0, "나이 많은 순");
});

test("rarityAfter: 변신 → 희귀 · 드문 모습 → 영웅 · 천직이면 한 단계 더 · 기본으로 남으면 그대로", () => {
  assert.equal(EV.rarityAfter("꽃", "builder"), "rare"); assert.equal(EV.rarityAfter("꽃", "farmer"), "epic");
  assert.equal(EV.rarityAfter("자이언트", "builder"), "epic"); assert.equal(EV.rarityAfter("자이언트", "lumberjack"), "legend");
  assert.equal(EV.rarityAfter("기본", "builder"), null); assert.equal(EV.rarityAfter("목수", "carpenter", "rare"), "epic");
});

test("성향 덱: 처음 8마리는 모두 다르고 밤은 앞 3칸 안 · 씨앗마다 같음", () => {
  for (const seed of [1, 7, 42, 999]) {
    const d = Array.from({ length: 8 }, (_, i) => EV.dispFor(seed, i));
    assert.equal(new Set(d).size, 8); assert.ok(d.indexOf("night") <= 2);
    assert.deepEqual(d, Array.from({ length: 8 }, (_, i) => EV.dispFor(seed, i)));
  }
  assert.ok(EV.DISPS.includes(EV.dispFor(7, 30)));
});

test("단서: 변신 전 선물 취향이 성향마다 겹치지 않게(좋아함 + 꺼림) · 대사는 unitId 해시로 마리마다 다름", () => {
  const sig = d => `${EV.DISP_LIKES[d].join()}|${EV.DISP_DISLIKES[d].join()}`;
  assert.equal(new Set(EV.DISPS.map(sig)).size, EV.DISPS.length);
  const lines = new Set(["u10", "u11", "u12", "u13", "u14", "u15"].map(id => EV.hintLine("sea", id, 0)));
  assert.ok(lines.size >= 2, "같은 성향 여럿이 같은 말을 동시에 하지 않음");
  const p = EV.personaOf({ form: "기본", disp: "night", evo: null }); assert.deepEqual(p.likes, ["ice"]);
  assert.deepEqual(EV.personaOf({ form: "그림자", disp: "night", evo: {} }).likes, ["letter", "ice"], "변신하면 모습 취향");
});

test("분포(몬테카를로 1,000마리: 성향 8 × 직업 7 × 무작위 하루 활동): 기본 10~20% · 자이언트·미니 각 3~8% · 다른 6종 각 8% 이상", () => {
  const n = 1000, r = simulate(n, 1, 4), pct = f => r[f] / n * 100;
  assert.ok(pct("기본") >= 10 && pct("기본") <= 20, `기본 ${pct("기본")}%`);
  for (const f of ["자이언트", "미니"]) assert.ok(pct(f) >= 3 && pct(f) <= 8, `${f} ${pct(f)}%`);
  for (const f of ["물방울", "그림자", "불씨", "목수", "꽃", "황금"]) assert.ok(pct(f) >= 8, `${f} ${pct(f)}%`);
});

test("키운 방식이 결과를 바꿈: 같은 물가 성향·건축가라도 플레이어가 꾸준히 미는 쪽(내려놓기·선물)에 따라 다른 모습", () => {
  const grow = pk => { const u = gull("sea", "builder", {}, "u20");
    for (let d = 0; d < 4; d++) { EV.growthAdd(u, "craft", 10, "job", d); EV.growthAdd(u, "sea", 2, "free", d); EV.growthAdd(u, "social", 1, "free", d); if (pk) EV.growthAdd(u, pk, 5, "player", d); }
    return EV.pickForm(u, 7).form; };
  assert.equal(grow(null), "물방울", "그냥 두면 성향대로");
  assert.equal(grow("green"), "꽃"); assert.equal(grow("shiny"), "황금"); assert.equal(grow("craft"), "목수");
});
