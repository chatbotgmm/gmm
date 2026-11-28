// 플레이어가 받는 보상을 크게 보여 주는 효과의 순수 로직(DOM·소리·타이머 없음 → tests/rewardfx.test.js). 화면은 ui/rewardView.js.
//  · 단계(tier) 셋:
//    small  = 큰 「+N 🪙」 숫자가 떠올라 금고 칩으로 날아감(세금·숙박비처럼 자주·저절로 들어오는 돈). 같은 곳으로 가는 것은 RF_SUM_MS 안에 합침
//    medium = 화면 위쪽 가운데 띠(큰 아이콘 + 굵은 한 줄 + 짧은 덧말). RF_MEDIUM_MS 뒤 저절로 사라짐, 누를 수 없음(놀이를 막지 않음)
//    big    = 화면 가운데 큰 카드(빛·색종이·통통 튐 + 팡파르). 누르면 받기, 안 눌러도 RF_BIG_MS 뒤 저절로 받음
//  · 한 번에 하나만(띠·카드가 겹치지 않음): 차례(큐)로. 큰 카드가 먼저. 건설 모드·방 안·편지가 떠 있는 동안 큰 카드는 기다렸다가 돌아오면 보여 줌
//    (띠는 그대로 보임 — 작고 저절로 사라짐). 너무 밀리면(RF_MAX_Q) 오래된 띠부터 버림(알림 기록엔 남음)
//  · rewardOf(ev, arg, world): 월드 이벤트 → 보상 모양 { tier, icon, title, line, n?, to, snd, key } 또는 null(플레이어 보상이 아님)
import { BUILDINGS, ITEMS } from "../data/catalog.js";
import { BOND_STAGES } from "../world/bond.js";
import { MEDALS } from "../world/medals.js";
import { josa } from "../util.js";
import { VIEW } from "./viewPrefs.js";
import { DISP_INFO, GROWTH_LABEL, topGrowth, rarityName } from "../world/evolve.js";
/** 모습 아이콘(카드·도감) */
export const FORM_EMOJI = { "기본": "🥚", "물방울": "💧", "그림자": "🌑", "불씨": "🔥", "목수": "🪚", "꽃": "🌼", "황금": "👑", "자이언트": "🗿", "미니": "🐣" };

export const RF_MEDIUM_MS = 2600;   // 띠가 떠 있는 시간
export const RF_BIG_MS = 4200;      // 큰 카드가 저절로 받아지는 시간(그 전에 누르면 바로)
export const RF_BIG_MIN_MS = 450;   // 큰 카드는 이만큼은 보임(뜨자마자 다른 탭에 받아져 버리지 않게)
export const RF_GAP_MS = 180;       // 띠·카드 사이 잠깐 빈 틈
export const RF_SUM_MS = 1200;      // small: 같은 곳으로 가는 +N은 이 안에 들어오면 합쳐서 하나로 날림
export const RF_FLY_MS = 1500;      // small: 떠올랐다 금고 칩까지 날아가는 시간
export const RF_MAX_Q = 6;          // 기다리는 띠·카드 상한
export const RF_STORY_MS = 9000;    // 🗝 이야기 카드(조각 글을 읽을 시간)
export const TIER_RANK = { small: 0, medium: 1, big: 2 };

