// 「전기 없음」 배지(풍차나 가로등을 하나라도 놓은 뒤에만 — 그 전에는 첫 화면의 첫 집에 뜨지 않게 숨김, power.js powerOpen): 다 지은 가로등·등불 건물(카페·잡화점·우체국)·집(작은 집·2층집·큰 집·자이언트의 집) 가운데 풍차 전기 범위 밖인 것 위에 작은 말풍선(⚡✕).
// 누구에게 띄울지는 world/power.js 한 곳(unpowered — world.powerRev가 바뀔 때만 다시 셈). 풍차가 범위 안에 다 지어지면 바로 사라지고 철거하면 다시 뜸. 짓는 중인 건물에는 안 띄움(🔨 진행률 표시가 있음).
//  · 자리: 건물 표시(views.js .badge — 🪧 값·🐦 안에 있는 수)와 같은 점. 그 표시가 떠 있으면 그 위로 NP_STACK px 올려 쌓음
//    다른 건물의 표시·땅 이름·갈매미 말풍선과 겹칠 때는 배지가 아래(overlay의 맨 앞 자식) — 글자는 늘 읽힘
//  · 많을 때: 카메라에서 NP_NEAR m까지는 제 크기, 멀수록 NP_MIN_S배까지 작아짐. 가로등은 NP_LAMP_FADE m부터 옅어져 NP_LAMP_HIDE m 밖은 숨김(건물은 NP_HOUSE_FADE~NP_HOUSE_HIDE).
//    화면에서 서로 겹치면(가운데 사이가 NP_GAP px × 크기 안) 건물 먼저·가까운 것 먼저 하나만 남김 → 멀리서 본 가로등 줄은 띄엄띄엄 몇 개만
//  · DOM은 바뀐 값만 씀. 카메라·화면 크기·건물 목록·건물 표시가 그대로면 아무것도 안 함
//  · 건물을 누르면(main.js onTapGround) 카드(#houseCard)에 까닭을 적음: hud가 카드를 열었으면(집·잡화점) 그 글 뒤에 덧붙이고, 아니면(가로등·카페·우체국) 카드를 따로 엶
import * as THREE from "three";
import { BUILDINGS } from "../data/catalog.js";
import { POWER_RANGE, lacksPower, unpowered, powerOpen } from "../world/power.js";

const NP_NEAR = 34, NP_MIN_S = 0.62, NP_LAMP_FADE = 60, NP_LAMP_HIDE = 75, NP_HOUSE_FADE = 105, NP_HOUSE_HIDE = 125, NP_GAP = 24, NP_STACK = 25;
export const NO_POWER_WHY = `⚡ 전기가 닿지 않아요 — 풍차 발전소를 ${POWER_RANGE}칸 안에 지어 주세요`;
// 그림: 노란 번개 + 빨간 ✕(글꼴·이모지에 기대지 않게 직접 그림). 흰 말풍선 + 짙은 테두리·그림자 → 눈 위·밤에도 보임
const NP_ICON = `<svg viewBox="0 0 68 44" aria-hidden="true"><path d="M24 3 6 25h11l-4 16 20-24H21z" fill="#ffc91f" stroke="#4a3a2a" stroke-width="3.5" stroke-linejoin="round"/><path d="M42 13 60 31M60 13 42 31" stroke="#e23d2e" stroke-width="7.5" stroke-linecap="round"/></svg>`;
const NP_CSS = `.nopw { position: absolute; left: 0; top: 0; width: 40px; height: 26px; box-sizing: border-box; border-radius: 13px; background: #fffdf8; border: 2px solid #4a3a2acc;
  box-shadow: 0 2px 6px rgba(20, 16, 30, .45); transform-origin: 50% calc(100% + 7px); pointer-events: none; will-change: transform; }
.nopw[hidden] { display: none; } .nopw svg { position: absolute; left: 1px; top: 0; width: 34px; height: 22px; }
.nopw::before { content: ""; position: absolute; left: 50%; bottom: -8px; margin-left: -6px; border: 6px solid transparent; border-bottom: 0; border-top-color: #4a3a2acc; }
.nopw::after { content: ""; position: absolute; left: 50%; bottom: -5px; margin-left: -4px; border: 4px solid transparent; border-bottom: 0; border-top-color: #fffdf8; }`;
const NP_NONE = [];                                                               // 아직 풍차·가로등을 안 놓은 마을(powerOpen): 배지 없음
const NP_EMOJI = { streetlamp: "💡", cafe: "☕", shop: "🏪", post: "📮" };

