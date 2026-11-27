// 마을 소식지 + 다녀온 사이 편지(순수 계산: 화면·기기 시계를 모름).
// 소식: 월드가 알리는 일(emit) 가운데 기억할 만한 것을 { day, t, icon, text, weight }로 모음. 알림 줄(main.js)도 같은 문장을 씀.
// 편지: 게임을 꺼 둔 동안 지난 실제 시간(밀리초)을 밖에서 받아, 가볍게 셈한 일(익은 밭·낚은 물고기)을 글로 적음.
import { BUILDINGS, FURNITURE, RARITY, CLOTHES } from "../data/catalog.js";
import { SEASONS, WEATHER } from "./season.js";
import { wishText } from "./wishes.js";
import { FRIEND_STAGES } from "../units/mind.js";
import { josa } from "../util.js";
import { BOND_STAGES, GIFT_TIERS } from "./bond.js";
import { MEDALS } from "./medals.js";
import { askNotice } from "./roadAsk.js";
import { STEPS, STEP_NAME } from "./monetary.js";

const stepName = v => STEP_NAME[STEPS.indexOf(v)] ?? `${v}`;

export const NEWS_DAY_SECS = 600;       // 마을 하루 = 마을 시간(world.time) 600초
export const NEWS_KEEP_DAYS = 7;        // 소식지는 최근 7일치만
export const NEWS_MAX = 80;             // 모두 합쳐 80건까지(넘치면 덜 중요한 것·오래된 것부터 버림)
export const NEWS_HEADLINES = 4;        // 하루 머릿기사 수(중요한 순)

/** 마을 시간(초) → 몇째 날(1부터) */
export const newsDay = time => Math.floor(Math.max(0, time || 0) / NEWS_DAY_SECS) + 1;

