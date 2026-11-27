// 도구(입력): 둘러보기 / 바닥 칠하기 / 건물 짓기(고스트 미리보기) / 철거 / 자연·지형(심기·치우기·파기·메우기·지형지물 옮기기, 월드 꾸미기 API의 dry로 미리보기).
// 도구가 켜져 있으면 왼쪽 버튼(한 손가락)은 도구, 오른쪽 드래그는 화면 옮기기(건설 모드는 고정 쿼터뷰라 돌리기 없음), 휠·두 손가락은 확대·축소.
// 단 「누르면 고르는」 도구(짓기·철거·지형지물 옮기기)는 끌기 = 화면 옮기기, 짧게 톡 = 자리 정하기(pressKind.js).
import * as THREE from "three";
import { CELL, toWorldX, toWorldZ, toGridX, toGridZ, WATER_Y } from "../config.js";
import { BUILDINGS } from "../data/catalog.js";
import { anchorFor } from "../world/placement.js";
import { josa } from "../util.js";
import { terrainHeight } from "../world/terrain.js";
import { findPath } from "../world/pathfinding.js";
import { frontCells } from "../world/customize.js";
import { isPaved } from "../world/roads.js";
import { roadWant } from "../world/roadAsk.js";
import { pressKind, tapTool } from "./pressKind.js";
import { nearestSpot, PREPLACE_R, SNAP_R } from "./buildSpot.js";
import { natureAction, natureHover, strokeText, undoText, redoText } from "../ui/natureView.js";
import { buildUndoText, demolishAsk } from "../ui/buildUndoView.js";
const TOOLS_TOUCH = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

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
    // 갈매미가 부탁한 길(world.roadAsks, roadAsk.js): 바닥 칠하기 중에만 아직 안 깐 칸을 옅은 노란 판으로 보여 줌(칸 하나 = 인스턴스 하나)
    this.askMax = 512; this.askMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(CELL * 0.86, CELL * 0.86).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.42, depthWrite: false }), this.askMax);
    this.askMesh.count = 0; this.askMesh.visible = false; this.askMesh.frustumCulled = false; this.askMesh.renderOrder = 1; scene.add(this.askMesh); this.askT = 0;
    this.hand = false; this.spaceHeld = false; this.touchIds = new Set();
    // 모바일 편집: 모양(붓·길·네모), 십자선 모드, 되돌리기·다시하기, 단 높이 맞추기
    this.shape = "brush"; this.shapeStart = null; this.cross = false; this.history = []; this.redoStack = []; this.diff = null; this.levelH = 0.5;

    dom.addEventListener("pointerdown", e => this.down(e), { capture: true });   // OrbitControls보다 먼저 받음
    dom.addEventListener("pointermove", e => this.move(e));
    addEventListener("pointerup", e => this.up(e));
    addEventListener("pointercancel", e => { this.touchIds.delete(e.pointerId); this.cancelStroke(); });
    addEventListener("keydown", e => {
      if (e.target?.tagName === "INPUT") return;
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") { e.preventDefault(); this.redo(); return; }
      if (e.code === "KeyR") this.rotate(); if (e.code === "Enter" && this.plan) this.confirmBuild();
      if (e.code === "Escape") { if (this.plan && !this.plan.auto) this.clearPlan(); else this.setMode("view"); }   // Esc: 정해 둔 자리 취소 → 한 번 더 누르면 도구 끄기(미리 놓아 둔 고스트뿐이면 바로 끄기 — 나가기 Esc 한 번은 그대로)
      if (e.code === "BracketLeft") this.setBrush(this.brush - 2); if (e.code === "BracketRight") this.setBrush(this.brush + 2);
      if (e.code === "Space") { e.preventDefault(); if (!this.spaceHeld) { this.spaceHeld = true; this.cancelStroke(); this.applyControls(); } }   // 스페이스 누른 채 드래그 = 화면 돌리기
    });
    addEventListener("keyup", e => { if (e.code === "Space") { this.spaceHeld = false; this.applyControls(); } });
    addEventListener("blur", () => { this.spaceHeld = false; this.applyControls(); });
  }

  setMode(mode, arg = null) {
    this.commitNature?.();
    const near = this.mode === "build" && this.plan && !this.plan.bridge ? { x: this.plan.x, z: this.plan.z } : null;   // 건설 중 다른 건물로 바꾸면 정해 둔 자리 둘레에서 다시 찾음
    this.mode = mode; this.paintType = mode === "paint" ? arg : null; this.buildId = mode === "build" ? arg : null; this.plan = null;
    this.heightOp = mode === "height" ? (arg || "raise") : null; this.shapeStart = null; this.commitStroke?.();
    this.natArg = mode === "nature" ? (arg || "auto") : null; this.natLast = null;
    const na = this.natAct; if (na?.kind === "move") this.rot = this.world.landmark(na.what)?.rot || 0;   // 옮기기: 지금 방향에서 시작(↻·R로 돌림)
    this.cursor.visible = false; this.ghost.visible = false; this.doorMark.visible = false; this.buildingViews.setHighlight(null);
    this.cancelStroke(); this.applyControls();
    this.onStatus(""); if (mode === "build") this.prePlace(near); this.refresh(); this.onMode?.(mode, arg);
    this.askT = 0; this.tickAsks();
    if (mode === "paint" && this.askMesh.count) this.onStatus("🛣 노란 칸 = 갈매미가 부탁한 길(돌길·데크로 칠하면 집과 이어져요)");
  }
  /** 부탁받은 길 칸 다시 그리기(바닥 칠하기 중 0.5초마다): 이어졌거나 바라지 않게 된 부탁은 지우고, 이미 포장된 칸은 뺌 */
  tickAsks() {
    const m = this.askMesh, w = this.world;
    if (this.mode !== "paint" || !w.roadAsks?.size) { m.visible = false; m.count = 0; return; }
    const t = performance.now(); if (t - this.askT < 500) return; this.askT = t;
    const seen = new Set(), mat = new THREE.Matrix4(), g = w.grid; let n = 0;
    for (const [id, a] of w.roadAsks) {
      if (!w.units.includes(a.u) || !roadWant(w, a.u)) { w.roadAsks.delete(id); continue; }
      for (const [x, z] of a.cells) {
        const k = z * g.w + x; if (n >= this.askMax || seen.has(k) || !g.inBounds(x, z) || isPaved(w, x, z)) continue; seen.add(k);
        mat.makeTranslation(toWorldX(x + 0.5), Math.max(terrainHeight(g, x + 0.5, z + 0.5), g.walkHeight(x, z) ?? -9) + 0.03, toWorldZ(z + 0.5)); m.setMatrixAt(n++, mat);
      }
    }
    m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true;
  }
  /** 지금 건물을 (x, z)를 누른 칸으로 놓을 수 있나 */
  spotOk(x, z) { const def = BUILDINGS[this.buildId]; if (!def || !this.world.grid.inBounds(x, z)) return false; const a = anchorFor(def, x, z, this.rot); return this.world.check(this.buildId, a.x, a.z, this.rot).ok; }
  /** 처음 고스트(편의성 점검 4번): 화면 가운데(보는 점 = controls.target)에서 가장 가까운 빈 자리에 미리 놓음 → 땅을 안 눌러도 🔨 건설.
   *  near = 건물만 바꿨을 때 앞서 정한 자리. 다리(두 칸을 눌러 정함)·빈 자리가 없으면 예전처럼 비워 둠 */
  prePlace(near = null) {
    const def = BUILDINGS[this.buildId]; if (!def || def.bridge) return;
    const t = this.controls?.target, c = near || (t ? { x: Math.floor(toGridX(t.x)), z: Math.floor(toGridZ(t.z)) } : null); if (!c) return;
    const s = nearestSpot((x, z) => this.spotOk(x, z), c.x, c.z, PREPLACE_R); if (s) this.plan = { x: s.x, z: s.z, auto: true };
  }
  /** 고스트 가운데의 화면 좌표(CSS px) — 확인 카드가 고스트를 가리는지 볼 때(hud.js). 안 보이면 null */
  planScreen() {
    if (!this.ghost.visible) return null; const r = this.dom.getBoundingClientRect(), p = this.ghost.position.clone(); p.y += this.ghostBox.position.y;
    p.project(this.camera); if (p.z > 1) return null;
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }
  /** 도구가 손가락·왼쪽 버튼을 쓰는지(✋ 화면 이동이나 스페이스를 누르면 잠시 화면 조작). */
  get toolActive() { return this.mode !== "view" && !this.hand && !this.spaceHeld && !this.cross; }   // 십자선 모드: 한 손가락은 화면 옮기기, 칠하기는 버튼으로
  /** 톡 = 고르기 · 끌기 = 화면 옮기기인 도구가 켜져 있나(짓기·철거·지형지물 옮기기). 이때 ✋는 필요 없음 */
  get tapPick() { return this.toolActive && tapTool(this.mode, this.natAct?.kind); }
  /** 조작 배치: 도구 중에는 한 손가락·왼쪽 = 도구, 두 손가락 = 돌리기·확대, 오른쪽 = 돌리기, 가운데 = 확대.
   *  둘러보기(또는 ✋)에서는 한 손가락 = 화면 옮기기, 두 손가락 = 돌리기·확대 / 마우스 왼쪽 = 돌리기, 오른쪽 = 옮기기.
   *  건설 모드의 고정 쿼터뷰(viewLock, main.js가 켬)에서는 돌리기가 없음: 오른쪽 = 옮기기, ✋·스페이스 + 왼쪽 = 옮기기, 두 손가락 = 옮기기·확대. */
  applyControls() {
    const t = this.toolActive && !this.tapPick, q = !!this.viewLock, M = THREE.MOUSE, T = THREE.TOUCH;
    this.controls.mouseButtons = { LEFT: t ? null : q ? M.PAN : M.ROTATE, MIDDLE: M.DOLLY, RIGHT: t && !q ? M.ROTATE : M.PAN };
    this.controls.touches = { ONE: t ? null : T.PAN, TWO: null };                           // 터치: 한 손가락 = 옮기기, 두 손가락(비틀기 돌리기·벌려 확대)은 twoFinger.js
    this.dom.style.cursor = this.mode === "view" ? "" : t || this.tapPick ? "crosshair" : "grab";
  }
  setHand(on) { this.hand = on; this.cancelStroke(); this.applyControls(); this.onHand?.(on); }
  /** 칠하던·올리던 것을 멈춤(두 번째 손가락이 닿거나 화면 조작으로 바뀔 때). */
  cancelStroke() { clearTimeout(this.pendingT); this.pending = null; this.painting = false; if (this.press) this.press.multi = true; this.commitStroke(); this.commitNature(); }
  // ---- 자연·지형(mode "nature", arg = auto|palm|beachRock|ore|bush|flower|clear|dig|fill|move:cave|move:lighthouse|move:pier|move:breakwater)
  get natAct() { return this.mode === "nature" ? natureAction(this.natArg) : null; }
  /** 붓·길·네모를 쓰는 도구: 칠하기 · 높이 · 파기·메우기 */
  usesShape() { const a = this.natAct; return this.mode === "paint" || this.mode === "height" || a?.kind === "dig" || a?.kind === "fill"; }
  /** 누른 채 끌면 계속 하는 도구(옮기기 빼고) */
  strokeMode() { const a = this.natAct; return this.mode === "paint" || this.mode === "height" || (!!a && a.kind !== "move"); }
  shapeNow() { return this.usesShape() ? this.shape : "brush"; }
  /** 칸 하나에 할 월드 일 { op, args }(args 끝에 opt를 붙여 부름). 치우기는 그 칸의 나무·바위·광석 → 놓은 덤불·꽃 → 씨앗 소품 차례 */
  natureCall(a, x, z) {
    const w = this.world;
    if (a.kind === "place") return { op: "placeNature", args: [a.what, x, z] };
    if (a.kind === "decor") return { op: "placeDecor", args: [a.what, x, z] };
    if (a.kind === "clear") {
      if (w.natureAt(x, z)) return { op: "removeNature", args: [{ x, z }] };
      if (w.decor?.add.has(`${x},${z}`) || !this.seedAt || this.seedAt(x, z)) return { op: "clearDecor", args: [x, z] };   // 씨앗 소품이 보이는 칸만(그림 층이 알려 줌)
    }
    return null;
  }
  /** 한 번의 꾸미기 결과를 이번 획 묶음에 쌓음(되돌리기 한 번 = 한 획) */
  natNote(r, call) {
    const b = this.natBatch ||= { arg: this.natArg, items: [], done: 0, cost: 0, fail: "", kinds: [] };
    if (!r.ok) { b.fail = r.reason; return; }
    const redo = call.op === "placeNature" ? { op: call.op, args: [r.kind, call.args[1], call.args[2]] } : call.op === "digCells" || call.op === "fillCells" ? { op: call.op, args: [r.cells.map(c => [c.x, c.z])] } : call;
    if (r.inverse) b.items.push({ inverse: r.inverse, redo }); b.done += r.done ?? 1; b.cost += r.cost || 0; if (r.kind) b.kinds.push(r.kind);
    if (r.skipped?.length) b.fail = r.skipped[0].reason;
  }
  /** 획이 끝나면: 되돌리기 목록에 한 항목 + 상태 줄 요약 */
  commitNature() {
    const b = this.natBatch; if (!b) return; this.natBatch = null;
    if (b.items.length) { this.history.push({ kind: "custom", arg: b.arg, items: b.items }); if (this.history.length > 60) this.history.shift(); this.redoStack = []; this.onHistory?.(); if (b.done) this.buzz(); }
    this.natLast = null; this.refresh();
    const t = strokeText(b.arg, b, this.world.bank?.vault || 0, !!this.world.economy); if (t) { this.natLast = t; this.onStatus(t); }
  }
  /** 칸들 파기·메우기(붓·길·네모 한 번 = 묶음 하나) */
  natureCells(cells) {
    const a = this.natAct, op = a.kind === "dig" ? "digCells" : "fillCells";
    const todo = cells.filter(([x, z]) => { const k = `${x},${z}`; if (this.stroke?.has(k)) return false; this.stroke?.add(k); return true; });
    if (!todo.length) return; this.natNote(this.world[op](todo, {}), { op, args: [todo] });
  }
  /** 지형지물 옮기기 자리: 누른 칸이 모양 가운데가 되게 기준 칸(왼쪽 위)을 정함 */
  movePlan(h, defId) {
    if (!h) return null; const s = this.world.landmarkCells(defId, 0, 0, this.rot); if (!s) return null;
    const wx = Math.max(...s.map(c => c[0])) + 1, dz = Math.max(...s.map(c => c[1])) + 1, ax = h.x - Math.floor((wx - 1) / 2), az = h.z - Math.floor((dz - 1) / 2);
    return { defId, ax, az, rot: this.rot, cells: this.world.landmarkCells(defId, ax, az, this.rot) };
  }
  // ---- 되돌리기·다시하기: 한 획(또는 길·네모 한 번)에 바뀐 칸들의 전·후(바닥 종류·높이)
  record(x, z) {
    const g = this.world.grid, c = g.get(x, z); if (!c) return; this.diff ||= new Map(); const k = `${x},${z}`; if (this.diff.has(k)) return;
    this.diff.set(k, { x, z, g0: c.groundType, e0: this.world.shaping.get(g.index(x, z))?.target ?? c.elevation });
  }
  commitStroke() {
    if (!this.diff || !this.diff.size) { this.diff = null; return; }
    const g = this.world.grid, cells = [...this.diff.values()].map(d => ({ ...d, g1: g.get(d.x, d.z).groundType, e1: this.world.shaping.get(g.index(d.x, d.z))?.target ?? g.get(d.x, d.z).elevation }))
      .filter(d => d.g0 !== d.g1 || Math.abs(d.e0 - d.e1) > 1e-6);
    this.diff = null; if (!cells.length) return;
    this.history.push(cells); if (this.history.length > 60) this.history.shift(); this.redoStack = []; this.onHistory?.();
  }
  /** 칸 하나를 바닥 g·높이 e로(되돌리기·다시하기). 높이가 바뀌면 world.restoreCell(건물·나무·문 앞·밭 검사 + 땅↔물 경계 값)을 거침 → { ok, reason, cost } */
  setCell(d, g, e) {
    const w = this.world, c = w.grid.get(d.x, d.z), idx = w.grid.index(d.x, d.z);
    if (Math.abs(c.elevation - e) > 1e-6 || w.shaping.has(idx)) {
      const t = w.restoreCell(d.x, d.z, g, e, { dry: true }); if (!t.ok) return t;   // 못 하면 스르르 바뀌던 것도 그대로 둠
      w.shaping.delete(idx); return w.restoreCell(d.x, d.z, g, e);
    }
    if (c.groundType !== g) { w.grid.setGround(d.x, d.z, g); w.emit("ground", { x: d.x, z: d.z, type: g }); }
    return { ok: true, cost: 0 };
  }
  /** 칸 묶음(칠하기·높이)을 전(0)·후(1)로: 된 칸만 돌려줌 */
  cellsTo(s, after) {
    const ok = [], fails = []; let paid = 0;
    for (const d of s) { const r = this.setCell(d, after ? d.g1 : d.g0, after ? d.e1 : d.e0); if (r.ok) { ok.push(d); paid += r.cost || 0; } else fails.push(r.reason); }
    return { ok, fails, paid };
  }
  undo() {
    this.commitStroke(); this.commitNature(); const s = this.history.pop(); if (!s) return this.onStatus("되돌릴 게 없어요");
    this.runUndo(s);
  }
  /** 알림의 「↶ 되돌리기」: 그 짓기만 콕 집어 되돌림(그사이 다른 일을 했어도 그것은 그대로) */
  undoEntry(s) {
    const i = this.history.indexOf(s); if (i < 0) return this.onStatus("이미 되돌렸어요");
    this.history.splice(i, 1); this.runUndo(s);
  }
  runUndo(s) {
    let text;
    if (s.kind === "build") {                                                    // 짓기(편의성 점검 8번): 아직 아무것도 안 쓴 공사장만 철거 + 설계비 그대로 환불(World.undoBuild). 다시하기는 없음(다시 놓으면 됨)
      const fails = []; let n = 0, refund = 0;
      for (const id of s.ids) { const r = this.world.undoBuild(id); if (r.ok) { n++; refund += r.refund; } else fails.push(r.reason); }
      text = buildUndoText({ name: s.name, n, total: s.ids.length, refund, fails });
    } else if (s.kind === "custom") {                                                   // 꾸미기: 월드가 만든 반대 일(낸 값 돌려받음, 그사이 바뀌었으면 못 함)
      const ok = [], fails = []; let refund = 0;
      for (const it of [...s.items].reverse()) { const r = this.world.applyInverse(it.inverse); if (r.ok) { ok.unshift(it); refund += r.refund || 0; } else fails.push(r.reason); }
      if (ok.length) this.redoStack.push({ ...s, items: ok }); text = undoText({ n: ok.length, refund, fails });
    } else {
      const r = this.cellsTo(s, false); if (r.ok.length) this.redoStack.push(r.ok);
      text = r.ok.length ? `↶ 되돌렸어요(${r.ok.length}칸)${r.paid ? ` · 땅↔물 🪙${r.paid}` : ""}${r.fails.length ? ` · ${r.fails.length}칸은 못 되돌렸어요(${r.fails[0]})` : ""}` : `🚫 ${r.fails[0] || "되돌릴 수 없어요"}`;
    }
    this.onUndoSound?.(); this.refresh(); this.natLast = text; this.onStatus(text); this.onHistory?.();
  }
  redo() {
    const s = this.redoStack.pop(); if (!s) return this.onStatus("다시 할 게 없어요");
    let text;
    if (s.kind === "custom") {                                                   // 꾸미기: 처음 한 일을 다시(값도 다시 냄)
      const ok = [], fails = []; let cost = 0;
      for (const it of s.items) { const r = this.world[it.redo.op](...it.redo.args, {}); if (r.ok) { ok.push({ ...it, inverse: r.inverse }); cost += r.cost || 0; } else fails.push(r.reason); }
      if (ok.length) this.history.push({ ...s, items: ok }); text = redoText({ n: ok.length, cost, fails });
    } else {
      const r = this.cellsTo(s, true); if (r.ok.length) this.history.push(r.ok);
      text = r.ok.length ? `↷ 다시 했어요(${r.ok.length}칸)${r.paid ? ` · 땅↔물 🪙${r.paid}` : ""}${r.fails.length ? ` · ${r.fails.length}칸은 못 했어요(${r.fails[0]})` : ""}` : `🚫 ${r.fails[0] || "다시 할 수 없어요"}`;
    }
    this.refresh(); this.natLast = text; this.onStatus(text); this.onHistory?.();
  }
  /** 모양: brush(붓) · line(길: 두 칸을 누르면 걸어가는 길을 따라) · rect(네모 채우기) */
  setShape(s) { this.shape = s; this.shapeStart = null; this.refresh(); this.onStatus(s === "line" ? "길: 시작 칸 → 끝 칸을 누르면 걸어가는 길을 따라 칠해요" : s === "rect" ? "네모: 두 모서리 칸을 누르면 그 안을 채워요" : ""); }
  shapeCells(a, b) {
    if (this.shape === "rect") { const out = []; for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push([x, z]); return out; }
    const p = findPath(this.world.grid, a.x, a.z, b.x, b.z, 30000);              // 길: 걸어갈 수 있는 길을 따라(못 찾으면 ㄱ자로 곧게)
    if (p) return [[a.x, a.z], ...p];
    const out = []; for (let x = a.x; x !== b.x; x += Math.sign(b.x - a.x)) out.push([x, a.z]); for (let z = a.z; z !== b.z + Math.sign(b.z - a.z || 1); z += Math.sign(b.z - a.z || 1)) { out.push([b.x, z]); if (z === b.z) break; } return out;
  }
  editCell(x, z) {                                                               // 칠하기·높이 바꾸기 한 칸(되돌리기 기록)
    this.record(x, z);
    if (this.mode === "paint") this.world.paint(x, z, this.paintType);
    else if (this.heightOp === "level") this.world.reshape(x, z, "flatten", this.levelH, 1);
    else this.world.reshape(x, z, this.heightOp, this.flatTarget, 1);
  }
  buzz() { this.onEdit?.(this.mode); if (TOOLS_TOUCH && navigator.vibrate && document.documentElement.dataset.vibe !== "off") {   // 설정 → 조작 → 진동을 끄면 조용히
    const t = performance.now(); if (t - (this.lastBuzz || 0) > 60) { this.lastBuzz = t; navigator.vibrate(6); } } }
  // ---- 십자선 모드: 화면 가운데가 붓, 큰 버튼을 누르는 동안 칠함
  setCross(on) { this.cross = on; this.cancelStroke(); this.applyControls(); this.onCross?.(on); this.refresh(); }
  tick() {
    this.tickAsks();
    if (!this.cross || (this.mode !== "paint" && this.mode !== "height")) return;
    const r = this.dom.getBoundingClientRect(), h = this.pick(r.left + r.width / 2, r.top + r.height / 2);
    if (h?.x !== this.hover?.x || h?.z !== this.hover?.z) { this.hover = h; this.refresh(); if (this.crossHeld) this.apply(); }
  }
  crossPress(on) {
    if (on) { this.crossHeld = true; this.stroke = new Set(); this.flatTarget = this.hover ? this.world.grid.get(this.hover.x, this.hover.z).elevation : 0; this.apply(); this.crossT = setInterval(() => { this.stroke = new Set(); this.apply(); }, 220); }
    else { this.crossHeld = false; clearInterval(this.crossT); this.commitStroke(); }
  }
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
    if (this.tapPick) {                                                          // 누르면 고르는 도구: 끌기는 OrbitControls가 화면을 옮기고, 손을 뗄 때 톡이었으면 자리를 정함
      this.press = { x: e.clientX, y: e.clientY, t: e.timeStamp, far: 0, type: e.pointerType, multi: false, tap: true }; return;
    }
    this.hover = this.pick(e.clientX, e.clientY); this.refresh();
    this.press = { x: e.clientX, y: e.clientY, multi: false };
    if (this.strokeMode() && this.shapeNow() === "brush") {
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
    const tp = this.press?.tap ? this.press : null;
    if (tp) { tp.far = Math.max(tp.far, Math.hypot(e.clientX - tp.x, e.clientY - tp.y)); if (tp.type !== "mouse") return; }   // 터치로 끄는 동안은 고스트·강조를 그대로(손을 떼도 자리 안 바뀜)
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
    if (p.tap) {                                                                 // 톡이면 손을 뗀 곳의 칸을 고름(끄는 동안 화면이 손가락을 따라왔으니 뗀 곳 = 누른 땅)
      const far = Math.max(p.far, Math.hypot(e.clientX - p.x, e.clientY - p.y));
      const ms = e.timeStamp - p.t;                                              // 이벤트가 생긴 때끼리(그림 그리느라 늦게 받아도 누른 시간이 늘지 않게)
      this.lastPress = pressKind({ dist: far, ms, pointer: p.type, multi: p.multi }); this.lastPressInfo = { dist: Math.round(far * 10) / 10, ms: Math.round(ms) };
      if (this.lastPress === "tap" && this.tapPick) { this.hover = this.pick(e.clientX, e.clientY); this.apply(); }
      return;
    }
    if (this.pending && !p.multi) { clearTimeout(this.pendingT); const f = this.pending; this.press = p; f(); this.press = null; }   // 짧게 톡: 한 번 칠함
    if (this.mode !== "view" && (!this.strokeMode() || this.shapeNow() !== "brush") && !p.multi) this.apply();
    this.painting = false; this.pending = null; this.commitStroke(); this.commitNature();
  }

  apply() {
    const h = this.hover; if (!h) return;
    if (this.usesShape() && this.shape !== "brush") {                              // 길·네모: 첫 칸 → 둘째 칸
      if (!this.shapeStart) { this.shapeStart = { x: h.x, z: h.z }; this.natLast = null; this.onStatus(`${this.shape === "line" ? "길" : "네모"}: 끝 칸을 누르세요`); this.refresh(); return; }
      const cells = this.shapeCells(this.shapeStart, h); if (this.mode === "height") this.flatTarget = this.world.grid.get(this.shapeStart.x, this.shapeStart.z).elevation;
      if (this.mode === "nature") { this.stroke = null; this.shapeStart = null; this.natureCells(cells); this.commitNature(); return; }   // 파기·메우기 길·네모: 묶음 하나
      for (const [x, z] of cells) this.editCell(x, z);
      this.commitStroke(); this.shapeStart = null; this.buzz(); this.onStatus(`${cells.length}칸을 바꿨어요 · ↶ 되돌리기`); this.refresh(); return;
    }
    if (this.mode === "paint") { for (const [x, z] of this.brushCells(h)) { this.editCell(x, z); } this.buzz(); }
    else if (this.mode === "height") {
      // 붓 안의 모든 칸을 똑같이(가운데만 솟지 않게)
      for (const [x, z] of this.brushCells(h)) {
        const k = `${x},${z}`; if (this.stroke?.has(k)) continue; this.stroke?.add(k);
        this.editCell(x, z);
      }
      this.buzz();
    }
    else if (this.mode === "build") {                                            // 누르면 자리만 정함 → 🔨 건설 버튼(또는 Enter)으로 지음
      if (BUILDINGS[this.buildId].bridge) {                                       // 다리: 처음 누른 칸 → 끝 칸(곧은 줄, 가로나 세로)
        const p = this.plan;
        if (!p || !p.bridge || p.done) this.plan = { x: h.x, z: h.z, x1: h.x, z1: h.z, bridge: true, done: false };
        else { if (Math.abs(h.x - p.x) >= Math.abs(h.z - p.z)) { p.x1 = h.x; p.z1 = p.z; } else { p.x1 = p.x; p.z1 = h.z; } p.done = true; }
        this.refresh(); return;
      }
      // 못 짓는 자리(나무·건물·물 위)를 누름: 2칸 안의 빈 자리로 살짝 옮겨 줌(헛탭 줄이기) · 없으면 빨간 고스트 + 까닭 크게 + 카드 흔들기(편의성 점검 4번)
      if (this.spotOk(h.x, h.z)) { this.plan = { x: h.x, z: h.z }; this.refresh(); return; }
      const s = nearestSpot((x, z) => this.spotOk(x, z), h.x, h.z, SNAP_R);
      if (s) { this.plan = { x: s.x, z: s.z, snapped: true }; this.refresh(); this.buzz(); return; }
      this.plan = { x: h.x, z: h.z }; this.refresh();
      const def = BUILDINGS[this.buildId], a = anchorFor(def, h.x, h.z, this.rot); this.onBadSpot?.(this.world.check(this.buildId, a.x, a.z, this.rot).reason);
      if (TOOLS_TOUCH && navigator.vibrate && document.documentElement.dataset.vibe !== "off") navigator.vibrate([18, 50, 18]);
      return;
    } else if (this.mode === "nature") {
      const a = this.natAct;
      if (a.kind === "move") { this.plan = { x: h.x, z: h.z, move: a.what }; this.natLast = null; this.refresh(); return; }   // 옮기기는 자리만 정함 → 🚚 옮기기(또는 Enter)
      if (a.kind === "dig" || a.kind === "fill") { this.natureCells(this.brushCells(h)); return; }
      const k = `${h.x},${h.z}`; if (this.stroke?.has(k)) return; this.stroke?.add(k);   // 한 번 끌 때 같은 칸은 한 번만
      const call = this.natureCall(a, h.x, h.z); this.natNote(call ? this.world[call.op](...call.args, {}) : { ok: false, reason: "치울 게 없어요" }, call); return;
    } else if (this.mode === "demolish") {
      const b = this.world.buildingAt(h.x, h.z);
      if (b && BUILDINGS[b.defId].fixed) { this.onStatus(`${BUILDINGS[b.defId].name}은 철거할 수 없어요`); return; }
      if (b) { this.askDemolish(b); return; }
    }
    this.refresh();
  }

  /** 철거: 바로 부수지 않고 확인창(onConfirm)을 거침(편의성 점검 8번 — 한 번 톡에 되돌릴 수 없이 사라지던 것). 방금 놓아 아직 안 쓴 공사장은 ↶처럼 장부까지 되돌림 */
  async askDemolish(b) {
    const w = this.world, def = BUILDINGS[b.defId], done = w.isDone(b), owner = def.house && b.owner != null ? w.units.find(u => u.unitId === b.owner) : null;
    this.buildingViews.setHighlight(b.id);
    const ok = this.onConfirm ? await this.onConfirm(demolishAsk({ name: def.name, done, fee: done ? 0 : b.fee || 0, owner: owner?.name || "", loan: owner?.loan?.left || 0 })) : true;
    if (!ok || w !== this.world || w.buildings.get(b.id) !== b) { this.refresh(); return; }
    const fee = w.isDone(b) ? 0 : b.fee || 0;                                      // 확인창을 띄운 사이 다 지어졌을 수도 있어 지금 값으로(돌려받은 만큼만 알림에)
    if (!w.undoBuild(b.id).ok) w.removeBuilding(b.id);                            // 되돌릴 수 있는 공사장이면 undoBuild(같은 날 장부는 설계비 칸에서 뺌), 아니면 보통 철거(공사 중이면 환불 칸에)
    this.history = this.history.filter(h => !(h.kind === "build" && h.ids.includes(b.id))); this.onHistory?.();
    this.refresh(); this.onStatus(`🧹 ${josa(def.name, "을", "를")} 철거했어요${fee ? ` · 설계비 🪙${fee} 돌려받음` : ""}`);
  }
  /** 짓기를 되돌리기 목록에 넣음(놓은 것 중 ↶로 무를 수 있는 것만). 넣었으면 그 항목 */
  pushBuild(name, list) {
    const ids = list.filter(b => b.undoable && !this.world.isDone(b)).map(b => b.id); if (!ids.length) return null;
    const s = { kind: "build", name, ids }; this.history.push(s); if (this.history.length > 60) this.history.shift(); this.redoStack = []; this.onHistory?.(); return s;
  }
  /** 정해 둔 자리에 짓기(🔨 건설). */
  /** 다리 줄의 칸들과 그중 놓을 수 있는(물) 칸 */
  bridgeLine(p) {
    const cells = [], sx = Math.sign(p.x1 - p.x), sz = Math.sign(p.z1 - p.z), n = Math.max(Math.abs(p.x1 - p.x), Math.abs(p.z1 - p.z));
    for (let i = 0; i <= n; i++) cells.push([p.x + sx * i, p.z + sz * i]);
    const ok = cells.filter(([x, z]) => this.world.check("bridge", x, z, 0).ok), water = cells.filter(([x, z]) => this.world.grid.isWater(x, z));
    return { cells, ok, water };
  }
  confirmBuild() {
    const h = this.plan;
    if (this.mode === "nature" && h?.move) {                                      // 🚚 지형지물 옮기기
      const p = this.movePlan(h, h.move), r = p ? this.world.moveLandmark(p.defId, p.ax, p.az, p.rot, {}) : { ok: false, reason: "이 섬에는 없어요" };
      if (r.ok) { this.plan = null; this.natNote(r, { op: "moveLandmark", args: [p.defId, p.ax, p.az, p.rot] }); this.natBatch.arg = `move:${p.defId}`; this.commitNature(); return; }
      this.refresh(); this.onStatus(`🚫 ${r.reason}`); return;
    }
    if (this.mode !== "build" || !h) return;
    if (h.bridge) {
      const { ok } = this.bridgeLine(h), put = []; let fee = 0; for (const [x, z] of ok) { const r = this.world.placeBuilding("bridge", x, z, 0); if (r.ok) { put.push(r.building); fee += r.building.fee || 0; } }
      const n = put.length, paid = fee ? ` · 설계비 🪙${fee} → 금고 🪙${Math.floor(this.world.bank.vault)}` : "", cut = n && n < ok.length ? ` · 금고가 모자라 ${ok.length - n}칸은 못 놓았어요` : "";
      const s = n ? this.pushBuild(BUILDINGS.bridge.name, put) : null;
      this.plan = null; this.refresh(); this.onStatus(n ? `다리 ${n}칸 공사를 시작했어요${paid}${cut}${s ? " · ↶ 누르면 되돌리기" : " · 🪚 목수가 땅 쪽부터 한 칸씩 놓아요"}` : "놓을 수 있는 물 칸이 없어요", s && this.undoAct(s)); return;
    }
    const def = BUILDINGS[this.buildId], a = anchorFor(def, h.x, h.z, this.rot), r = this.world.placeBuilding(this.buildId, a.x, a.z, this.rot);
    if (r.ok) this.plan = null;
    const paid = r.ok && r.building.fee ? ` · 설계비 🪙${r.building.fee} → 금고 🪙${Math.floor(this.world.bank.vault)}` : "", s = r.ok ? this.pushBuild(def.name, [r.building]) : null;
    this.refresh(); this.onStatus(!r.ok ? r.reason : r.building.hits >= r.building.need ? `${josa(def.name, "을", "를")} 지었어요${paid}` : `${def.name} 공사를 시작했어요${paid}${s ? " · ↶ 누르면 되돌리기" : " · 갈매미가 나무·돌로 지어요"}`, s && this.undoAct(s));
  }
  /** 알림을 누르면 이 짓기를 되돌림(hud.status의 act) */
  undoAct(s) { return { act: { label: "↶ 되돌리기", run: () => this.undoEntry(s) } }; }
  clearPlan() { this.plan = null; this.refresh(); }

  // 미리보기 갱신: 칸 커서 / 고스트 색(초록 = 지을 수 있음, 빨강 = 못 지음 + 이유) / 철거 대상 강조
  refresh() {
    const plan = this.mode === "build" || this.mode === "nature" ? this.plan : null, h = plan || this.hover, grid = this.world.grid;
    this.cursor.visible = false; this.ghost.visible = false; this.doorMark.visible = false;
    // onPlan(보이나, 지을 수 있나, 자리) — 자리: 건물 { defId, ax, az, rot } · 다리 { bridge, ok: 놓을 수 있는 칸 수, water: 물 칸 수 }(확인창이 설계비·금고를 다시 셈)
    if (this.mode === "build" && plan?.bridge) { const L = this.bridgeLine(plan); this.onPlan?.(plan.done, L.ok.length > 0, { bridge: true, ok: L.ok.length, water: L.water.length }); }
    else if (this.mode === "nature" && plan?.move) { const p = this.movePlan(plan, plan.move); this.onPlan?.(true, !!p && this.world.moveLandmark(p.defId, p.ax, p.az, p.rot, { dry: true }).ok, p && { move: p.defId, ax: p.ax, az: p.az, rot: p.rot }); }
    else if (this.mode === "build" && plan) { const def = BUILDINGS[this.buildId], a = anchorFor(def, plan.x, plan.z, this.rot); this.onPlan?.(true, this.world.check(this.buildId, a.x, a.z, this.rot).ok, { defId: this.buildId, ax: a.x, az: a.z, rot: this.rot }); }
    else this.onPlan?.(false);
    if (!h) { this.buildingViews.setHighlight(null); return; }
    const cell = grid.get(h.x, h.z);
    if (this.mode === "nature" && !this.usesShape()) return this.refreshNature(h, plan);
    if (this.usesShape()) {
      const cells = this.brushCells(h), top = Math.max(...cells.map(([x, z]) => Math.max(terrainHeight(grid, x + 0.5, z + 0.5), grid.walkHeight(x, z) ?? -9)));
      this.cursor.visible = true; this.cursor.scale.set(this.brush, this.brush, 1);
      this.cursor.position.set(toWorldX(h.x + 0.5), top + 0.03, toWorldZ(h.z + 0.5));
      const dry = this.mode === "nature" ? this.world[this.natAct.kind === "dig" ? "digCells" : "fillCells"](this.shapeStart && this.shape === "rect" ? this.shapeCells(this.shapeStart, h) : this.shape === "brush" ? cells : [[h.x, h.z]], { dry: true }) : null;   // 파기·메우기: 미리보기(dry)로 값·까닭
      this.cursor.material.color.setHex(dry ? (dry.ok ? OK : BAD) : cells.some(([x, z]) => this.mode === "height" ? this.world.canReshape(x, z) : this.world.canPaint(x, z)) ? 0xffffff : BAD);   // 칠할 수 있는 칸이 하나도 없으면 빨강
      if (dry) this.natStatus(dry);
      if (this.shape !== "brush") { this.cursor.scale.set(1, 1, 1); if (!dry) this.cursor.material.color.setHex(0xffd36b); }
      const a = this.shapeStart;
      if (a && this.shape === "rect") { const w = Math.abs(h.x - a.x) + 1, d = Math.abs(h.z - a.z) + 1; this.cursor.scale.set(w, d, 1); this.cursor.position.set(toWorldX(Math.min(a.x, h.x) + w / 2), top + 0.03, toWorldZ(Math.min(a.z, h.z) + d / 2)); }
    } else if (this.mode === "build" && plan?.bridge) {                           // 다리 줄 미리보기: 줄 전체를 한 상자로
      const L = this.bridgeLine(plan.done ? plan : { ...plan, x1: this.hover?.x ?? plan.x, z1: this.hover?.z ?? plan.z }), [ax, az] = L.cells[0], [bx, bz] = L.cells[L.cells.length - 1];
      const len = L.cells.length, horiz = az === bz, col = L.ok.length && L.ok.length === L.water.length ? OK : L.ok.length ? 0xffc04a : BAD;
      this.ghost.visible = true; this.ghost.rotation.y = 0; this.ghost.position.set(toWorldX((ax + bx) / 2 + 0.5), 0, toWorldZ((az + bz) / 2 + 0.5));
      this.ghostBox.scale.set(horiz ? len : 0.9, 0.15, horiz ? 0.9 : len); this.ghostBox.position.y = 0.05; this.ghostFloor.scale.set(horiz ? len : 1, horiz ? 1 : len, 1); this.ghostFloor.position.y = 0.04;
      this.ghostMat.color.setHex(col); this.ghostFloor.material.color.setHex(col);
      this.onStatus(plan.done ? `다리 ${L.ok.length}칸(나무 ${L.ok.length}) · 🔨 건설을 누르면 지어요 · 다시 누르면 새로 정하기` : "다리 끝 칸을 누르세요(가로나 세로로 곧게)");
    } else if (this.mode === "build") {
      const def = BUILDINGS[this.buildId], a = anchorFor(def, h.x, h.z, this.rot), r = this.world.check(this.buildId, a.x, a.z, this.rot);
      const y = r.ok ? r.elevation : Math.max(0, cell.elevation), col = r.ok ? OK : BAD;
      this.ghost.visible = true; this.ghost.position.set(toWorldX(r.center.x), y, toWorldZ(r.center.z)); this.ghost.rotation.y = r.angle;
      this.ghostBox.scale.set(def.footprint.w * 0.9, def.height * 1.5, def.footprint.d * 0.9); this.ghostBox.position.y = def.height * 0.75;
      this.ghostFloor.scale.set(def.footprint.w, def.footprint.d, 1); this.ghostFloor.position.y = 0.04;
      this.ghostMat.color.setHex(col); this.ghostFloor.material.color.setHex(col);
      this.doorMark.visible = true; this.doorMark.position.set(toWorldX(r.door.x + 0.5), y + 0.35, toWorldZ(r.door.z + 0.5));
      this.onStatus(!r.ok ? r.reason : plan?.auto ? `${def.name}: 화면 가운데 가까운 빈 자리에 놓아 봤어요 · 🔨 건설을 누르면 지어요 (다른 곳을 톡 누르면 옮김 · ↻ 돌리기)`
        : plan?.snapped ? `${def.name}: 누른 곳은 못 지어서 바로 옆 빈 자리로 옮겼어요 · 🔨 건설을 누르면 지어요`
        : plan ? `${def.name} 자리를 정했어요 · 🔨 건설을 누르면 지어요 (다른 곳을 톡 누르면 옮김 · 끌면 화면 이동 · ↻ 돌리기)` : `${def.name} · 톡 눌러서 자리 정하기 · 끌면 화면 이동 · R 돌리기`);
    } else if (this.mode === "demolish") {
      const b = this.world.buildingAt(h.x, h.z); this.buildingViews.setHighlight(b ? b.id : null);
      this.cursor.visible = !b; this.cursor.scale.set(1, 1, 1); this.cursor.position.set(toWorldX(h.x + 0.5), terrainHeight(grid, h.x + 0.5, h.z + 0.5) + 0.03, toWorldZ(h.z + 0.5)); this.cursor.material.color.setHex(BAD);
    }
  }
  /** 미리보기 상태 줄(같은 글이면 다시 안 띄움 — 끝낸 일의 요약을 덮지 않게) */
  natStatus(r) { const w = this.world, t = natureHover(this.natArg, r, Math.floor(w.bank?.vault || 0), !!w.economy); if (t && t !== this.natLast) { this.natLast = t; this.onStatus(t); } }
  /** 자연·지형 고스트: 심기·놓기 = 칸 위 작은 상자(초록/빨강), 치우기 = 칸 판(주황/빨강), 옮기기 = 차지 칸 전체 + 동굴 입구 화살표. 모두 dry 결과로(아무것도 안 바꿈) */
  refreshNature(h, plan) {
    const a = this.natAct, w = this.world, grid = w.grid;
    if (a.kind === "move") {
      const p = this.movePlan(plan || h, a.what);
      if (!p) { if (!this.world.landmark(a.what)) this.natStatus({ ok: false, reason: "이 섬에는 없어요" }); return; }
      const r = w.moveLandmark(p.defId, p.ax, p.az, p.rot, { dry: true }), xs = p.cells.map(c => c[0]), zs = p.cells.map(c => c[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, z0 = Math.min(...zs), z1 = Math.max(...zs) + 1, col = r.ok ? OK : BAD;
      const y = Math.max(...p.cells.map(([x, z]) => grid.inBounds(x, z) ? terrainHeight(grid, x + 0.5, z + 0.5) : 0), WATER_Y);
      this.ghost.visible = true; this.ghost.rotation.y = 0; this.ghost.position.set(toWorldX((x0 + x1) / 2), y, toWorldZ((z0 + z1) / 2));
      this.ghostBox.scale.set((x1 - x0) * 0.9, 1.6, (z1 - z0) * 0.9); this.ghostBox.position.y = 0.8; this.ghostFloor.scale.set(x1 - x0, z1 - z0, 1); this.ghostFloor.position.y = 0.04;
      this.ghostMat.color.setHex(col); this.ghostFloor.material.color.setHex(col);
      if (a.what === "cave") { const f = frontCells(p.cells, p.rot); if (f.length) { const fx = f.reduce((s, c) => s + c[0], 0) / f.length, fz = f.reduce((s, c) => s + c[1], 0) / f.length; this.doorMark.visible = true; this.doorMark.position.set(toWorldX(fx + 0.5), y + 0.35, toWorldZ(fz + 0.5)); } }   // 동굴 입구 앞
      if (plan) { const t = r.ok ? "이 자리로 옮길까요? · 🚚 옮기기를 누르면 옮겨요" : `🚫 ${r.reason}`; if (t !== this.natLast) { this.natLast = t; this.onStatus(t); } }
      else this.natStatus(r);
      return;
    }
    const call = this.natureCall(a, h.x, h.z), r = call ? w[call.op](...call.args, { dry: true }) : { ok: false, reason: "치울 게 없어요" };
    const y = Math.max(terrainHeight(grid, h.x + 0.5, h.z + 0.5), grid.walkHeight(h.x, h.z) ?? -9, WATER_Y);
    if (a.kind === "clear") {
      this.cursor.visible = true; this.cursor.scale.set(1, 1, 1); this.cursor.position.set(toWorldX(h.x + 0.5), y + 0.05, toWorldZ(h.z + 0.5)); this.cursor.material.color.setHex(r.ok ? 0xffa64d : BAD);
    } else {
      const tall = a.what === "bush" || a.what === "flower" ? 0.35 : a.what === "beachRock" || a.what === "ore" ? 0.6 : 1.4, col = r.ok ? OK : BAD;
      this.ghost.visible = true; this.ghost.rotation.y = 0; this.ghost.position.set(toWorldX(h.x + 0.5), y, toWorldZ(h.z + 0.5));
      this.ghostBox.scale.set(0.55, tall, 0.55); this.ghostBox.position.y = tall / 2; this.ghostFloor.scale.set(1, 1, 1); this.ghostFloor.position.y = 0.04;
      this.ghostMat.color.setHex(col); this.ghostFloor.material.color.setHex(col);
    }
    this.natStatus(r);
  }
}
