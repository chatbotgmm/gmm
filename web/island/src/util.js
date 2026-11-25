// 씨앗으로 늘 같은 순서를 내는 난수(mulberry32). 섬 모양을 다시 만들 수 있게 한다.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 받침에 따라 조사를 고른다: josa("작은 집", "을", "를") → "작은 집을", josa("카페", "을", "를") → "카페를". */
export function josa(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (hasFinal ? withFinal : withoutFinal);
}

// 화면 위 표시(말풍선·건물 배지·구역 이름): 매 프레임 left/top·글자를 다시 쓰면 브라우저가 그때마다 배치(레이아웃)를 다시 계산함.
// 값이 바뀔 때만 쓰고, 자리는 배치를 다시 하지 않는 translate로 옮긴다(translate를 모르는 옛 브라우저는 left/top).
const HAS_TRANSLATE = typeof document !== "undefined" && "translate" in document.documentElement.style;
/** el을 화면 (x, y) px로(0.5 px 단위, 바뀔 때만) */
export function placeEl(el, x, y) {
  x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2; if (el._px === x && el._py === y) return;
  if (el._px === undefined && HAS_TRANSLATE) { el.style.left = "0"; el.style.top = "0"; }
  el._px = x; el._py = y;
  if (HAS_TRANSLATE) el.style.translate = `${x}px ${y}px`; else { el.style.left = `${x}px`; el.style.top = `${y}px`; }
}
/** 보이기·숨기기(바뀔 때만) */
export function showEl(el, on) { if (el.hidden === on) el.hidden = !on; }
/** 글자(바뀔 때만) */
export function textEl(el, t) { if (el._txt !== t) { el._txt = t; el.textContent = t; } }
