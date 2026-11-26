// 처음 안내: 첫 세션 3단계 말풍선(둘러보기 → 갈매미 누르기 → 집 한 채 짓기)과, 앱·상호작용을 처음 만날 때 한 번 뜨는 짧은 안내.
// 화면을 막지 않는 말풍선(버튼만 눌림)이고 저절로 닫히지 않음. 상태는 이 기기에만(galmaemiman-hints) — 섬 저장과는 따로.
// 매 프레임 돌지 않음: 안내가 떠 있거나 기다릴 때만 0.4초마다 살핌(글자·자리는 바뀔 때만 고침).
import { BUILDINGS } from "../data/catalog.js";

const COACH_KEY = "galmaemiman-hints";
/** 앱 페이지를 처음 열 때 위에 붙는 안내(2문장 이내, 도움말·화면에 있던 말을 줄여 씀) */
const COACH_APP_HINTS = {
  rel: "친한 사이는 선으로 이어져요(친할수록 굵고 따뜻한 색). 갈매미를 누르면 그 갈매미의 사이를 글로 보여 줘요.",
  news: "마을에서 일어난 큰일을 하루에 몇 건씩 골라 실어요. 🔔 지난 알림에서 지나간 알림도 다시 볼 수 있어요.",
  dex: "낚은 물고기와 바닷가에서 건진 물건이 여기에 모여요. 계절 한정 물고기·물건도 있어요.",
  wish: "갈매미가 바라는 걸 들어주면 기뻐하고 축하금을 받아요. 맨 위 오늘의 부탁을 모두 들어주면 도장을 하나 받아요.",
  decor: "집에 들어가 가구를 놓고 바닥·벽지를 바꿔요. 놓은 가구는 그 집 갈매미가 써요.",
};
/** 화면에서 처음 만나는 상호작용(말풍선으로) */
const COACH_MOMENT_HINTS = {
  room: { touch: "🛋 누르기 = 고르기·놓기, 끌기 = 방 돌리기예요. 다 꾸몄으면 🚪 나가기를 눌러요.", mouse: "🛋 누르기 = 고르기·놓기, 끌기 = 방 돌리기, R = 돌리기예요. 다 꾸몄으면 🚪 나가기(Esc)." },
  tug: { touch: "❗ 입질이 오면 🎣 당기기!를 눌러요. 같이 당기면 귀한 물고기가 올 가능성이 커져요.", mouse: "❗ 입질이 오면 🎣 당기기!를 누르거나 스페이스 키. 같이 당기면 귀한 물고기가 올 가능성이 커져요." },
  gift: { touch: "🎁 가방의 물건이나 보물 물고기를 골라 건네요. 조금 친해지면 좋아하는 걸 알려 줘요.", mouse: "🎁 가방의 물건이나 보물 물고기를 골라 건네요. 조금 친해지면 좋아하는 걸 알려 줘요." },
};
const COACH_STEPS = 3;

