// 방 화면(실내 꾸미기): 집을 고르면 섬 대신 그 집의 방(바닥 + 네 벽, 카메라 쪽 벽은 낮게 자름)을 보여 주고 가구를 놓음.
//  · 문을 누르면 다른 방으로(작은 집은 원룸), 현관(🚪 밖으로)을 누르면 나감. 계단을 누르면 위·아래층으로
//  · 누르기: 가구를 고르거나(고른 가구는 옮기기·돌리기·치우기), 놓을 가구가 있으면 그 칸에 미리 보기(초록 = 놓을 수 있음, 빨강 = 못 놓음)
//    같은 칸을 한 번 더 누르거나 ✅ 놓기로 확정. 마우스는 움직이면 미리 보기가 따라옴.
//  · 끌기: 방을 한 바퀴 돌려 보기, 휠·벌리기: 확대
//  · 섬 조작과 섞이지 않게 화면 전체를 덮는 #roomTouch가 손가락을 받음. 마을 시간은 계속 흐름.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FURNITURE, FLOORS, WALLPAPERS, BUILDINGS, ITEMS } from "../data/catalog.js";
import { DONATE_GIFTS } from "../world/aquarium.js";
import * as F from "../world/furniture.js";
import { furnitureModel } from "./furniture.js";
import { Toon } from "./toon.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

// 마을 가방 가구가 어디서 왔는지(가구 버튼 설명용): 도장 가게 · 계절 축제 · 수족관 기념 선물 · 낚시
const roomFurniSource = itemId => { const it = ITEMS.find(i => i.id === itemId); if (!it) return "마을 가방의 가구";
  if (it.stamp) return "도장 가게에서 바꾼 가구"; if (it.fest) return "계절 축제 기념 가구";
  return DONATE_GIFTS.some(g => g.item === it.id) ? "낚시로 건졌거나 수족관 기념으로 받은 가구" : "낚시로 건진 가구"; };

