// ✨ 반짝이 그림: world.sparkles를 읽어 칸 위에 작게 반짝이는 빛을 띄움(main.js mount에서 만들고 매 프레임 update).
// 반짝이 하나 = 위아래로 살짝 떠다니며 깜빡이는 스프라이트 하나. 화면에서 늘 지름 MIN_PX 이상(멀리서 봐도 보이고, 손가락으로 누르기 쉽게).
// 줍기: main.js가 땅을 누른 자리로 hit(화면 좌표, 반지름 HIT_PX) → 없으면 world.sparkleNear(1.2칸) → world.pickSparkle.
// 주운 반짝이는 pop(id)으로 POP_SECS 동안 위로 떠오르며 옅어진 뒤 사라짐.
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";

export const MIN_PX = 34;      // 스프라이트가 화면에서 적어도 이 지름(px). 별 끝은 그림 폭의 90% → 별 자체는 약 30px
export const MAX_SIZE = 8;     // 크기 상한(m): 가장 멀리 뺀 카메라(maxDistance)에서도 MIN_PX가 지켜지는 값
export const HIT_PX = 26;      // 누름 판정 반지름(px): 지름 52px ≥ 손가락 칸 44px
export const POP_SECS = 0.6;   // 주운 뒤 떠오르는 시간

function glintTex() {                                                            // 네 갈래 반짝임: 금빛 별 + 진한 테두리(모래·눈 위에서도 보이게) + 하얀 가운데
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const star = (R, r) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, q = i % 2 ? r : R; g.lineTo(64 + Math.cos(a) * q, 64 + Math.sin(a) * q); } g.closePath(); };
  const halo = g.createRadialGradient(64, 64, 0, 64, 64, 60); halo.addColorStop(0, "rgba(255,214,90,0.55)"); halo.addColorStop(1, "rgba(255,190,60,0)");
  g.fillStyle = halo; g.fillRect(0, 0, 128, 128);
  star(58, 15); g.lineJoin = "round"; g.lineWidth = 7; g.strokeStyle = "rgba(120,60,0,0.85)"; g.stroke();
  const fill = g.createRadialGradient(64, 64, 0, 64, 64, 58); fill.addColorStop(0, "#ffffff"); fill.addColorStop(0.3, "#fff2a8"); fill.addColorStop(1, "#ffc21a");
  g.fillStyle = fill; g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// 🌙 밤 반짝이: 어두운 휴대폰 화면에서도 보이게 진한 테두리 대신 밝은 빛 테두리 + 넓은 빛무리(하얀 바탕 그림 → 종류마다 색을 곱함)
function nightTex() {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const star = (R, r) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, q = i % 2 ? r : R; g.lineTo(64 + Math.cos(a) * q, 64 + Math.sin(a) * q); } g.closePath(); };
  const halo = g.createRadialGradient(64, 64, 0, 64, 64, 64); halo.addColorStop(0, "rgba(255,255,255,0.85)"); halo.addColorStop(0.45, "rgba(255,255,255,0.35)"); halo.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = halo; g.fillRect(0, 0, 128, 128);
  star(54, 14); g.lineJoin = "round"; g.lineWidth = 9; g.strokeStyle = "rgba(255,255,255,0.95)"; g.stroke();   // 빛 테두리
  g.lineWidth = 3; g.strokeStyle = "rgba(40,40,70,0.55)"; g.stroke();                                         // 가는 안쪽 선(밝은 모래·눈 위에서도 모양이 보이게)
  const fill = g.createRadialGradient(64, 64, 0, 64, 64, 54); fill.addColorStop(0, "#ffffff"); fill.addColorStop(1, "#d8d8d8");
  g.fillStyle = fill; g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** 밤 반짝이 종류마다 빛 색(그림에 곱함) */
