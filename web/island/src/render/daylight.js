// 현실 시간대: 기기 시계로 해의 높이·방향을 계산해 햇빛·하늘·안개·바다·구름 색을 바꿈. 밤에는 푸른 달빛과 등대 불빛.
// 해 위치 계산은 world/sun.js(서울 위치 가정, 균시차·경도 보정).
import * as THREE from "three";

import { sunPosition } from "../world/sun.js";
import { dayLook, moonMix, nightLook } from "./dayKeys.js";
const DEG = Math.PI / 180;
const C = (h) => new THREE.Color(h);
let HALO = null;                                                                  // 가운데가 밝고 가장자리로 사라지는 둥근 빛(한 번만 만듦)
function haloTex() {
  if (HALO) return HALO; const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,.45)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return (HALO = new THREE.CanvasTexture(c));
}
export class Daylight {
  /** mode: "real"(기기 시계) | "noon"(낮 고정) | "fast"(1분 = 1시간, 확인용) */
  constructor({ scene, renderer, sun, hemi, water, clouds, skyTex }) {
    Object.assign(this, { scene, renderer, sun, hemi, water, clouds, skyTex }); this.mode = "real"; this.fastT = 0; this.mult = 1; this.vMs = null; this.last = -1; this.dir = new THREE.Vector3(-0.6, 0.55, 0.32);
    this.moonColor = C(0xaebcff); this.wl = 1; this.grey = C(0x9aa3ad);          // wl: 날씨 밝기(흐림·비·폭풍이면 1보다 작음)
    this.wlShown = 1; this.look = new Float32Array(19); this.white = C(0xffffff);   // 매 계산 새 객체를 안 만들게 다시 씀
    this.top = new THREE.Color(); this.hor = new THREE.Color(); this.moonDir = new THREE.Vector3();
  }
  now() {
    if (this.mode === "noon") { const d = new Date(); d.setHours(12, 30, 0); return d; }
    if (this.mode === "fast") { const d = new Date(); d.setHours(0, 0, 0); return new Date(d.getTime() + this.fastT * 3600e3); }
    if (this.mult > 1 && this.vMs != null) return new Date(this.vMs);           // 시간 배수(테스트용): 기기 시계에서 시작해 배수만큼 빨리 감
    return new Date();
  }
  /** 시간 배수: 1이면 기기 시계로 돌아감. 1보다 크면 지금 보이는 시각에서 시작해 실제 1초에 mult초씩 감(날짜·계절도 따라 바뀜) */
  setMult(m) { if (m > 1 && this.mult <= 1) this.vMs = this.now().getTime(); this.mult = m; if (m <= 1) this.vMs = null; this.last = -1; }
  /** 매 프레임(내부적으로 0.5초마다만 다시 계산) */
  update(dt, nowMs) {
    if (this.mode === "fast") this.fastT = (this.fastT + dt / 60) % 24;
    if (this.mult > 1 && this.vMs != null) this.vMs += dt * 1000 * this.mult;
    const wlMoved = Math.abs(this.wl - this.wlShown) > 0.003;                       // 날씨 밝기가 움직이는 동안(1~2초)은 0.5초 간격을 안 기다림: 계단처럼 툭툭 어두워지지 않게
    if (nowMs - this.last < (this.mult > 60 ? 0 : 500)) { if (wlMoved && this.elev != null) this.light(); this.beam(dt); return; }   // 빨리 감을 땐 해가 뚝뚝 끊기지 않게 매 프레임
    this.last = nowMs;
    const d = this.now(), { elev, azim } = sunPosition(d);
    this.elev = elev; this.azim = azim; this.time = d;
    this.night = Math.max(0, Math.min(1, (2 - elev) / 8));                          // 0 낮 ~ 1 밤(해 높이 2° → -6°). 마을 규칙(world.isNight)이 쓰는 값이라 그대로
    this.glow = nightLook(this.night);                                              // 보이는 것(등불·창 불빛·그늘)은 이 부드러운 곡선으로 켜지고 꺼짐(약 30분)
    this.light();
    this.lamp(); this.streetLamps();
    this.beam(dt);
  }
  /** 해 높이·방위와 날씨 밝기로 빛·하늘·안개·바다·구름 색을 정함(dayKeys.js 키프레임, 새 객체 없음) */
  light() {
    const elev = this.elev, azim = this.azim, k = dayLook(elev, azim, this.look), mk = moonMix(elev), wl = this.wl, dim = 1 - wl;
    this.wlShown = wl;
    // 해가 비추는 방향(해가 낮으면 높이 4°로 둠) → 밤에는 달(해 반대쪽 높이 40°). 해 높이 2° → -6° 동안 머리 위로 천천히 넘어감. 장면 좌표: +x 동, -z 북
    const a = azim * DEG, e = Math.max(4, elev) * DEG, ce = Math.cos(e), cm = Math.cos(40 * DEG);
    this.dir.set(Math.sin(a) * ce, Math.sin(e), -Math.cos(a) * ce);
    this.moonDir.set(-Math.sin(a) * cm, Math.sin(40 * DEG), Math.cos(a) * cm);
    this.dir.lerp(this.moonDir, mk).normalize();
    this.top.setRGB(k[0], k[1], k[2]).lerp(this.grey, dim * 0.8); this.hor.setRGB(k[3], k[4], k[5]).lerp(this.grey, dim * 0.7);   // 흐린 만큼 하늘·안개·구름을 회색으로
    this.sun.color.setRGB(k[6], k[7], k[8]).lerp(this.moonColor, mk); this.sun.intensity = k[15] * wl;
    this.hemi.color.setRGB(k[9], k[10], k[11]); this.hemi.groundColor.setRGB(k[12], k[13], k[14]); this.hemi.intensity = k[16] * (0.7 + 0.3 * wl);
    this.renderer.toneMappingExposure = k[18] * (0.55 + 0.45 * wl);                // 흐리면 화면 전체를 어둡게
    // 하늘 그라데이션·안개
    const th = this.top.getHex(), hh = this.hor.getHex();                           // 8비트 색(수)으로 비교: 그대로면 그라데이션·문자열도 안 만들고 하늘 그림도 다시 올리지 않음
    if (th !== this.skyTop || hh !== this.skyHor) {
      const cv = this.skyTex.image, g = cv.getContext("2d"), grad = g.createLinearGradient(0, 0, 0, cv.height), ts = "#" + this.top.getHexString(), hs = "#" + this.hor.getHexString();
      grad.addColorStop(0, ts); grad.addColorStop(0.75, hs); grad.addColorStop(1, hs);
      g.fillStyle = grad; g.fillRect(0, 0, cv.width, cv.height); this.skyTex.needsUpdate = true; this.skyTop = th; this.skyHor = hh;
    }
    if (this.scene.fog) this.scene.fog.color.copy(this.hor);
    this.water.userData.setLight?.(k[17] * (0.75 + 0.25 * wl));
    for (const o of this.clouds.children) if (o.isSprite) o.material.color.copy(this.hor).lerp(this.white, 0.55);
  }
  /** 날씨 밝기(0.45~1). 움직이는 동안은 다음 프레임에 바로, 그 밖에는 0.5초마다 하는 다시 계산 때 반영 */
  setWeatherLight(v) { this.wl = v; }
  /** 등대: 램프 발광(밤에 세게), 둘레를 비추는 불빛, 회전하는 빛줄기 */
  lamp() {
    const lamp = this.scene.getObjectByName("lighthouseLamp"); if (!lamp) return;
    const n = this.glow ?? 0, v = 0.9 + 3.5 * n, m = lamp.material; m.emissiveIntensity = v; if (m.userData.src) m.userData.src.emissiveIntensity = v;   // 툰 재질이면 원래 재질도
    if (!this.beacon) this.beacon = new THREE.PointLight(0xffd27a, 0, 26, 1.6);
    if (this.beacon.parent !== lamp) lamp.add(this.beacon);                          // 새 섬·불러오기로 등대가 새로 생기면 불빛도 새 램프로 옮김
    this.beacon.intensity = 30 * n;
    if (!this.lampHalo) {                                                          // 램프 둘레 빛 번짐(밤에 보임)
      this.lampHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: 0xffd98a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      this.lampHalo.scale.setScalar(4.5); this.lampHalo.renderOrder = 3; this.lampHalo.userData.noToon = true;
    }
    if (this.lampHalo.parent !== lamp) lamp.add(this.lampHalo);
    this.lampHalo.visible = n > 0.005; this.lampHalo.material.opacity = 0.85 * n;   // 보일락 말락 할 때 켜짐(툭 나타나지 않게)
  }
  /** 가로등: 풍차 전기가 닿으면 유리(발광 마스크)가 밤에 빛나고, 머리에 번지는 빛 + 발밑 빛 웅덩이(빛 계산 없이 더하기 색으로, 가벼움) */
  /** 가로등 실제 빛 개수(그래픽 설정). 빛 개수가 바뀌면 재질을 다시 만들어야 해서 늘 같은 개수를 두고 안 쓰는 빛은 0으로 */
  setLampLights(k) {
    for (const l of this.lampLights || []) l.parent?.remove(l);
    this.lampLights = Array.from({ length: k }, () => { const l = new THREE.PointLight(0xffc27a, 0, 15, 1); l.castShadow = false; this.scene.add(l); return l; });
  }
  /** 건물 등불(집·우체국·카페·잡화점 문 옆 등): 유리(발광 마스크, tools/glow_mask.py)가 가로등과 같은 세기로 밤에 빛나고 등불마다 작은 빛 번짐.
   *  풍차 전기가 닿는 건물만 켜짐(hasPower). 짓는 중(모델이 아래에서 솟는 동안 — 세로로 눌려 있음)에는 끔. 실제 빛은 안 씀 */
  lantern(o, m, src, n, glow) {
    const ws = o.getWorldScale(new THREE.Vector3()), on = ws.y > ws.x * 0.97 && this.hasPower(o), v = on ? glow : 0.15 * (1 - n);
    m.emissiveIntensity = v; src.emissiveIntensity = v;
    if (!o.userData.halo) o.userData.halo = (src.userData.lanterns || []).map(([x, y, z, size]) => {   // 처음 한 번: glb 재질 extras에 적힌 등불 자리
      const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: 0xffc870, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: true }));
      h.position.set(x, y, z); h.scale.setScalar(Math.max(0.7, size * ws.x * 5) / ws.x); h.userData.noToon = true; h.raycast = () => {}; o.add(h); return h;
    });
    for (const h of o.userData.halo) { h.visible = on && n > 0.005; h.material.opacity = 0.55 * n; }
  }
  /** 이 물체가 달린 섬 건물에 전기가 들어오나(world.powered — 다 지은 풍차 둘레, world/power.js). 건물마다 한 번 계산해 두고 건물이 바뀔 때(world.powerRev)만 다시 봄.
   *  섬 건물에 달리지 않은 것(월드를 모를 때 포함)은 켜진 것으로 침. this.world는 main.js가 매 프레임 넣어 줌 */
  hasPower(o) {
    let h = o.userData.powerHolder;
    if (h === undefined) { h = o; while (h && h.userData.buildingId == null) h = h.parent; o.userData.powerHolder = h = h || null; }
    const w = this.world; if (!h || !w) return true;
    const u = h.userData; if (u.powerRev !== w.powerRev || u.powerWorld !== w) { u.powerRev = w.powerRev; u.powerWorld = w; u.powerOn = !!w.powered(w.buildings.get(u.buildingId)); }
    return u.powerOn;
  }
  streetLamps() {
    const n = this.glow ?? 0, glow = 0.15 + 2.2 * n, lamps = [];
    this.scene.traverse(o => {
      if (o.name === "houseGlow") { o.visible = !!o.userData.on && n > 0.005 && this.hasPower(o); o.material.opacity = 0.75 * n; return; }   // 전기 들어온 집 창가 불빛(풍차를 철거하면 바로 꺼짐)
      if (!o.isMesh) return; const m = o.material, src = m.userData?.src || m;
      if (src.name === "lanternGlow") return this.lantern(o, m, src, n, glow);
      if (src.name !== "lampBody") return;
      const on = this.hasPower(o), v = on ? glow : 0.15 * (1 - n);                 // 가로등도 풍차 전기가 닿아야 켜짐: 없으면 밤에 유리가 꺼지고 빛 번짐·빛 웅덩이·실제 빛도 없음(낮 모습은 같음)
      m.emissiveIntensity = v; src.emissiveIntensity = v;
      if (!o.userData.halo) {                                                      // 처음 볼 때 한 번: 모델 크기에 맞춰 빛 두 개를 붙임
        o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox, s = o.getWorldScale(new THREE.Vector3()).y || 1, hgt = bb.max.y - bb.min.y;
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: 0xffc870, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: true }));
        halo.position.set(0, bb.min.y + hgt * 0.88, 0);   // 등불 유리 높이(가는 가로등) halo.scale.setScalar(1.6 / s); halo.userData.noToon = true; o.add(halo);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(5.5 / s, 40), new THREE.MeshBasicMaterial({ map: haloTex(), color: 0xffb860, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
        pool.rotation.x = -Math.PI / 2; pool.position.set(0, bb.min.y + 0.04 / s, 0); pool.userData.noToon = true; o.add(pool);
        o.userData.halo = [halo, pool];
      }
      const [halo, pool] = o.userData.halo; halo.visible = pool.visible = on && n > 0.005; halo.material.opacity = 0.8 * n; pool.material.opacity = 0.2 * n;
      if (on) lamps.push(halo);
    });
    // 실제 빛: 화면 중심(보는 곳)에서 가까운 가로등부터 빛을 하나씩 옮겨 붙임
    const L = this.lampLights || []; if (!L.length) return;
    const c = this.focus || new THREE.Vector3(), p = new THREE.Vector3();
    const near = lamps.map(h => { h.getWorldPosition(p); return [p.clone(), p.distanceToSquared(c)]; }).sort((a, b) => a[1] - b[1]);
    L.forEach((l, i) => { const it = near[i]; if (it && n > 0.005) { l.position.copy(it[0]).y += 0.6; l.intensity = 1.1 * n; } else l.intensity = 0; });
  }
  beam(dt) {
    const b = this.scene.getObjectByName("lighthouseBeam"); if (!b) return;
    const n = this.glow ?? 0; b.rotation.y += dt * 0.9; b.visible = n > 0.005;
    for (const m of b.children) m.material.uniforms.uOpacity.value = 0.75 * n;
  }
  label() {
    const d = this.time || new Date(), hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
    const e = this.elev ?? 30, icon = e > 6 ? "☀️" : e > -2 ? "🌇" : "🌙";
    return this.mult > 1 ? `${icon} ${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm} ×${this.mult}` : `${icon} ${hh}:${mm}`;
  }
}
