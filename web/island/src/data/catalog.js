// 카탈로그: 건물·가구·해안 모듈 종류와 바닥 색.
// asset: .glb / .fbx 경로(web/island 기준 상대 경로). 있으면 그 모델을 쓰고(바닥 정중앙에 맞추고 footprint 크기
//        (칸 = 1 m)에 맞게 줄이거나 늘림, render/assets.js), null이거나 못 불러오면 placeholder대로 임시 도형을 만든다.
//        Tripo3D 에셋이 생기면 이 경로만 바꾸면 된다.
// 건물 모델: Kenney City Kit (Suburban) 2.0, CC0 (assets/suburban/License.txt). 이 모델들의 정문(차양·화단)은 −z 쪽이라
// modelYaw: π로 돌려 섬 규칙(문 = +z 쪽)에 맞춘다.
// roof: 지붕 초록색만 바꿀 색(선형 색공간 HSV의 색상 hue 0~1, 채도 배율 sat). 덤불 같은 아래쪽 초록은 그대로(render/roofTint.js).
import { GroundType, InteractionType } from "./types.js";

const TERRACOTTA = { hue: 0.03, sat: 1.1 }, SKY = { hue: 0.57, sat: 0.75 }, GOLD = { hue: 0.12, sat: 1.2 }, KENNEY_YAW = Math.PI;

