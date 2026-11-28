// 갈매미 성장·변신(순수 함수: 화면·월드 난수를 모름).
//  · 갈매미는 언제나 🥚 기본 모습으로 오고, 숨은 타고난 성향(disp) 하나를 갖고 옴(소환 차례마다 섬 씨앗으로 정함).
//  · 지내는 동안 한 일(자란 방식 growth)이 쌓이고, 며칠 뒤 딱 한 번 변신함(성향 + 자란 방식 → 모습). 성향이 같아도 키운 방식에 따라 다른 모습이 됨.
//  · 미니·자이언트는 드문 변신. 기본으로 남는 것도 정식 결과("든든한 기본 갈매미").
//  · 직업은 변신해도 그대로(마을 살림이 흔들리지 않게). 변신하면 희귀도가 오름(rarityAfter).
import { seededRandom } from "../util.js";
import { PERSONA, UNIT_JOBS, RARITY } from "../data/catalog.js";

export const BASE_FORM = "기본";
/** 모습 9종(도감 순서) */
export const FORMS = ["기본", "물방울", "그림자", "불씨", "목수", "꽃", "황금", "자이언트", "미니"];
/** 드문 모습(몸 크기가 다름) */
export const RARE_FORMS = new Set(["자이언트", "미니"]);
/** 모습 = 모델 열쇠. 예전 받침(form 없음)은 이름이 곧 모습이었음 */
export const formOf = u => u?.form ?? u?.name ?? BASE_FORM;

// ---- 성향(숨김) 8가지
export const DISPS = ["sea", "night", "craft", "green", "shiny", "big", "timid", "easy"];
export const DISP_INFO = {
  sea:   { name: "물가",   icon: "🌊" }, night: { name: "밤",   icon: "🌙" }, craft: { name: "손재주", icon: "🔨" }, green: { name: "풀꽃", icon: "🌼" },
  shiny: { name: "반짝",   icon: "✨" }, big:   { name: "먹보", icon: "🍙" }, timid: { name: "소심",   icon: "🫣" }, easy:  { name: "느긋", icon: "☀" },
};
/** 아직 기본 모습일 때 성향이 활동 비중에 더하는 것(personaOf) */
export const DISP_PERSONA = {
  sea: { swim: 1.5, fish: 1 }, night: {}, craft: { build: 1.5 }, green: { forage: 1.5 }, shiny: { wander: 1 },
  big: { chop: 1, mine: 1 }, timid: { zoomies: -1, visit: -1 }, easy: { rest: 1 },
};
/** 변신 전 선물 단서(비평 12): 좋아하는 갈래 · 꺼리는 갈래(둘째 단서). 느긋은 무엇을 줘도 "고마워" */
export const DISP_LIKES = { sea: ["sea"], night: ["ice"], craft: ["plant"], green: ["plant"], shiny: ["shiny"], big: ["fish"], timid: ["letter"], easy: [] };
export const DISP_DISLIKES = { sea: ["plant"], night: ["sea"], craft: ["sea"], green: ["ice"], shiny: ["plant"], big: ["letter"], timid: ["fish"], easy: [] };
/** 변신한 모습 → 그 모습의 성향(옛 저장 옮기기: 이미 변신한 셈) */
export const FORM_DISP = { "물방울": "sea", "그림자": "night", "불씨": "night", "목수": "craft", "꽃": "green", "황금": "shiny", "자이언트": "big", "미니": "timid", "기본": "easy" };

// ---- 자란 방식(카운터)
export const GROWTH_KEYS = ["sea", "night", "craft", "green", "shiny", "big", "timid", "warm", "alone", "social"];
export const GROWTH_LABEL = { sea: "물가를 자주 찾아요", night: "밤에 깨어 있어요", craft: "공사장을 맴돌아요", green: "꽃·밭 곁에 있어요", shiny: "반짝이는 걸 좋아해요",
  big: "잘 먹고 힘을 써요", timid: "자주 숨어요", warm: "따뜻한 곳을 찾아요", alone: "혼자 조용히 지내요", social: "친구들과 어울려요" };
/** 직업 → 그 직업 일이 올리는 카운터 */
export const JOB_GROWTH = { builder: "craft", carpenter: "craft", lumberjack: "big", miner: "big", fisher: "sea", farmer: "green", merchant: "shiny" };
export const JOB_GROWTH_MULT = 0.4, AUTO_CAP_DAY = 3, PLAYER_CAP_DAY = 6;

