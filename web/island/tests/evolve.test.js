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

// ---------------------------------------------------------------- 월드에서(World + evolve)
import { World, EVO_FX_SECS } from "../src/world/World.js";
import { NEWS_DAY_SECS } from "../src/world/news.js";
import { maybeHint } from "../src/units/unitBrain.js";
import { Poke } from "../src/units/poke.js";
import { giftTier } from "../src/world/bond.js";
import { BUILDINGS } from "../src/data/catalog.js";
import * as M from "../src/units/mind.js";
import { checkPlacement } from "../src/world/placement.js";

const wild = (seed = 3) => World.create(7, seededRandom(seed), { wild: true });
const ready = (w, d = "house") => { const c = w.center;
  for (let r = 4; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + 6 + Math.cos(a) * r), z = Math.floor(c.z + 9 + Math.sin(a) * r);
    if (checkPlacement(w.grid, BUILDINGS[d], x, z, 0, w.units).ok) return w.placeBuilding(d, x, z, 0, null, 1e9).building; }
  return null; };
const town = n => { const w = wild(); for (let k = 1; k < n; k++) ready(w); const us = []; for (let k = 0; k < n; k++) us.push(w.summon()); return { w, us }; };
const free = u => { u.state = "Idle"; u.path = null; u.once = null; u.insideBuildingId = null; u.timer = 5; };
/** 마을 시간을 날 단위로 건너뜀(판정은 stepEvolve가 날이 바뀐 걸 보고 한 번) */
const skipDays = (w, d) => { for (const u of w.units) if (!u.evoFx) u.state = "Sleep"; w.time += d * NEWS_DAY_SECS; w.stepEvolve(0); };   // 자는 동안 날이 바뀜(차례만 정하고 연출은 깨어나 한가할 때)

test("소환은 무조건 🥚 기본: 세 마리 모두 기본 모습·고유 이름·서로 다른 숨은 성향 · 카드/화면에 성향은 안 보임(저장에는 있음)", () => {
  const { w, us } = town(3);
  assert.deepEqual(us.map(u => u.form), ["기본", "기본", "기본"]);
  assert.equal(new Set(us.map(u => u.name)).size, 3); assert.ok(us.every(u => !["기본", "미니", "목수"].includes(u.name)));
  assert.equal(new Set(us.map(u => u.disp)).size, 3); assert.ok(us.every(u => u.evo === null));
  assert.deepEqual(us.map(u => u.unitId), ["u10", "u11", "u12"]);
  assert.ok(us.some(u => u.disp === "night"), "앞 3마리 안에 밤 성향(밤 반짝이·별조각)");
});

test("숨은 성향 단서: 🔍 말풍선(성향 대사·하루 3번까지)·관찰 노트 · 선물 반응 · 톡 3번에 1번 성향 대사·몸짓", () => {
  const w = wild(); const u = w.addGullOfForm("기본", { disp: "timid" }); free(u);
  let shown = null; for (let t = 0; t < 4000 && !shown; t += 0.25) { w.time = t; if (maybeHint(u, w)) shown = u.emoteText; }
  assert.ok(shown?.startsWith("🔍 "), shown); assert.ok(EV.HINT_LINES.timid.includes(shown.slice(3)));
  assert.equal(u.notes.at(-1).text, EV.HINT_NOTE.timid);
  const day0 = Math.floor(w.time / 600) * 600; let n = 1; for (let t = w.time + 0.25; t < day0 + 599; t += 0.25) { w.time = t; if (maybeHint(u, w)) n++; }
  assert.ok(n <= 3, `하루 3번까지(${n})`);
  assert.equal(giftTier(u, "postcard"), 2, "소심 = 편지를 좋아함"); assert.equal(giftTier(u, "goby"), 0, "물고기는 꺼림");
  const p = new Poke(w, 1), acts = []; for (let i = 0; i < 3; i++) { p.step(5); free(u); acts.push(p.poke(u, { x: u.x + 3, z: u.z }).act); }
  assert.equal(acts[2], "flee", "셋째 톡: 소심 → 흠칫 도망"); assert.ok(u.notes.some(x => /톡/.test(x.text)));
  const sea = w.addGullOfForm("기본", { disp: "sea" }), done = w.addGullOfForm("물방울");
  assert.equal(giftTier(sea, "shell"), 2); assert.equal(giftTier(done, "postcard"), 1, "변신한 모습은 모습 취향(PERSONA)");
});

