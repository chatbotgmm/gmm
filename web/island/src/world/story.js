// 🗝 메인 스토리 「갈매미섬의 비밀」 계산(순수: 화면·기기 시계·난수를 모름 → tests/story.test.js).
// 기록(world.story)을 받아 고치고, 월드가 해야 할 일(행동 목록)을 돌려줌. 월드(World.js)가 행동을 받아 반짝이를 놓고 알림을 냄.
//  · 정해진 셈으로만 정함(STORY_EVERY번째 줍기 · 마을 날 · 하트 단계 · 하늘 일). world.rnd·sparkRnd·skyRnd를 쓰지 않음 → 낚시·날씨·하늘·반짝이 순서가 그대로
//  · 단서: 플레이어가 줍는 반짝이(이야기 반짝이는 보통 반짝이와 따로, 줍기 전까지 안 사라짐) · 갈매미가 털어놓는 말(하트 단계·쓰다듬기)
//    · 하늘(무지개·유성우·첫눈) · 다녀온 사이 편지·소식지 · 수족관(고래상어 기증) · 작은 섬(조개섬). 갈매미 소지품(낚은 것·주운 것·별조각)은 단서가 아님
//  · 장 n이 열려 있으면 그 장과 앞 장의 조각을 얻을 수 있음(덤은 엔딩 뒤에도). 장마다 아무 조각 3개 + 고칠 곳 → 다음 장
// 행동: { grant: 조각 id, who } · { spark: 열쇠, at } (이야기 반짝이 놓기, 열쇠 = 조각 id 또는 "seed:A"·"seed:B") · { blink: true|false } (깜빡이는 대답: true = 밤 연출)
//       { move: 열쇠, at } (이야기 반짝이 옮기기) · { line: 글 } (다녀온 사이 편지에 붙는 줄)
import { STORY_CHAPTERS, STORY_PIECES, STORY_PIECE_IDS, STORY_NEED, STORY_SEEDS, STORY_HINT_DAYS, STORY_CARD_DAYS, STORY_POLE_DAYS, STORY_EVERY, STORY_LAMP_R, STORY_WHALE, STORY_WHALE_GULL, STORY_POSTCARDS, STORY_BONUS } from "../data/story.js";
import { bondStage } from "./bond.js";
import { formOf } from "./evolve.js";

export const STORY_VERSION = 1;
/** 밤에 등불을 고친 뒤 첫 깜빡임까지 기다리는 마을 초(고침·켜진 등대 카드가 지나간 뒤) */
export const STORY_BLINK_WAIT = 45;
const ST_RESTORE_IDS = ["door", "cave", "lamp", "mailbox"];
const ST_EVERY_ORDER = STORY_PIECE_IDS.filter(id => STORY_PIECES[id].how === "every");   // 장 차례(c1_note → c2_name → c3_bottle)

/** 새 기록(이야기 0장 = 아직 시작 안 함: 둘째 마을 날 첫 반짝이 차례에 등대 발치에 문패 반짝이) */
export function newStory() {
  return { v: STORY_VERSION, chapter: 0, found: {}, read: {}, restored: {}, chDay: {}, lastGain: 0, pickN: 0, seeds: 0, seedDay: 0,
    sparks: [], queue: [], cardDay: 0, litDay: 0, poleDay: 0, ended: 0, postcards: {}, duskKey: null, blinks: 0 };
}
const stInt = v => Math.max(0, Math.floor(+v || 0));
/** 저장에서 읽은 기록(예전 저장엔 없음 → 0장부터 깨끗하게). 아는 조각·모양이 맞는 것만 */
export function storyFromSave(j) {
  const s = newStory(); if (!j || typeof j !== "object") return s;
  s.chapter = Math.min(STORY_CHAPTERS.length, stInt(j.chapter));
  for (const id of STORY_PIECE_IDS) { const f = j.found?.[id]; if (f && typeof f === "object") s.found[id] = { day: Math.max(1, stInt(f.day)), who: typeof f.who === "string" ? f.who : null }; }
  for (const id of STORY_PIECE_IDS) if (j.read?.[id] && s.found[id]) s.read[id] = true;
  for (const id of ST_RESTORE_IDS) if (stInt(j.restored?.[id]) > 0) s.restored[id] = stInt(j.restored[id]);
  for (const c of STORY_CHAPTERS) if (stInt(j.chDay?.[c.n]) > 0) s.chDay[c.n] = stInt(j.chDay[c.n]);
  for (const k of ["lastGain", "seedDay", "cardDay", "litDay", "poleDay", "ended", "blinks"]) s[k] = stInt(j[k]);
  s.pickN = Math.min(STORY_EVERY - 1, stInt(j.pickN)); s.seeds = Math.min(STORY_SEEDS, stInt(j.seeds));
  s.sparks = (Array.isArray(j.sparks) ? j.sparks : []).filter(p => p && stSparkKeyOk(p.p) && Number.isInteger(p.x) && Number.isInteger(p.z))
    .map(p => ({ p: p.p, x: p.x, z: p.z, day: stInt(p.day), at: typeof p.at === "string" ? p.at : null })).slice(0, 8);
  s.queue = (Array.isArray(j.queue) ? j.queue : []).filter(id => STORY_PIECES[id]?.how === "spark" && !s.found[id]);
  if (j.postcards && typeof j.postcards === "object") for (const [k, v] of Object.entries(j.postcards)) if (/^\d+-(spring|summer|autumn|winter)$/.test(k)) s.postcards[k] = Math.max(1, stInt(v));
  s.duskKey = typeof j.duskKey === "string" ? j.duskKey : null;
  return s;
}
const stSparkKeyOk = k => k === "seed:A" || k === "seed:B" || STORY_PIECES[k]?.how === "spark" || STORY_PIECES[k]?.how === "sky";
/** 저장할 모양(그대로 JSON) */
export const storyToSave = s => JSON.parse(JSON.stringify(s));