// 집 크기: 갈매미(키 약 0.9 m)가 문으로 들어갈 수 있게 처음 크기의 1.5배. work = 망치질 양(처음 크기 기준 칸 수, 3번씩)
export const BUILDINGS = {
  // 계단: 낮은 칸에 놓고, 문 쪽(앞)이 입구·뒤쪽 칸이 올라갈 곳. 뒤가 0.1~1.5 m 더 높아야 함. 다 지으면 앞뒤로만 오르내림.
  stairs: {
    id: "stairs", builtBy: "builder", cost: { wood: 1 }, tier: 1, name: "계단", footprint: { w: 1, d: 1 }, height: 0.6, asset: null, stairs: true, prop: "assets/props/stairs_stone.glb", liteProp: "assets/props/stairs_stone_lite.glb",   // 돌계단 모델(사용자 제공)
    placeholder: { wall: 0xc9c2b4, roof: 0xc9c2b4, roof_shape: "flat" }, interior: { w: 1, d: 1 },
  },
  house: {
    id: "house", builtBy: "builder", house: true, price: 30, cost: { wood: 1 }, tier: 1, name: "작은 집", footprint: { w: 3, d: 3 }, work: 4, height: 1.95, asset: "assets/suburban/building-type-a.glb", roof: TERRACOTTA, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf7f2e8, roof: 0xd9774b, roof_shape: "pyramid", chimney: true }, interior: { w: 6, d: 5 },
  },
  cottage: {
    id: "cottage", builtBy: "builder", house: true, price: 50, cost: { wood: 1, stone: 1 }, tier: 1, name: "2층집", footprint: { w: 3, d: 3 }, work: 4, height: 2.55, asset: "assets/suburban/building-type-o.glb", roof: SKY, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf7f2e8, roof: 0x9fd3e6, roof_shape: "pyramid" }, interior: { w: 6, d: 5 },
  },
  cafe: {
    id: "cafe", builtBy: "carpenter", rank: 1, cost: { wood: 2, stone: 1 }, tier: 1, name: "카페", footprint: { w: 5, d: 3 }, work: 6, height: 2.55, asset: "assets/suburban/building-type-d.glb", roof: SKY, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf7f2e8, roof: 0x9fd3e6, roof_shape: "flat", awning: 0xf2a49a }, interior: { w: 8, d: 6 },
  },
  shop: {
    id: "shop", builtBy: "carpenter", rank: 2, cost: { wood: 2, stone: 2 }, tier: 1, name: "잡화점", footprint: { w: 5, d: 3 }, work: 6, height: 2.55, asset: "assets/suburban/building-type-b.glb", roof: TERRACOTTA, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf7f2e8, roof: 0xc8643c, roof_shape: "pyramid", awning: 0x9fd3e6 }, interior: { w: 8, d: 6 },
  },
  post: {
    id: "post", builtBy: "carpenter", rank: 2, cost: { wood: 2, stone: 2, iron: 1 }, tier: 1, name: "우체국", footprint: { w: 5, d: 5 }, work: 9, height: 3.3, asset: "assets/suburban/building-type-f.glb", roof: SKY, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf3ead8, roof: 0x7fb7d9, roof_shape: "pyramid" }, interior: { w: 8, d: 7 },
  },
  // 자이언트 전용 집: 몸이 커서(키 약 1.4 m) 일반 집에는 못 들어가고 이 집에만 들어감. 다른 갈매미는 못 들어감.
  giantHouse: {
    id: "giantHouse", builtBy: "builder", house: true, price: 40, cost: { wood: 2 }, tier: 1, name: "자이언트의 집", footprint: { w: 5, d: 5 }, work: 6, forUnit: "자이언트", height: 3.0, asset: "assets/suburban/building-type-a.glb", roof: SKY, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xefe6d2, roof: 0x9fd3e6, roof_shape: "pyramid", chimney: true }, interior: { w: 8, d: 8 },
  },
  // 공식은행: 섬 가운데에 처음부터 있음(짓거나 철거 못 함). 갈매미가 물건을 팔면 새 돈을 찍어 주고, 산 물건은 은행 창고(마을 자재)로.
  bank: {
    id: "bank", menu: false, fixed: true, bank: true, tier: 1, name: "공식은행", footprint: { w: 5, d: 4 }, work: 6, height: 3.0, asset: "assets/suburban/building-type-f.glb", roof: GOLD, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf6efdc, roof: 0xe0b84a, roof_shape: "pyramid" }, interior: { w: 8, d: 6 },
  },
  // 목수가 짓는 시설
  market: {
    id: "market", builtBy: "carpenter", market: true, cost: { wood: 1, stone: 1 }, tier: 1, name: "시장", footprint: { w: 4, d: 3 }, work: 6, height: 2.4, asset: "assets/suburban/building-type-b.glb", roof: TERRACOTTA, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf7f2e8, roof: 0xc8643c, roof_shape: "flat", awning: 0x9fd3e6 }, interior: { w: 6, d: 5 },
  },
  field: {
    id: "field", builtBy: "carpenter", field: true, cost: { wood: 1 }, tier: 1, name: "밭", footprint: { w: 3, d: 2 }, work: 2, height: 0.2, asset: null, prop: "assets/props/field_plot.glb",   // 칸마다 밭 틀(사용자 제공)
    placeholder: { wall: 0x8a6a45, roof: 0x8a6a45, roof_shape: "flat" }, interior: { w: 1, d: 1 },
  },
  dock: {
    id: "dock", builtBy: "carpenter", dock: true, cost: { wood: 1 }, tier: 1, name: "낚시터", footprint: { w: 1, d: 1 }, work: 1, height: 0.3, asset: null,
    placeholder: { wall: 0xb08050, roof: 0xb08050, roof_shape: "flat" }, interior: { w: 1, d: 1 },
  },
  // 가로등(장식): 밤에 유리가 빛나고 둘레를 밝힘. 마을 등급 점수(장식)에 들어감
  streetlamp: {
    id: "streetlamp", builtBy: "builder", deco: true, cost: { wood: 1, stone: 1 }, tier: 1, name: "가로등", footprint: { w: 1, d: 1 }, work: 1, height: 2.6,
    asset: "assets/props/street_lamp.glb", liteAsset: "assets/props/street_lamp_lite.glb", fit: { w: 0.56, d: 0.56 },   // 가는 가로등(사용자 제공): 폭 0.56 m → 높이 약 2.6 m
    placeholder: { wall: 0x8a6a45, roof: 0x4a4a4a, roof_shape: "flat" }, interior: { w: 1, d: 1 },
  },
  // 다리: 물 위 1칸씩(두 번 눌러 줄로 놓기). 다 지으면 걸어서 건넘. 가까운 섬으로
  bridge: {
    id: "bridge", builtBy: "carpenter", bridge: true, cost: { wood: 1 }, tier: 1, name: "다리", footprint: { w: 1, d: 1 }, work: 1, height: 0.15, asset: null,
    placeholder: { wall: 0xb08050, roof: 0xb08050, roof_shape: "flat" }, interior: { w: 1, d: 1 },
  },
  // 선착장: 물가에(문 반대쪽이 물). 선착장이 둘 넘게 있으면 갈매미가 배를 타고 다른 섬으로 감
  pier: {
    id: "pier", builtBy: "carpenter", pier: true, cost: { wood: 2 }, tier: 1, name: "선착장", footprint: { w: 1, d: 1 }, work: 3, height: 0.3, asset: null,
    placeholder: { wall: 0xb08050, roof: 0xb08050, roof_shape: "flat" }, interior: { w: 1, d: 1 },
  },
  // 저장고(겨울 대비): 농부·어부가 남는 음식을 은행에 팔면 여기 쌓이고, 배고픈 갈매미가 사 가거나(돈이 없고 아주 배고프면 나눠 줌) 겨울을 남
  storehouse: {
    id: "storehouse", builtBy: "carpenter", storehouse: true, cost: { wood: 2, stone: 1 }, tier: 1, name: "저장고", footprint: { w: 3, d: 3 }, work: 5, height: 2.2, asset: null,
    placeholder: { wall: 0xb5794a, roof: 0x7b4b2e, roof_shape: "pyramid" }, interior: { w: 5, d: 5 },
  },
  manor: {
    id: "manor", builtBy: "builder", house: true, price: 80, rank: 3, cost: { wood: 3, stone: 2 }, tier: 1, name: "큰 집", footprint: { w: 6, d: 5 }, work: 12, height: 3.3, asset: "assets/suburban/building-type-n.glb", roof: TERRACOTTA, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf7f2e8, roof: 0xd9774b, roof_shape: "pyramid", chimney: true }, interior: { w: 9, d: 7 },
  },
};