const ROOM_WALL_H = 2.4, ROOM_TAP_PX = 8;
/** 이불: 침대(1×2칸, 베개 = −z) 위 누운 갈매미를 어깨 아래부터 덮는 천(머리는 베개 위로 나옴). 몸 위는 볼록(몸 크기에 맞춤), 양옆은 침대 밖으로 늘어짐, 발치는 납작. 원점 = 침대 가운데, 높이는 BLANKET_BASE 기준 */
const BLANKET_BASE = 0.48;
/** fit(갈매미마다 잰 누운 몸 크기, 침대 기준 좌표): z0 = 어깨(이불 시작), zFeet = 발끝, peak = 몸 높이(BLANKET_BASE 위), halfW = 몸 반폭 */
function makeBlanket(color, fit) {
  const humpW = Math.min(0.8, Math.max(0.15, fit.halfW + 0.05 + (fit.len > 1.1 ? 0.12 : 0))), edge = Math.max(0.42, humpW), half = edge + 0.08;
  const zEnd = Math.max(0.95, fit.zFeet + 0.12), len = zEnd - fit.z0;
  const g = new THREE.PlaneGeometry(half * 2, len, 22, 20); g.rotateX(-Math.PI / 2); g.translate(0, 0, fit.z0 + len / 2);
  const pos = g.attributes.position, ss = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), axh = Math.abs(x) / humpW;
    const hump = axh < 1 ? Math.pow(Math.cos(axh * Math.PI / 2), 0.45) : 0, along = ss(fit.z0 - 0.02, fit.z0 + 0.18 * fit.len, z) * 0.75 + 0.25 - ss(fit.zFeet - 0.05, fit.zFeet + 0.2, z);   // 어깨에서 완만히 올라가 몸 위 볼록, 발 뒤는 납작
    let y = 0.02 + (fit.peak * Math.max(0, along) + 0.02) * hump + 0.012 * Math.sin(x * 17 + z * 6);
    if (Math.abs(x) > edge) y = 0.02 - (Math.abs(x) - edge) / 0.08 * 0.2;          // 침대 옆으로 늘어짐
    if (z < fit.z0 + 0.05) y += (fit.z0 + 0.05 - z) * 0.3;                        // 어깨 쪽 끝을 살짝 접어 올림
    pos.setY(i, y);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide })); m.castShadow = m.receiveShadow = true;
  const grp = new THREE.Group(); grp.add(m); return grp;
}
const SHOULDER = 0.42, PILLOW_END = -0.52;                                       // PILLOW_END: 베개 앞(발치 쪽) 끝 z(furniture.js 침대: 베개 z −0.68 ± 0.14)                                                           // 누운 몸 길이 중 머리~어깨 비율(이불은 그 뒤부터)
const WING_BONES = ["wing_upperL", "wing_upperR", "upperarmL", "upperarmR", "wingL", "wingR"];   // 갈매미 모델마다 날개 뼈 이름이 다름(자이언트 = 팔 upperarm + 깃털 wing 따로)
/** 누운 자세(침대 가운데, 머리 = −z)에서 몸이 차지하는 범위를 꼭짓점으로 잼(날개 접은 채). 갈매미마다 한 번 */
function measureLying(v) {
  let m; for (const ws of [0.55, 0.4, 0.28]) { m = measureAt(v, ws); m.wingScale = ws; if (m.xM <= 0.46) break; }   // 몸 폭이 침대(반폭 0.5) 안에 들 때까지 날개를 더 접음(자이언트처럼 날개가 큰 모델)
  return m;
}
function measureAt(v, ws) {
  const r = v.root, keep = { p: r.position.clone(), q: r.quaternion.clone(), parent: r.parent };
  keep.parent?.remove(r); r.position.set(0, 0.52, 0); r.rotation.set(-Math.PI / 2, 0, 0, "YXZ");
  for (const w of v.wings) w.scale.setScalar(ws); v.mixer.update(0); r.updateMatrixWorld(true);
  const t = new THREE.Vector3(), pts = []; let zMin = 9, zMax = -9, headY = -9;
  r.traverse(o => { if (!o.isSkinnedMesh) return; const n = o.geometry.attributes.position.count;
    for (let k = 0; k < n; k += 2) { o.getVertexPosition(k, t); t.applyMatrix4(o.matrixWorld); pts.push(t.x, t.y, t.z); zMin = Math.min(zMin, t.z); zMax = Math.max(zMax, t.z); } });
  const wingZ = Math.min(9, ...v.wings.map(w => w.getWorldPosition(t).z));          // 날개 뿌리(어깨) 위치(누운 자세 그대로일 때 잼)
  r.position.copy(keep.p); r.quaternion.copy(keep.q); keep.parent?.add(r);
  const zSh = zMin + SHOULDER * (zMax - zMin); let xM = 0, yM = -9;                 // 이불 아래(어깨~발) 몸통만으로 폭·높이(머리·볏은 빼고)
  for (let i = 0; i < pts.length; i += 3) { if (pts[i + 2] >= zSh) { xM = Math.max(xM, Math.abs(pts[i])); yM = Math.max(yM, pts[i + 1]); } else headY = Math.max(headY, pts[i + 1]); }
  return { xM, yM, zMin, zMax, headY, wingZ };
}
/** 문 위 글씨(스프라이트) */
function label(text) {
  const c = document.createElement("canvas"), x = c.getContext("2d"), f = 30; x.font = `bold ${f}px sans-serif`; const w = Math.ceil(x.measureText(text).width) + 24;
  c.width = w; c.height = f + 18; x.font = `bold ${f}px sans-serif`; x.fillStyle = "rgba(255,255,255,0.92)"; x.beginPath(); x.roundRect(0, 0, w, c.height, 14); x.fill();
  x.fillStyle = "#4a3a2a"; x.textBaseline = "middle"; x.fillText(text, 12, c.height / 2 + 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(w / c.height * 0.32, 0.32, 1); sp.renderOrder = 5; sp.userData.noToon = true; return sp;
}
const rel = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export class RoomView {
  constructor({ renderer, onExit }) {
    this.renderer = renderer; this.onExit = onExit; this.isOpen = false; this.tab = "furniture";
    const s = this.scene = new THREE.Scene(); s.background = new THREE.Color(0x30343c);
    this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
    s.add(new THREE.HemisphereLight(0xfff4e2, 0x8a7a6a, 1.1));
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 1.6); sun.position.set(4, 7, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 30 }); sun.shadow.bias = -0.0008; s.add(sun);
    this.root = new THREE.Group(); s.add(this.root); this.gulls = new Map(); this.chars = null;   // chars: 갈매미 모델(main이 넣어 줌)
    this.toon = new Toon(s, { snow: false });                                   // 방 안 가구엔 눈이 안 쌓임
    this.touch = document.getElementById("roomTouch"); this.ui = document.getElementById("room");
    this.bubbleBox = document.createElement("div"); this.bubbleBox.className = "roomBubbles"; this.bubbleBox.hidden = true; document.body.appendChild(this.bubbleBox); this.bubbles = new Map();   // 방 안 갈매미 말풍선(섬과 같은 모양)
    const c = this.controls = new OrbitControls(this.camera, this.touch);
    Object.assign(c, { enablePan: false, enableDamping: true, minPolarAngle: 0.45, maxPolarAngle: 1.2, minDistance: 4, maxDistance: 16 });
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
    this.onSound?.("doorIn"); this.touch.hidden = false; this.ui.hidden = false; this.bubbleBox.hidden = false; document.body.classList.add("inroom"); this.refreshUI();
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
    if (!this.isOpen) return; this.isOpen = false; this.onSound?.("doorOut"); this.touch.hidden = true; this.ui.hidden = true; this.bubbleBox.hidden = true; document.body.classList.remove("inroom");
    this.root.clear(); this.onExit?.();
  }
  status(t) { this.ui.querySelector(".rmsg").textContent = t; }
  // ---- 방 만들기
  cellCenter(x, z, sz) { const it = this.L; return new THREE.Vector3(x + sz.w / 2 - it.w / 2, 0, z + sz.d / 2 - it.d / 2); }
  build() {
    const it = this.L, r = this.root; r.clear(); this.items = []; this.gullT = 0; this.levelsNow = F.levels(this.b);   // 다시 그리면 갈매미도 다시 놓음
    const WH = it.wallH || ROOM_WALL_H;
    const m = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(it.w, 0.1, it.d), m(FLOORS[it.floor]?.color ?? 0xc49a6c)); floor.position.y = -0.05; floor.receiveShadow = true; r.add(floor);
    // 바닥 판자·타일 줄
    const lines = []; for (let x = 1; x < it.w; x++) lines.push(x - it.w / 2, 0.002, -it.d / 2, x - it.w / 2, 0.002, it.d / 2);
    for (let z = 1; z < it.d; z++) lines.push(-it.w / 2, 0.002, z - it.d / 2, it.w / 2, 0.002, z - it.d / 2);
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    this.grid = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 })); this.grid.userData.noToon = true; r.add(this.grid);
    const wc = WALLPAPERS[it.wallpaper]?.color ?? 0xf6eedc;
    // 네 벽: 카메라 쪽 벽은 낮게 잘라(무릎 높이) 안이 보이게 함(update에서 매 프레임). 문을 누르면 다른 방으로 가거나 밖으로 나감
    this.walls = []; this.doorHits = [];
    const trim = 0xe9dcc4, wmat = m(wc), T = 0.15, STUB = 0.45;
    const SIDES = { N: [it.w, 0, -it.d / 2 - T / 2, 0], S: [it.w, 0, it.d / 2 + T / 2, Math.PI], W: [it.d, -it.w / 2 - T / 2, 0, Math.PI / 2], E: [it.d, it.w / 2 + T / 2, 0, -Math.PI / 2] };
    const along = (side, at, len) => (side === "N" || side === "E" ? 1 : -1) * (at + 0.5 - len / 2);   // 문 칸 번호 → 벽 그룹 안 x
    for (const [side, [len, x, z, ry]] of Object.entries(SIDES)) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; r.add(g);           // 그룹의 +z = 방 안쪽
      const full = new THREE.Mesh(new THREE.BoxGeometry(len + 2 * T, WH, T), wmat); full.position.y = WH / 2; full.receiveShadow = full.castShadow = true;
      const stub = new THREE.Mesh(new THREE.BoxGeometry(len + 2 * T, STUB, T), wmat); stub.position.y = STUB / 2; stub.receiveShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(len + 2 * T, 0.03, T + 0.02), m(trim)); stub.add(cap); cap.position.y = STUB / 2 + 0.015;
      const tb = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.03), m(trim)); tb.position.set(0, 0.06, T / 2 + 0.015);
      g.add(full, stub, tb);
      const tall = [];                                                             // 잘린 벽에선 숨길 것(창문·문짝)
      const doors = (it.doors || []).filter(d => d.wall === side);
      for (const d of doors) {
        const ax = along(side, d.at, len), exit = d.to === "exit";
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.05), m(exit ? 0x8a5a36 : 0xc49a6c)); panel.position.set(ax, 0.95, T / 2 + 0.03);
        const fr = new THREE.Mesh(new THREE.BoxGeometry(1.04, 2.0, 0.03), m(0xf3ead8)); fr.position.set(ax, 1.0, T / 2 + 0.012);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), m(0xe0b84a)); knob.position.set(0.3, -0.05, 0.04); panel.add(knob);
        const mat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.5), m(exit ? 0xb5523b : 0x7f9a6a)); mat.position.set(ax, 0.012, T / 2 + 0.3);   // 문 앞 깔개(벽이 잘려도 보이고 눌림)
        const sign = label(exit ? "🚪 밖으로" : `🚪 ${this.levelsNow[d.to]?.name ?? "방"}`); sign.position.set(ax, 2.25, T / 2 + 0.08);
        for (const o of [panel, mat, sign]) { o.userData.go = d.to; this.doorHits.push(o); }
        g.add(panel, fr, mat, sign); tall.push(panel, fr); this.walls.push({ g, full, stub, tall, sign, side, signY: [2.25, 0.75] });
      }
      if (!doors.length && (side === "N" || side === "E")) {                       // 문이 없는 뒤·오른쪽 벽엔 창문
        const win = new THREE.Mesh(new THREE.BoxGeometry(Math.min(1.3, len - 1), 0.9, 0.04), new THREE.MeshStandardMaterial({ color: 0xbfe4f5, emissive: 0x9fd4f0, emissiveIntensity: 0.35 })); win.position.set(0, 1.45, T / 2 + 0.01);
        const wf = new THREE.Mesh(new THREE.BoxGeometry(Math.min(1.42, len - 0.88), 1.02, 0.03), m(0xffffff)); wf.position.set(0, 1.45, T / 2 + 0.002); g.add(win, wf); tall.push(win, wf);
      }
      if (!doors.length) this.walls.push({ g, full, stub, tall, side });
      else this.walls.filter(w => w.g === g).forEach(w => { w.tall = tall; });
    }
    this.cutWalls(true);
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
      if (st.to != null) { const sg = label(st.dir === "up" ? "⬆ 위층" : "⬇ 아래층"); sg.position.set(c.x, st.dir === "up" ? WH * 0.9 + 0.35 : 0.9, c.z); sg.userData.go = st.to; this.doorHits.push(sg); r.add(sg); }
      if (st.dir === "up") for (let k = 0; k < n; k++) {
        const h = (k + 1) / n * WH * 0.9, step = new THREE.Mesh(new THREE.BoxGeometry(long ? len / n : (long ? 1 : st.w), h, long ? st.d : len / n), m(k % 2 ? 0xa8774a : 0xb98352));
        const t = -len / 2 + (k + 0.5) * len / n; step.position.set(c.x + (long ? -t : 0), h / 2, c.z + (long ? 0 : -t)); step.castShadow = step.receiveShadow = true; step.userData.go = st.to; this.doorHits.push(step); r.add(step);   // 벽 쪽(왼쪽·뒤)으로 올라감
      } else {
        const hole = new THREE.Mesh(new THREE.BoxGeometry(st.w - 0.05, 0.02, st.d - 0.05), m(0x2a2420)); hole.position.set(c.x, 0.012, c.z); hole.userData.go = st.to; this.doorHits.push(hole); r.add(hole);
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
  /** 문·계단: 다른 방으로 가거나 밖으로 */
  go(to) {
    if (to === "exit") return this.close();
    if (typeof to !== "number" || !F.levels(this.b)[to]) return;
    this.onSound?.("doorIn"); this.setLevel(to);
  }
  /** 카메라가 벽 바깥쪽에 있으면 그 벽은 낮게(안이 보이게), 아니면 온전히 */
  cutWalls(force = false) {
    if (!this.walls) return; const cam = this.camera.position;
    for (const w of this.walls) {
      const n = new THREE.Vector3(0, 0, -1).applyQuaternion(w.g.quaternion), cut = cam.clone().sub(w.g.position).dot(n) > 0.2;   // n = 바깥쪽
      if (!force && w.cut === cut) continue; w.cut = cut;
      w.full.visible = !cut; w.stub.visible = cut; for (const o of w.tall || []) o.visible = !cut;
      if (w.sign) w.sign.position.y = w.signY[cut ? 1 : 0];
    }
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
    this.rayAt(e);
    const door = this.ray.intersectObjects(this.doorHits || [], false).find(h => h.object.visible);
    if (door && this.sel == null) return this.go(door.object.userData.go);
    const hit = this.ray.intersectObjects(this.items, true)[0];
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
    this.onSound?.("furniture"); this.status(`${FURNITURE[g.id].name}을 놓았어요`); this.ghost = null; this.build(); this.refreshUI();
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
    if (ls.length > 1) ls.forEach((L, i) => { const bt = rel("button", i === this.li ? "on" : "", L.name); bt.onclick = () => this.setLevel(i); lvBox.appendChild(bt); });
    else lvBox.appendChild(rel("span", "dim", it.name));
    if (this.tab === "furniture") {
      const av = F.available(w, b), ids = Object.keys(av);
      for (const id of ids) { const f = FURNITURE[id], bt = rel("button", this.ghost?.id === id && this.ghost.moving == null ? "on" : "", `${f.name} ×${av[id].n}`); bt.title = `${f.footprint.w}×${f.footprint.d}칸 · 아늑함 +${f.comfort}${av[id].from !== "stash" ? ` · ${roomFurniSource(av[id].item)}(마을 가방)` : ""}`; bt.onclick = () => this.startPlace(id); list.appendChild(bt); }
      if (!ids.length) list.appendChild(rel("span", "dim", w.shopB() ? "놓을 가구가 없어요. 집주인이 돈이 모이면 잡화점에서 사 와요" : "놓을 가구가 없어요. 잡화점(마을 등급 ⚓ 항구 마을)이 생기면 집주인이 사 와요 · 낚시·축제·도장 가게에서 얻은 가구도 놓을 수 있어요"));
    } else {
      const table = this.tab === "floor" ? FLOORS : WALLPAPERS, key = this.tab === "floor" ? "floor" : "wallpaper";
      for (const [id, d] of Object.entries(table)) { const bt = rel("button", it[key] === id ? "on" : "", d.name); const sw = rel("span", "sw"); sw.style.background = "#" + d.color.toString(16).padStart(6, "0"); bt.prepend(sw);
        bt.onclick = () => { it[key] = id; this.build(); this.refreshUI(); w.emit?.("furniture", { b }); }; list.appendChild(bt); }   // 바닥·벽지는 층마다
    }
    const add = (label, fn, cls = "") => { const bt = rel("button", cls, label); bt.onclick = fn; act.appendChild(bt); };
    if (this.ghost) { add("✅ 놓기", () => this.commit(), this.ghostOk ? "go" : ""); add("↻ 돌리기", () => this.rotate()); add("✕ 취소", () => this.cancel()); }
    else if (this.sel != null) { add("↔ 옮기기", () => this.startMove()); add("↻ 돌리기", () => this.rotate()); add("📦 치우기", () => this.stow()); add("✕", () => this.cancel()); }
  }
  // ---- 방 안의 갈매미: 집에 들어온 갈매미를 그 층에 보여 주고 가구를 씀(침대 = 누워 자기, 의자·소파 = 앉기, 책장 = 앞에 서서 읽기, 없으면 방에 서 있기)
  async gullModel(u) {
    let v = this.gulls.get(u.unitId); if (v) return v;
    v = { root: null }; this.gulls.set(u.unitId, v);
    const pool = await this.chars; const ch = pool?.get?.(u.name); if (!ch) return v;
    const root = SkeletonUtils.clone(ch.root), mixer = new THREE.AnimationMixer(root), acts = {};
    for (const [k, a] of Object.entries(ch.acts)) acts[k] = mixer.clipAction(a.getClip());
    root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    Object.assign(v, { root, mixer, acts, cur: null }); return v;
  }
  play(v, key, speed = 1) { if (!v.acts?.[key] || v.cur === key) return; v.acts[v.cur]?.fadeOut(0.25); v.acts[key].reset().fadeIn(0.25).play(); v.acts[key].timeScale = speed; v.cur = key; }
  async syncGulls() {
    const w = this.world, b = this.b, levels = F.levels(b), inside = w.units.filter(u => u.insideBuildingId === b.id);
    for (const [id, v] of this.gulls) if (!inside.some(u => u.unitId === id)) { v.root?.parent?.remove(v.root); v.blanket?.parent?.remove(v.blanket); }
    let free = 0;
    for (const u of inside) {
      const v = await this.gullModel(u); if (!v.root || !this.isOpen) continue;
      const o = u.useFurni, li = o ? levels.findIndex(L => L.furniture.includes(o)) : 0;
      if (li !== this.li) { if (v.root.parent) v.root.parent.remove(v.root); v.blanket?.parent?.remove(v.blanket); continue; }
      if (!v.root.parent) { this.root.add(v.root); this.toon.sweep(v.root); }
      const r = v.root; r.rotation.set(0, 0, 0);
      v.asleep = !!(o && FURNITURE[o.id].use === "sleep");
      if (v.blanket?.parent && !v.asleep) v.blanket.parent.remove(v.blanket);
      if (o) {
        const f = FURNITURE[o.id], sz = F.size(o.id, o.rot), c = this.cellCenter(o.x, o.z, sz), yaw = -o.rot * Math.PI / 2, use = f.use;
        if (use === "sleep") {                                                     // 누워서 이불 덮고 자기: 갈매미마다 몸 크기를 재서 머리를 베개(머리 끝 z −0.8)에 맞추고 이불도 몸에 맞춤
          this.play(v, "Idle", 0.35); v.wings ||= WING_BONES.map(n => v.root.getObjectByName(n)).filter(Boolean);
          const m = v.lying ||= measureLying(v), len = m.zMax - m.zMin, fx = Math.sin(yaw), fz = Math.cos(yaw);
          const top = Math.max(-0.8, PILLOW_END - SHOULDER * len), shift = top - m.zMin;   // 머리 끝 z −0.8. 몸이 짧으면(미니) 어깨가 베개 바로 앞에 오게(이불이 베개를 덮지 않게)
          r.position.set(c.x + fx * shift, 0.52, c.z + fz * shift); r.rotation.set(-Math.PI / 2, yaw, 0, "YXZ");
          const z0 = Math.max(PILLOW_END - 0.03, Math.min(top + SHOULDER * len, m.wingZ + shift - 0.1));   // 어깨(날개 뿌리 조금 앞)부터 덮음(몸이 긴 자이언트는 날개가 머리 쪽). 베개 위는 안 덮음(미니 머리가 가려짐)
          const fit = { z0, zFeet: m.zMax + shift, peak: Math.max(0.04, m.yM - BLANKET_BASE + 0.03), halfW: m.xM, len };
          const hz = top + 0.18 * len; v.head = new THREE.Vector3(c.x + fx * hz, Math.max(m.headY, m.yM) + 0.12, c.z + fz * hz);   // 말풍선 자리(머리 위)
          if (!v.blanket || v.blanketFor !== o.id) { v.blanket?.parent?.remove(v.blanket); v.blanket = makeBlanket(f.colors?.[2] ?? 0x9fb7c9, fit); v.blanketFor = o.id; }
          v.blanket.position.set(c.x, BLANKET_BASE, c.z); v.blanket.rotation.y = yaw; if (!v.blanket.parent) { this.root.add(v.blanket); this.toon.sweep(v.blanket); }
        }   // 머리가 베개(침대 뒤쪽 −z) 쪽, 천천히 숨쉬기          // 침대에 누워 새근새근(천천히 숨쉬기)
        else if (use === "sit") { r.position.set(c.x, f.id === "sofa" ? 0.36 : 0.42, c.z); r.rotation.y = yaw; this.play(v, "Sit"); }
        else { const fx = Math.sin(yaw), fz = Math.cos(yaw); r.position.set(c.x + fx * 0.75, 0, c.z + fz * 0.75); r.rotation.y = yaw + Math.PI; this.play(v, "Idle", 0.8); }   // 책장 앞에 서서 읽기
      } else {                                                                     // 쓸 가구가 없으면 빈자리에 서 있음
        const L = levels[0], spots = []; for (let z = 0; z < L.d; z++) for (let x = 0; x < L.w; x++) if (F.fits(L, "chair", x, z, 0)) spots.push([x, z]);
        const s = spots[(free++ * 7 + 3) % Math.max(1, spots.length)] || [1, 1], c = this.cellCenter(s[0], s[1], { w: 1, d: 1 });
        r.position.set(c.x, 0, c.z); r.rotation.y = Math.PI * 0.25; this.play(v, "Idle");
      }
    }
  }
  /** 방 안 갈매미 말풍선: 이 방에 보이는 갈매미의 말(u.emoteText)을 머리 위에. 누워 자면 머리(베개) 쪽 위 */
  drawBubbles() {
    const W = innerWidth, H = innerHeight, seen = new Set(), p = new THREE.Vector3();
    for (const [id, v] of this.gulls) {
      const u = this.world.units.find(x => x.unitId === id), e = this.bubbleFor(id); seen.add(id);
      const show = !!(v.root?.parent && u && u.insideBuildingId === this.b.id && u.emoteT > 0 && u.emoteText); e.hidden = !show; if (!show) { e.dataset.t = ""; continue; }
      const lying = Math.abs(v.root.rotation.x) > 0.5; v.root.getWorldPosition(p);
      if (lying && v.head) p.copy(v.head); else p.y += (v.root.rotation.x ? 0.9 : 1.05) + (v.cur === "Sit" ? 0 : 0.05);
      const dist = this.camera.position.distanceTo(p); p.project(this.camera); if (p.z > 1) { e.hidden = true; continue; }
      if (e.dataset.t !== u.emoteText) {
        e.dataset.t = u.emoteText; e.textContent = u.emoteText; const t = u.emoteText, think = t.startsWith("💭"), icon = [...t].length <= 2 || /^(…|zZ…|!\?)$/.test(t);
        e.className = "emote" + (think ? " think" : icon ? " icon" : ""); void e.offsetWidth; e.classList.add("pop");
      }
      e.style.left = `${(p.x * 0.5 + 0.5) * W}px`; e.style.top = `${(-p.y * 0.5 + 0.5) * H}px`;
      e.style.setProperty("--s", THREE.MathUtils.clamp(1.35 - dist / 25, 0.8, 1.2).toFixed(2)); e.style.opacity = Math.min(1, u.emoteT / 0.3).toFixed(2);
    }
    for (const [id, e] of this.bubbles) if (!seen.has(id)) e.hidden = true;
  }
  bubbleFor(id) { let e = this.bubbles.get(id); if (!e) { e = document.createElement("div"); e.className = "emote"; e.hidden = true; this.bubbleBox.appendChild(e); this.bubbles.set(id, e); } return e; }
  update(dt) {
    if (!this.isOpen) return; this.controls.update(); this.cutWalls();
    this.breath = (this.breath || 0) + dt;
    for (const v of this.gulls.values()) { if (v.root?.parent) v.mixer.update(dt); if (v.blanket?.parent) v.blanket.scale.y = 1 + 0.04 * Math.sin(this.breath * 1.6);   // 이불이 숨 쉬듯 오르내림
      for (const w of v.wings || []) w.scale.setScalar(v.asleep ? v.lying?.wingScale ?? 0.55 : 1); }          // 자는 동안 날개를 몸 쪽으로 접어 이불 밖으로 안 나오게(기본 갈매미: 날개 끝 x 0.43 → 0.34 m)
    this.drawBubbles();
    if ((this.gullT = (this.gullT ?? 0) - dt) <= 0) { this.gullT = 1; this.syncGulls(); }
    if (Math.abs(innerWidth / innerHeight - (this.lastAspect || 0)) > 0.01) this.fit();   // 화면을 돌리면 다시 맞춤
    if (this.whoT === undefined || (this.whoT -= dt) <= 0) { this.whoT = 1; const inside = this.world.units.filter(u => u.insideBuildingId === this.b.id); this.ui.querySelector(".rwho").textContent = inside.length ? `지금 안에: ${inside.map(u => `${u.name}${u.useFurni ? `(${FURNITURE[u.useFurni.id].useLabel})` : ""}`).join(", ")}` : ""; }
  }
}
const selCache = new Map();
function selMat(m) { if (!selCache.has(m)) { const s = m.clone(); s.emissive = new THREE.Color(0xffd36b); s.emissiveIntensity = 0.45; selCache.set(m, s); } return selCache.get(m); }
