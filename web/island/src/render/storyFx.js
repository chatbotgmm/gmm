// 🗝 메인 스토리 장면(그리기만, 규칙은 world/story.js): 등대 불(꺼짐·다시 켜짐) · 수평선 끝 세 번 깜빡임 · 열린 등대 문 빛 · 반딧불 우체통 · 엔딩·불 켜는 연출.
//  · daylight.lampLit = 3장 등불을 고쳤나(아니면 밤에도 꺼진 등대) · daylight.lampBoost = 연출 중 낮에도 불을 켬(0~1, 천천히 오르내림)
//  · 깜빡임: 섬 가운데에서 등대를 지나 바다 쪽 먼 수평선에 빛 하나가 반짝·반짝·반짝(2.4초). 화면 난수를 쓰지 않음(정해진 모양)
//  · 연출(moment): 카메라를 등대로 → 불이 차오름 → (엔딩이면) 깜빡임 → 편지. main.js가 onGo(칸)·onLetter()를 넣어 줌
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";
import { storyLampLit } from "../world/story.js";

let ST_GLOW = null;
function stGlowTex() {
  if (ST_GLOW) return ST_GLOW; const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.18, "rgba(255,246,214,.95)"); r.addColorStop(0.45, "rgba(255,214,140,.35)"); r.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(255,250,230,.8)"; g.lineWidth = 3; for (const [x0, y0, x1, y1] of [[64, 6, 64, 122], [6, 64, 122, 64]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }   // 십자 빛살(멀리서도 '불빛'으로 읽히게)
  return (ST_GLOW = new THREE.CanvasTexture(c));
}
export const BLINK_SECS = 3.3;   // 세 번 깜빡이는 데 걸리는 시간(반짝 · 반짝 · 반짝)
/** 깜빡임 세기(0~1): t초 → 1.1초마다 둥근 펄스 하나(가운데가 가장 밝고, 사이엔 꺼짐) */
export const blinkAt = t => t < 0 || t >= BLINK_SECS ? 0 : Math.pow(Math.sin(Math.PI * ((t % 1.1) / 1.1)), 2);

