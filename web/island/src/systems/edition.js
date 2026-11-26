// 판(edition): 무료판 "free" | 유료판 "paid"와 배속(유료판 전용). 판은 이 모듈 한 곳에서만 읽고 씀(순수 모듈 — DOM·three 없음).
// 출처(source): "local" = 지금처럼 설정에서 고름(시험용, 누구나 바꿈) | "account" = 나중에 게임 시작 때 계정 서버에서 받은 값.
// 계정 값이 들어오면(applyAccountEdition) 그 값이 우선 — 설정에서는 보기만 하고 손으로는 못 바꿈.
// 배속: 마을 진행(world.update) ×1·×2·×3. 무료판이면 늘 ×1(무료로 바꾸면 고른 배속도 ×1로 돌아감).

export const EDITIONS = ["free", "paid"];
export const SPEEDS = [1, 2, 3];
export const EDITION_KEY = "galmaemiman-edition";   // {"edition":"free|paid","source":"local|account","at":ms}
export const SPEED_KEY = "galmaemiman-speed";       // "1" | "2" | "3"
export const MAX_STEPS = 12;                         // 한 프레임에 world.update를 돌리는 최대 횟수(시간 배수 시험 ×8 × 배속 ×3이 겹쳐도 이만큼까지)

/** 계정 서버가 줄 수 있는 여러 모양을 "free" | "paid"로. 모르는 값이면 null(무시) */
export function normEdition(v) {
  if (typeof v === "string") { const s = v.trim().toLowerCase(); if (s === "paid" || s === "pro" || s === "premium" || s === "유료") return "paid"; if (s === "free" || s === "무료") return "free"; return null; }
  if (typeof v === "boolean") return v ? "paid" : "free";            // { paid: true } 같은 값
  return null;
}
/** 실제로 적용할 배속: 유료판이고 고른 값이 ×1·×2·×3 중 하나일 때만 그 값, 아니면 1 */
export function effectiveSpeed(edition, speed) { return edition === "paid" && SPEEDS.includes(speed) ? speed : 1; }
/** ×1 → ×2 → ×3 → ×1 */
export function nextSpeed(s) { const i = SPEEDS.indexOf(s); return SPEEDS[(i + 1) % SPEEDS.length]; }
/** 한 프레임에 world.update를 몇 번 돌릴지: 시간 배수 시험(devSteps) × 배속, MAX_STEPS까지. 각 번의 dt는 그대로(프레임 dt는 이미 0.05초 이하) */
export function simSteps(devSteps, speed, max = MAX_STEPS) { return Math.max(1, Math.min(max, Math.round((devSteps || 1) * (speed || 1)))); }

/** localStorage를 감싸 읽기·쓰기 실패(사생활 보호 창·막힌 저장소)에도 던지지 않게 */
function safeStore(storage) {
  return {
    get(k) { try { return storage ? storage.getItem(k) : null; } catch { return null; } },
    set(k, v) { try { storage?.setItem(k, v); return true; } catch { return false; } },
  };
}
function defaultStorage() { try { return globalThis.localStorage ?? null; } catch { return null; } }

/** 판 상태 하나를 만듦. storage를 넘기면 그것을 씀(시험), 아니면 localStorage */
export function createEdition(storage = defaultStorage()) {
  const st = safeStore(storage), subs = new Set();
  let edition = "free", source = "local", speed = 1;
  { let raw = null; try { raw = JSON.parse(st.get(EDITION_KEY) || "null"); } catch { raw = null; }
    const e = normEdition(raw?.edition); if (e) { edition = e; source = raw.source === "account" ? "account" : "local"; }
    const s = +st.get(SPEED_KEY); if (SPEEDS.includes(s)) speed = s;
    if (edition !== "paid") speed = 1; }
  const save = () => { st.set(EDITION_KEY, JSON.stringify({ edition, source, at: Date.now() })); st.set(SPEED_KEY, String(speed)); };
  const emit = () => { const s = api.snapshot(); for (const f of subs) { try { f(s); } catch { /* 듣는 쪽 오류는 넘어감 */ } } };
  const setEd = (e, src) => { const was = edition + source + speed; edition = e; source = src; if (e !== "paid") speed = 1; save(); if (was !== edition + source + speed) emit(); };
  const api = {
    get edition() { return edition; }, get source() { return source; },
    get isPaid() { return edition === "paid"; },
    /** 고른 배속(유료판일 때만 1이 아닐 수 있음) */
    get chosenSpeed() { return speed; },
    /** 지금 적용하는 배속 */
    get speed() { return effectiveSpeed(edition, speed); },
    /** 설정에서 손으로 판을 바꿀 수 있는지: 계정 값으로 정해진 뒤에는 못 바꿈(보기만) */
    get canPick() { return source !== "account"; },
    snapshot() { return { edition, source, speed: effectiveSpeed(edition, speed), chosenSpeed: speed, canPick: source !== "account" }; },
    /** 설정에서 고름. { ok, reason } — 계정 값이 정해졌으면 reason "account" */
    setLocal(v) { const e = normEdition(v); if (!e) return { ok: false, reason: "bad" }; if (source === "account") return { ok: false, reason: "account" }; setEd(e, "local"); return { ok: true }; },
    /** 나중에 게임 시작 때 계정 서버 값을 받으면 부름: 그 값으로 덮어쓰고 저장(출처 = account). 모르는 값이면 아무것도 안 바꾸고 false */
    applyAccountEdition(v) { const e = normEdition(v); if (!e) return false; setEd(e, "account"); return true; },
    /** 계정 연결을 끊었을 때(로그아웃 등): 지금 판은 그대로 두고 출처만 local로 → 설정에서 다시 고를 수 있음 */
    releaseAccount() { if (source !== "account") return; setEd(edition, "local"); },
    /** 배속 고르기. 무료판이면 { ok: false, reason: "locked" }(값은 1 그대로) */
    setSpeed(s) { s = +s; if (!SPEEDS.includes(s)) return { ok: false, reason: "bad", speed: api.speed }; if (edition !== "paid") return { ok: false, reason: "locked", speed: 1 };
      if (s !== speed) { speed = s; save(); emit(); } return { ok: true, speed }; },
    cycleSpeed() { return api.setSpeed(nextSpeed(api.speed)); },
    /** 바뀔 때마다 f(snapshot). 끊는 함수를 돌려줌 */
    onChange(f) { subs.add(f); return () => subs.delete(f); },
  };
  return api;
}
