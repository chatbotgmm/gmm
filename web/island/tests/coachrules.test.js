// 「처음이에요」 말풍선 규칙(편의성 점검 13번): 몇 초 뒤 접힘 · 건설 모드·방 안에서는 숨김. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { COACH_FOLD_MS, momentShowable, pickMoment, momentFolded, nightTipFits } from "../src/ui/coachRules.js";
import { readFileSync } from "node:fs";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import { BUILDINGS } from "../src/data/catalog.js";

test("보일 곳: 선물·입질 안내는 둘러보기에서만, 방 안내는 방 안에서만", () => {
  assert.equal(momentShowable("gift", {}), true);
  assert.equal(momentShowable("gift", { editMode: true }), false);
  assert.equal(momentShowable("tug", { inRoom: true }), false);
  assert.equal(momentShowable("room", { inRoom: true }), true);
  assert.equal(momentShowable("room", {}), false);
});

test("대기열: 보일 수 없는 안내는 건너뛰고 다음 것을(방 안에서 선물 안내가 방 안내를 막지 않음)", () => {
  assert.equal(pickMoment(["gift", "room"], { inRoom: true }), "room");
  assert.equal(pickMoment(["gift", "tug"], { editMode: true }), null);
  assert.equal(pickMoment(["tug", "gift"], {}), "tug");
});

test("접힘: 처음 보인 뒤 몇 초(2~10초) 지나면 · 펼쳐 두기를 누른 안내는 안 접음", () => {
  assert.ok(COACH_FOLD_MS >= 2000 && COACH_FOLD_MS <= 10000);
  assert.equal(momentFolded(1000, 1000 + COACH_FOLD_MS - 1), false);
  assert.equal(momentFolded(1000, 1000 + COACH_FOLD_MS), true);
  assert.equal(momentFolded(1000, 1000 + COACH_FOLD_MS * 3, true), false);
  assert.equal(momentFolded(null, 99999), false);
});

test("첫 밤 안내: 목수가 있고 풍차가 하나도 없을 때만(짓는 중이면 안 띄움) · 둘러보기에서, 처음 안내 3단계가 끝난 뒤", () => {
  const isPower = id => !!BUILDINGS[id]?.power, w = World.create(7, seededRandom(3), { wild: true });
  const near = (defId, hits) => { const c = w.center; for (let r = 3; r < 40; r++) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.28, q = w.placeBuilding(defId, Math.floor(c.x + Math.cos(a) * r), Math.floor(c.z + Math.sin(a) * r), 0, null, hits); if (q.ok) return q.building; } return null; };
  assert.equal(nightTipFits(w, isPower), false, "갈매미 없음");
  w.summon(); assert.equal(nightTipFits(w, isPower), false, "건축가뿐: 풍차를 지을 목수가 없어 고칠 길이 없음");
  near("house", 1e9); w.summon(); assert.ok(w.units.some(u => u.job === "carpenter")); assert.equal(nightTipFits(w, isPower), true);
  const mill = near("windmill", 0); assert.equal(w.isDone(mill), false); assert.equal(nightTipFits(w, isPower), false, "짓는 중인 풍차가 있으면 안 띄움(곧 켜짐)");
  w.removeBuilding(mill.id); assert.equal(nightTipFits(w, isPower), true);
  assert.equal(momentShowable("night", {}), true);
  assert.equal(momentShowable("night", { editMode: true }), false, "건설 모드에선 기다림");
  assert.equal(momentShowable("night", { stepping: true }), false, "처음 안내 3단계 중엔 기다림");
  assert.equal(momentShowable("gift", { stepping: true }), true, "다른 안내는 그대로");
  assert.equal(pickMoment(["night", "tug"], { stepping: true }), "tug");
});

test("첫 밤 안내 글: 주어진 한 줄 그대로 · 괄호 없음 · 🔨 풍차 놓기 지름길이 풍차를 고른 채 건설 모드로 · 밤에만 살핌", () => {
  const src = readFileSync(new URL("../src/ui/coach.js", import.meta.url), "utf8"), main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const line = src.split("\n").find(l => /^\s*night: \{/.test(l)); assert.ok(line, "night 안내");
  assert.ok(line.includes('"🌙 밤이 깜깜하죠? 풍차를 지으면 창과 가로등이 켜져요"')); assert.ok(line.includes('label: "🔨 풍차 놓기", build: "windmill"'));
  assert.ok(!/[()（）]/.test(line.match(/"🌙[^"]*"/)[0]), "한 줄 UI 글엔 괄호 없음");
  assert.ok(/tools\?\.setMode\("build", go\.build\)/.test(src), "지름길 → 건설 모드");
  assert.ok(/if \(world\.isNight && ready\) hud\?\.coach\?\.night\(world\);/.test(main), "밤에만, 불러오기가 끝난 뒤");
});
