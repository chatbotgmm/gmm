// 바닥 렌더링(지시서 3-B-2): 칸마다 오브젝트를 만들지 않고 16×16 청크마다 메쉬 하나로 합친다.
// 바뀐 칸이 속한 청크만(grid.takeDirty) 다시 만든다. 길 종류는 오토타일 조각(tilePieces)을 살짝 띄워 그린다.
import * as THREE from "three";
import { CELL, toWorldX, toWorldZ } from "../config.js";
import { GroundType } from "../data/types.js";
import { GROUND_STYLE } from "../data/catalog.js";
import { PATH_TYPES, tilePieces } from "../world/autotile.js";

const SIDE = { [GroundType.Sand]: 0xd8c38f, default: 0xb48557 };    // 절벽·턱 옆면 색
const SEABED_COLOR = 0xd9c896, LOWEST = -1.6;
const tmpColor = new THREE.Color();

class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  // 네 꼭짓점(순서대로 둘레)을 normal 쪽에서 보면 반시계가 되도록 맞춰 삼각형 두 개로 넣는다.
  quad(a, b, c, d, n, hex) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) [b, d] = [d, b];
    tmpColor.setHex(hex);
    for (const p of [a, b, c, a, c, d]) { this.pos.push(...p); this.nor.push(...n); this.col.push(tmpColor.r, tmpColor.g, tmpColor.b); }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere(); return g;
  }
}

function baseColor(grid, x, z, c) {
  if (grid.isWater(x, z)) return SEABED_COLOR;
  let t = c.groundType;
  if (PATH_TYPES.has(t)) {                                    // 길 아래 바탕: 이웃에 모래만 있으면 모래, 아니면 잔디
    const ns = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => grid.get(x + dx, z + dz)?.groundType);
    t = ns.includes(GroundType.Sand) && !ns.includes(GroundType.Grass) ? GroundType.Sand : GroundType.Grass;
  }
  return GROUND_STYLE[t].colors[(x + z) & 1];
}

export function buildChunkGeometry(grid, cx, cz) {
  const b = new Builder(), n = grid.chunk;
  for (let z = cz * n; z < Math.min(grid.h, (cz + 1) * n); z++) for (let x = cx * n; x < Math.min(grid.w, (cx + 1) * n); x++) {
    const c = grid.get(x, z), y = c.elevation, x0 = toWorldX(x), z0 = toWorldZ(z), x1 = x0 + CELL, z1 = z0 + CELL;
    b.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], baseColor(grid, x, z, c));
    // 옆면: 이웃이 더 낮으면 그 높이까지 벽을 세운다(언덕 절벽, 해안 턱)
    const side = SIDE[c.groundType] ?? SIDE.default;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = grid.get(x + dx, z + dz), ny = nb ? nb.elevation : LOWEST;
      if (ny >= y - 1e-4) continue;
      const sc = grid.isWater(x, z) ? SEABED_COLOR : side;
      if (dx === 1) b.quad([x1, y, z0], [x1, y, z1], [x1, ny, z1], [x1, ny, z0], [1, 0, 0], sc);
      if (dx === -1) b.quad([x0, y, z0], [x0, y, z1], [x0, ny, z1], [x0, ny, z0], [-1, 0, 0], sc);
      if (dz === 1) b.quad([x0, y, z1], [x1, y, z1], [x1, ny, z1], [x0, ny, z1], [0, 0, 1], sc);
      if (dz === -1) b.quad([x0, y, z0], [x1, y, z0], [x1, ny, z0], [x0, ny, z0], [0, 0, -1], sc);
    }
    if (PATH_TYPES.has(c.groundType) && !grid.isWater(x, z)) {
      const hex = GROUND_STYLE[c.groundType].colors[(x + z) & 1], py = y + 0.012;
      for (const [a0, b0, a1, b1] of tilePieces(grid, x, z))
        b.quad([x0 + a0, py, z0 + b0], [x0 + a0, py, z0 + b1], [x0 + a1, py, z0 + b1], [x0 + a1, py, z0 + b0], [0, 1, 0], hex);
    }
  }
  return b.geometry();
}

export class GroundChunks {
  constructor(scene, grid) {
    this.scene = scene; this.grid = grid; this.meshes = new Map(); this.rebuilt = 0;
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  }
  /** 바뀐 청크만 다시 만든다. 다시 만든 청크 수를 돌려준다. */
  sync() {
    const keys = this.grid.takeDirty();
    for (const key of keys) {
      const [cx, cz] = key.split(",").map(Number), geo = buildChunkGeometry(this.grid, cx, cz);
      let m = this.meshes.get(key);
      if (m) { m.geometry.dispose(); m.geometry = geo; }
      else { m = new THREE.Mesh(geo, this.material); m.receiveShadow = true; m.castShadow = true; m.name = `chunk ${key}`; m.userData.chunk = key; this.scene.add(m); this.meshes.set(key, m); }
    }
    this.rebuilt += keys.length; return keys.length;
  }
  dispose() { for (const m of this.meshes.values()) { this.scene.remove(m); m.geometry.dispose(); } this.meshes.clear(); }
}
