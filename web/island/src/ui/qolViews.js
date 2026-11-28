// 찾아가기 편의(편의성 점검 5·6·7·10·12번): 순수 계산·HTML(DOM을 모름) → node --test로 시험. hud.js·main.js가 씀.
//  · 5: 알림(토스트·지난 알림)에 달 대상 — 이벤트 인자에서 갈매미 id · 건물 id를 꺼냄(누르면 따라가기 · 그 건물로)
//  · 6: 소원이 바라는 건물(「🔨 지으러 가기」로 그 건물을 고른 채 건설 모드)
//  · 7: 건물 찾기 목록(🏅 마을 앱): 줄을 누르면 그 건물로 + 카드
//  · 10: 놓을 가구가 없는 집 카드의 안내 + 바로가기(잡화점 · 도장 가게)
//  · 12: ☰ 메뉴 빠른 켜고 끄기(소리 · 배속) 글자
import { BUILDINGS } from "../data/catalog.js";
import { rankNeed } from "../world/rank.js";
import * as Fu from "../world/furniture.js";

const qvEsc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const qvRo = word => { const t = String(word), c = t.charCodeAt(t.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0 && c % 28 !== 8 ? "으로" : "로"; };   // 「(으)로」(appViews.avRo와 같은 규칙)
const qvIsUnit = o => !!o && typeof o === "object" && o.unitId != null;
const qvIsBld = o => !!o && typeof o === "object" && o.unitId == null && o.defId != null && o.id != null;

// ---- 5. 알림 대상
/** 이벤트 인자 → { u: 갈매미 id } | { b: 건물 id } | null. 갈매미가 있으면 갈매미가 먼저(병·품삯·소원은 그 갈매미에게 가는 게 할 일), 없으면 건물.
 *  친구 소식(friendship: a·b가 둘 다 갈매미)은 a. unitAdded처럼 인자가 갈매미 자체여도 됨 */
export function noteTarget(arg) {
  if (!arg || typeof arg !== "object") return null;
  if (qvIsUnit(arg)) return { u: arg.unitId };
  if (qvIsBld(arg)) return { b: arg.id };
  for (const k of ["u", "a", "buyer", "seller"]) if (qvIsUnit(arg[k])) return { u: arg[k].unitId };
  if (qvIsBld(arg.b)) return { b: arg.b.id };
  if (arg.s?.k === "story" && Number.isInteger(arg.x) && Number.isInteger(arg.z)) return { x: arg.x, z: arg.z };   // 🗝 이야기 반짝이: 누르면 그 칸으로
  if (arg.go && Number.isFinite(arg.go.x) && Number.isFinite(arg.go.z)) return { x: Math.round(arg.go.x), z: Math.round(arg.go.z) };   // 🗝 이야기 장소(등대·동굴)
  return null;
}
/** 알림 대상 → 글자 열쇠("u:3" · "b:12")와 그 반대(지난 알림 줄의 data-at) */
export const atKey = at => at ? (at.u != null ? `u:${at.u}` : at.b != null ? `b:${at.b}` : at.x != null ? `p:${at.x},${at.z}` : "") : "";
export function atParse(s) {
  const p = /^p:(-?\d+),(-?\d+)$/.exec(String(s || "")); if (p) return { x: +p[1], z: +p[2] };   // 칸 자리(이야기 반짝이)
  const m = /^([ub]):(.+)$/.exec(String(s || "")); if (!m) return null;
  const v = /^\d+$/.test(m[2]) ? +m[2] : m[2]; return m[1] === "u" ? { u: v } : { b: v };
}
/** 대상 이름(누르면 어디로 가는지 알려 주는 짧은 글) */
export function atLabel(w, at) {
  if (at?.u != null) { const u = w.units.find(o => o.unitId === at.u); return u ? `${u.name} 따라가기` : ""; }
  if (at?.b != null) { const b = w.buildings.get(at.b); if (!b) return ""; const n = BUILDINGS[b.defId]?.name ?? "건물"; return `${n}${qvRo(n)} 가기`; }
  if (at?.x != null) return "그곳으로 가기";
  return "";
}

// ---- 6. 소원이 바라는 건물
/** 소원 id → 지으면 들어주는(또는 들어주는 데 꼭 필요한) 건물 */
export const WISH_BUILD = { market: "market", field: "field", dock: "dock", stairs: "stairs", houses: "house", home: "house", neighbor: "house",
  storehouse: "storehouse", cafe: "cafe", lamp: "streetlamp", bench: "bench", power: "windmill", giant: "giantHouse", festival: "bunting" };
/** 지금 「🔨 지으러 가기」를 보일 건물 id(등급이 모자라거나 지어 줄 갈매미가 없으면 null — 눌러도 못 지으니까).
 *  친구 소원은 집이 모자라 못 부를 때만 집 */
export function wishBuildId(w, wish) {
  let id = WISH_BUILD[wish?.id];
  if (wish?.id === "friend" && w.summonInfo?.().needHouse) id = "house";
  const def = id && BUILDINGS[id]; if (!def) return null;
  if (rankNeed(def) > (w.rank || 0)) return null;
  if (w.builderFor && !w.builderFor(def)) return null;
  if (def.winterOnly && w.season !== "winter") return null;
  return id;
}

// ---- 7. 건물 찾기
export const FIND_GROUPS = [["home", "🏠 집"], ["shop", "🏪 가게·시설"], ["land", "🌾 밭·바다·창고"], ["deco", "🏮 장식"]];
/** 건물 → 찾기 묶음(다리·계단은 목록에서 뺌: 칸마다 하나라 너무 많고, 찾아갈 일이 드묾) */
export function findGroupOf(def) {
  if (!def || def.bridge || def.id === "bridge" || def.id === "stairs") return null;
  if (def.house) return "home";
  if (def.deco || def.festive) return "deco";
  if (def.field || def.dock || def.storehouse || def.id === "pier") return "land";
  return "shop";
}
/** 건물 찾기 줄: [{ id, group, name, sub }] — 묶음 차례 → 이름 차례 */
export function bldFinderRows(w) {
  const order = Object.fromEntries(FIND_GROUPS.map(([g], i) => [g, i])), rows = [];
  for (const b of w.buildings.values()) {
    const def = BUILDINGS[b.defId], g = findGroupOf(def); if (!g) continue;
    const done = w.isDone ? w.isDone(b) : true, owner = def.house && b.owner != null ? w.units.find(u => u.unitId === b.owner) : null;
    const sub = !done ? "🚧 공사 중" : def.house ? (owner ? `주인 ${owner.name}` : "빈 집") : "";
    rows.push({ id: b.id, group: g, name: def.name, sub });
  }
  return rows.sort((a, b) => order[a.group] - order[b.group] || a.name.localeCompare(b.name, "ko") || String(a.id).localeCompare(String(b.id), "en", { numeric: true }));
}
/** 건물 찾기 HTML(마을 앱 접기 안): 줄 = 단추(data-goto = 건물 id) */
export function bldFinderHtml(rows) {
  if (!rows.length) return `<p class="dim">아직 지은 건물이 없어요. 🔨 건설에서 지어 보세요.</p>`;
  let html = "", g = null;
  for (const r of rows) {
    if (r.group !== g) { if (g) html += `</div>`; g = r.group; html += `<h5 class="bf-h">${FIND_GROUPS.find(x => x[0] === g)[1]}</h5><div class="bf-list">`; }
    html += `<button class="bf-row" data-goto="${qvEsc(r.id)}"><span class="nm">${qvEsc(r.name)}</span>${r.sub ? `<span class="act">${qvEsc(r.sub)}</span>` : ""}</button>`;
  }
  return html + `</div><p class="dim">줄을 누르면 그 건물로 가서 카드를 열어요.</p>`;
}

// ---- 10. 가구가 없는 집
/** 이 집에 놓을 가구가 있나(그 집 창고 + 마을 가방) */
export const hasFurniture = (w, b) => Object.keys(Fu.available(w, b)).length > 0;
/** 집 카드 안내: 놓을 가구가 있으면 null. 없으면 안내 한 줄 + 바로가기(다 지은 잡화점이 있으면 🛍 잡화점으로 · 🏵 도장 가게) */
export function furniGuideHtml(w, b) {
  if (hasFurniture(w, b)) return null;
  const shop = w.shopB?.();
  return `<p class="fg-line">🛋 놓을 가구가 없어요 · <b>가구는 잡화점·도장 가게에서</b></p>` +
    `<p class="dim fg-sub">${shop ? "집주인이 돈이 모이면 잡화점에서 사 와요." : "잡화점은 마을 등급 ⚓ 항구 마을부터 지어요."} 들어가면 바닥·벽지는 바꿀 수 있어요.</p>` +
    `<div class="fg-btns">${shop ? `<button data-act="shop" data-id="${qvEsc(shop.id)}">🛍 잡화점 보기</button>` : ""}<button data-act="stamp">🏵 도장 가게</button></div>`;
}

// ---- 12. ☰ 빠른 켜고 끄기
/** 소리·배속 단추 글자. 배속은 유료판일 때만(무료판이면 null = 숨김) */
export function quickLabels({ soundOn, paid, speed }) {
  return { sound: soundOn ? "🔊 소리: 켬" : "🔇 소리: 끔", speed: paid ? `⏩ 배속 ×${speed || 1}` : null };
}
