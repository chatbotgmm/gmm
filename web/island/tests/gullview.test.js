// 갈매미 카드 · 선물 판 · 도장 가게 글(ui/gullView.js) — 화면 연결 5단계
import { test } from "node:test";
import { personaOf } from "../src/world/evolve.js";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { josa } from "../src/util.js";
import { UnitState } from "../src/data/types.js";
import { STAMP_SHOP, STAMP_GIFTS } from "../src/world/daily.js";
import * as G from "../src/ui/gullView.js";
import { setAdv } from "../src/ui/viewPrefs.js";
/** 🔧 자세히 보기(관리자)를 켠 채로 fn을 돌림(끝나면 쉬운 보기로 되돌림) */
const withAdv = fn => { setAdv(true); try { return fn(); } finally { setAdv(false); } };

const fresh = () => { const w = World.create(7, seededRandom(3), { wild: true }); w.summon(); return w; };

test("상태 글귀: 모든 UnitState 키에 한국어 글이 있고(영문 이름이 화면에 안 나옴), 물주기는 물을 들었는지에 따라 다름", () => {
  const miss = Object.values(UnitState).filter(k => !G.STATE_LABEL[k]);
  assert.deepEqual(miss, [], "글귀 없는 상태");
  assert.equal(G.stateLabelOf({ state: UnitState.GoFetch }), "공사 재료 가지러 은행 가는 중");
  assert.equal(G.stateLabelOf({ state: UnitState.GoWater }), "물 뜨러 가는 중");
  assert.equal(G.stateLabelOf({ state: UnitState.GoWater, can: 3 }), "밭에 물 주러 가는 중");
  assert.equal(G.stateLabelOf({ state: UnitState.Water, can: 2 }), "밭에 물 주는 중");
  assert.equal(G.stateLabelOf({ state: UnitState.Water, can: 0 }), "물 뜨는 중");
  assert.equal(G.stateLabelOf({ state: "Nope" }), "무언가 하는 중");
});

test("도장 가게: 귀한 선물 8줄(손뜨개 목도리 포함) + 한정 가구 4줄, 도장이 모자라면 단추 꺼짐, undefined 없음", () => {
  const w = fresh(); w.stamps = 1;
  const h = G.stampShopHtml(w), ids = [...h.matchAll(/data-stamp="([^"]+)"/g)].map(m => m[1]);
  assert.equal(STAMP_GIFTS.length, 8); assert.equal(STAMP_SHOP.length, 4);
  assert.deepEqual(ids, STAMP_GIFTS.concat(STAMP_SHOP).map(s => s.id));
  assert.ok(h.includes("손뜨개 목도리") && h.includes("바로 둘러요"));
  assert.ok(!/undefined|NaN/.test(h));
  const off = [...h.matchAll(/data-stamp="([^"]+)" disabled/g)].map(m => m[1]);
  assert.ok(off.includes("crownCookie") && !off.includes("knitScarf"), "도장 1개: 왕관 쿠키(2)는 꺼짐 · 목도리(1)는 켜짐");
  assert.ok(h.includes("♥ 모두"), "왕관 쿠키는 모두가 좋아함");
  assert.notEqual(G.stampShopKey(w), (w.buyStamp("knitScarf"), G.stampShopKey(w)), "산 수가 바뀌면 가게 열쇠도 바뀜");
});

test("도장 가게 사기 안내: 선물(손뜨개 목도리)도 오류 없이 '주머니', 가구는 '집 꾸미기' (예전 onStampBuy TypeError)", () => {
  const w = fresh(); w.stamps = 3; const before = w.items.knitScarf || 0;
  const ok = w.buyStamp("knitScarf"); assert.equal(ok, true); assert.equal(w.items.knitScarf, before + 1);
  const t = G.stampBuyText("knitScarf", ok, josa); assert.match(t, /손뜨개 목도리를 받아 왔어요/); assert.match(t, /주머니/);
  assert.match(G.stampBuyText("stampLamp", true, josa), /집에 들어가 놓을/);
  assert.match(G.stampBuyText("goldLetter", true, josa), /주머니에 넣었어요$/);
  assert.match(G.stampBuyText("knitScarf", false, josa), /도장이 모자라요/);
  assert.equal(G.stampBadge({ stamps: 0 }), 0); assert.equal(G.stampBadge({ stamps: 2 }), 2);
});

test("선물 판: 내 주머니 개수, 빈 글은 반짝이·도장 가게, 도장 선물은 ⭐ 정 ×2, 하트 1개부터 좋아하는 것이 ♥로 앞에, '간직' 없음", () => {
  const w = fresh(), u = w.units[0];
  let h = G.giftPickHtml(u, w);
  assert.match(h, /내 주머니 0개/); assert.match(h, /반짝이를 주우면/); assert.match(h, /도장 가게/);
  w.items.shell = 2; w.items.postcard = 1; w.items.fishTin = 1; w.keep.shell = true;
  h = G.giftPickHtml(u, w);
  assert.match(h, /내 주머니 4개/); assert.ok(!/간직|💛|undefined/.test(h));
  assert.match(h, /⭐ 황금 생선 통조림 ×1 <small>정 ×2<\/small>/);
  assert.ok(!h.includes("♥ "), "아직 처음 만난 사이: 취향을 모름");
  u.bond = 5; const likes = new Set(["shell", "postcard"].filter(id => personaOf(u).likes.includes(id === "shell" ? "sea" : "letter")));   // 변신 전 기본 = 숨은 성향의 취향(evolve.js DISP_LIKES)
  h = G.giftPickHtml(u, w); const order = [...h.matchAll(/data-gift="([^"]+)">(♥ )?/g)].map(m => [m[1], !!m[2]]);
  assert.deepEqual(order.filter(([, l]) => l).map(([id]) => id).sort(), [...likes].sort());
  const firstPlain = order.findIndex(([, l]) => !l); assert.ok(order.slice(firstPlain).every(([, l]) => !l), "좋아하는 것이 앞에");
});

