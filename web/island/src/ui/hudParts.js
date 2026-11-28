// 화면 공통 부품(순수: DOM을 모름 → node 시험 가능). 갈매폰 앱·카드·위쪽 상태 줄이 같이 씀.
//  · sumHead: 핵심 요약 머리 — 큰 아이콘 + 큰 숫자 + 굵은 한 줄 + 진행 막대. 상태 색은 data-tone 하나(ok|low|empty|warn), 색만으로 알리지 않게 글 앞에 이모지도.
//  · moreBox: 자세히 보기 접기 <details class="more">. 펼침 상태는 부르는 쪽(hud.js의 Map)이 open으로 넘김(5Hz로 다시 그려도 펼친 채).
//  · valueRows: 값 표(큰 값 먼저, 0인 줄은 .zero로 흐리게).
//  · vaultChipOf · townChipOf · tempChipOf: 위쪽 상태 줄의 🏦 내 금고 · 🪙 마을 돈 · 🌡 기온 글자와 색 상태(화면 꼴마다 길이가 다름).
import { COMFORT_LO, COMFORT_HI } from "../world/climate.js";
import { BUILDINGS } from "../data/catalog.js";

const partEsc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/** 천 단위 쉼표(정수로 내림): 1234 → "1,234" */
export const fmtNum = n => Math.floor(Number(n) || 0).toLocaleString("ko-KR");
/** 휴대폰 위쪽 줄용 짧은 수: 쉼표 없이(9999까지), 1만부터는 "1.2만" */
export const fmtShort = n => { const v = Math.floor(Number(n) || 0); return Math.abs(v) < 10000 ? String(v) : `${(v / 10000).toFixed(1).replace(/\.0$/, "")}만`; };
/** 상태 색마다 글 앞에 붙는 이모지(색을 못 보는 사람도 알게) */
export const TONE_ICON = { ok: "✅", low: "⚠️", empty: "🚨", warn: "⚠️" };

/** 핵심 요약 머리. icon·big·label·line은 글자(태그로 읽히지 않게 바꿈), lineHtml은 이미 만든 HTML(색 숫자 등).
 *  bar: 0~1(없으면 막대 없음) · tone: ok|low|empty|warn(없으면 보통) · toneText: 상태 낱말("얼마 안 남음") — 이모지와 함께 줄 앞에 */
export function sumHead({ icon = "", big = "", label = "", line = "", lineHtml = "", bar = null, tone = null, toneText = "" } = {}) {
  const t = tone && TONE_ICON[tone] ? tone : null;
  const lead = t && toneText ? `<b class="sum-tone">${TONE_ICON[t]} ${partEsc(toneText)}</b>` : "";
  const body = lineHtml || partEsc(line);
  const ln = lead || body ? `<div class="sum-line">${lead}${lead && body ? " · " : ""}${body}</div>` : "";
  const pct = Number.isFinite(bar) ? Math.round(Math.max(0, Math.min(1, bar)) * 100) : null;
  const br = pct === null ? "" : `<div class="rbar sum-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`;
  return `<div class="sum"${t ? ` data-tone="${t}"` : ""}>${icon ? `<span class="sum-ico" aria-hidden="true">${partEsc(icon)}</span>` : ""}<div class="sum-main">` +
    `<div class="sum-top"><b class="sum-big">${partEsc(big)}</b>${label ? `<span class="sum-lab">${partEsc(label)}</span>` : ""}</div>${ln}${br}</div></div>`;
}

/** 자세히 보기 접기. key: 펼침을 기억하는 열쇠(data-more) · title: 요약 줄 글자 · html: 안쪽(이미 만든 HTML) · note: 요약 줄 오른쪽 작은 글(개수 등) */
export function moreBox(key, title, html, { open = false, note = "" } = {}) {
  return `<details class="more" data-more="${partEsc(key)}"${open ? " open" : ""}><summary><span class="more-t">${partEsc(title)}</span>` +
    `${note !== "" ? `<span class="more-n">${partEsc(note)}</span>` : ""}</summary><div class="more-b">${html}</div></details>`;
}

/** 값 표: rows = [[이름, 값], …] 또는 [[이름, 값, 보여 줄 글자]]. 값의 크기(절댓값) 큰 순, 0인 줄은 맨 아래로 흐리게 */
export function valueRows(rows, { fmt = fmtNum } = {}) {
  const list = rows.map((r, i) => ({ name: r[0], v: Number(r[1]) || 0, txt: r[2], i }))
    .sort((a, b) => (Math.abs(b.v) - Math.abs(a.v)) || (a.i - b.i));
  return `<table class="tbl vrows">${list.map(r => `<tr${r.v === 0 ? ` class="zero"` : ""}><td>${partEsc(r.name)}</td><td>${partEsc(r.txt ?? fmt(r.v))}</td></tr>`).join("")}</table>`;
}

const phoneOf = form => form === "portrait" || form === "landscape";
/** 🏦 내 금고 칩. bank: { vault, owed } · state: world.vaultState()(ok|low|empty) · economy가 없으면(예전 섬) 🪙 창고 동전.
 *  돌려줌 { text, tone, tip } — 휴대폰은 아이콘+숫자, 태블릿은 "금고", PC는 "내 금고"에 상태 낱말까지 */
