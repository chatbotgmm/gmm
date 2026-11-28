// 평소 시점(systems/viewCam.js): 가까운 비스듬히(기본) · 자유 회전(예전) — 거리별 각도 곡선 · 90° 돌리기 · 비틀기 · 설정 기억 · 건설 모드도 같은 카메라. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEAR_VIEW, FREE_VIEW, VIEW_KEY, readViewPref, saveViewPref, nearHomeDist, viewFov, nearElevDeg, snap90, twistTurn, viewHomeLen, ViewCam } from "../src/systems/viewCam.js";
import { readFileSync } from "node:fs";
import { showOverviewBtn } from "../src/systems/camAssist.js";

const D = Math.PI / 180;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const vec = (x = 0, y = 0, z = 0) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } });
function rig(mode = "near", portrait = true, pos = [0, 70, 50]) {
  const camera = { position: vec(...pos), fov: 50, lookAt() {} }, controls = { target: vec(0, 0, 4), enableRotate: true, minDistance: 1.5, maxDistance: 110 };
  const v = new ViewCam({ camera, controls, mode, portrait: () => portrait, quick: () => true });
  return { camera, controls, v };
}

test("숫자: 35° · 세로 30 m/가로 26 m · 렌즈 50°/40° · 확대 9~55 m · 자유 회전은 예전 그대로(62°/45°, 1.5~110 m)", () => {
  assert.equal(NEAR_VIEW.elevDeg, 35); assert.equal(nearHomeDist(true), 30); assert.equal(nearHomeDist(false), 26);
  assert.equal(viewFov("near", true), 50); assert.equal(viewFov("near", false), 40);
  assert.equal(viewFov("free", true), 62); assert.equal(viewFov("free", false), 45);
  assert.deepEqual([NEAR_VIEW.min, NEAR_VIEW.max], [9, 55]); assert.deepEqual([FREE_VIEW.min, FREE_VIEW.max], [1.5, 110]);
});

test("거리별 각도: 기본 거리 이하 35° · 멀어질수록 올라가 55 m에서 58° · 늘 커지기만(단조)", () => {
  for (const p of [true, false]) {
    assert.equal(nearElevDeg(9, p), 35); assert.equal(nearElevDeg(nearHomeDist(p), p), 35);
    assert.ok(near(nearElevDeg(55, p), NEAR_VIEW.topElevDeg)); assert.equal(nearElevDeg(80, p), NEAR_VIEW.topElevDeg);
    let last = 0; for (let d = 9; d <= 55; d += 0.5) { const e = nearElevDeg(d, p); assert.ok(e >= last - 1e-9); last = e; }
  }
  assert.ok(nearElevDeg(31, true) < 35.2, "막 멀어질 때는 거의 그대로(튀지 않음)");
});

test("90° 맞춤 · 비틀기 45° 넘으면 한 번 돌리기(방향 = 비튼 쪽)", () => {
  assert.ok(near(snap90(40 * D), 0)); assert.ok(near(snap90(50 * D), 90 * D)); assert.ok(near(snap90(-100 * D), 270 * D));
  assert.deepEqual(twistTurn(0.5), { turn: 0, acc: 0.5 });
  assert.deepEqual(twistTurn(0.8), { turn: 1, acc: 0 }); assert.deepEqual(twistTurn(-0.8), { turn: -1, acc: 0 });
});

test("설정 기억: 없거나 이상한 값이면 가까운 비스듬히 · 저장 못 하는 곳에서도 오류 없음", () => {
  const m = new Map(), get = k => m.get(k) ?? null, set = (k, v) => m.set(k, v);
  assert.equal(readViewPref(get), "near"); saveViewPref(set, "free"); assert.equal(m.get(VIEW_KEY), "free"); assert.equal(readViewPref(get), "free");
  m.set(VIEW_KEY, "weird"); assert.equal(readViewPref(get), "near");
  assert.equal(readViewPref(() => { throw new Error("sandbox"); }), "near"); saveViewPref(() => { throw new Error("sandbox"); }, "free");
});

test("처음: 가까운 비스듬히는 30 m·35°·회전 끔·9~55 m / 자유 회전은 자리·한계 그대로", () => {
  const a = rig("near"); a.v.init(); const s = a.v.state();
  assert.ok(near(s.dist, 30, 0.01) && near(s.elev, 35, 0.01) && near(s.yaw, 0, 0.01));
  assert.equal(a.controls.enableRotate, false); assert.deepEqual([a.controls.minDistance, a.controls.maxDistance], [9, 55]);
  const b = rig("free"); b.v.init(); assert.equal(b.controls.enableRotate, true); assert.deepEqual([b.controls.minDistance, b.controls.maxDistance], [1.5, 110]);
  assert.ok(near(b.v.state().dist, Math.hypot(70, 46), 0.01), "자유 회전은 처음 시점 그대로");
});

test("⟲ ⟳: 90°씩 · 각도는 거리 곡선 그대로 · 자유 회전에서는 안 돌림", () => {
  const { v } = rig("near"); v.init();
  assert.equal(v.turn(1), true); assert.ok(near(v.state().yaw, 90, 0.01)); assert.ok(near(v.state().elev, 35, 0.01));
  v.turn(-1); v.turn(-1); assert.ok(near(v.state().yaw, 270, 0.01));
  const f = rig("free"); f.v.init(); assert.equal(f.v.turn(1), false);
});

test("확대·축소하면 tick이 각도를 곡선에 맞추고 방향은 90° 자리 그대로", () => {
  const { v, camera, controls } = rig("near"); v.init(); v.turn(1); v.tick(0);
  const t = controls.target; camera.position.set(t.x + 30, t.y + 30, t.z + 10);         // 줌·흔들림으로 어긋난 자리(거리 약 43.6 m)
  v.tick(16); const s = v.state(); assert.ok(near(s.yaw, 90, 0.01)); assert.ok(near(s.elev, nearElevDeg(s.dist, true), 0.01)); assert.ok(near(s.dist, Math.hypot(30, 30, 10), 0.01));
});

