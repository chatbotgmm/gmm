// 진짜 마을에서 변신(tools/evoworld.mjs, 씨앗 고정 · 빠른 판): 집·카페·시장·밭이 있는 넓은 섬에 🥚 소환을 며칠에 걸쳐 하고 플레이어 버릇대로 손길을 줌.
//  · 누구나 하는 일(같이 나무 베기·물물교환·헤엄)은 마을 평균을 빼고 보므로 모두가 한 모습으로 쏠리지 않음
//  · 변신은 온 지 3~6일 사이 · 같은 씨앗이면 결과가 같음 · 날마다 바다에 내려놓으면 물방울이 늘어남
// 전체 분포(씨앗 7·23·31 × 16마리)는 node tools/evoworld.mjs 7,23,31 16 으로 봄(느림).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runVillage } from "../tools/evoworld.mjs";

const OPT = { dt: 0.5 };
const count = (rows, f) => rows.filter(r => r.form === f).length;

test("진짜 마을 8마리(씨앗 23, 버릇 섞음): 모두 3~6일에 변신 · 모습이 고루 나뉨(한 모습이 절반을 넘지 않음, 4가지 이상)", () => {
  const r = runVillage(23, 8, "mix", OPT);
  assert.equal(r.rows.length, 8);
  for (const x of r.rows) { assert.ok(x.age != null, `${x.id} 변신 안 함`); assert.ok(x.age >= 3 && x.age <= 6, `${x.id} ${x.age}일`); }
  const forms = new Set(r.rows.map(x => x.form)); assert.ok(forms.size >= 4, [...forms].join());
  for (const f of forms) assert.ok(count(r.rows, f) <= 4, `${f} ${count(r.rows, f)}마리`);
});

test("플레이어 손길: 같은 섬·같은 갈매미라도 날마다 바다에 내려놓으면 물방울이 늘고 바다 카운터가 커짐 · 같은 씨앗이면 결과가 같음", () => {
  const none = runVillage(7, 8, "none", OPT), sea = runVillage(7, 8, "sea", OPT);
  const short = () => runVillage(7, 4, "mix", { ...OPT, maxDays: 2 }).rows.map(x => [x.id, x.form, x.growth]);
  assert.deepEqual(short(), short(), "결정적(같은 씨앗 → 같은 카운터)");
  const seaSum = rs => rs.reduce((s, x) => s + (x.growth?.sea || 0), 0);
  assert.ok(seaSum(sea.rows) > seaSum(none.rows) * 1.5, `바다 카운터 ${seaSum(none.rows).toFixed(1)} → ${seaSum(sea.rows).toFixed(1)}`);
  assert.ok(count(sea.rows, "물방울") > count(none.rows, "물방울"), `물방울 ${count(none.rows, "물방울")} → ${count(sea.rows, "물방울")}`);
});
