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
  // 순수: 건축가가 없으면 집이 없어도 한 마리(막힘 풀기), 빈 자이언트의 집은 자이언트 몫으로 하나 더
  assert.equal(P.summonInfoFor([], [], true).count, 1);
  assert.equal(P.summonInfoFor([{ name: "기본", job: "builder" }], [{ defId: "house" }, { defId: "house" }, { defId: "giantHouse" }], true).count, 2);
  assert.equal(P.summonInfoFor([], [], false).count, 9, "예전 섬(집 수 규칙 없음)은 안 온 수 그대로");
});

test("소환 페이지: 부를 수 있으면 단추 켜짐·머리에 마릿수, 못 부르면 꺼짐 + 까닭(summonInfo.reason 그대로)", () => {
  const w = fresh(); let i = w.summonInfo(), b = summonButton(i), v = summonHtml(i, w.units);
  assert.equal(b.disabled, false); assert.equal(b.why, "");
  assert.match(v.head, /1마리/); assert.match(v.head, /지금 부를 수 있어요/); assert.match(v.head, /🏠 집 <b>1<\/b>채 · 🐦 갈매미 <b>0<\/b>마리/);
  assert.match(v.mid, /다음: <b>🔨 기본<\/b>/, "먼저 오는 건축가"); assert.equal(v.giantBtn, false, "보통 갈매미가 남았으면 자이언트 안내 칸은 없음");
  w.summon(); i = w.summonInfo(); b = summonButton(i); v = summonHtml(i, w.units);
  assert.equal(b.disabled, true); assert.equal(b.why, i.reason); assert.match(b.why, /집이 모자라요/);
  assert.match(v.head, /0마리/); assert.match(v.head, /지금은 못 불러요/); assert.match(v.head, /집이 모자라요/); assert.equal(v.giantOnly, false);
  assert.match(v.bottom, /아직 안 온 갈매미/); assert.match(v.bottom, /자이언트의 집 필요/);
  for (const t of [v.head, v.mid, v.bottom, b.text, b.why]) { assert.doesNotMatch(t, /무작위로 와요/); assert.doesNotMatch(t, /기본 갈매미 한 마리/); }
});

test("자이언트: 보통 갈매미가 다 와도 빈 자이언트의 집이 없으면 안내 + 건설로 가기 단추, 다 모이면 '모두 모였어요'", () => {
  const w = fresh(); for (let k = 0; k < 8; k++) ready(w); while (w.summonInfo().can) w.summon();
  let i = w.summonInfo(); assert.equal(i.gulls, 8); assert.equal(i.needGiantHouse, true);
  let v = summonHtml(i, w.units); assert.equal(v.giantBtn, true); assert.match(v.mid, /자이언트의 집'을 다 지어야 와요/); assert.match(v.mid, /data-act="giantHouse"/);
  assert.equal(summonButton(i).why, P.REASON_GIANT); assert.equal(v.giantOnly, true, "까닭이 자이언트뿐이면 안내 칸만"); assert.match(v.head, /자이언트의 집이 필요해요/);
  ready(w, "giantHouse"); i = w.summonInfo(); assert.deepEqual([i.can, i.count], [true, 1]); assert.equal(summonHtml(i, w.units).giantBtn, false);
  w.summon(); i = w.summonInfo(); v = summonHtml(i, w.units);
  assert.equal(summonButton(i).text, "🥚 모두 모였어요"); assert.match(v.head, /모두 모였어요/); assert.match(v.bottom, /모두 왔어요/);
});