/** 물건 아이콘(ITEMS에는 아이콘이 없어 여기서). 모르는 것은 🎁 */
export const REWARD_ITEM_ICON = {
  bottle: "💌", pearl: "🦪", chair: "🪑", table: "🪸", bookshelf: "📚", bed: "🛏️", petal: "🌸", conch: "🐚", maple: "🍁", iceshell: "🧊", stardust: "🌠",
  festSpring: "🌸", festSummer: "🌊", festAutumn: "🏮", festWinter: "🛋️", stampRug: "🧶", stampLamp: "🪔", stampShelf: "📚", stampBed: "🛏️",
  shell: "🐚", seaglass: "💎", goby: "🐟", postcard: "📮", blossom: "🌸", clover: "🍀", acorn: "🌰", pinecone: "🌲", icicle: "🧊",
  fireflyJar: "✨", starNote: "⭐", moonShell: "🌙", glowWeed: "🌿",
  goldLetter: "💌", starBrooch: "⭐", bouquet: "💐", rainbowShell: "🌈", snowGlobe: "❄️", fishTin: "🥫", crownCookie: "👑", knitScarf: "🧣",
  medalRug: "🏅", medalLamp: "🎣", medalShelf: "🏆", plant: "🪴", bormChair: "🪑",
};
export const itemIcon = it => REWARD_ITEM_ICON[typeof it === "string" ? it : it?.id] || "🎁";
const isFurni = it => !!(it && (it.furniture || it.kind === "furniture"));
const nameOf = it => it?.name || ITEMS.find(i => i.id === it?.id)?.name || "선물";
const got = name => `${name} 획득!`;
const FURNI_LINE = "🏠 집 꾸미기에서 놓아요";

