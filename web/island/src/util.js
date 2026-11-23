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
