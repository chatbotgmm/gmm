// ✨ 반짝이 그림(아직 main.js에 연결하지 않음 — 화면 개편을 합친 뒤 연결): world.sparkles를 읽어 칸 위에 작게 반짝이는 빛을 띄움.
// 반짝이 하나 = 위아래로 살짝 떠다니며 깜빡이는 스프라이트 하나. 줍기는 main.js가 땅을 누른 칸으로 world.sparkleNear → world.pickSparkle.
// 연결할 때: const sparkleView = new SparkleView(scene); 매 프레임 sparkleView.update(dt, world);
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";

function glintTex() {                                                            // 네 갈래 반짝임(흰색 + 투명 배경)
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 30); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,248,214,0.9)"); r.addColorStop(1, "rgba(255,240,180,0)");
  g.fillStyle = r; g.beginPath(); g.moveTo(32, 2); g.quadraticCurveTo(36, 28, 62, 32); g.quadraticCurveTo(36, 36, 32, 62); g.quadraticCurveTo(28, 36, 2, 32); g.quadraticCurveTo(28, 28, 32, 2); g.fill();
  return new THREE.CanvasTexture(c);
}
export class SparkleView {
  constructor(scene) {
    this.scene = scene; this.tex = glintTex(); this.mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, color: 0xfff3c4 });
    this.sprites = new Map(); this.t = 0;                                         // 반짝이 id → 스프라이트
  }
  update(dt, world) {
    this.t += dt; const seen = new Set();
    for (const s of world.sparkles || []) {
      seen.add(s.id); let sp = this.sprites.get(s.id);
      if (!sp) { sp = new THREE.Sprite(this.mat.clone()); sp.userData.noToon = true; sp.renderOrder = 2; this.scene.add(sp); this.sprites.set(s.id, sp); }
      const ph = this.t * 3 + s.id * 1.7, y = world.standHeight(s.x + 0.5, s.z + 0.5) + 0.25 + Math.sin(ph) * 0.05;
      sp.position.set(toWorldX(s.x + 0.5), y, toWorldZ(s.z + 0.5));
      const k = 0.28 + 0.08 * Math.max(0, Math.sin(ph * 1.9)); sp.scale.set(k, k, 1);
      sp.material.opacity = Math.min(1, s.t / 20) * (0.75 + 0.25 * Math.sin(ph * 2.3));   // 사라지기 20초 전부터 옅어짐
    }
    for (const [id, sp] of this.sprites) if (!seen.has(id)) { this.scene.remove(sp); sp.material.dispose(); this.sprites.delete(id); }
  }
  dispose() { for (const sp of this.sprites.values()) { this.scene.remove(sp); sp.material.dispose(); } this.sprites.clear(); this.mat.dispose(); this.tex.dispose(); }
}