const FISH_WEIGHT = { common: 0, rare: 3, epic: 5, legend: 7 };
const builtWeight = d => d.house ? 3 : d.deco || d.stairs || d.bridge || d.pier ? 1 : 4;   // 시설 > 집 > 길·장식
/** 일마다 소식 한 줄: (알림 내용, 월드) → { icon, text, weight }. weight 0은 알림 줄에만 쓰고 소식지에는 안 실음. */
const NEWS_MAKERS = {
  fish: ({ u, fish }) => ({ icon: "🎣", text: `${josa(u.name, "이", "가")} ${fish.season ? "제철 " : ""}${josa(fish.name, "을", "를")} 낚았어요!`, weight: (FISH_WEIGHT[fish.rarity] ?? 0) + (fish.season ? 2 : 0) }),
  // 수족관: 크기 기록(알림 줄에만) · 기증 · 기증 기념 선물
  // 메달(medals.js): 메달이 오르면 "🥇 금메달"을 붙이고, 금메달이 처음 되면 소식지에도 실음(은·동·같은 메달의 새 기록은 알림 줄에만)
  fishRecord: ({ u, fish, size, first, medal = 0, up = false }) => ({ icon: "📏", text: `${josa(u.name, "이", "가")} 낚은 ${fish.name} ${size}cm! ${up && medal >= 2 ? `${MEDALS[medal].icon} ${MEDALS[medal].name}` : first ? "첫 기록이에요" : `새 기록이에요${medal ? ` ${MEDALS[medal].icon}` : ""}`}`, weight: up && medal >= 3 ? 5 : 0 }),
  medalGift: ({ item, gift }) => ({ icon: "🎁", text: `물고기 ${gift.label} 기념으로 ${josa(item.name, "을", "를")} 받았어요!`, weight: 6 }),
  donate: ({ u, fish, kept }) => ({ icon: "🐠", text: `${u ? `${josa(u.name, "이", "가")} ${kept ? "아껴 둔" : "처음 낚은"} ` : "아껴 둔 "}${josa(fish.name, "을", "를")} 수족관에 기증했어요!`, weight: 5 }),
  donateGift: ({ item, gift }) => ({ icon: "🎁", text: `수족관 기증 ${gift.label} 기념으로 ${josa(item.name, "을", "를")} 받았어요!`, weight: 6 }),
  // 깜짝 소동(units/fuss.js)을 풀어 줌: 바위 위에서 못 내려오던 미니 · 길에서 꾸벅 졸던 야행성
  fussSolved: ({ u, kind }) => ({ icon: "🆘", text: kind === "perch" ? `바위 위에서 못 내려오던 ${josa(u.name, "을", "를")} 내려 줬어요!` : `길에서 꾸벅 졸던 ${josa(u.name, "을", "를")} 옮겨 줬어요!`, weight: 2 }),
  // 갈매미 소지품: 스스로 시장에 판 것(알림 줄에만)
  stashSale: ({ u, items, coins, cut }) => ({ icon: "🐚", text: `${josa(u.name, "이", "가")} 소지품 ${items.reduce((s, x) => s + x.n, 0)}개를 팔았어요 🪙+${coins - cut}`, weight: 0 }),
  // ✨ 반짝이를 주움(알림 줄에만)
  sparkle: ({ item }) => ({ icon: "✨", text: `${josa(item.name, "을", "를")} 주웠어요`, weight: 0 }),
  beachcomb: ({ u, item }) => ({ icon: "✨", text: `${josa(u.name, "이", "가")} 바닷가에서 ${josa(item.name, "을", "를")} 주웠어요`, weight: 2 }),
  wishDone: ({ wish, u, def }, w) => ({ icon: "♥", text: `${u.name}의 소원 "${wishText(def, w, u, wish)}"이 이루어졌어요!`, weight: 5 }),
  rank: ({ def }) => ({ icon: "🏅", text: `마을 등급이 올랐어요: ${def.icon} ${def.name}!`, weight: 8 }),
  friendship: ({ a, b, stage }) => { const d = FRIEND_STAGES[stage]; return { icon: d.icon, text: `${josa(a.name, "과", "와")} ${josa(b.name, "이", "가")} ${josa(d.name, "이", "가")} 됐어요!`, weight: stage >= 2 ? 5 : 3 }; },
  // 나와의 정: 선물(알림 줄에만) · 하트 단계에 처음 닿아 받은 답례
  gift: ({ u, item, tier }) => ({ icon: "🎁", text: `${u.name}에게 ${josa(item.name, "을", "를")} 선물했어요 · "${GIFT_TIERS[tier].say}"`, weight: 0 }),
  bondStage: ({ u, stage, gift }) => ({ icon: "💝", text: `${josa(u.name, "과", "와")} ${josa(BOND_STAGES[stage].name, "이", "가")} 됐어요!${gift ? ` 답례로 ${josa(gift.name, "을", "를")} ${gift.where ? `${u.name}네 ${gift.where}에 들여놨어요` : "받았어요"}` : ""}`, weight: stage >= 3 ? 6 : 4 }),
  season: s => SEASONS[s] ? { icon: SEASONS[s].icon, text: `${SEASONS[s].name}이에요`, weight: 6 } : null,
  // 날씨: 폭풍만 소식지에(첫눈은 아래 드문 하늘에서)
  weather: ({ kind }) => { const d = WEATHER[kind]; return d ? { icon: d.icon, text: `날씨: ${d.name}`, weight: kind === "storm" ? 2 : 0 } : null; },
  // 드문 하늘: 겨울마다 첫눈 · 무지개 · 유성우 · 유성우 밤에 주운 별조각
  firstSnow: ({ def }) => ({ icon: def.icon, text: def.text, weight: 5 }),
  sky: ({ kind, def }) => ({ icon: def.icon, text: def.text, weight: kind === "meteor" ? 6 : 5 }),
  starPiece: ({ u, item }) => ({ icon: "⭐", text: `${josa(u.name, "이", "가")} 별똥별이 떨어진 자리에서 ${josa(item.name, "을", "를")} 주웠어요!`, weight: 5 }),
  // 계절 축제의 날: 열림 · 끝남(기념 가구)
  festival: ({ def }) => ({ icon: def.icon, text: `${josa(def.name, "이", "가")} 열렸어요! 갈매미들이 광장으로 모여요`, weight: 8 }),
  festivalEnd: ({ def, item, n }) => ({ icon: "🎁", text: `${josa(def.name, "이", "가")} 끝났어요. ${n ? `갈매미 ${n}마리가 즐겼고, ` : ""}기념으로 ${item ? josa(item.name, "을", "를") : "추억을"} 받았어요!`, weight: 7 }),
  buildingDone: b => { const d = BUILDINGS[b.defId]; return d ? { icon: d.house ? "🏠" : "🔨", text: `${josa(d.name, "이", "가")} 다 지어졌어요`, weight: builtWeight(d) } : null; },
  // 은행 금고(bank.js): 바닥 사태 시작·끝은 사태마다 한 번 · 얼마 안 남음·세금·설계비·품삯은 알림 줄에만
  vaultShort: ({ kind }) => ({ icon: "🏦", text: kind === "loan" ? "은행 금고가 바닥나 가요 — 집 대출이 멈췄어요" : "은행 금고가 바닥났어요 — 품삯이 밀리고 집 대출이 멈췄어요", weight: 6 }),
  vaultOk: () => ({ icon: "🏦", text: "금고가 다시 찼어요. 밀린 품삯을 모두 치렀어요", weight: 4 }),
  vaultLow: ({ vault }) => ({ icon: "🏦", text: `금고에 조개가 얼마 안 남았어요 (🪙${vault})`, weight: 0 }),
  // 인구 = 집 수: 집이 모자라 소환이 막힘(알림 줄에만. reason = population.js의 글)
  summonBlocked: ({ reason }) => reason ? { icon: "🥚", text: reason, weight: 0 } : null,
  loanPaid: ({ u }) => ({ icon: "🏠", text: `${josa(u.name, "이", "가")} 집값을 다 갚았어요`, weight: 3 }),
  loanRefused: ({ u }) => ({ icon: "🏦", text: `${josa(u.name, "은", "는")} 금고가 비어 집 대출을 못 받았어요`, weight: 0 }),
  lodging: ({ total, n, free }) => total > 0 ? { icon: "🛏", text: `지난밤 빈 집 손님 숙박비 🪙${total}이 금고에 들어왔어요${n ? ` (${n}마리${free ? ` · 공짜 ${free}` : ""})` : ""}`, weight: 0 } : null,
  tax: ({ total, n }) => total ? { icon: "🏦", text: `세금 🪙${total}이 금고에 들어왔어요 (${n}마리)`, weight: 0 } : null,
  fee: ({ b, fee }) => BUILDINGS[b.defId] ? { icon: "🏦", text: `${BUILDINGS[b.defId].name} 설계비 🪙${fee}을 금고에서 냈어요`, weight: 0 } : null,
  wageOwed: ({ u, n }) => ({ icon: "💸", text: `${u.name}의 품삯 🪙${n}이 밀렸어요`, weight: 0 }),
  wagePaid: ({ u, n }) => ({ icon: "💸", text: `${josa(u.name, "이", "가")} 밀린 품삯 🪙${n}을 받았어요`, weight: 0 }),
  // 기온·체온(climate.js): 그날 처음 추워함 · 카페 코코아(알림 줄에만)
  chill: ({ u }) => ({ icon: "🥶", text: `${josa(u.name, "이", "가")} 추워해요`, weight: 0 }),
  cocoa: ({ u, price }) => ({ icon: "☕", text: `${josa(u.name, "이", "가")} 카페에서 코코아로 몸을 녹였어요 🪙${price}`, weight: 0 }),
  // 옷(clothes.js): 갈아입기(알림 줄에만) · 잡화점에서 삼 · 선물로 받아 바로 두름
  dress: ({ u, put, gift }) => put?.length ? { icon: CLOTHES[put[0]]?.icon || "🧣", text: `${josa(u.name, "이", "가")} ${gift ? "선물 받은 " : ""}${josa(CLOTHES[put[0]]?.name || "옷", "을", "를")} ${CLOTHES[put[0]]?.slot === "neck" ? "둘렀어요" : "입었어요"}`, weight: 0 } : null,
  buyClothes: ({ u, id, price }) => CLOTHES[id] ? { icon: CLOTHES[id].icon, text: `${josa(u.name, "이", "가")} 잡화점에서 ${josa(CLOTHES[id].name, "을", "를")} 샀어요 🪙${price}`, weight: 1 } : null,
  // 병·의원(health.js): 걸림(마을 첫 병은 더 크게) · 나음 · 접수(알림 줄에만) · 당번 의사
  sick: ({ u, from, first, why }) => ({ icon: "🤧", text: first ? `${josa(u.name, "이", "가")} 감기에 걸렸어요. 따뜻한 데서 푹 쉬면 나아요` : `${josa(u.name, "이", "가")} ${from ? `${from.name}에게서 ` : why === "wet" ? "젖은 채 떨다가 " : why === "overwork" ? "추운 날 너무 오래 일하다 " : ""}감기${from ? "가 옮았어요" : "에 걸렸어요"}`, weight: first ? 3 : 2 }),
  healed: ({ u, doctor }) => ({ icon: "😊", text: `${josa(u.name, "이", "가")} 감기가 다 나았어요${doctor ? ` (당번 ${doctor} 선생님 덕분)` : ""}`, weight: 1 }),
  clinicVisit: ({ u, fee, medicine }) => ({ icon: "🏥", text: `${josa(u.name, "이", "가")} 병원에 누웠어요 · 진료비 🪙${fee}${medicine >= 0 ? ` · 약 🪙${medicine}` : ""}`, weight: 0 }),
  // 쓰러짐(chrono.js FAINT_AT): 기력이 0 가까이 → 그 자리에서 쓰러짐 · 병원에 실려 감(알림 줄엔 쓰러짐 한 줄만)
  faint: ({ u }) => ({ icon: "😵", text: `${josa(u.name, "이", "가")} 너무 지쳐 쓰러졌어요`, weight: 2 }),
  faintCarried: ({ u, b, fee }) => ({ icon: "🚑", text: `${josa(u.name, "이", "가")} ${BUILDINGS[b?.defId]?.name || "병원"}에 실려 가 누웠어요 · 진료비 🪙${fee}`, weight: 1 }),
  doctor: ({ b, u, was }) => { const n = BUILDINGS[b?.defId]?.name || "병원"; return { icon: "🩺", text: u ? `${josa(u.name, "이", "가")} ${n} 당번 의사가 됐어요` : `${was} 선생님의 ${n} 당번이 끝났어요`, weight: u ? 2 : 0 }; },
  // 건물 업그레이드(World.startUpgrade): 시작 · 완료
  upgradeStart: ({ b, from, fee }) => { const d = BUILDINGS[b.defId], f = BUILDINGS[from]; return d && f ? { icon: "🏗", text: `${josa(f.name, "을", "를")} ${josa(d.name, "으로", "로")} 넓히는 공사를 시작했어요${fee ? ` · 설계비 🪙${fee}` : ""}`, weight: 3 } : null; },
  upgraded: ({ b, from }) => { const d = BUILDINGS[b.defId], f = BUILDINGS[from]; return d && f ? { icon: "🏥", text: `${josa(f.name, "이", "가")} ${josa(d.name, "이", "가")} 됐어요!${d.beds ? ` 침대 ${d.beds}개` : ""}`, weight: 6 } : null; },
  // 길 부탁(roadAsk.js): 집이 시장·은행과 포장도로로 안 이어진 갈매미가 말풍선으로 부탁(알림 줄에만 · 같은 갈매미 하루 한 번은 ALERTS가 거름)
  roadAsk: ({ u, label }) => ({ icon: "🛣", text: askNotice(u.name, label), weight: 0 }),
  // 중앙은행(monetary.js): 손잡이(찍어내기·매입 예산·금리·축하) · 물가 사태(사태마다 한 번) · 예산 참·자동(알림 줄에만)
  monIssue: ({ from, to }) => ({ icon: "🖨", text: `은행이 하루 가공품 매입 예산을 '${stepName(from)}' → '${stepName(to)}'${to > from ? "으로 늘렸어요" : to < from ? "으로 줄였어요" : "으로 정했어요"}`, weight: 3 }),
  monRate: ({ from, to }) => ({ icon: "🏦", text: `금리를 ${from}% → ${to}%로 ${to > from ? "올렸어요. 갈매미들이 저금을 늘려요" : "내렸어요. 갈매미들이 저금을 덜 해요"}`, weight: 4 }),
  monGift: ({ per }) => ({ icon: "🎁", text: `은행이 금고에서 모두에게 🪙${per}씩 축하금을 나눠 줬어요`, weight: 3 }),
  inflation: ({ pi, P }) => ({ icon: "📈", text: `값이 하루에 ${Math.round(pi * 1000) / 10}% 올랐어요 — 물가 ${Math.round(P * 100)}`, weight: 6 }),
  deflation: () => ({ icon: "🧊", text: "값이 계속 내려가요 — 재료를 못 파는 갈매미가 있을 수 있어요", weight: 5 }),
  priceStable: () => ({ icon: "📊", text: "사흘째 물가 안정! 마을 점수 +10", weight: 5 }),
  capFull: () => ({ icon: "🏦", text: "오늘 가공품 매입 예산(또는 금고 여윳돈)이 다 됐어요 — 상인은 내일 팔아요", weight: 0 }),
  monAuto: ({ from, to, up }) => ({ icon: "🤖", text: `자동: 매입 예산 ${stepName(from)} → ${stepName(to)}(${up ? "값이 내려서" : "값이 올라서"})`, weight: 0 }),
  monPrint: ({ n, left }) => ({ icon: "🖨", text: `은행이 새 돈 🪙${n}을 찍어 금고에 넣었어요 — 마을에 돈이 늘면 값이 올라요(오늘 더 찍을 수 있는 돈 🪙${left})`, weight: 3 }),
  monStart: () => ({ icon: "🏛", text: "은행에 중앙은행 판이 생겼어요 — 처음엔 자동이 맡아요", weight: 5 }),
  furnitureBought: ({ u, id }) => FURNITURE[id] ? { icon: "🛋", text: `${josa(u.name, "이", "가")} 잡화점에서 ${josa(FURNITURE[id].name, "을", "를")} 사 왔어요`, weight: 2 } : null,
};
/** 소식 문장이 있는 이벤트 이름들(알림 줄 연결 시험이 main.js·ui/newsAlerts.js와 대조) */
export const NEWS_EVENTS = Object.keys(NEWS_MAKERS);
/** 이 일의 소식 한 줄(없으면 null) */
export const newsFor = (ev, arg, world) => NEWS_MAKERS[ev]?.(arg, world) ?? null;