export function vaultChipOf({ economy = true, vault = 0, owed = 0, state = "ok", coins = 0 } = {}, form = "wide") {
  if (!economy) return { text: `🪙 ${fmtNum(coins)}`, tone: null, tip: "가진 동전. 누르면 🏦 은행" };
  const tone = state === "empty" || state === "low" ? state : "ok", n = fmtNum(vault), wage = owed > 0 ? "💸" : "";
  const word = tone === "empty" ? "바닥" : tone === "low" ? "얼마 안 남음" : "";
  const mark = tone === "empty" ? "🚨" : tone === "low" ? "⚠️" : "";
  let text;
  if (phoneOf(form)) text = `🏦${fmtShort(vault)}${mark}${wage}`;
  else if (form === "medium") text = `🏦 금고 ${n}${mark ? " " + mark : ""}${wage ? " " + wage : ""}`;
  else text = `🏦 내 금고 ${n}${word ? ` ${mark} ${word}` : ""}${wage ? " " + wage : ""}`;
  const tip = `내 금고 🪙${n}${word ? ` · ${word}` : ""}${owed > 0 ? ` · 밀린 품삯 🪙${fmtNum(owed)}` : ""} · 누르면 🏦 은행`;
  return { text, tone, tip };
}
/** 🪙 마을 돈 칩(갈매미들이 가진 돈 합계 — 내 돈이 아님): 휴대폰 아이콘+숫자, 그 밖엔 "마을 돈" */
export const townChipOf = (supply, form = "wide") => phoneOf(form) ? `🪙${fmtShort(supply)}` : `🪙 마을 돈 ${fmtNum(supply)}`;
/** 기온 → 색 상태: 4°C 이하 cold(파랑) · 24°C 이상 hot(주황) · 그 밖 null */
export const TEMP_COLD = 4, TEMP_HOT = 24;
export const tempToneOf = air => air <= TEMP_COLD ? "cold" : air >= TEMP_HOT ? "hot" : null;
/** 🌡 기온(날씨 칩 안): 휴대폰 "3°" · 태블릿·PC "3°C"(날씨 이름 뒤라 🌡 없이도 기온으로 읽힘 — 한 줄에 들어가게). 반올림, 음수는 진짜 빼기표(−) */
export function tempChipOf(air, form = "wide") {
  const r = Math.round(Number.isFinite(air) ? air : 15), s = r < 0 ? `−${-r}` : String(r);
  return { text: phoneOf(form) ? `${s}°` : `${s}°C`, tone: tempToneOf(r) };
}
/** 날씨 칩을 눌렀을 때 덧붙는 기온 한 줄: 바깥 · 집 안 · 춥거나 더울 때 옷 없는 갈매미 수 */
export function tempNote(air, indoor, units = []) {
  const s = v => { const r = Math.round(v); return r < 0 ? `−${-r}` : String(r); };
  const bare = units.filter(u => !(u.clothes && u.clothes.length)).length;
  const feel = air < COMFORT_LO ? `🥶 쌀쌀해요${bare ? ` · 옷 없는 갈매미 ${bare}마리` : ""}` : air > COMFORT_HI ? "🥵 더워요" : "😊 지내기 좋아요";
  return `🌡 바깥 ${s(air)}° · 집 안 ${s(indoor)}° · ${feel}`;
}
/** 한눈 칸 줄(요약 머리 바로 밑): items = [{ icon, text, tone }](null은 건너뜀). tone low|empty|warn이면 경고색 + 글 앞 ⚠️/🚨(색만으로 알리지 않게), ok는 초록 */
export function factRow(items) {
  const list = items.filter(Boolean);
  if (!list.length) return "";
  return `<div class="facts">${list.map(f => { const t = f.tone && TONE_ICON[f.tone] ? f.tone : null, mark = t && t !== "ok" ? `${TONE_ICON[t]} ` : "";
    return `<span class="fact"${t ? ` data-tone="${t}"` : ""}>${mark}${f.icon ? `${partEsc(f.icon)} ` : ""}${partEsc(f.text)}</span>`; }).join("")}</div>`;
}

/** 배고파요 칩 글: 손쓸 일 하나만(시장을 지으면 갈매미가 거기서 먹음) */
export const HUNGER_CHIP = "😣 시장을 지으면 배불러요";
/** 배고파요 칩을 띄울 갈매미(가장 배고픈 한 마리) 또는 null. 다 지은 시장·저장고가 있으면 띄우지 않음: 갈매미가 알아서 먹으러 가니 고칠 일이 없는 경고 */
export function hungerCall(w, limit) {
  for (const b of w.buildings.values()) { const d = BUILDINGS[b.defId]; if ((d?.market || d?.storehouse) && w.isDone(b)) return null; }
  return w.units.filter(u => (u.full ?? 80) < limit).sort((a, b) => a.full - b.full)[0] || null;
}

