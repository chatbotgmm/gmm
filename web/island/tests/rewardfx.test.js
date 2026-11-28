// 플레이어 보상을 크게 보여 주는 효과의 순수 로직(ui/rewardFx.js): 단계 고르기 · 차례 · small 합치기. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../src/ui/rewardFx.js";
import { ITEMS } from "../src/data/catalog.js";
import { RANKS } from "../src/world/rank.js";
import { World } from "../src/world/World.js";
import { setAdv } from "../src/ui/viewPrefs.js";
/** 🔧 자세히 보기(관리자)를 켠 채로 fn을 돌림(끝나면 쉬운 보기로 되돌림) */
const withAdv = fn => { setAdv(true); try { return fn(); } finally { setAdv(false); } };

const item = id => ITEMS.find(i => i.id === id);
const eco = { economy: true }, u = { name: "갈매미" };

test("rewardOf: 받는 것마다 알맞은 단계", () => {
  assert.equal(R.rewardOf("sparkle", { item: item("shell") }).tier, "medium", "반짝이 줍기는 띠");
  assert.equal(R.rewardOf("sparkle", { item: item("shell") }).to, "bag");
  assert.equal(R.rewardOf("medalGift", { item: item("medalRug"), gift: { label: "금메달 4종" } }).tier, "big");
  const m = R.rewardOf("medalGift", { item: item("medalRug"), gift: { label: "금메달 4종" } });
  assert.equal(m.title, "금빛 비늘 깔개 획득!"); assert.equal(m.icon, "🏅"); assert.match(m.line, /집 꾸미기/);
  assert.equal(R.rewardOf("donateGift", { item: item("chair"), gift: { label: "3종" } }).line.startsWith("🐠 수족관 기증 3종 기념"), true);
  assert.equal(R.rewardOf("festivalEnd", { item: item("festWinter"), def: { name: "겨울 축제" } }).tier, "big");
  assert.equal(R.rewardOf("festivalEnd", { item: null, def: { name: "겨울 축제" } }), null, "기념품이 없으면 보상 아님");
  assert.equal(R.rewardOf("stampBuy", { item: { id: "stampRug", name: "도장 무늬 깔개", furniture: "stampRug" } }).tier, "big");
  const rk = R.rewardOf("rank", { rank: 2, def: RANKS[2] }); assert.equal(rk.tier, "big"); assert.match(rk.line, /새 건물/);
  assert.equal(R.rewardOf("dailyDone", { all: true, stamps: 3, req: { text: "x" } }).tier, "big", "부탁을 다 들어주면 도장 카드");
  assert.equal(R.rewardOf("dailyDone", { all: false, req: { id: "pet", icon: "♥", text: "쓰다듬기" }, left: 2 }).tier, "medium");
  assert.equal(R.rewardOf("bondStage", { u, stage: 1, gift: { id: "bottle", name: "유리병 편지" } }).tier, "medium");
  assert.equal(R.rewardOf("bondStage", { u, stage: 3, gift: { id: "pearl", name: "진주" } }).tier, "big", "가장 높은 단계 답례는 큰 카드");
  assert.equal(R.rewardOf("bondStage", { u, stage: 2, gift: { id: "plant", name: "화분", kind: "furniture", where: "작은 집" } }).tier, "big", "가구 답례도 큰 카드");
  assert.equal(R.rewardOf("wishDone", { u }).tier, "medium");
  assert.equal(R.rewardOf("fussSolved", { u, kind: "perch" }).tier, "medium");
  assert.equal(R.rewardOf("fishRecord", { u, fish: { id: "a", name: "도미" }, up: true, medal: 3, size: 40 }).title, "도미 금메달!");
  assert.equal(R.rewardOf("fishRecord", { u, fish: { id: "a", name: "도미" }, up: false, medal: 3 }), null, "메달이 안 오른 기록은 조용히");
  assert.equal(R.rewardOf("fishRecord", { u, fish: { id: "a", name: "도미" }, up: true, medal: 1 }), null, "동메달은 조용히");
  assert.equal(R.rewardOf("gift", { u, item: item("shell") }), null, "내가 준 선물은 보상이 아님");
  assert.equal(R.rewardOf("beachcomb", { u, item: item("pearl") }), null, "갈매미 소지품은 플레이어 몫이 아님");
});

test("rewardOf: 금고로 들어오는 돈은 small(+N), 0이거나 경제가 없으면 없음", () => {
  const t = R.rewardOf("tax", { total: 12, n: 3 }, eco); assert.equal(t.tier, "small"); assert.equal(t.n, 12); assert.equal(t.to, "vault"); assert.equal(t.title, "+12");
  assert.equal(R.rewardOf("lodging", { total: 4 }, eco).line, "금고에 들어온 돈", "쉬운 보기: 세금·숙박비 낱말 없이");
  assert.equal(withAdv(() => R.rewardOf("lodging", { total: 4 }, eco).line), "숙박비");
  assert.equal(R.rewardOf("tax", { total: 0 }, eco), null);
  assert.equal(R.rewardOf("tax", { total: 5 }, { economy: false }), null);
  for (const ev of R.REWARD_EVENTS) assert.ok(typeof ev === "string");
});

