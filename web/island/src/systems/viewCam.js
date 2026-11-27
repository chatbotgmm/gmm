// 평소 시점(둘러보기): 「가까운 비스듬히」(기본) · 「자유 회전」(예전) 두 가지. 설정에서 고르고 이 기기에 기억(localStorage).
//  가까운 비스듬히: 땅에서 35° 위로 내려다보고, 거리 세로 화면 30 m · 가로 화면 26 m, 렌즈(세로 화각) 세로 50° · 가로 40°.
//   돌리기는 90° 단위만(⟲ ⟳ · Z X · 두 손가락 비틀기 45° 넘게), 한 손가락·왼쪽 끌기 = 화면 옮기기. 확대 9 ~ 55 m:
//   기본 거리보다 멀어지면 각도가 위에서 보는 쪽으로 올라감(55 m에서 땅에서 58°) — 멀리서도 마을이 납작하게 눌려 보이지 않게.
//  자유 회전: 예전 그대로(끌어 돌리기·기울이기, 1.5 ~ 110 m, 렌즈 세로 62° · 가로 45°).
// 시점 조사(scratchpad camqol/camera.md 2b안)의 숫자. three.js 없이(quarterView.js의 각도 함수만) — node --test로 시험.
import { quarterOrbit, quarterOffset, quarterNorm, quarterDelta } from "./quarterView.js";

export const VIEW_KEY = "galmaemiman-cam";
export const VIEW_MODES = ["near", "free"];
const VIEW_RAD = Math.PI / 180;
/** 가까운 비스듬히 숫자 */
export const NEAR_VIEW = Object.freeze({
  elevDeg: 35,                                        // 기본 거리 이하에서 땅에서 위로 각도
  topElevDeg: 58,                                     // 가장 멀리(max)에서의 각도
  dist: Object.freeze({ portrait: 30, wide: 26 }),    // 기본 거리(m)
  fov: Object.freeze({ portrait: 50, wide: 40 }),     // 세로 화각(°)
  min: 9, max: 55,                                    // 확대 범위(m)
  turnSec: 0.35,                                      // 90° 돌리는 시간
  twistDeg: 45,                                       // 두 손가락을 이만큼 넘게 비틀면 90° 돌림
});
/** 자유 회전(예전) 숫자: main.js가 원래 쓰던 값 */
export const FREE_VIEW = Object.freeze({ fov: Object.freeze({ portrait: 62, wide: 45 }), min: 1.5, max: 110 });

/** 저장된 시점(없거나 이상하면 기본 near) */
export function readViewPref(get) { let v = null; try { v = get(VIEW_KEY); } catch { /* 저장을 못 쓰는 곳 */ } return VIEW_MODES.includes(v) ? v : "near"; }
export function saveViewPref(set, v) { try { set(VIEW_KEY, v); } catch { /* 무시 */ } }

/** 기본 거리(m) */
export const nearHomeDist = portrait => portrait ? NEAR_VIEW.dist.portrait : NEAR_VIEW.dist.wide;
/** 시점별 세로 화각 */
export const viewFov = (mode, portrait) => (mode === "near" ? NEAR_VIEW.fov : FREE_VIEW.fov)[portrait ? "portrait" : "wide"];
/**
 * 거리 → 땅에서 위로 각도(°): 기본 거리 이하 35°, 그 너머는 max까지 부드럽게(smoothstep) topElevDeg로.
 * 처음 조금 멀어질 때는 거의 그대로라 오므리기 시작이 튀지 않고, 끝(55 m)에서도 멈추듯 닿음.
 */
