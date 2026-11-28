// 갈매미와 나(플레이어) 사이의 정: 선물 주기 · 쓰다듬기 · 답례(순수 계산: 화면·난수를 모름).
// 정(u.bond, 0~BOND_MAX)은 선물과 쓰다듬기로만 오르고 줄지 않음. 하트 단계(0~3)에 처음 닿으면 갈매미가 답례를 한 번 남김.
import { ITEMS, FISH, FURNITURE, PERSONA } from "../data/catalog.js";

export const BOND_MAX = 40;
// 하트 단계: 정이 min 이상이면 그 단계. held = 들어 올렸을 때 하는 말(친해질수록 덜 놀람)
export const BOND_STAGES = [
  { name: "처음 만난 사이", min: 0, held: "!?" },
  { name: "아는 사이", min: 5, held: "어, 어?" },
  { name: "정든 사이", min: 14, held: "히히 ♪" },
  { name: "소중한 사이", min: 28, held: "♥" },
];
/** 정 → 하트 단계(0~3) */
export const bondStage = v => { let s = 0; BOND_STAGES.forEach((d, i) => { if ((v || 0) >= d.min) s = i; }); return s; };
/** 하트 줄("♥♥♡") */
export const bondHearts = v => { const s = bondStage(v), n = BOND_STAGES.length - 1; return "♥".repeat(s) + "♡".repeat(n - s); };

// 선물 갈래: 가방 물건마다 하나, 보물 물고기는 모두 "fish". 갈매미마다 좋아하는·꺼리는 갈래는 PERSONA의 likes·dislikes
// best: 도장 가게의 왕관 쿠키처럼 누구나 좋아하는 것(giftTier가 늘 2)
export const GIFT_CAT_NAME = { letter: "편지·책갈피", shiny: "반짝이는 것", plant: "꽃과 잎", sea: "바다 조개", ice: "차가운 것", fish: "귀한 물고기", best: "모두가 좋아하는 것", warm: "따뜻한 것" };
const GIFT_CATS = { bottle: "letter", pearl: "shiny", petal: "plant", conch: "sea", maple: "plant", iceshell: "ice", stardust: "shiny",
  // ✨ 반짝이(내 주머니): 갈매미마다 계절마다 좋아하는 반짝이가 하나 이상 있게 고름
  shell: "sea", seaglass: "shiny", goby: "fish", postcard: "letter", blossom: "plant", clover: "plant", acorn: "plant", pinecone: "plant", icicle: "ice",
  // 🌙 밤 반짝이: 반딧불 병 = 반짝이는 것(불씨·황금), 별빛 쪽지 = 편지(그림자·기본), 달빛 조개 = 바다 조개(물방울), 야광 해초 = 꽃과 잎(꽃·미니·목수)
  fireflyJar: "shiny", starNote: "letter", moonShell: "sea", glowWeed: "plant",
  // 도장 선물(갈래마다 하나 + 누구나 좋아하는 왕관 쿠키)
  goldLetter: "letter", starBrooch: "shiny", bouquet: "plant", rainbowShell: "sea", snowGlobe: "ice", fishTin: "fish", crownCookie: "best",
  // 손뜨개 목도리(옷 선물): 누구에게나 보통(고마워), 받으면 그 갈매미 옷이 됨
  knitScarf: "warm" };
/** 도장 선물(ITEMS의 stampGift)을 받으면 오르는 정이 GIFT_TIERS의 이 배수 */
export const STAMP_GIFT_BOND = 2;
// 반응 3단계: 꺼리는 것 · 보통 · 좋아하는 것 → 말풍선, 오르는 정, 재미
export const GIFT_TIERS = [
  { say: "음…", bond: 0.5, fun: 2 },
  { say: "고마워", bond: 2, fun: 8 },
  { say: "최고야!", bond: 4, fun: 15 },
];
/** 선물할 수 있는 것의 정의: 가구가 아닌 가방 물건 또는 보물 물고기(희귀 이상). 아니면 null. 음식은 선물하지 않음(먹거리 살림을 건드리지 않게) */
export function giftDef(id) {
  const it = ITEMS.find(i => i.id === id && !i.furniture); if (it) return { ...it, kind: "item", cat: GIFT_CATS[id] || GIFT_CATS[it.rareOf] || null };   // 드문 반짝이(rareOf)는 바탕 반짝이와 같은 갈래
  const f = FISH.find(f => f.id === id && f.rarity !== "common"); return f ? { ...f, kind: "fish", cat: "fish" } : null;
}
/** 지금 선물할 수 있는 것들: [{ id, name, kind, cat, n }] (내 가방 world.items의 선물거리 → 예전 저장에 남은 보물 물고기 world.treasures 순서).
 *  갈매미가 잡은 것은 더 이상 이 두 칸에 들어오지 않으므로(각자 u.stash) 사실상 "내 주머니"(주운 반짝이·도장 선물·답례 물건) */