/** 월드 이벤트 → 보상 모양. 플레이어 몫이 아니면 null */
export function rewardOf(ev, a, world) {
  a = a || {};
  switch (ev) {
    case "sparkle": { const it = a.item; if (!it) return null;   // 직접 주운 반짝이 → 내 주머니
      return { tier: it.rarity && it.rarity !== "common" ? "big" : "medium", icon: itemIcon(it), title: got(nameOf(it)), line: "🎁 내 주머니에 쏙!", to: "bag", snd: "glint", key: "sparkle" }; }
    case "stampBuy": { const it = a.item; if (!it) return null;   // 도장 가게: 도장으로 바꾼 한정 가구·귀한 선물
      return { tier: "big", icon: itemIcon(it), title: got(it.name), line: it.furniture ? `🏪 도장 가게 한정 가구 · ${FURNI_LINE}` : "🏪 도장 가게 귀한 선물 · 🎁 내 주머니로", to: "bag", snd: "fanfare", key: `stamp:${it.id}` }; }
    case "medalGift": case "donateGift": { const it = a.item; if (!it) return null;   // 수족관 금메달·기증 기념 가구
      const why = ev === "medalGift" ? `🥇 물고기 ${a.gift?.label ?? "금메달"} 기념` : `🐠 수족관 기증 ${a.gift?.label ?? ""} 기념`.replace(/\s+기념$/, " 기념");
      return { tier: "big", icon: itemIcon(it), title: got(it.name), line: `${why} · ${FURNI_LINE}`, to: "bag", snd: "fanfare", key: `${ev}:${it.id}` }; }
    case "festivalEnd": { const it = a.item; if (!it) return null;
      return { tier: "big", icon: itemIcon(it), title: got(it.name), line: `🎉 ${a.def?.name ?? "축제"} 기념 · ${FURNI_LINE}`, to: "bag", snd: "fanfare", key: `fest:${it.id}` }; }
    case "rank": { const def = a.def; if (!def) return null;
      const unlock = (def.unlock || []).map(id => BUILDINGS[id]?.name).filter(Boolean);
      return { tier: "big", icon: def.icon || "🏅", title: `마을 등급 UP! ${def.name}`, line: unlock.length ? `🔓 새 건물: ${unlock.join(", ")}` : "🏅 마을이 한층 자랐어요", to: null, snd: "fanfare", key: `rank:${a.rank}` }; }
    case "dailyDone": {
      if (a.all) return { tier: "big", icon: "💮", title: "도장 획득!", line: `📋 오늘의 부탁 모두 완료 · 모은 도장 ${a.stamps ?? 1}개`, to: "bag", snd: "fanfare", key: "dailyAll" };
      return { tier: "medium", icon: a.req?.icon || "📋", title: "오늘의 부탁 완료!", line: `${a.req?.text ?? ""}${a.left ? ` · ${a.left}개 남음` : ""}`.trim(), to: null, snd: "chime", key: `daily:${a.req?.id ?? ""}` }; }
    case "bondStage": { const u = a.u, g = a.gift, st = BOND_STAGES[a.stage]; if (!u || !st) return null;
      const title = `${josa(u.name, "과", "와")} ${st.name}!`;
      if (!g) return { tier: "medium", icon: "💝", title, line: "♥ 정이 깊어졌어요", to: null, snd: "chime", key: `bond:${u.unitId}:${a.stage}` };
      const furni = g.kind === "furniture";
      return { tier: furni || a.stage >= 3 ? "big" : "medium", icon: itemIcon(g.id), title: got(g.name), line: `💝 ${title} 답례 · ${furni ? `${u.name}네 ${g.where ?? "집"}에 들여놨어요` : "🎁 내 주머니로"}`, to: furni ? null : "bag", snd: furni || a.stage >= 3 ? "fanfare" : "chime", key: `bond:${u.unitId}:${a.stage}` }; }
    case "evolve": { const u = a.u; if (!u) return null;   // 🌟 변신(딱 한 번): 큰 카드 — 타고난 성향 공개 · 이렇게 자랐어요 · 도감 · 천직 · 성향 맞히기
      const disp = DISP_INFO[a.disp], grew = topGrowth(u.growth), bits = [], tags = [];
      if (disp) bits.push(`타고난 성향은 ${disp.icon} ${disp.name}`);
      if (grew) bits.push(GROWTH_LABEL[grew]);
      if (a.calling) tags.push("천직 ✓"); if (a.first && !a.stayed) tags.push("📖 도감에 새 모습"); if (a.guessHit) tags.push("🎯 성향을 맞혀서 도장을 받았어요");
      const line = (head, extra = []) => [[...head, ...bits].join(". "), [...tags, ...extra].join(", ")].filter(Boolean).join(". ");
      if (a.stayed) return { tier: "big", icon: "🪨", kick: "✨ 변신의 날 ✨", title: `${josa(u.name, "은", "는")} 든든한 기본 갈매미!`, line: line(["변신하지 않고 단단해졌어요. 정이 깊어졌어요"]), to: null, snd: "fanfare", key: `evolve:${u.unitId}` };
      return { tier: "big", icon: FORM_EMOJI[a.to] || "🌟", kick: "🌟 변신! 🌟", title: `${josa(u.name, "이", "가")} ${a.to} 갈매미가 됐어요!`, line: line([], [`✦ ${rarityName(u.rarity)} 등급`]), to: null, snd: "fanfare", key: `evolve:${u.unitId}` }; }
    case "giantMove": { const u = a.u; if (!u) return null;
      return { tier: "medium", icon: "🗿", title: `${josa(u.name, "이", "가")} 자이언트의 집으로!`, line: "딱 맞는 집으로 이사했어요", to: null, snd: "chime", key: `giantMove:${u.unitId}` }; }
    case "wishDone": { const u = a.u; if (!u) return null;
      return { tier: "medium", icon: "💖", title: "소원 성취!", line: `${u.name}의 소원이 이루어졌어요`, to: null, snd: "chime", key: `wish:${u.unitId}` }; }
    case "fussSolved": { const u = a.u; if (!u) return null;
      return { tier: "medium", icon: "💕", title: `${josa(u.name, "이", "가")} 고마워해요!`, line: a.kind === "perch" ? "바위에서 내려 줬어요" : "포근한 곳으로 옮겨 줬어요", to: null, snd: "chime", key: `fuss:${u.unitId}` }; }
    case "donate": { const f = a.fish; if (!f) return null;
      return { tier: "medium", icon: "🐠", title: `${f.name} 기증!`, line: "📖 수족관 도감에 새로 올랐어요", to: null, snd: "chime", key: `donate:${f.id}` }; }
    case "fishRecord": { if (!a.up || !(a.medal >= 2) || !a.fish) return null; const m = MEDALS[a.medal];   // 은·금메달로 오를 때만(흔한 첫 기록은 조용히)
      return { tier: "medium", icon: m?.icon || "🏅", title: `${a.fish.name} ${m?.name ?? "메달"}!`, line: a.size ? `📏 ${a.size}cm 새 기록` : "📏 새 기록", to: null, snd: "chime", key: `medal:${a.fish.id}` }; }
    // 🗝 메인 스토리: 조각·고칠 곳·엔딩은 큰 카드(내 갈매폰 비밀 수첩으로 쏙), 별씨·엽서는 띠
    case "storyPiece": { const p = a.piece; if (!p) return null;
      return { tier: "big", icon: p.icon, kick: p.bonus ? "🗝 덤 조각 발견! 🗝" : "🗝 비밀 조각 발견! 🗝", title: p.title, line: a.text || p.text, to: "bag", snd: "fanfare", key: `story:${a.id}`, story: true, ms: RF_STORY_MS }; }
    case "storyRestore": { const r = a.restore; if (!r) return null;
      return { tier: "big", icon: r.icon, kick: "🔧 고쳤어요! 🔧", title: `${r.title} 완성!`, line: r.outro, to: null, snd: "fanfare", key: `storyFix:${r.id}`, story: true, ms: RF_STORY_MS }; }
    case "storyEnd":
      return { tier: "big", icon: "💌", kick: "🌟 이야기 완결 🌟", title: "보름의 답장", line: `🏮 등불지기 도장 · 🪑 ${josa(a.item?.name ?? "보름의 흔들의자", "을", "를")} 받았어요`, to: "bag", snd: "fanfare", key: "storyEnd", story: true, ms: RF_STORY_MS };
    case "storySeed": return { tier: "medium", icon: "🌟", title: `별씨 ${a.n ?? 1}/3`, line: "🗝 비밀 수첩에 모아 둬요", to: "bag", snd: "glint", key: "storySeed" };
    case "storyPostcard": return { tier: "medium", icon: "📮", title: "할머니 엽서가 왔어요", line: "🗝 비밀 수첩 → 엽서함", to: "bag", snd: "chime", key: `postcard:${a.key ?? ""}` };
    case "tax": case "lodging": { const n = Math.floor(a.total || 0); if (!(n > 0) || !world?.economy) return null;   // 금고로 들어오는 돈: 작게(마을 하루에 한 번씩이라 잦지 않지만 늘 들어오는 돈)
      return { tier: "small", icon: "🪙", n, title: `+${n}`, line: VIEW.adv ? (ev === "tax" ? "세금" : "숙박비") : "금고에 들어온 돈", to: "vault", snd: "coins", key: "vault" }; }
    default: return null;
  }
}
/** 이 이벤트들은 보상 화면이 알림을 맡음(알림 줄에는 안 띄우고 지난 알림에만 남김). small(세금·숙박비)은 알림 줄 한 줄도 그대로 */
export const REWARD_EVENTS = ["storyPiece", "storyRestore", "storyEnd", "storySeed", "storyPostcard", "sparkle", "stampBuy", "medalGift", "donateGift", "festivalEnd", "rank", "dailyDone", "bondStage", "wishDone", "fussSolved", "donate", "fishRecord", "tax", "lodging", "evolve", "giantMove"];

