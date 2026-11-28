// 건물 사진(건설 갤러리 카드): 섬에 놓이는 것과 같은 모델(views.js의 buildingModel)을 작은 장면에 세워 찍은 그림.
//  · 보통은 미리 찍어 둔 사진(assets/thumbs/<건물 id>.webp, tools/thumbs.cjs가 이 파일의 코드로 찍어 저장)을 그대로 씀 → 갤러리를 열어도 모델을 받지 않음.
//  · 사진 파일이 없으면(한 파일 번들·새 건물) 그 자리에서 같은 방법으로 찍어 줌: 게임 화면을 그리기 바로 전에 같은 캔버스 구석에 그려서 옮겨 담고,
//    이어서 섬을 그리면 덮이므로 화면에는 보이지 않음(WebGL 컨텍스트를 하나 더 만들지 않아 휴대폰에서도 가벼움). 한 프레임에 한 장만.
import * as THREE from "three";
import { BUILDINGS } from "../data/catalog.js";
import { buildingModel } from "./views.js";
import { Toon } from "./toon.js";

export const THUMB_DIR = "assets/thumbs/";
const THUMB_W = 192, THUMB_H = 128, THUMB_SUPER = 2;                              // 저장 크기(px, 3:2) · 찍을 때는 2배로 그려 줄여 담음(매끈하게)

