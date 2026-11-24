// 실내 꾸미기(순수 계산): 집마다 구조(층·방·계단·칸막이벽)가 다르고, 층마다 가구를 놓음.
// 건물의 interior = { levels: [층], stash: { id: 개수 } }
//   층 = { name, w, d, wallH, floor, wallpaper, furniture: [{ id, x, z, rot }], stairs, walls, role }
//    · stairs { x, z, w, d, dir: "up"|"down" }: 계단(아래층)·계단 구멍(위층) 칸 — 가구를 못 놓음
//    · walls [{ x, z0, z1, door: [z, z] }]: 세로 칸막이벽(x칸 경계, z0~z1), door 칸은 지나갈 수 있음. 가구가 벽을 걸치면 못 놓음
//  · x, z: 가구가 차지하는 칸 중 왼쪽 위(작은 x·z) 칸. rot 0~3(90°씩). rot이 홀수면 가로·세로가 바뀜.
//  · stash: 그 집에 있지만 아직 안 놓은 가구(주인이 산 것, 치운 것). 마을 가방(world.items)의 낚시 가구도 아무 집에나 놓음
import { FURNITURE, ITEMS } from "../data/catalog.js";

// 집마다 구조
export const LAYOUTS = {
  house: [{ name: "원룸", w: 5, d: 4 }],
  cottage: [
    { name: "1층 거실", w: 6, d: 5, stairs: { x: 4, z: 0, w: 2, d: 1, dir: "up" } },
    { name: "2층 침실", w: 6, d: 5, stairs: { x: 4, z: 0, w: 2, d: 1, dir: "down" }, role: "bedroom", wallpaper: "pink", floor: "carpet" },
  ],
  giantHouse: [{ name: "큰 방(천장 높음)", w: 8, d: 7, wallH: 3.6 }],
  manor: [
    { name: "1층 거실·부엌", w: 9, d: 7, walls: [{ x: 5, z0: 0, z1: 7, door: [3, 4] }], stairs: { x: 0, z: 0, w: 1, d: 2, dir: "up" }, floor: "dark" },
    { name: "2층 침실 둘", w: 9, d: 7, walls: [{ x: 4, z0: 0, z1: 7, door: [5, 6] }], stairs: { x: 0, z: 0, w: 1, d: 2, dir: "down" }, role: "bedroom", wallpaper: "sky" },
  ],
};
const ROOM_DEFAULT = { w: 6, d: 5 };