test("자란 방식이 결과를 바꿈(월드): 같은 성향 둘 — 하나는 바다에 자주 데려다 놓고, 하나는 꽃을 선물 → 다른 모습", () => {
  const w = wild(); const a = w.addGullOfForm("기본", { disp: "easy", job: "builder" }), b = w.addGullOfForm("기본", { disp: "easy", job: "builder" });
  a.bond = b.bond = 6; w.items.blossom = 30;
  for (let d = 0; d < 4; d++) {
    w.time = d * NEWS_DAY_SECS + 10;
    for (let k = 0; k < 4; k++) { w.noteGrowth(a, "craft", 3, "job"); w.noteGrowth(b, "craft", 3, "job"); }
    for (let k = 0; k < 6; k++) w.noteGrowth(a, "sea", 1, "player");          // 바닷가에 자주 데려다 놓음(dropGrowth와 같은 몫)
    for (let k = 0; k < 2; k++) assert.ok(w.giveGift(b, "blossom"));            // 꽃 선물(plant → green +3)
  }
  const fa = EV.pickForm(a, w.seed).form, fb = EV.pickForm(b, w.seed).form;
  assert.equal(fa, "물방울"); assert.equal(fb, "꽃"); assert.ok(b.growth.green >= 12, "꽃 선물이 green으로");
});

test("들어서 내려놓기 손잡이: 바다 곁 → sea +1 (60초에 한 번) · 다른 갈매미 곁 → social", () => {
  const w = wild(); const u = w.addGullOfForm("기본", { disp: "craft" }), o = w.addGullOfForm("기본", { disp: "sea" });
  let wx = null; for (let r = 0; r < 80 && !wx; r++) for (let k = 0; k < 32 && !wx; k++) { const x = Math.floor(w.center.x + Math.cos(k / 5) * r), z = Math.floor(w.center.z + Math.sin(k / 5) * r); if (w.grid.isWalkable(x, z) && w.grid.isWater(x + 1, z)) wx = [x, z]; }
  assert.ok(wx); w.time = 100;
  assert.equal(w.dropGrowth(u, wx[0] + 0.5, wx[1] + 0.5), "sea"); assert.equal(u.growth.sea, 1);
  assert.equal(w.dropGrowth(u, wx[0] + 0.5, wx[1] + 0.5), null, "60초에 한 번"); w.time += 61;
  o.x = 3.5 + Math.floor(w.center.x); o.z = Math.floor(w.center.z) + 0.5; o.insideBuildingId = null;
  assert.equal(w.dropGrowth(u, o.x + 0.6, o.z), "social");
});

test("변신 시기와 연출: 3일 + 아는 사이 + 카운터 12 → 그날 차례 · 한가할 때 2.2초 연출, 빛이 가장 밝을 때 모습이 바뀜 · 하루 한 마리 · 이름·직업 그대로", () => {
  const { w, us } = town(3); const [a, b] = us; const name = a.name, job = a.job;
  for (const u of us) { u.bond = 6; u.growth = { craft: 3, sea: 12 }; }
  skipDays(w, 2); assert.deepEqual(w.evoPending, [], "2일째는 아직");
  skipDays(w, 1); assert.equal(w.evoPending.length, 1, "하루 한 마리"); assert.equal(w.evoPending[0], a.unitId, "먼저 온 갈매미부터");
  const ev = [], st = []; w.on("evolve", e => ev.push(e)); w.on("evolveStart", e => st.push(e));
  a.state = "Sleep"; w.stepEvolve(0.1); assert.equal(st.length, 0, "자는 중엔 미룸"); free(a); w.stepEvolve(0.1); assert.equal(st.length, 1);
  assert.ok(a.evoFx); for (let t = 0; t < EVO_FX_SECS * 0.45; t += 0.05) w.stepEvoFx(a, 0.05);
  assert.equal(a.form, "기본", "빛이 커지는 동안엔 그대로"); for (let t = 0; t < EVO_FX_SECS * 0.1; t += 0.05) w.stepEvoFx(a, 0.05);
  assert.equal(a.form, "물방울", "가장 밝을 때 바뀜"); assert.equal(ev.length, 0); for (let t = 0; t < EVO_FX_SECS; t += 0.05) if (a.evoFx) w.stepEvoFx(a, 0.05);
  assert.equal(ev.length, 1); assert.equal(ev[0].to, "물방울"); assert.equal(ev[0].from, "기본");
  assert.equal(a.name, name); assert.equal(a.job, job, "직업은 그대로"); assert.equal(a.rarity, "rare", "변신 → 희귀"); assert.ok(a.evo && a.evo.to === "물방울");
  assert.ok(w.formsSeen.has("물방울")); assert.equal(ev[0].first, true, "도감에 새 모습");
  skipDays(w, 1); assert.equal(w.evoPending.length, 1); assert.notEqual(w.evoPending[0], a.unitId, "한 번 변신하면 끝");
  void b;
});

