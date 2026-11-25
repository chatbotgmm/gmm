// 풍차 전기 범위 표시: 풍차를 누르면(또는 건설 모드에서 풍차 자리를 고르는 동안) 땅 위에 반지름 POWER_RANGE칸의 고리 + 옅은 원판을 그리고,
// 범위 안의 불 달린 건물(가로등·집·카페·잡화점·우체국) 위에 ⚡ 표시를 띄움. 가로등·집처럼 전기를 쓰는 건물의 자리를 고를 때는 지금 있는 풍차들의 범위를 보여 줌.
// 규칙·숫자는 world/power.js 한 곳(POWER_RANGE, litInRange). 고리는 땅 높이를 따라가고(물 위는 물 높이), 다른 것에 가리지 않게 깊이 검사 없이 그림 —
// 빛·시간대와 상관없는 색(어두운 테두리 + 밝은 노랑)이라 잔디·모래·눈, 낮·밤 모두에서 보임.
// 풍차 카드(#houseCard를 같이 씀): 「⚡ 전기 범위 18칸 · 불 켜진 건물 N」. 카드를 닫거나 다른 곳을 누르거나 도구를 바꾸면(카드가 숨으면) 고리도 사라짐.
import * as THREE from "three";
import { toWorldX, toWorldZ, toGridX, toGridZ, WATER_Y } from "../config.js";
import { BUILDINGS } from "../data/catalog.js";
import { terrainHeight } from "../world/terrain.js";
import { POWER_RANGE, centerOf, litInRange, powerSources, usesPower } from "../world/power.js";

