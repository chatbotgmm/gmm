// 도구(입력): 둘러보기 / 바닥 칠하기 / 건물 짓기(고스트 미리보기) / 철거.
// 도구가 켜져 있으면 왼쪽 버튼(한 손가락)은 도구, 오른쪽 드래그는 시야 돌리기, 휠·두 손가락은 확대·축소.
import * as THREE from "three";
import { CELL, toWorldX, toWorldZ, toGridX, toGridZ, WATER_Y } from "../config.js";
import { BUILDINGS } from "../data/catalog.js";
import { anchorFor } from "../world/placement.js";
import { josa } from "../util.js";
import { terrainHeight } from "../world/terrain.js";

const OK = 0x4fcf78, BAD = 0xe0574f;

export class Tools {
  constructor({ world, scene, camera, dom, controls, chunks, buildingViews, onStatus }) {
    Object.assign(this, { world, scene, camera, dom, controls, chunks, buildingViews, onStatus });
    this.mode = "view"; this.paintType = null; this.buildId = null; this.rot = 0; this.brush = 1; this.hover = null; this.painting = false;
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    // 가리킨 칸 표시
    this.cursor = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    this.cursor.rotation.x = -Math.PI / 2; this.cursor.visible = false; this.cursor.renderOrder = 2; scene.add(this.cursor);
    // 고스트(배치 미리보기): 반투명 상자 + 차지 칸 판 + 문 앞 표시
    this.ghost = new THREE.Group(); this.ghost.visible = false; scene.add(this.ghost);
    this.ghostMat = new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.38, depthWrite: false });
    this.ghostBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.ghostMat); this.ghost.add(this.ghostBox);
    this.ghostFloor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.5, depthWrite: false }));
    this.ghostFloor.rotation.x = -Math.PI / 2; this.ghost.add(this.ghostFloor);
    this.doorMark = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    this.doorMark.rotation.x = Math.PI;               // 아래를 가리키는 문 앞 표시
    scene.add(this.doorMark); this.doorMark.visible = false;
    this.hand = false; this.spaceHeld = false; this.touchIds = new Set();

    dom.addEventListener("pointerdown", e => this.down(e), { capture: true });   // OrbitControls보다 먼저 받음
    dom.addEventListener("pointermove", e => this.move(e));
    addEventListener("pointerup", e => this.up(e));
    addEventListener("pointercancel", e => { this.touchIds.delete(e.pointerId); this.cancelStroke(); });
    addEventListener("keydown", e => {
      if (e.target?.tagName === "INPUT") return;
      if (e.code === "KeyR") this.rotate(); if (e.code === "Enter" && this.plan) this.confirmBuild();
      if (e.code === "Escape") { if (this.plan) this.clearPlan(); else this.setMode("view"); }   // Esc: 정해 둔 자리 취소 → 한 번 더 누르면 도구 끄기
      if (e.code === "BracketLeft") this.setBrush(this.brush - 2); if (e.code === "BracketRight") this.setBrush(this.brush + 2);
      if (e.code === "Space") { e.preventDefault(); if (!this.spaceHeld) { this.spaceHeld = true; this.cancelStroke(); this.applyControls(); } }   // 스페이스 누른 채 드래그 = 화면 돌리기
    });
    addEventListener("keyup", e => { if (e.code === "Space") { this.spaceHeld = false; this.applyControls(); } });
    addEventListener("blur", () => { this.spaceHeld = false; this.applyControls(); });
  }

  setMode(mode, arg = null) {
    this.mode = mode; this.paintType = mode === "paint" ? arg : null; this.buildId = mode === "build" ? arg : null; this.plan = null;
    this.heightOp = mode === "height" ? (arg || "raise") : null;
    this.cursor.visible = false; this.ghost.visible = false; this.doorMark.visible = false; this.buildingViews.setHighlight(null);
    this.cancelStroke(); this.applyControls();
    this.onStatus(""); this.refresh(); this.onMode?.(mode, arg);
  }
  /** 도구가 손가락·왼쪽 버튼을 쓰는지(✋ 화면 이동이나 스페이스를 누르면 잠시 화면 조작). */
  get toolActive() { return this.mode !== "view" && !this.hand && !this.spaceHeld; }
  /** 조작 배치: 도구 중에는 한 손가락·왼쪽 = 도구, 두 손가락 = 돌리기·확대, 오른쪽 = 돌리기, 가운데 = 확대.
   *  둘러보기(또는 ✋)에서는 한 손가락 = 화면 옮기기, 두 손가락 = 돌리기·확대 / 마우스 왼쪽 = 돌리기, 오른쪽 = 옮기기. */
  applyControls() {
    const t = this.toolActive, M = THREE.MOUSE, T = THREE.TOUCH;
    this.controls.mouseButtons = { LEFT: t ? null : M.ROTATE, MIDDLE: M.DOLLY, RIGHT: t ? M.ROTATE : M.PAN };
    this.controls.touches = { ONE: t ? null : T.PAN, TWO: null };                           // 터치: 한 손가락 = 옮기기, 두 손가락(비틀기 돌리기·벌려 확대)은 twoFinger.js
    this.dom.style.cursor = this.mode === "view" ? "" : t ? "crosshair" : "grab";
  }
  setHand(on) { this.hand = on; this.cancelStroke(); this.applyControls(); this.onHand?.(on); }
  /** 칠하던·올리던 것을 멈춤(두 번째 손가락이 닿거나 화면 조작으로 바뀔 때). */
  cancelStroke() { clearTimeout(this.pendingT); this.pending = null; this.painting = false; if (this.press) this.press.multi = true; }
  rotate() { this.rot = (this.rot + 1) % 4; this.refresh(); }
  /** 붓 크기(한 변 칸 수, 홀수 1·3·5·7). 가리킨 칸이 가운데. */
  setBrush(n) { this.brush = Math.max(1, Math.min(7, n | 1)); this.refresh(); this.onBrush?.(this.brush); }
  brushCells(h) {
    const r = (this.brush - 1) / 2, out = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (this.world.grid.inBounds(h.x + dx, h.z + dz)) out.push([h.x + dx, h.z + dz]);
    return out;
  }

  /** 화면 좌표 → 칸. 바닥 청크 메쉬에 광선을 쏴서 맞은 점을 면 안쪽으로 살짝 밀어 칸을 정한다. */
  /** 마우스 아래 정확한 점(격자 좌표, 소수). 물 위면 물 표면과 만나는 점. 없으면 null. */
  pickPoint(clientX, clientY) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObjects([...this.chunks.meshes.values()], false)[0];
    let p = hit ? hit.point.clone() : null;
    if (!p || p.y < WATER_Y) {                                                    // 물속 바닥 대신 물 표면
      const q = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_Y), new THREE.Vector3());
      if (q) p = q;
    }
    if (!p) return null;
    const gx = toGridX(p.x), gz = toGridZ(p.z), x = Math.floor(gx), z = Math.floor(gz);
    return this.world.grid.inBounds(x, z) ? { gx, gz, x, z } : null;
  }

  pick(clientX, clientY) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObjects([...this.chunks.meshes.values()], false)[0];
    if (!hit) return null;
    const p = hit.point.clone().addScaledVector(hit.face.normal, -0.01);
    const x = Math.floor(toGridX(p.x)), z = Math.floor(toGridZ(p.z));
    return this.world.grid.inBounds(x, z) ? { x, z } : null;
  }

  down(e) {
    if (e.pointerType === "touch") { if (e.isPrimary) this.touchIds.clear(); this.touchIds.add(e.pointerId); }   // 첫 손가락이면 새 손짓(남은 기록 지움)
    if (this.mode === "view") return;
    if (e.pointerType === "touch" && this.touchIds.size > 1) { this.cancelStroke(); return; }   // 두 손가락 = 화면 돌리기·확대
    if (!this.toolActive || (e.pointerType === "mouse" && e.button !== 0) || !e.isPrimary) return;
    this.hover = this.pick(e.clientX, e.clientY); this.refresh();
    this.press = { x: e.clientX, y: e.clientY, multi: false };
    if (this.mode === "paint" || this.mode === "height") {
      const begin = () => {
        if (!this.press || this.press.multi) return;
        this.pending = null; this.painting = true; this.stroke = new Set();   // 한 번 끌 때 같은 칸은 한 번만 올리고 내림
        this.flatTarget = this.hover ? this.world.grid.get(this.hover.x, this.hover.z).elevation : 0;   // 평평하게: 처음 누른 칸 높이로
        this.apply();
      };
      // 손가락은 잠깐 기다렸다 시작(바로 두 번째 손가락이 오면 화면 조작이었던 것)
      if (e.pointerType === "touch") { this.pending = begin; this.pendingT = setTimeout(begin, 110); } else begin();
    }
  }
  move(e) {
    if (this.mode === "view") return;
    if (this.pending && this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 8) { clearTimeout(this.pendingT); this.pending(); }
    const h = this.pick(e.clientX, e.clientY);
    if (h?.x === this.hover?.x && h?.z === this.hover?.z) return;
    this.hover = h; this.refresh();
    if (this.painting) this.apply();
  }
  up(e) {
    if (e.pointerType === "touch") this.touchIds.delete(e.pointerId);
    if (!e.isPrimary || !this.press) return;
    const p = this.press; this.press = null;
    if (this.pending && !p.multi) { clearTimeout(this.pendingT); const f = this.pending; this.press = p; f(); this.press = null; }   // 짧게 톡: 한 번 칠함
    if (this.mode !== "view" && this.mode !== "paint" && this.mode !== "height" && !p.multi) this.apply();
    this.painting = false; this.pending = null;
  }

  apply() {
    const h = this.hover; if (!h) return;
    if (this.mode === "paint") { for (const [x, z] of this.brushCells(h)) this.world.paint(x, z, this.paintType); }
    else if (this.mode === "height") {
      // 붓 안의 모든 칸을 똑같이(가운데만 솟지 않게)
      for (const [x, z] of this.brushCells(h)) {
        const k = `${x},${z}`; if (this.stroke?.has(k)) continue; this.stroke?.add(k);
        this.world.reshape(x, z, this.heightOp, this.flatTarget, 1);
      }
    }
    else if (this.mode === "build") {                                            // 누르면 자리만 정함 → 🔨 건설 버튼(또는 Enter)으로 지음
      this.plan = { x: h.x, z: h.z }; this.refresh(); return;
    } else if (this.mode === "demolish") {
      const b = this.world.buildingAt(h.x, h.z);
      if (b && BUILDINGS[b.defId].fixed) { this.onStatus(`${BUILDINGS[b.defId].name}은 철거할 수 없어요`); return; }
      if (b) { this.world.removeBuilding(b.id); this.refresh(); this.onStatus(`${josa(BUILDINGS[b.defId].name, "을", "를")} 철거했어요`); return; }
    }
    this.refresh();
  }

  /** 정해 둔 자리에 짓기(🔨 건설). */
  confirmBuild() {
    const h = this.plan; if (this.mode !== "build" || !h) return;
    const def = BUILDINGS[this.buildId], a = anchorFor(def, h.x, h.z, this.rot), r = this.world.placeBuilding(this.buildId, a.x, a.z, this.rot);
    if (r.ok) this.plan = null;
    this.refresh(); this.onStatus(!r.ok ? r.reason : r.building.hits >= r.building.need ? `${josa(def.name, "을", "를")} 지었어요` : `${def.name} 공사를 시작했어요 · 갈매미가 나무·돌로 지어요`);
  }
  clearPlan() { this.plan = null; this.refresh(); }

  // 미리보기 갱신: 칸 커서 / 고스트 색(초록 = 지을 수 있음, 빨강 = 못 지음 + 이유) / 철거 대상 강조
  refresh() {
    const plan = this.mode === "build" ? this.plan : null, h = plan || this.hover, grid = this.world.grid;
    this.cursor.visible = false; this.ghost.visible = false; this.doorMark.visible = false;
    if (this.mode === "build" && plan) { const def = BUILDINGS[this.buildId], a = anchorFor(def, plan.x, plan.z, this.rot); this.onPlan?.(true, this.world.check(this.buildId, a.x, a.z, this.rot).ok); }
    else this.onPlan?.(false);
    if (!h) { this.buildingViews.setHighlight(null); return; }
    const cell = grid.get(h.x, h.z);
    if (this.mode === "paint" || this.mode === "height") {
      const cells = this.brushCells(h), top = Math.max(...cells.map(([x, z]) => Math.max(terrainHeight(grid, x + 0.5, z + 0.5), grid.walkHeight(x, z) ?? -9)));
      this.cursor.visible = true; this.cursor.scale.set(this.brush, this.brush, 1);
      this.cursor.position.set(toWorldX(h.x + 0.5), top + 0.03, toWorldZ(h.z + 0.5));
      this.cursor.material.color.setHex(cells.some(([x, z]) => this.mode === "height" ? this.world.canReshape(x, z) : this.world.canPaint(x, z)) ? 0xffffff : BAD);   // 칠할 수 있는 칸이 하나도 없으면 빨강
    } else if (this.mode === "build") {
      const def = BUILDINGS[this.buildId], a = anchorFor(def, h.x, h.z, this.rot), r = this.world.check(this.buildId, a.x, a.z, this.rot);
      const y = r.ok ? r.elevation : Math.max(0, cell.elevation), col = r.ok ? OK : BAD;
      this.ghost.visible = true; this.ghost.position.set(toWorldX(r.center.x), y, toWorldZ(r.center.z)); this.ghost.rotation.y = r.angle;
      this.ghostBox.scale.set(def.footprint.w * 0.9, def.height * 1.5, def.footprint.d * 0.9); this.ghostBox.position.y = def.height * 0.75;
      this.ghostFloor.scale.set(def.footprint.w, def.footprint.d, 1); this.ghostFloor.position.y = 0.04;
      this.ghostMat.color.setHex(col); this.ghostFloor.material.color.setHex(col);
      this.doorMark.visible = true; this.doorMark.position.set(toWorldX(r.door.x + 0.5), y + 0.35, toWorldZ(r.door.z + 0.5));
      this.onStatus(!r.ok ? r.reason : plan ? `${def.name} 자리를 정했어요 · 🔨 건설을 누르면 지어요 (다른 곳을 누르면 옮김 · R 돌리기)` : `${def.name} · 눌러서 자리 정하기 · R 돌리기`);
    } else if (this.mode === "demolish") {
      const b = this.world.buildingAt(h.x, h.z); this.buildingViews.setHighlight(b ? b.id : null);
      this.cursor.visible = !b; this.cursor.scale.set(1, 1, 1); this.cursor.position.set(toWorldX(h.x + 0.5), terrainHeight(grid, h.x + 0.5, h.z + 0.5) + 0.03, toWorldZ(h.z + 0.5)); this.cursor.material.color.setHex(BAD);
    }
  }
}
