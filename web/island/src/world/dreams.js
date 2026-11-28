// 꿈방울과 잠꼬대(밤 전용, 순수 계산: 화면·기기 시계를 모름 — 밤인지는 world.isNight로 받음).
//  · 기억: 월드가 알리는 일(emit) 가운데 갈매미가 겪은 일을 갈매미마다 '오늘 기억' 링버퍼(DREAM_MEM건)에 짧은 잠꼬대 조각으로 넣음. 저장하지 않음(다시 열면 빈 기억).
//  · 방울: 밤에 DREAM_AFTER초 넘게 자는 갈매미 위에 꿈방울이 하나 뜸(집 안에서 자면 그 집 지붕 위 — 자리는 render/dreamView.js).
//    갈매미마다 마을 하루(news.js newsDay = 마을 시간 600초)에 DREAM_DAILY개까지, 다음 방울은 DREAM_GAP초 뒤. 깨거나 밤이 끝나면 방울은 사라짐(센 수는 그대로).
//  · 톡 터뜨리면: 기억 하나로 잠꼬대 한 줄 + 좋아하는 것(PERSONA.likes) 또는 꿈에서 본 내일 소원(u.dreamWish → World.makeWish가 먼저 고름).
//  · 보상은 말풍선·알림 글뿐(돈·정·재미를 바꾸지 않음). 월드 난수(rnd·wrnd)를 쓰지 않음 → 마을 진행 순서가 그대로.
import { PERSONA, CLOTHES } from "../data/catalog.js";
import { newsDay, NEWS_DAY_SECS } from "./news.js";
import { WISHES, wishText } from "./wishes.js";
import { GIFT_CAT_NAME, BOND_STAGES } from "./bond.js";
import { FRIEND_STAGES } from "../units/mind.js";
import { UnitState } from "../data/types.js";

export const DREAM_MEM = 4;                 // 갈매미마다 기억하는 일(오래된 것부터 밀려남)
export const DREAM_DAILY = 2;               // 마을 하루에 갈매미마다 꿈방울 수
export const DREAM_AFTER = 6;               // 잠든 지 이 초(마을 시간)가 지나야 방울이 뜸
export const DREAM_GAP = 90;                // 한 방울이 뜬 뒤 다음 방울까지(마을 시간 초)
export const DREAM_MEM_SECS = NEWS_DAY_SECS; // 이보다 오래된 기억은 꿈에 안 나옴(그날 겪은 일)
export const DREAM_WISH_SECS = 2 * NEWS_DAY_SECS;   // 꿈에서 본 소원은 마을 이틀 동안 먼저 빎

/** 자는 중인가: 밖에서 잠(Sleep) · 건물 안에서 잠(insideAct "sleep") */
export const isAsleep = u => !!u && (u.state === UnitState.Sleep || (u.state === UnitState.Inside && !!u.insideBuildingId && u.insideAct === "sleep"));

/** 문자열 → 작은 정수(같은 입력이면 늘 같은 값: 난수 대신 문장 고르기) */
export const dreamHash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0; return h; };
const dreamPick = (arr, key) => arr[dreamHash(key) % arr.length];

