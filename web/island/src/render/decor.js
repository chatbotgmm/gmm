// 장식 소품(보기만, 길을 막지 않음): 덤불·꽃·자갈을 종류마다 InstancedMesh 하나로 한꺼번에 그림(그리기 호출 3번).
//  · 덤불: 숲 가장자리, 고지대 벽 밑, 단 위 가장자리, 모래사장과 맞닿은 잔디
//  · 꽃: 잔디밭 곳곳에 무리 지어(노랑·하양·분홍·하늘색)
//  · 자갈: 모래·바위 위
// 건물을 짓거나 땅을 칠하고 높이를 바꾼 칸의 소품은 숨기거나 높이를 다시 맞춘다.
import * as THREE from "three";
import { toWorldX, toWorldZ } from "../config.js";
import { seededRandom } from "../util.js";

const BUSH_COLORS = [0x5aa845, 0x6bb84e, 0x4f9a3f], FLOWER_COLORS = [0xffe066, 0xffffff, 0xff9cc0, 0x9fd4ff], PEBBLE_COLORS = [0xb9b3a8, 0xa9a397, 0xc9c3b6];

export class Decor {
  constructor(scene, world) {
    this.world = world; this.scene = scene; const g = world.grid, rnd = seededRandom((world.seed ?? 7) * 31 + 5);
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
        if (rnd() < p) cells.bush.push([x, z]);
        const patch = Math.sin(x * 0.37 + z * 0.21) * Math.cos(x * 0.13 - z * 0.29);
        if (patch > 0.55 && rnd() < 0.5) cells.flower.push([x, z]); else if (rnd() < 0.02) cells.flower.push([x, z]);
      } else if (c.groundType === "Sand" && rnd() < 0.035) cells.pebble.push([x, z]);
      else if (c.groundType === "Rock" && rnd() < 0.3) cells.pebble.push([x, z]);
    }
    // 덤불: 둥근 덩이(위·아래로 약간 눌림), 꽃: 작은 공 셋이 한 송이, 자갈: 깎은 돌
    this.types = {
      bush: { geo: new THREE.IcosahedronGeometry(0.3, 1), per: 2, colors: BUSH_COLORS, size: [0.7, 1.25], squash: 0.78, shadow: true },
      flower: { geo: new THREE.SphereGeometry(0.045, 6, 4), per: 3, colors: FLOWER_COLORS, size: [0.8, 1.3], squash: 1, shadow: false },
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
    world.on("buildingAdded", b => this.refresh(b.cells));
    world.on("buildingRemoved", b => this.refresh(b.cells));
    world.on("ground", e => this.refresh([[e.x, e.z]]));
  }
  /** 소품 하나를 제자리에(칸에 건물이 있거나 맞지 않는 바닥이면 숨김) */
  place(it) {
    const g = this.world.grid, [x, z] = it.cell.split(",").map(Number), c = g.get(x, z), def = this.types[it.type], m = new THREE.Matrix4();
    const ok = c && !c.occupiedId && !g.isWater(x, z) && (it.type === "pebble" ? c.groundType === "Sand" || c.groundType === "Rock" : c.groundType === "Grass");
    if (!ok) m.makeScale(0, 0, 0);
    else {
      const y = this.world.standHeight(it.gx, it.gz) + it.lift;
      m.compose(new THREE.Vector3(toWorldX(it.gx), y, toWorldZ(it.gz)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot), new THREE.Vector3(it.s, it.s * def.squash, it.s));
    }
    this.meshes[it.type].setMatrixAt(it.i, m);
  }
  refresh(cells) {
    const touched = new Set();
    for (const [x, z] of cells) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const it of this.byCell.get(`${x + dx},${z + dz}`) || []) { this.place(it); touched.add(it.type); }
    for (const t of touched) this.meshes[t].instanceMatrix.needsUpdate = true;
  }
}
