// 일반 건물 카드 글(ui/bldView.js) — 화면 연결 6단계: 공사장 · 밭 · 의원 · 잡화점 옷 탭
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { CLOTHES_ORDER } from "../src/data/catalog.js";
import * as V from "../src/ui/bldView.js";

const fresh = () => { const w = World.create(7, seededRandom(3), { wild: true }); w.summon(); return w; };
const placeNear = (w, defId, x0, z0, hits = 1e9) => { for (let r = 3; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r); const q = w.placeBuilding(defId, x, z, 0, null, hits); if (q.ok) return q.building; } return null; };
const clean = h => assert.ok(!/undefined|NaN|\[object/.test(h), h);

test("카드 종류: 짓는 중은 공사장, 다 지은 집·밭·의원·잡화점은 각자, 그 밖은 카드 없음", () => {
  const w = fresh(), u = w.units[0];
  const site = placeNear(w, "house", u.x, u.z, 0); assert.equal(V.bldKindOf(site, w), "site");
  assert.equal(V.bldKindOf(placeNear(w, "house", u.x, u.z), w), "house");
  assert.equal(V.bldKindOf(placeNear(w, "field", u.x, u.z), w), "field");
  assert.equal(V.bldKindOf(placeNear(w, "clinic", u.x, u.z), w), "clinic");
  assert.equal(V.bldKindOf(placeNear(w, "shop", u.x, u.z), w), "shop");
  assert.equal(V.bldKindOf(placeNear(w, "bench", u.x, u.z), w), null);
});

test("공사장: 맡은 이 없으면 ⏳ 기다림, 단계마다(가지러·모으기 n/m·짓기 바퀴) 글이 바뀌고 재료 준비 n/m을 셈", () => {
  const w = fresh(), u = w.units[0], b = placeNear(w, "house", u.x, u.z, 0);
  assert.equal(V.siteStepOf(b, w).step, "wait"); assert.equal(V.siteReadyOf(b), null);
  let c = V.siteCardOf(b, w); clean(c.parts.join("")); assert.match(c.parts[0], /0%/); assert.match(c.parts[0], /일꾼을 기다려요/); assert.match(c.parts[1], /맡은 갈매미가 없어요/);
  b.supply = { by: u.unitId, need: { wood: 5, stone: 5 }, got: { wood: 3, stone: 0 }, total: { wood: 10, stone: 10 }, cycles: 2, step: "gather" };
  assert.equal(V.siteStepOf(b, w).text, "🪵 3/5 · 🪨 0/5 모으는 중"); assert.deepEqual(V.siteReadyOf(b), { got: 3, need: 10 });
  c = V.siteCardOf(b, w); clean(c.parts.join("")); assert.match(c.parts[1], /data-act="follow"/); assert.match(c.parts[1], /이번에 쓸 재료 <b>3\/10<\/b>/);
  b.supply.step = "fetch"; assert.equal(V.siteStepOf(b, w).text, "🏦 재료 가지러 가는 중");
  b.supply.step = "build"; assert.equal(V.siteStepOf(b, w).text, "🔨 짓는 중 · 망치질 2번 남음");
  b.fee = 10; assert.match(V.siteCardOf(b, w).parts[2], /🪙10/);
  u.noWay = { [b.id]: w.time + 30 }; assert.match(V.siteCardOf(b, w).parts[1], /길이 없어/);
});

test("밭: 칸 수 · 다 자람 · 목마름(촉촉함 0.2 아래) · 자라는 단계 3가지 · 남은 시간", () => {
  const w = fresh(), u = w.units[0], f = placeNear(w, "field", u.x, u.z), plots = V.fieldPlotsOf(f, w);
  assert.equal(plots.length, 6);
  plots[0].stage = "ripe"; plots[1].stage = "growing"; plots[1].grow = 100; plots[1].t = 90; plots[1].moisture = 0.1;
  plots[2].stage = "growing"; plots[2].grow = 100; plots[2].t = 50; plots[3].stage = "growing"; plots[3].grow = 100; plots[3].t = 10;
  assert.deepEqual(plots.slice(0, 5).map(V.plotPhaseOf), ["ripe", "sprout", "half", "grown", "empty"]);
  assert.deepEqual(V.fieldSummaryOf(plots), { ripe: 1, thirsty: 1, growing: 3, empty: 2 });
  const c = V.fieldCardOf(f, w), h = c.parts.join(""); clean(h);
  assert.match(c.parts[0], /6칸/); assert.match(c.parts[0], /목마름 1/); assert.match(c.parts[0], /data-tone="warn"/);
  assert.equal((h.match(/data-tone="dry"/g) || []).length, 1, "마른 칸 막대 1개");
  assert.ok(V.plotLeftOf(plots[1], w) > V.plotLeftOf(plots[2], w) * 1.5, "마른 칸은 더 오래 걸림");
});

test("의원: 침대 칸(누운 환자 · 빈 침대), 당번 고르기 단추 → setDoctor, 오늘 진료 수입", () => {
  const w = fresh(), u = w.units[0], cl = placeNear(w, "clinic", u.x, u.z);
  let c = V.clinicCardOf(cl, w); clean(c.parts.join("")); assert.match(c.parts[0], /0\/3/); assert.match(c.parts[0], /당번이 없어도/);
  assert.equal((c.parts[1].match(/빈 침대/g) || []).length, 3);
  u.sick = { kind: "cold", left: 300 }; u.insideBuildingId = cl.id;
  c = V.clinicCardOf(cl, w); assert.match(c.parts[0], /1\/3/); assert.equal((c.parts[1].match(/빈 침대/g) || []).length, 2); assert.ok(c.parts[1].includes(u.name));
  const two = w.addUnitByName("목수"); assert.match(c.parts[2], /data-act="doctor" data-id=""/);
  assert.ok(V.clinicCardOf(cl, w).parts[2].includes(`data-id="${two.unitId}"`), "건강한 갈매미는 당번 후보");
  assert.ok(w.setDoctor(cl.id, two.unitId).ok); c = V.clinicCardOf(cl, w); assert.match(c.parts[0], /당번 의사: 목수/); assert.match(c.parts[2], /aria-pressed="true"[^>]*>✓ 목수/);
  u.sick = null; c = V.clinicCardOf(cl, w); assert.equal((c.parts[1].match(/빈 침대/g) || []).length, 3, "나으면 비워짐");
});

test("잡화점 옷 탭: 옷마다 값과 '가진 갈매미 n/N'(= clothes에 든 수), 도장 가게 바로가기 · 가구 탭은 가구 값", () => {
  const w = fresh(); const s = placeNear(w, "shop", w.units[0].x, w.units[0].z); w.addUnitByName("목수"); w.units[0].clothes = ["scarf"];
  const h = V.shopCardOf(s, w, "clothes").parts.join(""); clean(h);
  for (const id of CLOTHES_ORDER) assert.ok(h.includes(`가진 갈매미 ${V.clothesOwners(w, id)}/${w.units.length}`));
  assert.equal(V.clothesOwners(w, "scarf"), 1); assert.match(h, /data-act="stamp"/); assert.match(h, /aria-selected="true"[^>]*>🧣 옷/);
  const f = V.shopCardOf(s, w, "furn").parts.join(""); clean(f); assert.match(f, /침대/); assert.match(f, /🪙18/);
  w.air = 3; assert.equal(V.shopTabDefault(w), "clothes"); w.air = 20; assert.equal(V.shopTabDefault(w), "furn");
});
