// 미니맵: 넓은 지도(192×192칸) 전체를 작게. 땅·바다·길·건물·갈매미(점)·지금 보는 곳(네모). 누르면 그곳으로 화면 이동.
import { toWorldX, toWorldZ, toGridX, toGridZ, SEA_LEVEL } from "../config.js";
import { BUILDINGS } from "../data/catalog.js";

const GROUND_RGB = { Grass: [140, 196, 78], Cobble: [140, 152, 166], WoodDeck: [200, 150, 95], Dirt: [200, 160, 118], Sand: [240, 222, 160], Rock: [150, 144, 135] };
const SIZE = 176;

export class Minimap {
  constructor({ getWorld, camera, controls, onStatus }) {
    Object.assign(this, { getWorld, camera, controls, onStatus });
    this.box = document.getElementById("minimap"); this.cv = this.box.querySelector("canvas"); this.cv.width = this.cv.height = SIZE;
    this.ctx = this.cv.getContext("2d"); this.terrain = document.createElement("canvas"); this.terrain.width = this.terrain.height = SIZE;
    this.tv = -1; this.t = 0;
    let on = !matchMedia("(pointer: coarse)").matches; try { const s = localStorage.getItem("galmaemiman-minimap"); if (s !== null) on = s === "1"; } catch { /* 무시 */ }
    this.setOn(on);
    document.getElementById("mapBtn").onclick = () => this.setOn(this.box.hidden);
    const go = e => { const r = this.cv.getBoundingClientRect(), w = this.getWorld(), gx = (e.clientX - r.left) / r.width * w.grid.w, gz = (e.clientY - r.top) / r.height * w.grid.h;
      const off = this.camera.position.clone().sub(this.controls.target); this.controls.target.set(toWorldX(gx), this.controls.target.y, toWorldZ(gz)); this.camera.position.copy(this.controls.target).add(off); };
    this.cv.addEventListener("pointerdown", e => { e.stopPropagation(); go(e); this.drag = true; });
    this.cv.addEventListener("pointermove", e => { if (this.drag) go(e); });
    addEventListener("pointerup", () => { this.drag = false; });
  }
  setOn(on) { this.box.hidden = !on; try { localStorage.setItem("galmaemiman-minimap", on ? "1" : "0"); } catch { /* 무시 */ } }
  drawTerrain(w) {
    const g = w.grid, img = this.terrain.getContext("2d").createImageData(SIZE, SIZE), sx = g.w / SIZE, sz = g.h / SIZE;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const c = g.get(Math.floor(x * sx), Math.floor(y * sz)), i = (y * SIZE + x) * 4; let rgb;
      if (c.elevation < SEA_LEVEL) { const d = Math.min(1, (SEA_LEVEL - c.elevation) / 0.9); rgb = [Math.round(120 - 80 * d), Math.round(205 - 70 * d), Math.round(220 - 30 * d)]; }
      else { rgb = (GROUND_RGB[c.groundType] || GROUND_RGB.Grass).slice(); const k = 1 + Math.min(0.3, Math.max(0, c.elevation) * 0.12); rgb = rgb.map(v => Math.min(255, v * k)); }
      if (c.occupiedId) { const b = w.buildings.get(c.occupiedId); if (b) rgb = BUILDINGS[b.defId].bridge ? [176, 128, 80] : BUILDINGS[b.defId].house ? [214, 110, 75] : [120, 92, 70]; else rgb = rgb.map(v => v * 0.72); }   // 건물 · 나무·바위(어둡게)
      img.data.set([rgb[0], rgb[1], rgb[2], 255], i);
    }
    this.terrain.getContext("2d").putImageData(img, 0, 0); this.tv = g.version;
  }
  update(dt) {
    if (this.box.hidden || (this.t -= dt) > 0) return; this.t = 0.3;
    const w = this.getWorld(), g = w.grid, ctx = this.ctx, kx = SIZE / g.w, kz = SIZE / g.h;
    if (this.tv !== g.version || (this.gt = (this.gt || 0) + 0.3) > 3) { this.drawTerrain(w); this.gt = 0; }   // 땅·건물이 바뀌면(바닥 칠하기도 3초마다)
    ctx.drawImage(this.terrain, 0, 0);
    for (const u of w.units) { if (u.insideBuildingId) continue; ctx.fillStyle = u.sailing ? "#ffe066" : "#ffffff"; ctx.beginPath(); ctx.arc(u.x * kx, u.z * kz, 2.2, 0, 6.29); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 0.8; ctx.stroke(); }
    // 지금 보는 곳: 화면 중심 + 카메라 거리만큼의 네모
    const t = this.controls.target, d = this.camera.position.distanceTo(t) * 0.55, cx = toGridX(t.x) * kx, cz = toGridZ(t.z) * kz;
    ctx.strokeStyle = "#ff8a3d"; ctx.lineWidth = 1.5; ctx.strokeRect(cx - d * kx, cz - d * kz * 0.7, d * 2 * kx, d * 1.4 * kz);
  }
}
