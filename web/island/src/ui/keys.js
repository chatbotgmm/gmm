// 키보드·포인터 층: Esc 한 단계씩 닫기, 열린 창 뒤로 게임 키가 새지 않게, 새 단축키, 입력 장치(터치·마우스) 표시, 키 힌트, 툴팁.
// 창(window)의 capture 단계에서 먼저 받으므로 tools.js·main.js·room.js의 키 처리보다 앞섬. 키는 언제나 e.code(한글 입력 상태에서도 같은 자리).

/** 단축키 표(한곳에서 정의 → 버튼 키 힌트 · 툴팁 · 도움말 표가 모두 이 표를 읽음). sel = 누르면 대신 눌러 줄 버튼, app = 갈매폰 앱 */
export const KEY_LIST = [
  { code: ["Digit1", "Numpad1"], key: "1", what: "✓ 건설 모드 끝내기", sel: '#tools [data-mode="view"]' },
  { code: ["Digit2", "Numpad2"], key: "2", what: "🖌 바닥 칠하기", sel: '#tools [data-mode="paint"]' },
  { code: ["Digit3", "Numpad3"], key: "3", what: "⛰ 높이", sel: '#tools [data-mode="height"]' },
  { code: ["Digit4", "Numpad4"], key: "4", what: "🏠 건물 짓기", sel: '#tools [data-mode="build"]' },
  { code: ["Digit5", "Numpad5"], key: "5", what: "🧹 철거", sel: '#tools [data-mode="demolish"]' },
  { code: ["Digit6", "Numpad6"], key: "6", what: "🌳 자연·지형", sel: '#tools [data-mode="nature"]' },
  { code: ["KeyP"], key: "P", what: "📱 갈매폰 열기·닫기", sel: "#phoneBtn" },
  { code: ["KeyM"], key: "M", what: "🗺 미니맵 켜기·끄기", sel: "#mapBtn" },
  { code: ["KeyJ"], key: "J", what: "💭 소원 · 오늘의 부탁", app: "wish" },
  { code: ["KeyN"], key: "N", what: "📰 소식지", app: "news" },
  { code: ["KeyK"], key: "K", what: "💞 관계도", app: "rel" },
  { code: ["KeyL"], key: "L", what: "📖 도감 · 가방", app: "dex" },
  { code: ["KeyH", "F1"], key: "H", what: "❓ 도움말 · 단축키", app: "help" },
  { code: ["KeyZ"], key: "Z", what: "⟲ 건설 모드: 화면을 왼쪽으로 90° 돌리기", sel: "#viewL" },
  { code: ["KeyX"], key: "X", what: "⟳ 건설 모드: 화면을 오른쪽으로 90° 돌리기", sel: "#viewR" },
  { code: ["KeyG"], key: "G", what: "▦ 건설 모드: 칸 격자선 켜기·끄기", sel: "#gridBtn" },
];
/** 원래 있던 키(뜻은 그대로) — 도움말 표에만 */
const KEY_KEEP_LIST = [
  ["W A S D · 방향키", "화면 옮기기 (Shift = 빠르게)"], ["Q / E", "카메라 내리기 · 올리기"], ["Space + 끌기", "화면 돌리기(건설 모드에서는 옮기기) · 입질(❗) 때는 🎣 당기기"],
  ["R", "건물·가구 돌리기"], ["Enter", "정한 자리에 건설"], ["[ ]", "붓 크기"], ["Ctrl+Z", "되돌리기"], ["Ctrl+Shift+Z · Ctrl+Y", "다시하기"],
  ["Esc", "한 단계씩 닫기(창 → 페이지 → 카드 → 도구 끄기) · 닫을 게 없으면 ☰ 메뉴"], ["Delete", "방에서 고른 가구 치우기"], ["Tab", "버튼 사이 옮기기 (Enter·Space로 누르기)"],
];
/** 버튼에 붙이는 작은 키 힌트(마우스로 할 때만 보임) */
const KEY_HINTS = [['#tools [data-mode="view"]', "1"], ['#tools [data-mode="paint"]', "2"], ['#tools [data-mode="height"]', "3"], ['#tools [data-mode="build"]', "4"], ['#tools [data-mode="demolish"]', "5"], ['#tools [data-mode="nature"]', "6"],
  ["#phoneBtn", "P"], ["#mapBtn", "M"], ["#cfBuild", "Enter"], ["#cfRot", "R"], ["#cfCancel", "Esc"], ["#tugBtn", "Space"], ["#phoneClose", "Esc"], ["#letterClose", "Esc"], ["#menuBtn", "Esc"], ["#viewL", "Z"], ["#viewR", "X"], ["#gridBtn", "G"]];
