// 화면 밖 ✨ 반짝이 방향 표시(편의성 점검 11번): 화면 가장자리에 작은 ✨ 화살표. 누르면 그 반짝이 쪽으로 화면을 옮김(보던 각도·높이 그대로).
// 계산(가장자리 점·각도·고르기)은 ui/edgeArrows.js(순수). 여기는 three.js 투영 + DOM(#sparkEdge)만. 둘러보기에서만(건설·방 안은 CSS가 숨김).
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";
import { edgeList } from "../ui/edgeArrows.js";

const sePos = new THREE.Vector3(), seVec = new THREE.Vector3();
export class SparkleEdge {
  constructor({ box, camera, controls, getWorld, onGo }) {
    Object.assign(this, { box, camera, controls, getWorld, onGo }); this.btns = new Map(); this.t = 0;
    box.addEventListener("click", e => { const b = e.target.closest?.("button[data-sid]"); if (b) this.go(+b.dataset.sid); });
  }
  /** 반짝이 하나의 세계 좌표 */
  pos(w, s) { return sePos.set(toWorldX(s.x + 0.5), (w.standHeight?.(s.x + 0.5, s.z + 0.5) ?? 0) + 0.6, toWorldZ(s.z + 0.5)); }
  /** 10번/초: 화면 밖 반짝이마다 가장자리 화살표(가까운 것부터 4개) */
  update(dt, on, edges) {
    this.t += dt; if (this.t < 0.1) return; this.t = 0;
    const w = this.getWorld(), list = on && w ? w.sparkles || [] : [];
    if (!list.length) { if (!this.box.hidden) { this.box.hidden = true; this.box.replaceChildren(); this.btns.clear(); } return; }
    const W = innerWidth, H = innerHeight, cam = this.camera, tg = this.controls.target, items = [];
    cam.updateMatrixWorld();
    for (const s of list) {
      const p = this.pos(w, s), dist = Math.hypot(p.x - tg.x, p.z - tg.z);
      seVec.copy(p).applyMatrix4(cam.matrixWorldInverse); const behind = seVec.z > 0;
      seVec.copy(p).project(cam); items.push({ id: s.id, dist, ndc: { x: seVec.x, y: seVec.y }, behind });
    }
    const arrows = edgeList(items, W, H, edges(W, H)), keep = new Set();
    for (const a of arrows) {
      keep.add(a.id); let b = this.btns.get(a.id);
      if (!b) { b = document.createElement("button"); b.dataset.sid = a.id; const story = list.find(o => o.id === a.id)?.story; b.setAttribute("aria-label", story ? "화면 밖 이야기 반짝이 쪽으로 가기" : "화면 밖 반짝이 쪽으로 가기"); b.dataset.tip = story ? "🗝 이야기 반짝이 · 누르면 그쪽으로" : "화면 밖 반짝이 · 누르면 그쪽으로"; b.innerHTML = story ? "🗝<i></i>" : "✨<i></i>"; this.box.appendChild(b); this.btns.set(a.id, b); }
      b.style.left = `${a.x.toFixed(0)}px`; b.style.top = `${a.y.toFixed(0)}px`; b.style.setProperty("--deg", `${a.deg.toFixed(0)}deg`);
    }
    for (const [id, b] of this.btns) if (!keep.has(id)) { b.remove(); this.btns.delete(id); }
    this.box.hidden = !this.btns.size;
  }
  /** 그 반짝이 쪽으로 화면 옮기기(보던 각도·거리 그대로) */
  go(id) {
    const w = this.getWorld(), s = (w?.sparkles || []).find(o => o.id === id); if (!s) return;
    const p = this.pos(w, s), t = this.controls.target, off = this.camera.position.clone().sub(t);
    this.onGo?.(s); t.set(p.x, t.y, p.z); this.camera.position.copy(t).add(off); this.t = 1;
  }
}
