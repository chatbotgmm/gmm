// 장식 소품(보기만, 길을 막지 않음): 덤불·꽃·자갈을 종류마다 InstancedMesh 하나로 한꺼번에 그림(그리기 호출 3번).
//  · 덤불: 숲 가장자리, 고지대 벽 밑, 단 위 가장자리, 모래사장과 맞닿은 잔디
//  · 꽃: 잔디밭 곳곳에 무리 지어(노랑·하양·분홍·하늘색)
//  · 자갈: 모래·바위 위
// 건물을 짓거나 땅을 칠하고 높이를 바꾼 칸의 소품은 숨기거나 높이를 다시 맞춘다.
// 꾸미기(world.decor): 치운 칸(off)·놓은 칸(add)의 씨앗 소품은 숨기고, 플레이어가 놓은 덤불·꽃은 따로 InstancedMesh 둘(덤불 덩이 · 꽃송이, 용량 800칸)로 그림.
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";
import { seededRandom } from "../util.js";

const BUSH_COLORS = [0x5aa845, 0x6bb84e, 0x4f9a3f], FLOWER_COLORS = [0xffe066, 0xffffff, 0xff9cc0, 0x9fd4ff], PEBBLE_COLORS = [0xb9b3a8, 0xa9a397, 0xc9c3b6];
// 놓은 꽃: 노란 작은 공은 씨앗(🌻)처럼 보여서 분홍·하양·하늘·보라 꽃송이(조금 납작하게)를 초록 덤불 덩이 위에 다섯 송이
const ADD_FLOWER_COLORS = [0xff8fb8, 0xfff6f0, 0x8fc8ff, 0xc39bff], ADD_CELLS = 800, BUSH_PER = 2, BLOSSOM_PER = 5;
const _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _dv = new THREE.Vector3(), _ds = new THREE.Vector3(), _dy = new THREE.Vector3(0, 1, 0), _dc = new THREE.Color();