test("갈매미 카드 칩: 대출은 '집값 N 남음'(loanInfo와 같음) · 밀린 품삯 · 입은 옷 · 병(남은 시간) · 짐, 접힌 줄 아이콘", () => {
  const w = fresh(), u = w.units[0];
  let c = G.gullChips(u, w);
  assert.equal(c.coin, `🪙 ${u.coins || 0}`); assert.equal(c.wage, ""); assert.equal(c.sick, ""); assert.equal(c.wear, ""); assert.equal(c.load, "");
  u.loan = { left: 18, per: 4 }; u.wageOwed = 4; u.wear = { neck: "scarf", body: "coat", head: null }; u.clothes = ["scarf", "coat"];
  u.sick = { kind: "cold", left: 300, med: false }; u.load = { wood: 5, stone: 0 }; u.insideBuildingId = null;
  c = withAdv(() => G.gullChips(u, w));
  assert.equal(c.home, `🏠 집값 ${w.loanInfo(u).left} 남음`); assert.equal(c.home, "🏠 집값 18 남음");
  assert.equal(c.wage, "💸 밀린 품삯 4"); assert.equal(c.wear, "🧣🧥 입음"); assert.equal(c.load, "📦 짐 🪵5");
  assert.equal(c.sick, "🤧 감기 · 10분 남음", "밖: 300 / 0.5 = 600초");
  // 쉬운 보기(기본): 숫자·초 대신 낱말
  c = G.gullChips(u, w);
  assert.equal(c.home, "🏠 집값 갚는 중"); assert.equal(c.wage, "💸 품삯이 밀렸어요"); assert.equal(c.sick, "🤧 감기 · 한참 쉬어야 해요", "600초 → 한참");
  u.sick.left = 20; assert.equal(G.gullChips(u, w).sick, "🤧 감기 · 곧 나아요", "40초 → 곧"); u.sick.left = 300;
  u.sick.med = true; assert.match(G.gullChips(u, w).sick, /💊/);
  u.bodyT = 38.6; assert.equal(G.gullFlags(u), "🤧🥶💸");
  u.sick = null; u.wageOwed = 0; u.bodyT = 40; assert.equal(G.gullFlags(u), "");
  const old = { economy: false, buildings: new Map(), loanInfo: () => null }; const o = G.gullChips({ coins: 5 }, old);
  assert.equal(o.coin, ""); assert.equal(o.home, "", "경제 없는 예전 섬은 돈·집 칸 없음");
});

test("체온 줄: 39° 이하 cold(추워요/꽁꽁) · 41° 이상 hot · 그 사이 보통, 막대는 37~42°", () => {
  assert.deepEqual(G.bodyTempOf({ bodyT: 38.6 }), { text: "38.6°", pct: 32, tone: "cold", word: "추워요", cold: 39, hot: 41 });
  assert.equal(G.bodyTempOf({ bodyT: 38.0 }).word, "꽁꽁");
  assert.equal(G.bodyTempOf({ bodyT: 40 }).tone, null); assert.equal(G.bodyTempOf({ bodyT: 41.2 }).tone, "hot");
  assert.equal(G.bodyTempOf({}), null);
});

test("자세히 보기 안쪽: 만족도 내역(큰 값 먼저) · 소지품 · 가진 옷 · 면역, undefined 없음", () => {
  const w = fresh(), u = w.units[0];
  u.satParts = [["집", 10], ["배고픔", -20], ["길", 0]]; u.stash = { tuna: 2 }; u.clothes = ["scarf"]; u.immune = 90;
  const h = withAdv(() => G.gullMoreHtml(u, w, { fav: "낚시", friend: "단짝: 꽃" }));
  assert.ok(!/undefined|NaN/.test(h)); assert.match(h, /능률 ×/);
  const e = G.gullMoreHtml(u, w, { fav: "낚시" });   // 쉬운 보기: 점수 없이 👍·👎, 면역은 「한동안」, 능률은 낱말
  assert.match(e, /👍 집/); assert.match(e, /👎 배고픔/); assert.ok(!/class="zero"|×1\.|분 동안/.test(e)); assert.match(e, /한동안 감기에 안 걸려요/); assert.match(e, /일 속도: /);
  assert.ok(h.indexOf("배고픔") < h.indexOf("집") && h.indexOf("집") < h.indexOf("길"), "큰 값 먼저, 0은 맨 아래");
  assert.match(h, /class="zero"/); assert.match(h, /×2/); assert.match(h, /털목도리/); assert.match(h, /2분 동안 감기에 안 걸려요/); assert.match(h, /단짝: 꽃/);
});