export class BuildingThumbs {
  constructor(renderer) { this.renderer = renderer; this.jobs = []; this.made = new Map(); }
  /** 미리 찍어 둔 사진 주소 */
  url(id) { return `${THUMB_DIR}${id}.webp`; }
  /** 그 자리에서 찍기 → Promise<data URL>(못 찍으면 null). 같은 건물은 한 번만 */
  request(id) {
    if (!this.made.has(id)) this.made.set(id, new Promise(done => this.jobs.push({ id, done })));
    return this.made.get(id);
  }
  /** main.js가 섬을 그리기 바로 전에 매 프레임 부름: 기다리는 사진이 있으면 모델을 준비하고, 준비됐으면 한 장 찍음 */
  pump() {
    const job = this.jobs[0]; if (!job) return;
    for (const j of this.jobs.slice(0, 3)) if (!j.wait) {                          // 모델 준비: 앞의 세 장까지 미리 받아 둠(받는 동안은 다음 프레임에 다시 봄)
      const def = BUILDINGS[j.id];
      j.wait = (def ? buildingModel(def, { ramp: { h0: 0, h1: 0.6 }, season: "spring" }) : Promise.reject(new Error("없는 건물"))).then(m => { j.model = m; }, () => { j.failed = true; });
    }
    if (!job.model && !job.failed) return;
    this.jobs.shift();
    let url = null; if (job.model) { try { url = this.shoot(job.model, BUILDINGS[job.id]); } catch (e) { console.warn("건물 사진을 찍지 못했어요:", job.id, e); } }
    job.done(url);
  }
  stage() {
    if (this.scene) return;
    const s = this.scene = new THREE.Scene(); s.background = new THREE.Color(0xeaf2ea);
    s.add(new THREE.HemisphereLight(0xffffff, 0xb9c79a, 1.25));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); sun.position.set(-3, 6, 4); s.add(sun);
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ color: 0xa9d672, roughness: 1 })); this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = -0.01; s.add(this.ground);
    this.holder = new THREE.Group(); s.add(this.holder);
    this.camera = new THREE.PerspectiveCamera(26, THUMB_W / THUMB_H, 0.1, 200);
    this.toon = new Toon(s, { snow: false });                                    // 섬과 같은 툰 그림체(눈은 안 쌓임)
    this.canvas = document.createElement("canvas"); this.canvas.width = THUMB_W; this.canvas.height = THUMB_H;
  }
  /** 모델 하나를 세워 찍고 data URL로. 게임 캔버스의 왼쪽 아래 구석에 그렸다가 2D 캔버스로 옮김(같은 프레임 안에 섬 그림이 덮음) */
  shoot(model, def) {
    this.stage(); const r = this.renderer, cam = this.camera, cv = r.domElement;
    this.holder.clear(); this.holder.add(model); this.holder.updateMatrixWorld(true); this.toon.sweep(this.holder);
    const wet = !!(def?.dock || def?.bridge || def?.pier), floor = wet ? -0.22 : 0;      // 물 위에 놓는 것(낚시터·다리·선착장)은 잔디 대신 물, 기둥은 물 아래로
    const box = new THREE.Box3().setFromObject(model); box.min.y = Math.max(box.min.y, floor);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), fp = def?.footprint || { w: 1, d: 1 }, rad = Math.max(0.35, Math.hypot(size.x, size.y, size.z) / 2);
    this.ground.material.color.setHex(wet ? 0x7fd0e6 : 0xa9d672); this.ground.scale.setScalar(Math.max(fp.w, fp.d, size.x, size.z) * 0.62 + 0.25); this.ground.position.set(c.x, floor - 0.01, c.z);   // 발밑 잔디(또는 물)
    // 쿼터뷰(정문 +z가 보이는 앞·오른쪽 위)에서, 모델이 사진에 꽉 차게: 모델의 점들을 화면에 비춰 보고 가운데·거리를 맞춤(세 번이면 충분)
    const yaw = THREE.MathUtils.degToRad(38), pitch = THREE.MathUtils.degToRad(60), tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const dir = new THREE.Vector3(Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), Math.sin(pitch) * Math.cos(yaw)), look = c.clone(), v = new THREE.Vector3(); let dist = rad / tanV;
    // 맞출 점: 모델의 실제 꼭짓점(메시마다 600개쯤 골라서) — 상자 모서리로 맞추면 둥근 집이 사진 속에서 작아짐. 꼭짓점이 없으면 상자 모서리 8개
    const pts = []; model.traverse(o => { const pa = o.isMesh && o.visible && o.geometry?.attributes?.position; if (!pa) return;
      for (let i = 0, step = Math.max(1, Math.ceil(pa.count / 600)); i < pa.count; i += step) { const q = new THREE.Vector3().fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); q.y = Math.max(q.y, floor); pts.push(q); } });
    if (!pts.length) for (let n = 0; n < 8; n++) pts.push(new THREE.Vector3(n & 1 ? box.max.x : box.min.x, n & 2 ? box.max.y : box.min.y, n & 4 ? box.max.z : box.min.z));
    for (let k = 0; k < 4; k++) {
      cam.position.copy(look).addScaledVector(dir, dist); cam.lookAt(look); cam.near = Math.max(0.05, dist - rad * 3); cam.far = dist + rad * 5; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      if (k === 3) break;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of pts) { v.copy(q).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      look.addScaledVector(v.setFromMatrixColumn(cam.matrixWorld, 0), (x0 + x1) / 2 * tanV * dist * cam.aspect).addScaledVector(v.setFromMatrixColumn(cam.matrixWorld, 1), (y0 + y1) / 2 * tanV * dist);
      dist *= Math.max((x1 - x0) / 2, (y1 - y0) / 2) / 0.88;
    }
    const pr = r.getPixelRatio(), q = Math.max(0.25, Math.min(THUMB_SUPER, cv.width / THUMB_W, cv.height / THUMB_H)), pw = Math.floor(THUMB_W * q), ph = Math.floor(THUMB_H * q);
    const vp = r.getViewport(new THREE.Vector4()), sc = r.getScissor(new THREE.Vector4()), st = r.getScissorTest(), ex = r.toneMappingExposure;
    r.setViewport(0, 0, pw / pr, ph / pr); r.setScissor(0, 0, pw / pr, ph / pr); r.setScissorTest(true); r.toneMappingExposure = 1.12;   // 밤에도 사진은 낮 밝기로
    try { r.render(this.scene, cam); const g = this.canvas.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(cv, 0, cv.height - ph, pw, ph, 0, 0, THUMB_W, THUMB_H); }
    finally { r.setViewport(vp); r.setScissor(sc); r.setScissorTest(st); r.toneMappingExposure = ex; this.holder.clear(); }
    return this.canvas.toDataURL("image/webp", 0.86);
  }
}
