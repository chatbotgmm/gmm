// 🥇 물고기 메달(아이디어 문서 4번): 크기 기록(fishRecord)에서 동·은·금을 셈(따로 저장 안 함), 계절 물고기는 금 기준이 낮음,
// 금메달 4·8·12종 기념 가구(수족관 기증 선물과 같은 방식, 받은 수만 저장), 알림·소식지 문장, 도감 머리.
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { FISH, ITEMS, FURNITURE, UNITS } from "../src/data/catalog.js";
import { seededRandom } from "../src/util.js";
import * as A from "../src/world/aquarium.js";
import * as M from "../src/world/medals.js";
import * as J from "../src/world/jobs.js";
import { newsFor } from "../src/world/news.js";
import { dexCounts, dexHeadHtml } from "../src/ui/appViews.js";

const byId = id => FISH.find(f => f.id === id);

test("메달 판정: t를 거꾸로 셈 — 은 상위 50%, 금 상위 15%(계절 30%), 동은 낚기만 하면", () => {
  const ff = byId("flatfish");
  assert.equal(M.fishMedal(ff, 0), 0); assert.equal(M.fishMedal(ff, undefined), 0);
  assert.equal(M.fishMedal(ff, 30), 1);
  assert.equal(M.medalCut(ff, 2), A.fishSize(ff, 0.5)); assert.equal(M.medalCut(ff, 3), A.fishSize(ff, 0.85));
  assert.equal(M.fishMedal(ff, M.medalCut(ff, 2)), 2); assert.equal(M.fishMedal(ff, M.medalCut(ff, 2) - 0.1), 1);
  assert.equal(M.fishMedal(ff, 78.4), 3, "광어 78.4cm는 금");
  for (const f of FISH) {
    for (const t of [0, 0.2, 0.5, 0.7, 0.85, 1]) assert.ok(Math.abs(M.sizeT(f, A.fishSize(f, t)) - t) < 0.02, `${f.name} t=${t} 거꾸로`);
    assert.equal(M.medalCut(f, 3), A.fishSize(f, f.season ? 0.7 : 0.85), `${f.name} 금 기준`);
    assert.ok(M.medalCut(f, 3) > M.medalCut(f, 2));
  }
  // 실제 크기 정하는 길(sizeNoise → fishSize)로 1만 번: 은 이상 ≈ 50%, 금 ≈ 15%(계절 ≈ 30%)
  for (const f of [byId("tuna"), byId("cod")]) {
    let s = 0, g = 0; const N = 10000;
    for (let i = 0; i < N; i++) { const m = M.fishMedal(f, A.fishSize(f, A.sizeNoise(i * 1.7, 3, i))); if (m >= 2) s++; if (m === 3) g++; }
    assert.ok(Math.abs(s / N - 0.5) < 0.03, `${f.name} 은 이상 ${s / N}`);
    assert.ok(Math.abs(g / N - (f.season ? 0.3 : 0.15)) < 0.03, `${f.name} 금 ${g / N}`);
  }
  assert.deepEqual(M.medalCounts({ flatfish: 78.4, cod: 90, anchovy: 6, nope: 3 }), { gold: 2, silver: 0, bronze: 1 });
  assert.deepEqual(M.medalLine(ff, 78.4), { now: "🥇 78.4cm", next: "" });
  assert.equal(M.medalLine(ff, 31).now, "🥉 31cm"); assert.match(M.medalLine(ff, 31).next, /^다음 🥈 \d+(\.\d)?cm부터$/);
});

test("금메달 기념 가구: 4·8·12종, 낚시로는 안 나오고 이미 있는 가구 모양, 돈을 찍지 않음", () => {
  assert.deepEqual(M.MEDAL_GIFTS.map(g => g.need), [4, 8, 12]);
  for (const g of M.MEDAL_GIFTS) { const it = ITEMS.find(i => i.id === g.item); assert.ok(it?.furniture && FURNITURE[it.furniture]?.shape, g.item); assert.ok(!it.price, "값 없음"); }
  const u = { skills: {}, tribe: "basic" };
  for (let k = 0; k < 2000; k++) assert.ok(!J.rollItem(u, () => k / 2000).medal, "낚시로 안 건짐");
  const w = { fishRecord: {}, items: {}, medalGifts: 0 };
  const gold = n => Object.fromEntries(FISH.slice(0, n).map(f => [f.id, f.cm[1]]));
  w.fishRecord = gold(3); assert.deepEqual(M.grantMedalGifts(w), []); assert.equal(M.medalGiftsEarned(w.fishRecord), 0);
  w.fishRecord = gold(9); assert.deepEqual(M.grantMedalGifts(w).map(g => g.item.id), ["medalRug", "medalLamp"], "밀린 것까지 차례로");
  assert.equal(w.medalGifts, 2); assert.equal(w.items.medalRug, 1);
  assert.deepEqual(M.grantMedalGifts(w), [], "한 번씩만");
  w.fishRecord = gold(16); assert.deepEqual(M.grantMedalGifts(w).map(g => g.item.id), ["medalShelf"]); assert.equal(w.medalGifts, 3);
  assert.equal(M.medalGiftsFromSave(99), 3); assert.equal(M.medalGiftsFromSave("x"), 0); assert.equal(M.medalGiftsFromSave(undefined), 0);
});

