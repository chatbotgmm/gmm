// 말풍선 다이어트: 같은 혼잣말은 갈매미마다 하루 3번 · 소원 다시 알림은 마을 전체 하루 2번 · 배고픔 혼잣말은 갈매미마다 여러 가지 · 숫자는 건설 모드에서만
import { test } from "node:test";
import assert from "node:assert/strict";
import { chatter, SAME_BUBBLE_DAY, HUNGRY_SAY } from "../src/units/unitBrain.js";
import { UNITS } from "../src/data/catalog.js";
import { World, WISH_NAG_DAY } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";

test("같은 혼잣말은 갈매미마다 마을 하루에 3번까지 · ✨ 같은 짧은 표시는 그대로 · 다음 날 다시 · 묶음 이름(key)으로 셈", () => {
  const w = { time: 10 }, a = { unitId: 1 }, b = { unitId: 2 };
  const says = n => Array.from({ length: n }, () => chatter(a, "배고파…", w));
  assert.equal(SAME_BUBBLE_DAY, 3); assert.deepEqual(says(4), [true, true, true, false]);
  assert.equal(chatter(b, "배고파…", w), true, "다른 갈매미는 따로");
  for (let i = 0; i < 6; i++) assert.equal(chatter(a, "✨", w), true);
  w.time = 610; assert.equal(chatter(a, "배고파…", w), true, "다음 날");
  const c = { unitId: 3 }; ["꼬르륵…", "밥때가 됐나", "뭐 좀 먹을까"].forEach(t => assert.equal(chatter(c, t, w, 2, "mood:hungry"), true));
  assert.equal(chatter(c, "배가 출출하네…", w, 2, "mood:hungry"), false, "말만 바꾼 같은 잔소리도 3번까지");
});

test("배고픔 혼잣말: 갈매미 9종 모두 3~4가지(반말 혼잣말, 숫자·괄호 없음)", () => {
  for (const { name } of UNITS) {
    const l = HUNGRY_SAY[name]; assert.ok(l && l.length >= 3 && l.length <= 4, name);
    assert.equal(new Set(l).size, l.length, name); for (const t of l) assert.doesNotMatch(t, /[0-9()]|요$/, t);
  }
});

test("소원 다시 알림 말풍선은 마을 전체에서 하루 2번까지(예전엔 소원마다 20초마다)", () => {
  const w = World.create(7, seededRandom(3), { wild: true }); w.summon();
  let n = 0; for (let i = 0; i < 50; i++) { w.time = i * 10; if (w.wishNagOk()) n++; }
  assert.equal(n, WISH_NAG_DAY); w.time = 600 + 5; assert.equal(w.wishNagOk(), true, "다음 날");
});

test("숫자 말풍선(나무+2 · 🪙+12)은 건설 모드에서만: 마을 하루 동안 평소엔 숫자 말풍선 0", () => {
  const w = World.create(7, seededRandom(5), { wild: true }); w.summon(); w.instantBuild = true;
  const seen = new Set(); for (let t = 0; t < 600; t += 0.1) { w.update(0.1); for (const u of w.units) if (u.emoteT > 0 && u.emoteText) seen.add(u.emoteText); }
  assert.deepEqual([...seen].filter(t => /[+＋]\d|🪙/.test(t)), []);
});