const KEY_OVERLAYS = ["ask", "letter", "phone"];                            // 위에 뜬 것부터(확인창 > 편지 > 갈매폰 시트 — 도감·메뉴도 이 안)
const KEY_CONTROL_SEL = "button, a[href], summary, select, [role=button]";

/** main.js가 한 번 부름. hud·tools·roomView는 읽기만 하고, 동작은 기존 버튼·메서드를 그대로 부름 */
export function installKeys({ hud, tools, roomView }) {
  const root = document.documentElement, $ = id => document.getElementById(id);
  // ---- 입력 장치: html[data-input="touch|mouse"]. 처음엔 화면 종류로, 그 뒤엔 마지막 입력으로(0.8초 안의 되바꿈은 무시 → 깜빡임 없음)
  let inputAt = 0, lastKey = false;
  const setInput = v => { if (root.dataset.input === v) return; const now = performance.now(); if (now - inputAt < 800) return; inputAt = now; root.dataset.input = v; if (v === "touch") hideTip(); };
  root.dataset.input = matchMedia("(pointer: coarse)").matches ? "touch" : "mouse";
  // 표시 바꾸기는 손을 뗀 뒤에(click이 끝난 다음): 누르는 순간 바꾸면 키 힌트가 사라지며 칩이 옆으로 밀려, 키를 쓰다가 처음 누른 칩 대신 옆 칩이 눌림
  let inputNext = null;
  addEventListener("pointerdown", e => { lastKey = false; inputNext = e.pointerType === "mouse" ? "mouse" : "touch"; hideTip(); }, true);
  for (const ev of ["pointerup", "pointercancel"]) addEventListener(ev, () => { const v = inputNext; inputNext = null; if (v) setTimeout(() => setInput(v), 0); }, true);

  // ---- 키 힌트: 버튼 끝에 작은 <span class="kbd">(터치에서는 CSS가 숨김)
  for (const [sel, k] of KEY_HINTS) { const b = document.querySelector(sel); if (!b || b.querySelector(".kbd")) continue; const s = document.createElement("span"); s.className = "kbd"; s.textContent = k; s.setAttribute("aria-hidden", "true"); b.append(s); b.dataset.kbd = k; }
  const kbdOf = el => el?.dataset?.kbd || "";
  // 칩·도구 막대는 글자가 바뀌어 힌트를 못 붙이는 곳 → 툴팁에 키를 적음
  const tipDefault = (sel, t) => { const b = document.querySelector(sel); if (b && !b.dataset.tip && !b.title) b.dataset.tip = t; };
  tipDefault("#chipWish", "갈매미의 소원 · 오늘의 부탁 (J)"); tipDefault("#phoneBtn", "갈매폰: 소원·갈매미·소식지·도감과 마을 앱");
  for (const [sel] of KEY_HINTS.slice(0, 5)) { const b = document.querySelector(sel); if (b) b.dataset.tip = b.getAttribute("aria-label") || ""; }   // 도구 버튼: 이름 (숫자)

  // ---- 열린 창
  const topOverlay = () => KEY_OVERLAYS.map($).find(el => el && !el.hidden) || null;
  for (const id of KEY_OVERLAYS) { const c = $(id)?.querySelector(".card"); if (c && !c.hasAttribute("tabindex")) c.tabIndex = -1; }
  // 창이 열리면 포커스를 창 안으로(Tab이 뒤의 버튼으로 가지 않게), 닫히면 키보드로 하던 사람에게만 연 버튼으로 돌려줌
  const openers = new Map();
  const watch = new MutationObserver(recs => { for (const r of recs) { const box = r.target, id = box.id; if (id === "ask") continue;
    if (!box.hidden && !openers.has(id)) { const a = document.activeElement; openers.set(id, a && a !== document.body && !box.contains(a) ? a : null); if (!box.contains(document.activeElement)) box.querySelector(".card")?.focus({ preventScroll: true }); }
    else if (box.hidden && openers.has(id)) { const a = openers.get(id); openers.delete(id); hideTip();
      if (lastKey && a?.isConnected && !a.closest("[hidden]") && (document.activeElement === document.body || box.contains(document.activeElement))) a.focus({ preventScroll: true }); } } histSync(); });
  for (const id of KEY_OVERLAYS) { const el = $(id); if (el) watch.observe(el, { attributes: true, attributeFilter: ["hidden"] }); }

  // ---- 기기 「뒤로」(휴대폰 뒤로 버튼·몸짓): 창이 떠 있는 동안 방문 기록 한 칸을 넣어 두고, 뒤로 = Esc 한 단계. 틀(iframe) 안이거나 기록을 못 쓰는 곳은 하지 않음(실패해도 그냥 둠)
  let histOn = false, histSkip = false;
  try { histOn = window.top === window && matchMedia("(pointer: coarse)").matches && typeof history.pushState === "function"; } catch { histOn = false; }
  function histSync() {
    if (!histOn || histSkip) return;                                            // 뒤로 가는 중(popstate 전)에는 history.state가 아직 그대로 → 또 back()하면 한 칸 더 가서 게임 밖으로 나감. popstate 뒤에 다시 맞춤
    try { const open = !!topOverlay(), mine = !!history.state?.gmmBack;
      if (open && !mine) history.pushState({ gmmBack: 1 }, "");
      else if (!open && mine) { histSkip = true; history.back(); } } catch { histOn = false; }
  }
  // 우리가 부른 back()의 popstate: 기다리는 사이 창이 다시 열렸으면 기록 한 칸을 다시 넣음(histSync)
  addEventListener("popstate", () => { if (histSkip) { histSkip = false; histSync(); return; } const ov = topOverlay(); if (!ov) return; try { escStep(ov); } catch { /* 무시 */ } setTimeout(histSync, 0); });

  /** Esc 한 단계. 처리했으면 true(뒤로 안 넘김). 방·도구의 Esc는 원래 코드가 처리(false) */
  const escStep = ov => {
    if (!tip.hidden) { hideTip(); return true; }                                // ② 툴팁
    if (ov?.id === "ask") { hud.askCancel?.(); return true; }                    // ③ 확인창 = 취소
    if (ov?.id === "letter") { const c = $("letterClose"); if (c?.onclick) c.click(); else ov.hidden = true; return true; }   // ③ 편지
    if (ov?.id === "phone") { hud.phoneBackStep(); return true; }               // ④ 앱 페이지 → 폰 홈(메뉴에서 왔으면 메뉴) → ⑤ 닫기
    if (roomView?.isOpen) return false;                                         // ⑦·① 방: 고른 가구 취소 → 나가기(room.js)
    if (tools.plan || tools.mode !== "view") return false;                      // ① 정한 자리 취소 → 도구 끄기(tools.js)
    if (hud.giftPick && !hud.giftPick.hidden) { hud.giftPick.hidden = true; return true; }   // ⑥ 선물 고르는 판
    const hc = $("houseCard"); if (hc && !hc.hidden) { hc.hidden = true; return true; }       // ⑥ 집 카드
    if (hud.follow) { hud.onUnitClick?.(hud.follow); return true; }                           // ⑥ 따라가기 카드(따라가기 그만)
    hud.openMenu(); return true;                                                // ⑧ 닫을 게 없으면 ☰ 메뉴
  };
  /** 단축키 하나. 처리했으면 true */
  const shortcut = (e, ov) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || roomView?.isOpen) return false;
    const k = KEY_LIST.find(x => x.code.includes(e.code)); if (!k) return false;
    if (ov && !(ov.id === "phone" && (k.app || k.key === "P"))) return false;    // 창이 떠 있으면 갈매폰 안에서 앱 바꾸기·닫기만
    if (k.sel) { const b = document.querySelector(k.sel); if (!b || b.disabled || b.hidden) return false; if (k.key === "P" && ov) hud.closePhone(); else b.click(); return true; }
    if (ov && hud.app === k.app) { hud.closePhone(); return true; }             // 같은 키를 한 번 더 = 닫기
    if (!ov) hud.openPhone(); hud.openApp(k.app); return true;
  };
  /** Tab을 열린 창 안에 가둠 */
  const trap = (e, ov) => {
    const list = [...ov.querySelectorAll("button, [href], input, select, summary, [tabindex]:not([tabindex='-1'])")].filter(x => !x.disabled && x.getClientRects().length);
    if (!list.length) return; const a = document.activeElement, i = list.indexOf(a);
    if (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === list.length - 1)) { e.preventDefault(); (e.shiftKey ? list[list.length - 1] : list[0]).focus(); }
  };
  // 키보드(Tab 등)로 옮긴 포커스만 기억. Chrome은 마우스로 누른 버튼도 키를 누르는 순간 :focus-visible이 되므로 그것으로는 못 가림
  let keyFocus = null;
  document.addEventListener("focusin", e => { keyFocus = lastKey ? e.target : null; }, true);
  addEventListener("keydown", e => {
    const t = e.target, typing = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable;
    if (!typing) { lastKey = true; setInput("mouse"); }                         // 키보드를 쓰면 PC 표시(키 힌트·툴팁)
    const ov = topOverlay();
    if (e.code === "Escape") { if (escStep(ov) || ov) { e.preventDefault(); e.stopPropagation(); } return; }
    if (e.code === "Tab") { if (ov) trap(e, ov); return; }
    if (typing) return;                                                         // 입력칸(소리 크기 막대)은 원래대로
    if (shortcut(e, ov)) { e.preventDefault(); e.stopPropagation(); return; }
    if (ov) { e.stopPropagation(); return; }                                    // 열린 창 뒤로 W·R·Space·Ctrl+Z 등이 새지 않게(keyup은 통과 → 눌린 키가 남지 않음)
    // 키보드로 버튼에 포커스를 두었을 때 Enter·Space: 버튼만 눌리고 게임 키로는 안 감(예: "취소"에 포커스 + Enter → 건설 안 됨)
    if ((e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") && t?.matches?.(KEY_CONTROL_SEL)) {
      // 마우스로 누른 뒤 남은 포커스(예: 🔄 돌리기를 누르고 Enter) · 입질 중 스페이스: 버튼은 다시 안 눌리고 키는 게임으로(건설 · 당기기 · 화면 돌리기)
      if (t !== keyFocus || (e.code === "Space" && !hud.tugBtn?.hidden)) { e.preventDefault(); return; }
      e.stopPropagation();
    }
  }, true);

  // ---- 툴팁 [data-tip]: 마우스는 0.3초 뒤(옆 버튼으로 옮기면 바로), 키보드 포커스는 바로, 터치는 안 보임. 예전 title은 처음 올릴 때 data-tip으로 옮김(브라우저 툴팁과 겹치지 않게)
  const tip = document.createElement("div"); tip.id = "tip"; tip.setAttribute("role", "tooltip"); tip.hidden = true; document.body.append(tip);
  let tipEl = null, tipWait = null, tipT = 0, warmUntil = 0;   // tipWait: 0.3초를 기다리는 버튼
  const tipTarget = n => { const el = n?.closest?.("[data-tip], [title]"); if (!el || el === document.body) return null; if (el.hasAttribute("title")) { if (el.title) el.dataset.tip = el.title; el.removeAttribute("title"); } return el.dataset.tip ? el : null; };
  function hideTip() { clearTimeout(tipT); tipWait = null; if (tip.hidden) return; tip.hidden = true; tipEl?.removeAttribute("aria-describedby"); tipEl = null; warmUntil = performance.now() + 300; }
  const showTip = el => {
    if (!el?.isConnected || el.closest("[hidden]")) return;
    const k = kbdOf(el), text = el.dataset.tip + (k && !el.dataset.tip.includes(`(${k})`) ? ` (${k})` : "");
    tip.textContent = text; tip.hidden = false; tipEl = el; el.setAttribute("aria-describedby", "tip");
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, below = r.top < innerHeight / 2;   // 위쪽 버튼은 아래로, 아래쪽 버튼은 위로
    if (el.closest("#chips") && r.left - w - 8 > 8) { tip.style.left = `${Math.round(r.left - w - 8)}px`; tip.style.top = `${Math.round(Math.max(8, r.top + r.height / 2 - h / 2))}px`; return; }   // 오른쪽 칩 줄: 옆 칩을 가리지 않게 왼쪽에
    tip.style.left = `${Math.round(Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)))}px`;
    tip.style.top = `${Math.round(below ? Math.min(innerHeight - h - 8, r.bottom + 8) : Math.max(8, r.top - h - 8))}px`;
  };
  document.addEventListener("pointerover", e => {
    if (e.pointerType !== "mouse") return; const el = tipTarget(e.target); if (el && (el === tipEl || el === tipWait)) return;   // 글자가 바뀌는 칩은 같은 버튼에 pointerover가 되풀이됨 → 기다림을 다시 시작하지 않음
    hideTip(); if (!el) return;
    if (performance.now() < warmUntil) showTip(el); else { tipWait = el; tipT = setTimeout(() => { tipWait = null; showTip(el); }, 300); }
  });
  document.addEventListener("pointerout", e => { const on = tipEl || tipWait; if (e.pointerType === "mouse" && on && !on.contains(e.relatedTarget)) hideTip(); });
  document.addEventListener("focusin", e => { const el = tipTarget(e.target); hideTip(); if (el && e.target.matches?.(":focus-visible")) showTip(el); });
  document.addEventListener("focusout", () => hideTip());
  addEventListener("scroll", () => hideTip(), true);

  // ---- 도움말 표: 단축키(새 키 + 원래 키). 설정의 ⌨️ 버튼은 이 표로 데려감
  const kb = s => s.split(/( · | \/ | \+ |~)/).map(p => /^( · | \/ | \+ |~)$/.test(p) ? p : p.split(" ").map(x => /[가-힣]/.test(x) ? x : `<kbd>${x}</kbd>`).join(" ")).join("");
  const box = $("keyHelp");
  if (box) box.innerHTML = `<p class="dim">키보드가 있을 때 써요.</p><table class="tbl keytbl">` +
    `<tr><td>${kb("2~6")}</td><td>🔨 건설 도구(칠하기 · 높이 · 짓기 · 철거 · 자연·지형) — 누르면 건설 모드로</td></tr><tr><td>${kb("1")}</td><td>${KEY_LIST[0].what}</td></tr>` +
    KEY_LIST.slice(6).map(k => `<tr><td>${kb(k.key)}${k.code.includes("F1") ? ` · ${kb("F1")}` : ""}</td><td>${k.what}</td></tr>`).join("") +
    KEY_KEEP_LIST.map(([k, v]) => `<tr><td>${kb(k)}</td><td>${v}</td></tr>`).join("") + `</table>` +
    `<p class="dim">한글 입력 상태여도 같은 자리의 키로 돼요. 갈매폰(도감·메뉴 포함)·편지가 열려 있는 동안은 뒤의 화면이 키에 움직이지 않아요.</p>`;
  const kbtn = $("keysBtn"); if (kbtn) kbtn.onclick = () => { hud.openApp("help"); const sec = box?.closest("details"); if (sec) sec.open = true; (sec || box)?.scrollIntoView({ block: "start" }); };   // 도움말의 ⌨️ 단축키 칸을 펼쳐서
}
