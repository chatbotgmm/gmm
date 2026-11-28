// 갈매폰 앱이 필요할 때 생기기(ui/appUnlock.js) · 쉬운 보기에서 살림 속사정 거르기(newsAlerts ADV_ALERTS · 소식지 eco)
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { appsVisible, APPS_ALWAYS, APP_WHEN } from "../src/ui/appUnlock.js";
import { advOnlyAlert, ADV_ALERTS, ALERTS } from "../src/ui/newsAlerts.js";
import { newsFor, addNews, newsFromSave } from "../src/world/news.js";
import { newsAppHtml } from "../src/ui/appViews.js";
import { setAdv } from "../src/ui/viewPrefs.js";

const fresh = () => World.create(7, seededRandom(3), { wild: true });

test("새 섬: 늘 보이는 앱만(소원·갈매미·소식지·소환·저장·설정·도움말) — 처음 안내가 가리키는 🥚 소환은 늘 보임", () => {
  const w = fresh(), on = appsVisible(w);
  assert.deepEqual([...on].sort(), [...APPS_ALWAYS].sort());
  assert.ok(on.has("summon") && on.has("wish"));
});

test("쓸 일이 생기면 앱이 생김: 관계도는 셋부터 · 은행은 첫 공사 · 도감은 처음 모으면 · 시장은 시장을 지으면", () => {
  const w = fresh();
  w.units.push({ name: "a" }, { name: "b" }); assert.ok(!appsVisible(w).has("rel")); assert.ok(appsVisible(w).has("decor"), "둘이면 꾸미기");
  w.units.push({ name: "c" }); assert.ok(appsVisible(w).has("rel")); assert.ok(appsVisible(w).has("town"), "셋이면 마을");
  assert.ok(!appsVisible(w).has("bank")); w.led("fees", 10); assert.ok(appsVisible(w).has("bank"), "설계비를 내면 은행");
  assert.ok(!appsVisible(w).has("dex")); w.collection.mackerel = 1; assert.ok(appsVisible(w).has("dex"));
  assert.ok(!appsVisible(w).has("market")); w.buildings.set(999, { id: 999, defId: "market" }); assert.ok(appsVisible(w).has("market"));
  for (const a of Object.keys(APP_WHEN)) assert.ok(appsVisible(w).has(a), a);
});

test("한 번 연 앱은 늘 보이고, 자세히 보기면 모두 보임", () => {
  const w = fresh();
  assert.ok(appsVisible(w, { opened: new Set(["bank"]) }).has("bank"), "금고 칩으로 연 은행은 남음");
  const all = appsVisible(w, { adv: true }); for (const a of [...APPS_ALWAYS, ...Object.keys(APP_WHEN)]) assert.ok(all.has(a), a);
});

test("쉬운 보기: 물가·대출·품삯 알림은 지난 알림에만, 금고 바닥 알림은 그대로", () => {
  for (const ev of ADV_ALERTS) { assert.ok(ALERTS[ev], ev); assert.ok(advOnlyAlert(ev)); assert.ok(!advOnlyAlert(ev, true)); }
  for (const ev of ["vaultShort", "sick", "faint", "sparkle"]) assert.ok(!advOnlyAlert(ev), ev);
});

test("소식지: 세금·숙박비·물가 소식은 eco 표시 → 쉬운 보기에서 거르고 자세히 보기면 보임 · 저장을 거쳐도 표시가 남음", () => {
  const w = fresh(); w.newsLog = [];
  const tax = newsFor("tax", { total: 3, n: 2 }, w); assert.equal(tax.eco, true);
  assert.equal(newsFor("rank", { def: { icon: "🏅", name: "어촌" } }, w).eco, undefined);
  addNews(w.newsLog, 10, tax); addNews(w.newsLog, 11, { icon: "🏠", text: "작은 집이 다 지어졌어요", weight: 3 });
  w.newsLog = newsFromSave(JSON.parse(JSON.stringify(w.newsLog))); assert.equal(w.newsLog[0].eco, true);
  assert.ok(!/세금/.test(newsAppHtml(w))); assert.match(newsAppHtml(w), /작은 집/);
  setAdv(true); try { assert.match(newsAppHtml(w), /세금/); } finally { setAdv(false); }
});

test("소식지: 🚑 실려 간 일은 갈매미 소식이라 쉬운 보기에도 남고 진료비 꼬리만 빠짐", () => {
  const w = fresh(); w.newsLog = [];
  const n = { icon: "🚑", text: "기본이 병원에 실려 가 누웠어요. 진료비 🪙3", weight: 1 }; assert.ok(!newsFor("faintCarried", { u: { name: "기본" }, b: null, fee: 3 }, w).eco);
  addNews(w.newsLog, 10, n);
  assert.match(newsAppHtml(w), /실려 가 누웠어요/); assert.doesNotMatch(newsAppHtml(w), /진료비/);
  setAdv(true); try { assert.match(newsAppHtml(w), /진료비 🪙3/); } finally { setAdv(false); }
});
