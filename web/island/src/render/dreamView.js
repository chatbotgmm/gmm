// 꿈방울 그림(world/dreams.js의 Dreams를 읽음): 자는 갈매미 머리 위(집 안에서 자면 그 집 지붕 위)에 둥실 뜬 연보라 방울 + 초승달.
// 방울 하나 = 스프라이트 하나(그리기 호출 1). 화면에서 늘 지름 DREAM_PX 이상(손가락 칸 44px), 누름 판정 반지름 DREAM_HIT_PX.
// 터뜨리면 방울이 커지며 옅어지고(DREAM_POP_SECS), 그 자리에 잠꼬대 말풍선(.emote.dreamTalk)이 DREAM_TALK_SECS 동안 떠 있음 — 집 안 갈매미도 보이게 말풍선은 방울 자리에.
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";
import { placeEl, showEl } from "../util.js";

export const DREAM_PX = 46;        // 방울이 화면에서 적어도 이 지름(px)
export const DREAM_HIT_PX = 30;    // 누름 판정 반지름(px): 지름 60px ≥ 손가락 칸 44px
export const DREAM_MAX_SIZE = 9;   // 크기 상한(m)
export const DREAM_POP_SECS = 0.35;      // 터지는 시간
export const DREAM_TALK_SECS = 5;        // 잠꼬대 말풍선이 떠 있는 시간
const DREAM_ROOF_GAP = 0.55, DREAM_HEAD_GAP = 0.5;   // 지붕·머리 위로 띄우는 높이(m)

function dreamBubbleTex() {                                                            // 연보라 비눗방울 + 노란 초승달 + 작은 별 둘(글꼴·이모지에 기대지 않게 직접 그림)
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const body = g.createRadialGradient(50, 46, 6, 64, 64, 58); body.addColorStop(0, "rgba(255,255,255,0.98)"); body.addColorStop(0.55, "rgba(222,212,255,0.93)"); body.addColorStop(1, "rgba(160,140,230,0.9)");
  g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fillStyle = body; g.fill();
  g.lineWidth = 5; g.strokeStyle = "rgba(70,52,120,0.85)"; g.stroke();             // 진한 테두리: 밤 화면·눈 위에서도 보이게
  g.beginPath(); g.arc(70, 66, 25, 0, Math.PI * 2); g.arc(80, 58, 22, 0, Math.PI * 2, true); g.fillStyle = "#ffd866"; g.fill("evenodd");   // 초승달
  g.lineWidth = 2.5; g.strokeStyle = "rgba(150,100,10,0.7)"; g.stroke();
  const star = (x, y, r) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, q = i % 2 ? r * 0.38 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); g.fillStyle = "#fff6c4"; g.fill(); };
  star(38, 44, 9); star(88, 92, 6);
  g.beginPath(); g.ellipse(44, 36, 11, 6, -0.6, 0, Math.PI * 2); g.fillStyle = "rgba(255,255,255,0.8)"; g.fill();   // 반사광
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const _dreamV = new THREE.Vector3();
const dreamMPerPx = (camera, pos, viewH) => 2 * camera.position.distanceTo(pos) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, viewH);

