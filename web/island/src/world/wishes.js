// 갈매미의 소원: 가끔 한 마리가 마을에 바라는 것을 말함(최대 2개). 이루어지면 그 갈매미가 기뻐하고 공식은행이 축하금을 줌.
// ok(w, u): 지금 이 소원을 빌 만한가 · done(w, u, wish): 이루어졌나(빈 뒤의 상태로 판단)
import { BUILDINGS } from "../data/catalog.js";
import { owns, allFurniture } from "./furniture.js";
import { bestieOf } from "../units/mind.js";
import { festivalPlaza, festiveCount, FESTIVAL_NEED, FESTIVAL_RADIUS } from "./festival.js";

const builtAny = (w, test) => [...w.buildings.values()].some(b => test(BUILDINGS[b.defId], b) && w.isDone(b));
const builtCount = (w, test) => [...w.buildings.values()].filter(b => test(BUILDINGS[b.defId], b) && w.isDone(b)).length;
const hasJob = (w, job) => w.units.some(u => u.job === job);

export const NEIGHBOR_DIST = 7;                                                   // 옆집: 두 집 문 사이가 이 칸 수 이하
/** 두 집이 옆집인가(문 앞 칸 사이 거리로) */
export const areNeighbors = (a, b) => !!a && !!b && a !== b && Math.hypot(a.door.x - b.door.x, a.door.z - b.door.z) <= NEIGHBOR_DIST;
const homeB = (w, u) => (u?.home && w.buildings.get(u.home)) || null;
const wishPal = (w, wish) => w.units.find(o => o.name === wish.base) || null;     // 옆집 소원의 단짝(이름으로 기억)
/** 소원 글(단짝 이름이 들어가는 소원은 함수) */
export const wishText = (d, w, u, wish) => typeof d.text === "function" ? d.text(w, u, wish) : d.text;
export const WISH_REWARD = 10;                                                    // 축하금(중앙은행이 켜진 섬은 금고에서, World.issue)
export const WISHES = [
  { id: "market", icon: "🐚", text: "시장이 있으면 좋겠어요", hint: "🪚 목수가 시장을 지어요",
    ok: w => !builtAny(w, d => d.market), done: w => builtAny(w, d => d.market) },
  { id: "field", icon: "🌾", text: "밭에서 곡식이 자라는 걸 보고 싶어요", hint: "🪚 목수가 밭을 지어요",
    ok: w => hasJob(w, "farmer") && !builtAny(w, d => d.field), done: w => builtAny(w, d => d.field) },
  { id: "dock", icon: "⚓", text: "부두에서 낚시하고 싶어요", hint: "🪚 목수가 부두를 지어요",
    ok: w => hasJob(w, "fisher") && !builtAny(w, d => d.dock), done: w => builtAny(w, d => d.dock) },
  { id: "home", icon: "🏠", text: "내 집이 갖고 싶어요", hint: "집을 지으면 시장에서 사요",
    ok: (w, u) => !u.home && !!w.bankB(), done: (w, u) => !!u.home },
  { id: "friend", icon: "🥚", text: "친구가 더 있으면 좋겠어요", hint: "📱 소환(집이 모자라면 집을 한 채 더 지어요)",
    ok: w => w.units.length < 6, done: (w, u, wish) => w.units.length > wish.base },
  { id: "stairs", icon: "🪜", text: "높은 곳에 올라가 보고 싶어요", hint: "🔨 기본이 계단을 지어요",
    ok: w => !builtAny(w, d => d.id === "stairs"), done: w => builtAny(w, d => d.id === "stairs") },
  { id: "houses", icon: "🏘", text: "집이 더 많은 마을이면 좋겠어요", hint: "집을 하나 더 지어요",
    ok: w => w.units.length >= 3, done: (w, u, wish) => builtCount(w, d => d.house) > wish.base, base: w => builtCount(w, d => d.house) },
  { id: "storehouse", icon: "🏚", text: "겨울이 오기 전에 음식을 모아 두고 싶어요", hint: "🪚 목수가 저장고를 지어요",
    ok: w => (w.season === "autumn" || w.season === "winter") && !builtAny(w, d => d.storehouse), done: w => builtAny(w, d => d.storehouse) },
  { id: "cafe", icon: "☕", text: "친구들과 수다 떨 카페가 있으면 좋겠어요", hint: "마을 등급 🏘 어촌부터",
    ok: w => w.rank >= 1 && !builtAny(w, d => d.id === "cafe"), done: w => builtAny(w, d => d.id === "cafe") },
  // 가로등은 풍차 전기가 닿아야 켜짐: 풍차가 선 뒤에만 빌고, 불 켜진(전기 닿는) 가로등이 있어야 이루어짐
  { id: "lamp", icon: "🏮", text: "밤길이 어두워요. 불 켜진 가로등이 있으면 좋겠어요", hint: "🔨 풍차 전기가 닿는 곳(풍차를 누르면 범위가 보여요)에 가로등을 지어요",
    ok: w => w.units.length >= 2 && builtAny(w, d => d.power) && !builtAny(w, (d, b) => d.id === "streetlamp" && w.powered(b)), done: w => builtAny(w, (d, b) => d.id === "streetlamp" && w.powered(b)) },
  { id: "bed", icon: "🛏", text: "내 집에 푹신한 침대가 있으면 좋겠어요", hint: "🏠 집 꾸미기에서 침대 놓기(잡화점에서 사요)",
    ok: (w, u) => !!u.home && !owns(w.buildings.get(u.home), "bed") && !owns(w.buildings.get(u.home), "shellBed"),
    done: (w, u) => { const b = u.home && w.buildings.get(u.home); return !!b && allFurniture(b).some(o => o.id === "bed" || o.id === "shellBed"); } },
  { id: "bench", icon: "🪑", text: "산책하다 앉아 쉴 벤치가 있으면 좋겠어요", hint: "🔨 기본이 벤치를 지어요",
    ok: w => w.units.length >= 3 && !builtAny(w, d => d.id === "bench"), done: w => builtAny(w, d => d.id === "bench") },
  { id: "power", icon: "⚡", text: "밤에도 집이 환했으면 좋겠어요", hint: "🪚 목수가 풍차 발전소를 지어요(마을 등급 어촌) · 둘레 18칸의 가로등·등불·창이 켜져요",
    ok: (w, u) => w.rank >= 1 && !!u.home && !builtAny(w, d => d.power), done: w => builtAny(w, d => d.power) },
  { id: "giant", icon: "🏯", text: "내 몸에 맞는 큰 집이 필요해요", hint: "🔨 자이언트의 집",
    ok: (w, u) => u.name === "자이언트" && !u.home, done: (w, u) => !!u.home },
  // 단짝 옆집: 단짝이 있고 둘 중 하나라도 아직 집이 없을 때(집은 한 번 사면 못 옮기니까). base = 단짝 이름.
  // lost: 이제 이룰 수 없으면(단짝이 떠났거나 둘 다 먼 집을 삼) 조용히 접음.
  { id: "neighbor", icon: "💞", text: (w, u, wish) => `${wish?.base ?? "단짝"} 옆집에 살고 싶어요`, hint: `단짝 집 가까이(${NEIGHBOR_DIST}칸 안)에 집을 지어 주세요`,
    ok: (w, u) => { const f = bestieOf(u, w.units); return !!f && !!w.bankB() && (!u.home || !f.home); },
    base: (w, u) => bestieOf(u, w.units)?.name ?? null,
    done: (w, u, wish) => areNeighbors(homeB(w, u), homeB(w, wishPal(w, wish))),
    lost: (w, u, wish) => { const f = wishPal(w, wish); return !f || (!!u.home && !!f.home && !areNeighbors(homeB(w, u), homeB(w, f))); } },
  // 계절 축제의 날: 제비뽑기로는 안 나오고(ok 없음) 월드가 계절마다 한 번 직접 올림(World.stepFestival). base = 축제 열쇠(해-계절), had = 빌 때 있던 축제 장식 수.
  // 광장(축제 장식 FESTIVAL_NEED개가 FESTIVAL_RADIUS칸 안)이 있고, 빈 뒤에 장식을 하나라도 새로 놓았으면 이루어짐. 계절이 넘어가면 접음.
  { id: "festival", icon: "🎉", text: "축제 하자!", hint: `🔨 축제 장식(깃발 줄·축제 등불·계절 장식·눈사람) ${FESTIVAL_NEED}개를 ${FESTIVAL_RADIUS}칸 안에 모아 광장을 꾸며요(새 장식 하나 이상)`,
    ok: () => false, done: (w, u, wish) => festivalPlaza(w).ok && festiveCount(w) > (wish.had ?? -1),
    lost: (w, u, wish) => !!w.festKey && wish.base !== w.festKey },
];
export const WISH_BY_ID = Object.fromEntries(WISHES.map(x => [x.id, x]));