// 실내 꾸미기 가구. footprint는 방 칸(1칸 = 1 m) 단위. price: 잡화점 값(🪙, 없으면 안 팖 = 낚시로만), comfort: 집 아늑함(마을 점수·기분),
// layer "floor": 깔개(다른 가구를 위에 놓을 수 있음), use: 갈매미가 집에 들어왔을 때 하는 일(sleep 기력 회복 2배, sit 쉬기, read 재미).
// 모델은 아직 없어 render/furniture.js가 상자·원기둥으로 만든 모양을 씀(나중에 asset을 넣으면 그 모델).
export const FURNITURE = {
  bed:       { id: "bed", name: "침대", footprint: { w: 1, d: 2 }, height: 0.5, price: 18, comfort: 4, use: "sleep", useLabel: "침대에서 낮잠", colors: [0x9a6b45, 0xf4f1ea, 0x7fb7d9] },
  chair:     { id: "chair", name: "의자", footprint: { w: 1, d: 1 }, height: 0.9, price: 6, comfort: 1, use: "sit", useLabel: "의자에 앉아 쉬기", colors: [0xc8955a] },
  table:     { id: "table", name: "테이블", footprint: { w: 1, d: 1 }, height: 0.6, price: 8, comfort: 1, colors: [0xb98352] },
  sofa:      { id: "sofa", name: "소파", footprint: { w: 2, d: 1 }, height: 0.8, price: 14, comfort: 3, use: "sit", useLabel: "소파에서 뒹굴", colors: [0xe08a6b, 0xf2c6b0] },
  bookshelf: { id: "bookshelf", name: "책장", footprint: { w: 2, d: 1 }, height: 1.5, price: 12, comfort: 2, use: "read", useLabel: "책 읽기", colors: [0xa8774a] },
  wardrobe:  { id: "wardrobe", name: "옷장", footprint: { w: 1, d: 1 }, height: 1.7, price: 12, comfort: 1, colors: [0xd8c3a5] },
  rug:       { id: "rug", name: "깔개", footprint: { w: 2, d: 2 }, height: 0.02, price: 5, comfort: 1, layer: "floor", colors: [0xd9774b, 0xf2d27a] },
  plant:     { id: "plant", name: "화분", footprint: { w: 1, d: 1 }, height: 0.9, price: 4, comfort: 1, colors: [0xc8643c, 0x5aa845] },
  floorLamp: { id: "floorLamp", name: "스탠드", footprint: { w: 1, d: 1 }, height: 1.5, price: 7, comfort: 1, colors: [0x4a4a4a, 0xfff1c9], light: true },
  oven:      { id: "oven", name: "오븐", footprint: { w: 1, d: 1 }, height: 0.9, price: 10, comfort: 1, colors: [0x9aa3ab] },
  // 낚시로만 건지는 특별 가구(ITEMS의 furniture)
  driftChair: { id: "driftChair", name: "표류목 의자", footprint: { w: 1, d: 1 }, height: 0.9, comfort: 2, use: "sit", useLabel: "표류목 의자에서 쉬기", shape: "chair", colors: [0xbfae94] },
  coralTable: { id: "coralTable", name: "산호 테이블", footprint: { w: 1, d: 1 }, height: 0.6, comfort: 3, shape: "table", colors: [0xff8f7a] },
  wreckShelf: { id: "wreckShelf", name: "난파선 책장", footprint: { w: 2, d: 1 }, height: 1.5, comfort: 4, use: "read", useLabel: "난파선 책장에서 책 읽기", shape: "bookshelf", colors: [0x5a4232] },
  shellBed:   { id: "shellBed", name: "조개 침대", footprint: { w: 1, d: 2 }, height: 0.5, comfort: 6, use: "sleep", useLabel: "조개 침대에서 낮잠", shape: "bed", colors: [0xf7c6d0, 0xfff6f0, 0xffd9e3] },
};
export const SHOP_FURNITURE = Object.values(FURNITURE).filter(f => f.price).map(f => f.id);
// 실내 바닥·벽지 색
export const FLOORS = { wood: { name: "나무", color: 0xc49a6c }, tile: { name: "타일", color: 0xe8e2d6 }, carpet: { name: "카펫", color: 0x9fb7c9 }, dark: { name: "짙은 나무", color: 0x7a5236 } };
export const WALLPAPERS = { cream: { name: "크림", color: 0xf6eedc }, mint: { name: "민트", color: 0xcfeee0 }, pink: { name: "분홍", color: 0xf7d6dc }, sky: { name: "하늘", color: 0xd3e6f5 }, wood: { name: "나무 벽", color: 0xd9b88f } };

