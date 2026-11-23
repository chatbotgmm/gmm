// 도구(입력): 둘러보기 / 바닥 칠하기 / 건물 짓기(고스트 미리보기) / 철거.
// 도구가 켜져 있으면 왼쪽 버튼(한 손가락)은 도구, 오른쪽 드래그는 시야 돌리기, 휠·두 손가락은 확대·축소.
import * as THREE from "three";
import { CELL, toWorldX, toWorldZ, toGridX, toGridZ } from "../config.js";
import { BUILDINGS } from "../data/catalog.js";
import { anchorFor } from "../world/placement.js";
import { josa } from "../util.js";

const OK = 0x4fcf78, BAD = 0xe0574f;

export class Tools {
  constructor({ world, scene, camera, dom, controls, chunks, buildingViews, onStatus }) {
    Object.assign(this, { world, scene, camera, dom, controls, chunks, buildingViews, onStatus });
    this.mode = "view"; this.paintType = null; this.buildId = null; this.rot = 0; this.hover = null; this.painting = false;
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
    this.doorMark.rotation.x = Math.PI;               // 아래를 가리키는 문 앞 표시 scene.add(this.doorMark); this.doorMark.visible = false;

    dom.addEventListener("pointerdown", e => this.down(e), { capture: true });   // OrbitControls보다 먼저 받음
    dom.addEventListener("pointermove", e => this.move(e));
    addEventListener("pointerup", e => this.up(e));
    addEventListener("keydown", e => { if (e.code === "KeyR") this.rotate(); if (e.code === "Escape") this.setMode("view"); });
  }

  setMode(mode, arg = null) {
    this.mode = mode; this.paintType = mode === "paint" ? arg : null; this.buildId = mode === "build" ? arg : null;
    this.cursor.visible = false; this.ghost.visible = false; this.doorMark.visible = false; this.buildingViews.setHighlight(null);
    const tool = mode !== "view";
    this.controls.mouseButtons.LEFT = tool ? null : THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.RIGHT = tool ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    this.onStatus(""); this.refresh(); this.onMode?.(mode, arg);
  }
  rotate() { this.rot = (this.rot + 1) % 4; this.refresh(); }

  /** 화면 좌표 → 칸. 바닥 청크 메쉬에 광선을 쏴서 맞은 점을 면 안쪽으로 살짝 밀어 칸을 정한다. */
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
    if (this.mode === "view" || (e.pointerType === "mouse" && e.button !== 0) || !e.isPrimary) return;
    this.controls.enabled = false;                    // 이번 누름은 도구가 씀
    this.hover = this.pick(e.clientX, e.clientY); this.refresh();
    if (this.mode === "paint") { this.painting = true; this.apply(); }
  }
  move(e) {
    if (this.mode === "view") return;
    const h = this.pick(e.clientX, e.clientY);
    if (h?.x === this.hover?.x && h?.z === this.hover?.z) return;
    this.hover = h; this.refresh();
    if (this.painting) this.apply();
  }
  up(e) {
    if (this.mode !== "view" && !this.controls.enabled && e.isPrimary) {
      if (this.mode !== "paint") this.apply();
      this.painting = false; this.controls.enabled = true;
    }
  }

  apply() {
    const h = this.hover; if (!h) return;
    if (this.mode === "paint") { this.world.paint(h.x, h.z, this.paintType); }
    else if (this.mode === "build") {
      const def = BUILDINGS[this.buildId], a = anchorFor(def, h.x, h.z, this.rot), r = this.world.placeBuilding(this.buildId, a.x, a.z, this.rot);
      this.refresh(); this.onStatus(r.ok ? `${josa(def.name, "을", "를")} 지었어요` : r.reason); return;    // 미리보기 문구보다 결과를 보여 줌
    } else if (this.mode === "demolish") {
      const b = this.world.buildingAt(h.x, h.z);
      if (b) { this.world.removeBuilding(b.id); this.refresh(); this.onStatus(`${josa(BUILDINGS[b.defId].name, "을", "를")} 철거했어요`); return; }
    }
    this.refresh();
  }

  // 미리보기 갱신: 칸 커서 / 고스트 색(초록 = 지을 수 있음, 빨강 = 못 지음 + 이유) / 철거 대상 강조
  refresh() {
    const h = this.hover, grid = this.world.grid;
    this.cursor.visible = false; this.ghost.visible = false; this.doorMark.visible = false;
    if (!h) { this.buildingViews.setHighlight(null); return; }
    const cell = grid.get(h.x, h.z);
    if (this.mode === "paint") {
      this.cursor.visible = true; this.cursor.position.set(toWorldX(h.x + 0.5), Math.max(cell.elevation, grid.walkHeight(h.x, h.z) ?? -9) + 0.03, toWorldZ(h.z + 0.5));
      this.cursor.material.color.setHex(this.world.canPaint(h.x, h.z) ? 0xffffff : BAD);
    } else if (this.mode === "build") {
      const def = BUILDINGS[this.buildId], a = anchorFor(def, h.x, h.z, this.rot), r = this.world.check(this.buildId, a.x, a.z, this.rot);
      const y = r.ok ? r.elevation : Math.max(0, cell.elevation), col = r.ok ? OK : BAD;
      this.ghost.visible = true; this.ghost.position.set(toWorldX(r.center.x), y, toWorldZ(r.center.z)); this.ghost.rotation.y = r.angle;
      this.ghostBox.scale.set(def.footprint.w * 0.9, def.height * 1.5, def.footprint.d * 0.9); this.ghostBox.position.y = def.height * 0.75;
      this.ghostFloor.scale.set(def.footprint.w, def.footprint.d, 1); this.ghostFloor.position.y = 0.04;
      this.ghostMat.color.setHex(col); this.ghostFloor.material.color.setHex(col);
      this.doorMark.visible = true; this.doorMark.position.set(toWorldX(r.door.x + 0.5), y + 0.35, toWorldZ(r.door.z + 0.5));
      this.onStatus(r.ok ? `${def.name} · 눌러서 짓기 · R 돌리기` : r.reason);
    } else if (this.mode === "demolish") {
      const b = this.world.buildingAt(h.x, h.z); this.buildingViews.setHighlight(b ? b.id : null);
      this.cursor.visible = !b; this.cursor.position.set(toWorldX(h.x + 0.5), cell.elevation + 0.03, toWorldZ(h.z + 0.5)); this.cursor.material.color.setHex(BAD);
    }
  }
}