/** 소식 하나를 넣고 정리: 같은 날 같은 글은 한 번만, 오래된 날은 버리고, 너무 많으면 덜 중요한 것(같으면 오래된 것)부터 버림. 넣었으면 true. */
export function addNews(log, time, n) {
  const day = newsDay(time);
  if (!n || !(n.weight > 0) || log.some(e => e.day === day && e.text === n.text)) return false;
  log.push({ day, t: Math.round(time), icon: n.icon, text: n.text, weight: n.weight });
  for (let i = log.length - 1; i >= 0; i--) if (log[i].day <= day - NEWS_KEEP_DAYS) log.splice(i, 1);
  while (log.length > NEWS_MAX) { let k = 0; for (let i = 1; i < log.length; i++) if (log[i].weight < log[k].weight) k = i; log.splice(k, 1); }
  return true;
}
/** 저장에서 읽은 소식(예전 저장엔 없음 → 빈 소식지). 모양이 맞는 것만. */
export const newsFromSave = list => (Array.isArray(list) ? list : []).filter(e => e && e.day > 0 && typeof e.text === "string")
  .map(e => ({ day: e.day, t: e.t || 0, icon: e.icon || "📰", text: e.text, weight: e.weight || 1 })).slice(-NEWS_MAX);
/** 날짜별 소식지(새 날부터): [{ day, heads: 중요한 순 top건, more: 그 밖의 소식 수 }] */
export function newsPages(log, top = NEWS_HEADLINES) {
  const days = [...new Set(log.map(e => e.day))].sort((a, b) => b - a);
  return days.map(day => { const list = log.filter(e => e.day === day).sort((a, b) => b.weight - a.weight || b.t - a.t); return { day, heads: list.slice(0, top), more: Math.max(0, list.length - top) }; });
}