/** small 합치기: add(r, now) → 새로 띄울 것인지 합친 것인지. due(now) → 합치기가 끝나 날릴 것들 [{ to, n, icon, line }] */
export function makeSmallSum(win = RF_SUM_MS) {
  const open = new Map();
  return {
    open,
    add(r, now) { const k = r.to || "vault", p = open.get(k);
      if (p && now - p.t0 < win) { p.n += r.n || 0; if (r.line && !p.lines.includes(r.line)) p.lines.push(r.line); return { act: "merge", p }; }
      const q = { to: k, n: r.n || 0, icon: r.icon, lines: r.line ? [r.line] : [], t0: now }; open.set(k, q); return { act: "new", p: q }; },
    due(now) { const out = []; for (const [k, p] of open) if (now - p.t0 >= win) { open.delete(k); out.push({ to: p.to, n: p.n, icon: p.icon, line: p.lines.join(" · ") }); } return out; },
    clear() { open.clear(); },
  };
}
export const smallText = n => `+${Math.max(0, Math.round(n || 0))}`;

/** 띠·카드 차례. push(r) · step(now, { hold }) → { show: r | null, end: r | null }
 *  hold = 큰 카드를 지금 띄우면 안 됨(건설 모드·방 안·편지). 띄운 것은 cur, 끝나는 때는 cur.until(큰 카드는 collect로 앞당김) */
