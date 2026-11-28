// 건설 모드 '🌳 자연·지형' 도구의 글(순수: DOM·three를 모름 → node 시험 가능). tools.js·hud.js가 씀.
//  · NATURE_TOOLS: 트레이 카드(묶음 · 아이콘 · 이름 · 하는 일)
//  · natureCard: 카드 아래 글(값 🪙n · 한도 n/N · 섬에 없으면 '이 섬에는 없어요')
//  · natureHover: 고스트 미리보기(dry) 결과 → 상태 줄 한 줄('🌳 나무 심기 · 🪙2 · 금고 60 → 58' 또는 까닭)
//  · strokeText / undoText / redoText: 한 번 누르기(또는 한 획)·되돌리기·다시하기 뒤의 상태 줄
//  · moveInfo / moveHtml: 지형지물 옮기기 확인창(#cfInfo)
import * as CU from "../world/customize.js";
import { fmtNum } from "./hudParts.js";
import { josa } from "../util.js";

const nvEsc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nvCoin = n => `🪙${fmtNum(n)}`;

/** 트레이 카드. arg = tools.setMode("nature", arg)의 arg. op = 월드 일(값을 찾는 열쇠), kind = 값표 종류 */
export const NATURE_TOOLS = [
  { arg: "auto", group: "plant", icon: "🌳", name: "나무", op: "place", kind: "tree", verb: "심기", tip: "잔디와 흙에 나무를, 모래에는 야자수를 심어요. 묘목부터 자라요" },
  { arg: "palm", group: "plant", icon: "🌴", name: "야자수", op: "place", kind: "palm", verb: "심기", tip: "모래와 잔디에 야자수를 심어요. 묘목부터 자라요" },
  { arg: "beachRock", group: "plant", icon: "🪨", name: "바위", op: "place", kind: "beachRock", verb: "놓기", tip: "보기 좋은 바닷가 바위" },
  { arg: "ore", group: "plant", icon: "⛏", name: "광석", op: "place", kind: "ore", verb: "놓기", tip: "광석 바위. 한참 지나야 캘 수 있어요" },
  { arg: "bush", group: "plant", icon: "🌿", name: "덤불", op: "place", kind: "bush", verb: "놓기", tip: "덤불은 길을 막지 않아요" },
  { arg: "flower", group: "plant", icon: "🌸", name: "꽃", op: "place", kind: "flower", verb: "놓기", tip: "꽃은 길을 막지 않아요" },
  { arg: "clear", group: "clear", icon: "🪓", name: "치우기", op: "remove", kind: "tree", verb: "치우기", tip: "누른 칸의 나무나 바위, 덤불을 치워요. 재료는 안 나와요" },
  { arg: "dig", group: "land", icon: "🕳", name: "파기", op: "dig", kind: "", verb: "파기", tip: "땅을 파서 연못이나 물길을 내요. 공짜예요" },
  { arg: "fill", group: "land", icon: "🏖", name: "메우기", op: "fill", kind: "", verb: "메우기", tip: "얕은 물을 모래땅으로 메워요. 공짜예요" },
  { arg: "move:cave", group: "move", icon: "🦇", name: "동굴", op: "move", kind: "cave", verb: "옮기기", tip: "동굴을 다른 자리로 옮겨요. ↻로 입구 방향을 돌려요" },
  { arg: "move:lighthouse", group: "move", icon: "🗼", name: "등대", op: "move", kind: "lighthouse", verb: "옮기기", tip: "등대를 바닷가 다른 자리로" },
  { arg: "move:pier", group: "move", icon: "🛶", name: "부두", op: "move", kind: "pier", verb: "옮기기", tip: "부두를 다른 바닷가로", onlyIf: true },
  { arg: "move:breakwater", group: "move", icon: "🌊", name: "방파제", op: "move", kind: "breakwater", verb: "옮기기", tip: "방파제를 다른 자리로", onlyIf: true },
];
export const NATURE_GROUPS = [["plant", "심기·놓기"], ["clear", "치우기"], ["land", "땅"], ["move", "옮기기"]];
export const natureTool = arg => NATURE_TOOLS.find(t => t.arg === arg) || null;
/** arg → 무엇을 하나: { kind: "place"|"decor"|"clear"|"dig"|"fill"|"move", what } */
export function natureAction(arg) {
  if (arg === "clear") return { kind: "clear" };
  if (arg === "dig" || arg === "fill") return { kind: arg };
  if (typeof arg === "string" && arg.startsWith("move:")) return { kind: "move", what: arg.slice(5) };
  if (CU.DECOR.includes(arg)) return { kind: "decor", what: arg };
  return { kind: "place", what: arg };
}
/** 이 섬의 트레이에 보일 카드: 부두·방파제는 섬에 있을 때만(넓은 섬에는 없음), 동굴·등대는 늘 보이고 없으면 꺼짐 */
export const natureToolsFor = info => NATURE_TOOLS.filter(t => !t.onlyIf || info.landmarks?.includes(t.kind));