/** 🗝 이야기 반짝이(world/story.js): 밤 반짝이처럼 빛 테두리 + 푸른 별빛, 조금 더 크게(보통 반짝이와 한눈에 구별) */
export const STORY_TINT = 0xa8d4ff;
/** 🌟 드문 반짝이(world/sparkles.js SPARKLE_RARE): 빛 테두리 + 분홍빛, 조금 더 크게(보통 금빛 별과 한눈에 다름) */
export const RARE_TINT = 0xff8fd8;
export const NIGHT_TINT = { fireflyJar: 0xe8ff7a, starNote: 0xffe9a8, moonShell: 0xbfe0ff, glowWeed: 0x7dffd8 };
const _v = new THREE.Vector3();
export class SparkleView {
  constructor(root) {
    this.root = root; this.tex = glintTex(); this.mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false, toneMapped: false })   // 톤 매핑을 끄면 금빛이 하얗게 바래지 않음;
    this.nTex = nightTex(); this.nMat = new THREE.SpriteMaterial({ map: this.nTex, transparent: true, depthWrite: false, fog: false, toneMapped: false });   // 밤 반짝이(빛 테두리)
    this.sprites = new Map(); this.pops = []; this.t = 0;                          // 반짝이 id → 스프라이트 · 떠오르는 중인 것
  }
  /** 화면 1px이 이 자리에서 몇 m인가(원근 카메라) */
  static mPerPx(camera, pos, viewH) { return 2 * camera.position.distanceTo(pos) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, viewH); }
  update(dt, world, camera, viewH) {
    this.t += dt; const seen = new Set();
    for (const s of world.sparkles || []) {
      seen.add(s.id); let sp = this.sprites.get(s.id);
      if (!sp) { const tint = s.rare ? RARE_TINT : NIGHT_TINT[s.k] ?? (s.story ? STORY_TINT : null); sp = new THREE.Sprite((tint ? this.nMat : this.mat).clone()); if (tint) { sp.material.color.setHex(tint); sp.userData.night = true; } if (s.story) sp.userData.story = true; if (s.rare) sp.userData.rare = true; sp.userData.noToon = true; sp.userData.sparkleId = s.id; sp.renderOrder = 10; this.root.add(sp); this.sprites.set(s.id, sp); }   // 반투명(물 1·눈비 2)보다 나중에 그림
      const ph = this.t * 3 + s.id * 1.7, ground = world.standHeight(s.x + 0.5, s.z + 0.5);
      sp.position.set(toWorldX(s.x + 0.5), ground + 0.3, toWorldZ(s.z + 0.5));
      const base = camera ? Math.min(MAX_SIZE, Math.max(0.36, MIN_PX * SparkleView.mPerPx(camera, sp.position, viewH))) : 0.36;
      const k = base * (sp.userData.story ? 1.35 : sp.userData.rare ? 1.25 : 1) * (sp.userData.night ? 1.25 + 0.3 * Math.max(0, Math.sin(ph * 1.3)) : 1 + 0.22 * Math.max(0, Math.sin(ph * 1.9))); sp.scale.set(k, k, 1);   // 밤 반짝이는 빛무리만큼 크게 · 느리게 숨 쉬듯   // 깜빡일 때만 커짐(가장 작을 때가 MIN_PX)
      sp.position.y = ground + 0.15 + k * 0.5 + Math.sin(ph) * 0.05 * k;           // 별 아래 끝이 땅에 묻히지 않게(크게 그려도 반쪽이 땅에 가려지지 않음)
      sp.material.opacity = Math.min(1, s.t / 20);   // 사라지기 20초 전부터 옅어짐(깜빡임은 크기로만: 투명하면 모래·물빛에 묻힘)
    }
    for (const [id, sp] of this.sprites) if (!seen.has(id)) { this.root.remove(sp); sp.material.dispose(); this.sprites.delete(id); }
    for (let i = this.pops.length - 1; i >= 0; i--) {                             // 주운 것: 위로 떠오르며 옅어짐
      const p = this.pops[i]; p.t += dt; const f = Math.min(1, p.t / POP_SECS);
      p.sp.position.y = p.y0 + f * 0.9; p.sp.scale.setScalar(p.k0 * (1 + 0.5 * f)); p.sp.material.opacity = 1 - f;
      if (f >= 1) { this.root.remove(p.sp); p.sp.material.dispose(); this.pops.splice(i, 1); }
    }
  }
  /** 주운 반짝이: 그림을 지우지 않고 떠오르는 그림으로 넘김(다음 update가 지우지 않게 목록에서 뺌) */
  pop(id) {
    const sp = this.sprites.get(id); if (!sp) return false; this.sprites.delete(id);
    this.pops.push({ sp, t: 0, y0: sp.position.y, k0: sp.scale.x }); return true;
  }
  /** 화면 좌표(clientX/Y)에서 HIT_PX 안에 그려진 가장 가까운 반짝이 { id } (없으면 null). dom = 그리는 캔버스 */
  hit(cx, cy, camera, dom, rpx = HIT_PX) {
    const r = dom.getBoundingClientRect(); let best = null, bd = rpx;
    for (const [id, sp] of this.sprites) {
      sp.getWorldPosition(_v).project(camera); if (_v.z < -1 || _v.z > 1) continue;   // 카메라 뒤·너무 먼 것
      const px = r.left + (_v.x + 1) / 2 * r.width, py = r.top + (1 - _v.y) / 2 * r.height, d = Math.hypot(px - cx, py - cy);
      if (d <= bd) { bd = d; best = { id }; }
    }
    return best;
  }
  /** 이 반짝이가 화면에서 몇 px 지름으로 그려지나(확인용) */
  screenPx(id, camera, viewH) { const sp = this.sprites.get(id); return sp ? sp.scale.x / SparkleView.mPerPx(camera, sp.getWorldPosition(_v), viewH) : 0; }
  dispose() {
    for (const sp of this.sprites.values()) { this.root.remove(sp); sp.material.dispose(); }
    for (const p of this.pops) { this.root.remove(p.sp); p.sp.material.dispose(); }
    this.sprites.clear(); this.pops = []; this.mat.dispose(); this.tex.dispose(); this.nMat.dispose(); this.nTex.dispose();
  }
}