export class StoryFx {
  constructor({ scene, daylight, camera = null }) {
    this.scene = scene; this.daylight = daylight; this.camera = camera; this.world = null; this.root = null;
    this.blinkT = -1; this.boost = 0; this.boostGoal = 0; this.boostHold = 0; this.queue = [];
    this.onGo = null; this.onLetter = null; this.onSound = null;
  }
  mount(world, root) {
    this.dispose(); this.world = world; this.root = root;
    const mk = (color, scale) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: stGlowTex(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
      s.scale.setScalar(scale); s.renderOrder = 12; s.userData.noToon = true; s.raycast = () => {}; s.visible = false; root.add(s); return s; };
    this.blink = mk(0xffe2a0, 10);                                                 // 수평선 불빛
    this.door = mk(0xffc870, 1.6);                                                // 열린 등대 문 틈 빛
    const box = new THREE.Group(); box.name = "storyMailbox"; box.visible = false;   // 반딧불 우체통(작은 기둥 + 빨간 함 + 반딧불)
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.9 }), red = new THREE.MeshStandardMaterial({ color: 0xd9533f, roughness: 0.6 });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), wood); post.position.y = 0.45;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3), red); body.position.y = 1.0;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 10, 1, false, 0, Math.PI), red); lid.rotation.z = Math.PI / 2; lid.position.y = 1.15;
    box.add(post, body, lid); for (const m of [post, body, lid]) { m.castShadow = true; m.receiveShadow = true; }
    this.fly = mk(0xe8ff7a, 0.5); root.remove(this.fly); box.add(this.fly); this.fly.position.set(0.25, 1.35, 0); this.fly.visible = true;
    root.add(box); this.mailbox = box;
    world.on("storyBlink", e => { if (e.scene) this.playBlink(); });
    world.on("storyRestore", e => { if (e.n === 3) this.moment("relight"); });
    world.on("storyEnd", () => this.moment("ending"));
  }
  /** 수평선 끝 자리(월드 좌표): 섬 가운데 → 등대 방향으로 등대에서 먼 바다. 카메라를 알면 화면 안(위쪽 알림·미니맵 구석을 피함)에 드는 가장 먼 자리(32 → 8칸) */
  horizon() {
    const w = this.world, m = w?.landmark("lighthouse"); if (!m) return null;
    const c = w.center, [mx, mz] = m.cells[0], d = Math.hypot(mx - c.x, mz - c.z) || 1, at = n => new THREE.Vector3(toWorldX(mx + (mx - c.x) / d * n), 1.6, toWorldZ(mz + (mz - c.z) / d * n));
    const cam = this.camera; if (!cam) return at(24);
    const free = v => v.z < 1 && Math.abs(v.x) < 0.8 && v.y > -0.5 && v.y < 0.8 && !(v.x > 0.5 && v.y > 0.35) && !(v.x < -0.2 && v.y > 0.7);   // 미니맵(오른쪽 위)·알림(왼쪽 위) 구석은 피함
    for (let n = 40; n >= 8; n -= 2) { const p = at(n); if (free(p.clone().project(cam))) return p; }
    return at(8);
  }
  playBlink() { this.blinkT = 0; this.blinkPos = this.horizon(); this.onSound?.("blink"); }
  /** 연출: relight(3장 등불) · ending(보름의 답장) */
  moment(kind) {
    const f = this.world?.landmarkFront("lighthouse"); if (f) this.onGo?.(f.x, f.z, kind);
    this.boostGoal = 1; this.boostHold = kind === "ending" ? 22 : 16;
    this.queue = kind === "ending" ? [{ at: 2.6, fn: () => this.playBlink() }, { at: 6.6, fn: () => this.onLetter?.() }] : [];
    this.momentT = 0;
  }
  update() {
    const w = this.world, dl = this.daylight; if (!w) return;
    const now = performance.now(), dt = Math.min(0.25, Math.max(0, ((now - (this.lastMs ?? now)) / 1000))); this.lastMs = now;   // 실제 시간으로(느린 기기에서 마을 시간 dt가 잘려도 연출 길이는 그대로)
    dl.lampLit = storyLampLit(w.story);
    if (this.momentT != null) { this.momentT += dt; while (this.queue.length && this.momentT >= this.queue[0].at) this.queue.shift().fn(); }
    if (this.boostHold > 0 && (this.boostHold -= dt) <= 0) this.boostGoal = 0;
    this.boost += Math.sign(this.boostGoal - this.boost) * Math.min(Math.abs(this.boostGoal - this.boost), dt / (this.boostGoal > this.boost ? 1.6 : 3));
    dl.lampBoost = this.boost;
    // 깜빡임
    if (this.blinkT >= 0) {
      const p = this.blinkPos, k = blinkAt(this.blinkT); this.blinkT += dt;
      if (p) { this.blink.position.copy(p); this.blink.visible = k > 0.01; this.blink.material.opacity = k; this.blink.scale.setScalar(8 + 10 * k); }
      if (this.blinkT >= BLINK_SECS) { this.blinkT = -1; this.blink.visible = false; }
    }
    // 등대 문 틈 빛 · 우체통
    const s = w.story, f = (s.restored.door || s.restored.mailbox) && w.landmarkFront("lighthouse");
    if (f) {
      const glow = dl.glow ?? 0;
      this.door.visible = !!s.restored.door; this.door.position.set(toWorldX(f.x + 0.5), w.standHeight(f.x + 0.5, f.z + 0.5) + 0.55, toWorldZ(f.z + 0.5)); this.door.material.opacity = 0.35 + 0.6 * glow;
      this.mailbox.visible = !!s.restored.mailbox;
      if (this.mailbox.visible) { const mx = f.x + 1.5, mz = f.z + 0.5; this.mailbox.position.set(toWorldX(mx), w.standHeight(mx, mz), toWorldZ(mz)); this.fly.material.opacity = 0.3 + 0.7 * glow; }
    } else { this.door.visible = false; this.mailbox.visible = false; }
  }
  dispose() {
    for (const o of [this.blink, this.door, this.mailbox]) if (o) { o.parent?.remove(o); o.traverse?.(m => { m.geometry?.dispose?.(); m.material?.dispose?.(); }); }
    this.blink = this.door = this.mailbox = null; this.world = null; this.queue = []; this.momentT = null; this.boost = this.boostGoal = this.boostHold = 0;
    if (this.daylight) this.daylight.lampBoost = 0;
  }
}