const SEG = 120, LIFT = 0.1;
let BOLT = null;                                                                  // ⚡ 그림(한 번만 그림: 글꼴에 기대지 않게 직접 그린 번개)
function boltTex() {
  if (BOLT) return BOLT; const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  g.beginPath(); g.arc(32, 32, 27, 0, 6.3); g.fillStyle = "#1f2b4d"; g.fill(); g.lineWidth = 4; g.strokeStyle = "#fff"; g.stroke();
  g.beginPath(); for (const [i, [x, y]] of [[37, 9], [17, 36], [29, 36], [25, 55], [47, 26], [34, 26]].entries()) i ? g.lineTo(x, y) : g.moveTo(x, y); g.closePath(); g.fillStyle = "#ffd84a"; g.fill();
  BOLT = new THREE.CanvasTexture(c); BOLT.colorSpace = THREE.SRGBColorSpace; return BOLT;
}
const flat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide });
/** 땅 높이를 따라가는 고리 띠(r0~r1칸, rings단) — 칸 좌표 (cx, cz) 가운데 */
function band(grid, cx, cz, r0, r1, rings, mat, order) {
  const pos = [], idx = [];
  for (let i = 0; i <= rings; i++) { const r = r0 + (r1 - r0) * i / rings;
    for (let k = 0; k <= SEG; k++) { const a = k / SEG * Math.PI * 2, gx = cx + Math.cos(a) * r, gz = cz + Math.sin(a) * r;
      pos.push(toWorldX(gx), Math.max(terrainHeight(grid, gx, gz), WATER_Y) + LIFT, toWorldZ(gz)); } }
  for (let i = 0; i < rings; i++) for (let k = 0; k < SEG; k++) { const a = i * (SEG + 1) + k, b = a + SEG + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  const m = new THREE.Mesh(geo, mat); m.renderOrder = order; m.frustumCulled = false; m.userData.noToon = true; m.raycast = () => {}; return m;
}

export class PowerRange {
  constructor({ scene, camera, controls, getWorld, card }) {
    this.scene = scene; this.camera = camera; this.controls = controls; this.getWorld = getWorld; this.card = card; this.sel = null; this.rings = []; this.key = "";
    this.root = new THREE.Group(); this.root.name = "powerRange"; scene.add(this.root);
    this.mats = { dark: flat(0x16213f, 0.78), line: flat(0xffdf3d, 1), fill: flat(0xffe27a, 0.2), dim: flat(0xdfe6f2, 0.9), mark: flat(0xffd84a, 0.45) };
    this.boltMat = new THREE.SpriteMaterial({ map: boltTex(), sizeAttenuation: false, depthTest: false, depthWrite: false, toneMapped: false, fog: false, transparent: true });
    if (card) new MutationObserver(() => { if (card.hidden && this.sel) this.sel = null; }).observe(card, { attributes: true, attributeFilter: ["hidden"] });   // 카드가 닫히면(✕·도구 바꾸기) 범위도 지움
  }
  /** 섬에서 건물(또는 빈 땅 = null)을 눌렀을 때. main.js가 hud.houseCard 다음에 부름: 풍차면 범위를 켜고 카드에 전기 정보를 적음 */
  tap(b, ray = null, ground = null) {
    if (ray) b = this.pickOnRay(ray, ground, b);                                   // 풍차 몸통(실제 모양)을 눌렀는지 광선으로 다시 봄
    const c = this.card, go = c?.querySelector(".go"), mill = !!b && !!BUILDINGS[b.defId].power;
    if (go) go.hidden = mill;                                                      // 풍차 카드에는 「들어가 꾸미기」가 없음(집 카드에서는 다시 보임)
    this.sel = mill ? b : null; this.mine = mill; this.key = null; if (!mill || !c) return;
    c.querySelector(".hx").onclick = () => { c.hidden = true; }; this.fillCard(); c.hidden = false;
  }
  /** 눌린 건물 고르기(풍차용): 땅만 집는 누르기(tools.pickPoint → cell)는 키 큰 풍차의 몸통을 누르면 뒤쪽 땅(빈 땅이나 다른 건물의 칸)이 잡힘.
   *  ① 누른 광선이 가장 먼저 맞는 건물 모델(실제 모양)이 풍차면 풍차, 다른 건물이면(풍차 앞을 가린 벽을 누른 것) 풍차가 아님
   *  ② 맞은 모델이 없으면: 풍차 상자(차지한 칸 × 높이 — 날개 옆 빈 곳을 눌러도 되게 넉넉히)가 누른 땅보다 앞에 있으면 풍차, 아니면 땅의 칸(cell) 그대로
   *  ground = pickPoint가 준 칸 좌표(언덕 너머의 풍차는 안 잡히게 땅까지의 거리와 견줌) */
  pickOnRay(ray, ground, cell) {
    const w = this.getWorld(), o = ray.origin, d = ray.direction, flat = d.x * d.x + d.z * d.z;
    const far = (ground && flat > 1e-6 ? ((toWorldX(ground.gx) - o.x) * d.x + (toWorldZ(ground.gz) - o.z) * d.z) / flat : Infinity) + 0.05;   // 누른 땅까지의 거리(광선을 따라)
    const rc = this.rc || (this.rc = new THREE.Raycaster()); rc.set(o, d); rc.far = far;
    const meshes = [], walk = (n, id) => { if (!n.visible) return; id = n.userData.buildingId ?? id;
      if (id != null && n.isMesh && !n.userData.noToon && n.material?.blending !== THREE.AdditiveBlending) { n.userData.pickId = id; meshes.push(n); } for (const k of n.children) if (k !== this.root) walk(k, id); };
    walk(this.scene, null);
    const first = rc.intersectObjects(meshes, false)[0];
    if (first) { const b = w.buildings.get(first.object.userData.pickId); return b && BUILDINGS[b.defId].power ? b : cell && BUILDINGS[cell.defId].power ? null : cell; }
    const box = new THREE.Box3(), hit = new THREE.Vector3(); let best = null, bd = far;
    for (const b of w.buildings.values()) { const def = BUILDINGS[b.defId]; if (!def.power) continue;
      const xs = b.cells.map(q => q[0]), zs = b.cells.map(q => q[1]), y = b.elevation ?? 0;
      box.min.set(toWorldX(Math.min(...xs)), y, toWorldZ(Math.min(...zs))); box.max.set(toWorldX(Math.max(...xs) + 1), y + def.height, toWorldZ(Math.max(...zs) + 1));
      if (ray.intersectBox(box, hit)) { const t = hit.distanceTo(o); if (t < bd) { bd = t; best = b; } } }
    return best || cell;
  }
  fillCard() {
    const c = this.card, b = this.sel, w = this.getWorld(); if (!c || !b) return;
    const p = centerOf(b), n = litInRange(w, p.x, p.z).length;
    c.querySelector("b").textContent = `🌬 ${BUILDINGS[b.defId].name}`;
    c.querySelector("span").textContent = w.isDone(b) ? `⚡ 전기 범위 ${POWER_RANGE}칸 · 불 켜진 건물 ${n}` : `🔨 짓는 중 — 다 지으면 둘레 ${POWER_RANGE}칸에 전기(불 켜질 건물 ${n})`;
  }
  /** 매 프레임(main.js): 무엇을 보여 줄지 정하고, 바뀌었을 때(또는 1.5초마다 — 땅 높이·건물이 바뀌었을 수 있음)만 다시 만듦 */
  update(tools) {
    const w = this.getWorld(); if (!w) return;
    if (this.sel && w.buildings.get(this.sel.id) !== this.sel) { this.sel = null; if (this.card && this.mine) this.card.hidden = true; }   // 누른 풍차가 철거됨(새 섬 포함)
    const def = tools?.mode === "build" && tools.ghost.visible ? BUILDINGS[tools.buildId] : null, want = [];
    if (def?.power) want.push({ x: toGridX(tools.ghost.position.x), z: toGridZ(tools.ghost.position.z), marks: true });   // 풍차 자리 고르기: 놓을 자리의 범위
    else if (def && usesPower(def)) for (const s of powerSources(w)) want.push({ x: s.x, z: s.z });                       // 가로등·집 자리 고르기: 지금 전기가 닿는 곳
    else if (this.sel) { const p = centerOf(this.sel); want.push({ x: p.x, z: p.z, marks: true, dim: !w.isDone(this.sel) }); }
    const far = this.camera && this.controls ? this.camera.position.distanceTo(this.controls.target) : 40;
    this.lineW = Math.round(Math.max(0.3, Math.min(1.3, far * 0.011)) * 10) / 10;   // 고리 굵기(칸): 멀리서 봐도(폰 세로 화면 포함) 가늘어지지 않게 보는 거리에 맞춤
    const key = want.map(r => `${r.x},${r.z},${r.marks ? 1 : 0},${r.dim ? 1 : 0}`).join(";") + (want.length ? `|${w.powerRev}|${this.lineW}|${Math.floor(performance.now() / 1500)}` : "");
    if (key === this.key) return; this.key = key;
    for (const o of [...this.root.children]) { this.root.remove(o); if (o.isMesh) o.geometry.dispose(); }
    for (const r of want) this.draw(w, r);
    if (this.sel) this.fillCard();
  }
  draw(w, { x, z, marks, dim }) {
    const g = w.grid, R = POWER_RANGE, M = this.mats, L = this.lineW;
    this.root.add(band(g, x, z, 0, R, 9, M.fill, 6), band(g, x, z, R - L * 1.5, R + L * 0.5, 1, M.dark, 7), band(g, x, z, R - L, R, 1, dim ? M.dim : M.line, 8));   // 바깥 가장자리가 딱 범위 끝(밝은 띠 + 어두운 테두리)
    if (!marks) return;
    for (const b of litInRange(w, x, z)) {                                         // 범위 안의 불 달린 건물: 바닥 판 + 지붕 위 ⚡
      const c = centerOf(b), def = BUILDINGS[b.defId], xs = b.cells.map(q => q[0]), zs = b.cells.map(q => q[1]), y = (b.elevation ?? 0);
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(...xs) - Math.min(...xs) + 1, Math.max(...zs) - Math.min(...zs) + 1), M.mark);
      pad.rotation.x = -Math.PI / 2; pad.position.set(toWorldX(c.x), y + LIFT, toWorldZ(c.z)); pad.renderOrder = 7; pad.raycast = () => {};
      const s = new THREE.Sprite(this.boltMat); s.scale.setScalar(0.042); s.position.set(toWorldX(c.x), y + def.height + 0.7, toWorldZ(c.z)); s.renderOrder = 9; s.raycast = () => {};
      this.root.add(pad, s);
    }
  }
}