export class NoPowerBadges {
  constructor({ camera, overlay, getWorld, getViews, card }) {
    this.camera = camera; this.overlay = overlay; this.getWorld = getWorld; this.getViews = getViews; this.card = card;
    this.els = new Map(); this.items = []; this.list = null; this.key = ""; this.sel = null; this.tmp = new THREE.Vector3(); this.cam = new Float64Array(20);
    if (!document.getElementById("nopwCss")) { const st = document.createElement("style"); st.id = "nopwCss"; st.textContent = NP_CSS; document.head.appendChild(st); }
    this.root = document.createElement("div"); this.root.className = "nopwRoot";
    if (card) new MutationObserver(() => { if (card.hidden) this.sel = null; }).observe(card, { attributes: true, attributeFilter: ["hidden"] });
  }
  /** 섬에서 건물을 눌렀을 때(main.js: hud.houseCard · powerRange.tap 다음). 전기가 안 닿는 불 달린 건물이면 카드에 까닭을 적음 */
  tap(b) {
    const c = this.card, w = this.getWorld(); this.sel = null; if (!c || !b || !powerOpen(w) || !lacksPower(w, b)) return;
    const def = BUILDINGS[b.defId], span = c.querySelector("span"), mine = c.hidden;
    if (!mine) span.textContent += ` · ${NO_POWER_WHY}`;                           // hud가 연 카드(집: 주인·아늑함 · 잡화점: 가구·옷) 뒤에
    else { c.querySelector("b").textContent = `${NP_EMOJI[def.id] || "🏠"} ${def.name}`; span.textContent = NO_POWER_WHY;
      const go = c.querySelector(".go"); if (go) go.hidden = true; c.querySelector(".hx").onclick = () => { c.hidden = true; }; c.hidden = false; }
    this.sel = b; this.own = mine;
  }
  /** 카드를 연 건물에 전기가 들어오면(풍차 완공) 까닭 글을 지움 */
  cardSync(w) {
    const b = this.sel, c = this.card; if (!b || lacksPower(w, b)) return; this.sel = null;
    if (this.own || w.buildings.get(b.id) !== b) c.hidden = true; else { const span = c.querySelector("span"); span.textContent = span.textContent.replace(` · ${NO_POWER_WHY}`, ""); }
  }
  /** 매 프레임(main.js, buildingViews.updateBadges 다음) */
  update(vw, vh) {
    const w = this.getWorld(), views = this.getViews(); if (!w || !views) return;
    if (!this.root.isConnected) { this.root.textContent = ""; this.els.clear(); this.list = null; this.overlay.insertBefore(this.root, this.overlay.firstChild); }   // 새 섬·불러오기: main.js가 overlay를 비움. 맨 아래에 둠 → 값표·진행률·땅 이름·갈매미 말풍선이 겹치면 그 글자가 위(배지가 글을 안 가림)
    const list = powerOpen(w) ? unpowered(w) : NP_NONE, cam = this.camera;
    let same = list === this.list; if (!same) { this.list = list; this.sync(list, views); this.cardSync(w); }
    const k = this.cam, e = cam.matrixWorld.elements, pe = cam.projectionMatrix.elements;   // 카메라·화면 크기가 그대로인지(글자열을 만들지 않고 숫자로 견줌)
    for (let i = 0; i < 20; i++) { const x = i < 16 ? e[i] : i === 16 ? pe[0] : i === 17 ? pe[5] : i === 18 ? vw : vh; if (k[i] !== x) { k[i] = x; same = false; } }
    for (const it of this.items) { const st = !it.v.badge.hidden, h = it.v.height; if (st !== it.st || h !== it.h) { it.st = st; it.h = h; same = false; } }   // 건물 표시가 뜨거나 지면 쌓는 높이가 바뀜 · 모델이 늦게 불려 오면 높이가 바뀜
    if (same) return;
    const p = this.tmp, shown = [];
    for (const it of this.items) {
      const h = it.v.holder.position; p.set(h.x, h.y + it.v.height - it.lamp * 0.3, h.z); const d = p.distanceTo(cam.position); p.project(cam);
      const hide = it.lamp ? NP_LAMP_HIDE : NP_HOUSE_HIDE, fade = it.lamp ? NP_LAMP_FADE : NP_HOUSE_FADE;
      it.on = p.z < 1 && d < hide && p.x > -1.1 && p.x < 1.1 && p.y > -1.2 && p.y < 1.1; if (!it.on) continue;
      it.d = d; it.x = (p.x * 0.5 + 0.5) * vw; it.y = (-p.y * 0.5 + 0.5) * vh - (it.st ? NP_STACK : 0);
      it.s = Math.max(NP_MIN_S, Math.min(1, NP_NEAR / d)) * (it.lamp ? 0.88 : 1); it.a = d > fade ? Math.max(0, 1 - (d - fade) / (hide - fade)) : 1;
    }
    for (const it of this.items.filter(q => q.on).sort((a, b) => (a.lamp - b.lamp) || a.d - b.d)) {   // 겹치면 건물 먼저·가까운 것 먼저
      for (const o of shown) if (Math.abs(o.x - it.x) < NP_GAP * 1.5 * o.s && Math.abs(o.y - it.y) < NP_GAP * o.s) { it.on = false; break; }
      if (it.on) shown.push(it);
    }
    for (const it of this.items) {
      if (it.el.hidden !== !it.on) it.el.hidden = !it.on; if (!it.on) continue;
      const tf = `translate(${Math.round(it.x * 2) / 2 - 20}px,${Math.round(it.y * 2) / 2 - 33}px) scale(${it.s.toFixed(2)})`, op = it.a.toFixed(2);
      if (tf !== it.tf) it.el.style.transform = it.tf = tf; if (op !== it.op) it.el.style.opacity = it.op = op;
    }
  }
  /** 목록이 바뀌었을 때만: 배지 요소를 만들고 지움 */
  sync(list, views) {
    const keep = new Set(); this.items = [];
    for (const b of list) { const v = views.views.get(b.id); if (!v) continue; keep.add(b.id);
      let el = this.els.get(b.id); if (!el) { el = document.createElement("div"); el.className = "nopw"; el.hidden = true; el.innerHTML = NP_ICON; this.root.appendChild(el); this.els.set(b.id, el); }
      this.items.push({ b, v, el, lamp: b.defId === "streetlamp" ? 1 : 0, on: false, st: null, tf: "", op: "" }); }
    for (const [id, el] of this.els) if (!keep.has(id)) { el.remove(); this.els.delete(id); }
  }
}