// ---- 다녀온 사이
export const AWAY_MIN_MS = 10 * 60000;          // 10분은 지나야 편지가 옴
export const AWAY_CAP_HOURS = 8;                // 쳐 주는 시간은 8시간까지
export const AWAY_ABSURD_MS = 366 * 86400000;   // 1년 넘게 벌어진 시계는 믿지 않음(기기 시계가 바뀐 것으로 봄)
export const AWAY_FISH_CAP = 6;                 // 그동안 낚시는 많아야 6번 던짐
/** 꺼 둔 실제 시간(밀리초) → 쳐 줄 시간(시간 단위, 0이면 아무 일 없음). 10분 안쪽·거꾸로 간 시계·말이 안 되는 값은 0. */
export function awayHours(ms) {
  if (!Number.isFinite(ms) || ms < AWAY_MIN_MS || ms > AWAY_ABSURD_MS) return 0;
  return Math.min(AWAY_CAP_HOURS, ms / 3600000);
}
/** 그동안 낚싯대를 던진 횟수: 1번 + 한 시간에 1번, 많아야 AWAY_FISH_CAP번 */
export const awayCasts = hours => hours > 0 ? Math.min(AWAY_FISH_CAP, 1 + Math.floor(hours)) : 0;
/** "3시간 20분" 같은 글 */
export function awaySpan(ms) {
  const m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60;
  return d ? `${d}일${h ? ` ${h}시간` : ""}` : h ? `${h}시간${mm ? ` ${mm}분` : ""}` : `${mm}분`;
}
/** 편지: report = world.applyAway의 결과. 우체국이 있으면(post) 집배원이 자세히 적어 줌(낚은 물고기 하나하나·지난 소식·기다리는 소원).
 *  돌려주는 값: { title, lines: [글 줄], sign } */