test("6일이면 돌보지 않아도 변신(카운터가 적으면 든든한 기본으로 남음: 칭호 + 정 +3) · 판정은 저장된 evoDay 기준(불러온 직후 가짜 날 바뀜 없음)", () => {
  const { w, us } = town(1); const u = us[0];
  skipDays(w, 5); assert.deepEqual(w.evoPending, []); skipDays(w, 1); assert.deepEqual(w.evoPending, [u.unitId]);
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(1)); assert.equal(back.evoDay, w.evoDay);
  back.stepEvolve(0); assert.deepEqual(back.evoPending, [], "같은 날이면 다시 판정 안 함");
  const bond0 = u.bond; w.startEvolve(u); while (u.evoFx) w.stepEvoFx(u, 0.1);
  assert.equal(u.form, "기본"); assert.equal(u.evo.stayed, true); assert.equal(u.title, "든든한"); assert.equal(u.bond, bond0 + 3); assert.equal(u.rarity, "common");
});

test("evolve()는 난수를 쓰지 않음: 호출 하나의 앞뒤로 rnd·wrnd·hrnd·skyRnd·sparkRnd 다음 값이 같음", () => {
  const mk = () => { const { w, us } = town(2); us[0].growth = { sea: 14 }; return { w, u: us[0] }; };
  const A = mk(), B = mk(); A.w.evolve(A.u, "물방울");
  for (const k of ["rnd", "wrnd", "hrnd", "skyRnd", "sparkRnd"]) if (typeof A.w[k] === "function") assert.equal(A.w[k](), B.w[k](), k);
});

test("드문 모습: 미니는 영웅·몸이 작아짐 · 천직이면 한 단계 더 · 밀린 갈매미가 3마리 넘으면 하루 두 마리", () => {
  const { w, us } = town(5); const [a, b] = us;
  w.evolve(a, "미니"); assert.equal(a.rarity, "epic"); assert.ok(a.scale < 1);
  b.job = "farmer"; w.evolve(b, "꽃"); assert.equal(b.rarity, "epic", "꽃 = 농부 천직");
  const { w: w2 } = town(5); skipDays(w2, 6); assert.equal(w2.evoPending.length, 2);
});

test("자이언트: 작은 집엔 못 들어가고 문 앞에서 잠(밖 잠 벌 없음) · giant 소원 · 자이언트의 집이 다 지어지면 이사(같이 살던 갈매미가 주인 · 대출 그대로)", () => {
  const { w, us } = town(2); const [g, mate] = us; w.instantBuild = true;
  const h = [...w.buildings.values()].find(b => BUILDINGS[b.defId].house); h.owner = g.unitId; h.mates = [mate.unitId]; g.home = h.id; mate.home = h.id; g.loan = { left: 12, per: 2 };
  w.evolve(g, "자이언트"); assert.equal(g.form, "자이언트"); assert.ok(g.scale > 1.3); assert.equal(g.rarity, "epic");
  assert.equal(w.canEnter(g, h), false, "몸이 커서 작은 집에 못 들어감"); assert.equal(w.canEnter(mate, h), true);
  assert.ok(w.wishes.some(x => x.id === "giant" && x.unitId === g.unitId), "giant 소원(상한과 상관없이)");
  assert.ok(w.newsLog.some(n => /자이언트의 집이 필요해요/.test(n.text)));
  free(g); g.needs.energy = 5; g.sleptOutAt = undefined; w.isNight = true;
  for (let t = 0; t < 120 && g.state !== "Sleep"; t += 0.1) { g.full = 90; w.update(0.1); }
  assert.equal(g.state, "Sleep", "문 앞에서 잠"); assert.ok(!g.insideBuildingId); assert.ok(Math.hypot(g.x - h.door.x - 0.5, g.z - h.door.z - 0.5) < 2.5, "집 문 앞");
  assert.equal(g.sleptOutAt, undefined, "기다리는 동안 밖 잠 벌 없음");
  const gh = ready(w, "giantHouse"); assert.ok(gh); w.evoJudge();
  assert.equal(g.home, gh.id); assert.equal(gh.owner, g.unitId); assert.equal(h.owner, mate.unitId, "같이 살던 갈매미가 주인"); assert.deepEqual(h.mates, []);
  assert.deepEqual(g.loan, { left: 12, per: 2 }, "대출 그대로"); assert.ok(!w.wishes.some(x => x.id === "giant"));
  assert.equal(w.canEnter(g, gh), true); assert.equal(w.summonInfo().gulls, 1, "이사한 자이언트는 보통 집 자리를 안 셈");
});

