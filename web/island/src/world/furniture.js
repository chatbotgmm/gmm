// 실내 꾸미기(순수 계산): 집 방(interior w×d 칸)에 가구 놓기·옮기기·돌리기·치우기, 잡화점에서 사기, 알아서 놓기, 아늑함.
// 건물의 interior = { w, d, floor, wallpaper, furniture: [{ id, x, z, rot }], stash: { id: 개수 } }
//  · x, z: 가구가 차지하는 칸 중 왼쪽 위(작은 x·z) 칸. rot 0~3(90°씩). rot이 홀수면 가로·세로가 바뀜.
//  · stash: 그 집에 있지만 아직 안 놓은 가구(주인이 산 것, 치운 것)
//  · 마을 가방(world.items)의 낚시 가구도 아무 집에나 놓을 수 있음
import { FURNITURE, ITEMS } from "../data/catalog.js";

export const size = (id, rot) => { const f = FURNITURE[id].footprint; return rot % 2 ? { w: f.d, d: f.w } : { w: f.w, d: f.d }; };
export function room(b) { const it = b.interior; it.furniture ||= []; it.stash ||= {}; it.floor ||= "wood"; it.wallpaper ||= "cream"; return it; }
const cellsOf = (id, x, z, rot) => { const s = size(id, rot), out = []; for (let dz = 0; dz < s.d; dz++) for (let dx = 0; dx < s.w; dx++) out.push([x + dx, z + dz]); return out; };

/** 놓을 수 있나: 방 안이고, 같은 층(깔개끼리 / 나머지끼리) 가구와 겹치지 않음. skip: 옮기는 중인 가구 번호 */
export function fits(b, id, x, z, rot, skip = -1) {
  const it = room(b), f = FURNITURE[id]; if (!f) return false;
  const cells = cellsOf(id, x, z, rot); if (cells.some(([cx, cz]) => cx < 0 || cz < 0 || cx >= it.w || cz >= it.d)) return false;
  const floor = f.layer === "floor";
  return !it.furniture.some((o, i) => {
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
export function place(world, b, id, x, z, rot = 0) {
  if (!fits(b, id, x, z, rot) || !take(world, b, id)) return false;
  room(b).furniture.push({ id, x, z, rot }); world.emit?.("furniture", { b }); return true;
}
export function move(world, b, i, x, z, rot) {
  const it = room(b), o = it.furniture[i]; if (!o || !fits(b, o.id, x, z, rot, i)) return false;
  Object.assign(o, { x, z, rot }); world.emit?.("furniture", { b }); return true;
}
/** 치우기: 그 집 창고로 */
export function stow(world, b, i) {
  const it = room(b), o = it.furniture[i]; if (!o) return false;
  it.furniture.splice(i, 1); it.stash[o.id] = (it.stash[o.id] || 0) + 1; world.emit?.("furniture", { b }); return true;
}
/** 알아서 놓기: 벽 쪽부터 빈 자리를 찾아 놓음(못 놓으면 창고에 둠). 놓았으면 true */
export function autoPlace(world, b, id) {
  const it = room(b), spots = [];
  for (let rot = 0; rot < 4; rot++) for (let z = 0; z < it.d; z++) for (let x = 0; x < it.w; x++) {
    const s = size(id, rot), wall = Math.min(z, x, it.w - (x + s.w)) ;                // 뒷벽(z=0)·옆벽에 가까울수록 먼저
    spots.push([wall * 10 + z + x * 0.1 + rot * 0.01, x, z, rot]);
  }
  spots.sort((a, b2) => a[0] - b2[0]);
  for (const [, x, z, rot] of spots) if (fits(b, id, x, z, rot)) { it.furniture.push({ id, x, z, rot }); world.emit?.("furniture", { b }); return true; }
  return false;
}
/** 집 아늑함: 놓인 가구 comfort 합 */
export const comfort = b => room(b).furniture.reduce((s, o) => s + (FURNITURE[o.id]?.comfort || 0), 0);
/** 집에 있는(놓였거나 창고) 가구 종류 */
export const owns = (b, id) => room(b).furniture.some(o => o.id === id) || (room(b).stash[id] || 0) > 0;
/** 갈매미가 다음에 사고 싶은 가구(없는 것 중 이 순서대로) */
export const WANT_ORDER = ["bed", "chair", "table", "plant", "rug", "floorLamp", "bookshelf", "sofa", "wardrobe", "oven"];
export function nextWant(b) { return WANT_ORDER.find(id => !owns(b, id)) || null; }
/** 집에 들어온 갈매미가 쓸 가구: 졸리면 침대, 아니면 앉을 것·책장 중 하나 */
export function pickUse(b, sleepy, rnd = Math.random) {
  const list = room(b).furniture.filter(o => FURNITURE[o.id].use);
  const beds = list.filter(o => FURNITURE[o.id].use === "sleep");
  if (sleepy && beds.length) return beds[0];
  const other = list.filter(o => FURNITURE[o.id].use !== "sleep"); const pool = other.length ? other : list;
  return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
}
