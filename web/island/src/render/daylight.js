// 현실 시간대: 기기 시계로 해의 높이·방향을 계산해 햇빛·하늘·안개·바다·구름 색을 바꿈. 밤에는 푸른 달빛과 등대 불빛.
// 해 위치 계산은 world/sun.js(서울 위치 가정, 균시차·경도 보정).
import * as THREE from "three";
import { setFountainSky } from "./fountain.js";

import { sunPosition } from "../world/sun.js";
import { dayLook, moonMix, nightLook, lightElev, shadeTint } from "./dayKeys.js";
import { TOON_SHADE_COL } from "./toon.js";
import { setLampPools } from "./lampPool.js";
import { lighthouseLook, LH_LIT, LH_EMBER, LH_HALO_LIT, LH_HALO_EMBER, LH_BEACON_LIT, LH_BEACON_EMBER } from "./lampLook.js";
const DEG = Math.PI / 180;
const C = (h) => new THREE.Color(h);
const LH_C = { lit: C(LH_LIT), ember: C(LH_EMBER), haloLit: C(LH_HALO_LIT), haloEmber: C(LH_HALO_EMBER), beaconLit: C(LH_BEACON_LIT), beaconEmber: C(LH_BEACON_EMBER) };   // 등대 불빛 색(render/lampLook.js)
const rooted = (o, root) => { while (o.parent) o = o.parent; return o === root; };
const LAMP_HALO = 0xffb868;                                                        // 가로등·등불 빛 번짐: 따뜻한 주황(예전 0xffb060)
// 가로등: 실제 빛(PointLight) 세기 0.8 → 1.3 · 닿는 거리 10 → 8 m(멀리 번지면 풀빛과 섞여 올리브가 됨), 머리 빛 번짐 지름 1.6 → 2.3 m · 불투명도 0.8 → 0.95.
// 발밑 빛 웅덩이는 원판(반지름 3.2 m · 불투명도 0.28)을 덮던 것 → 땅 셰이더(lampPool.js, 반지름 4.2 m)가 땅 색을 보고 칠함: 풀 위에서도 연두·올리브 원판이 안 생김
const LAMP_LIGHT = 0xffb060, LAMP_I = 1.3, LAMP_RANGE = 8, LAMP_HALO_M = 2.3, LAMP_HALO_A = 0.95;
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
    this.moonColor = C(0xc2c6ce); this.wl = 1; this.grey = C(0x9aa3ad);          // wl: 날씨 밝기(흐림·비·폭풍이면 1보다 작음)
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
    if (nowMs - this.last < (this.mult > 60 ? 0 : 500)) {                          // 빨리 감을 땐 해가 뚝뚝 끊기지 않게 매 프레임
      if (wlMoved && this.elev != null) this.light(); this.beam(dt);
      const fill = this.lampFill ?? 1;                                              // 🗝 등불 켜는 연출·차오름 중, 잠든 등대 불씨가 숨 쉬는 밤엔 매 프레임
      if (this.lampBoost > 0 || this.lampBoostWas > 0 || this.lampLit !== this.lampLitWas || fill < 1 || this.lampFillWas < 1 || (this.lampLit === false && (this.glow ?? 0) > 0.005)) {
        this.lampBoostWas = this.lampBoost || 0; this.lampLitWas = this.lampLit; this.lampFillWas = fill; this.lamp(nowMs);
      }
      return;
    }
    this.last = nowMs;
    const d = this.now(), { elev, azim } = sunPosition(d);
    this.elev = elev; this.azim = azim; this.time = d;
    this.night = Math.max(0, Math.min(1, (2 - elev) / 8));                          // 0 낮 ~ 1 밤(해 높이 2° → -6°). 마을 규칙(world.isNight)이 쓰는 값이라 그대로
    this.glow = nightLook(this.night);                                              // 보이는 것(등불·창 불빛·그늘)은 이 부드러운 곡선으로 켜지고 꺼짐(약 30분)
    this.light();
    this.lamp(nowMs); this.streetLamps();
    this.beam(dt);
  }
  /** 해 높이·방위와 날씨 밝기로 빛·하늘·안개·바다·구름 색을 정함(dayKeys.js 키프레임, 새 객체 없음) */
  light() {
    const elev = this.elev, azim = this.azim, k = dayLook(elev, azim, this.look), mk = moonMix(elev), wl = this.wl, dim = 1 - wl;
    this.wlShown = wl;
    // 해가 비추는 방향(해가 낮으면 높이 4°로 둠) → 밤에는 달(해 반대쪽 높이 40°). 해 높이 2° → -6° 동안 머리 위로 천천히 넘어감. 장면 좌표: +x 동, -z 북
    // 빛 높이는 30°부터 눌러 씀(lightElev: 한여름 정오 76° → 48°): 해가 머리 위에 있으면 위를 향한 면이 다 똑같이 밝고 그림자가 발밑에 숨어 섬이 납작해 보임
    const a = azim * DEG, e = Math.max(4, lightElev(elev)) * DEG, ce = Math.cos(e), cm = Math.cos(40 * DEG);
    this.dir.set(Math.sin(a) * ce, Math.sin(e), -Math.cos(a) * ce);
    this.moonDir.set(-Math.sin(a) * cm, Math.sin(40 * DEG), Math.cos(a) * cm);
    this.dir.lerp(this.moonDir, mk).normalize();
    this.top.setRGB(k[0], k[1], k[2]).lerp(this.grey, dim * 0.8); this.hor.setRGB(k[3], k[4], k[5]).lerp(this.grey, dim * 0.7);   // 흐린 만큼 하늘·안개·구름을 회색으로
    this.sun.color.setRGB(k[6], k[7], k[8]).lerp(this.moonColor, mk); this.sun.intensity = k[15] * wl;
    shadeTint(k, mk, TOON_SHADE_COL.value);                                         // 툰 그늘색: 하늘빛 색조(낮 서늘한 파랑 · 노을 보라 · 밤 푸름)
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
    this.water.userData.setSky?.(this.dir, this.sun.color, this.hor, this.glow ?? 0);   // 해·달 빛길·지평선 밝기·밤 남색(water.js)
    setFountainSky(k[17] * (0.75 + 0.25 * wl), this.dir, this.sun.color, this.glow ?? 0);   // 분수 물(render/fountain.js)도 바다와 같은 밝기·밤빛
    for (const o of this.clouds.children) if (o.isSprite) o.material.color.copy(this.hor).lerp(this.white, 0.55);
  }
  /** 날씨 밝기(0.45~1). 움직이는 동안은 다음 프레임에 바로, 그 밖에는 0.5초마다 하는 다시 계산 때 반영 */
  setWeatherLight(v) { this.wl = v; }
  /** 등대: 램프 발광(밤에 세게), 둘레를 비추는 불빛, 회전하는 빛줄기. 세기·색은 render/lampLook.js(🗝 등불을 고치기 전엔 빛줄기 없이 숨 쉬는 불씨) */
  lamp(nowMs = performance.now()) {
    const lamp = this.lhFind("lighthouseLamp"); if (!lamp) return;
    const k = this.lhLook(nowMs), m = lamp.material, src = m.userData.src;
    for (const x of src ? [m, src] : [m]) { x.emissiveIntensity = k.glass; x.emissive?.copy(LH_C.ember).lerp(LH_C.lit, k.warm); }   // 툰 재질이면 원래 재질도
    if (!this.beacon) this.beacon = new THREE.PointLight(LH_BEACON_LIT, 0, 26, 1.6);
    if (this.beacon.parent !== lamp) lamp.add(this.beacon);                          // 새 섬·불러오기로 등대가 새로 생기면 불빛도 새 램프로 옮김
    this.beacon.intensity = k.beacon; this.beacon.color.copy(LH_C.beaconEmber).lerp(LH_C.beaconLit, k.warm);
    if (!this.lampHalo) {                                                          // 램프 둘레 빛 번짐(밤에 보임)
      this.lampHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: LH_HALO_LIT, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      this.lampHalo.renderOrder = 3; this.lampHalo.userData.noToon = true; this.lampHalo.raycast = () => {};
    }
    if (this.lampHalo.parent !== lamp) lamp.add(this.lampHalo);
    this.lampHalo.visible = k.halo > 0.005; this.lampHalo.material.opacity = k.halo;   // 보일락 말락 할 때 켜짐(툭 나타나지 않게)
    this.lampHalo.scale.setScalar(k.haloScale); this.lampHalo.material.color.copy(LH_C.haloEmber).lerp(LH_C.haloLit, k.warm);
  }
  /** 등대 불빛 값(render/lampLook.js): 밤(glow) · 🗝 등불을 고쳤나(lampLit, 모르면 켜진 것으로) · 연출(lampBoost) · 고친 뒤 차오름(lampFill) */
  lhLook(nowMs = performance.now()) { return lighthouseLook({ glow: this.glow ?? 0, lit: this.lampLit !== false, boost: this.lampBoost || 0, fill: this.lampFill ?? 1, t: nowMs / 1000 }); }
  /** 등대 램프·빛줄기 찾기: 장면 전체를 매 프레임 훑지 않게 기억해 두고, 장면에서 빠졌으면(새 섬·불러오기) 다시 찾음. 없으면 0.5초마다만 다시 봄 */
  lhFind(name) {
    const c = this.lhSeen || (this.lhSeen = new Map()), hit = c.get(name);
    if (hit?.o && rooted(hit.o, this.scene)) return hit.o;
    const now = performance.now(); if (hit && !hit.o && now - hit.t < 500) return null;
    const o = this.scene.getObjectByName(name) || null; c.set(name, { o, t: now }); return o;
  }
  /** 가로등: 풍차 전기가 닿으면 유리(발광 마스크)가 밤에 빛나고, 머리에 번지는 빛(더하기 색 스프라이트) + 발밑 빛 웅덩이(땅 셰이더, lampPool.js) + 가까운 몇 개는 실제 빛 */
  /** 가로등 실제 빛 개수(그래픽 설정). 빛 개수가 바뀌면 재질을 다시 만들어야 해서 늘 같은 개수를 두고 안 쓰는 빛은 0으로 */
  setLampLights(k) {
    for (const l of this.lampLights || []) l.parent?.remove(l);
    this.lampLights = Array.from({ length: k }, () => { const l = new THREE.PointLight(LAMP_LIGHT, 0, LAMP_RANGE, 1); l.castShadow = false; this.scene.add(l); return l; });
  }
  /** 건물 등불(집·우체국·카페·잡화점 문 옆 등): 유리(발광 마스크, tools/glow_mask.py)가 가로등과 같은 세기로 밤에 빛나고 등불마다 작은 빛 번짐.
   *  풍차 전기가 닿는 건물만 켜짐(hasPower). 짓는 중(모델이 아래에서 솟는 동안 — 세로로 눌려 있음)에는 끔. 실제 빛은 안 씀 */
  lantern(o, m, src, n, glow) {
    const ws = o.getWorldScale(new THREE.Vector3()), on = ws.y > ws.x * 0.97 && this.hasPower(o), v = on ? glow : 0.15 * (1 - n);
    m.emissiveIntensity = v; src.emissiveIntensity = v;
    if (!o.userData.halo) o.userData.halo = (src.userData.lanterns || []).map(([x, y, z, size]) => {   // 처음 한 번: glb 재질 extras에 적힌 등불 자리
      const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: LAMP_HALO, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: true }));
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
    const n = this.glow ?? 0, glow = 0.15 + 2.6 * n, lamps = [];   // 창·등불 유리: 아늑한 불빛이 밤 장면의 주인공이 되게(예전 2.2)
    this.scene.traverse(o => {
      if (o.name === "houseGlow") { o.visible = !!o.userData.on && n > 0.005 && this.hasPower(o); o.material.opacity = 0.7 * n; return; }   // 전기 들어온 집 창가 불빛(풍차를 철거하면 바로 꺼짐)
      if (!o.isMesh) return; const m = o.material, src = m.userData?.src || m;
      if (src.name === "lanternGlow") return this.lantern(o, m, src, n, glow);
      if (src.name !== "lampBody") return;
      const on = this.hasPower(o), v = on ? glow : 0.15 * (1 - n);                 // 가로등도 풍차 전기가 닿아야 켜짐: 없으면 밤에 유리가 꺼지고 빛 번짐·빛 웅덩이·실제 빛도 없음(낮 모습은 같음)
      m.emissiveIntensity = v; src.emissiveIntensity = v;
      if (!o.userData.halo) {                                                      // 처음 볼 때 한 번: 모델 크기에 맞춰 머리에 빛 번짐을 붙이고 발밑 자리를 적어 둠
        o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox, s = o.getWorldScale(new THREE.Vector3()).y || 1, hgt = bb.max.y - bb.min.y;
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: LAMP_HALO, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: true }));
        halo.position.set(0, bb.min.y + hgt * 0.88, 0);                            // 등불 유리 높이(가는 가로등)
        halo.scale.setScalar(LAMP_HALO_M / s); halo.userData.noToon = true; halo.raycast = () => {}; o.add(halo);   // 예전엔 이 줄이 주석 끝에 붙어 있어 빛 번짐이 장면에 없었고, 실제 빛도 섬 가운데(원점)에 몰려 있었음
        o.userData.halo = halo; o.userData.lampFoot = new THREE.Vector3(0, bb.min.y, 0);
      }
      const halo = o.userData.halo; halo.visible = on && n > 0.005; halo.material.opacity = LAMP_HALO_A * n;   // 예전 0.8
      if (on) lamps.push(o);
    });
    // 화면 중심(보는 곳)에서 가까운 켜진 가로등부터: 땅 빛 웅덩이(LAMP_POOL_MAX개 — 그래픽 설정과 상관없이) · 실제 빛(그래픽 설정 개수, 성능 우선이면 0)
    const c = this.focus || new THREE.Vector3();
    const near = lamps.map(o => { const head = o.userData.halo.getWorldPosition(new THREE.Vector3()); return [head, o.localToWorld(o.userData.lampFoot.clone()), head.distanceToSquared(c)]; }).sort((a, b) => a[2] - b[2]);
    setLampPools(near.map(it => it[1]), n);
    (this.lampLights || []).forEach((l, i) => { const it = near[i]; if (it && n > 0.005) { l.position.copy(it[0]).y += 0.6; l.intensity = LAMP_I * n; } else l.intensity = 0; });
  }
  /** 등대 불빛 세기(0~1): 밤(glow) · 🗝 이야기 등불을 아직 안 고쳤으면(lampLit === false) 0 · 엔딩·불 켜는 연출(lampBoost)은 낮에도 · 고친 순간엔 차오름(lampFill) */
  lampGlow() { return this.lhLook().n; }
  beam(dt) {
    const b = this.lhFind("lighthouseBeam"); if (!b) return;
    const n = this.lampGlow(); b.rotation.y += dt * 0.9; b.visible = n > 0.005;
    for (const m of b.children) m.material.uniforms.uOpacity.value = 0.75 * n;
  }
  label() {
    const d = this.time || new Date(), hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
    const e = this.elev ?? 30, icon = e > 6 ? "☀️" : e > -2 ? "🌇" : "🌙";
    return this.mult > 1 ? `${icon} ${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm} ×${this.mult}` : `${icon} ${hh}:${mm}`;
  }
}
