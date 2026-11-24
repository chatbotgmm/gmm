// 방 화면(실내 꾸미기): 집을 고르면 섬 대신 그 집의 방(바닥 + 뒷벽·왼쪽 벽)을 보여 주고 가구를 놓음.
//  · 누르기: 가구를 고르거나(고른 가구는 옮기기·돌리기·치우기), 놓을 가구가 있으면 그 칸에 미리 보기(초록 = 놓을 수 있음, 빨강 = 못 놓음)
//    같은 칸을 한 번 더 누르거나 ✅ 놓기로 확정. 마우스는 움직이면 미리 보기가 따라옴.
//  · 끌기: 방을 돌려 보기(왼쪽·뒤쪽 벽이 보이는 범위), 휠·벌리기: 확대
//  · 섬 조작과 섞이지 않게 화면 전체를 덮는 #roomTouch가 손가락을 받음. 마을 시간은 계속 흐름.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FURNITURE, FLOORS, WALLPAPERS, BUILDINGS } from "../data/catalog.js";
import * as F from "../world/furniture.js";
import { furnitureModel } from "./furniture.js";
import { Toon } from "./toon.js";

const ROOM_WALL_H = 2.4, ROOM_TAP_PX = 8;
const rel = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export class RoomView {
  constructor({ renderer, onExit }) {
    this.renderer = renderer; this.onExit = onExit; this.isOpen = false; this.tab = "furniture";
    const s = this.scene = new THREE.Scene(); s.background = new THREE.Color(0x30343c);
    this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
    s.add(new THREE.HemisphereLight(0xfff4e2, 0x8a7a6a, 1.1));
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 1.6); sun.position.set(4, 7, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 30 }); sun.shadow.bias = -0.0008; s.add(sun);
    this.root = new THREE.Group(); s.add(this.root);
    this.toon = new Toon(s, { snow: false });                                   // 방 안 가구엔 눈이 안 쌓임
    this.touch = document.getElementById("roomTouch"); this.ui = document.getElementById("room");
    const c = this.controls = new OrbitControls(this.camera, this.touch);
    Object.assign(c, { enablePan: false, enableDamping: true, minPolarAngle: 0.45, maxPolarAngle: 1.2, minAzimuthAngle: -0.25, maxAzimuthAngle: 1.45, minDistance: 4, maxDistance: 16 });
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2(); this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.touch.addEventListener("pointerdown", e => { this.press = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
    this.touch.addEventListener("pointerup", e => { const p = this.press; this.press = null; if (p && p.id === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) < ROOM_TAP_PX) this.tap(e); });
    this.touch.addEventListener("pointermove", e => { if (e.pointerType === "mouse" && this.ghost && !this.press) this.hover(e); });
    addEventListener("keydown", e => { if (!this.isOpen) return; if (e.code === "KeyR") this.rotate(); if (e.code === "Escape") this.ghost || this.sel != null ? this.cancel() : this.close(); if (e.code === "Delete") this.stow(); });
    this.ui.querySelector(".rexit").onclick = () => this.close();
    for (const b of this.ui.querySelectorAll(".rtabs button")) b.onclick = () => { this.tab = b.dataset.tab; this.refreshUI(); };
  }
  get L() { return F.levels(this.b)[this.li] || F.levels(this.b)[0]; }
  /** 층 바꾸기(2층집·큰 집) */
  setLevel(i) { this.li = i; this.sel = null; this.ghost = null; this.build(); this.fit(); this.refreshUI(); this.status(`${this.L.name}`); }
  open(world, b) {
    this.world = world; this.b = b; this.sel = null; this.ghost = null; this.isOpen = true; this.li = 0;
    F.room(b); this.build();
    const it = this.L, span = Math.max(it.w, it.d);
    this.controls.target.set(0, 0.4, 0); this.camera.position.set(span * 0.55, span * 0.95, span * 1.15); this.fit(); this.controls.update();
    this.touch.hidden = false; this.ui.hidden = false; document.body.classList.add("inroom"); this.refreshUI();
    this.offFurn = () => {}; this.status(`${BUILDINGS[b.defId].name}에 들어왔어요 · 가구를 골라 방에 놓아 보세요`);
  }
  /** 화면 모양에 맞춰 방 전체가 보이게: 세로 화면은 렌즈를 넓히고 더 멀리서 */
  fit() {
    const it = this.L, a = innerWidth / innerHeight, portrait = a < 1;
    this.camera.fov = portrait ? 55 : 40; this.camera.aspect = a; this.camera.updateProjectionMatrix();
    const span = Math.hypot(it.w, it.d) + 1, half = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const dist = span / 2 / Math.tan(half) / Math.min(1, a) * (portrait ? 1.05 : 0.95);   // 가로 폭이 화면 너비에 들어가게
    const off = this.camera.position.clone().sub(this.controls.target).setLength(dist); this.camera.position.copy(this.controls.target).add(off);
    this.controls.maxDistance = Math.max(16, dist * 1.4); this.lastAspect = a;
  }
  close() {
    if (!this.isOpen) return; this.isOpen = false; this.touch.hidden = true; this.ui.hidden = true; document.body.classList.remove("inroom");
    this.root.clear(); this.onExit?.();
  }
  status(t) { this.ui.querySelector(".rmsg").textContent = t; }
  // ---- 방 만들기
  cellCenter(x, z, sz) { const it = this.L; return new THREE.Vector3(x + sz.w / 2 - it.w / 2, 0, z + sz.d / 2 - it.d / 2); }
  build() {
    const it = this.L, r = this.root; r.clear(); this.items = []; const WH = it.wallH || ROOM_WALL_H;
    const m = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(it.w, 0.1, it.d), m(FLOORS[it.floor]?.color ?? 0xc49a6c)); floor.position.y = -0.05; floor.receiveShadow = true; r.add(floor);
    // 바닥 판자·타일 줄
    const lines = []; for (let x = 1; x < it.w; x++) lines.push(x - it.w / 2, 0.002, -it.d / 2, x - it.w / 2, 0.002, it.d / 2);
    for (let z = 1; z < it.d; z++) lines.push(-it.w / 2, 0.002, z - it.d / 2, it.w / 2, 0.002, z - it.d / 2);
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    this.grid = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 })); this.grid.userData.noToon = true; r.add(this.grid);
    const wc = WALLPAPERS[it.wallpaper]?.color ?? 0xf6eedc;
    const back = new THREE.Mesh(new THREE.BoxGeometry(it.w + 0.15, WH, 0.15), m(wc)); back.position.set(0.075 - 0.15, WH / 2, -it.d / 2 - 0.075); back.receiveShadow = true; r.add(back);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.15, WH, it.d), m(wc)); left.position.set(-it.w / 2 - 0.075, WH / 2, 0); left.receiveShadow = true; r.add(left);
    const trim = 0xe9dcc4;                                                         // 걸레받이
    const tb = new THREE.Mesh(new THREE.BoxGeometry(it.w, 0.12, 0.03), m(trim)); tb.position.set(0, 0.06, -it.d / 2 + 0.015); r.add(tb);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, it.d), m(trim)); tl.position.set(-it.w / 2 + 0.015, 0.06, 0); r.add(tl);
    // 창문(뒷벽)·문(왼쪽 벽)
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 0.04), new THREE.MeshStandardMaterial({ color: 0xbfe4f5, emissive: 0x9fd4f0, emissiveIntensity: 0.35 })); win.position.set(Math.min(1, it.w / 2 - 1), 1.45, -it.d / 2 + 0.01); r.add(win);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.42, 1.02, 0.03), m(0xffffff)); frame.position.copy(win.position).z -= 0.01; r.add(frame);
    if (this.li === 0) { const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.8, 0.9), m(0x9a6b45)); door.position.set(-it.w / 2 + 0.01, 0.9, it.d / 2 - 0.7); r.add(door); }   // 현관은 1층만
    // 칸막이벽(문 칸은 비움)
    for (const wl of it.walls || []) for (let z = wl.z0; z < wl.z1; z++) {
      if (wl.door && z >= wl.door[0] && z <= wl.door[1]) { const top = new THREE.Mesh(new THREE.BoxGeometry(0.12, WH - 2, 1), m(wc)); top.position.set(wl.x - it.w / 2, 2 + (WH - 2) / 2, z + 0.5 - it.d / 2); r.add(top); continue; }
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.12, WH * 0.85, 1), m(wc)); seg.position.set(wl.x - it.w / 2, WH * 0.425, z + 0.5 - it.d / 2); seg.castShadow = seg.receiveShadow = true; r.add(seg);
    }
    // 계단(아래층: 올라가는 디딤판) · 계단 구멍(위층: 난간 + 어두운 구멍)
    const st = it.stairs;
    if (st) {
      const c = this.cellCenter(st.x, st.z, { w: st.w, d: st.d }), long = st.w >= st.d, n = 6, len = long ? st.w : st.d;
      const ld = F.landing(st);
      if (ld) { const mk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.01, 0.9), new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.12 })); mk.position.copy(this.cellCenter(ld[0], ld[1], { w: 1, d: 1 })).y = 0.006; r.add(mk); }   // 계단 앞(비워 둠)
      if (st.dir === "up") for (let k = 0; k < n; k++) {
        const h = (k + 1) / n * WH * 0.9, step = new THREE.Mesh(new THREE.BoxGeometry(long ? len / n : (long ? 1 : st.w), h, long ? st.d : len / n), m(k % 2 ? 0xa8774a : 0xb98352));
        const t = -len / 2 + (k + 0.5) * len / n; step.position.set(c.x + (long ? -t : 0), h / 2, c.z + (long ? 0 : -t)); step.castShadow = step.receiveShadow = true; r.add(step);   // 벽 쪽(왼쪽·뒤)으로 올라감
      } else {
        const hole = new THREE.Mesh(new THREE.BoxGeometry(st.w - 0.05, 0.02, st.d - 0.05), m(0x2a2420)); hole.position.set(c.x, 0.012, c.z); r.add(hole);
        const rail = m(0x8a5a32); for (const [w, d, x, z] of [[st.w, 0.06, c.x, c.z + st.d / 2], [0.06, st.d, c.x + st.w / 2, c.z]]) { const b2 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), rail); b2.position.set(x, 0.75, z); r.add(b2);
          for (let k = 0; k <= 3; k++) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), rail); post.position.set(w > d ? x - w / 2 + k * w / 3 : x, 0.375, w > d ? z : z - d / 2 + k * d / 3); r.add(post); } }
      }
    }
    // 가구
    it.furniture.forEach((o, i) => { const g = furnitureModel(o.id), sz = F.size(o.id, o.rot); g.position.copy(this.cellCenter(o.x, o.z, sz)); g.rotation.y = -o.rot * Math.PI / 2; g.userData.index = i; r.add(g); this.items.push(g); });
    // 스탠드 불빛(방 안에서만, 최대 2개)
    it.furniture.filter(o => FURNITURE[o.id].light).slice(0, 2).forEach(o => { const p = new THREE.PointLight(0xffd59a, 2.5, 6, 1.5), sz = F.size(o.id, o.rot); p.position.copy(this.cellCenter(o.x, o.z, sz)).y = 1.3; r.add(p); });
    this.toon.sweep(); this.drawSel(); this.drawGhost();
  }
  // ---- 고르기·미리 보기
  rayAt(e) { const rc = this.touch.getBoundingClientRect(); this.ndc.set((e.clientX - rc.left) / rc.width * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1); this.ray.setFromCamera(this.ndc, this.camera); }
  cellAt(e) { this.rayAt(e); const p = this.ray.ray.intersectPlane(this.floorPlane, new THREE.Vector3()); if (!p) return null; const it = this.L; return { x: Math.floor(p.x + it.w / 2), z: Math.floor(p.z + it.d / 2) }; }
  anchor(c, id, rot) { const sz = F.size(id, rot); return { x: c.x - Math.floor((sz.w - 1) / 2), z: c.z - Math.floor((sz.d - 1) / 2) }; }
  tap(e) {
    if (this.ghost) {
      const c = this.cellAt(e); if (!c) return; const a = this.anchor(c, this.ghost.id, this.ghost.rot);
      if (a.x === this.ghost.x && a.z === this.ghost.z) return this.commit();   // 같은 칸을 한 번 더 = 놓기
      Object.assign(this.ghost, a); this.drawGhost(); this.refreshUI(); return;
    }
    this.rayAt(e); const hit = this.ray.intersectObjects(this.items, true)[0];
    let o = hit?.object; while (o && o.userData.index === undefined) o = o.parent;
    this.sel = o ? o.userData.index : null; this.drawSel(); this.refreshUI();
    if (this.sel != null) this.status(`${FURNITURE[this.L.furniture[this.sel].id].name}: 옮기기·돌리기·치우기`);
  }
  hover(e) { const c = this.cellAt(e); if (!c) return; Object.assign(this.ghost, this.anchor(c, this.ghost.id, this.ghost.rot)); this.drawGhost(); }
  startPlace(id) { const it = this.L; this.sel = null; this.ghost = { id, rot: 0, x: Math.floor(it.w / 2), z: Math.floor(it.d / 2), moving: null }; this.drawSel(); this.drawGhost(); this.refreshUI(); this.status(`${FURNITURE[id].name}: 놓을 칸을 누르세요(한 번 더 누르면 놓기 · R 돌리기)`); }
  startMove() { const o = this.L.furniture[this.sel]; if (!o) return; this.ghost = { id: o.id, rot: o.rot, x: o.x, z: o.z, moving: this.sel }; this.items[this.sel].visible = false; this.sel = null; this.drawSel(); this.drawGhost(); this.refreshUI(); this.status("옮길 칸을 누르세요"); }
  rotate() {
    if (this.ghost) { this.ghost.rot = (this.ghost.rot + 1) % 4; this.drawGhost(); this.refreshUI(); return; }
    if (this.sel == null) return; const o = this.L.furniture[this.sel];
    for (let k = 1; k <= 3; k++) if (F.move(this.world, this.b, this.sel, o.x, o.z, (o.rot + k) % 4, this.li)) { const s = this.sel; this.build(); this.sel = s; this.drawSel(); return; }
    this.status("돌릴 자리가 없어요");
  }
  commit() {
    const g = this.ghost, ok = g.moving != null ? F.move(this.world, this.b, g.moving, g.x, g.z, g.rot, this.li) : F.place(this.world, this.b, g.id, g.x, g.z, g.rot, this.li);
    if (!ok) return this.status("여기엔 놓을 수 없어요(벽 밖이거나 다른 가구와 겹쳐요)");
    this.status(`${FURNITURE[g.id].name}을 놓았어요`); this.ghost = null; this.build(); this.refreshUI();
  }
  stow() { if (this.sel == null) return; const id = this.L.furniture[this.sel].id; F.stow(this.world, this.b, this.sel, this.li); this.sel = null; this.build(); this.refreshUI(); this.status(`${FURNITURE[id].name}을 집 창고에 넣었어요`); }
  cancel() { this.ghost = null; this.sel = null; this.build(); this.refreshUI(); this.status(""); }
  drawSel() {
    this.items?.forEach((g, i) => g.traverse(m => { if (m.isMesh && m.material.emissive) { if (!m.userData.baseMat) m.userData.baseMat = m.material; m.material = i === this.sel ? selMat(m.userData.baseMat) : m.userData.baseMat; } }));
  }
  drawGhost() {
    if (this.ghostObj) { this.root.remove(this.ghostObj); this.ghostObj = null; }
    const g = this.ghost; this.grid.material.opacity = g || this.sel != null ? 0.3 : 0.12; if (!g) return;
    const ok = g.moving != null ? F.fits(this.L, g.id, g.x, g.z, g.rot, g.moving) : F.fits(this.L, g.id, g.x, g.z, g.rot);
    const obj = furnitureModel(g.id), tint = new THREE.MeshBasicMaterial({ color: ok ? 0x6fdc8c : 0xff6b6b, transparent: true, opacity: 0.55, depthWrite: false });
    obj.traverse(m => { if (m.isMesh) { m.material = tint; m.castShadow = false; } }); obj.userData.noToon = true;
    obj.position.copy(this.cellCenter(g.x, g.z, F.size(g.id, g.rot))); obj.rotation.y = -g.rot * Math.PI / 2; this.root.add(obj); this.ghostObj = obj; this.ghostOk = ok;
  }
  // ---- 아래 판(가구·바닥·벽지)
  refreshUI() {
    const w = this.world, b = this.b, it = this.L, list = this.ui.querySelector(".rlist"), act = this.ui.querySelector(".racts"); list.innerHTML = ""; act.innerHTML = "";
    const owner = w.units.find(u => u.unitId === b.owner), inside = w.units.filter(u => u.insideBuildingId === b.id);
    this.ui.querySelector(".rtitle").textContent = `🏠 ${BUILDINGS[b.defId].name}${owner ? ` · 주인 ${owner.name}` : " · 주인 없음"} · 🛋 아늑함 ${F.comfort(b)}`;
    this.ui.querySelector(".rwho").textContent = inside.length ? `지금 안에: ${inside.map(u => `${u.name}${u.useFurni ? `(${FURNITURE[u.useFurni.id].useLabel})` : ""}`).join(", ")}` : "";
    for (const t of this.ui.querySelectorAll(".rtabs button")) t.classList.toggle("on", t.dataset.tab === this.tab);
    const lvBox = this.ui.querySelector(".rlevels"), ls = F.levels(b); lvBox.innerHTML = "";
    if (ls.length > 1) ls.forEach((L, i) => { const bt = rel("button", i === this.li ? "on" : "", `${i + 1}층 ${L.name.replace(/^\d층\s*/, "")}`); bt.onclick = () => this.setLevel(i); lvBox.appendChild(bt); });
    else lvBox.appendChild(rel("span", "dim", it.name));
    if (this.tab === "furniture") {
      const av = F.available(w, b), ids = Object.keys(av);
      for (const id of ids) { const f = FURNITURE[id], bt = rel("button", this.ghost?.id === id && this.ghost.moving == null ? "on" : "", `${f.name} ×${av[id].n}`); bt.title = `${f.footprint.w}×${f.footprint.d}칸 · 아늑함 +${f.comfort}${av[id].from !== "stash" ? " · 낚시로 건진 가구(마을 가방)" : ""}`; bt.onclick = () => this.startPlace(id); list.appendChild(bt); }
      if (!ids.length) list.appendChild(rel("span", "dim", w.shopB() ? "놓을 가구가 없어요. 집주인이 돈이 모이면 잡화점에서 사 와요" : "놓을 가구가 없어요. 잡화점(마을 등급 ⚓ 항구 마을)이 생기면 집주인이 사 와요 · 낚시로 건진 가구도 놓을 수 있어요"));
    } else {
      const table = this.tab === "floor" ? FLOORS : WALLPAPERS, key = this.tab === "floor" ? "floor" : "wallpaper";
      for (const [id, d] of Object.entries(table)) { const bt = rel("button", it[key] === id ? "on" : "", d.name); const sw = rel("span", "sw"); sw.style.background = "#" + d.color.toString(16).padStart(6, "0"); bt.prepend(sw);
        bt.onclick = () => { it[key] = id; this.build(); this.refreshUI(); w.emit?.("furniture", { b }); }; list.appendChild(bt); }   // 바닥·벽지는 층마다
    }
    const add = (label, fn, cls = "") => { const bt = rel("button", cls, label); bt.onclick = fn; act.appendChild(bt); };
    if (this.ghost) { add("✅ 놓기", () => this.commit(), this.ghostOk ? "go" : ""); add("↻ 돌리기", () => this.rotate()); add("✕ 취소", () => this.cancel()); }
    else if (this.sel != null) { add("↔ 옮기기", () => this.startMove()); add("↻ 돌리기", () => this.rotate()); add("📦 치우기", () => this.stow()); add("✕", () => this.cancel()); }
  }
  update(dt) {
    if (!this.isOpen) return; this.controls.update();
    if (Math.abs(innerWidth / innerHeight - (this.lastAspect || 0)) > 0.01) this.fit();   // 화면을 돌리면 다시 맞춤
    if (this.whoT === undefined || (this.whoT -= dt) <= 0) { this.whoT = 1; const inside = this.world.units.filter(u => u.insideBuildingId === this.b.id); this.ui.querySelector(".rwho").textContent = inside.length ? `지금 안에: ${inside.map(u => `${u.name}${u.useFurni ? `(${FURNITURE[u.useFurni.id].useLabel})` : ""}`).join(", ")}` : ""; }
  }
}
const selCache = new Map();
function selMat(m) { if (!selCache.has(m)) { const s = m.clone(); s.emissive = new THREE.Color(0xffd36b); s.emissiveIntensity = 0.45; selCache.set(m, s); } return selCache.get(m); }
