// 실내 꾸미기(순수 계산): 집마다 구조(층·방·계단·칸막이벽)가 다르고, 층마다 가구를 놓음.
// 건물의 interior = { levels: [층], stash: { id: 개수 } }
//   층 = { name, w, d, wallH, floor, wallpaper, furniture: [{ id, x, z, rot }], stairs, walls, role }
//    · stairs { x, z, w, d, dir: "up"|"down" }: 계단(아래층)·계단 구멍(위층) 칸 — 가구를 못 놓음
//    · doors [{ wall, at, to }]: 문(아래 LAYOUTS 설명). 문 앞 칸은 비워 둠
//    · walls [{ x, z0, z1, door: [z, z] }]: 세로 칸막이벽(지금 구조엔 안 씀. 방을 나눌 땐 문으로 잇는 방을 따로 둠)(x칸 경계, z0~z1), door 칸은 지나갈 수 있음. 가구가 벽을 걸치면 못 놓음
//  · x, z: 가구가 차지하는 칸 중 왼쪽 위(작은 x·z) 칸. rot 0~3(90°씩). rot이 홀수면 가로·세로가 바뀜.
//  · stash: 그 집에 있지만 아직 안 놓은 가구(주인이 산 것, 치운 것). 마을 가방(world.items)의 낚시 가구도 아무 집에나 놓음
import { FURNITURE, ITEMS } from "../data/catalog.js";

// 집마다 구조. 방(levels)은 한 번에 하나씩 보이고, 문을 누르면 다른 방으로 가거나(to: 방 번호) 밖으로 나감(to: "exit").
//  · doors [{ wall: "W"|"E"|"N"|"S", at, to }]: W = 왼쪽(−x) · E = 오른쪽 · N = 뒤(−z) · S = 앞. at = 벽을 따라 몇 번째 칸. 문 앞 칸엔 가구를 못 놓음
//  · stairs.to: 계단을 누르면 갈 방
export const LAYOUT_V = 2;
export const LAYOUTS = {
  house: [{ name: "원룸", w: 5, d: 4, doors: [{ wall: "W", at: 3, to: "exit" }] }],
  cottage: [
    { name: "1층 거실", w: 6, d: 5, stairs: { x: 4, z: 0, w: 2, d: 1, dir: "up", to: 1 }, doors: [{ wall: "W", at: 4, to: "exit" }, { wall: "E", at: 3, to: 2 }] },
    { name: "2층 침실", w: 6, d: 5, stairs: { x: 4, z: 0, w: 2, d: 1, dir: "down", to: 0 }, role: "bedroom", wallpaper: "pink", floor: "carpet" },
    { name: "1층 부엌", w: 4, d: 4, doors: [{ wall: "W", at: 2, to: 0 }], floor: "tile" },
  ],
  giantHouse: [
    { name: "큰 방(천장 높음)", w: 8, d: 7, wallH: 3.6, doors: [{ wall: "W", at: 5, to: "exit" }, { wall: "E", at: 3, to: 1 }] },
    { name: "작은 방", w: 5, d: 4, wallH: 3.6, doors: [{ wall: "W", at: 1, to: 0 }], role: "bedroom" },
  ],
  manor: [
    { name: "1층 거실", w: 7, d: 6, stairs: { x: 0, z: 0, w: 1, d: 2, dir: "up", to: 1 }, doors: [{ wall: "W", at: 4, to: "exit" }, { wall: "E", at: 2, to: 2 }], floor: "dark" },
    { name: "2층 큰 침실", w: 6, d: 5, stairs: { x: 0, z: 0, w: 1, d: 2, dir: "down", to: 0 }, doors: [{ wall: "E", at: 2, to: 3 }], role: "bedroom", wallpaper: "sky" },
    { name: "1층 부엌", w: 5, d: 5, doors: [{ wall: "W", at: 2, to: 0 }], floor: "tile" },
    { name: "2층 작은 침실", w: 5, d: 4, doors: [{ wall: "W", at: 1, to: 1 }], role: "bedroom", wallpaper: "pink" },
  ],
};
const ROOM_DEFAULT = { w: 6, d: 5 };

export const size = (id, rot) => { const f = FURNITURE[id].footprint; return rot % 2 ? { w: f.d, d: f.w } : { w: f.w, d: f.d }; };
/** 집 실내(층 목록)를 만들거나 예전 저장(층 없이 furniture만)을 첫 층으로 옮김 */
export function room(b) {
  const it = b.interior; it.stash ||= {};
  if (!it.levels || it.layoutV !== LAYOUT_V) {
    const w0 = it.w || ROOM_DEFAULT.w, d0 = it.d || ROOM_DEFAULT.d;
    const plan = LAYOUTS[b.defId] || [{ name: "방", w: w0, d: d0, doors: [{ wall: "W", at: d0 - 1, to: "exit" }, { wall: "E", at: 1, to: 1 }] }, { name: "뒷방", w: 4, d: 4, doors: [{ wall: "W", at: 1, to: 0 }] }];
    const prev = it.levels || [{ furniture: it.furniture || [], floor: it.floor, wallpaper: it.wallpaper }];   // 예전 저장: 층 없이 furniture만 · 예전 구조(칸막이벽)
    it.levels = plan.map((p, i) => ({ ...p, stairs: p.stairs ? { ...p.stairs } : null, walls: (p.walls || []).map(w => ({ ...w })), doors: (p.doors || []).map(d => ({ ...d })), wallH: p.wallH || 2.4,
      floor: prev[i]?.floor || p.floor || "wood", wallpaper: prev[i]?.wallpaper || p.wallpaper || "cream", furniture: [] }));
    delete it.furniture; delete it.floor; delete it.wallpaper; it.layoutV = LAYOUT_V;
    prev.forEach((P, i) => { for (const o of P.furniture || []) { const L = it.levels[i]; if (L && fits(L, o.id, o.x, o.z, o.rot)) L.furniture.push(o); else it.stash[o.id] = (it.stash[o.id] || 0) + 1; } });   // 같은 번째 방에 맞으면 그대로, 아니면 창고로
  }
  return it;
}
export const levels = b => room(b).levels;
export const allFurniture = b => levels(b).flatMap(L => L.furniture);
const cellsOf = (id, x, z, rot) => { const s = size(id, rot), out = []; for (let dz = 0; dz < s.d; dz++) for (let dx = 0; dx < s.w; dx++) out.push([x + dx, z + dz]); return out; };
/** 계단 앞 디딤 칸(오르는 계단의 가장 낮은 단 바로 앞): 늘 비워 둠 */
export const landing = s => !s || s.dir !== "up" ? null : s.w >= s.d ? [s.x + s.w - 1, s.z + s.d] : [s.x, s.z + s.d];
/** 문 앞 칸(방 안쪽 첫 칸): 늘 비워 둠 */
export const doorCell = (L, d) => d.wall === "W" ? [0, d.at] : d.wall === "E" ? [L.w - 1, d.at] : d.wall === "N" ? [d.at, 0] : [d.at, L.d - 1];
const atDoor = (L, x, z) => (L.doors || []).some(d => { const c = doorCell(L, d); return c[0] === x && c[1] === z; });
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
  if (cells.some(([cx, cz]) => cx < 0 || cz < 0 || cx >= L.w || cz >= L.d || inStairs(L, cx, cz) || atDoor(L, cx, cz))) return false;
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
