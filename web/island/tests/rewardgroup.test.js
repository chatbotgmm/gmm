// 보상 겹침 풀기(같은 때 같은 갈래는 한 장) · 취향 답례 · 🌟 드문 반짝이. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../src/ui/rewardFx.js";
import * as S from "../src/world/sparkles.js";
import * as B from "../src/world/bond.js";
import { ITEMS } from "../src/data/catalog.js";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";

const bond = (name, id, gift, stage = 1) => R.rewardOf("bondStage", { u: { name, unitId: id }, stage, gift });

test("정 단계: 같은 때 다섯 마리가 아는 사이가 되면 띠 한 장", () => {
  const q = R.makeRewardQueue({ mediumMs: 1000, gap: 0 });
  const names = ["기본", "황금", "물방울", "불씨", "목수"];
  names.forEach((n, i) => q.push(bond(n, `u${i}`, B.thanksFor(1, false, n)), 0));
  assert.equal(q.q.length, 1); assert.equal(q.q[0].count, 5);
  const t = R.rewardText(q.q[0]);
  assert.equal(t.title, "5마리와 아는 사이가 됐어요!");
  assert.match(t.line, /유리병 편지, 바다 유리, 소라 껍데기 외 1개/, "답례 물건 이름은 앞 셋 + 외 n개(같은 물건은 한 번)");
  assert.ok(!/[()]/.test(t.title + t.line), "한 줄 글에 괄호 없음");
  assert.equal(R.rewardText(q.step(0).show).title, "5마리와 아는 사이가 됐어요!");
});

test("정 단계: 보이는 띠에도 붙고(cur), 다른 단계·다른 갈래는 따로", () => {
  const q = R.makeRewardQueue({ mediumMs: 1000, gap: 0 });
  q.push(bond("기본", "a", { id: "bottle", name: "유리병 편지" }), 0); q.step(0);
  assert.equal(q.push(bond("황금", "b", { id: "seaglass", name: "바다 유리" }), 500), "cur", "보이는 동안 온 같은 단계는 보이는 띠에");
  assert.equal(q.cur.count, 2); assert.ok(q.cur.until >= 500 + R.RF_MERGE_MS, "붙으면 조금 더 보임");
  assert.equal(R.rewardText(q.cur).title, "2마리와 아는 사이가 됐어요!");
  q.push(bond("불씨", "c", { id: "pearl", name: "진주" }, 3), 600); q.push(R.rewardOf("wishDone", { u: { name: "꽃" } }), 600);
  assert.equal(q.q.length, 2, "소중한 사이 큰 카드와 소원 띠는 따로");
  assert.equal(q.push(bond("미니", "d", { id: "petal", name: "벚꽃잎 책갈피" }), 99999), true, "끝난 띠에는 안 붙고 기다림에");
});

test("반짝이: 같은 것은 ×n, 여러 가지면 「반짝이 n개 획득!」, 드문 반짝이는 따로 조금 큰 띠", () => {
  const it = id => ITEMS.find(i => i.id === id), q = R.makeRewardQueue({ gap: 0 });
  q.push(R.rewardOf("sparkle", { item: it("acorn") }), 0); q.push(R.rewardOf("sparkle", { item: it("acorn") }), 0);
  assert.equal(R.rewardText(q.q[0]).title, "도토리 획득! ×2");
  const two = R.makeRewardQueue(); two.push(R.rewardOf("sparkle", { item: it("acorn") }), 0); two.push(R.rewardOf("sparkle", { item: it("shell") }), 0);
  assert.equal(R.rewardText(two.q[0]).title, "도토리와 조개껍데기 획득!", "두 가지면 이름으로");
  q.push(R.rewardOf("sparkle", { item: it("postcard") }), 0);
  const t = R.rewardText(q.q[0]); assert.equal(t.title, "반짝이 3개 획득!"); assert.match(t.line, /도토리, 바람에 날아온 엽서가/);
  const rare = R.rewardOf("sparkle", { item: it("goldAcorn") }); q.push(rare, 0);
  assert.equal(rare.rare, true); assert.equal(rare.tier, "medium"); assert.ok(rare.ms > R.RF_MEDIUM_MS); assert.match(rare.line, /도토리의 귀한 모습/);
  assert.equal(q.q.length, 2, "드문 반짝이는 모이지 않음");
});