// 해안 경계 모듈(지시서 2-1). walkable이면 유닛이 위를 걸을 수 있고 surface가 걷는 높이(m).
export const MODULES = {
  pier:       { id: "pier", name: "나무 부두", asset: null, walkable: true, surface: 0.0 },
  breakwater: { id: "breakwater", name: "돌 방파제", asset: null, walkable: false },
  lighthouse: { id: "lighthouse", name: "등대", asset: null, walkable: false },
  cave:       { id: "cave", name: "동굴", asset: null, walkable: false },          // 산기슭 동굴 입구(둘레에 광석 바위)
  // 기존 Kenney Nature Kit 모델(web/village/assets, CC0)을 쓴다. 여러 개면 모듈마다 variant 번호로 고른다.
  beachRock:  { id: "beachRock", name: "해변 바위", walkable: false,
                assets: ["../village/assets/nk/rock_smallA.glb", "../village/assets/nk/rock_smallB.glb", "../village/assets/nk/rock_smallC.glb"] },
  // 광석 바위(갈매미가 곡괭이로 캠), 낚시터 소품. Kenney Survival Kit(CC0, web/village/assets/sk)
  ore:        { id: "ore", name: "광석 바위", walkable: false, viewSize: 0.8,
                assets: ["../village/assets/sk/rock-a.glb", "../village/assets/sk/rock-b.glb", "../village/assets/sk/rock-c.glb"] },
  fishStand:  { id: "fishStand", name: "생선 건조대", walkable: false, viewSize: 1.0, assets: ["../village/assets/sk/campfire-fishing-stand.glb"] },
  stall:      { id: "stall", name: "시장 가판대", walkable: false, viewSize: 1.3, assets: ["../village/assets/sk/workbench.glb"] },
  bucket:     { id: "bucket", name: "양동이", walkable: false, viewSize: 0.45, assets: ["../village/assets/sk/bucket.glb"] },
  palm:       { id: "palm", name: "야자수", walkable: false, viewSize: 1.5,           // 바닷가 모래(나무처럼 벨 수 있음). 사용자 제공 모델
                assets: ["assets/props/palm.glb"], liteAssets: ["assets/props/palm_lite.glb"] },
  tree:       { id: "tree", name: "나무", walkable: false, viewSize: 1.7,           // 잎이 옆 칸까지 퍼져 보이게(차지는 1칸)
                assets: ["../village/assets/nk/tree_oak.glb", "../village/assets/nk/tree_default.glb", "../village/assets/nk/tree_fat.glb",
                         "../village/assets/nk/tree_pineRoundA.glb", "../village/assets/nk/tree_detailed.glb"] },
};