// ---- 읽기
export const storyStarted = s => !!s && s.chapter >= 1;
/** 장 n이 열렸나 */
export const chapterOpen = (s, n) => s.chapter >= n;
/** 이 조각을 지금 얻을 수 있나(아직 없고 그 장이 열림) */
export const canFind = (s, id) => !!STORY_PIECES[id] && !s.found[id] && chapterOpen(s, STORY_PIECES[id].ch);
/** 장 n에서 모은 조각 수(덤 포함) */
export const chapterCount = (s, n) => STORY_CHAPTERS[n - 1].pieces.filter(p => s.found[p.id]).length;
export const foundCount = s => Object.keys(s.found).length;
export const restoredOf = n => STORY_CHAPTERS[n - 1].restore;
/** 등대 등불이 켜졌나(3장 고칠 곳). 화면(daylight.js)이 밤 불빛을 켤지 봄 */
export const storyLampLit = s => !!s?.restored?.lamp;
/** 등대를 눌렀을 때 한 줄: 왜 꺼져 있고 무엇을 하면 켜지는지(3장 「등대 등불」 전) · 켜진 뒤엔 그 모습. app = 누르면 열 앱(비밀 수첩이 생긴 뒤에만 "story").
 *  w = 월드(3장 체크리스트에 창고·가방을 봄), day = 마을 날(news.js newsDay) */
export function lighthouseNote(s, w, day) {
  if (!s) return { text: "🗼 밤마다 등대 빛줄기가 바다를 비춰요", app: null, lit: true };
  if (storyLampLit(s)) return { text: "🗼 등대에 불이 켜져 있어요. 밤마다 빛줄기가 돌며 바다를 비춰요", app: storyStarted(s) ? "story" : null, lit: true };
  const asleep = "🗼 등대는 불이 꺼진 채 잠들어 있어요";
  if (!storyStarted(s)) return { text: `${asleep}. ${stSparkOf(s, "c1_sign") ? "발치의 ✨ 반짝이를 주워 보세요" : day >= 2 ? "곧 발치에 ✨ 반짝이가 생겨요" : "내일쯤 발치에 ✨ 반짝이가 생겨요"}. 🗝 이야기를 따라가면 다시 켤 수 있어요`, app: null, lit: false };
  const r = restoredOf(3);
  if (!chapterOpen(s, 3)) return { text: `${asleep}. 🗝 비밀 수첩 3장 「${r.title}」을 고치면 다시 켜져요. 지금은 ${s.chapter}장이에요`, app: "story", lit: false };
  const chk = restoreCheck(s, w || {}, 3);
  if (chk.ok) return { text: `🗼 등불을 고칠 준비가 됐어요. 🗝 비밀 수첩 3장에서 🔧 고치기를 누르면 다시 켜져요`, app: "story", lit: false };
  const need = chk.rows.filter(x => !x.ok).map(x => `${x.icon} ${x.k ? x.text.split(":")[0] : x.text} ${x.have}/${x.need}`).join(", ");
  return { text: `${asleep}. 🗝 3장 「${r.title}」을 고치면 켜져요. 남은 것: ${need}`, app: "story", lit: false };
}
/** 새로 얻었지만 수첩에서 아직 안 본 조각 수(📱 배지) */
export const unreadCount = s => Object.keys(s.found).filter(id => !s.read[id]).length;
/** 덤 조각을 다 모았나(수첩 그림) */
export const allBonus = s => STORY_BONUS.every(id => s.found[id]);
/** 이 조각의 힌트: 장이 열리고(또는 마지막 조각 뒤) 마을 STORY_HINT_DAYS일 동안 조각이 안 늘면 구체적인 힌트(두 번째) */
export function pieceHint(s, id, day) {
  const p = STORY_PIECES[id]; if (!p) return "";
  const since = Math.max(s.chDay[p.ch] || 0, s.lastGain || 0);
  return p.hint[chapterOpen(s, p.ch) && since > 0 && day - since >= STORY_HINT_DAYS ? 1 : 0];
}
/** 조각 글({who} → 들려준 갈매미 이름) */
export const pieceText = (id, who) => (STORY_PIECES[id]?.text || "").replace(/\{who\}/g, who || "어느 갈매미");

