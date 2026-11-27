// 편의성 점검 2묶음(4·5·6·7·10·11·12): 짓기 자리 찾기·확인 카드 자리 · 알림 대상 · 소원 건물 · 건물 찾기 · 가구 없는 집 · 화면 밖 반짝이 · 빠른 켜고 끄기. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { spiralCells, nearestSpot, cardSide, PREPLACE_R, SNAP_R } from "../src/systems/buildSpot.js";
import { edgeArrow, edgeList, EDGE_MAX } from "../src/ui/edgeArrows.js";
import { noteTarget, atKey, atParse, atLabel, WISH_BUILD, wishBuildId, findGroupOf, bldFinderRows, bldFinderHtml, furniGuideHtml, hasFurniture, quickLabels } from "../src/ui/qolViews.js";
import { BUILDINGS } from "../src/data/catalog.js";
import { WISHES } from "../src/world/wishes.js";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import * as Fu from "../src/world/furniture.js";

test("4: 칸 차례 — 가운데부터 가까운 순, 늘 같은 순서, 원 안만", () => {
  const c = spiralCells(5, 5, 2);
  assert.deepEqual(c[0], { x: 5, z: 5 });
  const d = c.map(p => Math.hypot(p.x - 5, p.z - 5)); for (let i = 1; i < d.length; i++) assert.ok(d[i] >= d[i - 1] - 1e-9);
  assert.equal(c.length, 13, "반지름 2 원 안 13칸"); assert.deepEqual(spiralCells(5, 5, 2), c);
  assert.ok(PREPLACE_R > SNAP_R && SNAP_R >= 1);
});

test("4: 가장 가까운 빈 자리 — 누른 칸이 되면 그대로 · 막혔으면 가까운 곳 · 없으면 null", () => {
  assert.deepEqual(nearestSpot(() => true, 3, 4, 2), { x: 3, z: 4 });
  const ok = (x, z) => x >= 10;                                   // 오른쪽만 빈 땅(왼쪽은 나무)
  assert.deepEqual(nearestSpot(ok, 8, 0, 2), { x: 10, z: 0 }, "2칸 옆");
  assert.equal(nearestSpot(ok, 5, 0, 2), null, "2칸 안에 없음");
  assert.deepEqual(nearestSpot(ok, 5, 0, 12), { x: 10, z: 0 });
});

test("4: 확인 카드 자리 — 고스트가 아래 카드에 가리면 위로, 아니면 아래, 위도 가리면 아래 그대로", () => {
  const bot = { left: 25, right: 366, top: 498, bottom: 625 }, top = { left: 25, right: 366, top: 100, bottom: 227 };
  assert.equal(cardSide({ x: 195, y: 500 }, bot, top), "top", "점검 실측: 카드 [25,498,341×127]가 누른 자리(195,500)를 덮음");
  assert.equal(cardSide({ x: 195, y: 300 }, bot, top), "bottom");
  assert.equal(cardSide({ x: 420, y: 560 }, bot, top), "bottom", "옆으로 비켜 있으면 그대로");
  assert.equal(cardSide({ x: 195, y: 470 }, bot, top), "top", "카드 바로 위(여유 안)도 가림으로");
  assert.equal(cardSide({ x: 195, y: 500 }, bot, { ...bot }), "bottom", "옮길 곳도 가리면 그대로");
  assert.equal(cardSide(null, bot, top), "bottom");
});

test("5: 알림 대상 — 갈매미가 먼저, 없으면 건물 · 친구 소식은 a · 갈매미 자체도", () => {
  const u = { unitId: 7, name: "물방울" }, v = { unitId: 9 }, b = { id: 12, defId: "field" };
  assert.deepEqual(noteTarget({ u, b }), { u: 7 }, "품삯·의사: 갈매미에게");
  assert.deepEqual(noteTarget({ b, from: "house" }), { b: 12 }, "업그레이드: 건물");
  assert.deepEqual(noteTarget({ a: u, b: v, stage: 2 }), { u: 7 }, "친구(b도 갈매미 — 건물로 읽지 않음)");
  assert.deepEqual(noteTarget(u), { u: 7 }, "unitAdded");
  assert.equal(noteTarget({ vault: 3 }), null); assert.equal(noteTarget(null), null); assert.equal(noteTarget({ u: null }), null);
  for (const at of [{ u: 7 }, { b: 12 }, { b: "b3" }]) assert.deepEqual(atParse(atKey(at)), at);
  assert.equal(atKey(null), ""); assert.equal(atParse("x:1"), null);
  const w = { units: [u], buildings: new Map([[12, b]]) };
  assert.equal(atLabel(w, { u: 7 }), "물방울 따라가기"); assert.equal(atLabel(w, { b: 12 }), "밭으로 가기"); assert.equal(atLabel(w, { u: 99 }), "", "떠난 갈매미는 누르기 없음");
});