export const size = (id, rot) => { const f = FURNITURE[id].footprint; return rot % 2 ? { w: f.d, d: f.w } : { w: f.w, d: f.d }; };
/** 집 실내(층 목록)를 만들거나 예전 저장(층 없이 furniture만)을 첫 층으로 옮김 */
export function room(b) {
  const it = b.interior; it.stash ||= {};
  if (!it.levels) {
    const plan = LAYOUTS[b.defId] || [{ name: "방", w: it.w || ROOM_DEFAULT.w, d: it.d || ROOM_DEFAULT.d }];
    it.levels = plan.map(p => ({ ...p, stairs: p.stairs ? { ...p.stairs } : null, walls: (p.walls || []).map(w => ({ ...w })), wallH: p.wallH || 2.4, floor: p.floor || "wood", wallpaper: p.wallpaper || "cream", furniture: [] }));
    const old = it.furniture || []; delete it.furniture; delete it.floor; delete it.wallpaper;
    for (const o of old) { const L = it.levels[0]; if (fits(L, o.id, o.x, o.z, o.rot)) L.furniture.push(o); else it.stash[o.id] = (it.stash[o.id] || 0) + 1; }
  }
  return it;
}
export const levels = b => room(b).levels;
export const allFurniture = b => levels(b).flatMap(L => L.furniture);
const cellsOf = (id, x, z, rot) => { const s = size(id, rot), out = []; for (let dz = 0; dz < s.d; dz++) for (let dx = 0; dx < s.w; dx++) out.push([x + dx, z + dz]); return out; };
/** 계단 앞 디딤 칸(오르는 계단의 가장 낮은 단 바로 앞): 늘 비워 둠 */
export const landing = s => !s || s.dir !== "up" ? null : s.w >= s.d ? [s.x + s.w - 1, s.z + s.d] : [s.x, s.z + s.d];
const inStairs = (L, x, z) => { const s = L.stairs; if (!s) return false; const l = landing(s); return (x >= s.x && x < s.x + s.w && z >= s.z && z < s.z + s.d) || (!!l && l[0] === x && l[1] === z); };
/** 칸막이벽을 걸치는가(벽 양쪽 칸을 같이 차지하고, 그 줄이 문이 아님) */
const crossesWall = (L, cells) => (L.walls || []).some(w => {
  const set = new Set(cells.map(c => c.join(",")));
  return cells.some(([x, z]) => x === w.x - 1 && z >= w.z0 && z < w.z1 && set.has(`${w.x},${z}`) && !(w.door && z >= w.door[0] && z <= w.door[1]));
});
/** 놓을 수 있나(층 L): 방 안, 계단 칸 아님, 칸막이벽을 안 걸침, 같은 층(깔개끼리 / 나머지끼리) 가구와 안 겹침. skip: 옮기는 중인 가구 번호 */
export function fits(L, id, x, z, rot, skip = -1) {
  const f = FURNITURE[id]; if (!f) return false;
  const cells = cellsOf(id, x, z, rot);
  if (cells.some(([cx, cz]) => cx < 0 || cz < 0 || cx >= L.w || cz >= L.d || inStairs(L, cx, cz))) return false;
  if (crossesWall(L, cells)) return false;
  const floor = f.layer === "floor";
  return !L.furniture.some((o, i) => {
    if (i === skip || (FURNITURE[o.id].layer === "floor") !== floor) return false;
    const oc = new Set(cellsOf(o.id, o.x, o.z, o.rot).map(c => c.join(","))); return cells.some(c => oc.has(c.join(",")));
  });
}
/** 놓을 수 있는 가구 목록: 그 집 창고(stash) + 마을 가방(낚시 가구) */
export function available(world, b) {
  const it = room(b), out = {};
  for (const [id, n] of Object.entries(it.stash)) if (n > 0) out[id] = { n, from: "stash" };
  for (const item of ITEMS) if (item.furniture && (world.items[item.id] || 0) > 0) { const id = item.furniture; out[id] = { n: (out[id]?.n || 0) + world.items[item.id], from: out[id] ? "both" : "bag", item: item.id }; }
  return out;
}
function take(world, b, id) {
  const it = room(b); if ((it.stash[id] || 0) > 0) { it.stash[id]--; return true; }
  const item = ITEMS.find(i => i.furniture === id); if (item && (world.items[item.id] || 0) > 0) { world.items[item.id]--; return true; }
  return false;
}
const lv = (b, li) => levels(b)[li] || levels(b)[0];
export function place(world, b, id, x, z, rot = 0, li = 0) {
  const L = lv(b, li); if (!fits(L, id, x, z, rot) || !take(world, b, id)) return false;
  L.furniture.push({ id, x, z, rot }); world.emit?.("furniture", { b }); return true;
}
export function move(world, b, i, x, z, rot, li = 0) {
  const L = lv(b, li), o = L.furniture[i]; if (!o || !fits(L, o.id, x, z, rot, i)) return false;
  Object.assign(o, { x, z, rot }); world.emit?.("furniture", { b }); return true;
}
/** 치우기: 그 집 창고로 */
export function stow(world, b, i, li = 0) {
  const L = lv(b, li), o = L.furniture[i]; if (!o) return false;
  L.furniture.splice(i, 1); const it = room(b); it.stash[o.id] = (it.stash[o.id] || 0) + 1; world.emit?.("furniture", { b }); return true;
}
/** 알아서 놓기: 침대는 침실 층부터, 나머지는 아래층부터. 벽 쪽부터 빈 자리. 놓았으면 true */
export function autoPlace(world, b, id) {
  const ls = levels(b), sleep = FURNITURE[id].use === "sleep";
  const order = ls.map((L, i) => i).sort((a, c) => sleep ? (ls[c].role === "bedroom") - (ls[a].role === "bedroom") : a - c);
  for (const li of order) {
    const L = ls[li], spots = [];
    for (let rot = 0; rot < 4; rot++) for (let z = 0; z < L.d; z++) for (let x = 0; x < L.w; x++) { const s = size(id, rot); spots.push([Math.min(z, x, L.w - (x + s.w)) * 10 + z + x * 0.1 + rot * 0.01, x, z, rot]); }
    spots.sort((a, c) => a[0] - c[0]);
    for (const [, x, z, rot] of spots) if (fits(L, id, x, z, rot)) { L.furniture.push({ id, x, z, rot }); world.emit?.("furniture", { b }); return true; }
  }
  return false;
}
/** 집 아늑함: 모든 층에 놓인 가구 comfort 합 */
export const comfort = b => allFurniture(b).reduce((s, o) => s + (FURNITURE[o.id]?.comfort || 0), 0);
/** 집에 있는(놓였거나 창고) 가구 종류 */
export const owns = (b, id) => allFurniture(b).some(o => o.id === id) || (room(b).stash[id] || 0) > 0;
/** 갈매미가 다음에 사고 싶은 가구(없는 것 중 이 순서대로) */
export const WANT_ORDER = ["bed", "chair", "table", "plant", "rug", "floorLamp", "bookshelf", "sofa", "wardrobe", "oven"];
export function nextWant(b) { return WANT_ORDER.find(id => !owns(b, id)) || null; }
/** 집에 들어온 갈매미가 쓸 가구: 졸리면 침대, 아니면 앉을 것·책장 중 하나 */
export function pickUse(b, sleepy, rnd = Math.random) {
  const list = allFurniture(b).filter(o => FURNITURE[o.id].use);
  const beds = list.filter(o => FURNITURE[o.id].use === "sleep");
  if (sleepy && beds.length) return beds[0];
  const other = list.filter(o => FURNITURE[o.id].use !== "sleep"); const pool = other.length ? other : list;
  return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
}
