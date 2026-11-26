// 같은 모델 묶어 그리기: 나무·야자수·바위·밭 틀·작물처럼 같은 모양(지오메트리)·같은 재질을 여러 번 쓰는 메쉬를
// InstancedMesh로 한 번에 그린다(그리기 호출: 물체당 1번 → 모델 종류당 1번, 그림자 패스도 같음). 모양·삼각형 수·텍스처는 그대로.
// 원래 물체(Group → Mesh)는 장면에 그대로 남아 위치·회전·크기·보이기를 정하는 손잡이 노릇만 한다(메쉬만 visible = false):
// 흔들림·쓰러짐·다시 자람(life.js), 멀면 안 그리기(main.js cullFar의 레이어), 계절·그림체 재질 바꾸기(seasons.js·toon.js), 철거 표시가 그대로 동작한다.
// 화면 밖 물체까지 그리지 않게 물체마다 화면(카메라)·그림자 범위에 드는지 따로 재서, 화면용(main)과 그림자용(shadow) InstancedMesh에 든 것만 앞에서부터 채운다
// (묶기 전과 같은 물체만 그림 → 삼각형 수가 늘지 않음). 그림자용은 본 패스에서 개수 0(그리지 않음), 그림자 패스에서만 그림.
import * as THREE from "three";

const HOT = 30;
let tick = 0;                                                                   // sync를 부를 때마다 하나씩(풀이 여럿이어도 겹치지 않게 모듈에 하나)
const pools = new WeakMap(), _inv = new THREE.Matrix4(), _pv = new THREE.Matrix4(), _view = new THREE.Frustum();
/** updateWorldMatrix(true, false)와 같되 이번 프레임(f)에 이미 맞춘 부모는 다시 계산하지 않음
 *  f: sync마다 새 번호. (전에는 물체마다 부모 사슬 끝 — worldRoot·scene — 까지 매번 다시 곱했음) */
function worldOf(o, f) {
  if (o._wf === f) return; o._wf = f; const p = o.parent;
  if (p) worldOf(p, f);
  if (o.matrixAutoUpdate) o.updateMatrix();
  if (o.matrixWorldAutoUpdate === true) { if (p) o.matrixWorld.multiplyMatrices(p.matrixWorld, o.matrix); else o.matrixWorld.copy(o.matrix); }
}
/** 이 뿌리(worldRoot) 아래 물체를 묶어 그리는 풀(뿌리마다 하나) */
export function poolFor(root) { let p = pools.get(root); if (!p) pools.set(root, p = new InstancePool(root)); return p; }