/** 카운터 올리기(상한 적용, 순수): src = "job"(제 직업 일, ×0.4) | "free"(한가할 때 스스로) | "player"(플레이어가 해 준 것).
 *  키마다 하루 상한: 갈매미 스스로(job+free) 3, 플레이어 몫 6. 변신이 끝났거나 성향이 없는(옛 받침) 갈매미는 안 셈. 실제로 더한 값 */
export function growthAdd(u, key, n, src = "free", day = 0) {
  if (!u || u.evo || !u.disp || !GROWTH_KEYS.includes(key) || !(n > 0)) return 0;
  const player = src === "player", amt = n * (src === "job" ? JOB_GROWTH_MULT : 1);
  let gd = u.growthDay; if (!gd || gd.day !== day) gd = u.growthDay = { day, auto: {}, player: {} };
  const bucket = player ? gd.player : gd.auto, cap = player ? PLAYER_CAP_DAY : AUTO_CAP_DAY, add = Math.max(0, Math.min(amt, cap - (bucket[key] || 0)));
  if (!(add > 0)) return 0;
  bucket[key] = (bucket[key] || 0) + add; (u.growth ||= {})[key] = (u.growth[key] || 0) + add; return add;
}
export const growthSum = g => GROWTH_KEYS.reduce((s, k) => s + Math.max(0, +g?.[k] || 0), 0);
/** 가장 많이 쌓인 카운터(카드 "요즘 모습" 한 줄). 없으면 null */
export function topGrowth(g) { let best = null, bv = 0; for (const k of GROWTH_KEYS) if ((+g?.[k] || 0) > bv) { bv = +g[k]; best = k; } return best; }

// ---- 모습 고르기
/** 모습별 가중치(카운터 비율에 곱함, 음수는 깎음) */
export const FORM_WEIGHTS = {
  "물방울": { sea: 1.0, social: 0.2 },
  "그림자": { night: 1.0, alone: 1.0, timid: 0.5, warm: -0.3, social: -0.2 },
  "불씨":   { night: 1.0, warm: 1.0, big: 0.3, alone: -0.4 },
  "목수":   { craft: 1.0 },
  "꽃":     { green: 1.0, social: 0.2 },
  "황금":   { shiny: 1.0, social: 0.3 },
  "자이언트": { big: 1.0 },
  "미니":   { timid: 1.0, green: 0.3 },
};
/** 성향이 기울어지는 모습(첫째 DISP_BONUS, 둘째 DISP_BONUS2) */
export const DISP_FORMS = { sea: [["물방울"], []], night: [["그림자", "불씨"], []], craft: [["목수"], []], green: [["꽃"], ["미니"]],
  shiny: [["황금"], []], big: [["자이언트"], ["불씨"]], timid: [["미니"], ["그림자"]], easy: [[], []] };
export const DISP_BONUS = 0.25, DISP_BONUS2 = 0.12, BASE_SCORE = 0.30, EASY_BASE = 0.2;
export const RARE_MIN_SHARE = 0.3, RARE_P = 0.5, RARE_P_OFF = 0.2, RARE_KEY = { "자이언트": "big", "미니": "timid" };
export const EVO_MIN_DAYS = 3, EVO_MAX_DAYS = 6, EVO_MIN_GROWTH = 12;