test("6: 소원 → 지을 건물 — 표의 건물은 모두 있음 · 등급·지어 줄 갈매미·계절이 안 맞으면 없음", () => {
  for (const [wid, bid] of Object.entries(WISH_BUILD)) { assert.ok(BUILDINGS[bid], bid); assert.ok(WISHES.some(x => x.id === wid), wid); }
  const w = { rank: 0, season: "summer", builderFor: () => true, summonInfo: () => ({ needHouse: false }) };
  assert.equal(wishBuildId(w, { id: "market" }), "market"); assert.equal(wishBuildId(w, { id: "neighbor" }), "house");
  assert.equal(wishBuildId(w, { id: "cafe" }), null, "카페는 어촌부터"); assert.equal(wishBuildId({ ...w, rank: 1 }, { id: "cafe" }), "cafe");
  assert.equal(wishBuildId({ ...w, builderFor: () => false }, { id: "market" }), null, "목수가 없음");
  assert.equal(wishBuildId(w, { id: "bed" }), null, "가구 소원은 건물이 아님");
  assert.equal(wishBuildId(w, { id: "friend" }), null); assert.equal(wishBuildId({ ...w, summonInfo: () => ({ needHouse: true }) }, { id: "friend" }), "house", "집이 모자라 못 부를 때만");
  const html = (/** 실제 소원 앱 */ async () => (await import("../src/ui/appViews.js")).wishListHtml)();
  return html.then(f => { const u = { unitId: 3, name: "꼬마" };
    const out = f({ ...w, units: [u], wishes: [{ id: "market", unitId: 3 }, { id: "bed", unitId: 3 }], wishDone: 0, economy: false, buildings: new Map() });
    assert.match(out, /data-wu="3"/); assert.match(out, /data-wbuild="market"[^>]*>🔨 지으러 가기/); assert.equal((out.match(/data-wbuild/g) || []).length, 1); });
});

test("7: 건물 찾기 — 묶음(집·가게·밭·장식) 차례, 다리·계단은 뺌, 줄 = data-goto", () => {
  assert.equal(findGroupOf(BUILDINGS.house), "home"); assert.equal(findGroupOf(BUILDINGS.market), "shop"); assert.equal(findGroupOf(BUILDINGS.field), "land");
  assert.equal(findGroupOf(BUILDINGS.streetlamp), "deco"); assert.equal(findGroupOf(BUILDINGS.bridge), null); assert.equal(findGroupOf(BUILDINGS.stairs), null);
  const u = { unitId: 1, name: "물방울" }, bs = [{ id: 1, defId: "streetlamp" }, { id: 2, defId: "house", owner: 1 }, { id: 3, defId: "market" }, { id: 4, defId: "bridge" }, { id: 5, defId: "house" }, { id: 6, defId: "field" }];
  const w = { units: [u], buildings: new Map(bs.map(b => [b.id, b])), isDone: b => b.id !== 6 };
  const rows = bldFinderRows(w);
  assert.deepEqual(rows.map(r => r.group), ["home", "home", "shop", "land", "deco"]);
  assert.ok(!rows.some(r => r.id === 4), "다리 없음");
  assert.equal(rows.find(r => r.id === 2).sub, "주인 물방울"); assert.equal(rows.find(r => r.id === 5).sub, "빈 집"); assert.equal(rows.find(r => r.id === 6).sub, "🚧 공사 중");
  const html = bldFinderHtml(rows); assert.equal((html.match(/data-goto=/g) || []).length, 5); assert.match(html, /🏠 집/);
  assert.match(bldFinderHtml([]), /아직 지은 건물이 없어요/);
});

