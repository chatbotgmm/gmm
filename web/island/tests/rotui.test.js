// 돌리기 단추(ui/rotIcons.js · hud.js · index.html): 화면 돌리기 알약(카메라)과 건물 돌리기(물체)가 모양·색·글이 다르고, 나침반이 카메라 방위를 따름. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { camTurnSvg, compassSvg, objTurnSvg, northDeg, northLabel, rotChanged } from "../src/ui/rotIcons.js";
import { ViewCam } from "../src/systems/viewCam.js";

const src = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const vec = (x = 0, y = 0, z = 0) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } });

test("그림: 화면 돌리기는 땅 마름모 + 호(오른쪽은 거울), 건물 돌리기는 집 + 고리 — 다른 모양, 화면 읽기에서는 숨김", () => {
  const L = camTurnSvg(-1), R = camTurnSvg(1), O = objTurnSvg(), C = compassSvg();
  for (const s of [L, R, O, C]) { assert.match(s, /aria-hidden="true"/); assert.match(s, /focusable="false"/); assert.match(s, /viewBox="0 0 24 24"/); }
  assert.match(L, /class="rotIco cam"/); assert.match(R, /class="rotIco cam flip"/); assert.match(R, /matrix\(-1 0 0 1 24 0\)/); assert.ok(!/matrix/.test(L));
  assert.match(L, /class="ground"/); assert.match(L, /class="arc"/);
  assert.match(O, /class="rotIco obj"/); assert.match(O, /class="ring"/); assert.ok(!/class="ground"/.test(O), "건물 돌리기에는 땅이 없음");
  assert.match(C, /class="needle"/); assert.match(C, /#c0392b/, "빨간 끝 = 북쪽");
  assert.ok(![L, R, O, C].some(s => /[⟲⟳↻]/.test(s)), "글자 그림(⟲ ⟳ ↻) 대신 SVG");
});

test("나침반: yaw 0이면 북쪽이 위, ⟳(+1)로 돌리면 시계 방향(오른쪽), ⟲(−1)이면 왼쪽 · 읽어 주기 여덟 방위", () => {
  assert.equal(northDeg(0), 0); assert.equal(northDeg(Math.PI / 2), 90); assert.equal(northDeg(-Math.PI / 2), 270); assert.ok(Math.abs(northDeg(Math.PI) - 180) < 1e-9);
  assert.ok(Math.abs(northDeg(4 * Math.PI + 0.1) - 0.1 * 180 / Math.PI) < 1e-9, "몇 바퀴 돌아도 0~360");
  assert.equal(northLabel(0), "북쪽: 위"); assert.equal(northLabel(Math.PI / 2), "북쪽: 오른쪽"); assert.equal(northLabel(Math.PI), "북쪽: 아래"); assert.equal(northLabel(-Math.PI / 2), "북쪽: 왼쪽");
  assert.equal(northLabel(Math.PI / 4), "북쪽: 오른쪽 위"); assert.equal(northLabel(-0.1), "북쪽: 위");
  // 진짜 카메라 숫자로: 가까운 비스듬히에서 turn(+1) 뒤 북쪽이 오른쪽(시계 방향), turn(−1) 두 번이면 왼쪽
  const camera = { position: vec(0, 30, 40), fov: 50, lookAt() {} }, controls = { target: vec(0, 0, 0), enableRotate: true, minDistance: 1.5, maxDistance: 110 };
  const v = new ViewCam({ camera, controls, mode: "near", portrait: () => true, quick: () => true }); v.init();
  assert.equal(northLabel(v.orbit().yaw), "북쪽: 위");
  v.turn(1); assert.equal(northLabel(v.orbit().yaw), "북쪽: 오른쪽");
  v.turn(-1); v.turn(-1); assert.equal(northLabel(v.orbit().yaw), "북쪽: 왼쪽");
});

test("건물 돌리기 고리: 카드가 떠 있는 채로 방향만 바뀌면 휙 · 새로 자리를 정하거나 그대로면 안 돎", () => {
  assert.equal(rotChanged(true, 0, 3), true);
  assert.equal(rotChanged(true, 2, 2), false, "자리만 옮김");
  assert.equal(rotChanged(false, 0, 3), false, "카드가 막 뜸(들기 · 새 자리)");
  assert.equal(rotChanged(true, undefined, 1), false, "처음");
});

test("화면 배치: 알약 하나(왼쪽 | 나침반 | 오른쪽) · 둘러보기 #turnBox · 건설 모드 #viewPill · 키 Z X R은 그대로 · 건물 돌리기는 시계 방향", () => {
  const hud = src("src/ui/hud.js"), keys = src("src/ui/keys.js"), html = src("index.html"), tools = src("src/systems/tools.js"), room = src("src/render/room.js");
  assert.match(hud, /camPill\("viewPill", \["viewL", "viewR"\]/); assert.match(hud, /camPill\("turnBox", \["turnL", "turnR"\]/);
  assert.match(hud, /role", "group"\); g\.setAttribute\("aria-label", "화면 돌리기"\)/);
  assert.match(hud, /aria-label", `화면을 \$\{side\}으로 90° 돌리기`/);
  assert.match(keys, /sel: "#viewL:not\(\[hidden\]\), #turnBox:not\(\[hidden\]\) #turnL"/); assert.match(keys, /sel: "#viewR:not\(\[hidden\]\), #turnBox:not\(\[hidden\]\) #turnR"/);
  assert.match(keys, /\["#cfRot", "R"\]/); assert.match(tools, /e\.code === "KeyR"\) this\.rotate\(\)/);
  assert.match(tools, /rotate\(\) \{ this\.rot = \(this\.rot \+ 3\) % 4;/, "rot +1은 모델이 반시계로 돎 → 시계 방향은 +3");
  assert.match(room, /this\.ghost\.rot = \(this\.ghost\.rot \+ 1\) % 4/); assert.match(room, /rotation\.y = -g\.rot \* Math\.PI \/ 2/, "방 가구는 원래 시계 방향");
  assert.match(hud, /const near = this\.camMode === "near"/); assert.match(hud, /vis\(this\.viewPill, near && mode !== "view"\); vis\(this\.turnBox, near && mode === "view"\)/, "자유 회전이면 둘 다 숨김");
  assert.match(html, /<button id="cfRot" aria-label="건물 방향 돌리기">돌리기<\/button>/); assert.ok(!/⟲|⟳/.test(html), "⟲ ⟳ 글자 단추 없음");
  assert.match(html, /\.camPill \.cpHalf \{ min-width: max\(var\(--hit\)/, "터치 44px 이상(--hit)");
  assert.match(html, /@media \(prefers-reduced-motion: reduce\) \{ \.camPill \.cpHalf\.spin \.arc, \.rotObj\.spin \.ring \{ animation: none; \} \}/);
  assert.match(html, /html\[data-motion="reduce"\] :is\(\.camPill \.cpHalf\.spin \.arc, \.rotObj\.spin \.ring\) \{ animation: none; \}/);
  assert.match(room, /addRot\(\)/); assert.ok(!/"↻ 돌리기"/.test(room));
});