// 일 → [{ u, f: 잠꼬대 조각 }] (기억할 갈매미와 그 조각). 조각은 조사 없이 짧게(이름·물건 뒤에 말줄임표)
const DREAM_MEMORY_MAKERS = {
  fish: ({ u, fish }) => [{ u, f: `${fish.name}… 내가 낚았어…` }],
  fishRecord: ({ u, fish, size }) => [{ u, f: `${fish.name} ${size}센티… 진짜였는데…` }],
  donate: ({ u, fish }) => u ? [{ u, f: `수족관… ${fish.name} 잘 있나…` }] : [],
  gift: ({ u, item }) => [{ u, f: `${item.name}… 선물 받았지… 헤헤` }],
  pet: ({ u }) => [{ u, f: "쓰담쓰담… 또 해 줘…" }],
  fussSolved: ({ u, kind }) => [{ u, f: kind === "perch" ? "바위… 높았어… 내려 줘서 고마워…" : "꾸벅… 길에서 졸면… 안 되는데…" }],
  bondStage: ({ u, stage }) => [{ u, f: `우리… ${BOND_STAGES[stage]?.name ?? "정든 사이"}…` }],
  friendship: ({ a, b, stage }) => { const n = FRIEND_STAGES[stage]?.name ?? "친구"; return [{ u: a, f: `${b.name}… 우리 ${n}…` }, { u: b, f: `${a.name}… 우리 ${n}…` }]; },
  beachcomb: ({ u, item }) => [{ u, f: `${item.name}… 반짝반짝…` }],
  starPiece: ({ u, item }) => [{ u, f: `별똥별… ${item.name}… 내 거야…` }],
  wishDone: ({ u }) => [{ u, f: "소원… 진짜 이루어졌어…" }],
  sick: ({ u }) => [{ u, f: "에취… 이불 더…" }],
  healed: ({ u }) => [{ u, f: "이제 안 아파… 개운해…" }],
  loanPaid: ({ u }) => [{ u, f: "집값… 다 갚았다아…" }],
  cocoa: ({ u }) => [{ u, f: "코코아… 따끈따끈…" }],
  dress: ({ u, put, gift }) => gift && put?.length ? [{ u, f: `${CLOTHES[put[0]]?.name ?? "옷"}… 포근해…` }] : [],
  festival: ({ def }, w) => w.units.map(u => ({ u, f: `${def.name}… 깃발이 펄럭펄럭…` })),
};
/** 기억으로 남기는 일 이름들(월드 이벤트 이름과 같음) */
export const MEMORY_EVENTS = Object.keys(DREAM_MEMORY_MAKERS);

/** 일 하나를 기억에 넣음(그 일에 나온 갈매미마다). 넣은 수 */
export function remember(world, ev, arg) {
  const mk = DREAM_MEMORY_MAKERS[ev]; if (!mk || !arg) return 0;
  let n = 0;
  for (const { u, f } of mk(arg, world) || []) {
    if (!u || !f) continue;
    const mem = u.dreamMem ||= [];
    if (mem.length && mem[mem.length - 1].f === f) { mem[mem.length - 1].t = world.time || 0; continue; }   // 같은 일이 잇달아 오면 한 번만(시각만 새로)
    mem.push({ t: world.time || 0, f }); while (mem.length > DREAM_MEM) mem.shift(); n++;
  }
  return n;
}
/** 꿈에 나올 기억(그날 것만, 새것부터) */
export const freshMemories = (u, time) => (u.dreamMem || []).filter(m => (time || 0) - m.t <= DREAM_MEM_SECS).reverse();

// 잠꼬대 틀: 기억 조각을 감쌈 · 기억이 없을 때(좋아하는 것·바다 냄새)
const DREAM_TALK_WRAP = [f => `음냐… ${f}`, f => `…${f}`, f => `${f} …쿨`, f => `으응… ${f}`];
const DREAM_TALK_EMPTY = ["…zZ… 바다 냄새…", "음냐… 구름 위를 걸어…", "…파도 소리… 쏴아…", "으응… 조개가 노래해…"];

/** 꿈에서 볼 내일 소원: 이 갈매미가 지금 빌 만한(ok) 소원 가운데 하나(마을 날짜·이름으로 고름, 난수 없음). 없으면 null */
export function dreamWishFor(world, u) {
  if (world.wishes?.some(x => x.unitId === u.unitId && x.id !== "festival")) return null;   // 이미 빌고 있는 소원이 있으면 미리 보기 없음
  const cands = WISHES.filter(d => d.id !== "festival" && !world.wishes?.some(x => x.id === d.id) && d.ok(world, u));
  return cands.length ? dreamPick(cands, `${u.name}|${newsDay(world.time)}`) : null;
}

/** 방울을 터뜨린 결과: { talk: 잠꼬대, like: 좋아하는 갈래 이름|null, wish: { id, icon, text }|null, line: 알림 줄 글 }
 *  wish가 있으면 u.dreamWish = { id, t }로 적어 둠(World.makeWish가 먼저 고름). n = 그날 몇째 방울(0부터): 첫 방울은 소원, 둘째는 좋아하는 것을 먼저 */