test("건설 모드: 들어가고 나와도 카메라 그대로(각도·거리·방향 숫자 같음) · ⟲ ⟳ 는 건설 중에도 viewCam이 90°", () => {
  for (const mode of ["near", "free"]) {
    const { v, camera, controls } = rig(mode, true, [12, 40, 30]); v.init(); if (mode === "near") { v.turn(1); for (let t = 0; t < 1000; t += 16) v.tick(t); }
    const snap = () => [camera.position.x, camera.position.y, camera.position.z, controls.target.x, controls.target.z, controls.minDistance, controls.maxDistance, controls.enableRotate];
    const before = snap();
    for (let t = 1000; t < 2000; t += 16) v.tick(t);                                // 건설 모드 = 아무 일도 없음: 몇 초 지나도 숫자 그대로
    assert.deepEqual(snap(), before, `${mode}: 들어가도 그대로`);
    if (mode === "near") { assert.equal(v.turn(1), true); for (let t = 2000; t < 3000; t += 16) v.tick(t); assert.ok(near(v.state().yaw, 180, 0.01)); assert.ok(near(v.state().elev, 35, 0.01)); }
    else assert.equal(v.turn(1), false, "자유 회전은 끌어서 돌림");
  }
});

test("main.js·viewCam.js: 건설 모드에 들어가고 나올 때 카메라를 건드리지 않음(QuarterCam 없음, tools.onMode를 감싸 카메라를 바꾸지 않음)", () => {
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8"), vc = readFileSync(new URL("../src/systems/viewCam.js", import.meta.url), "utf8");
  assert.ok(!/QuarterCam|quarterCam/.test(main), "main.js에 쿼터뷰 없음"); assert.ok(!/quarterCam/.test(vc));
  assert.ok(!/tools\.onMode\s*=/.test(main), "모드 바꿀 때 카메라를 바꾸는 손잡이 없음");
  assert.match(main, /hud\.onViewTurn = dir => viewCam\.turn\(dir\)/); assert.match(main, /twoFinger\.onTurn = dir => \{ if \(viewCam\.turn\(dir\)\) hud\?\.turnFx\(dir\); \}/);
});

test("설정 바꾸기: free → near는 기본 거리·35°·가까운 90°로 · near → free는 자리 그대로 회전 켬 · 다시 near면 회전 끔·9~55 m", () => {
  const { v, controls } = rig("free", true, [30, 40, 40]); v.init();
  assert.equal(v.setMode("near"), true); let s = v.state(); assert.ok(near(s.dist, 30, 0.01) && near(s.elev, 35, 0.01) && near(s.yaw % 90, 0, 0.01));
  assert.equal(v.setMode("near"), false, "같은 값");
  assert.equal(v.setMode("free"), true); assert.equal(controls.enableRotate, true); assert.ok(near(v.state().dist, 30, 0.01));
  assert.equal(v.setMode("near"), true); assert.equal(controls.enableRotate, false); assert.deepEqual([controls.minDistance, controls.maxDistance], [9, 55]);
});

test("🏝 전체 보기·따라가기 그만: 가까운 비스듬히는 55 m·58°(방향 그대로) · 기본 거리로 돌아감 · 단추는 기본 거리의 70% 미만일 때", () => {
  const { v } = rig("near"); v.init(); v.turn(1);
  const g = v.overviewGoal({ x: 0, y: 0, z: 4 }, true); assert.equal(g.len, 55); assert.ok(near(Math.hypot(g.off.x, g.off.y, g.off.z), 55, 1e-6));
  assert.ok(near(Math.atan2(g.off.y, Math.hypot(g.off.x, g.off.z)) / D, NEAR_VIEW.topElevDeg, 1e-6)); assert.ok(g.off.x > 50 * Math.cos(58 * D) * 0.9, "방향(90°) 그대로");
  assert.equal(v.restLen(true), 30); assert.equal(v.restLen(false), 26);
  const f = rig("free"); assert.equal(f.v.restLen(true), null);
  const base = { following: false, portrait: true, mode: "view", inRoom: false };
  assert.equal(showOverviewBtn({ ...base, len: 30, homeLen: viewHomeLen("near", true) }), false, "기본 거리에선 숨김");
  assert.equal(showOverviewBtn({ ...base, len: 12, homeLen: viewHomeLen("near", true) }), true, "가까이 보면 보임");
  assert.equal(showOverviewBtn({ ...base, len: 30, homeLen: viewHomeLen("free", true) }), true, "자유 회전은 예전 기준(처음 시점 83.8 m)");
});

test("크게 어긋나면(누가 카메라를 돌려 놓음): 한 프레임에 순간이동하지 않고 부드럽게 90° 자리로", () => {
  const camera = { position: vec(0, 70, 50), fov: 50, lookAt() {} }, controls = { target: vec(0, 0, 4), enableRotate: true, minDistance: 1.5, maxDistance: 110 };
  const v = new ViewCam({ camera, controls, mode: "near", portrait: () => true, quick: () => false }); v.init(); v.tick(0);
  v.yaw = Math.PI / 2; v.tick(32);
  const yaw = v.state().yaw; assert.ok(yaw < 45, `한 프레임 만에 90°로 튀지 않음(${yaw})`); assert.ok(v.tw);
  for (let t = 48; t < 1000; t += 16) v.tick(t);
  assert.ok(near(v.state().yaw, 90, 0.01));
});