/** 카드 아래 글: { meta, off, why }. info = world.customInfo() */
export function natureCard(t, info) {
  const cost = t.op === "dig" || t.op === "fill" ? info.costs?.[t.op] ?? 0 : info.costs?.[t.op]?.[t.kind] ?? 0;
  const money = info.economy && cost ? nvCoin(cost) : "";   // 값이 0(파기·메우기)이면 「무료」
  if (t.op === "move" && !info.landmarks?.includes(t.kind)) return { meta: "이 섬에는 없어요", off: true, why: "이 섬에는 없어요", cost };
  const lim = t.op !== "place" ? "" : t.kind === "tree" || t.kind === "palm" ? `${info.trees}/${info.treeMax}` : t.kind === "ore" ? `${info.ores}/${info.oreMax}`
    : t.kind === "beachRock" ? `${info.rocks}/${info.rockMax}` : `${info.decor}/${info.decorMax}`;
  const meta = [money, lim].filter(Boolean).join(" · ") || (t.op === "move" ? "옮기기" : "무료");
  return { meta, off: false, why: "", cost, short: info.economy && cost > info.vault };
}

/** 고스트 미리보기 결과 → 상태 줄 한 줄. r = 월드 일의 dry 결과(digCells/fillCells는 묶음 결과), vault = 지금 금고, eco = 경제 있음 */
export function natureHover(arg, r, vault, eco = true) {
  const a = natureAction(arg), t = natureTool(arg);
  if (!r) return "";
  if (!r.ok) return `🚫 ${r.reason || "여기에는 못 해요"}`;
  const money = c => eco && c ? ` · ${nvCoin(c)} · 금고 ${nvCoin(vault)} → ${nvCoin(vault - c)}` : "";
  if (a.kind === "place") { const kind = r.kind || a.what, icon = kind === "palm" ? "🌴" : t?.icon ?? "🌳"; return `${icon} ${CU.NAMES[kind] ?? t?.name} ${t?.verb ?? "놓기"}${money(r.cost)}`; }
  if (a.kind === "decor") return `${t.icon} ${t.name} 놓기${money(r.cost)}`;
  if (a.kind === "clear") { const k = r.module?.defId || r.kind || (r.was && r.was !== "seed" ? r.was.k : null); return `🪓 ${k ? CU.NAMES[k] : "덤불·풀"} 치우기${money(r.cost)}`; }
  if (a.kind === "dig" || a.kind === "fill") {
    const n = r.done ?? 1, skip = (r.skipped || []).length;
    return `${t.icon} ${n}칸 ${t.verb}${money(r.cost)}${skip ? `. ${skip}칸은 못 해요: ${r.skipped[0].reason}` : ""}`;
  }
  if (a.kind === "move") return `${t.icon} ${t.name} 여기로 옮기기${money(r.cost)} · 🚚 옮기기를 누르면 옮겨요`;
  return "";
}