export function dreamTalk(world, u, n = 0) {
  const time = world.time || 0, mem = freshMemories(u, time), key = `${u.name}|${newsDay(time)}|${n}`;
  const talk = mem.length ? dreamPick(DREAM_TALK_WRAP, key)(mem[n % mem.length].f) : dreamPick(DREAM_TALK_EMPTY, key);
  const likes = (PERSONA[u.name] || {}).likes || [], like = likes.length ? GIFT_CAT_NAME[dreamPick(likes, key)] ?? null : null;
  const wd = n % 2 === 0 || !like ? dreamWishFor(world, u) : null;
  let wish = null;
  if (wd) { wish = { id: wd.id, icon: wd.icon, text: wishText(wd, world, u, { base: wd.base ? wd.base(world, u) : world.units.length }) }; u.dreamWish = { id: wd.id, t: time }; }
  const tail = wish ? ` · 💭 꿈속 소원: ${wish.icon} "${wish.text}"` : like ? ` · 💗 꿈에서도 ${like} 이야기를 해요` : "";
  return { talk, like: wish ? null : like, wish, line: `💤 ${u.name}의 잠꼬대: "${talk}"${tail}` };
}

/** World.makeWish가 먼저 고를 꿈속 소원 id(마을 이틀이 지나면 잊음). 없으면 null */
export const dreamWishId = (u, time) => u?.dreamWish && (time || 0) - u.dreamWish.t <= DREAM_WISH_SECS ? u.dreamWish.id : null;

/** 꿈방울 관리: 월드마다 하나(main.js mount). step()은 매 프레임(마을 시간 world.time을 읽음), pop(u)은 방울을 톡 터뜨림.
 *  bubbles: 지금 떠 있는 방울 [{ unitId, at: 뜬 마을 시각 }] */
export class Dreams {
  constructor(world) {
    this.world = world; this.state = new Map();                                    // unitId → { since: 잠든 시각|null, last: 마지막 방울 시각, day, n: 그날 방울 수, popped: 그날 터뜨린 수, on: 떠 있나 }
    this.offs = MEMORY_EVENTS.map(ev => { const fn = arg => remember(world, ev, arg); world.on(ev, fn); return [ev, fn]; });
  }
  stOf(u) { let s = this.state.get(u.unitId); if (!s) this.state.set(u.unitId, s = { since: null, last: -Infinity, day: 0, n: 0, popped: 0, on: false }); return s; }
  /** 매 프레임: 잠든 갈매미에게 방울을 띄우고, 깬 갈매미·낮의 방울은 지움 */
  step() {
    const w = this.world, time = w.time || 0, day = newsDay(time);
    for (const u of w.units) {
      const s = this.stOf(u); if (s.day !== day) { s.day = day; s.n = 0; s.popped = 0; }
      if (!isAsleep(u) || !w.isNight) { s.since = null; s.on = false; continue; }
      if (s.since == null) s.since = time;
      if (!s.on && s.n < DREAM_DAILY && time - s.since >= DREAM_AFTER && time - s.last >= DREAM_GAP) { s.on = true; s.n++; s.last = time; }
    }
    for (const id of this.state.keys()) if (!w.units.some(u => u.unitId === id)) this.state.delete(id);   // 떠난 갈매미
  }
  /** 떠 있는 방울의 갈매미들 */
  get sleepers() { return this.world.units.filter(u => this.state.get(u.unitId)?.on); }
  has(u) { return !!this.state.get(u?.unitId)?.on; }
  /** 방울을 톡: 잠꼬대 결과(dreamTalk) · 방울이 없으면 null */
  pop(u) {
    const s = this.state.get(u?.unitId); if (!s?.on) return null;
    s.on = false; const r = dreamTalk(this.world, u, s.popped); s.popped++; return r;
  }
  dispose() { for (const [ev, fn] of this.offs) this.world.off?.(ev, fn); this.offs = []; }
}