test("낚기: landFish가 메달·오른 메달·기념 가구를 돌려주고, 저장엔 받은 수만", () => {
  const w = World.create(7, seededRandom(3), { empty: true }); w.instantBuild = true; const u = w.addUnit(UNITS[5], 5, w.center.x + 0.5, w.center.z + 0.5);
  const land = id => { const f = byId(id), seq = [0, 0.999]; let acc = 0; const ws = FISH.map(x => J.inSeason(x, w.season) ? x.weight * (x.rarity === "common" ? 1 : J.skillMult(u, "fish")) : 0), tot = ws.reduce((p, q) => p + q, 0);
    for (let i = 0; i < FISH.length; i++) { if (FISH[i] === f) { seq[0] = (acc + ws[i] / 2) / tot; break; } acc += ws[i]; } let k = 0; return w.landFish(u, () => seq[k++]); };
  // 금메달 셋을 미리 두고(크기 기록 = 이미 저장되는 칸), 넷째 종류를 금이 나올 때까지 낚음
  for (const id of ["anchovy", "mackerel", "squid"]) w.fishRecord[id] = byId(id).cm[1];
  let r = null, ups = [];
  for (let i = 0; i < 400; i++) { w.time += 0.7; r = land("flatfish"); if (r.record) ups.push([r.prevMedal, r.medal]); if (r.medal === 3) break; }
  assert.equal(r.medal, 3); assert.ok(ups.every(([a, b]) => b >= a), "메달은 내려가지 않음");
  assert.deepEqual(r.medalGifts.map(g => g.item.id), ["medalRug"]); assert.equal(w.items.medalRug, 1); assert.equal(w.medalGifts, 1);
  const j = JSON.parse(JSON.stringify(w.serialize())); assert.equal(j.medalGifts, 1); assert.equal(Object.keys(j).filter(k => /medal/i.test(k)).length, 1, "저장 칸은 하나만 늘어남");
  assert.equal(World.fromJSON(j, seededRandom(3)).medalGifts, 1);
  delete j.medalGifts; const old = World.fromJSON(j, seededRandom(3)); assert.equal(old.medalGifts, 0, "예전 저장: 0 → 다음 기록 때 밀린 것 받음");
});

test("알림·소식지: 금메달이 처음 되면 소식지에, 은·같은 메달은 알림 줄에만 · 도감 머리에 금메달 수", () => {
  const u = { name: "도미" }, ff = byId("flatfish");
  let n = newsFor("fishRecord", { u, fish: ff, size: 78.4, first: false, medal: 3, up: true });
  assert.match(n.text, /광어 78\.4cm! 🥇 금메달$/); assert.equal(n.icon, "📏"); assert.ok(n.weight >= 5);
  n = newsFor("fishRecord", { u, fish: ff, size: 60, first: false, medal: 2, up: true }); assert.match(n.text, /🥈 은메달$/); assert.equal(n.weight, 0);
  n = newsFor("fishRecord", { u, fish: ff, size: 79, first: false, medal: 3, up: false }); assert.match(n.text, /새 기록이에요 🥇$/); assert.equal(n.weight, 0);
  n = newsFor("fishRecord", { u, fish: ff, size: 31, first: true }); assert.match(n.text, /첫 기록이에요$/); assert.equal(n.weight, 0, "예전 알림 모양 그대로");
  n = newsFor("medalGift", { item: ITEMS.find(i => i.id === "medalRug"), gift: M.MEDAL_GIFTS[0] }); assert.match(n.text, /물고기 금메달 4종 기념으로 금빛 비늘 깔개를 받았어요!$/); assert.ok(n.weight > 0);
  const w = World.create(7, seededRandom(3), { empty: true }); w.fishRecord = { flatfish: 78.4, octopus: 31 };
  const c = dexCounts(w); assert.equal(c.gold, 1); assert.equal(c.bronze, 1); assert.match(dexHeadHtml(c), /🥇 금메달 1\/16/);
});

test("다녀온 사이에 받은 금메달 기념 가구도 소식지에 실림(가방에만 조용히 들어가지 않게)", () => {
  const w = World.create(7, seededRandom(3), { wild: true, firstGull: true }); w.addUnitByName("물방울");
  if (!w.spots.length) w.spots.push({ x: 1, z: 1, dir: [1, 0], claimed: null });
  const fisher = w.units.find(u => u.job === "fisher"); assert.ok(fisher, "어부가 있어야 함");
  for (const id of ["anchovy", "mackerel", "squid", "flatfish"]) w.fishRecord[id] = A.fishSize(byId(id), 1);   // 금 4종(예전 저장: 받은 수 0). 가장 큰 크기라 새 기록이 안 나와도 받아야 함
  w.medalGifts = 0;
  const r = w.applyAway(8 * 3600000, () => 0);                                   // rnd 0 → 늘 낚음
  assert.ok(r.catches.length >= 1); assert.equal(w.medalGifts, 1); assert.equal(w.items.medalRug, 1);
  assert.ok(w.newsLog.some(n => /금메달 4종 기념으로 금빛 비늘 깔개/.test(n.text)), "소식지에 기념 가구");
});
