// 머리 위 이름표(화면 겹 #overlay의 작은 둥근 글자표). 규칙(거리·수·겹침·크기)은 ui/nameTagRules.js.
// HeadTags: 무엇의 이름표든 쓰는 틀 — 매 프레임 begin → push(머리 위 월드 자리·글) → end. 갈매미(GullTags)가 쓰고, 손님 같은 다른 머리 위 표시도 그대로 씀.
// 가벼움: 표는 열쇠마다 한 번 만들어 계속 씀(풀) · 자리·글·투명도·크기는 바뀔 때만 씀(util.js) · 프레임마다 새 배열·객체를 만들지 않음.
// 말풍선과 겹치지 않게: 이름표는 머리 바로 위, 말풍선·🤧은 이름표 위로 올라감(topOf로 이름표 윗자리를 알려 줌).
//   말풍선이 뜰 때 이름표를 숨기면 갈매미가 말할 때마다 이름이 깜빡여서, 이름은 그대로 두고 말풍선을 한 칸 올림.
import * as THREE from "three";
import { placeEl, showEl } from "../util.js";
import { tagAlpha, tagCap, tagScale, tagText, pickTags, tagMode, blockedBy } from "../ui/nameTagRules.js";
import { bondStage } from "../world/bond.js";

const _tagP = new THREE.Vector3();
const TAG_EASE = 9;                                                             // 옅어지고 짙어지는 빠르기(1/초)

export class HeadTags {
  /** overlay: 화면 겹 · cls: 표 CSS 클래스(갈래마다 다른 모양을 줄 때) */
  constructor(overlay, cls = "ntag") {
    this.overlay = overlay; this.cls = cls; this.recs = new Map(); this.list = []; this.n = 0; this.cap = 8;
    this.grow(32); this.blk = [mkBlocks(16), mkBlocks(16)];                  // 가림 칸(남의 말풍선): 지난 프레임에 모은 것(0)으로 고르고, 이번 프레임 것(1)을 모음
  }
  grow(k) {                                                                     // 후보 칸(후보가 늘 때만 다시 만듦)
    this.size = k; this.cand = new Array(k).fill(null);
    for (const f of ["x", "y", "w", "h", "d", "a"]) this[f] = new Float32Array(k);
    this.focus = new Uint8Array(k); this.show = new Uint8Array(k); this.order = new Int32Array(k);
  }
  rec(key) {
    let r = this.recs.get(key); if (r) return r;
    const el = document.createElement("div"); el.className = this.cls; el.hidden = true; el.setAttribute("aria-hidden", "true");
    const name = document.createElement("span"); name.className = "nt-n"; const heart = document.createElement("i"); heart.className = "nt-h"; heart.textContent = "♥";
    el.append(name, heart); this.overlay.appendChild(el);
    r = { key, el, name, heart, txt: null, bond: -1, focus: false, w: 0, h: 0, alpha: 0, op: "", sc: "", top: NaN, live: false, seen: false };
    this.recs.set(key, r); this.list.push(r); return r;
  }
  /** 프레임 시작: camera, 화면 폭·높이(px), 보이기 갈래, 건설 모드인지, 화면 모양(html[data-form]) */
  begin(camera, vw, vh, mode, build, form) {
    this.camera = camera; this.vw = vw; this.vh = vh; this.mode = tagMode(mode); this.build = !!build; this.cap = tagCap(form); this.n = 0;
    for (let i = 0; i < this.list.length; i++) this.list[i].seen = false;
    const b = this.blk; this.blk = [b[1], b[0]]; this.blk[1].n = 0;
  }
  /** 가림 칸 하나(화면 px): 다음 프레임에 이 칸과 겹치는 남의 이름표는 옅어짐. own = 그 말풍선 주인의 열쇠(제 이름표는 안 가림) */
  block(own, x0, y0, x1, y1) {
    let b = this.blk[1]; if (b.n >= b.size) { const nb = mkBlocks(b.size * 2); for (const f of ["x0", "y0", "x1", "y1", "own"]) nb[f].set(b[f]); nb.n = b.n; this.blk[1] = b = nb; }
    const j = b.n++; b.x0[j] = x0; b.y0[j] = y0; b.x1[j] = x1; b.y1[j] = y1; b.own[j] = own;
  }
  /** 이름표 후보 하나: key(같은 것은 늘 같은 열쇠) · 머리 위 월드 자리 · 글 · 따라가는 중인지 · 하트 단계(0~3, 없으면 0) */
  push(key, wx, wy, wz, text, focus = false, bond = 0) {
    if (this.mode === "off" || !text) return;
    const cam = this.camera, d = cam.position.distanceTo(_tagP.set(wx, wy, wz)), a = tagAlpha(d, this.mode, focus, this.build); if (a <= 0.01) return;
    _tagP.project(cam); if (_tagP.z > 1 || Math.abs(_tagP.x) > 1.15 || Math.abs(_tagP.y) > 1.15) return;   // 카메라 뒤·화면 밖
    const r = this.rec(key);
    if (r.txt !== text) { r.txt = text; r.name.textContent = text; r.w = 0; }     // 글은 textContent로만(이름은 바꿀 수 있음 → HTML로 넣지 않음)
    if (r.bond !== bond) { r.bond = bond; r.el.dataset.bond = String(bond); r.w = 0; }
    if (r.focus !== focus) { r.focus = focus; r.el.classList.toggle("focus", focus); }
    if (!r.w) { showEl(r.el, true); r.w = r.el.offsetWidth; r.h = r.el.offsetHeight; if (!r.w) return; }   // 크기는 글이 바뀔 때만 잼(숨어 있었으면 0 → 다음에 다시)
    if (this.n >= this.size) this.grow(this.size * 2);
    const s = tagScale(d), sx = (_tagP.x * 0.5 + 0.5) * this.vw, sy = (-_tagP.y * 0.5 + 0.5) * this.vh, b = this.blk[0];
    if (!focus && b.n && blockedBy(sx, sy, r.w * s, r.h * s, typeof key === "number" ? key : -1, b.n, b.x0, b.y0, b.x1, b.y1, b.own)) return;   // 남의 말풍선 밑: 옅어짐
    const i = this.n++; r.seen = true;
    this.cand[i] = r; this.x[i] = sx; this.y[i] = sy;
    this.w[i] = r.w * s; this.h[i] = r.h * s; this.d[i] = d; this.a[i] = a; this.focus[i] = focus ? 1 : 0; r.s = s;
  }
  /** 프레임 끝: 고르고(수·겹침) 놓고 옅게·짙게. dt: 초 */
  end(dt) {
    const n = this.n; pickTags(n, this.x, this.y, this.w, this.h, this.d, this.focus, this.cap, this.order, this.show);
    const k = this.mode === "off" ? 1 : Math.min(1, dt * TAG_EASE);                // 끄기: 바로 숨김
    for (let i = 0; i < n; i++) {
      const r = this.cand[i]; this.cand[i] = null; r.live = true;
      r.target = this.show[i] ? this.a[i] : 0;
      const half = this.w[i] / 2 + 2, x = Math.min(Math.max(this.x[i], half), Math.max(half, this.vw - half));   // 화면 가장자리에서 잘리지 않게
      placeEl(r.el, x, this.y[i]); r.top = this.y[i] - this.h[i];
      const sc = r.s.toFixed(2); if (r.sc !== sc) { r.sc = sc; r.el.style.setProperty("--s", sc); }
    }
    for (let j = 0; j < this.list.length; j++) {
      const r = this.list[j]; if (!r.seen) r.target = 0;                           // 이번 프레임에 없음(집 안·화면 밖·멂): 그 자리에서 옅어짐
      if (!r.seen && r.alpha <= 0.02) { if (!r.el.hidden) { r.el.hidden = true; r.alpha = 0; r.op = ""; } r.top = NaN; continue; }
      r.alpha += ((r.target ?? 0) - r.alpha) * k; if (Math.abs(r.alpha - r.target) < 0.01) r.alpha = r.target;
      const on = r.alpha > 0.02; showEl(r.el, on); if (!on) { r.top = NaN; continue; }
      const op = r.alpha.toFixed(2); if (r.op !== op) { r.op = op; r.el.style.opacity = op; }
      if (!r.seen || r.alpha < 0.3) r.top = NaN;                                   // 거의 안 보이는 표 위로는 말풍선을 안 올림
    }
  }
  /** 이 열쇠의 이름표 윗자리(화면 y px). 안 보이면 NaN — 말풍선이 이 위로 올라감 */
  topOf(key) { const r = this.recs.get(key); return r ? r.top : NaN; }
  /** 화면 겹을 비웠을 때(새 섬): 표를 다시 만들게 */
  reset() { for (const r of this.list) r.el.remove(); this.recs.clear(); this.list.length = 0; this.n = 0; this.cand.fill(null); }
  /** 밤: 표 둘레를 밝게(어두운 화면에서 테두리가 보이게) */
  setNight(on) { if (this.night === on) return; this.night = on; this.overlay.toggleAttribute("data-night", on); }
}