export function nearElevDeg(dist, portrait) {
  const d0 = nearHomeDist(portrait), t = Math.max(0, Math.min(1, (dist - d0) / (NEAR_VIEW.max - d0))), s = t * t * (3 - 2 * t);
  return NEAR_VIEW.elevDeg + (NEAR_VIEW.topElevDeg - NEAR_VIEW.elevDeg) * s;
}
/** 거리 → 수직에서 기운 각(라디안, quarterOffset의 pitch) */
export const nearPitch = (dist, portrait) => (90 - nearElevDeg(dist, portrait)) * VIEW_RAD;
/** 가장 가까운 90° 방향(0 = +z 쪽에서 봄) */
export const snap90 = yaw => quarterNorm(Math.round(quarterNorm(yaw) / (Math.PI / 2)) * (Math.PI / 2));
/** 두 손가락 비틀기 누적(라디안) → { turn: −1 | 0 | +1, acc: 남은 누적 }. 한 번 돌리면 누적을 비움(계속 비틀면 45°마다 또 돌림) */
export function twistTurn(acc) {
  const th = NEAR_VIEW.twistDeg * VIEW_RAD;
  return Math.abs(acc) > th ? { turn: Math.sign(acc), acc: 0 } : { turn: 0, acc };
}
/** 🏝 전체 보기 거리: 가장 멀리(max) — 위에서 보는 쪽(58°)으로 */
export const nearOverviewLen = () => NEAR_VIEW.max;
/** 🏝 단추를 보일 거리 기준(이보다 70% 미만으로 가까이 보면 보임): 가까운 비스듬히는 기본 거리 */
export const viewHomeLen = (mode, portrait) => mode === "near" ? nearHomeDist(portrait) : null;

const viewEase = t => 1 - Math.pow(1 - t, 3);

/**
 * camera(position.set·lookAt·fov), controls(target·enableRotate·minDistance·maxDistance), quarterCam(locked·tween·saved·rotateWas·minWas)
 * main.js 순서: controls.update() → quarterCam.tick() → viewCam.tick()
 */