export function awayLetter(report, { post = false, news = [], wishes = [] } = {}) {
  const { ms, hours, ripened, catches } = report, lines = [`${awaySpan(ms)} 만이에요. 마을은 잘 있었어요!`];
  if (ms / 3600000 > hours) lines.push(`(오래 비운 날은 ${AWAY_CAP_HOURS}시간까지만 셈해요)`);
  if (ripened) lines.push(`🌾 밭 ${ripened}칸이 다 익어서 거두기만 기다려요.`);
  if (catches.length) lines.push(`🎣 갈매미들이 물고기 ${catches.length}마리를 낚아 뒀어요.`);
  if (!ripened && !catches.length) lines.push("별일 없이 조용한 시간이었어요.");
  if (post) {
    for (const c of catches) lines.push(`· ${c.who}: ${c.fish.name}${c.fish.rarity !== "common" ? ` (${RARITY[c.fish.rarity]?.name ?? ""}!)` : ""}${c.item ? ` + ${c.item.name}` : ""}${c.donated ? " · 🐠 수족관에 기증" : ""}`);
    if (news.length) { lines.push("📰 떠나기 전 마을 소식"); for (const n of news) lines.push(`· ${n.icon} ${n.text}`); }
    for (const x of wishes) lines.push(`💭 ${x.who}: "${x.text}" 소원이 기다리고 있어요.`);
    lines.push("📮 우체국이 있어서 꼼꼼히 적어 보냈어요.");
  } else lines.push("📮 우체국이 생기면 더 자세한 편지를 보내 드릴게요.");
  return { title: "💌 다녀온 사이에", lines, sign: post ? "— 갈매미 우체국 드림" : "— 마을 갈매미들 드림" };
}