/** 한 번 누르기(또는 한 획) 뒤: done = 된 수, cost = 낸 값, fail = 마지막 실패 까닭, kinds = 실제로 놓은 종류(나무 auto → tree/palm), vault = 낸 뒤 금고 */
export function strokeText(arg, { done = 0, cost = 0, fail = "", kinds = [] } = {}, vault = 0, eco = true) {
  const a = natureAction(arg), t = natureTool(arg);
  if (!done) return fail ? `🚫 ${fail}` : "";
  let head;
  if (a.kind === "move") head = `${t.icon} ${josa(CU.NAMES[a.what], "을", "를")} 옮겼어요`;
  else if (a.kind === "clear" || a.kind === "dig" || a.kind === "fill") head = `${t.icon} ${done}칸을 ${{ clear: "치웠어요", dig: "팠어요", fill: "메웠어요" }[a.kind]}`;
  else {
    const palms = kinds.filter(k => k === "palm").length, what = a.kind === "place" && kinds.length ? (palms === kinds.length ? "palm" : palms ? "mix" : kinds[0]) : a.what === "auto" ? "tree" : a.what;
    const name = what === "mix" ? "나무·야자수" : CU.NAMES[what], tree = what === "tree" || what === "palm" || what === "mix";
    head = `${what === "palm" ? "🌴" : t.icon} ${josa(`${name} ${done}${tree ? "그루" : "개"}`, "을", "를")} ${tree ? "심었어요" : "놓았어요"}`;
  }
  const money = eco && cost ? ` · ${nvCoin(cost)} → 금고 ${nvCoin(vault)}` : "";
  return `${head}${money}${fail ? ` · 못 한 곳: ${fail}` : ""} · ↶ 되돌리기`;
}
/** 되돌리기 뒤: refund = 돌려받은 값, fails = 못 되돌린 까닭 목록, cells = 칸 되돌리기 수(높이 도구) */
export function undoText({ n = 0, refund = 0, fails = [], paid = 0 } = {}) {
  if (!n && fails.length) return `🚫 ${fails[0]}`;
  const back = refund ? ` · ${nvCoin(refund)} 돌려받음` : "", pay = paid ? ` · 땅↔물 ${nvCoin(paid)}` : "";
  return `↶ ${n > 1 ? `${n}번 ` : ""}되돌렸어요${back}${pay}${fails.length ? `. ${fails.length}곳은 못 되돌렸어요: ${fails[0]}` : ""}`;
}
export function redoText({ n = 0, cost = 0, fails = [] } = {}) {
  if (!n && fails.length) return `🚫 ${fails[0]}`;
  return `↷ ${n > 1 ? `${n}번 ` : ""}다시 했어요${cost ? ` · ${nvCoin(cost)}` : ""}${fails.length ? `. ${fails.length}곳은 못 했어요: ${fails[0]}` : ""}`;
}

/** 옮기기 확인창 정보. r = moveLandmark(…, { dry: true }) 결과 */
export function moveInfo(w, defId, r) {
  const eco = !!w.economy, vault = Math.floor(w.bank?.vault || 0), cost = eco ? (r?.cost ?? w.customCost("move", defId)) : 0;
  const t = natureTool(`move:${defId}`);
  return { name: CU.NAMES[defId], icon: t?.icon ?? "", eco, cost, vault, after: vault - cost, ok: !!r?.ok, reason: r?.ok ? "" : r?.reason || "", moneyShort: eco && !r?.ok && !!r?.short, cave: defId === "cave" };
}
export function moveHtml(info) {
  const nw = t => `<span class="cf-nw">${t}</span>`;
  const main = `<b>${info.icon} ${nvEsc(info.name)} 옮기기</b>` + (info.eco ? ` · ${nw(`<b>${nvCoin(info.cost)}</b>`)} · ${nw(`금고 ${nvCoin(info.vault)}${info.ok ? ` → <b>${nvCoin(info.after)}</b>` : ""}`)}` : "");
  const why = info.moneyShort ? `금고가 ${nvCoin(info.cost - info.vault)} 모자라요` : nvEsc(info.reason);
  const bad = info.ok ? "" : `<div class="cf-bad"><b>🚫 못 옮겨요</b> · ${why}</div>`;
  const sub = `${info.cave ? `${nw("↻ 돌리기로 입구 방향을 바꿔요")} · ` : ""}${nw(info.eco && info.cost ? "↶ 되돌리면 낸 값을 돌려받아요" : "↶ 되돌릴 수 있어요")}`;   // 구절째 다음 줄로(넓은 화면에서 「요」 한 글자만 둘째 줄에 남던 것)
  return `<div class="cf-main">${main}</div>${bad}<div class="cf-sub">${sub}</div>`;
}
