// 누르기 판정(순수 함수): 짧게 톡(tap) = 그 칸을 고름 · 끌기(drag) = 화면 옮기기.
// 「누르면 고르는」 건설 도구(🏠 짓기 · 🧹 철거 · 🚚 지형지물 옮기기)는 끌면 화면이 옮겨지고, 톡 누르면 자리를 정한다.
// 끌어서 칠하는 도구(바닥 칠하기 · 높이 · 파기·메우기 · 심기·치우기, 붓·길·네모)는 지금처럼 끌기 = 도구.

/** 이동 문턱(CSS px, 누른 동안 가장 멀리 간 거리). 터치 10px: Android 터치 슬롭 8dp·iOS 약 10pt 근처 —
 *  손가락이 떨리는 정도로는 끌기가 안 됨. 마우스 5px: Windows 끌기 문턱(SM_CXDRAG 4px)보다 한 칸 넉넉히. */
export const TAP_PX = { touch: 10, mouse: 5, pen: 10 };
/** 시간 문턱(ms): 500ms 넘게 누르고 있었으면 톡이 아님(Android 길게 누르기 기본 500ms) — 손을 얹고 망설이다 뗀 것을 자리 정하기로 보지 않음 */
export const TAP_MS = 500;

/** 누르기 하나 → "tap" | "drag". dist: 누른 곳에서 가장 멀리 간 거리(px) · ms: 누른 시간 · pointer: "touch"|"mouse"|"pen" · multi: 두 손가락이 닿았나 */
export function pressKind({ dist, ms, pointer = "mouse", multi = false }) {
  if (multi) return "drag";
  return dist <= (TAP_PX[pointer] ?? TAP_PX.touch) && ms <= TAP_MS ? "tap" : "drag";
}

/** 이 도구는 「톡 = 고르기, 끌기 = 화면 옮기기」인가. natKind: 자연·지형 도구의 kind(natureAction) */
export function tapTool(mode, natKind = null) {
  return mode === "build" || mode === "demolish" || (mode === "nature" && natKind === "move");
}