export function makeRewardQueue({ mediumMs = RF_MEDIUM_MS, bigMs = RF_BIG_MS, bigMin = RF_BIG_MIN_MS, gap = RF_GAP_MS, maxQ = RF_MAX_Q } = {}) {
  const q = []; let cur = null, freeAt = 0;
  const api = {
    get cur() { return cur; }, get q() { return q; },
    push(r) {
      if (!r || r.tier === "small") return false;
      const same = r.key && q.find(x => x.key === r.key && x.tier === r.tier);   // 같은 보상이 이어서 오면 하나로(×2)
      if (same) { same.count = (same.count || 1) + 1; return true; }
      q.push({ ...r, count: 1 });
      q.sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]);                    // 큰 카드가 먼저(같은 단계는 온 차례 — sort는 안정적)
      while (q.length > maxQ) { let i = q.map(x => x.tier).lastIndexOf("medium"); if (i < 0) i = q.length - 1; q.splice(i, 1); }   // 넘치면 맨 뒤 띠부터 버림
      return true;
    },
    /** 큰 카드 받기(누름). 너무 빨리 누르면(bigMin 전) 무시(force면 언제나) */
    collect(now, force = false) { if (!cur || cur.tier !== "big" || (!force && now - cur.t0 < bigMin)) return false; cur.until = now; return true; },   // force: 건설 모드·방에 들어가면 보이던 카드는 바로 받음
    step(now, { hold = false } = {}) {
      let end = null;
      if (cur && now >= cur.until) { end = cur; cur = null; freeAt = now + gap + (end.tier === "big" ? 380 : 0); }   // 큰 카드는 날아가는 동안 조금 더 비움
      if (!cur && now >= freeAt && q.length) {
        const i = hold ? q.findIndex(x => x.tier !== "big") : 0;                  // 기다리는 동안 큰 카드는 건너뛰고 띠만
        if (i >= 0) { cur = q.splice(i, 1)[0]; cur.t0 = now; cur.until = now + (cur.ms || (cur.tier === "big" ? bigMs : mediumMs)); return { show: cur, end }; }   // ms: 읽을 글이 긴 카드(이야기)는 더 오래
      }
      return { show: null, end };
    },
    clear() { q.length = 0; cur = null; freeAt = 0; },
  };
  return api;
}

/** 색종이 조각 자리(결정적: 같은 seed면 같은 모양 — 화면은 이것을 CSS 변수로). n개 { dx, dy, rot, delay, hue } (px·deg·ms) */
export function confetti(n = 24, seed = 1, spread = 220) {
  let s = seed >>> 0 || 1; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: n }, (_, i) => { const ang = (i / n) * Math.PI * 2 + r() * 0.5, d = spread * (0.55 + r() * 0.45);
    return { dx: Math.round(Math.cos(ang) * d), dy: Math.round(Math.sin(ang) * d * 0.8 - spread * 0.15), rot: Math.round(r() * 720 - 360), delay: Math.round(r() * 120), hue: [42, 8, 330, 200, 140, 270][i % 6] }; });
}
