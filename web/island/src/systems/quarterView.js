// 건설 모드의 고정 쿼터뷰: 건설 모드에 들어가면 카메라를 정해진 각도로 내려다보게 맞추고(위아래 기울기 고정),
// 방향은 대각선 네 곳(45°·135°·225°·315°) 가운데 가장 가까운 곳으로 맞춘다. ⟲ ⟳ 로 90°씩 돌리고, 건설 모드를 끝내면 보던 각도로 되돌린다.
// 화면 옮기기·확대는 그대로(OrbitControls·twoFinger.js), 돌리기·기울이기만 막는다. 각도 계산은 three.js 없이(시험하기 쉽게).

/** 고정 중 가장 가까이 볼 수 있는 거리(m): 너무 다가가 언덕에 카메라가 묻히면 각도를 지킬 수 없어서 */
export const QUARTER_MIN_DIST = 5;
/** 내려다보는 각도: 수직(바로 위에서 내려다봄)에서 52° 기운 곳 = 땅에서 38° 위 */
export const QUARTER_PITCH_DEG = 52;
/** 고정 방향(위에서 본 카메라 방위각, 0° = +z 쪽에서 봄) */
export const QUARTER_YAWS_DEG = [45, 135, 225, 315];
const QUARTER_RAD = Math.PI / 180, QUARTER_TURN = Math.PI * 2, QUARTER_STEP = Math.PI / 2;

/** 각도를 0 ~ 2π로 */
export const quarterNorm = a => ((a % QUARTER_TURN) + QUARTER_TURN) % QUARTER_TURN;
/** 가장 가까운 대각선 방향(라디안, 0 ~ 2π). 정확히 사이(0°·90°…)면 시계 반대쪽 것 */
export function quarterSnapYaw(yaw) { return (Math.floor(quarterNorm(yaw) / QUARTER_STEP + 1e-9) + 0.5) * QUARTER_STEP; }
/** 지금 방향에서 dir(+1 · −1)쪽으로 90° 돈 대각선 방향 */
export function quarterStepYaw(yaw, dir) { return quarterNorm(quarterSnapYaw(yaw) + Math.sign(dir || 1) * QUARTER_STEP); }
/** from → to로 가는 가장 짧은 회전(−π ~ π] */
export function quarterDelta(from, to) { const d = quarterNorm(to - from); return d > Math.PI ? d - QUARTER_TURN : d; }
/** 카메라 − 보는 점 벡터 → { r 거리, yaw 방위각, pitch 수직에서 기운 각 } */
export function quarterOrbit(off) { const r = Math.hypot(off.x, off.y, off.z) || 1; return { r, yaw: quarterNorm(Math.atan2(off.x, off.z)), pitch: Math.acos(Math.max(-1, Math.min(1, off.y / r))) }; }
/** 거리·방위각·기운 각 → 카메라 − 보는 점 벡터 */
export function quarterOffset(r, yaw, pitch) { const s = Math.sin(pitch) * r; return { x: s * Math.sin(yaw), y: Math.cos(pitch) * r, z: s * Math.cos(yaw) }; }
const quarterEase = t => 1 - Math.pow(1 - t, 3);                                  // 빨리 출발해 부드럽게 멈춤

export class QuarterCam {
  constructor({ camera, controls, duration = 0.3 }) {
    this.camera = camera; this.controls = controls; this.duration = duration; this.locked = false; this.goal = null; this.saved = null; this.tween = null;
  }
  now() { const c = this.camera.position, t = this.controls.target; return quarterOrbit({ x: c.x - t.x, y: c.y - t.y, z: c.z - t.z }); }
  /** 지금 카메라 각도(도) — 화면 확인·시험용 */
  state() { const o = this.now(); return { locked: this.locked, yaw: +(o.yaw / QUARTER_RAD).toFixed(2), pitch: +(o.pitch / QUARTER_RAD).toFixed(2), moving: !!this.tween }; }
  quick() {                                                                       // 움직임 줄이기: 설정(html[data-motion])이 있으면 그것, 없으면 기기 설정
    const m = typeof document !== "undefined" ? document.documentElement?.dataset?.motion : null; if (m) return m === "reduce";
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  go(yaw, pitch) { const o = this.now(); this.tween = { t: 0, yaw0: o.yaw, dYaw: quarterDelta(o.yaw, yaw), pitch0: o.pitch, dPitch: pitch - o.pitch }; if (this.quick() || this.duration <= 0) this.update(1e9); }
  /** 건설 모드로: 보던 각도를 기억하고 고정 쿼터뷰로 */
  enter() {
    if (this.locked) return; const o = this.now();
    this.saved = { yaw: o.yaw, pitch: o.pitch }; this.goal = { yaw: quarterSnapYaw(o.yaw), pitch: QUARTER_PITCH_DEG * QUARTER_RAD };
    this.locked = true; this.rotateWas = this.controls.enableRotate; this.controls.enableRotate = false;
    this.minWas = this.controls.minDistance; if (Number.isFinite(this.minWas)) this.controls.minDistance = Math.max(this.minWas, QUARTER_MIN_DIST);
    this.go(this.goal.yaw, this.goal.pitch);
  }
  /** 건설 모드 끝: 들어오기 전에 보던 각도로 */
  exit() {
    if (!this.locked) return; this.locked = false; this.controls.enableRotate = this.rotateWas ?? true; if (Number.isFinite(this.minWas)) this.controls.minDistance = this.minWas;
    if (this.saved) this.go(this.saved.yaw, this.saved.pitch); this.saved = null;
  }
  /** ⟲(−1) ⟳(+1): 90° 돌리기. 고정 중이 아니면 아무것도 안 함 */
  turn(dir) {
    if (!this.locked) return false;
    this.goal.yaw = quarterStepYaw(this.goal.yaw, dir); this.go(this.goal.yaw, this.goal.pitch); return true;
  }
  /** 매 프레임(controls.update 뒤). now = performance.now(): 프레임이 느려도 돌리는 시간은 같게 실제 시각으로 잼 */
  tick(now) { const dt = this.last === undefined ? 0 : Math.min(0.25, Math.max(0, (now - this.last) / 1000)); this.last = now; this.update(dt); }
  /** 돌리는 중이면 한 걸음, 고정 중이면 각도를 그대로 지킴(보는 점은 건드리지 않음, 거리는 가장 가까운 거리만 지킴) */
  update(dt) {
    const tw = this.tween; let yaw, pitch;
    if (tw) {
      tw.t = Math.min(1, tw.t + dt / Math.max(1e-6, this.duration)); const k = quarterEase(tw.t);
      yaw = tw.yaw0 + tw.dYaw * k; pitch = tw.pitch0 + tw.dPitch * k; if (tw.t >= 1) this.tween = null;
    } else if (this.locked) { yaw = this.goal.yaw; pitch = this.goal.pitch; }
    else return;
    const t = this.controls.target, o = quarterOffset(this.locked ? Math.max(this.now().r, this.controls.minDistance || 0) : this.now().r, yaw, pitch);
    this.camera.position.set(t.x + o.x, t.y + o.y, t.z + o.z); this.camera.lookAt(t.x, t.y, t.z);
  }
}