/** 동굴 입구 둘레(Chebyshev STORY_LAMP_R칸 안)의 다 지은 가로등 수 */
export function lampsNearCave(w) {
  const f = w.landmarkFront?.("cave"); if (!f) return 0; let n = 0;
  for (const b of w.buildings.values()) if (b.defId === "streetlamp" && w.isDone(b) && b.cells.some(([x, z]) => Math.max(Math.abs(x - f.x), Math.abs(z - f.z)) <= STORY_LAMP_R)) n++;
  return n;
}
/** 갈매미 가방에 든 원자재 k(나무·돌·철) 합 */
export const storyBagHave = (w, k) => (w.units || []).reduce((n, u) => n + Math.max(0, Math.floor(u.inv?.[k] || 0)), 0);
/** 원자재 k 하나의 시장 값(상인이 사 주는 값과 같게) */
export const storyRawPrice = (w, k) => Math.max(1, Math.round(w.prices?.[k] ?? w.rawBase?.(k) ?? ({ wood: 2, stone: 3, iron: 6 })[k] ?? 1));
/** 장 n 고칠 곳의 체크리스트: { rows: [{ icon, text, have, need, ok }], ok(다 찼나), done(고쳤나), kind: "pay" | "build", at, locked(엔딩 전 우체통) } */
export function restoreCheck(s, w, n) {
  const r = restoredOf(n), rows = [], have = chapterCount(s, n), done = !!s.restored[r.id];
  if (r.afterEnd) { if (!s.ended) return { rows, ok: false, done, kind: "pay", at: r.at, locked: true }; }
  else rows.push({ icon: "🧩", text: "조각", have: Math.min(have, STORY_NEED), need: STORY_NEED, ok: have >= STORY_NEED });
  const RES = { wood: ["🪵", "나무"], stone: ["🪨", "돌"], iron: ["⛓", "철"] };
  if (r.seeds) rows.push({ icon: "🌟", text: "별씨", have: Math.min(s.seeds, r.seeds), need: r.seeds, ok: s.seeds >= r.seeds });
  for (const [k, need] of Object.entries(r.cost || {})) {                       // 창고가 모자라면 갈매미 가방(광부가 캔 철 등)에서 시장 값으로 사 옴(금고에서): 창고에 철이 안 들어오는 마을도 막히지 않게
    const h = Math.floor(w.res?.[k] || 0), buy = Math.min(Math.max(0, need - h), storyBagHave(w, k)), price = buy * storyRawPrice(w, k), afford = !buy || !w.economy || Math.floor(w.bank?.vault ?? Infinity) >= price;
    rows.push({ icon: RES[k][0], text: buy ? `${RES[k][1]}: 창고 ${h}, 갈매미에게서 ${buy}개 사기 🪙${price}${afford ? "" : ", 금고가 모자라요"}` : `${RES[k][1]}: 마을 창고`, have: Math.min(h + buy, need), need, ok: h + buy >= need && afford, k, buy, price });
  }
  if (r.lamps) { const h = lampsNearCave(w); rows.push({ icon: "💡", text: `동굴 입구 ${STORY_LAMP_R}칸 안 가로등`, have: Math.min(h, r.lamps), need: r.lamps, ok: h >= r.lamps }); }
  return { rows, ok: !done && rows.every(x => x.ok), done, kind: r.lamps ? "build" : "pay", at: r.at, locked: false };
}