export class DreamView {
  /** root: 섬 그룹 · overlay: 말풍선 층 · getBuildingViews: () => BuildingViews(지붕 높이) */
  constructor(root, overlay, getBuildingViews) {
    this.root = root; this.overlay = overlay; this.getBuildingViews = getBuildingViews; this.tex = dreamBubbleTex(); this.t = 0;
    this.mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false, fog: false, toneMapped: false });   // 지붕·나무에 가리지 않게(누를 수 있는 것은 늘 보임)
    this.sprites = new Map(); this.pops = []; this.talks = [];                     // unitId → 스프라이트 · 터지는 중 · 잠꼬대 말풍선
  }
  /** 방울이 뜰 월드 자리(out에 씀): 밖이면 머리 위, 집 안이면 지붕 위(같은 집에 여럿이면 옆으로 벌림) */
  anchor(world, u, out, slot = 0, slots = 1) {
    const b = u.insideBuildingId && world.buildings.get(u.insideBuildingId), v = b && this.getBuildingViews?.()?.views.get(b.id);
    if (v) { const h = v.holder.position, off = (slot - (slots - 1) / 2) * 0.9; return out.set(h.x + off, h.y + v.height + DREAM_ROOF_GAP, h.z); }
    return out.set(toWorldX(u.x), (u.y ?? 0) + (u.height ?? 0.8) + DREAM_HEAD_GAP, toWorldZ(u.z));
  }
  update(dt, world, dreams, camera, vw, vh) {
    this.t += dt; const seen = new Set(), list = dreams?.sleepers || [], per = new Map();
    for (const u of list) { const k = u.insideBuildingId || `u${u.unitId}`; per.set(k, (per.get(k) || 0) + 1); }
    const idx = new Map();
    for (const u of list) {
      seen.add(u.unitId); let sp = this.sprites.get(u.unitId);
      if (!sp) { sp = new THREE.Sprite(this.mat.clone()); sp.userData.noToon = true; sp.userData.dreamUnit = u.unitId; sp.renderOrder = 11; sp.userData.born = this.t; this.root.add(sp); this.sprites.set(u.unitId, sp); }
      const k = u.insideBuildingId || `u${u.unitId}`, i = idx.get(k) || 0; idx.set(k, i + 1);
      this.anchor(world, u, sp.position, i, per.get(k));
      const ph = this.t * 1.6 + list.indexOf(u) * 2.1, base = Math.min(DREAM_MAX_SIZE, Math.max(0.4, DREAM_PX * dreamMPerPx(camera, sp.position, vh)));
      const grow = Math.min(1, (this.t - sp.userData.born) / 0.4), k2 = base * (0.3 + 0.7 * grow) * (1 + 0.06 * Math.sin(ph * 1.3));   // 처음엔 작게 솟아오름 · 숨 쉬듯 살짝
      sp.scale.set(k2, k2, 1); sp.position.y += base * (u.insideBuildingId ? 2.3 : 1.9) + Math.sin(ph) * 0.12 * base;   // 머리 위 말풍선(zZ…)·지붕 위 표시(🪧 값·⚡✕ 전기 없음) 한 칸 위로 — 서로 가리지 않게(화면 px 기준)
      sp.material.opacity = Math.min(1, grow * 1.4);
    }
    for (const [id, sp] of this.sprites) if (!seen.has(id)) { this.root.remove(sp); sp.material.dispose(); this.sprites.delete(id); }   // 깨면 조용히 사라짐
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]; p.t += dt; const f = Math.min(1, p.t / DREAM_POP_SECS);
      p.sp.scale.setScalar(p.k0 * (1 + 0.8 * f)); p.sp.material.opacity = 1 - f;
      if (f >= 1) { this.root.remove(p.sp); p.sp.material.dispose(); this.pops.splice(i, 1); }
    }
    for (let i = this.talks.length - 1; i >= 0; i--) {                            // 잠꼬대 말풍선: 방울 자리를 따라 화면에
      const tk = this.talks[i]; tk.t -= dt;
      if (tk.t <= 0) { tk.el.remove(); this.talks.splice(i, 1); continue; }
      _dreamV.copy(tk.at).project(camera); const off = _dreamV.z > 1 || Math.abs(_dreamV.x) > 1.2 || Math.abs(_dreamV.y) > 1.2; showEl(tk.el, !off); if (off) continue;
      const half = Math.min(tk.el.offsetWidth / 2 || 0, vw / 2 - 8), x = Math.max(8 + half, Math.min(vw - 8 - half, (_dreamV.x * 0.5 + 0.5) * vw));   // 화면 밖으로 넘치지 않게
      let y = (-_dreamV.y * 0.5 + 0.5) * vh; const msg = document.getElementById("msg"), mr = msg && !msg.hidden ? msg.getBoundingClientRect() : null;
      if (mr && mr.height && x + half > mr.left && x - half < mr.right) y = Math.max(y, mr.bottom + tk.el.offsetHeight + 14);   // 위쪽 알림 줄(같은 잠꼬대 글)에 가리지 않게 그 아래로
      placeEl(tk.el, x, y); tk.el.style.opacity = Math.min(1, tk.t / 0.4).toFixed(2);
    }
  }
  /** 화면 좌표에서 DREAM_HIT_PX 안의 가장 가까운 방울의 unitId(없으면 null). dom = 그리는 캔버스 */
  hit(cx, cy, camera, dom, rpx = DREAM_HIT_PX) {
    const r = dom.getBoundingClientRect(); let best = null, bd = rpx;
    for (const [id, sp] of this.sprites) {
      sp.getWorldPosition(_dreamV).project(camera); if (_dreamV.z < -1 || _dreamV.z > 1) continue;
      const d = Math.hypot(r.left + (_dreamV.x + 1) / 2 * r.width - cx, r.top + (1 - _dreamV.y) / 2 * r.height - cy);
      if (d <= bd) { bd = d; best = id; }
    }
    return best;
  }
  /** 방울을 터뜨린 그림 + 잠꼬대 말풍선 */
  pop(unitId, talk) {
    const sp = this.sprites.get(unitId); if (!sp) return false; this.sprites.delete(unitId);
    this.pops.push({ sp, t: 0, k0: sp.scale.x });
    if (talk) {
      const el = document.createElement("div"); el.className = "emote dreamTalk pop"; el.textContent = talk; el.hidden = true; this.overlay.appendChild(el);
      this.talks.push({ el, t: DREAM_TALK_SECS, at: sp.position.clone() });
    }
    return true;
  }
  /** 이 방울이 화면에서 몇 px 지름인가(확인용) */
  screenPx(unitId, camera, viewH) { const sp = this.sprites.get(unitId); return sp ? sp.scale.x / dreamMPerPx(camera, sp.getWorldPosition(_dreamV), viewH) : 0; }
  dispose() {
    for (const sp of this.sprites.values()) { this.root.remove(sp); sp.material.dispose(); }
    for (const p of this.pops) { this.root.remove(p.sp); p.sp.material.dispose(); }
    for (const tk of this.talks) tk.el.remove();
    this.sprites.clear(); this.pops = []; this.talks = []; this.mat.dispose(); this.tex.dispose();
  }
}