export class CoachMarks {
  constructor(hud) {
    this.hud = hud; this.state = { coach: 0, seen: {} };
    try { const j = JSON.parse(localStorage.getItem(COACH_KEY) || "null"); if (j && typeof j === "object") { if (j.coach !== undefined) this.state.coach = j.coach; if (j.seen && typeof j.seen === "object") this.state.seen = j.seen; } } catch { /* 저장을 못 쓰는 곳: 처음처럼 */ }
    this.step = 0; this.wait = null; this.moments = []; this.timer = 0; this.key = null; this.hi = null; this.done = false;
    const box = this.box = document.createElement("div"); box.id = "coach"; box.hidden = true; box.setAttribute("role", "region"); box.setAttribute("aria-label", "처음 안내");
    box.innerHTML = `<div class="ctop"><span class="cstep"></span><span class="cdots" aria-hidden="true"></span><button class="cskip ghost" type="button">건너뛰기</button></div><div class="cmain"><p class="ctext" aria-live="polite"></p><button class="cok go" type="button">알겠어요</button></div>`;
    document.body.append(box);
    this.stepEl = box.querySelector(".cstep"); this.dots = box.querySelector(".cdots"); this.text = box.querySelector(".ctext"); this.skipBtn = box.querySelector(".cskip"); this.okBtn = box.querySelector(".cok");
    this.skipBtn.onclick = () => this.finish("skip");
    this.okBtn.onclick = () => { if (this.moments.length && this.shown === "moment") { this.moments.shift(); } else if (this.done) { this.done = false; this.step = 0; } this.key = null; this.tick(); };
    // ① 둘러보기: 화면(캔버스)을 끌거나 휠·키로 옮기면 넘어감. 갈매미를 누르는 짧은 탭(조금 움직임)은 세지 않음
    let down = null;
    addEventListener("pointerdown", e => { down = this.step === 1 && e.target?.tagName === "CANVAS" ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null; }, true);
    addEventListener("pointermove", e => { if (!down || e.pointerId !== down.id) return; if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 36) { down = null; this.advance(1); } }, true);
    addEventListener("pointerup", () => { down = null; }, true);
    addEventListener("wheel", e => { if (this.step === 1 && e.target?.tagName === "CANVAS") this.advance(1); }, { capture: true, passive: true });
    addEventListener("keydown", e => { if (this.step === 1 && /^(Key[WASDQE]|Arrow(Up|Down|Left|Right))$/.test(e.code) && e.target?.tagName !== "INPUT") this.advance(1); }, true);
    addEventListener("resize", () => { this.key = null; });
  }
  save() { try { localStorage.setItem(COACH_KEY, JSON.stringify(this.state)); } catch { /* 무시 */ } }
  /** 처음 안내 시작. fresh = 새 섬(저장 없이 시작), force = 도움말의 「처음 안내 다시 보기」. 이미 끝냈거나 건너뛰었으면 다시 안 함 */
  start({ fresh = false, force = false } = {}) {
    const c = this.state.coach;
    if (force) this.state.coach = 0;
    else if (c === "done" || c === "skip" || (!fresh && !c)) return;              // 이어 하는 섬에서는 하던 단계가 있을 때만 이어서
    this.step = Math.min(COACH_STEPS, Math.max(1, (+this.state.coach || 0) + 1)); this.done = false;
    this.wait = { since: 0, force }; this.houses = null; this.save(); this.run();
  }
  /** 앱 페이지를 처음 열 때(갈매폰 openApp이 부름): 페이지 맨 위에 한 번 안내 카드 */
  appHint(app, page) {
    const t = COACH_APP_HINTS[app]; if (!t || !page || this.state.seen[app] || page.querySelector(".fhint")) return;
    const card = document.createElement("div"); card.className = "fhint"; card.setAttribute("role", "note");
    const p = document.createElement("p"); p.textContent = t; const ok = document.createElement("button"); ok.type = "button"; ok.className = "go"; ok.textContent = "알겠어요";
    ok.onclick = () => { this.state.seen[app] = 1; this.save(); card.remove(); };
    card.append(p, ok); page.prepend(card);
  }
  /** 상호작용을 처음 만났을 때(방 · 입질 · 선물): 말풍선으로 한 번 */
  moment(kind) {
    if (!COACH_MOMENT_HINTS[kind] || this.state.seen[kind] || this.moments.includes(kind)) return;
    this.state.seen[kind] = 1; this.save(); this.moments.push(kind); this.key = null; this.run();
  }
  finish(how) {
    this.state.coach = how; this.save(); this.step = 0; this.wait = null; this.done = false; this.key = null; this.tick();
  }
  advance(n) {
    if (this.step !== n) return;
    this.state.coach = n; if (n >= COACH_STEPS) { this.state.coach = "done"; this.step = 0; this.done = true; } else this.step = n + 1;
    this.save(); this.key = null; this.hud.sfx?.chime?.([784, 988], 0.06, 0.1); this.tick();
  }
  run() { if (!this.timer) this.timer = setInterval(() => this.tick(), 400); this.tick(); }
  houseCount() { let n = 0; for (const b of this.hud.world?.buildings?.values?.() || []) if (BUILDINGS[b.defId]?.house) n++; return n; }
  /** 지금 가려야 하나: 불러오는 화면 · 편지 · 확인창 · 갈매폰이 떠 있으면 말풍선은 잠깐 숨김(방 안에서는 방 안내만) */
  blocked() {
    const $ = id => document.getElementById(id);
    return !$("loading")?.hidden || !$("letter")?.hidden || !$("ask")?.hidden || !this.hud.phone?.hidden;
  }
  /** 0.4초마다: 단계 넘김 살피기 + 보일 글·자리 정하기(바뀐 때만 DOM을 고침) */
  tick() {
    const h = this.hud, inRoom = document.body.classList.contains("inroom");
    if (inRoom) this.moment("room");
    let want = null;                                                              // { kind, text, stepNo, target }
    const blocked = this.blocked();
    if (!blocked && this.moments.length) {
      const k = this.moments[0], m = COACH_MOMENT_HINTS[k];
      if (k === "room" && !inRoom) this.moments.shift();                         // 방을 이미 나왔으면 안 보여 줌
      else want = { kind: "moment", text: m[document.documentElement.dataset.input === "touch" ? "touch" : "mouse"] };
    }
    if (!want && this.step && !blocked && !inRoom) {
      // 편지·처음 알림이 지나간 뒤 시작: 알림이 비거나 8초가 지나면
      if (this.wait) { const now = performance.now(); if (!this.wait.since) this.wait.since = now;
        if (this.wait.force || (!h.toastCur && !h.toastQ?.length) || now - this.wait.since > 8000) this.wait = null; }
      if (!this.wait) {
        if (this.step === 2 && h.follow) { this.advance(2); return; }
        if (this.step === 3) { const n = this.houseCount(); if (this.houses == null || this.housesWorld !== h.world) { this.houses = n; this.housesWorld = h.world; } else if (n > this.houses) { this.advance(3); return; } }
        want = this.stepView();
      }
    }
    if (!want && this.done && !blocked && !inRoom) want = { kind: "done", text: "🎉 잘했어요! 갈매미들이 재료를 날라 집을 지어요. 더 궁금하면 📱 → ❓ 도움말을 봐요." };
    this.show(want);
    if (!want && !this.step && !this.done && !this.moments.length && this.timer) { clearInterval(this.timer); this.timer = 0; }
  }
  stepView() {
    const h = this.hud, tools = h.tools, touch = document.documentElement.dataset.input === "touch";
    if (this.step === 1) return { kind: "step", stepNo: 1, text: touch ? "👆 화면을 한 손가락으로 끌어 마을을 둘러봐요. 두 손가락으로 벌리면 가까이 봐요." : "🖱 화면을 끌어 마을을 둘러봐요. 휠로 가까이 보고, W·A·S·D로도 옮겨요." };
    if (this.step === 2) return { kind: "step", stepNo: 2, text: h.world?.units?.length ? "🐦 갈매미를 눌러 봐요. 따라가며 무얼 하는지 볼 수 있어요(📱 → 🐦 갈매미에서 골라도 돼요)." : "🐦 아직 갈매미가 없어요. 📱 → 🥚 소환으로 불러서 눌러 봐요." };
    if (tools.mode === "view") return { kind: "step", stepNo: 3, text: "🔨 이제 집을 한 채 지어 봐요. 「🔨 건설」을 눌러요.", target: "#editBtn" };
    if (tools.mode !== "build") return { kind: "step", stepNo: 3, text: "🏠 「짓기」를 골라요.", target: '#tools [data-mode="build"]' };
    if (tools.plan) return { kind: "step", stepNo: 3, text: "🔨 「건설」을 누르면 갈매미들이 지어요.", target: "#cfBuild" };
    return { kind: "step", stepNo: 3, text: touch ? "🏠 집을 고르고 지을 땅을 눌러요." : "🏠 집을 고르고 지을 땅을 눌러요(R = 돌리기)." };
  }
  show(want) {
    const box = this.box;
    const key = want ? `${want.kind}|${want.stepNo || ""}|${want.text}|${want.target || ""}|${document.documentElement.dataset.form}|${document.body.dataset.mode}` : "";
    if (key === this.key) { if (want) this.place(); return; }                     // 자리는 매번(알림이 뜨고 사라짐 · 0.4초마다 몇 군데만 잼)
    this.key = key;
    this.shown = want?.kind || null;
    const hiEl = want?.target ? document.querySelector(want.target) : null;
    if (this.hi !== hiEl) { this.hi?.classList.remove("coach-hi"); hiEl?.classList.add("coach-hi"); this.hi = hiEl; }
    if (!want) { box.hidden = true; return; }
    this.stepEl.textContent = want.kind === "step" ? `처음 안내 ${want.stepNo}/${COACH_STEPS}` : want.kind === "done" ? "처음 안내 끝" : "처음이에요";
    this.dots.textContent = want.kind === "step" ? Array.from({ length: COACH_STEPS }, (_, i) => i < want.stepNo ? "●" : "○").join("") : "";
    this.text.textContent = want.text;
    this.skipBtn.hidden = want.kind !== "step"; this.okBtn.hidden = want.kind === "step";
    this.okBtn.textContent = want.kind === "done" ? "좋아요" : "알겠어요";
    box.dataset.kind = want.kind; box.hidden = false; this.place();
  }
  /** 위쪽 가운데(가로는 CSS: 건설 레일만큼 비킴): 칩·알림·미니맵·방 머리줄 밑으로(가로로 겹치는 것만 피함) */
  place() {
    const box = this.box; box.style.left = "";                                   // 기본 자리(가운데)에서 재고, 끝에 정한 자리로(같은 프레임이라 깜빡이지 않음)
    const b = box.getBoundingClientRect(); let top = 0;
    for (const sel of ["#chips", "#msg", "#minimap", "#room .rhead", "#tools", "#ebar", "#sub"]) {
      const e = document.querySelector(sel); if (!e || e.hidden || !e.getClientRects().length) continue;
      const q = e.getBoundingClientRect(); if (q.width < 2 || q.height < 2 || q.top > innerHeight * 0.45) continue;   // 아래쪽에 있는 것은 상관없음
      if (q.right > b.left && q.left < b.right) top = Math.max(top, q.bottom);
    }
    top = Math.max(8, Math.min(top + 8, innerHeight - b.height - 8));            // 위가 꽉 차면 화면 안에 들어오는 데까지만 내림(화면 밖으로 안 나감)
    const px = `${Math.round(top)}px`; if (box.style.top !== px) box.style.top = px;
    // 내려온 말풍선이 아래 왼쪽 카드(따라가기 카드 등)와 겹치면 그 오른쪽으로 비킴(자리가 있을 때만)
    let left = ""; const bottom = top + b.height;
    for (const sel of ["#info", "#bondBar", "#tugBtn", "#editBtn"]) {
      const e = document.querySelector(sel); if (!e || e.hidden || !e.getClientRects().length) continue;
      const q = e.getBoundingClientRect(); if (q.width < 2 || q.top >= bottom || q.bottom <= top || q.right <= b.left || q.left >= b.right) continue;
      if (q.right + 8 + b.width > innerWidth - 8) continue;
      const nl = q.right + 8, hit = ["#minimap", "#phoneBtn"].some(t => { const o = document.querySelector(t); if (!o || o.hidden || !o.getClientRects().length) return false;
        const r = o.getBoundingClientRect(); return r.left < nl + b.width && r.right > nl && r.top < bottom && r.bottom > top; });
      if (!hit) left = `${Math.round(nl + b.width / 2)}px`;
    }
    box.style.left = left;
    // 그래도 🎣 당기기 버튼을 덮으면(작은 세로 폰, 입질은 1~2초뿐) 그 위로 올림: 눌러야 할 버튼이 가려지는 것보다 위쪽 미니맵을 잠깐 덮는 게 나음
    if (!left) { let lim = Infinity;
      for (const sel of ["#tugBtn"]) { const e = document.querySelector(sel); if (!e || e.hidden || !e.getClientRects().length) continue;
        const q = e.getBoundingClientRect(); if (q.width >= 2 && q.top < bottom && q.bottom > top && q.right > b.left && q.left < b.right) lim = Math.min(lim, q.top); }
      if (lim < Infinity) { const up = `${Math.round(Math.max(8, lim - b.height - 8))}px`; if (box.style.top !== up) box.style.top = up; } }
  }
}
