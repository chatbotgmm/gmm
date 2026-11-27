// 미니맵: 넓은 지도(192×192칸) 전체를 작게. 땅·바다·길·건물·갈매미(점)·지금 보는 곳(네모). 누르면 그곳으로 화면 이동.
import { toWorldX, toWorldZ, toGridX, toGridZ, SEA_LEVEL } from "../config.js";
import { BUILDINGS } from "../data/catalog.js";

const GROUND_RGB = { Grass: [140, 196, 78], Cobble: [116, 130, 154], WoodDeck: [147, 94, 56], Dirt: [189, 139, 92], Sand: [240, 222, 160], Rock: [150, 144, 135] };
const SIZE = 176, BRIDGE_RGB = [176, 128, 80], HOUSE_RGB = [214, 110, 75], BUILDING_RGB = [120, 92, 70];

export class Minimap {
  constructor({ getWorld, camera, controls, onStatus }) {
    Object.assign(this, { getWorld, camera, controls, onStatus });
    this.box = document.getElementById("minimap"); this.cv = this.box.querySelector("canvas"); this.cv.width = this.cv.height = SIZE;
    this.ctx = this.cv.getContext("2d"); this.terrain = document.createElement("canvas"); this.terrain.width = this.terrain.height = SIZE;
    this.tv = -1; this.t = 0;
    let on = !matchMedia("(pointer: coarse)").matches; try { const s = localStorage.getItem("galmaemiman-minimap"); if (s !== null) on = s === "1"; } catch { /* 무시 */ }
    this.setOn(on);
    document.getElementById("mapBtn").onclick = () => this.setOn(this.box.hidden);
    const go = e => { const r = this.cv.getBoundingClientRect(), w = this.getWorld(), B = w.grid.box, gx = B.x0 + (e.clientX - r.left) / r.width * (B.x1 - B.x0), gz = B.z0 + (e.clientY - r.top) / r.height * (B.z1 - B.z0);
      const off = this.camera.position.clone().sub(this.controls.target); this.controls.target.set(toWorldX(gx), this.controls.target.y, toWorldZ(gz)); this.camera.position.copy(this.controls.target).add(off); };
    this.cv.addEventListener("pointerdown", e => { e.stopPropagation(); go(e); this.drag = true; });
    this.cv.addEventListener("pointermove", e => { if (this.drag) go(e); });
    addEventListener("pointerup", () => { this.drag = false; });
  }
  setOn(on) { this.box.hidden = !on; try { localStorage.setItem("galmaemiman-minimap", on ? "1" : "0"); } catch { /* 무시 */ } }
  drawTerrain(w) {
    const g = w.grid, B = g.box, img = this.terrain.getContext("2d").createImageData(SIZE, SIZE), d8 = img.data, sx = (B.x1 - B.x0) / SIZE, sz = (B.z1 - B.z0) / SIZE;   // 시작 섬 상자(지나온 바깥 청크 지도는 오픈월드 5단계)
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const c = g.get(B.x0 + Math.floor(x * sx), B.z0 + Math.floor(y * sz)), i = (y * SIZE + x) * 4; let r, gr, bl;   // 화소마다 배열을 만들지 않고 숫자로(3초마다 3만 화소)
      if (c.elevation < SEA_LEVEL) { const d = Math.min(1, (SEA_LEVEL - c.elevation) / 0.9); r = Math.round(120 - 80 * d); gr = Math.round(205 - 70 * d); bl = Math.round(220 - 30 * d); }
      else { const base = GROUND_RGB[c.groundType] || GROUND_RGB.Grass, k = 1 + Math.min(0.3, Math.max(0, c.elevation) * 0.12); r = Math.min(255, base[0] * k); gr = Math.min(255, base[1] * k); bl = Math.min(255, base[2] * k); }
      if (c.occupiedId) { const b = w.buildings.get(c.occupiedId); if (b) { const q = BUILDINGS[b.defId].bridge ? BRIDGE_RGB : BUILDINGS[b.defId].house ? HOUSE_RGB : BUILDING_RGB; r = q[0]; gr = q[1]; bl = q[2]; } else { r *= 0.72; gr *= 0.72; bl *= 0.72; } }   // 건물 · 나무·바위(어둡게)
      d8[i] = r; d8[i + 1] = gr; d8[i + 2] = bl; d8[i + 3] = 255;
    }
    this.terrain.getContext("2d").putImageData(img, 0, 0); this.tv = g.version;
  }
  update(dt) {
    if (this.box.hidden || (this.t -= dt) > 0) return; this.t = 0.3;
    const w = this.getWorld(), g = w.grid, B = g.box, ctx = this.ctx, kx = SIZE / (B.x1 - B.x0), kz = SIZE / (B.z1 - B.z0);
    if (this.tv !== g.version || (this.gt = (this.gt || 0) + 0.3) > 3) { this.drawTerrain(w); this.gt = 0; }   // 땅·건물이 바뀌면(바닥 칠하기도 3초마다)
    ctx.drawImage(this.terrain, 0, 0);
    for (const u of w.units) { if (u.insideBuildingId) continue; ctx.fillStyle = u.sailing ? "#ffe066" : "#ffffff"; ctx.beginPath(); ctx.arc(u.x * kx, u.z * kz, 2.2, 0, 6.29); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 0.8; ctx.stroke(); }
    // 지금 보는 곳: 화면 중심 + 카메라 거리만큼의 네모
    const t = this.controls.target, d = this.camera.position.distanceTo(t) * 0.55, cx = toGridX(t.x) * kx, cz = toGridZ(t.z) * kz;
    ctx.strokeStyle = "#ff8a3d"; ctx.lineWidth = 1.5; ctx.strokeRect(cx - d * kx, cz - d * kz * 0.7, d * 2 * kx, d * 1.4 * kz);
  }
}
