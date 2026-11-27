// 그림체 재질 출신 기록(render/toonSrc.js) 시험. 섬·방 Toon이 재질을 나눠 써도 늘 원래 재질에서 바꾸는지. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { markToonMade, origin, isToonMade } from "../src/render/toonSrc.js";

test("원래 재질은 그대로, 바꾼 재질은 원래 재질로 돌아감", () => {
  const std = { name: "gull" }, islandClay = { name: "gull" };
  assert.equal(origin(std), std); assert.equal(isToonMade(std), false);
  markToonMade(islandClay, std);
  assert.equal(origin(islandClay), std); assert.equal(isToonMade(islandClay), true);
  assert.equal(origin(null), null);
});

test("방 Toon이 섬이 바꾼 재질로 또 만들어도 출신은 맨 처음 재질(두 번 덧붙이지 않음 — 방 갈매미가 그림자만 남던 버그)", () => {
  const std = {}, island = markToonMade({}, std), room = markToonMade({}, island);
  assert.equal(origin(room), std);
});

test("Toon.convert는 다른 Toon이 만든 재질을 원래 재질에서 다시 바꿈(셰이더 수정 한 번)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/render/toon.js", import.meta.url), "utf8");
  const conv = src.slice(src.indexOf("  convert(m) {"), src.indexOf("  sweep("));
  assert.match(conv, /m = origin\(m\)/, "convert가 origin()으로 원래 재질에서 시작");
  assert.ok(conv.indexOf("origin(m)") < conv.indexOf("isMeshStandardMaterial"), "종류 판정보다 먼저 원래 재질로");
  assert.match(conv, /markToonMade\(t, m\)/, "만든 재질을 공용 기록에 적음");
  assert.match(src, /this\.toStd\.get\(m\) \|\| origin\(m\)/, "되돌릴 때도 원래 재질로");
});
