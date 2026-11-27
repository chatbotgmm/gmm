// 시점 편의(편의성 점검 1·3·9번): three.js 없이 계산만 하는 작은 함수들 — node --test로 시험.
// - 따라가기 가까이 붙기: 목록·카드에서 따라가기를 시작하면 10 m로 다가가고, 그만두면 원래 거리로 돌아감
// - 갈매미 누르기 판정: 누른 곳에서 화면 px 반지름 안의 가장 가까운 갈매미(정확히 안 맞혀도)
// - 🏝 마을 전체 보기: 처음 시점(섬 전체가 보이는 높고 넓은 비스듬한 시점)으로 돌아가기

/** 처음 시점: 화면 중심(target)과 카메라까지의 거리·높이(main.js 처음 카메라와 같은 값). 세로 화면은 더 높게 */
export const HOME_TARGET = Object.freeze({ x: 0, y: 0, z: 4 });
export const HOME_OFF = Object.freeze({ portrait: Object.freeze({ x: 0, y: 70, z: 46 }), wide: Object.freeze({ x: 0, y: 54, z: 48 }) });
/** 따라가며 가까이 붙는 거리(m)와, 이보다 멀면 다가감(가까이 보고 있으면 거리는 그대로) */
export const FOLLOW_NEAR = 10, FOLLOW_FAR = 14;
/** 갈매미 누르기 판정 반지름(화면 CSS px): 점검 권장 24–32 px의 가운데 */
export const PICK_PX = 28;

/** 따라가기 가까이 붙기: 지금 거리 len에서 다가갈 거리(null = 이미 가까워 그대로) */
export function followZoomLen(len) { return len > FOLLOW_FAR ? FOLLOW_NEAR : null; }

/** 따라가기를 시작할 때 "돌아갈 거리"를 정함: 이미 기억해 둔 게 있으면(따라가는 중 다른 갈매미로 바꿈) 그대로, 다가가지 않으면 기억할 것도 없음 */
export function followBackLen(saved, len) { return saved != null ? saved : followZoomLen(len) != null ? len : null; }

/**
 * 화면 점들 중 (x, y)에서 반지름 r px 안의 가장 가까운 것.
 * pts: [{ x, y, id, ... }] (화면 CSS px, 카메라 뒤인 점은 미리 빼고 넘김). 없으면 null.
 */
export function nearestOnScreen(pts, x, y, r = PICK_PX) {
  let best = null, bd = r * r;
  for (const p of pts) { const dx = p.x - x, dy = p.y - y, d = dx * dx + dy * dy; if (d <= bd) { bd = d; best = p; } }
  return best;
}

/** NDC(-1..1, y 위) 좌표를 화면 CSS px로(rect = 캔버스 getBoundingClientRect). 카메라 뒤(z > 1)면 null */
export function ndcToScreen(n, rect) {
  if (!(n.z <= 1) || !Number.isFinite(n.x) || !Number.isFinite(n.y)) return null;
  return { x: rect.left + (n.x + 1) / 2 * rect.width, y: rect.top + (1 - n.y) / 2 * rect.height };
}

/**
 * 🏝 마을 전체 보기의 목표: 중심은 처음 자리, 카메라는 처음 높이·거리. 지금 보던 방향(가로 각도)은 그대로 둠(돌려 보던 사람이 헷갈리지 않게).
 * off = 지금 카메라 − 중심. 돌려주는 off도 같은 뜻.
 */
export function overviewGoal(off, portrait) {
  const h = portrait ? HOME_OFF.portrait : HOME_OFF.wide, flat = Math.hypot(h.x, h.z);
  const fl = Math.hypot(off?.x || 0, off?.z || 0), ux = fl > 1e-6 ? off.x / fl : h.x / flat, uz = fl > 1e-6 ? off.z / fl : h.z / flat;
  return { target: { ...HOME_TARGET }, off: { x: ux * flat, y: h.y, z: uz * flat }, len: Math.hypot(flat, h.y) };
}

/** 보는 점이 섬 가운데(HOME_TARGET)에서 이만큼(m) 넘게 떨어지면 「섬 밖 바다」로 봄 — 열린 세계(끝없는 바다)에서 길을 잃었을 때 돌아올 단추. 섬 격자 반폭(96 m) + 여유 */
export const OVERVIEW_AWAY = 120;
/** 🏝 전체 보기 단추를 보일까: 따라가는 중이거나 처음 시점보다 많이 가까이 봄(70% 미만)이거나 섬에서 멀리 나감(away m > OVERVIEW_AWAY) · 건설 모드·방 안에서는 숨김 */
/** homeLen: 기준 거리(가까운 비스듬히 시점은 기본 거리 30 m·26 m — viewCam.viewHomeLen). 없으면 처음 시점 거리 */
export function showOverviewBtn({ len, following, portrait, mode, inRoom, away = 0, homeLen = null }) {
  if (inRoom || (mode && mode !== "view")) return false;
  const h = portrait ? HOME_OFF.portrait : HOME_OFF.wide;
  return !!following || len < (homeLen ?? Math.hypot(h.x, h.y, h.z)) * 0.7 || away > OVERVIEW_AWAY;
}