test("취향 답례: 좋아하는 갈래에서, 모습(form)을 먼저 보고, 모르면 예전 답례", () => {
  assert.equal(B.thanksFor(1, false, "황금").id, "seaglass");
  assert.equal(B.thanksFor(1, false, "물방울").id, "conch");
  assert.equal(B.thanksFor(1, false, "그림자").id, "bottle"); assert.equal(B.thanksFor(3, false, "그림자").id, "snowGlobe", "좋아하는 갈래가 둘이면 단계마다 번갈아");
  assert.equal(B.thanksFor(3, false, "황금").id, "pearl"); assert.equal(B.thanksFor(1, false, "없는모습").id, "bottle"); assert.equal(B.thanksFor(1, false).id, "bottle");
  assert.equal(B.thanksFor(2, true, "황금").kind, "furniture", "정든 사이 가구 답례는 그대로");
  assert.equal(B.gullForm({ name: "반짝이", form: "황금" }), "황금"); assert.equal(B.gullForm({ name: "황금" }), "황금");
  for (const st of [1, 3]) for (const id of Object.values(B.THANKS_BY_TASTE[st])) { assert.ok(B.giftDef(id), id); assert.notEqual(R.itemIcon(id), "🎁", id); }
});

test("취향 답례 × 변신: 아직 기본 모습인 갈매미는 숨은 성향의 취향(선물 반응과 같은 personaOf)으로 → 같은 날 아는 사이가 돼도 저마다 다름", async () => {
  const EV = await import("../src/world/evolve.js");
  const w = World.create(5, seededRandom(2), { wild: true, firstGull: false }), got = {};
  for (const disp of ["sea", "night", "shiny", "big"]) {
    const u = w.addGullOfForm("기본", { disp }); assert.equal(EV.formOf(u), "기본");
    const [t] = w.addBond(u, 5.01); got[disp] = t.gift.id;
    assert.equal(B.giftTier(u, t.gift.id), 2, `${disp}: 답례는 그 갈매미가 좋아하는 것(선물 판의 ♥와 같은 취향)`);
  }
  assert.deepEqual(got, { sea: "conch", night: "icicle", shiny: "seaglass", big: "goby" });
  assert.equal(B.thanksFor(1, false, { form: "기본", disp: "sea" }).id, "conch", "갈매미를 주면 personaOf");
  assert.equal(B.thanksFor(1, false, { form: "황금", disp: "sea", evo: { to: "황금" } }).id, "seaglass", "변신한 뒤엔 모습의 취향");
  assert.equal(B.thanksFor(1, false, { form: "기본", disp: "easy" }).id, "bottle", "좋아하는 갈래가 없으면 예전 답례");
});

// 예전 rollSparkles(드문 반짝이 전): 자리·종류가 바뀌지 않았는지 견줌
function oldRoll(cells, existing, season, rnd, wave = S.SPARKLE_WAVE, night = false) {
  const out = [], room = Math.min(wave, S.sparkleRoom(existing, night));
  for (let i = 0; i < room; i++) {
    const want = S.SPARKLE_WHERE[i % 2], places = [want, ...S.SPARKLE_WHERE.filter(w => w !== want)];
    const order = night ? [...places.map(w => [w, cells.lamp?.[w]]), ...places.map(w => [w, cells[w]])] : places.map(w => [w, cells[w]]);
    for (const [where, list] of order) {
      const kinds = S.sparkleKinds(where, season, night), taken = existing.concat(out), cands = (list || []).filter(([x, z]) => taken.every(s => Math.max(Math.abs(s.x - x), Math.abs(s.z - z)) > S.SPARKLE_GAP));
      if (!kinds.length || !cands.length) continue;
      const [x, z] = cands[Math.floor(rnd() * cands.length)], k = kinds[Math.floor(rnd() * kinds.length)].id; out.push({ k, x, z, where }); break;
    }
  }
  return out;
}