test("itemIcon: 보상으로 받을 수 있는 물건은 모두 아이콘이 있음", () => {
  for (const it of ITEMS.filter(i => i.furniture || i.gift || i.medal || i.fest || i.stamp || i.stampGift)) assert.notEqual(R.itemIcon(it), "🎁", it.id);
  assert.equal(R.itemIcon("없는것"), "🎁");
});

test("makeRewardQueue: 한 번에 하나, 큰 카드가 먼저, 띠는 저절로 사라짐", () => {
  const q = R.makeRewardQueue({ mediumMs: 1000, bigMs: 4000, bigMin: 300, gap: 100, maxQ: 4 });
  q.push({ tier: "medium", key: "a", title: "A" }); q.push({ tier: "big", key: "b", title: "B" }); q.push({ tier: "small", key: "v" });
  assert.equal(q.q.length, 2, "small은 차례에 안 들어감");
  let r = q.step(0); assert.equal(r.show.key, "b", "큰 카드가 먼저");
  assert.equal(q.step(500).show, null, "보이는 동안 다음 것은 기다림");
  assert.equal(q.collect(100), false, "뜨자마자 누른 것은 무시");
  assert.equal(q.collect(500), true, "누르면 받기");
  r = q.step(500); assert.equal(r.end.key, "b"); assert.equal(r.show, null, "받은 뒤 잠깐 비움");
  r = q.step(1100); assert.equal(r.show.key, "a");
  r = q.step(2100); assert.equal(r.end.key, "a", "띠는 mediumMs 뒤 저절로");
});

test("makeRewardQueue: 큰 카드는 안 누르면 bigMs 뒤 저절로 · hold 동안은 띠만", () => {
  const q = R.makeRewardQueue({ mediumMs: 1000, bigMs: 4000, gap: 0 });
  q.push({ tier: "big", key: "b" }); q.push({ tier: "medium", key: "m" });
  let r = q.step(0, { hold: true }); assert.equal(r.show.key, "m", "건설 모드·방 안: 큰 카드는 미루고 띠만");
  r = q.step(500, { hold: true }); assert.equal(r.show, null);
  r = q.step(1000, { hold: true }); assert.equal(r.end.key, "m"); assert.equal(q.q.length, 1, "큰 카드는 그대로 기다림");
  r = q.step(5000, { hold: true }); assert.equal(r.show, null, "아직 못 돌아옴");
  r = q.step(6000, { hold: false }); assert.equal(r.show.key, "b", "돌아오면 보여 줌");
  r = q.step(9999); assert.equal(r.end, null); r = q.step(10000); assert.equal(r.end.key, "b", "안 눌러도 4초 뒤 받음");
  q.push({ tier: "big", key: "c" }); q.step(20000); assert.equal(q.collect(20010), false); assert.equal(q.collect(20010, true), true, "force: 건설 모드로 가면 바로 받음");
});

test("makeRewardQueue: 같은 보상은 ×n으로 합치고, 넘치면 띠부터 버림", () => {
  const q = R.makeRewardQueue({ maxQ: 3 });
  q.push({ tier: "medium", key: "s" }); q.push({ tier: "medium", key: "s" }); assert.equal(q.q.length, 1); assert.equal(q.q[0].count, 2);
  q.push({ tier: "big", key: "b1" }); q.push({ tier: "big", key: "b2" }); q.push({ tier: "medium", key: "t" });
  assert.equal(q.q.length, 3); assert.deepEqual(q.q.map(x => x.key), ["b1", "b2", "s"], "큰 카드는 남고 맨 뒤 띠가 빠짐");
});

test("makeSmallSum: 같은 곳으로 가는 +N은 짧은 사이에 합쳐 한 번만 날림", () => {
  const s = R.makeSmallSum(1000);
  assert.equal(s.add({ to: "vault", n: 5, line: "세금" }, 0).act, "new");
  assert.equal(s.add({ to: "vault", n: 3, line: "숙박비" }, 400).act, "merge");
  assert.deepEqual(s.due(900), []);
  const d = s.due(1000); assert.equal(d.length, 1); assert.equal(d[0].n, 8); assert.equal(d[0].line, "세금 · 숙박비");
  assert.equal(R.smallText(8), "+8");
  assert.equal(s.add({ to: "vault", n: 2 }, 1200).act, "new", "날린 뒤엔 새로");
});

test("confetti: 결정적이고 개수만큼", () => {
  const a = R.confetti(12, 3), b = R.confetti(12, 3);
  assert.equal(a.length, 12); assert.deepEqual(a, b); assert.notDeepEqual(a, R.confetti(12, 4));
});

test("월드 이벤트에서: 반짝이 줍기 → medium, 수족관 기념 선물 → big", () => {
  const w = World.create(7, Math.random, { wild: true }), seen = [];
  for (const ev of R.REWARD_EVENTS) w.on(ev, a => { const r = R.rewardOf(ev, a, w); if (r) seen.push([ev, r.tier]); });
  const k = ITEMS.find(i => i.sparkle && !i.sparkleSeason && !i.sparkleTime).id;
  w.sparkles.push({ id: 991, k, x: 1, z: 1 }); assert.ok(w.pickSparkle(991));
  assert.deepEqual(seen[0], ["sparkle", "medium"]);
  w.tellDonation(null, { id: "x", name: "도미" }, [{ item: item("chair"), gift: { label: "3종" } }]);
  assert.ok(seen.some(([ev, t]) => ev === "donateGift" && t === "big"));
});
