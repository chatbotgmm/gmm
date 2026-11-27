// 바깥 땅 조각 스트리밍(오픈월드 1-A): 보는 곳 둘레 그리기 반경 안의 시작 섬 밖 16칸 조각만 메쉬로 올리고, 멀어지면 내린다.
//  · 메쉬는 GroundChunks와 같은 보기 격자·재료·만들기 함수(startBuild/stepBuild)로 만든다(캐시를 같이 써서 번갈아 지워지지 않게).
//  · 새로 올라온 조각은 프레임 예산(budgetMs) 안에서 나눠 만든다. 처음엔 성기게(칸당 1조각) → 그다음 거리별 상세도(lodFor)로 촘촘하게.
//  · 바다뿐인 조각(둘레까지 깊은 바다)은 메쉬를 만들지 않는다(물이 불투명하게 덮음, water.js).
//  · 바깥 조각은 ground.meshes가 아니라 this.meshes(다른 Map)에 둔다 → 도구(tools.js)의 땅 고르기 레이캐스트에 안 걸림.
import * as THREE from "three";
import { toGridX, toGridZ, toWorldX, toWorldZ } from "../config.js";
import { startBuild, stepBuild, resetCaches } from "./groundChunks.js";

const UNLOAD_EXTRA = 40;           // m: 그리기 반경 + 이만큼 밖으로 나가면 내림(왔다 갔다 할 때 다시 만들지 않게)
const CACHE_RESET = 120;           // 조각 이만큼 만들 때마다 꼭짓점 캐시를 비움(먼 곳을 오래 다녀도 캐시가 끝없이 커지지 않게)

export class ChunkStream {
  constructor(scene, ground, view) {
    this.scene = scene; this.ground = ground; this.view = view;
    this.meshes = new Map();        // 열쇠 "px,pz" → 메쉬
    this.sea = new Set();           // 바다뿐이라 메쉬가 없는 조각(다시 재지 않게)
    this.job = null; this.built = 0; this.unloaded = 0; this.sinceReset = 0;
    this.group = new THREE.Group(); this.group.name = "outer ground"; scene.add(this.group);
  }
  /** 매 프레임: focus(월드 좌표, 보는 곳), radius(m, 그리기 반경), budgetMs(만들기 예산) */
  update(focus, radius, budgetMs = 3) {
    const n = this.view.chunk, gx = toGridX(focus.x), gz = toGridZ(focus.z);
    const dist = (px, pz) => {                                                  // 보는 곳에서 조각 사각형까지 거리(m)
      const x0 = toWorldX(px * n), z0 = toWorldZ(pz * n), dx = Math.max(x0 - focus.x, 0, focus.x - (x0 + n)), dz = Math.max(z0 - focus.z, 0, focus.z - (z0 + n));
      return Math.sqrt(dx * dx + dz * dz);
    };
    // 내리기: 반경 + 여유 밖
    for (const [k, m] of this.meshes) if (dist(m.userData.cx, m.userData.cz) > radius + UNLOAD_EXTRA) {
      this.group.remove(m); m.geometry.dispose(); this.meshes.delete(k); this.unloaded++;
      if (this.job && this.job.key === k) this.job = null;
    }
    if (this.sea.size > 4096) this.sea.clear();
    this.rebuildDirty(focus);
    const deadline = performance.now() + budgetMs;
    for (;;) {
      if (!this.job) { const j = this.pick(focus, radius, dist, gx, gz, deadline); this.idle = j === null; if (!j) break; this.job = j; }   // idle: 반경 안이 다 만들어짐(시험·확인용)
      const job = this.job;
      if (!stepBuild(job, deadline)) break;
      this.put(job); this.job = null;
      if (++this.sinceReset >= CACHE_RESET) { resetCaches(this.view); this.sinceReset = 0; }
      if (performance.now() >= deadline) break;
    }
  }
  /** 다음에 만들 조각: ① 반경 안에 아직 없는 땅 조각(가까운 순, 칸당 1조각) ② 상세도가 바뀌어야 하는 조각(가까운 순, 촘촘해지는 것 먼저).
   *  바다뿐인지 재는 일(데이터 청크 생성)도 예산 안에서만: 시간이 다 되면 undefined(다음 프레임에 이어서), 할 일이 없으면 null */
  pick(focus, radius, dist, gx, gz, deadline = Infinity) {
    const n = this.view.chunk, R = Math.ceil(radius / n) + 1, pcx = Math.floor(gx / n), pcz = Math.floor(gz / n);
    if (this.ringR !== R) { this.ringR = R; this.ring = []; for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) this.ring.push([dx, dz, dx * dx + dz * dz]); this.ring.sort((a, b) => a[2] - b[2]); }
    for (const [dx, dz] of this.ring) {                                        // 가까운 조각부터
      const px = pcx + dx, pz = pcz + dz;
      if (this.view.innerPiece(px, pz) || !this.view.inBounds(px * n, pz * n) || dist(px, pz) > radius) continue;
      const k = `${px},${pz}`; if (this.meshes.has(k) || this.sea.has(k)) continue;
      if (this.view.seaOnlyPiece(px, pz)) { this.sea.add(k); if (performance.now() >= deadline) return undefined; continue; }
      const job = startBuild(this.view, px, pz, 1); job.key = k; return job;
    }
    let best = null, bd = Infinity;
    for (const m of this.meshes.values()) {
      const u = m.userData, want = this.ground.lodFor(u.cx, u.cz, focus, u.sub); if (want === u.sub) continue;
      const d = dist(u.cx, u.cz) + (want < u.sub ? 1000 : 0); if (d < bd) { bd = d; best = m; }
    }
    if (!best) return null;
    const u = best.userData, job = startBuild(this.view, u.cx, u.cz, this.ground.lodFor(u.cx, u.cz, focus, u.sub)); job.key = u.chunk; return job;
  }
  /** 바깥 섬에서 칠하기·파기·짓기로 바뀐 조각(view.outerDirty): 있는 메쉬는 바로 다시 만듦(붓질이 바로 보이게), 바다뿐이라 건너뛴 조각은 다시 잼 */
  rebuildDirty(focus) {
    const d = this.view.outerDirty; if (!d || !d.size) return;
    resetCaches(this.view); this.job = null;
    for (const k of d) {
      this.sea.delete(k); const m = this.meshes.get(k); if (!m) continue;
      const u = m.userData, job = startBuild(this.view, u.cx, u.cz, this.ground.lodFor(u.cx, u.cz, focus, u.sub)); job.key = k; stepBuild(job); this.put(job);
    }
    d.clear();
  }
  put(job) {
    const geo = job.b.geometry(); let m = this.meshes.get(job.key);
    if (m) { m.geometry.dispose(); m.geometry = geo; }
    else {
      m = new THREE.Mesh(geo, this.ground.material); m.receiveShadow = true; m.castShadow = false; m.name = `outer ${job.key}`;
      Object.assign(m.userData, { chunk: job.key, cx: job.cx, cz: job.cz }); this.group.add(m); this.meshes.set(job.key, m);
    }
    m.userData.sub = job.sub; this.built++;
  }
  /** 다시 만들기(그래픽 설정이 바뀜): 지금 조각을 모두 버리고 처음부터 */
  reset() { for (const m of this.meshes.values()) { this.group.remove(m); m.geometry.dispose(); } this.meshes.clear(); this.job = null; }
  get triangles() { let t = 0; for (const m of this.meshes.values()) t += m.geometry.attributes.position.count / 3; return Math.round(t); }
  dispose() { this.reset(); this.scene.remove(this.group); }
}
