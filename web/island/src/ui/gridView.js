// 건설 모드 격자선(▦ 격자): 보일지 정하는 순수 함수 + 켜기/끄기 기억(localStorage). DOM·three.js 없이(시험에서 그대로 부름).
export const GRID_PREF_KEY = "galmaemiman-grid";

/** 격자선이 보이는지: 건설 모드(tools.mode가 "view"가 아님) + 토글 켜짐 + 방 화면이 아님 */
export function gridShown({ mode, on = true, room = false } = {}) {
  return !!on && !room && typeof mode === "string" && mode !== "" && mode !== "view";
}

/** 저장된 값 읽기. get: 키 → 글자(없으면 null). 못 읽거나(예외) 처음이면 켜짐 */
export function readGridPref(get) {
  let v = null;
  try { v = get(GRID_PREF_KEY); } catch { return true; }
  return v !== "off" && v !== "0" && v !== "false";
}

/** 저장(실패해도 조용히). 저장했으면 true */
export function saveGridPref(set, on) {
  try { set(GRID_PREF_KEY, on ? "on" : "off"); return true; } catch { return false; }
}