export class InstancePool {
  constructor(root) { this.root = root; this.entries = []; this.groups = []; this.frame = 0; }
  /** obj 아래의 메쉬를 묶어 그리기에 올림(스킨 메쉬·여러 재질 메쉬는 그대로 둠). obj는 아직 장면에 안 붙어 있어도 됨 */
  add(obj) {
    obj.traverse(m => {
      if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh || Array.isArray(m.material) || m.userData.pooled || !m.geometry) return;
      m.userData.pooled = true; m.visible = false;
      this.entries.push({ mesh: m, group: null, shown: false, inMain: false, inShadow: false, hot: HOT, wait: 0, last: new Float32Array(12), sphere: new THREE.Sphere() });
    });
  }
  groupFor(m) {
    let g = this.groups.find(x => x.geo === m.geometry && x.main.material === m.material);
    if (!g) { g = { geo: m.geometry, ents: [], main: null, shadow: null, cap: 0, nS: 0, dirty: true, cast: m.castShadow, receive: m.receiveShadow, order: m.renderOrder }; this.alloc(g, m.material, 16); this.groups.push(g); }
    return g;
  }
  alloc(g, mat, cap) {
    for (const k of ["main", "shadow"]) {
      const old = g[k], im = new THREE.InstancedMesh(g.geo, old ? old.material : mat, cap); im.count = 0; im.visible = false; im.frustumCulled = false; im.name = `instances-${k}`; im.renderOrder = g.order;
      if (old) { this.root.remove(old); old.dispose(); }
      this.root.add(im); g[k] = im;
    }
    g.main.receiveShadow = g.receive; g.shadow.castShadow = true;
    g.shadow.onBeforeRender = () => { g.shadow.count = 0; }; g.shadow.onBeforeShadow = () => { g.shadow.count = g.nS; };   // 그림자용: 본 패스에선 안 그림
    g.cap = cap; g.dirty = true;
  }
  leave(e) { const g = e.group; if (!g) return; g.ents.splice(g.ents.indexOf(e), 1); g.dirty = true; e.group = null; e.shown = false; }
  /** obj 아래 메쉬를 묶어 그리기에서 바로 뺌(꾸미기로 치운 나무·다시 만드는 지형지물·지운 그루터기). 다음 sync에서 인스턴스 수가 줄어듦.
   *  장면에서 떼기만 해도 sync가 언젠가 빼지만 가만히 있는 물체는 4프레임에 한 번만 보므로 기다리지 않게. 뺀 메쉬 수를 돌려줌 */
  remove(obj) {
    const ms = new Set(); obj.traverse(m => { if (m.userData.pooled) ms.add(m); }); if (!ms.size) return 0;
    let n = 0;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]; if (!ms.has(e.mesh)) continue;
      this.leave(e); e.mesh.userData.pooled = false; e.mesh.visible = true; this.entries.splice(i, 1); n++;
    }
    return n;
  }
  /** 매 프레임(그리기 직전): 바뀐 물체의 자리를 다시 읽고(가만히 있는 물체는 4프레임에 한 번만 확인), 화면·그림자 범위에 든 물체만 채움 */
  sync(camera, light) {
    const f = ++this.frame, E = this.entries, root = this.root, wf = ++tick;
    for (let i = E.length - 1; i >= 0; i--) {
      const e = E[i]; if (e.hot > 0) e.hot--; else if ((f + i) & 3) continue;
      const m = e.mesh; let vis = (m.layers.mask & 1) !== 0, att = false;
      for (let q = m.parent; q; q = q.parent) { if (q === root) { att = true; break; } if (!q.visible) vis = false; }
      if (!att) {                                                                     // 아직 안 붙었거나(모델 받는 중) 장면에서 빠짐(철거·거둠)
        if (e.group || ++e.wait > 600) { this.leave(e); m.visible = true; m.userData.pooled = false; E.splice(i, 1); }
        continue;
      }
      worldOf(m, wf);
      if (!e.group || e.group.main.material !== m.material) {                         // 처음 · 재질이 바뀜(계절 잎·그림체·철거 표시)
        this.leave(e); const g = e.group = this.groupFor(m); g.ents.push(e); if (g.ents.length > g.cap) this.alloc(g, null, g.cap * 2); e.last[0] = NaN;
      }
      const w = m.matrixWorld.elements, L = e.last; let same = vis === e.shown;
      for (let k = 0, j = 0; k < 15; k++) { if ((k & 3) === 3) continue; if (L[j] !== w[k]) { same = false; L[j] = w[k]; } j++; }
      if (same) continue;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      e.sphere.copy(m.geometry.boundingSphere).applyMatrix4(m.matrixWorld); e.shown = vis; e.hot = HOT; e.group.dirty = true;
    }
    camera.updateMatrixWorld(); _view.setFromProjectionMatrix(_pv.multiplyMatrices(camera.projectionMatrix, _inv.copy(camera.matrixWorld).invert()));
    const cast = !!light?.castShadow; let box = null;
    if (cast) { light.updateMatrixWorld(); light.target.updateMatrixWorld(); light.shadow.updateMatrices(light); box = light.shadow.getFrustum(); }   // 그림자 범위(three.js가 그릴 때 쓰는 것과 같은 계산)
    for (const g of this.groups) {
      const ents = g.ents; let chM = g.dirty, chS = g.dirty, nM = 0, nS = 0;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i], a = e.shown && _view.intersectsSphere(e.sphere), b = cast && g.cast && e.shown && box.intersectsSphere(e.sphere);
        if (a !== e.inMain) { e.inMain = a; chM = true; } if (b !== e.inShadow) { e.inShadow = b; chS = true; }
        if (a) nM++; if (b) nS++;
      }
      if (chM) { let j = 0; for (const e of ents) if (e.inMain) g.main.setMatrixAt(j++, e.mesh.matrixWorld); g.main.count = j; g.main.instanceMatrix.needsUpdate = true; }
      if (chS) { let j = 0; for (const e of ents) if (e.inShadow) g.shadow.setMatrixAt(j++, e.mesh.matrixWorld); g.shadow.instanceMatrix.needsUpdate = true; }
      g.nS = nS; g.main.visible = nM > 0; g.shadow.visible = nS > 0; g.dirty = false;
    }
  }
  dispose() { for (const g of this.groups) for (const im of [g.main, g.shadow]) { this.root.remove(im); im.dispose(); } this.groups.length = 0; this.entries.length = 0; }
}
