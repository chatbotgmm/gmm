// 건축에서 금고 돈이 나갈 때 공사장 위에 잠깐 뜨는 표시(HTML 오버레이 → 그리기 호출 0).
//  · 설계비(World 'fee'): 놓는 순간 「설계비 🪙−n」 · 공사 한 바퀴 품삯(World 'wage', 금고에서): 「🪙−n」 · 금고가 모자라 밀림('wageOwed'): 「💸 품삯 밀림」(주황)
//  · 주문 공사(갈매미 돈)는 World가 이벤트를 내지 않음 → 아무것도 안 뜸
//  · 화면에 보이는(카메라 SF_FAR m 안, 화면 안) 공사장만. 같은 공사장은 합치고 새로 띄우는 것은 VF_SITE_GAP_MS에 한 번, 한꺼번에 VF_MAX개(ui/vaultFx.js makeSiteGate)
//  · 새로 뜰 때 금고 칩에서 공사장으로 🪙 하나가 날아감(VF_FLY_MS, 한꺼번에 VF_FLY_MAX개) — 돈이 금고에서 나가 공사장으로 간다는 연결. 움직임 줄이기면 날지 않고 떠오르지도 않음(제자리에서 옅어짐)
//  · DOM은 처음 VF_MAX + VF_FLY_MAX개를 만들어 돌려 씀. 자리·투명도는 바뀔 때만 씀
import * as THREE from "three";
import { makeSiteGate, siteSpendText, VF_LIFE_MS, VF_MAX, VF_FLY_MS, VF_FLY_MAX } from "../ui/vaultFx.js";

const SF_FAR = 90, SF_RISE = 26, SF_FADE_IN = 120, SF_FADE_OUT = 450;   // m · px · ms