test("10: 가구 없는 집 — 안내 + 바로가기, 가구가 생기면 안내 없음 · 오늘의 부탁 「가구 놓기」는 놓을 가구가 있을 때만", async () => {
  const D = await import("../src/world/daily.js");
  const w = World.create(11, seededRandom(5)); w.instantBuild = true;
  let home = null; const c = w.center;
  for (let z = Math.floor(c.z) - 20; z < c.z + 30 && !home; z += 3) for (let x = Math.floor(c.x) - 20; x < c.x + 20 && !home; x += 3) if (w.check("house", x, z, 0).ok) home = w.placeBuilding("house", x, z, 0).building;
  assert.ok(home && w.isDone(home));
  for (const b of w.buildings.values()) if (BUILDINGS[b.defId].house) { const st = Fu.room(b).stash; for (const k of Object.keys(st)) st[k] = 0; }
  for (const k of Object.keys(w.items)) w.items[k] = 0;
  assert.equal(hasFurniture(w, home), false);
  const g = furniGuideHtml(w, home); assert.match(g, /가구는 잡화점·도장 가게에서/); assert.match(g, /data-act="stamp"/); assert.ok(!/data-act="shop"/.test(g) || w.shopB(), "잡화점이 없으면 잡화점 단추 없음");
  const ids = new Set(); for (let d = 1; d <= 28; d++) for (const r of D.rollDaily(`2027-06-${d}`, w).reqs) ids.add(r.id);
  assert.ok(!ids.has("furniture"), "놓을 가구가 없으면 「가구 놓기」 부탁은 안 나옴");
  Fu.room(home).stash.plant = 1;
  assert.equal(furniGuideHtml(w, home), null);
  const later = new Set(); for (let d = 1; d <= 28; d++) for (const r of D.rollDaily(`2027-06-${d}`, w).reqs) later.add(r.id);
  assert.ok(later.has("furniture"), "가구가 생기면 다시 나옴");
});

test("11: 화면 밖 반짝이 — 화면 안이면 없음, 밖이면 가장자리 네모 위 점 + 가리키는 각도, 뒤에 있으면 뒤집어 읽음", () => {
  const W = 390, H = 844, box = { l: 26, r: 364, t: 90, b: 760 };
  assert.equal(edgeArrow({ x: 0.2, y: -0.5 }, false, W, H, box), null);
  const r = edgeArrow({ x: 3, y: 0 }, false, W, H, box); assert.equal(Math.round(r.x), 364); assert.equal(Math.round(r.y), 422); assert.equal(Math.round(r.deg) + 0, 0);
  const up = edgeArrow({ x: 0, y: 2 }, false, W, H, box); assert.equal(Math.round(up.y), 90); assert.equal(Math.round(up.deg), -90);
  const back = edgeArrow({ x: 0.5, y: 0.1 }, true, W, H, box); assert.ok(back.x < W / 2, "뒤에 있는 오른쪽 점 = 실제로는 왼쪽"); assert.ok(back.x >= box.l - 1e-6 && back.y <= box.b + 1e-6);
  const corner = edgeArrow({ x: 5, y: -5 }, false, W, H, box); assert.ok(corner.x <= box.r + 1e-6 && corner.y <= box.b + 1e-6 && (Math.abs(corner.x - box.r) < 1e-6 || Math.abs(corner.y - box.b) < 1e-6), "모서리 쪽도 네모 위");
  const list = [{ id: 1, dist: 30, ndc: { x: 2, y: 0 }, behind: false }, { id: 2, dist: 5, ndc: { x: -2, y: 0 }, behind: false }, { id: 3, dist: 1, ndc: { x: 0, y: 0 }, behind: false }];
  assert.deepEqual(edgeList(list, W, H, box).map(a => a.id), [2, 1], "화면 안(3) 빼고 가까운 것부터");
  const many = Array.from({ length: 9 }, (_, i) => ({ id: i, dist: i, ndc: { x: 3, y: 0 }, behind: false }));
  assert.equal(edgeList(many, W, H, box).length, EDGE_MAX);
});

test("12: ☰ 빠른 켜고 끄기 글자 — 소리 켬·끔, 배속은 유료판만", () => {
  assert.deepEqual(quickLabels({ soundOn: true, paid: false, speed: 1 }), { sound: "🔊 소리: 켬", speed: null });
  assert.deepEqual(quickLabels({ soundOn: false, paid: true, speed: 3 }), { sound: "🔇 소리: 끔", speed: "⏩ 배속 ×3" });
});