// ---- 계기(월드가 알린 일) → 행동
/** 하트 단계 조각(c1_tale ♥♥ · c2_secret1 ♥♥♥) · 물방울 ♥♥♥(큰점박이 둘째 길)을 그 갈매미로 */
function stBondActs(s, u, stage, out) {
  if (stage >= 2 && canFind(s, "c1_tale")) out.push({ grant: "c1_tale", who: u.name });
  if (stage >= 3 && canFind(s, "c2_secret1")) out.push({ grant: "c2_secret1", who: u.name });
  if (stage >= 3 && formOf(u) === STORY_WHALE_GULL && canFind(s, "c3_whale")) out.push({ grant: "c3_whale", who: u.name });
}
/** 이미 지난 일로 채울 조각(장이 열릴 때·불러온 뒤): 이미 하트 단계에 닿은 갈매미가 털어놓음 · 이미 기증한 고래상어 */
export function retroActs(s, w) {
  const out = [], byBond = [...(w.units || [])].sort((a, b) => (b.bond || 0) - (a.bond || 0));
  for (const u of byBond) stBondActs(s, u, bondStage(u.bond), out);
  if (canFind(s, "c3_whale") && w.donated?.[STORY_WHALE] && !out.some(a => a.grant === "c3_whale")) out.push({ grant: "c3_whale", who: null });
  return stDedupe(out);
}
const stDedupe = acts => acts.filter((a, i) => !a.grant || acts.findIndex(b => b.grant === a.grant) === i);
const stSparkOf = (s, key) => s.sparks.find(p => p.p === key);
const stSeedsComing = s => s.seeds + s.sparks.filter(p => p.p.startsWith("seed:")).length;
const stSeedsWanted = s => chapterOpen(s, 3) && !s.restored.lamp && stSeedsComing(s) < STORY_SEEDS;

/** 월드가 알린 일 하나 → 행동 목록. day = 마을 날(news.js newsDay). 기록(s)의 셈(줍기 수 등)은 여기서 고침 */
export function storyOnEvent(s, ev, arg, w, day) {
  const out = [];
  if (ev === "sparkle") {                                                          // 보통 반짝이를 직접 주움(이야기 반짝이는 월드가 따로)
    if (!storyStarted(s)) return out;
    if (canFind(s, "c1_card") && s.cardDay && day >= s.cardDay + STORY_CARD_DAYS) out.push({ grant: "c1_card", who: null, via: "pickup" });
    const target = ST_EVERY_ORDER.find(id => canFind(s, id));
    if (target && ++s.pickN >= STORY_EVERY) { s.pickN = 0; out.push({ grant: target, who: null }); }
  } else if (ev === "bondStage") { if (arg?.u) stBondActs(s, arg.u, arg.stage, out); }
  else if (ev === "pet") {                                                         // 둘째 비밀: 3장이 열린 다음 마을 날부터, ♥♥♥ 갈매미를 처음 쓰다듬을 때
    const u = arg?.u; if (u && canFind(s, "c3_secret2") && day > (s.chDay[3] || Infinity) && bondStage(u.bond) >= 3) out.push({ grant: "c3_secret2", who: u.name });
  } else if (ev === "donate") { if (arg?.fish?.id === STORY_WHALE && canFind(s, "c3_whale")) out.push({ grant: "c3_whale", who: null }); }
  else if (ev === "festivalEnd") { if (canFind(s, "c2_festival")) out.push({ grant: "c2_festival", who: arg?.who?.[0] || w.units?.[0]?.name || null }); }
  else if (ev === "firstSnow") { if (canFind(s, "c3_snow")) out.push({ grant: "c3_snow", who: null }); }
  else if (ev === "sky") {
    if (arg?.kind === "rainbow" && canFind(s, "c2_rainbow") && !stSparkOf(s, "c2_rainbow")) out.push({ spark: "c2_rainbow", at: "ring" });
    if (arg?.kind === "meteor" && stSeedsWanted(s) && !stSparkOf(s, "seed:A")) out.push({ spark: "seed:A", at: "ring" });   // 별씨 첫째 길: 유성우 밤 등대 둘레
  } else if (ev === "wave") {                                                      // 이야기 차례(STORY_WAVE_SECS 200초마다 — 보통 반짝이 회차 300초와 따로, 예전 빠르기 그대로)
    if (s.chapter === 0 && day >= 2 && !stSparkOf(s, "c1_sign")) out.push({ spark: "c1_sign", at: "lighthouse" });
    for (const id of s.queue.splice(0)) if (!s.found[id] && !stSparkOf(s, id)) out.push({ spark: id, at: STORY_PIECES[id].at });
    if (stSeedsWanted(s) && s.seedDay !== day) { s.seedDay = day; out.push({ spark: "seed:B", at: "ring" }); }   // 둘째 길: 마을 날마다 첫 이야기 차례(아침, 하루 첫 반짝이와 대개 같은 때)에 별씨 하나
  } else if (ev === "away") {                                                      // 다녀온 사이 편지(10분 넘게 꺼 둠)
    if (canFind(s, "c1_card")) out.push({ grant: "c1_card", who: null, via: "away" }, { line: "📮 우체통에 낡은 엽서가 끼어 있었어요. 🗝 비밀 수첩에 끼워 뒀어요." });
    if (canFind(s, "c4_blink") && s.restored.lamp) out.push({ blink: false }, { grant: "c4_blink", who: null }, { line: "💫 어젯밤 수평선에서 불빛이 세 번 깜빡였대요. 🗝 비밀 수첩에 적어 뒀어요." });
    out.push(...retroActs(s, w));
  } else if (ev === "tick") {                                                      // 1초마다(월드 stepStory)
    const settled = !(w.storyLitAt >= 0) || w.time - w.storyLitAt >= STORY_BLINK_WAIT;   // 밤에 불을 켰으면 불이 차오르고 카드를 다 읽은 뒤에(바로 겹쳐 뜨지 않게)
    if (canFind(s, "c4_blink") && s.restored.lamp && (w.isNight === true && settled || day > s.litDay)) out.push({ blink: w.isNight === true }, { grant: "c4_blink", who: null });
    const pole = stSparkOf(s, "c4_pole");
    if (pole && pole.at !== "beach" && s.poleDay && day >= s.poleDay + STORY_POLE_DAYS) out.push({ move: "c4_pole", at: "beach" });   // 선착장·배가 없어도: 사흘 뒤 본섬 바닷가로
  }
  return stDedupe(out);
}