const evoHash = (...xs) => { let h = 0x811c9dc5; for (const x of xs) { const s = String(x); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } h ^= 0xff; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
export const strHash = s => evoHash(s);
/** 모습마다 점수(순수) */
export function evoScores(u) {
  const g = u.growth || {}, tot = growthSum(g), s = {}; for (const k of GROWTH_KEYS) s[k] = tot > 0 ? Math.max(0, +g[k] || 0) / tot : 0;
  const out = {};
  for (const [form, w] of Object.entries(FORM_WEIGHTS)) { let v = 0; for (const [k, m] of Object.entries(w)) v += m * s[k]; out[form] = v; }
  const [first, second] = DISP_FORMS[u.disp] || [[], []];
  for (const f of first) out[f] += DISP_BONUS; for (const f of second) out[f] += DISP_BONUS2;
  out[BASE_FORM] = BASE_SCORE + (u.disp === "easy" ? EASY_BASE : 0);
  return { scores: out, share: s, total: tot };
}
/** 무엇이 될지(순수, 같은 씨앗·갈매미·카운터면 늘 같음). seed = 섬 씨앗. 돌려줌 { form, stayed, scores } */
export function pickForm(u, seed = 7) {
  const { scores, share, total } = evoScores(u);
  if (total < EVO_MIN_GROWTH) return { form: BASE_FORM, stayed: true, scores, why: "few" };
  const r = seededRandom(evoHash(seed, u.unitId, 0xE70));
  const order = Object.keys(FORM_WEIGHTS).map(f => [f, scores[f], r()]).sort((a, b) => b[1] - a[1] || a[2] - b[2]);
  for (const [f, v] of order) {
    if (v < scores[BASE_FORM]) break;
    if (RARE_FORMS.has(f)) {
      const match = (DISP_FORMS[u.disp]?.[0] || []).includes(f);
      if (share[RARE_KEY[f]] < RARE_MIN_SHARE || r() >= (match ? RARE_P : RARE_P_OFF)) continue;   // 관문을 못 넘으면 다음 모습
    }
    return { form: f, stayed: false, scores };
  }
  return { form: BASE_FORM, stayed: true, scores, why: "even" };
}

// ---- 언제
/** 오늘 변신할 때가 됐나: 빠른 길(3일 + 아는 사이 + 카운터 12) · 늦은 길(6일이면 무조건) */
export function evoDue(u, day, bondStage = 0) {
  if (!u || u.evo || !u.disp) return false;
  const age = day - (u.bornDay ?? day);
  return age >= EVO_MAX_DAYS || (age >= EVO_MIN_DAYS && bondStage >= 1 && growthSum(u.growth) >= EVO_MIN_GROWTH);
}
/** 오늘 변신할 차례: 나이 많은 순(같으면 unitId 순). 하루 한 마리, 밀린 갈매미가 3마리를 넘으면 2마리(비평 14) */
export function evoQueue(units, day, stageOf = () => 0) {
  const due = units.filter(u => evoDue(u, day, stageOf(u)))
    .sort((a, b) => (a.bornDay ?? day) - (b.bornDay ?? day) || String(a.unitId).localeCompare(String(b.unitId), "en", { numeric: true }));
  return due.slice(0, due.length > 3 ? 2 : 1);
}
/** 내일 변신할 것 같은 갈매미(전날 예고): 내일 날짜로 보면 차례인 갈매미 */
export const evoSoon = (units, day, stageOf) => evoQueue(units, day + 1, stageOf).filter(u => !evoDue(u, day, stageOf(u)));

// ---- 보상
const RARITY_STEPS = ["common", "rare", "epic", "legend"];
/** 모습의 특기 직업 */
export const formJob = form => (UNIT_JOBS[form] || [])[1] || null;
/** 변신한 뒤 희귀도(비평 10): 변신 → 희귀, 드문 모습 → 영웅, 모습 특기가 지금 직업과 같으면("천직") 한 단계 더(최대 전설). 기본으로 남으면 null(그대로) */
export function rarityAfter(form, job, cur = "common") {
  if (form === BASE_FORM) return null;
  let i = RARE_FORMS.has(form) ? 2 : 1; if (formJob(form) === job) i++;
  i = Math.min(RARITY_STEPS.length - 1, Math.max(i, RARITY_STEPS.indexOf(cur)));
  return RARITY_STEPS[i];
}
export const isCalling = (form, job) => form !== BASE_FORM && formJob(form) === job;   // 천직

// ---- 성격(활동 비중·좋아하는 것)
/** 그 갈매미의 성격: 모습의 PERSONA + (아직 변신 안 한 기본이면) 성향 보정·성향 선물 단서 */
export function personaOf(u) {
  const f = formOf(u), base = PERSONA[f] || PERSONA[BASE_FORM];
  if (!u?.disp || u.evo || f !== BASE_FORM) return base;
  const p = { ...base };
  for (const [k, v] of Object.entries(DISP_PERSONA[u.disp] || {})) p[k] = Math.max(0, (p[k] || 0) + v);
  p.likes = DISP_LIKES[u.disp] || []; p.dislikes = DISP_DISLIKES[u.disp] || [];
  if (u.disp === "timid") p.timid = true;
  return p;
}
/** 아직 기본이고 밤 성향(반야행성) */
export const halfNight = u => !!u && u.disp === "night" && !u.evo && formOf(u) === BASE_FORM;

// ---- 성향 정하기(소환 차례마다, 월드 난수 안 씀)
/** 섬마다 덱: 처음 8마리는 성향이 모두 다름(밤은 앞 3칸 안). 그 뒤는 해시로 가중 뽑기(느긋 1.5) */
export function dispFor(seed = 7, n = 0) {
  const r = seededRandom(((seed | 0) * 31 + 7) >>> 0), deck = DISPS.slice();
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const ni = deck.indexOf("night"); if (ni > 2) [deck[2], deck[ni]] = [deck[ni], deck[2]];
  if (n < deck.length) return deck[n];
  const w = DISPS.map(d => d === "easy" ? 1.5 : 1), tot = w.reduce((a, b) => a + b, 0); let x = seededRandom(evoHash(seed, n, 0xD15))() * tot;
  for (let i = 0; i < DISPS.length; i++) { x -= w[i]; if (x < 0) return DISPS[i]; }
  return DISPS[DISPS.length - 1];
}

// ---- 단서(말풍선)
export const HINT_CHANCE = 0.08, HINT_GAP = 90;
export const HINT_LINES = {
  sea:   ["바다 냄새…", "철썩철썩 좋다", "파도 소리 들려?", "물에 들어가고 싶다"],
  night: ["하암…", "별이 예쁘다…", "밤이 좋아…", "낮엔 졸려…"],
  craft: ["기둥이 삐뚤어졌나?", "저거 내가 고칠까?", "뚝딱뚝딱 하고 싶다", "망치 소리 좋다"],
  green: ["꽃향기~", "킁킁, 풀 냄새", "새싹이다!", "밭이 예쁘다"],
  shiny: ["반짝이는 거다!", "저거 반짝여?", "동전 소리 좋아", "번쩍번쩍~"],
  big:   ["한 그릇 더!", "배고프다…", "힘이 넘친다!", "저 나무 내가 번쩍"],
  timid: ["히, 히익", "누, 누구야…", "조용한 데 갈래…", "깜짝이야"],
  easy:  ["오늘도 좋은 날~", "느긋하게~", "볕이 좋다…", "서두를 거 없지"],
};
/** 단서 한마디(난수 없이: unitId 문자열 해시 + 마을 시간으로 돌아감) */
export function hintLine(disp, unitId, t = 0) {
  const list = HINT_LINES[disp]; if (!list) return null;
  return list[(strHash(unitId) + Math.floor((t || 0) / 7)) % list.length];
}
/** 관찰 노트 글(카드): 단서 → 짧은 관찰 */
export const HINT_NOTE = { sea: "바다를 오래 봤어요", night: "낮에 하품했어요", craft: "공사장을 기웃거렸어요", green: "꽃 냄새를 맡았어요",
  shiny: "반짝이에 눈을 빛냈어요", big: "한 그릇 더 찾았어요", timid: "깜짝 놀라 숨었어요", easy: "볕에서 느긋했어요" };
/** 성향이 기본 갈매미의 톡 대사·몸짓 */
export const POKE_HINT = {
  sea: { act: "hop", line: "바다 소리 들려?" }, night: { act: "slow", line: "하암… 밤이 좋아" }, craft: { act: "hop", line: "이 기둥 내가 고칠까?" },
  green: { act: "hop", line: "킁킁, 꽃냄새" }, shiny: { act: "hop", line: "그거 반짝여?" }, big: { act: "hop", line: "배고프다…" },
  timid: { act: "flee", line: "히, 히익" }, easy: { act: "slow", line: "느긋하게~" },
};
export const rarityName = id => RARITY[id]?.name ?? "일반";
/** 관찰 노트(카드: 최근 단서 3개, 저장 안 함): 같은 글이 이어지면 ×N */
export function addNote(u, text) {
  if (!u || u.evo || !text) return; const notes = u.notes ||= [], same = notes.find(x => x.text === text);
  if (same) { same.n++; notes.splice(notes.indexOf(same), 1); notes.push(same); } else { notes.push({ text, n: 1 }); if (notes.length > 3) notes.shift(); }
}