// 바닥 색(두 색을 칸마다 번갈아 칠함)과 이름. asset: 오토타일 조각 모델을 쓸 때 경로(1단계는 도형으로 그림).
export const GROUND_STYLE = {
  [GroundType.Grass]:    { label: "잔디",     colors: [0x9fd35b, 0x8cc44e] },
  [GroundType.Cobble]:   { label: "돌길",     colors: [0xc4beb5, 0xb7b1a8] },
  [GroundType.WoodDeck]: { label: "나무 데크", colors: [0xcf9d63, 0xc19058] },
  [GroundType.Dirt]:     { label: "흙길",     colors: [0xcfa57a, 0xc69c71] },
  [GroundType.Sand]:     { label: "모래",     colors: [0xf3e0a6, 0xecd496] },
  [GroundType.Rock]:     { label: "바위",     colors: [0xa29c92, 0x948e85] },
};

// 갈매미 8종(web/village/models/chars.json의 이름). 1단계는 캡슐 도형, scale은 몸 크기.
export const UNITS = [
  { name: "기본", scale: 1.0 }, { name: "미니", scale: 0.6 }, { name: "자이언트", scale: 1.35 }, { name: "꽃", scale: 1.0 },
  { name: "황금", scale: 1.0 }, { name: "물방울", scale: 0.9 }, { name: "불씨", scale: 0.95 }, { name: "그림자", scale: 1.0 },
  { name: "목수", scale: 1.0 },                                                   // 시설(시장·밭·낚시터)을 짓는 갈매미. 모델은 기본 갈매미를 나무색으로 물들여 씀
];

// 그루터기(벤 나무 자리)와 손에 드는 도구 모델
export const PROPS = {
  stump: "../village/assets/nk/stump_round.glb",
  axe: "../village/assets/sk/tool-axe.glb", pickaxe: "../village/assets/sk/tool-pickaxe.glb", hammer: "../village/assets/sk/tool-hammer.glb",
};

// 성격: 할 일이 없을 때 각 활동을 고르는 비중(web/village와 같은 값 + 건물 들어가기 enter).
// timid: 큰 갈매미(자이언트)가 가까이 오면 도망. loner: 쉬는데 누가 가까이 오면 자리를 피함.
export const PERSONA = {
  "기본":    { rest: 3, wander: 3, forage: 2, visit: 3, zoomies: 1, chop: 3, mine: 1, fish: 2, build: 4, enter: 2, swim: 1 },
  "목수":    { rest: 3, wander: 3, forage: 2, visit: 3, zoomies: 1, chop: 3, mine: 1, fish: 2, build: 4, enter: 2, swim: 1 },
  "미니":    { rest: 2, wander: 3, forage: 5, visit: 2, zoomies: 2, chop: 0, mine: 0, fish: 4, build: 1, enter: 2, swim: 1, timid: true },
  "자이언트": { rest: 4, wander: 2, forage: 1, visit: 1, zoomies: 0, chop: 5, mine: 5, fish: 1, build: 3, enter: 1, swim: 1 },
  "꽃":      { rest: 5, wander: 3, forage: 4, visit: 2, zoomies: 1, chop: 0, mine: 0, fish: 4, build: 1, enter: 3, swim: 2 },
  "황금":    { rest: 3, wander: 3, forage: 2, visit: 2, zoomies: 1, chop: 2, mine: 3, fish: 1, build: 5, enter: 2, swim: 1 },
  "물방울":  { rest: 1, wander: 3, forage: 2, visit: 2, zoomies: 4, chop: 1, mine: 0, fish: 5, build: 1, enter: 2, swim: 4 },
  "불씨":    { rest: 2, wander: 2, forage: 2, visit: 2, zoomies: 3, chop: 2, mine: 4, fish: 0, build: 2, enter: 2, swim: 0.5 },
  "그림자":  { rest: 4, wander: 4, forage: 2, visit: 0, zoomies: 0, chop: 2, mine: 4, fish: 2, build: 0, enter: 1, swim: 2, loner: true },
};