test("같은 모습 여럿 + 고유 이름: 물방울 셋은 이름이 모두 다르고 저장·불러오기 뒤에도 그대로 · 이름 바꾸기 규칙", () => {
  const w = wild(); const xs = [w.addGullOfForm("물방울"), w.addGullOfForm("물방울"), w.addGullOfForm("물방울")];
  assert.equal(new Set(xs.map(u => u.name)).size, 3); assert.ok(xs.every(u => u.form === "물방울" && u.evo?.to === "물방울"));
  assert.equal(w.renameGull(xs[0].unitId, xs[1].name).ok, false, "겹치는 이름"); assert.equal(w.renameGull(xs[0].unitId, "<b>x</b>").ok, false, "태그 글자");
  assert.equal(w.renameGull(xs[0].unitId, "물방울").ok, false, "모습 이름"); assert.equal(w.renameGull(xs[0].unitId, "가나다라마바사아자").ok, false, "8자 넘음");
  const ev = []; w.on("rename", e => ev.push(e));
  assert.deepEqual(w.renameGull(xs[0].unitId, "  파도 "), { ok: true, reason: "", name: "파도" }); assert.equal(xs[0].name, "파도"); assert.equal(ev.length, 1);
  const back = World.fromJSON(JSON.parse(JSON.stringify(w.serialize())), seededRandom(1));
  assert.deepEqual(back.units.map(u => [u.unitId, u.name, u.form]), xs.map(u => [u.unitId, u.name, u.form]));
  const j = w.serialize(); j.units[1].name = "<img src=x>"; const bad = World.fromJSON(JSON.parse(JSON.stringify(j)), seededRandom(1));
  assert.ok(/^[가-힣A-Za-z0-9 ·\-]+$/.test(bad.units[1].name), "불러올 때도 이름 검사");
});

test("저장·불러오기: id·이름·모습·성향·자란 방식·변신·직업·희귀도·자리·친구(id) · 이름을 바꿔도 친구·꿈 열쇠가 안 흔들림", () => {
  const { w, us } = town(3); const [a, b, c] = us;
  w.befriend(a, b, 6); M.befriend(a, c, 3); a.growth = { sea: 4.26 }; w.evolve(c, "그림자"); a.guess = "sea";
  w.renameGull(b.unitId, "새이름");
  const j = JSON.parse(JSON.stringify(w.serialize())); assert.equal(j.gulls, 1); assert.equal(j.minClient, "gulls1");
  assert.deepEqual(j.units.find(x => x.id === a.unitId).friends, { [b.unitId]: 6, [c.unitId]: 3 });
  const back = World.fromJSON(j, seededRandom(4)), by = id => back.units.find(u => u.unitId === id);
  assert.deepEqual(back.units.map(u => [u.unitId, u.name, u.form, u.disp, u.job, u.rarity]), us.map(u => [u.unitId, u.name, u.form, u.disp, u.job, u.rarity]));
  assert.equal(by(a.unitId).growth.sea, 4.3, "소수 한 자리"); assert.equal(by(a.unitId).guess, "sea"); assert.equal(by(c.unitId).evo.to, "그림자");
  assert.equal(M.affinity(by(a.unitId), by(b.unitId)), 6); assert.ok(Math.abs(by(a.unitId).x - a.x) < 0.01, "자리");
  assert.equal(back.nextGullNo, w.nextGullNo); assert.equal(back.gullsMade, 3); assert.ok(back.formsSeen.has("그림자"));
  const s = back.summon(); assert.equal(s, null, "집 자리 없음"); ready(back); const n = back.summon(); assert.equal(n.unitId, "u13", "번호가 이어짐");
});