export class ViewCam {
  constructor({ camera, controls, quarterCam, mode = "near", portrait = () => true, quick = null }) {
    Object.assign(this, { camera, controls, quarterCam, portrait });
    this.mode = VIEW_MODES.includes(mode) ? mode : "near"; this.yaw = 0; this.tw = null; this.last = undefined;
    this.quick = quick || (() => quarterCam?.quick?.() || false);
  }
  get locked() { return this.mode === "near"; }
  orbit() { const c = this.camera.position, t = this.controls.target; return quarterOrbit({ x: c.x - t.x, y: c.y - t.y, z: c.z - t.z }); }
  place(r, yaw, pitch) { const t = this.controls.target, o = quarterOffset(r, yaw, pitch); this.camera.position.set(t.x + o.x, t.y + o.y, t.z + o.z); this.camera.lookAt(t.x, t.y, t.z); }
  /** 지금 시점 숫자(도) — 화면 확인·시험용 */
  state() { const o = this.orbit(); return { mode: this.mode, dist: +o.r.toFixed(2), elev: +(90 - o.pitch / VIEW_RAD).toFixed(2), yaw: +(o.yaw / VIEW_RAD).toFixed(2), fov: this.camera.fov, turning: !!this.tw }; }
  /** 컨트롤 허용 범위(돌리기·거리)를 시점에 맞춤. 건설 모드(쿼터뷰) 중이면 끝낼 때 돌려놓을 값을 바꿔 둠 */
  applyLimits() {
    const c = this.controls, near = this.locked, min = near ? NEAR_VIEW.min : FREE_VIEW.min, max = near ? NEAR_VIEW.max : FREE_VIEW.max, q = this.quarterCam;
    c.maxDistance = max;
    if (q?.locked) { q.rotateWas = !near; q.minWas = min; c.minDistance = Math.max(min, c.minDistance); }
    else { c.enableRotate = !near; c.minDistance = min; }
  }
  /** 처음 한 번: 가까운 비스듬히면 기본 거리·35°·지금 방향(90° 맞춤)으로 바로 */
  init() {
    this.applyLimits(); if (!this.locked) return;
    const o = this.orbit(), p = this.portrait(); this.yaw = snap90(o.yaw); this.place(nearHomeDist(p), this.yaw, nearPitch(nearHomeDist(p), p));
  }
  /** 설정에서 시점 바꾸기: near로 오면 기본 거리·35°·가까운 90° 방향으로 부드럽게, free로 가면 지금 자리에서 자유롭게(각도·거리는 그대로) */
  setMode(mode) {
    if (!VIEW_MODES.includes(mode) || mode === this.mode) return false;
    this.mode = mode; this.applyLimits();
    if (mode === "near") {
      const o = this.orbit(), p = this.portrait(), r = nearHomeDist(p); this.yaw = snap90(o.yaw);
      if (this.quarterCam?.locked) { if (this.quarterCam.saved) this.quarterCam.saved = { yaw: this.yaw, pitch: nearPitch(r, p) }; return true; }   // 건설 모드를 끝낼 때 이 각도로
      this.go(o, this.yaw, nearPitch(r, p), r, 0.5);
    } else this.tw = null;
    return true;
  }
  go(o, yaw, pitch, r, d) { this.tw = { t: 0, y0: o.yaw, dy: quarterDelta(o.yaw, yaw), p0: o.pitch, dp: pitch - o.pitch, r0: o.r, dr: r == null ? 0 : r - o.r, d }; if (this.quick()) this.step(1e9); }
  /** ⟲(−1) ⟳(+1): 90° 돌리기(가까운 비스듬히 · 둘러보기에서만) */
  turn(dir) {
    if (!this.locked || this.quarterCam?.locked) return false;
    this.yaw = quarterNorm(snap90(this.yaw) + Math.sign(dir || 1) * Math.PI / 2);
    const o = this.orbit(); this.go(o, this.yaw, nearPitch(o.r, this.portrait()), null, NEAR_VIEW.turnSec); return true;
  }
  /** 🏝 전체 보기 목표(camAssist.overviewGoal과 같은 모양): 가까운 비스듬히는 max 거리·58°, 방향은 지금 90° 방향 그대로 */
  overviewGoal(target, portrait) {
    const len = nearOverviewLen(), o = quarterOffset(len, this.yaw, nearPitch(len, portrait));
    return { target: { ...target }, off: o, len };
  }
  /** 따라가기를 그만둘 때 돌아갈 거리: 가까운 비스듬히는 기본 거리, 자유 회전은 null(따라가기 전 거리) */
  restLen(portrait) { return this.locked ? nearHomeDist(portrait) : null; }
  step(dt) {
    const tw = this.tw; if (!tw) return;
    tw.t = Math.min(1, tw.t + dt / Math.max(1e-6, tw.d)); const k = viewEase(tw.t), o = this.orbit();
    const r = tw.dr ? tw.r0 + tw.dr * k : o.r;
    this.place(r, tw.y0 + tw.dy * k, tw.p0 + tw.dp * k);
    if (tw.t >= 1) this.tw = null;
  }
  /** 매 프레임(controls.update · quarterCam.tick 뒤). 건설 모드 쿼터뷰가 잡고 있으면 손대지 않음 */
  tick(now) {
    const dt = this.last === undefined ? 0 : Math.min(0.25, Math.max(0, (now - this.last) / 1000)); this.last = now;
    if (this.quarterCam?.locked || this.quarterCam?.tween) { this.tw = null; return; }
    if (this.tw) { this.step(dt); return; }
    if (!this.locked) return;
    const o = this.orbit(), pitch = nearPitch(o.r, this.portrait()), dy = Math.abs(quarterDelta(o.yaw, this.yaw));   // 확대·축소에 따라 각도를 거리 곡선에 맞춤, 방향은 90° 자리 그대로
    if (dy > 0.05) { this.go(o, this.yaw, pitch, null, NEAR_VIEW.turnSec); return; }   // 크게 어긋남(건설 모드를 끝내며 되돌아가는 중에 ⟲ ⟳ 누름 등): 순간이동 말고 부드럽게
    if (dy > 1e-4 || Math.abs(o.pitch - pitch) > 1e-4) this.place(o.r, this.yaw, pitch);
  }
}
