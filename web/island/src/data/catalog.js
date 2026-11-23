// 카탈로그: 건물·가구·해안 모듈 종류와 바닥 색.
// asset: .glb / .fbx 경로(web/island 기준 상대 경로). 있으면 그 모델을 쓰고(바닥 정중앙에 맞추고 footprint 크기
//        (칸 = 1 m)에 맞게 줄이거나 늘림, render/assets.js), null이거나 못 불러오면 placeholder대로 임시 도형을 만든다.
//        Tripo3D 에셋이 생기면 이 경로만 바꾸면 된다.
// 건물 모델: Kenney City Kit (Suburban) 2.0, CC0 (assets/suburban/License.txt). 이 모델들의 정문(차양·화단)은 −z 쪽이라
// modelYaw: π로 돌려 섬 규칙(문 = +z 쪽)에 맞춘다.
// roof: 지붕 초록색만 바꿀 색(선형 색공간 HSV의 색상 hue 0~1, 채도 배율 sat). 덤불 같은 아래쪽 초록은 그대로(render/roofTint.js).
import { GroundType, InteractionType } from "./types.js";

const TERRACOTTA = { hue: 0.03, sat: 1.1 }, SKY = { hue: 0.57, sat: 0.75 }, KENNEY_YAW = Math.PI;

export const BUILDINGS = {
  house: {
    id: "house", name: "작은 집", footprint: { w: 2, d: 2 }, height: 1.3, asset: "assets/suburban/building-type-a.glb", roof: TERRACOTTA, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf7f2e8, roof: 0xd9774b, roof_shape: "pyramid", chimney: true }, interior: { w: 6, d: 5 },
  },
  cottage: {
    id: "cottage", name: "2층집", footprint: { w: 2, d: 2 }, height: 1.7, asset: "assets/suburban/building-type-o.glb", roof: SKY, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf7f2e8, roof: 0x9fd3e6, roof_shape: "pyramid" }, interior: { w: 6, d: 5 },
  },
  cafe: {
    id: "cafe", name: "카페", footprint: { w: 3, d: 2 }, height: 1.7, asset: "assets/suburban/building-type-d.glb", roof: SKY, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf7f2e8, roof: 0x9fd3e6, roof_shape: "flat", awning: 0xf2a49a }, interior: { w: 8, d: 6 },
  },
  shop: {
    id: "shop", name: "잡화점", footprint: { w: 3, d: 2 }, height: 1.7, asset: "assets/suburban/building-type-b.glb", roof: TERRACOTTA, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf7f2e8, roof: 0xc8643c, roof_shape: "pyramid", awning: 0x9fd3e6 }, interior: { w: 8, d: 6 },
  },
  post: {
    id: "post", name: "우체국", footprint: { w: 3, d: 3 }, height: 2.2, asset: "assets/suburban/building-type-f.glb", roof: SKY, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf3ead8, roof: 0x7fb7d9, roof_shape: "pyramid" }, interior: { w: 8, d: 7 },
  },
  manor: {
    id: "manor", name: "큰 집", footprint: { w: 4, d: 3 }, height: 2.2, asset: "assets/suburban/building-type-n.glb", roof: TERRACOTTA, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf7f2e8, roof: 0xd9774b, roof_shape: "pyramid", chimney: true }, interior: { w: 9, d: 7 },
  },
};

// 2단계(실내 꾸미기)에서 쓸 가구. interactionPoints의 x, z는 가구 중심 기준 칸 단위, facing은 유닛이 바라볼 방향.
export const FURNITURE = {
  table:     { id: "table", name: "테이블", footprint: { w: 1, d: 1 }, height: 0.45, asset: null,
               placeholder: { shape: "box", color: 0xc8955a },
               interactionPoints: [{ x: 0, z: 0.75, facing: Math.PI, type: InteractionType.Eat, activity: "커피 마시기" }] },
  chair:     { id: "chair", name: "의자", footprint: { w: 1, d: 1 }, height: 0.5, asset: null,
               placeholder: { shape: "box", color: 0xe0a46b },
               interactionPoints: [{ x: 0, z: 0, facing: 0, type: InteractionType.Sit, activity: "앉아 쉬기" }] },
  oven:      { id: "oven", name: "오븐", footprint: { w: 1, d: 1 }, height: 0.8, asset: null,
               placeholder: { shape: "box", color: 0x9aa3ab },
               interactionPoints: [{ x: 0, z: 0.75, facing: Math.PI, type: InteractionType.Work, activity: "빵 굽기" }] },
  mailbox:   { id: "mailbox", name: "우편함", footprint: { w: 1, d: 1 }, height: 0.9, asset: null,
               placeholder: { shape: "box", color: 0xd9574b },
               interactionPoints: [{ x: 0, z: 0.75, facing: Math.PI, type: InteractionType.Work, activity: "편지 정리" }] },
  bookshelf: { id: "bookshelf", name: "책장", footprint: { w: 2, d: 1 }, height: 1.2, asset: null,
               placeholder: { shape: "box", color: 0xa8774a },
               interactionPoints: [{ x: 0, z: 0.75, facing: Math.PI, type: InteractionType.Rest, activity: "책 읽기" }] },
  bed:       { id: "bed", name: "침대", footprint: { w: 1, d: 2 }, height: 0.4, asset: null,
               placeholder: { shape: "box", color: 0xf2c6c0 },
               interactionPoints: [{ x: 0, z: 0, facing: 0, type: InteractionType.Rest, activity: "낮잠" }] },
};

