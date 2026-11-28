// 갈매미의 소원: 가끔 한 마리가 마을에 바라는 것을 말함(최대 2개). 이루어지면 그 갈매미가 기뻐하고 공식은행이 축하금을 줌.
// ok(w, u): 지금 이 소원을 빌 만한가 · done(w, u, wish): 이루어졌나(빈 뒤의 상태로 판단)
import { BUILDINGS } from "../data/catalog.js";
import { formOf } from "./evolve.js";
import { owns, allFurniture } from "./furniture.js";
import { bestieOf } from "../units/mind.js";
import { festivalPlaza, festiveCount, FESTIVAL_NEED, FESTIVAL_RADIUS } from "./festival.js";

const builtAny = (w, test) => [...w.buildings.values()].some(b => test(BUILDINGS[b.defId], b) && w.isDone(b));
const builtCount = (w, test) => [...w.buildings.values()].filter(b => test(BUILDINGS[b.defId], b) && w.isDone(b)).length;
const hasJob = (w, job) => w.units.some(u => u.job === job);

export const NEIGHBOR_DIST = 7;                                                   // 옆집: 두 집 문 사이가 이 칸 수 이하
/** 두 집이 옆집인가(문 앞 칸 사이 거리로) */
export const areNeighbors = (a, b) => !!a && !!b && a !== b && Math.hypot(a.door.x - b.door.x, a.door.z - b.door.z) <= NEIGHBOR_DIST;
/** 옆집이거나 한 집(둘이 사는 2층집, homes.js)에 같이 삶 */
const nearHome = (a, b) => (!!a && a === b) || areNeighbors(a, b);
const homeB = (w, u) => (u?.home && w.buildings.get(u.home)) || null;
const wishPal = (w, wish) => w.units.find(o => o.unitId === wish.base) || null;   // 옆집 소원의 단짝(id로 기억 — 이름은 바뀔 수 있음)
/** 자이언트의 집(전용 집)에 사는가 */
export const inGiantHouse = (w, u) => { const b = homeB(w, u); return !!b && BUILDINGS[b.defId]?.forUnit === formOf(u); };
/** 소원 글(단짝 이름이 들어가는 소원은 함수) */
export const wishText = (d, w, u, wish) => typeof d.text === "function" ? d.text(w, u, wish) : d.text;
export const WISH_REWARD = 10;                                                    // 축하금(중앙은행이 켜진 섬은 금고에서, World.issue)
export const WISH_RESCUE = 20;                                                    // 금고가 VAULT_LOW 아래일 때 소원이 이루어지면 금고에도 넣는 축하금(World.vaultBonus — 구제 장치)
export const WISHES = [
  { id: "market", icon: "🛒", text: "장 볼 데가 없네. 시장 하나 있으면 딱인데", hint: "🪚 목수가 시장을 지어요",
    ok: w => !builtAny(w, d => d.market), done: w => builtAny(w, d => d.market) },
  { id: "field", icon: "🌾", text: "밭에서 곡식이 자라는 걸 보고 싶다", hint: "🪚 목수가 밭을 지어요",
    ok: w => hasJob(w, "farmer") && !builtAny(w, d => d.field), done: w => builtAny(w, d => d.field) },
  { id: "dock", icon: "⚓", text: "부두에 앉아 하루 종일 낚시하고 싶어", hint: "🪚 목수가 부두를 지어요",
    ok: w => hasJob(w, "fisher") && !builtAny(w, d => d.dock), done: w => builtAny(w, d => d.dock) },
  { id: "home", icon: "🏠", text: "내 집이 생기면 좋겠다", hint: "집을 지으면 시장에서 사요",
    ok: (w, u) => !u.home && !!w.bankB(), done: (w, u) => !!u.home },
  { id: "friend", icon: "🥚", text: "같이 놀 친구가 더 있으면…", hint: "📱 소환으로 불러요. 집이 모자라면 한 채 더 지어요",
    ok: w => w.units.length < 6, done: (w, u, wish) => w.units.length > wish.base },
  { id: "stairs", icon: "🪜", text: "저 위에선 바다가 어떻게 보일까?", hint: "🔨 건축가가 계단을 지어요",
    ok: w => !builtAny(w, d => d.id === "stairs"), done: w => builtAny(w, d => d.id === "stairs") },
  { id: "houses", icon: "🏘", text: "집이 더 많아지면 덜 쓸쓸할 텐데", hint: "집을 하나 더 지어요",
    ok: w => w.units.length >= 3, done: (w, u, wish) => builtCount(w, d => d.house) > wish.base, base: w => builtCount(w, d => d.house) },
  { id: "storehouse", icon: "🏚", text: "겨울 오기 전에 먹을 걸 쟁여 둬야 하는데", hint: "🪚 목수가 저장고를 지어요",
    ok: w => (w.season === "autumn" || w.season === "winter") && !builtAny(w, d => d.storehouse), done: w => builtAny(w, d => d.storehouse) },
  { id: "cafe", icon: "☕", text: "수다 떨 카페가 있으면 매일 갈 텐데", hint: "🏘 어촌이 되면 지을 수 있어요",
    ok: w => w.rank >= 1 && !builtAny(w, d => d.id === "cafe"), done: w => builtAny(w, d => d.id === "cafe") },
  // 가로등은 풍차 전기가 닿아야 켜짐: 풍차가 선 뒤에만 빌고, 불 켜진(전기 닿는) 가로등이 있어야 이루어짐
  { id: "lamp", icon: "🏮", text: "밤길이 깜깜해. 가로등 하나만 켜져 있어도…", hint: "🔨 풍차 전기가 닿는 곳에 가로등을 지어요. 풍차를 누르면 닿는 곳이 보여요",
    ok: w => w.units.length >= 2 && builtAny(w, d => d.power) && !builtAny(w, (d, b) => d.id === "streetlamp" && w.powered(b)), done: w => builtAny(w, (d, b) => d.id === "streetlamp" && w.powered(b)) },
  { id: "bed", icon: "🛏", text: "푹신한 침대에서 자 보고 싶다", hint: "🏠 집에 들어가 침대를 놓아 주세요. 침대는 잡화점에서 팔아요",
    ok: (w, u) => !!u.home && !owns(w.buildings.get(u.home), "bed") && !owns(w.buildings.get(u.home), "shellBed"),
    done: (w, u) => { const b = u.home && w.buildings.get(u.home); return !!b && allFurniture(b).some(o => o.id === "bed" || o.id === "shellBed"); } },
  { id: "bench", icon: "🪑", text: "걷다가 앉을 데가 없네…", hint: "🔨 건축가가 벤치를 지어요",
    ok: w => w.units.length >= 3 && !builtAny(w, d => d.id === "bench"), done: w => builtAny(w, d => d.id === "bench") },
  // 풍차는 처음부터 지을 수 있음(예전 🏘 어촌부터): 지을 목수가 있을 때 빎
  { id: "power", icon: "⚡", text: "밤에도 창문이 환했으면", hint: "🪚 목수가 풍차 발전소를 지어요. 둘레의 등불과 창이 켜져요",
    ok: (w, u) => !!u.home && w.units.some(o => o.job === "carpenter") && !builtAny(w, d => d.power), done: w => builtAny(w, d => d.power) },
  { id: "giant", icon: "🏯", text: "내 몸에 맞는 큰 집이 필요해", hint: "🔨 자이언트의 집을 지어 주세요",
    ok: (w, u) => formOf(u) === "자이언트" && !inGiantHouse(w, u), done: (w, u) => inGiantHouse(w, u) },
  // 단짝 옆집: 단짝이 있고 둘 중 하나라도 아직 집이 없을 때(집은 한 번 사면 못 옮기니까). base = 단짝 unitId(이름은 바뀔 수 있음).
  // lost: 이제 이룰 수 없으면(단짝이 떠났거나 둘 다 먼 집을 삼) 조용히 접음.
  { id: "neighbor", icon: "💞", text: (w, u, wish) => `${(wish && w?.units && wishPal(w, wish)?.name) ?? "단짝"} 옆집에 살고 싶어`, hint: `단짝 집에서 ${NEIGHBOR_DIST}칸 안에 집을 지어 주세요. 🏡 2층집이면 같이 살 수도 있어요`,
    ok: (w, u) => { const f = bestieOf(u, w.units); return !!f && !!w.bankB() && (!u.home || !f.home); },
    base: (w, u) => bestieOf(u, w.units)?.unitId ?? null,
    done: (w, u, wish) => nearHome(homeB(w, u), homeB(w, wishPal(w, wish))),
    lost: (w, u, wish) => { const f = wishPal(w, wish); return !f || (!!u.home && !!f.home && !nearHome(homeB(w, u), homeB(w, f))); } },
  // 계절 축제의 날: 제비뽑기로는 안 나오고(ok 없음) 월드가 계절마다 한 번 직접 올림(World.stepFestival). base = 축제 열쇠(해-계절), had = 빌 때 있던 축제 장식 수.
  // 광장(축제 장식 FESTIVAL_NEED개가 FESTIVAL_RADIUS칸 안)이 있고, 빈 뒤에 장식을 하나라도 새로 놓았으면 이루어짐. 계절이 넘어가면 접음.
  { id: "festival", icon: "🎉", text: "축제 하자!", hint: `🔨 깃발 줄, 축제 등불, 계절 장식, 눈사람 같은 축제 장식 ${FESTIVAL_NEED}개를 ${FESTIVAL_RADIUS}칸 안에 모아 광장을 꾸며요. 새 장식이 하나는 있어야 해요`,
    ok: () => false, done: (w, u, wish) => festivalPlaza(w).ok && festiveCount(w) > (wish.had ?? -1),
    lost: (w, u, wish) => !!w.festKey && wish.base !== w.festKey },
];
export const WISH_BY_ID = Object.fromEntries(WISHES.map(x => [x.id, x]));