export class Decor {
  /** opt: { density: 0~1(양), simple: 단순한 모양(삼각형 1/4), bushShadow: 덤불 그림자 } — 그래픽 설정 */
  constructor(scene, world, opt = { density: 1, simple: false, bushShadow: true }) {
    this.world = world; this.scene = scene; const g = world.grid, rnd = seededRandom((world.seed ?? 7) * 31 + 5), keep = seededRandom((world.seed ?? 7) * 17 + 3);
    const at = (x, z) => g.get(x, z), cells = { bush: [], flower: [], pebble: [] };
    const treeNear = new Set(); for (const t of world.trees) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) treeNear.add(`${t.x + dx},${t.z + dz}`);
    const c0 = world.center;
    for (let z = 1; z < g.h - 1; z++) for (let x = 1; x < g.w - 1; x++) {
      const c = at(x, z); if (!c || c.occupiedId || g.isWater(x, z)) continue;
      if (Math.abs(x - c0.x) < 8 && Math.abs(z - c0.z) < 8) continue;                 // 은행 앞 광장 자리는 비움
      let wallBase = false, wallTop = false, sandNear = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const o = at(x + dx, z + dz); if (!o) continue;
        if (o.elevation - c.elevation > 0.5) wallBase = true; if (c.elevation - o.elevation > 0.5) wallTop = true; if (o.groundType === "Sand" && !g.isWater(x + dx, z + dz)) sandNear = true; }
      if (c.groundType === "Grass") {
        const p = (treeNear.has(`${x},${z}`) ? 0.3 : 0) + (wallBase ? 0.3 : 0) + (wallTop ? 0.18 : 0) + (sandNear ? 0.1 : 0);
        const kb = keep() < opt.density, kf = keep() < opt.density, kp = keep() < opt.density;   // 양 줄이기(같은 자리는 늘 같은 결과)
        if (rnd() < p && kb) cells.bush.push([x, z]);
        const patch = Math.sin(x * 0.37 + z * 0.21) * Math.cos(x * 0.13 - z * 0.29);
        if (((patch > 0.55 && rnd() < 0.5) || rnd() < 0.02) && kf) void 0;              // 꽃(작은 점)은 씨앗처럼 보여서 없앰(난수 순서는 그대로)
        void kp;
      } else if (c.groundType === "Sand" && rnd() < 0.035 && keep() < opt.density) cells.pebble.push([x, z]);
      else if (c.groundType === "Rock" && rnd() < 0.3 && keep() < opt.density) cells.pebble.push([x, z]);
    }
    // 덤불: 둥근 덩이(위·아래로 약간 눌림), 꽃: 작은 공 셋이 한 송이, 자갈: 깎은 돌
    this.types = {
      bush: { geo: new THREE.IcosahedronGeometry(0.3, opt.simple ? 0 : 1), per: 2, colors: BUSH_COLORS, size: [0.7, 1.25], squash: 0.78, shadow: !!opt.bushShadow },   // 단순: 80 → 20 삼각형
      flower: { geo: opt.simple ? new THREE.OctahedronGeometry(0.05, 0) : new THREE.SphereGeometry(0.045, 6, 4), per: 3, colors: FLOWER_COLORS, size: [0.8, 1.3], squash: 1, shadow: false },   // 단순: 48 → 8
      pebble: { geo: new THREE.DodecahedronGeometry(0.11, 0), per: 1, colors: PEBBLE_COLORS, size: [0.6, 1.6], squash: 0.6, shadow: false },
    };
    this.items = [];                                                                 // { type, cell: "x,z", i(인스턴스 번호), gx, gz, s, rot, lift }
    this.meshes = {};
    for (const [type, def] of Object.entries(this.types)) {
      const list = cells[type], n = list.length * def.per;
      const mesh = new THREE.InstancedMesh(def.geo, new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }), Math.max(1, n));
      mesh.castShadow = def.shadow; mesh.receiveShadow = false; mesh.count = n; mesh.frustumCulled = false;
      let i = 0; const col = new THREE.Color();
      for (const [x, z] of list) for (let k = 0; k < def.per; k++, i++) {
        const gx = x + 0.15 + rnd() * 0.7, gz = z + 0.15 + rnd() * 0.7, s = def.size[0] + rnd() * (def.size[1] - def.size[0]);
        const it = { type, cell: `${x},${z}`, i, gx, gz, s, rot: rnd() * 6.28, lift: type === "flower" ? 0.14 + rnd() * 0.06 : type === "bush" ? 0.17 * s : 0.03 };
        this.items.push(it); mesh.setColorAt(i, col.setHex(def.colors[Math.floor(rnd() * def.colors.length)]));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh); this.meshes[type] = mesh;
    }
    this.byCell = new Map(); for (const it of this.items) { if (!this.byCell.has(it.cell)) this.byCell.set(it.cell, []); this.byCell.get(it.cell).push(it); }
    for (const it of this.items) this.place(it);
    for (const m of Object.values(this.meshes)) m.instanceMatrix.needsUpdate = true;
    for (const m of Object.values(this.meshes)) m.visible = m.count > 0;           // 빈 소품(꺼진 꽃 등)은 그리기 호출을 쓰지 않게
    // 놓은 덤불·꽃: 덤불 덩이(씨앗 덤불과 같은 모양·재질 → 계절 색·그림체가 같이 바뀜) + 꽃송이
    const bush = this.types.bush, flower = this.types.flower;
    this.added = {
      bush: new THREE.InstancedMesh(bush.geo, this.meshes.bush.material, ADD_CELLS * BUSH_PER),
      blossom: new THREE.InstancedMesh(flower.geo, new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 }), ADD_CELLS * BLOSSOM_PER),
    };
    this.added.bush.castShadow = bush.shadow; this.added.blossom.castShadow = false;
    for (const [k, m] of Object.entries(this.added)) { m.name = `decorAdd-${k}`; m.count = 0; m.visible = false; m.frustumCulled = false; m.receiveShadow = false; m.setColorAt(0, _dc.setHex(0xffffff)); scene.add(m); }   // 색 칸을 처음부터(나중에 생기면 셰이더를 다시 만들어야 함)
    this.syncAdded();
    const again = () => this.later();
    world.on("buildingAdded", b => { this.refresh(b.cells); again(); });
    world.on("buildingRemoved", b => { this.refresh(b.cells); again(); });
    world.on("ground", e => { this.refresh([[e.x, e.z]]); again(); });
    world.on("decorChanged", e => { this.refresh([[e.x, e.z]]); again(); });
  }
  /** 같은 순간 여러 칸이 바뀌어도(붓·되돌리기 묶음) 놓은 소품은 한 번만 다시 채움 */
  later() { if (this.pending || this.disposed) return; this.pending = true; queueMicrotask(() => { this.pending = false; if (!this.disposed) this.syncAdded(); }); }
  /** 놓은 덤불·꽃(world.decor.add)을 처음부터 다시 채움. 칸마다 같은 모양(칸 좌표 해시 + v), 건물·물 칸은 건너뜀 */
  syncAdded() {
    const w = this.world, g = w.grid, add = w.decor?.add, B = this.added.bush, F = this.added.blossom; let nb = 0, nf = 0;
    const put = (mesh, i, gx, gz, lift, s, squash, rot, hex) => {
      _dv.set(toWorldX(gx), w.standHeight(gx, gz) + lift, toWorldZ(gz)); _dq.setFromAxisAngle(_dy, rot); _ds.set(s, s * squash, s);
      mesh.setMatrixAt(i, _dm.compose(_dv, _dq, _ds)); mesh.setColorAt(i, _dc.setHex(hex));
    };
    for (const [key, d] of add || []) {
      const [x, z] = key.split(",").map(Number), c = g.get(x, z); if (!c || c.occupiedId || g.isWater(x, z)) continue;
      const r = seededRandom(((x * 73856093) ^ (z * 19349663) ^ (d.v * 83492791)) >>> 0);
      if (d.k === "bush") {
        if (nb + BUSH_PER > B.instanceMatrix.count) continue;
        for (let k = 0; k < BUSH_PER; k++) { const s = 0.85 + r() * 0.4; put(B, nb++, x + 0.3 + r() * 0.4, z + 0.3 + r() * 0.4, 0.17 * s, s, 0.78, r() * 6.28, BUSH_COLORS[(d.v + k) % BUSH_COLORS.length]); }
      } else {
        if (nb + 1 > B.instanceMatrix.count || nf + BLOSSOM_PER > F.instanceMatrix.count) continue;
        put(B, nb++, x + 0.5, z + 0.5, 0.07, 0.7, 0.6, r() * 6.28, BUSH_COLORS[d.v % BUSH_COLORS.length]);   // 꽃 밑 초록 잎 덩이
        const hex = ADD_FLOWER_COLORS[d.v % ADD_FLOWER_COLORS.length];
        for (let k = 0; k < BLOSSOM_PER; k++) { const a = k / BLOSSOM_PER * 6.283 + r() * 0.5, rr = k ? 0.2 + r() * 0.05 : 0; put(F, nf++, x + 0.5 + Math.cos(a) * rr, z + 0.5 + Math.sin(a) * rr, 0.24 + r() * 0.06, 2.3, 0.7, r() * 6.28, hex); }
      }
    }
    for (const [m, n] of [[B, nb], [F, nf]]) { m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  /** 그래픽 설정이 바뀌어 다시 만들 때: 장면에서 빼고 메모리 반납(놓은 덤불은 씨앗 덤불과 모양·재질을 같이 씀) */
  dispose() {
    this.disposed = true; for (const m of Object.values(this.meshes)) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); m.dispose?.(); }
    for (const m of Object.values(this.added || {})) { this.scene.remove(m); m.dispose?.(); } this.added?.blossom.material.dispose();
  }
  /** 소품 하나를 제자리에(칸에 건물이 있거나 맞지 않는 바닥이면 숨김) */
  place(it) {
    const g = this.world.grid, [x, z] = it.cell.split(",").map(Number), c = g.get(x, z), def = this.types[it.type], m = new THREE.Matrix4();
    const dc = this.world.decor, ok = c && !c.occupiedId && !g.isWater(x, z) && (it.type === "pebble" ? c.groundType === "Sand" || c.groundType === "Rock" : c.groundType === "Grass")
      && !dc?.off.has(it.cell) && !dc?.add.has(it.cell);                             // 꾸미기로 치운 칸·덤불이나 꽃을 놓은 칸의 씨앗 소품은 숨김
    if (!ok) m.makeScale(0, 0, 0);
    else {
      const y = this.world.standHeight(it.gx, it.gz) + it.lift;
      m.compose(new THREE.Vector3(toWorldX(it.gx), y, toWorldZ(it.gz)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot), new THREE.Vector3(it.s, it.s * def.squash, it.s));
    }
    this.meshes[it.type].setMatrixAt(it.i, m);
  }
  refresh(cells) {
    if (this.disposed) return;
    const touched = new Set();
    for (const [x, z] of cells) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const it of this.byCell.get(`${x + dx},${z + dz}`) || []) { this.place(it); touched.add(it.type); }
    for (const t of touched) this.meshes[t].instanceMatrix.needsUpdate = true;
  }
}
