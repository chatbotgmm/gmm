// 🥚 소환 페이지(ui/summonView.js) + 지금 부를 수 있는 수(population.js count)
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { BUILDINGS } from "../src/data/catalog.js";
import { checkPlacement } from "../src/world/placement.js";
import * as P from "../src/world/population.js";
import { summonHtml, summonButton } from "../src/ui/summonView.js";

const fresh = () => World.create(7, seededRandom(3), { wild: true });
const ready = (w, d = "house") => { const c = w.center;
  for (let r = 4; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, x = Math.floor(c.x + 6 + Math.cos(a) * r), z = Math.floor(c.z + 9 + Math.sin(a) * r);
    if (checkPlacement(w.grid, BUILDINGS[d], x, z, 0, w.units).ok) return w.placeBuilding(d, x, z, 0, null, 1e9).building; }
  return null; };

test("count: 집 수 − 갈매미 수만큼 부를 수 있고, 한 마리 부를 때마다 하나씩 줄어듦", () => {
  const w = fresh(); let i = w.summonInfo();
  assert.deepEqual([i.can, i.count, i.houses, i.gulls], [true, 1, 1, 0], "새 섬: 집 1 · 갈매미 0 → 1마리");
  w.summon(); i = w.summonInfo(); assert.deepEqual([i.can, i.count], [false, 0]);
  ready(w); ready(w); i = w.summonInfo(); assert.equal(i.count, 2);
  w.summon(); assert.equal(w.summonInfo().count, 1); w.summon(); assert.equal(w.summonInfo().count, 0);
  // 순수: 건축가가 없으면 집이 없어도 한 마리(막힘 풀기) · 자이언트의 집은 보통 자리가 아님
  assert.equal(P.summonInfoFor([], [], true).count, 1);
  assert.equal(P.summonInfoFor([{ name: "보리", job: "builder" }], [{ defId: "house" }, { defId: "house" }, { defId: "giantHouse" }], true).count, 1);
  assert.equal(P.summonInfoFor([], [], false).count, P.UNGATED_CAP, "예전 섬(집 수 규칙 없음)은 9마리까지");
});

test("소환 페이지: 언제나 🥚 기본 갈매미 · 다음 친구가 맡을 일 · 🔍 안내 · 도감 9칸 · 못 부르면 꺼짐 + 까닭(summonInfo.reason 그대로)", () => {
  const w = fresh(); let i = w.summonInfo(), b = summonButton(i), v = summonHtml(i, w.units, undefined, w.formsSeen);
  assert.equal(b.disabled, false); assert.equal(b.why, "");
  assert.match(v.head, /1마리/); assert.match(v.head, /지금 부를 수 있어요/); assert.match(v.head, /🏠 집 <b>1<\/b>채 · 🐦 갈매미 <b>0<\/b>마리/);
  assert.match(v.mid, /모두 <b>🥚 기본 갈매미<\/b>로 와요/); assert.match(v.mid, /다음 친구는 <b>🔨 건축가<\/b> 일을 맡아요/); assert.match(v.mid, /🔍/);
  assert.equal((v.mid.match(/<span class="(on|off)/g) || []).length, 9, "도감 9칸"); assert.equal((v.mid.match(/class="off"/g) || []).length, 9, "아직 본 모습 없음");
  w.summon(); i = w.summonInfo(); b = summonButton(i); v = summonHtml(i, w.units, undefined, w.formsSeen);
  assert.equal(b.disabled, true); assert.equal(b.why, i.reason); assert.match(b.why, /집이 모자라요/);
  assert.match(v.head, /0마리/); assert.match(v.head, /지금은 못 불러요/); assert.match(v.head, /집이 모자라요/); assert.equal(v.giantOnly, false);
  assert.match(v.mid, /<span class="on"[^>]*><i>🥚<\/i>기본/, "기본은 도감에 열림"); assert.match(v.bottom, /소환 규칙/);
  for (const t of [v.head, v.mid, v.bottom, b.text, b.why]) { assert.doesNotMatch(t, /무작위로 와요/); assert.doesNotMatch(t, /아직 안 온 갈매미/); }
});

test("자이언트: 변신한 자이언트가 맞는 집을 기다리면 안내 + 건설로 가기 단추 · 자이언트의 집으로 이사하면 사라짐", () => {
  const w = fresh(); w.summon(); const g = w.units[0]; w.evolve(g, "자이언트");
  let v = summonHtml(w.summonInfo(), w.units, undefined, w.formsSeen, [...w.buildings.values()]);
  assert.equal(v.giantBtn, true); assert.match(v.mid, /자이언트의 집'이 필요해요/); assert.match(v.mid, /data-act="giantHouse"/); assert.ok(v.mid.includes(g.name));
  assert.match(v.mid, /class="on rare"[^>]*><i>🗿/, "도감에 자이언트");
  ready(w, "giantHouse"); w.moveGiantsHome(); assert.equal(w.buildings.get(g.home).defId, "giantHouse");
  v = summonHtml(w.summonInfo(), w.units, undefined, w.formsSeen, [...w.buildings.values()]); assert.equal(v.giantBtn, false);
});