const mkBlocks = k => ({ n: 0, size: k, x0: new Float32Array(k), y0: new Float32Array(k), x1: new Float32Array(k), y1: new Float32Array(k), own: new Int32Array(k) });

/** 갈매미 이름표: world.units의 i번째 = 열쇠 i(말풍선과 같은 번호) */
export class GullTags {
  constructor(overlay) { this.tags = new HeadTags(overlay, "ntag"); }
  /** unitViews: render/views.js UnitViews(이번 프레임에 맞춘 몸 자리를 씀 — 들림·앉음·누움·헤엄·배가 다 반영됨) · follow: 따라가는 갈매미 */
  update(dt, world, unitViews, camera, vw, vh, { mode, build = false, follow = null, form = "wide", night = false } = {}) {
    const t = this.tags; t.setNight(night); t.begin(camera, vw, vh, mode, build, form);
    if (t.mode !== "off") {
      const us = world.units, vs = unitViews.views;
      for (let i = 0; i < us.length; i++) {
        const u = us[i], v = vs[i]; if (!v || !v.g.visible || u.insideBuildingId) continue;   // 집 안·모델이 아직 없음
        const h = Math.max(0.6, u.height ?? 0.8 * (u.scale || 1)), lie = v.lie || 0;
        const head = h * (lie > 0.5 ? 0.55 : u.state === "Sit" ? 0.85 : 1) + 0.1;   // 누우면(쓰러짐) 낮게 · 앉으면 조금 낮게
        const p = v.g.position; t.push(i, p.x, p.y + head, p.z, tagText(u), u === follow, bondStage(u.bond));
      }
    }
    t.end(dt);
  }
  topOf(i) { return this.tags.topOf(i); }
  /** 갈매미 i의 말풍선 칸(화면 px) — 다음 프레임에 남의 이름표가 그 밑이면 옅어짐 */
  block(i, x0, y0, x1, y1) { this.tags.block(i, x0, y0, x1, y1); }
  reset() { this.tags.reset(); }
}