test("드문 반짝이: 반짝이 난수의 자리·종류·순서는 그대로, 약 5%", () => {
  const cells = { beach: [], village: [], lamp: { beach: [[0, 0], [9, 9]], village: [[40, 0]] } };
  for (let i = 0; i < 40; i++) { cells.beach.push([i * 5, 0]); cells.village.push([i * 5, 30]); }
  let n = 0, rare = 0;
  for (const season of ["spring", "summer", "autumn", "winter"]) for (const night of [false, true]) for (let seed = 1; seed <= 400; seed++) {
    const a = seededRandom(seed), b = seededRandom(seed), got = S.rollSparkles(cells, [], season, a, undefined, night), was = oldRoll(cells, [], season, b, undefined, night);
    assert.deepEqual(got.map(({ rare, ...s }) => s), was); assert.equal(a(), b(), "난수를 더 쓰지 않음");
    for (const s of got) { n++; if (s.rare) { rare++; assert.ok(S.rareSparkleOf(s.k)); } }
  }
  assert.ok(rare / n > 0.03 && rare / n < 0.07, `드문 비율 ${rare}/${n}`);
});

test("드문 반짝이: 주우면 드문 물건, 저장·불러오기 그대로, 도감·선물 갈래", () => {
  const w = World.create(7, seededRandom(3), { wild: true }), seen = [];
  w.on("sparkle", e => seen.push(e.item.id));
  w.sparkles.push({ id: 991, k: "shell", x: 1, z: 1, t: 300, rare: true });
  const j = JSON.parse(JSON.stringify(w.serialize())); assert.deepEqual(j.sparkles.find(s => s.k === "shell" && s.x === 1), { k: "shell", x: 1, z: 1, t: 300, r: 1 });
  assert.deepEqual(S.sparklesFromSave([{ k: "shell", x: 1, z: 1, t: 30, r: 1 }, { k: "acorn", x: 5, z: 5, t: 30 }]).map(s => !!s.rare), [true, false]);
  assert.equal(w.pickSparkle(991).id, "pinkShell"); assert.deepEqual(seen, ["pinkShell"]); assert.equal(w.items.pinkShell, 1);
  for (const v of ITEMS.filter(i => i.rareOf)) {
    const base = ITEMS.find(i => i.id === v.rareOf); assert.ok(base?.sparkle, v.id); assert.equal(v.sparkle, undefined, "따로 생기지 않음");
    assert.equal(B.giftDef(v.id).cat, B.giftDef(base.id).cat, "바탕과 같은 선물 갈래"); assert.equal(v.sparkleTime, base.sparkleTime, "밤 반짝이 부탁도 셈");
    assert.notEqual(R.itemIcon(v), "🎁");
  }
  assert.equal(ITEMS.filter(i => i.rareOf).length, ITEMS.filter(i => i.sparkle).length, "반짝이마다 드문 모습 하나");
});

test("소원: 같은 때 이루어진 소원은 한 띠에 누구의 것인지와 축하금 합", () => {
  const q = R.makeRewardQueue();
  q.push(R.rewardOf("wishDone", { u: { name: "꽃", unitId: "a" }, rescue: 10 }), 0); q.push(R.rewardOf("wishDone", { u: { name: "미니", unitId: "b" }, rescue: 0 }), 0);
  const t = R.rewardText(q.q[0]); assert.equal(t.title, "소원 2개 성취!"); assert.equal(t.line, "꽃, 미니의 소원이 이루어져 금고에 🪙10");
});