export function giftables(world) {
  const out = [];
  for (const i of ITEMS) { const n = world.items[i.id] || 0, d = n > 0 && giftDef(i.id); if (d) out.push({ ...d, n }); }
  for (const f of FISH) { const n = world.treasures[f.id] || 0, d = n > 0 && giftDef(f.id); if (d) out.push({ ...d, n }); }
  return out;
}
/** 내 주머니(플레이어 몫 선물거리)의 총 개수: world.items 가운데 선물할 수 있는 것. 갈매미가 잡은 것은 각자 u.stash에 있어 여기 안 셈 */
export const pocketCount = world => ITEMS.reduce((s, i) => s + (giftDef(i.id) ? Math.max(0, world.items?.[i.id] || 0) : 0), 0);
/** 이 갈매미가 이 선물을 받았을 때의 반응 단계(0 꺼림 · 1 보통 · 2 좋아함) */
export function giftTier(name, id) {
  const p = PERSONA[name] || {}, cat = giftDef(id)?.cat;
  if (cat === "best") return 2;
  return cat && p.likes?.includes(cat) ? 2 : cat && p.dislikes?.includes(cat) ? 0 : 1;
}

// 쓰다듬기: 갈매미마다 하루(실제 날짜 열쇠 — 오늘의 부탁과 같은 daily.js dailyKey, World.petKey) PET_DAILY번까지
export const PET_DAILY = 5, PET_BOND = 0.5, PET_FUN = 4;
/** 오늘 더 쓰다듬을 수 있는 횟수(day = 날짜 열쇠, 글자 또는 예전 저장의 마을 날짜 수) */
export const petsLeft = (u, day) => Math.max(0, PET_DAILY - (u.petDay === day ? u.petN || 0 : 0));

// 답례: 하트 단계(1~3)에 처음 닿았을 때 한 번. item = 마을 가방에 들어가는 물건(ITEMS의 id),
// furniture = 그 갈매미 집 창고에 들어가는 가구(집이 없으면 대신 item을 마을 가방에)
export const BOND_THANKS = [null, { item: "bottle" }, { furniture: "plant", item: "chair" }, { item: "pearl" }];
// 취향 답례: 아는 사이(1)·소중한 사이(3)의 물건 답례는 그 갈매미가 좋아하는 갈래(PERSONA likes)에서 고름. 모르는 모습이면 BOND_THANKS 그대로.
//  좋아하는 갈래가 둘이면 아는 사이는 첫째, 소중한 사이는 둘째(likes[floor(단계 / 2) % 개수]) → 같은 날 여러 마리가 아는 사이가 돼도 답례가 저마다 다름
export const THANKS_BY_TASTE = {
  1: { letter: "bottle", plant: "petal", sea: "conch", shiny: "seaglass", fish: "goby", ice: "icicle" },
  3: { letter: "goldLetter", plant: "bouquet", sea: "rainbowShell", shiny: "pearl", fish: "fishTin", ice: "snowGlobe" },
};
/** 갈매미의 모습(성격·취향 표 PERSONA의 열쇠). 모습과 이름이 갈라지면 u.form, 아니면 지금처럼 u.name */
export const gullForm = u => u?.form ?? u?.name;
/** 이 단계의 답례를 풀어 줌: { kind: "furniture" | "item", id, name } (hasHome: 가구를 둘 집이 있는지 · form: 갈매미 모습, 주면 취향 답례) */
export function thanksFor(stage, hasHome, form) {
  const t = BOND_THANKS[stage]; if (!t) return null;
  if (t.furniture && hasHome && FURNITURE[t.furniture]) return { kind: "furniture", id: t.furniture, name: FURNITURE[t.furniture].name };
  const likes = PERSONA[form]?.likes || [], cat = likes.length ? likes[Math.floor(stage / 2) % likes.length] : null, id = THANKS_BY_TASTE[stage]?.[cat] || t.item;
  const it = ITEMS.find(i => i.id === id); return it ? { kind: "item", id: it.id, name: it.name } : null;
}
/** 저장에서 읽은 간직하기 표시(예전 저장엔 없음 → 빈 것). 선물할 수 있는 것만 */
export const keepFromSave = j => Object.fromEntries(Object.keys(j && typeof j === "object" ? j : {}).filter(id => j[id] && giftDef(id)).map(id => [id, true]));