test("옛 저장 옮기기: 이름 = 모습이던 저장(u1~u9 · 친구 이름 맵 · 당번 의사·설계비·옆집 단짝 이름) → id로 잇고, 모습·변신이 채워지고, 새 이름(고유) · 다시 저장해도 그대로", () => {
  const w = World.create(7, seededRandom(3)); const [base, , , , , drop, , , carp] = w.units;
  w.befriend(drop, carp, 7); const h = [...w.buildings.values()].find(b => BUILDINGS[b.defId].house) || w.placeBuilding("house", 38, 26, 0, null, 1e9).building;
  const j = JSON.parse(JSON.stringify(w.serialize()));
  delete j.gulls; delete j.minClient; delete j.nextGullNo; delete j.gullsMade; delete j.formsSeen; delete j.evoDay;
  const nm = Object.fromEntries(w.units.map(u => [u.unitId, u.name]));
  for (const u of j.units) { for (const k of ["id", "form", "disp", "growth", "born", "evo", "job", "rarity", "tribe", "x", "z"]) delete u[k]; u.friends = Object.fromEntries(Object.entries(u.friends).map(([id, v]) => [nm[id], v])); }
  const hb = j.buildings.find(b => b.id === h.id); hb.owner = "u6"; hb.doctor = undefined; hb.feeTo = "기본";
  const cl = j.buildings[0]; cl.defId = cl.defId; j.wishes = [{ id: "neighbor", unitId: "u6", base: "목수", age: 0 }];
  const back = World.fromJSON(j, seededRandom(1)), by = id => back.units.find(u => u.unitId === id);
  assert.deepEqual(back.units.map(u => u.unitId), ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9"]);
  assert.deepEqual(back.units.map(u => u.form), w.units.map(u => u.name), "모습은 그대로");
  assert.equal(new Set(back.units.map(u => u.name)).size, 9); assert.ok(back.units.every(u => !BUILDINGS.giantHouse.forUnit.includes(u.name) && u.name !== u.form), "새 이름");
  assert.ok(back.renamed?.length === 9); assert.ok(back.newsLog.some(n => /이름을 갖게 됐어요/.test(n.text)));
  assert.equal(by("u6").evo.to, "물방울"); assert.equal(by("u6").disp, "sea"); assert.equal(by("u1").evo, null, "기본은 이제부터 자람"); assert.ok(by("u1").disp);
  assert.equal(M.affinity(by("u6"), by("u9")), 7, "친구가 id로 이어짐"); assert.equal(back.buildings.get(h.id).owner, "u6");
  assert.equal(back.buildings.get(h.id).feeTo, "u1", "설계비 받은 갈매미 이름 → id"); assert.equal(back.wishes[0].base, "u9", "옆집 단짝 이름 → id");
  assert.equal(back.nextGullNo, 10); assert.equal(back.gullsMade, 9); assert.equal(back.formsSeen.size, 9);
  const again = World.fromJSON(JSON.parse(JSON.stringify(back.serialize())), seededRandom(1));
  assert.deepEqual(again.units.map(u => [u.unitId, u.name, u.form, u.evo?.to ?? null]), back.units.map(u => [u.unitId, u.name, u.form, u.evo?.to ?? null]), "다시 저장 → 그대로");
  assert.equal(again.renamed, null, "옮기기는 한 번만");
  void base;
});

test("다른 기기 안전: 받은 계정 섬의 갈매미가 크게 줄면 묻기(gullDrop) · 새 판 표시(minClient)는 이 판이 앎", async () => {
  const CS = await import("../src/systems/cloudSync.js");
  const u = n => ({ units: Array.from({ length: n }, () => ({})) });
  assert.equal(CS.gullDrop(u(5), u(0)), true); assert.equal(CS.gullDrop(u(6), u(2)), true); assert.equal(CS.gullDrop(u(6), u(4)), false); assert.equal(CS.gullDrop(u(1), u(0)), false);
  assert.equal(CS.clientOk({ minClient: "gulls1" }), true); assert.equal(CS.clientOk({}), true); assert.equal(CS.clientOk({ minClient: "gulls9" }), false);
});