/** 조각을 얻은 뒤 기록에 적음. 돌려주는 값: 이어서 할 행동(엔딩 유리병 차례 등) */
export function notePiece(s, id, who, day) {
  if (s.found[id]) return [];
  s.found[id] = { day: Math.max(1, day | 0), who: who || null }; s.lastGain = day;
  const out = [];
  if (["c4_lit", "c4_pole", "c4_blink"].every(k => s.found[k]) && !s.found.c4_reply && !s.queue.includes("c4_reply") && !stSparkOf(s, "c4_reply")) s.queue.push("c4_reply");
  return out;
}
/** 장 n을 엶: 그 장의 이야기 반짝이를 다음 차례에 놓게 하고, 이미 지난 일(하트 단계·기증)로 채울 조각을 돌려줌 */
export function openChapter(s, n, w, day) {
  if (s.chapter >= n) return [];
  s.chapter = n; s.chDay[n] = day; s.lastGain = Math.max(s.lastGain, day); s.pickN = 0;
  if (n === 1) s.cardDay = day;
  for (const p of STORY_CHAPTERS[n - 1].pieces) if (p.how === "spark" && p.id !== "c1_sign" && p.id !== "c4_reply" && !s.found[p.id] && !s.queue.includes(p.id)) s.queue.push(p.id);
  return retroActs(s, w);
}
/** 별씨 하나를 주움: 별씨 수 + STORY_SEEDS개가 되면 조각 칸(c3_seed) */
export function noteSeed(s) { s.seeds = Math.min(STORY_SEEDS, s.seeds + 1); return s.seeds >= STORY_SEEDS && !s.found.c3_seed; }
/** 엔딩 뒤 반딧불 우체통 엽서: 우체통이 있고 이번 계절(축제 열쇠 "해-계절") 엽서를 아직 안 받았으면 { key, season, text } */
export function postcardDue(s, festKey) {
  const m = /^(\d+)-(\w+)$/.exec(festKey || ""); if (!s.ended || !s.restored.mailbox || !m || s.postcards[festKey] || !STORY_POSTCARDS[m[2]]) return null;
  return { key: festKey, season: m[2], text: STORY_POSTCARDS[m[2]] };
}
