// 갈매미의 소원: 가끔 한 마리가 마을에 바라는 것을 말함(최대 2개). 이루어지면 그 갈매미가 기뻐하고 공식은행이 축하금을 줌.
// ok(w, u): 지금 이 소원을 빌 만한가 · done(w, u, wish): 이루어졌나(빈 뒤의 상태로 판단)
import { BUILDINGS } from "../data/catalog.js";

const builtAny = (w, test) => [...w.buildings.values()].some(b => test(BUILDINGS[b.defId], b) && w.isDone(b));
const builtCount = (w, test) => [...w.buildings.values()].filter(b => test(BUILDINGS[b.defId], b) && w.isDone(b)).length;
const hasJob = (w, job) => w.units.some(u => u.job === job);

export const WISH_REWARD = 10;                                                    // 축하금(공식은행이 새로 찍음)
export const WISHES = [
  { id: "market", icon: "🐚", text: "시장이 있으면 좋겠어요", hint: "🪚 목수가 시장을 지어요",
    ok: w => !builtAny(w, d => d.market), done: w => builtAny(w, d => d.market) },
  { id: "field", icon: "🌾", text: "밭에서 곡식이 자라는 걸 보고 싶어요", hint: "🪚 목수가 밭을 지어요",
    ok: w => hasJob(w, "farmer") && !builtAny(w, d => d.field), done: w => builtAny(w, d => d.field) },
  { id: "dock", icon: "⚓", text: "부두에서 낚시하고 싶어요", hint: "🪚 목수가 부두를 지어요",
    ok: w => hasJob(w, "fisher") && !builtAny(w, d => d.dock), done: w => builtAny(w, d => d.dock) },
  { id: "home", icon: "🏠", text: "내 집이 갖고 싶어요", hint: "집을 지으면 시장에서 사요",
    ok: (w, u) => !u.home && !!w.bankB(), done: (w, u) => !!u.home },
  { id: "friend", icon: "🥚", text: "친구가 더 있으면 좋겠어요", hint: "📱 소환",
    ok: w => w.units.length < 6, done: (w, u, wish) => w.units.length > wish.base },
  { id: "stairs", icon: "🪜", text: "높은 곳에 올라가 보고 싶어요", hint: "🔨 기본이 계단을 지어요",
    ok: w => !builtAny(w, d => d.id === "stairs"), done: w => builtAny(w, d => d.id === "stairs") },
  { id: "houses", icon: "🏘", text: "집이 더 많은 마을이면 좋겠어요", hint: "집을 하나 더 지어요",
    ok: w => w.units.length >= 3, done: (w, u, wish) => builtCount(w, d => d.house) > wish.base, base: w => builtCount(w, d => d.house) },
  { id: "giant", icon: "🏯", text: "내 몸에 맞는 큰 집이 필요해요", hint: "🔨 자이언트의 집",
    ok: (w, u) => u.name === "자이언트" && !u.home, done: (w, u) => !!u.home },
];
export const WISH_BY_ID = Object.fromEntries(WISHES.map(x => [x.id, x]));