// 해안 경계 모듈(지시서 2-1). walkable이면 유닛이 위를 걸을 수 있고 surface가 걷는 높이(m).
export const MODULES = {
  pier:       { id: "pier", name: "나무 부두", asset: null, walkable: true, surface: 0.0 },
  breakwater: { id: "breakwater", name: "돌 방파제", asset: null, walkable: false },
  lighthouse: { id: "lighthouse", name: "등대", asset: null, walkable: false },
  // 기존 Kenney Nature Kit 모델(web/village/assets, CC0)을 쓴다. 여러 개면 모듈마다 variant 번호로 고른다.
  beachRock:  { id: "beachRock", name: "해변 바위", walkable: false,
                assets: ["../village/assets/nk/rock_smallA.glb", "../village/assets/nk/rock_smallB.glb", "../village/assets/nk/rock_smallC.glb"] },
  // 광석 바위(갈매미가 곡괭이로 캠), 낚시터 소품. Kenney Survival Kit(CC0, web/village/assets/sk)
  ore:        { id: "ore", name: "광석 바위", walkable: false, viewSize: 0.8,
                assets: ["../village/assets/sk/rock-a.glb", "../village/assets/sk/rock-b.glb", "../village/assets/sk/rock-c.glb"] },
  fishStand:  { id: "fishStand", name: "생선 건조대", walkable: false, viewSize: 1.0, assets: ["../village/assets/sk/campfire-fishing-stand.glb"] },
  bucket:     { id: "bucket", name: "양동이", walkable: false, viewSize: 0.45, assets: ["../village/assets/sk/bucket.glb"] },
  tree:       { id: "tree", name: "나무", walkable: false, viewSize: 1.7,           // 잎이 옆 칸까지 퍼져 보이게(차지는 1칸)
                assets: ["../village/assets/nk/tree_oak.glb", "../village/assets/nk/tree_default.glb", "../village/assets/nk/tree_fat.glb",
                         "../village/assets/nk/tree_pineRoundA.glb", "../village/assets/nk/tree_detailed.glb"] },
};

// 바닥 색(두 색을 칸마다 번갈아 칠함)과 이름. asset: 오토타일 조각 모델을 쓸 때 경로(1단계는 도형으로 그림).
export const GROUND_STYLE = {
  [GroundType.Grass]:    { label: "잔디",     colors: [0xa5d07e, 0x9ac874] },
  [GroundType.Cobble]:   { label: "돌길",     colors: [0xc4beb5, 0xb7b1a8] },
  [GroundType.WoodDeck]: { label: "나무 데크", colors: [0xcf9d63, 0xc19058] },
  [GroundType.Dirt]:     { label: "흙길",     colors: [0xcfa57a, 0xc69c71] },
  [GroundType.Sand]:     { label: "모래",     colors: [0xeedfb2, 0xe8d8a8] },
};

// 갈매미 8종(web/village/models/chars.json의 이름). 1단계는 캡슐 도형, scale은 몸 크기.
export const UNITS = [
  { name: "기본", scale: 1.0 }, { name: "미니", scale: 0.6 }, { name: "자이언트", scale: 1.35 }, { name: "꽃", scale: 1.0 },
  { name: "황금", scale: 1.0 }, { name: "물방울", scale: 0.9 }, { name: "불씨", scale: 0.95 }, { name: "그림자", scale: 1.0 },
];

// 그루터기(벤 나무 자리)와 손에 드는 도구 모델
export const PROPS = {
  stump: "../village/assets/nk/stump_round.glb",
  axe: "../village/assets/sk/tool-axe.glb", pickaxe: "../village/assets/sk/tool-pickaxe.glb", hammer: "../village/assets/sk/tool-hammer.glb",
};

// 성격: 할 일이 없을 때 각 활동을 고르는 비중(web/village와 같은 값 + 건물 들어가기 enter).
// timid: 큰 갈매미(자이언트)가 가까이 오면 도망. loner: 쉬는데 누가 가까이 오면 자리를 피함.
export const PERSONA = {
  "기본":    { rest: 3, wander: 3, forage: 2, visit: 3, zoomies: 1, chop: 3, mine: 1, fish: 2, build: 4, enter: 2 },
  "미니":    { rest: 2, wander: 3, forage: 5, visit: 2, zoomies: 2, chop: 0, mine: 0, fish: 4, build: 1, enter: 2, timid: true },
  "자이언트": { rest: 4, wander: 2, forage: 1, visit: 1, zoomies: 0, chop: 5, mine: 5, fish: 1, build: 3, enter: 1 },
  "꽃":      { rest: 5, wander: 3, forage: 4, visit: 2, zoomies: 1, chop: 0, mine: 0, fish: 4, build: 1, enter: 3 },
  "황금":    { rest: 3, wander: 3, forage: 2, visit: 2, zoomies: 1, chop: 2, mine: 3, fish: 1, build: 5, enter: 2 },
  "물방울":  { rest: 1, wander: 3, forage: 2, visit: 2, zoomies: 4, chop: 1, mine: 0, fish: 5, build: 1, enter: 2 },
  "불씨":    { rest: 2, wander: 2, forage: 2, visit: 2, zoomies: 3, chop: 2, mine: 4, fish: 0, build: 2, enter: 2 },
  "그림자":  { rest: 4, wander: 4, forage: 2, visit: 0, zoomies: 0, chop: 2, mine: 4, fish: 2, build: 0, enter: 1, loner: true },
};