export class SiteSpendFx {
  constructor({ camera, overlay, getWorld, getViews }) {
    this.camera = camera; this.overlay = overlay; this.getWorld = getWorld; this.getViews = getViews;
    this.gate = makeSiteGate(); this.items = []; this.coins = []; this.tmp = new THREE.Vector3(); this.world = null;
    this.root = document.createElement("div"); this.root.className = "vfxRoot";
  }
  get calm() { return document.documentElement.dataset.motion === "reduce"; }
  /** 새 섬·불러오기(main.js가 overlay를 비움): 요소를 다시 만들고 기록을 지움 */
  ensure() {
    const w = this.getWorld();
    if (this.root.isConnected && w === this.world) return;
    this.world = w; this.gate.clear(); this.root.textContent = ""; this.items = []; this.coins = [];
    for (let i = 0; i < VF_MAX; i++) { const e = document.createElement("div"), b = document.createElement("b"); e.className = "vfx"; e.hidden = true; e.setAttribute("aria-hidden", "true"); e.appendChild(b); this.root.appendChild(e); this.items.push({ e, b, pop: null, tf: "", op: "" }); }
    for (let i = 0; i < VF_FLY_MAX; i++) { const e = document.createElement("div"); e.className = "vfxCoin"; e.textContent = "🪙"; e.hidden = true; e.setAttribute("aria-hidden", "true"); this.root.appendChild(e); this.coins.push({ e, busy: false }); }
    this.overlay.appendChild(this.root);
  }
  /** 공사장 b의 화면 자리(공사장 표시 위). 화면 밖·너무 멀면 null */
  screenOf(b, vw = innerWidth, vh = innerHeight, lift = null) {
    const v = this.getViews()?.views.get(b.id); if (!v) return null;
    const p = this.tmp.set(v.holder.position.x, v.holder.position.y + v.height, v.holder.position.z), d = p.distanceTo(this.camera.position);
    if (d > SF_FAR) return null; p.project(this.camera);
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null;
    if (lift === null) lift = v.badge && !v.badge.hidden ? (v.badge.offsetHeight || 0) + 4 : 0;   // 공사장 표시(🔨 n%)가 떠 있으면 그 위로(높이는 띄울 때 한 번만 잼 → 매 프레임 배치 계산 없음)
    return { lift, x: (p.x * 0.5 + 0.5) * vw, y: (-p.y * 0.5 + 0.5) * vh - lift };
  }
  /** World 이벤트에서(main.js): kind = "fee" | "wage" | "owed" */
  push(b, kind, n) {
    if (!b || document.body.classList.contains("inroom")) return;
    this.ensure(); const at = this.screenOf(b); if (!at) return;                    // 보이지 않는 공사장은 칩 −n만
    const r = this.gate.push(b.id, kind, n, performance.now()); if (r.act === "skip") return;
    let it = this.items.find(i => i.pop === r.pop);
    if (!it) { it = this.items.find(i => !i.pop); if (!it) return; it.pop = r.pop; it.b0 = b; it.tf = it.op = ""; it.lift = at.lift; }
    it.b.textContent = siteSpendText(r.pop.kind, r.pop.n); it.e.dataset.kind = r.pop.kind;
    if (r.act === "merge" && !this.calm) { it.e.classList.remove("bump"); void it.e.offsetWidth; it.e.classList.add("bump"); }
    if (r.act === "new" && kind !== "owed" && !this.calm) this.fly(at);
  }
  /** 금고 칩 → 공사장: 🪙 하나가 포물선으로(Web Animations, 끝나면 숨김) */
  fly(to) {
    const chip = document.getElementById("chipVault"), c = this.coins.find(q => !q.busy); if (!chip || !c || typeof c.e.animate !== "function") return;
    const r = chip.getBoundingClientRect(); if (!r.width || !r.height) return;
    const x0 = r.left + r.width / 2, y0 = r.bottom, x1 = to.x, y1 = to.y, mx = x0 + (x1 - x0) * 0.25, my = y0 + (y1 - y0) * 0.6;   // 칩 바로 밑에서 먼저 아래로 떨어지다 옆으로(위로 솟으면 화면 위 줄에 가려짐)
    c.busy = true; c.e.hidden = false;
    const a = c.e.animate([
      { transform: `translate(${x0}px,${y0}px) scale(.8)`, opacity: 0 },
      { transform: `translate(${mx}px,${my}px) scale(1.1)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${x1}px,${y1}px) scale(.9)`, opacity: 1, offset: 0.92 },
      { transform: `translate(${x1}px,${y1}px) scale(.6)`, opacity: 0 }], { duration: VF_FLY_MS, easing: "ease-in-out" });
    const done = () => { c.e.hidden = true; c.busy = false; }; a.onfinish = done; a.oncancel = done;
  }
  /** 매 프레임(main.js, noPower.update 다음). 떠 있는 것이 없으면 아무것도 안 함 */
  update(vw, vh) {
    if (!this.root.isConnected || !this.items.some(i => i.pop)) return;
    const now = performance.now(), calm = this.calm, w = this.getWorld();
    for (const it of this.items) {
      const p = it.pop; if (!p) continue;
      const at = now < p.end && w === this.world && w.buildings.get(it.b0.id) === it.b0 ? this.screenOf(it.b0, vw, vh, it.lift) : null;
      if (now >= p.end || w !== this.world || w.buildings.get(it.b0.id) !== it.b0) { it.pop = null; it.e.hidden = true; it.e.classList.remove("bump"); continue; }   // 끝남·철거·새 섬
      if (!at) { if (!it.e.hidden) it.e.hidden = true; continue; }
      if (!it.lift) { const bd = this.getViews()?.views.get(it.b0.id)?.badge; if (bd && !bd.hidden) { it.lift = (bd.offsetHeight || 0) + 4; continue; } }   // 놓자마자 띄운 설계비: 공사장 표시가 다음 프레임에 뜨면 그 위로(높이는 한 번만 잼)                  // 화면 밖으로 돌렸으면 숨김(시간은 흐름)
      const age = now - p.t0, k = Math.min(1, age / VF_LIFE_MS), rise = calm ? 0 : SF_RISE * (1 - (1 - k) * (1 - k));
      const op = Math.max(0, Math.min(1, calm ? 1 : age / SF_FADE_IN, (p.end - now) / SF_FADE_OUT)).toFixed(2);
      const tf = `translate(${Math.round(at.x)}px,${Math.round(at.y - 4 - rise)}px)`;
      if (it.e.hidden) it.e.hidden = false; if (tf !== it.tf) it.e.style.transform = it.tf = tf; if (op !== it.op) it.e.style.opacity = it.op = op;
    }
  }
}
