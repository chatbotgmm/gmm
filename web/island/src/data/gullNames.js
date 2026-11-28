// 갈매미 이름 풀. ★ 여기만 고치면 됨: 아래 배열에 이름을 넣고 빼면 새로 오는 갈매미가 이 안에서 이름을 받음.
//  · 섬·바다·먹거리·소리말 위주로 짧게(1~3글자). 모습 이름(기본·미니·…)·직업 이름·이야기 인물(보름)은 넣지 않음(아래 BANNED가 걸러 줌).
//  · 풀을 다 쓰면 "보리 2"처럼 숫자를 붙임.
export const GULL_NAMES = [
  "보리", "몽돌", "파래", "꼬막", "누룽지", "콩떡", "소금", "미역", "갯돌", "단추",
  "호박", "모래", "감태", "솔이", "깨비", "도토", "방울", "조개", "두부", "찹쌀",
  "김밥", "깍두", "뽀득", "찰방", "물결", "밤톨", "우동", "고동", "톳", "대패",
  "송이", "별사탕", "몰랑", "꼬마", "해초", "갈치", "멍게", "바지락", "새우깡", "누리",
  "구름", "통통", "말랑", "깜순", "꿀떡", "만두", "호떡", "인절미", "곶감", "다시마",
  "부표", "등대", "노을", "파도", "바람", "자갈", "소라", "앵두", "참깨", "콩이",
];
// 이름으로 못 쓰는 말: 모습 9종 · 직업 · 이야기 인물 · "갈매미"
export const BANNED_NAMES = new Set(["기본", "미니", "자이언트", "꽃", "황금", "물방울", "불씨", "그림자", "목수",
  "건축가", "광부", "나무꾼", "낚시꾼", "상인", "농부", "보름", "갈매미", "갈매미맨"]);
/** 허용 글자(비평 17): 한글·영문·숫자·공백·가운뎃점·붙임표, 1~8자. 이름이 화면(innerHTML)에 그대로 들어가도 태그가 될 수 없게 허용 목록으로 막음 */
export const NAME_RE = /^[가-힣A-Za-z0-9 ·\-]{1,8}$/;
/** 이름 다듬기: 앞뒤 공백 자르고 연달은 공백은 하나로 */
export const tidyName = s => String(s ?? "").trim().replace(/\s+/g, " ");
/** 이름 검사 → { ok, name(다듬은 것), reason } (taken: 이미 쓰는 이름들 — 자기 이름은 빼고 넘김) */
export function validName(s, taken = []) {
  const name = tidyName(s);
  if (!name) return { ok: false, name, reason: "이름을 적어 주세요" };
  if ([...name].length > 8) return { ok: false, name, reason: "이름은 8글자까지예요" };
  if (!NAME_RE.test(name)) return { ok: false, name, reason: "한글·영문·숫자만 쓸 수 있어요" };
  if (BANNED_NAMES.has(name)) return { ok: false, name, reason: "모습·직업 이름은 쓸 수 없어요" };
  if ([...taken].includes(name)) return { ok: false, name, reason: "같은 이름의 갈매미가 있어요" };
  return { ok: true, name, reason: "" };
}
const mix = (a, b) => { let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
/** 섬 씨앗으로 섞은 이름 풀 차례(늘 같음, 월드 난수 안 씀) */
export function nameOrder(seed = 7, pool = GULL_NAMES) {
  return pool.filter(n => !BANNED_NAMES.has(n)).map((n, i) => [mix(seed | 0, i), n]).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1)).map(x => x[1]);
}
/** 새 갈매미 이름: 섞은 차례에서 마을에 없는 첫 이름, 다 쓰면 "보리 2"(마을에 없는 가장 작은 수) */
export function pickName(seed, taken = [], pool = GULL_NAMES) {
  const t = new Set(taken), order = nameOrder(seed, pool);
  for (const n of order) if (!t.has(n)) return n;
  for (let k = 2; ; k++) for (const n of order) { const s = `${n} ${k}`; if (!t.has(s)) return s; }
}
