// 핵심 데이터 모델(지시서 3-B, 4장). 순수 데이터: 저장(JSON)과 테스트에 그대로 쓰고, 그림은 render/가 맡는다.

/** 바닥 종류(지시서 3-B-1). 바다는 종류가 아니라 높이(SEA_LEVEL 아래)로 정한다. */
export const GroundType = Object.freeze({
  Grass: "Grass", Cobble: "Cobble", WoodDeck: "WoodDeck", Dirt: "Dirt", Sand: "Sand",
});
export const GROUND_TYPES = Object.values(GroundType);

/** 가구 상호작용 종류(지시서 4-3). */
export const InteractionType = Object.freeze({ Sit: "Sit", Eat: "Eat", Work: "Work", Rest: "Rest" });

/** 유닛 AI 상태. 1단계는 Idle·Wander·GoToBuilding·Inside까지 동작, 나머지는 2단계(실내 가구)용 자리. */
export const UnitState = Object.freeze({
  Idle: "Idle", Wander: "Wander", GoToBuilding: "GoToBuilding", Inside: "Inside",
  GoToFurniture: "GoToFurniture", Interact: "Interact",
  Held: "Held",                                   // 플레이어가 드래그로 들고 있음(AI 멈춤)
  // 마을 생활(web/village에서 옮김)
  Forage: "Forage", Eat: "Eat", Visit: "Visit", Greet: "Greet", Zoomies: "Zoomies", Flee: "Flee", Avoid: "Avoid",
  GoChop: "GoChop", Chop: "Chop", GoMine: "GoMine", Mine: "Mine", GoFish: "GoFish", Fish: "Fish", GoBuild: "GoBuild", Build: "Build",
  GoTrade: "GoTrade", Trade: "Trade", GoFarm: "GoFarm", Farm: "Farm",   // 상인·농부
});

/**
 * GridCell — 섬 격자 한 칸.
 * @typedef {{ groundType: string, occupiedId: string|null, elevation: number }} GridCell
 */
export function createCell(groundType = GroundType.Grass, elevation = 0) {
  return { groundType, occupiedId: null, elevation };
}

/**
 * BuildingDef — 건물 종류(카탈로그, data/catalog.js). 크기는 칸 수(정수), 피벗은 바닥 정중앙.
 * @typedef {{ id: string, name: string, footprint: {w:number,d:number}, height: number,
 *   asset: string|null, placeholder: object, interior: {w:number,d:number} }} BuildingDef
 *
 * BuildingData — 섬에 지어진 건물 하나(저장되는 상태).
 * x, z: 차지한 칸 묶음의 왼쪽 위(최소) 칸. rot: 90° 단위 회전 0~3. door: 문 앞 칸(들어가는 자리, 비워 둠).
 * interior: 실내 방 쉘 상태(바닥재·벽지·가구). occupants: 지금 안에 있는 유닛 id.
 * @typedef {{ id: string, defId: string, x: number, z: number, rot: number,
 *   cells: number[][], door: {x:number,z:number},
 *   interior: { w:number, d:number, floor:string, wallpaper:string, furniture: FurnitureData[] },
 *   occupants: string[] }} BuildingData
 */
export function createBuildingData(id, def, x, z, rot, cells, door) {
  return {
    id, defId: def.id, x, z, rot, cells: cells.map(c => [c[0], c[1]]), door: { ...door },
    interior: { w: def.interior.w, d: def.interior.d, floor: GroundType.WoodDeck, wallpaper: "cream", furniture: [] },
    occupants: [],
  };
}

/**
 * FurnitureDef — 가구 종류(카탈로그). interactionPoints: 가구 기준 위치(칸)·바라볼 방향(라디안)·종류·하는 일.
 * FurnitureData — 실내에 놓인 가구 하나. usedBy: 지금 쓰는 유닛 id(한 번에 하나).
 * @typedef {{ id: string, defId: string, x: number, z: number, rot: number, usedBy: string|null }} FurnitureData
 */
export function createFurnitureData(id, defId, x, z, rot = 0) {
  return { id, defId, x, z, rot, usedBy: null };
}

/**
 * UnitAIState — 갈매미 하나의 AI 상태. x, z는 격자 좌표(칸 중심 = 정수 + 0.5), y는 서 있는 높이(m).
 * path: 남은 경로 칸 목록, goal: 가려는 칸. 건물 안이면 insideBuildingId가 있고 밖에서는 보이지 않는다.
 * @typedef {{ unitId: string, name: string, state: string, x: number, z: number, y: number, heading: number,
 *   timer: number, path: number[][]|null, pathIndex: number, goal: {x:number,z:number}|null,
 *   targetBuildingId: string|null, insideBuildingId: string|null,
 *   targetFurnitureId: string|null, interaction: string|null }} UnitAIState
 */
export function createUnitAIState(unitId, name, x, z, timer = 1) {
  return {
    unitId, name, state: UnitState.Idle, x, z, y: 0, heading: 0, timer,
    path: null, pathIndex: 0, goal: null,
    targetBuildingId: null, insideBuildingId: null, targetFurnitureId: null, interaction: null,
  };
}