// ---------------------------------------------------------------- 종족(직업)·희귀도
// 희귀도가 높을수록 자기 특기의 배율(mult)이 크다. rank는 건물 등급(tier)과 비교한다.
export const RARITY = {
  common: { id: "common", name: "일반", rank: 1, mult: 1.3, color: "#7d8590" },
  rare:   { id: "rare",   name: "희귀", rank: 2, mult: 1.6, color: "#2f7fd0" },
  epic:   { id: "epic",   name: "영웅", rank: 3, mult: 2.0, color: "#9152d0" },
  legend: { id: "legend", name: "전설", rank: 4, mult: 2.5, color: "#d4900f" },
};
// 공사 속도(망치질 한 번에 오르는 진행): 희귀도마다 다름. 기본(일반)은 느리게. 다른 일(벌목량·낚시 등)의 배율 mult와는 따로
export const BUILD_SPEED = { common: 0.8, rare: 1.15, epic: 1.5, legend: 1.9 };
// skill: 이 직업이 잘하는 활동(PERSONA의 활동 이름). 그 활동을 더 자주 고르고, 할 때 배율이 붙는다.
export const JOBS = {
  builder:    { id: "builder",    name: "건축가", icon: "🔨", skill: "build", desc: "망치질 한 번이 배율만큼 진행. 희귀도 이상 등급의 건물까지 지을 수 있음" },
  miner:      { id: "miner",      name: "광부",   icon: "⛏", skill: "mine",  desc: "돌을 더 많이 캐고, 철(높은 등급 건물 재료)이 잘 나옴" },
  lumberjack: { id: "lumberjack", name: "나무꾼", icon: "🪓", skill: "chop",  desc: "도끼질을 덜 하고 나무를 더 많이 얻음" },
  fisher:     { id: "fisher",     name: "낚시꾼", icon: "🎣", skill: "fish",  desc: "잘 낚고, 희귀한 물고기·보물·가구를 더 자주 얻음" },
  merchant:   { id: "merchant",   name: "상인",   icon: "🐚", skill: "trade", desc: "가판대에서 남는 자재·보물을 팔고, 공사에 모자란 자재를 사 옴" },
  farmer:     { id: "farmer",     name: "농부",   icon: "🌾", skill: "farm",  desc: "밭에 심고 거둬 음식을 만듦" },
  carpenter:  { id: "carpenter",  name: "목수",   icon: "🪚", skill: "build", desc: "시장·밭·낚시터 같은 시설을 지음(집·계단은 건축가)" },
};
// 종족: 갈매미맨 방범대(GameMaker 프로젝트 scr_util.gml의 tribe_of, 방범대 등록증 v10 자료)의 10종족
export const TRIBES = {
  "태초": { icon: "🥚", desc: "가장 오래된 갈매미" }, "거인": { icon: "🗿", desc: "몸집이 크고 힘이 셈" },
  "수목": { icon: "🌿", desc: "풀과 나무를 닮음" },   "정령": { icon: "🔥", desc: "불·물 같은 기운을 품음" },
  "망령": { icon: "👻", desc: "그늘과 밤을 좋아함" }, "해인": { icon: "🌊", desc: "바다에 사는 갈매미" },
  "요정": { icon: "🧚", desc: "작고 재빠름" },         "야수": { icon: "🐾", desc: "거칠고 날쌤" },
  "용족": { icon: "🐉", desc: "용의 피를 이음" },       "천익": { icon: "🪽", desc: "하늘의 날개" },
};
// 지금 있는 갈매미 8마리: [종족, 직업, 희귀도]. 모두 일반 등급. 직업은 종족·이름에 어울리게(바꾸려면 여기만 고치면 됨).
//  기본(태초)=건축가: 마을의 기본을 세움 · 미니(요정)=농부: 작고 부지런, 씨앗을 좋아함 · 자이언트(거인)=나무꾼: 힘
//  꽃(수목)=농부: 풀과 나무 · 황금(천익)=상인: 황금빛, 장사 · 물방울(해인)=낚시꾼: 바다 · 불씨(정령)=광부: 불·대장간
//  그림자(망령)=광부: 어두운 땅속
export const UNIT_JOBS = {
  "기본": ["태초", "builder", "common"], "미니": ["요정", "farmer", "common"], "자이언트": ["거인", "lumberjack", "common"],
  "꽃": ["수목", "farmer", "common"], "황금": ["천익", "merchant", "common"], "물방울": ["해인", "fisher", "common"],
  "불씨": ["정령", "miner", "common"], "그림자": ["망령", "miner", "common"], "목수": ["태초", "carpenter", "rare"],   // 목수는 희귀(일반보다 빨리 지음)
};

// 물고기: 흔한 것은 음식, 희귀 이상은 보물(상인이 팔아 조개로 바꿈). weight는 기본 확률 비중.
export const FISH = [
  { id: "anchovy",  name: "멸치",     rarity: "common", weight: 34, food: 1, price: 1 },
  { id: "mackerel", name: "고등어",   rarity: "common", weight: 26, food: 2, price: 2 },
  { id: "squid",    name: "오징어",   rarity: "common", weight: 16, food: 2, price: 3 },
  { id: "flatfish", name: "광어",     rarity: "rare",   weight: 10, food: 3, price: 8 },
  { id: "octopus",  name: "문어",     rarity: "rare",   weight: 7,  food: 3, price: 10 },
  { id: "tuna",     name: "참치",     rarity: "epic",   weight: 4,  food: 5, price: 25 },
  { id: "seabream", name: "황금 도미", rarity: "epic",  weight: 2,  food: 4, price: 35 },
  { id: "whaleshark", name: "고래상어", rarity: "legend", weight: 1, food: 0, price: 120 },
  // 계절 한정(그 계절에만 잡힘). 우리나라에서 흔히 말하는 제철 바다 먹거리로 골랐음
  { id: "doddari",  name: "도다리",   rarity: "rare", weight: 7, food: 3, price: 9,  season: "spring" },
  { id: "jukkumi",  name: "주꾸미",   rarity: "rare", weight: 6, food: 2, price: 8,  season: "spring" },
  { id: "minnow",   name: "민어",     rarity: "rare", weight: 6, food: 3, price: 12, season: "summer" },
  { id: "hamo",     name: "갯장어",   rarity: "epic", weight: 3, food: 3, price: 28, season: "summer" },
  { id: "jeoneo",   name: "전어",     rarity: "rare", weight: 8, food: 2, price: 8,  season: "autumn" },
  { id: "crab",     name: "꽃게",     rarity: "rare", weight: 5, food: 3, price: 14, season: "autumn" },
  { id: "bangeo",   name: "방어",     rarity: "rare", weight: 7, food: 4, price: 14, season: "winter" },
  { id: "cod",      name: "대구",     rarity: "epic", weight: 3, food: 4, price: 30, season: "winter" },
];
// 낚시로 가끔 건지는 물건(가구는 2단계 실내 꾸미기에서 놓을 수 있게 가방에 모아 둠)
export const ITEMS = [
  { id: "bottle",  name: "유리병 편지", rarity: "common", price: 4 },
  { id: "pearl",   name: "진주",       rarity: "rare",   price: 20 },
  { id: "chair",   name: "표류목 의자", rarity: "rare",   furniture: "driftChair" },
  { id: "table",   name: "산호 테이블", rarity: "epic",   furniture: "coralTable" },
  { id: "bookshelf", name: "난파선 책장", rarity: "epic", furniture: "wreckShelf" },
  { id: "bed",     name: "조개 침대",   rarity: "legend", furniture: "shellBed" },
  // 계절 한정 물건(낚시로 건지거나 바닷가에서 주움)
  { id: "petal",   name: "벚꽃잎 책갈피", rarity: "common", price: 5,  season: "spring" },
  { id: "conch",   name: "소라 껍데기",   rarity: "common", price: 5,  season: "summer" },
  { id: "maple",   name: "단풍잎 표본",   rarity: "common", price: 5,  season: "autumn" },
  { id: "iceshell", name: "얼음 조개",    rarity: "rare",   price: 15, season: "winter" },
];
// 시장 시세(조개 🐚). 상인 희귀도 배율만큼 비싸게 팔고 싸게 산다.
export const PRICES = { wood: 1, stone: 2, iron: 6, food: 1 };
