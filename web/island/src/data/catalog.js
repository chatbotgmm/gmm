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
    id: "stairs", builtBy: "builder", cost: { wood: 1 }, tier: 1, name: "계단", footprint: { w: 1, d: 1 }, height: 0.6, asset: null, stairs: true, prop: "assets/props/stairs_stone_{T}.glb",   // 돌계단 모델(사용자 제공)
    placeholder: { wall: 0xc9c2b4, roof: 0xc9c2b4, roof_shape: "flat" }, interior: { w: 1, d: 1 },
  },
  house: {
    id: "house", builtBy: "builder", house: true, price: 30, cost: { wood: 1 }, tier: 1, name: "작은 집", footprint: { w: 3, d: 3 }, work: 4, height: 2.1, asset: "assets/props/house_{T}.glb", modelYaw: -Math.PI / 2, fit: { w: 2.3, d: 2.3 },   // 둥근 오두막(사용자 제공, 문 +x → +z). 3칸에 꽉 채우면 2층집(2.55 m)보다 높아져서(약 2.75 m) 폭 2.2 m·높이 약 2.1 m로 줄임
    placeholder: { wall: 0xf7f2e8, roof: 0xd9774b, roof_shape: "pyramid", chimney: true }, interior: { w: 6, d: 5 },
  },
  cottage: {
    id: "cottage", builtBy: "builder", house: true, residents: 2, price: 50, cost: { wood: 1, stone: 1 }, tier: 1, name: "2층집", footprint: { w: 3, d: 3 }, work: 4, height: 3.3, asset: "assets/props/cottage_{T}.glb", modelYaw: -Math.PI / 2, fit: { w: 2.7, d: 2.7 },   // 발코니·꽃 상자 2층집(사용자 제공, 문 +x → +z). 3칸에 꽉 채우면 높이 약 3.7 m로 은행(4.3 m)에 가까워져서 폭 2.5 m·높이 약 3.3 m로
    placeholder: { wall: 0xf7f2e8, roof: 0x9fd3e6, roof_shape: "pyramid" }, interior: { w: 6, d: 5 },
  },
  cafe: {
    id: "cafe", builtBy: "carpenter", lit: true, rank: 1, cost: { wood: 2, stone: 1 }, tier: 1, name: "카페", footprint: { w: 5, d: 3 }, work: 6, height: 3.0, asset: "assets/props/cafe_{T}.glb", modelYaw: -Math.PI / 2, fit: { w: 4, d: 2.55 },   // 줄무늬 차양·커피잔 카페(사용자 제공, 문 +x → +z). 비율 그대로 — 5×3칸에 꽉 채우면 높이 약 3.5 m로 2층집(3.3 m)보다 높아져서 폭 3.7 m·깊이 2.4 m·높이 약 3.0 m로(양옆 빈자리는 그대로 둠)
    placeholder: { wall: 0xf7f2e8, roof: 0x9fd3e6, roof_shape: "flat", awning: 0xf2a49a }, interior: { w: 8, d: 6 },
  },
  shop: {
    id: "shop", builtBy: "carpenter", lit: true, rank: 2, cost: { wood: 2, stone: 2 }, tier: 1, name: "잡화점", footprint: { w: 5, d: 3 }, work: 6, height: 3.0, asset: "assets/props/shop_{T}.glb", modelYaw: -Math.PI / 2, fit: { w: 4, d: 2.75 },   // 큰 나무 두짝문·날개 지붕 잡화점(사용자 제공, 문 +x → +z). 비율 그대로 — 5×3칸에 꽉 채우면 높이 약 3.3 m로 2층집과 같아져서 폭 3.7 m·깊이 2.6 m·높이 약 3.0 m로(양옆 빈자리는 그대로 둠)
    placeholder: { wall: 0xf7f2e8, roof: 0xc8643c, roof_shape: "pyramid", awning: 0x9fd3e6 }, interior: { w: 8, d: 6 },
  },
  post: {
    id: "post", builtBy: "carpenter", lit: true, rank: 2, cost: { wood: 2, stone: 2, iron: 1 }, tier: 1, name: "우체국", footprint: { w: 5, d: 5 }, work: 9, height: 5.1, asset: "assets/props/post_{T}.glb", modelYaw: -Math.PI / 2,   // 시계탑·날개 편지 우체국(사용자 제공, 문 +x → +z). 5칸에 꽉 차게 맞추면 높이 약 5.1 m
    placeholder: { wall: 0xf3ead8, roof: 0x7fb7d9, roof_shape: "pyramid" }, interior: { w: 8, d: 7 },
  },
  // 자이언트 전용 집: 몸이 커서(키 약 1.4 m) 일반 집에는 못 들어가고 이 집에만 들어감. 다른 갈매미는 못 들어감.
  giantHouse: {
    id: "giantHouse", builtBy: "builder", house: true, price: 40, cost: { wood: 2 }, tier: 1, name: "자이언트의 집", footprint: { w: 5, d: 5 }, work: 6, forUnit: "자이언트", height: 4.9, asset: "assets/props/giant_house_{T}.glb", modelYaw: -Math.PI / 2, fit: { w: 4.7, d: 4.7 },   // 둥근 지붕·금빛 날개 장식 신전(사용자 제공, 문 +x → +z). 5칸에 꽉 채우면 높이 약 5.25 m로 우체국(5.1 m)보다 높아져서 폭 4.5 m·깊이 4.0 m·높이 약 4.9 m로
    placeholder: { wall: 0xefe6d2, roof: 0x9fd3e6, roof_shape: "pyramid", chimney: true }, interior: { w: 8, d: 8 },
  },
  // 공식은행: 섬 가운데에 처음부터 있음(짓거나 철거 못 함). 갈매미가 물건을 팔면 새 돈을 찍어 주고, 산 물건은 은행 창고(마을 자재)로.
  bank: {
    id: "bank", menu: false, fixed: true, bank: true, tier: 1, name: "공식은행", footprint: { w: 5, d: 4 }, work: 6, height: 4.3, asset: "assets/props/bank_{T}.glb", modelYaw: -Math.PI / 2,   // 둥근 지붕·기둥 현관·동전 장식 은행(사용자 제공, 문 +x → +z)
    placeholder: { wall: 0xf6efdc, roof: 0xe0b84a, roof_shape: "pyramid" }, interior: { w: 8, d: 6 },
  },
  // 목수가 짓는 시설
  market: {
    id: "market", builtBy: "carpenter", market: true, cost: { wood: 1, stone: 1 }, tier: 1, name: "시장", footprint: { w: 4, d: 3 }, work: 6, height: 2.4, asset: "assets/suburban/building-type-b.glb", roof: TERRACOTTA, modelYaw: KENNEY_YAW,
    placeholder: { wall: 0xf7f2e8, roof: 0xc8643c, roof_shape: "flat", awning: 0x9fd3e6 }, interior: { w: 6, d: 5 },
  },
  field: {
    id: "field", builtBy: "carpenter", field: true, cost: { wood: 1 }, tier: 1, name: "밭", footprint: { w: 3, d: 2 }, work: 2, height: 0.2, asset: null, prop: "assets/props/field_plot_{T}.glb",   // 칸마다 밭 틀(사용자 제공)
    placeholder: { wall: 0x8a6a45, roof: 0x8a6a45, roof_shape: "flat" }, interior: { w: 1, d: 1 },
  },
  dock: {
    id: "dock", builtBy: "carpenter", dock: true, cost: { wood: 1 }, tier: 1, name: "낚시터", footprint: { w: 1, d: 1 }, work: 1, height: 0.3, asset: null,
    placeholder: { wall: 0xb08050, roof: 0xb08050, roof_shape: "flat" }, interior: { w: 1, d: 1 },
  },
  // 가로등(장식): 풍차 전기가 닿는 곳(world/power.js)에서만 밤에 유리가 빛나고 둘레를 밝힘 — 전기가 없으면 꺼진 채. 마을 등급 점수(장식)에 들어감
  streetlamp: {
    id: "streetlamp", builtBy: "builder", deco: true, note: "풍차 전기가 닿는 곳에서만 밤에 켜져요", cost: { wood: 1, stone: 1 }, tier: 1, name: "가로등", footprint: { w: 1, d: 1 }, work: 1, height: 2.6,
    asset: "assets/props/street_lamp_{T}.glb", fit: { w: 0.56, d: 0.56 },   // 가는 가로등(사용자 제공): 폭 0.56 m → 높이 약 2.6 m
    placeholder: { wall: 0x8a6a45, roof: 0x4a4a4a, roof_shape: "flat" }, interior: { w: 1, d: 1 },
  },
  // 장식(집 근처 6칸 안에 있으면 그 집 갈매미 만족도 +2씩, 최대 +10)
  bench:     { id: "bench", builtBy: "builder", deco: true, asset: "assets/props/bench_{T}.glb", modelYaw: -Math.PI / 2, fit: { w: 0.85, d: 0.85 }, cost: { wood: 1 }, tier: 1, name: "벤치", footprint: { w: 1, d: 1 }, work: 1, height: 0.6, placeholder: { wall: 0xb98352, roof: 0xb98352, roof_shape: "flat" }, interior: { w: 1, d: 1 } },
  flowerbed: { id: "flowerbed", builtBy: "builder", deco: true, cost: { wood: 1 }, tier: 1, name: "화단", footprint: { w: 1, d: 1 }, work: 1, height: 0.45, asset: "assets/props/flower_box_{T}.glb", fit: { w: 0.9, d: 0.9 }, placeholder: { wall: 0x8a6a45, roof: 0x8a6a45, roof_shape: "flat" }, interior: { w: 1, d: 1 } },
  // 분수(사용자 제공 ornate_fountain, 2×2칸에 비율 그대로 → 폭 1.90 m · 높이 1.16 m). 물은 모델에 없어 셰이더로 얹음(render/fountain.js — 웅덩이 3 · 물줄기 12 · 물방울). 모델을 못 받으면 코드 분수(decoShape)
  fountain:  { id: "fountain", builtBy: "carpenter", deco: true, decoShape: "fountain", fountainFx: true, rank: 1, cost: { stone: 3 }, tier: 1, name: "분수", footprint: { w: 2, d: 2 }, work: 4, height: 1.2, asset: "assets/props/fountain_{T}.glb", placeholder: { wall: 0xc9c2b4, roof: 0xc9c2b4, roof_shape: "flat" }, interior: { w: 1, d: 1 } },
  snowman:   { id: "snowman", builtBy: "builder", deco: true, festive: true, decoShape: "snowman", winterOnly: true, cost: {}, tier: 1, name: "눈사람", footprint: { w: 1, d: 1 }, work: 1, height: 1.0, asset: null, placeholder: { wall: 0xffffff, roof: 0xffffff, roof_shape: "flat" }, interior: { w: 1, d: 1 } },
  // 축제 장식(festive): 계절 축제의 날 광장을 꾸밈. 값싸고 건축가가 금방 지음. 눈사람도 축제 장식으로 침(world/festival.js)
  bunting:     { id: "bunting", builtBy: "builder", deco: true, festive: true, decoShape: "bunting", cost: { wood: 1 }, tier: 1, name: "깃발 줄", footprint: { w: 1, d: 1 }, work: 1, height: 1.5, asset: null, placeholder: { wall: 0xb98352, roof: 0xff6b8a, roof_shape: "flat" }, interior: { w: 1, d: 1 } },
  festLantern: { id: "festLantern", builtBy: "builder", deco: true, festive: true, decoShape: "festLantern", cost: { wood: 1 }, tier: 1, name: "축제 등불", footprint: { w: 1, d: 1 }, work: 1, height: 1.3, asset: null, placeholder: { wall: 0x8a6a45, roof: 0xffb35c, roof_shape: "flat" }, interior: { w: 1, d: 1 } },
  // 계절 장식: 지금 계절에 따라 모습이 달라짐(봄 꽃 아치 · 여름 파라솔 · 가을 호박 더미 · 겨울 눈사람)
  seasonDeco:  { id: "seasonDeco", builtBy: "builder", deco: true, festive: true, decoShape: "seasonDeco", cost: { wood: 1 }, tier: 1, name: "계절 장식", footprint: { w: 1, d: 1 }, work: 1, height: 1.3, asset: null, placeholder: { wall: 0xf2a49a, roof: 0xf2a49a, roof_shape: "flat" }, interior: { w: 1, d: 1 } },
  // 풍차 발전소: 둘레 18칸(world/power.js POWER_RANGE) 안에 전기 — 가로등·건물 등불(lit: 카페·잡화점·우체국·수족관·종합병원, 집)·집 창가 불빛이 밤에 켜지고 집 만족도 +8
  // 처음(🛖 갯마을)부터 지을 수 있음(예전 🏘 어촌부터): 목수는 둘째 갈매미(집 한 채 더 → 소환, 첫날 1분 안쪽)라 첫날 밤 전에 불을 켤 수 있음.
  // 재료 cost는 공사 한 바퀴(망치질 3번)마다 드는 몫이라 예전 나무 3·돌 2 × 공사량 6(8바퀴) = 나무 24·돌 16을 빈 창고에서 모아야 했음(세 번 나르다 지쳐 자면 15~20분)
  //  → 나무 2·돌 1 × 공사량 4(5바퀴) = 나무 10·돌 5, 한 번에 날라 시장(나무 8·돌 8)과 비슷한 품. 시장과 함께 지어도 첫날 10분 안쪽
  // 하얀 탑·남색 줄무늬 돛 풍차(사용자 제공, 문·날개 +z 그대로). 날개 4장+허브는 glb 안의 windBlades 노드(허브 중심 피벗, 로컬 z = 날개 축 — views.js가 rotation.z를 돌림).
  // 2×2칸에 비율 그대로 꽉 채우면 폭 1.90 m · 깊이 1.74 m · 높이 3.52 m(날개 끝 원 지름 2.17 m, 가장 낮은 날개 끝 1.17 m). 모델을 못 받으면 코드로 만든 풍차(windmillModel)
  windmill:  { id: "windmill", builtBy: "carpenter", power: true, note: "둘레 18칸의 가로등과 창에 불이 켜져요. 누르면 범위가 보여요", cost: { wood: 2, stone: 1 }, tier: 1, name: "풍차 발전소", footprint: { w: 2, d: 2 }, work: 4, height: 3.5, asset: "assets/props/windmill_{T}.glb", placeholder: { wall: 0xf3ead8, roof: 0xb5794a, roof_shape: "pyramid" }, interior: { w: 1, d: 1 } },
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
    id: "storehouse", builtBy: "carpenter", storehouse: true, cost: { wood: 2, stone: 1 }, tier: 1, name: "저장고", footprint: { w: 3, d: 3 }, work: 5, height: 2.6, asset: "assets/props/storehouse_{T}.glb", modelYaw: -Math.PI / 2,   // 돌집 저장고(사용자 제공)
    placeholder: { wall: 0xb5794a, roof: 0x7b4b2e, roof_shape: "pyramid" }, interior: { w: 5, d: 5 },
  },
  // 수족관: 희귀 이상 물고기를 처음 낚으면 한 마리를 기증받아 보여 줌(도감에 기증됨·크기 기록). 누구나 구경(재미가 차오름)
  aquarium: {
    // 둥근 돔·금빛 날개 지붕·청록 수조 창 수족관(사용자 제공, 문 +x → +z). 4×3칸에 비율 그대로 꽉 채우면 폭 2.80 m · 깊이 2.85 m · 높이 2.96 m(카페 3.0 m와 비슷).
    // 문이 모델 가운데라 문 칸(칸 가운데에서 오른쪽 0.5 m)에 맞춰 오른쪽으로 0.5 m 옮김(modelShift, 칸 안). 문 옆 등불 2개 + 수조 창이 밤에 빛남(lit: 풍차 전기가 닿을 때)
    id: "aquarium", builtBy: "carpenter", lit: true, rank: 2, cost: { wood: 2, stone: 2 }, tier: 1, name: "수족관", footprint: { w: 4, d: 3 }, work: 7, height: 3.0, asset: "assets/props/aquarium_{T}.glb", modelYaw: -Math.PI / 2, modelShift: 0.5,
    placeholder: { wall: 0xe6f4f7, roof: 0x4fa3c7, roof_shape: "flat", awning: 0x7fd0e0, tank: 0x3f9fd0 }, interior: { w: 7, d: 5 },
  },
  // 일반병원(id "clinic" 그대로 — 예전 저장 호환, health.js): 아픈 갈매미가 침대에서 쉼(침대 beds개 = 동시에 환자 수). 의사는 처음엔 없고, 플레이어가 마을 갈매미 하나를 당번으로 정하면(world.setDoctor) 더 빨리 나음.
  // 날개 지붕 둥근 단층 병원(사용자 제공, 문 +x → +z). 4×3칸에 비율 그대로 꽉 채우면 폭 2.89 m · 깊이 2.85 m · 높이 2.76 m(꼭대기 십자 포함, 카페·잡화점 3.0 m보다 조금 낮음).
  // upgradeTo: 다 지은 뒤 이 건물로 업그레이드할 수 있음(world.upgradeCheck·startUpgrade — 칸을 넓혀 그 자리에 새 공사장, 당번 의사는 이어받음)
  clinic: {
    id: "clinic", builtBy: "carpenter", clinic: true, beds: 3, rank: 1, upgradeTo: "hospital", cost: { wood: 2, stone: 2 }, tier: 1, name: "일반병원", footprint: { w: 4, d: 3 }, work: 7, height: 2.8, asset: "assets/props/clinic_{T}.glb", modelYaw: -Math.PI / 2,
    placeholder: { wall: 0xffffff, roof: 0xe05a5a, roof_shape: "flat", awning: 0xe05a5a }, interior: { w: 7, d: 5 },
  },
  // 종합병원: 건설 메뉴에서 바로 놓지 못하고 다 지은 일반병원을 업그레이드해서만 생김(upgradeFrom). 항구 마을(rank 2)부터, 설계비 FEE.hospital(금고), 재료는 보통 공사처럼 갈매미가 모아 와서 지음.
  // 진료 규칙은 일반병원과 같음(clinic: true) · 침대 6. 3층 날개 셋 + 가운데 돔(사용자 제공, 앞뒤 두 면에 문 — +x 면을 정문으로 → +z), 문 옆 등불 4개(밤에 빛남, 풍차 전기가 닿을 때).
  // 5×4칸(일반병원 4×3에서 옆 1줄·뒤 1줄 넓힘, 문 칸은 그대로)에 비율 그대로 꽉 채우면 폭 4.75 m · 깊이 3.43 m · 높이 3.96 m(은행 4.3 m보다 조금 낮고 일반병원의 1.43배)
  hospital: {
    id: "hospital", builtBy: "carpenter", clinic: true, beds: 6, rank: 2, upgradeFrom: "clinic", lit: true, cost: { wood: 1, stone: 1 }, tier: 1, name: "종합병원", footprint: { w: 5, d: 4 }, work: 4, height: 4.0, asset: "assets/props/hospital_{T}.glb", modelYaw: -Math.PI / 2,
    placeholder: { wall: 0xffffff, roof: 0xe05a5a, roof_shape: "pyramid", awning: 0xe05a5a }, interior: { w: 8, d: 6 },
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
  // 계절 축제 기념 가구(계절마다 하나, 축제가 끝나면 마을 가방으로. ITEMS의 fest)
  blossomPot: { id: "blossomPot", name: "벚꽃 화분", footprint: { w: 1, d: 1 }, height: 0.9, comfort: 3, shape: "plant", colors: [0xf7e3d0, 0xffb7cf] },
  waveRug:    { id: "waveRug", name: "파도 깔개", footprint: { w: 2, d: 2 }, height: 0.02, comfort: 3, layer: "floor", shape: "rug", colors: [0x4fa3c7, 0xe6f4f7] },
  mapleLamp:  { id: "mapleLamp", name: "단풍 등불", footprint: { w: 1, d: 1 }, height: 1.5, comfort: 3, shape: "floorLamp", colors: [0x7b4b2e, 0xffa04a], light: true },
  // 도장 가게 한정 가구(오늘의 부탁을 모두 들어주면 받는 도장으로 바꿈. ITEMS의 stamp)
  stampRug:   { id: "stampRug", name: "도장 무늬 깔개", footprint: { w: 2, d: 2 }, height: 0.02, comfort: 2, layer: "floor", shape: "rug", colors: [0xe0573e, 0xfff6ee] },
  duskLamp:   { id: "duskLamp", name: "노을 스탠드", footprint: { w: 1, d: 1 }, height: 1.5, comfort: 3, shape: "floorLamp", colors: [0x6a4a7a, 0xffb38a], light: true },
  mintShelf:  { id: "mintShelf", name: "민트 책장", footprint: { w: 2, d: 1 }, height: 1.5, comfort: 4, use: "read", useLabel: "민트 책장에서 책 읽기", shape: "bookshelf", colors: [0x8fd3c1] },
  starBed:    { id: "starBed", name: "별밤 침대", footprint: { w: 1, d: 2 }, height: 0.5, comfort: 6, use: "sleep", useLabel: "별밤 침대에서 낮잠", shape: "bed", colors: [0x3b3f73, 0xf4f1ea, 0x6f78c9] },
  snowSofa:   { id: "snowSofa", name: "눈꽃 소파", footprint: { w: 2, d: 1 }, height: 0.8, comfort: 4, use: "sit", useLabel: "눈꽃 소파에서 뒹굴", shape: "sofa", colors: [0xbfdcf2, 0xffffff] },
  // 물고기 금메달 기념 가구(금메달 종류 수가 4·8·12에 닿으면 하나씩. ITEMS의 medal, world/medals.js)
  scaleRug:   { id: "scaleRug", name: "금빛 비늘 깔개", footprint: { w: 2, d: 2 }, height: 0.02, comfort: 3, layer: "floor", shape: "rug", colors: [0xe2b33c, 0xfff4d6] },
  floatLamp:  { id: "floatLamp", name: "찌 모양 스탠드", footprint: { w: 1, d: 1 }, height: 1.5, comfort: 3, shape: "floorLamp", colors: [0x2f5d7a, 0xff7a5c], light: true },
  // 🗝 메인 스토리 엔딩 선물(보름의 답장을 받으면 하나, world/story.js)
  bormChair:  { id: "bormChair", name: "보름의 흔들의자", footprint: { w: 1, d: 1 }, height: 0.9, comfort: 5, use: "sit", useLabel: "흔들의자에서 바다 생각", shape: "chair", colors: [0x8a5a3a] },
  trophyShelf: { id: "trophyShelf", name: "메달 진열장", footprint: { w: 2, d: 1 }, height: 1.5, comfort: 5, use: "read", useLabel: "메달 진열장 구경하기", shape: "bookshelf", colors: [0xd9a441] },
};
// 옷(clothes.js): 갈매미가 잡화점에서 자기 돈으로 사거나(낸 돈은 금고로) 도장 가게 선물 "손뜨개 목도리"로 받음. slot: 입는 자리 · warmth: 체감 보온(°C) ·
// price: 잡화점 값(🪙) · below: 공기가 이 온도(°C) 이하일 때 입음. 우비·밀짚모자는 2단계(젖음·더위)
export const CLOTHES = {
  scarf: { id: "scarf", name: "털목도리", icon: "🧣", slot: "neck", warmth: 4, price: 6, below: 14, say: "목도리 둘러야지 🧣" },
  coat:  { id: "coat", name: "누빔 외투", icon: "🧥", slot: "body", warmth: 8, price: 14, below: 4, say: "외투 입어야지 🧥" },
};
export const CLOTHES_ORDER = ["scarf", "coat"];                                 // 잡화점에서 사는 순서
export const SHOP_FURNITURE = Object.values(FURNITURE).filter(f => f.price).map(f => f.id);
// 실내 바닥·벽지 색
export const FLOORS = { wood: { name: "나무", color: 0xc49a6c }, tile: { name: "타일", color: 0xe8e2d6 }, carpet: { name: "카펫", color: 0x9fb7c9 }, dark: { name: "짙은 나무", color: 0x7a5236 } };
export const WALLPAPERS = { cream: { name: "크림", color: 0xf6eedc }, mint: { name: "민트", color: 0xcfeee0 }, pink: { name: "분홍", color: 0xf7d6dc }, sky: { name: "하늘", color: 0xd3e6f5 }, wood: { name: "나무 벽", color: 0xd9b88f } };

// 해안 경계 모듈(지시서 2-1). walkable이면 유닛이 위를 걸을 수 있고 surface가 걷는 높이(m).
export const MODULES = {
  pier:       { id: "pier", name: "나무 부두", asset: null, walkable: true, surface: 0.0 },
  breakwater: { id: "breakwater", name: "돌 방파제", asset: null, walkable: false },
  // 등대: 날개 달린 등대(사용자 제공). model은 몸통만 바꿈(램프·빛줄기는 placeholders.js 그대로) — modelH 높이(m), 문 +z → modelYaw −π/4로 섬 안쪽(남서)을 봄,
  // lampAt = 등불 방(유리 칸) 가운데 높이, lampShape = 유리 칸을 살짝 감싸는 옆모습 [반지름, 높이]들(모두 모델 높이에 대한 비율. 유리 칸은 높이 0.775~0.905, 위로 갈수록 좁아짐)
  lighthouse: { id: "lighthouse", name: "등대", asset: null, walkable: false, model: "assets/props/lighthouse_{T}.glb", modelH: 5.5, modelYaw: -Math.PI / 4, lampAt: 0.835,
    lampShape: [[0.082, 0.776], [0.089, 0.82], [0.089, 0.845], [0.078, 0.86], [0.065, 0.88], [0.05, 0.903]] },
  cave:       { id: "cave", name: "동굴", asset: null, walkable: false },          // 산기슭 동굴 입구(둘레에 광석 바위)
  // 기존 Kenney Nature Kit 모델(web/village/assets, CC0)을 쓴다. 여러 개면 모듈마다 variant 번호로 고른다.
  beachRock:  { id: "beachRock", name: "해변 바위", walkable: false, stone: 0x8f7a64,   // stone: 모델 색을 따뜻한 돌빛 하나로(views.js)
                assets: ["../village/assets/nk/rock_smallA.glb", "../village/assets/nk/rock_smallB.glb", "../village/assets/nk/rock_smallC.glb"] },
  // 광석 바위(갈매미가 곡괭이로 캠), 낚시터 소품. Kenney Survival Kit(CC0, web/village/assets/sk)
  ore:        { id: "ore", name: "광석 바위", walkable: false, viewSize: 0.8,
                assets: ["../village/assets/sk/rock-a.glb", "../village/assets/sk/rock-b.glb", "../village/assets/sk/rock-c.glb"] },
  fishStand:  { id: "fishStand", name: "생선 건조대", walkable: false, viewSize: 1.0, assets: ["../village/assets/sk/campfire-fishing-stand.glb"] },
  stall:      { id: "stall", name: "시장 가판대", walkable: false, viewSize: 1.3, assets: ["../village/assets/sk/workbench.glb"] },
  bucket:     { id: "bucket", name: "양동이", walkable: false, viewSize: 0.45, assets: ["../village/assets/sk/bucket.glb"] },
  palm:       { id: "palm", name: "야자수", walkable: false, viewSize: 1.5,           // 바닷가 모래(나무처럼 벨 수 있음). 사용자 제공 모델
                assets: ["assets/props/palm_{T}.glb"] },
  // 나무(사용자 제공 Tripo 모델, 원본 47,208면 → 최고·높음 7,080면, 그 아래 4,034면. 텍스처는 4096/2048/1024px). 나무마다 크기·방향을 조금씩 다르게
  tree:       { id: "tree", name: "나무", walkable: false, viewSize: 1.7, vary: true,   // 잎이 옆 칸까지 퍼져 보이게(차지는 1칸)
                assets: ["assets/props/tree_{T}.glb"] },
};

// 바닥 색(두 색을 칸마다 번갈아 칠함)과 이름. asset: 오토타일 조각 모델을 쓸 때 경로(1단계는 도형으로 그림).
export const GROUND_STYLE = {
  [GroundType.Grass]:    { label: "잔디",     colors: [0x9dcd7d, 0x90c070] },   // 수채 톤 풀빛(예전 0x9fd35b·0x8cc44e보다 채도 낮게, 형광 연두 아님). 한낮 따뜻한 햇빛·ACES를 거치면 노래지므로 바탕은 조금 푸르게. 밝기 L*77.5는 길 셋보다 15 넘게 밝게 유지
  // 길 셋은 잔디(밝기 L*79)·서로와 밝기부터 다르게(색맹도 구분): 돌길 푸른 회색 L*54 · 데크 진한 밤색 L*45 · 흙길 황토 L*62(바위 L*65와는 노란기로 구분)
  [GroundType.Cobble]:   { label: "돌길",     colors: [0x74829a, 0x6b788f] },
  [GroundType.WoodDeck]: { label: "나무 데크", colors: [0x935e38, 0x875533] },
  [GroundType.Dirt]:     { label: "흙길",     colors: [0xbd8b5c, 0xb28154] },
  [GroundType.Sand]:     { label: "모래",     colors: [0xf3e0a6, 0xecd496] },
  [GroundType.Rock]:     { label: "바위",     colors: [0xb39f82, 0xa69176] },   // 따뜻한 회갈색(황토 섞인 돌빛): 잔디·모래 사이에서 아늑하게, 모래보다 어둡게
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
// likes · dislikes: 선물로 좋아하는·꺼리는 갈래(world/bond.js의 GIFT_CAT_NAME). 성격·종족에 맞춤:
//  기본(태초: 가장 오래된 갈매미)은 편지를, 목수(나무 다루는 손)와 미니·꽃(씨앗·풀)은 꽃과 잎을, 자이언트(큰 몸)는 큼직한 물고기를,
//  황금(상인)·불씨(대장간 불빛)는 반짝이는 것을, 물방울(바다)은 조개와 물고기를, 그림자(밤·혼자)는 조용히 읽을 편지와 차가운 것을 좋아함.
//  불씨는 물·얼음을, 그림자는 눈부신 것을, 작은 미니는 커다란 물고기를 꺼림.
export const PERSONA = {
  "기본":    { rest: 3, wander: 3, forage: 2, visit: 3, zoomies: 1, chop: 3, mine: 1, fish: 2, build: 4, enter: 2, swim: 1, likes: ["letter"], dislikes: ["ice"] },
  "목수":    { rest: 3, wander: 3, forage: 2, visit: 3, zoomies: 1, chop: 3, mine: 1, fish: 2, build: 4, enter: 2, swim: 1, likes: ["plant"], dislikes: ["ice"] },
  "미니":    { rest: 2, wander: 3, forage: 5, visit: 2, zoomies: 2, chop: 0, mine: 0, fish: 4, build: 1, enter: 2, swim: 1, timid: true, likes: ["plant"], dislikes: ["fish"] },
  "자이언트": { rest: 4, wander: 2, forage: 1, visit: 1, zoomies: 0, chop: 5, mine: 5, fish: 1, build: 3, enter: 1, swim: 1, likes: ["fish"], dislikes: ["letter"] },
  "꽃":      { rest: 5, wander: 3, forage: 4, visit: 2, zoomies: 1, chop: 0, mine: 0, fish: 4, build: 1, enter: 3, swim: 2, likes: ["plant"], dislikes: ["ice"] },
  "황금":    { rest: 3, wander: 3, forage: 2, visit: 2, zoomies: 1, chop: 2, mine: 3, fish: 1, build: 5, enter: 2, swim: 1, likes: ["shiny"], dislikes: ["plant"] },
  "물방울":  { rest: 1, wander: 3, forage: 2, visit: 2, zoomies: 4, chop: 1, mine: 0, fish: 5, build: 1, enter: 2, swim: 4, likes: ["sea", "fish"], dislikes: ["plant"] },
  "불씨":    { rest: 2, wander: 2, forage: 2, visit: 2, zoomies: 3, chop: 2, mine: 4, fish: 0, build: 2, enter: 2, swim: 0.5, nocturnal: true, likes: ["shiny"], dislikes: ["ice", "sea"] },
  "그림자":  { rest: 4, wander: 4, forage: 2, visit: 0, zoomies: 0, chop: 2, mine: 4, fish: 2, build: 0, enter: 1, swim: 2, loner: true, nocturnal: true, likes: ["letter", "ice"], dislikes: ["shiny"] },   // 야행성: 낮에 일하면 피로가 1.5배로 쌓임(chrono.js) → 주로 밤에 깨어 있음
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
  miner:      { id: "miner",      name: "광부",   icon: "⛏", skill: "mine",  desc: "돌을 더 많이 캐고, 높은 등급 건물에 드는 철을 잘 찾음" },
  lumberjack: { id: "lumberjack", name: "나무꾼", icon: "🪓", skill: "chop",  desc: "도끼질을 덜 하고 나무를 더 많이 얻음" },
  fisher:     { id: "fisher",     name: "낚시꾼", icon: "🎣", skill: "fish",  desc: "잘 낚고, 희귀한 물고기·보물·가구를 더 자주 얻음" },
  merchant:   { id: "merchant",   name: "상인",   icon: "💼", skill: "trade", desc: "가판대에서 남는 자재·보물을 팔고, 공사에 모자란 자재를 사 옴" },
  farmer:     { id: "farmer",     name: "농부",   icon: "🌾", skill: "farm",  desc: "밭에 심고 거둬 음식을 만듦" },
  carpenter:  { id: "carpenter",  name: "목수",   icon: "🪚", skill: "build", desc: "시장과 밭, 낚시터 같은 시설을 지음. 집과 계단은 건축가가 지음" },
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

// 물고기: 흔한 것은 음식, 희귀 이상은 보물(상인이 팔아 동전으로 바꿈). weight는 기본 확률 비중. cm: 낚일 때 크기 범위([작은, 큰] cm, 수족관 크기 기록)
export const FISH = [
  { id: "anchovy",  name: "멸치",     rarity: "common", weight: 34, food: 1, price: 1, cm: [6, 15] },
  { id: "mackerel", name: "고등어",   rarity: "common", weight: 26, food: 2, price: 2, cm: [22, 45] },
  { id: "squid",    name: "오징어",   rarity: "common", weight: 16, food: 2, price: 3, cm: [18, 40] },
  { id: "flatfish", name: "광어",     rarity: "rare",   weight: 10, food: 3, price: 8, cm: [30, 80] },
  { id: "octopus",  name: "문어",     rarity: "rare",   weight: 7,  food: 3, price: 10, cm: [30, 90] },
  { id: "tuna",     name: "참치",     rarity: "epic",   weight: 4,  food: 5, price: 25, cm: [80, 250] },
  { id: "seabream", name: "황금 도미", rarity: "epic",  weight: 2,  food: 4, price: 35, cm: [25, 70] },
  { id: "whaleshark", name: "고래상어", rarity: "legend", weight: 1, food: 0, price: 120, cm: [400, 1200] },
  // 계절 한정(그 계절에만 잡힘). 우리나라에서 흔히 말하는 제철 바다 먹거리로 골랐음
  { id: "doddari",  name: "도다리",   rarity: "rare", weight: 7, food: 3, price: 9, cm: [18, 35],  season: "spring" },
  { id: "jukkumi",  name: "주꾸미",   rarity: "rare", weight: 6, food: 2, price: 8, cm: [8, 20],  season: "spring" },
  { id: "minnow",   name: "민어",     rarity: "rare", weight: 6, food: 3, price: 12, cm: [50, 110], season: "summer" },
  { id: "hamo",     name: "갯장어",   rarity: "epic", weight: 3, food: 3, price: 28, cm: [60, 180], season: "summer" },
  { id: "jeoneo",   name: "전어",     rarity: "rare", weight: 8, food: 2, price: 8, cm: [15, 28],  season: "autumn" },
  { id: "crab",     name: "꽃게",     rarity: "rare", weight: 5, food: 3, price: 14, cm: [10, 22], season: "autumn" },
  { id: "bangeo",   name: "방어",     rarity: "rare", weight: 7, food: 4, price: 14, cm: [50, 110], season: "winter" },
  { id: "cod",      name: "대구",     rarity: "epic", weight: 3, food: 4, price: 30, cm: [45, 100], season: "winter" },
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
  // 하늘에서 온 물건(sky: 낚시로는 안 나옴. 유성우가 오는 밤에 깨어 있는 야행성 갈매미가 주움)
  { id: "stardust", name: "별조각",       rarity: "epic",   price: 30, sky: true },
  // 계절 축제 기념 가구(fest: 낚시로는 안 나옴. 그 계절 축제가 끝나면 하나 받음)
  { id: "festSpring", name: "벚꽃 화분", rarity: "epic", furniture: "blossomPot", fest: true },
  { id: "festSummer", name: "파도 깔개", rarity: "epic", furniture: "waveRug",    fest: true },
  { id: "festAutumn", name: "단풍 등불", rarity: "epic", furniture: "mapleLamp",  fest: true },
  { id: "festWinter", name: "눈꽃 소파", rarity: "epic", furniture: "snowSofa",   fest: true },
  // 도장 가게 한정 가구(stamp = 도장 값: 낚시로는 안 나옴. 📱 소원 → 도장 가게에서 도장으로 바꿈)
  { id: "stampRug",   name: "도장 무늬 깔개", rarity: "rare", furniture: "stampRug",  stamp: 1 },
  { id: "stampLamp",  name: "노을 스탠드",   rarity: "rare", furniture: "duskLamp",  stamp: 2 },
  { id: "stampShelf", name: "민트 책장",     rarity: "epic", furniture: "mintShelf", stamp: 3 },
  { id: "stampBed",   name: "별밤 침대",     rarity: "epic", furniture: "starBed",   stamp: 5 },
  // ---- 여기부터는 플레이어 몫 선물거리(gift: 낚시·바닷가 줍기로는 안 나오고 상인도 안 팖. 값 없음). 맨 뒤에 붙여 기존 낚시 결과가 그대로
  // ✨ 반짝이(sparkle: 하루 몇 번 바닷가·마을에 생기고 플레이어가 탭해서 주움 → 내 주머니). 계절은 season 대신 sparkleSeason(낚시 계절 물건과 섞이지 않게)
  { id: "shell",    name: "조개껍데기",       rarity: "common", gift: true, sparkle: "beach" },
  { id: "seaglass", name: "바다 유리",         rarity: "common", gift: true, sparkle: "beach" },
  { id: "goby",     name: "웅덩이 망둥어",     rarity: "common", gift: true, sparkle: "beach" },
  { id: "postcard", name: "바람에 날아온 엽서", rarity: "common", gift: true, sparkle: "village" },
  { id: "blossom",  name: "벚꽃 가지",         rarity: "common", gift: true, sparkle: "village", sparkleSeason: "spring" },
  { id: "clover",   name: "네잎클로버",         rarity: "common", gift: true, sparkle: "village", sparkleSeason: "summer" },
  { id: "acorn",    name: "도토리",             rarity: "common", gift: true, sparkle: "village", sparkleSeason: "autumn" },
  { id: "pinecone", name: "솔방울",             rarity: "common", gift: true, sparkle: "village", sparkleSeason: "winter" },
  { id: "icicle",   name: "고드름",             rarity: "common", gift: true, sparkle: "village", sparkleSeason: "winter" },
  // 🌙 밤 반짝이(sparkleTime: "night"): 밤(기기 시계)에만 생기고, 전기가 들어오는 가로등 둘레에 먼저 생김. 해가 뜨면 사라짐(world/sparkles.js)
  { id: "fireflyJar", name: "반딧불 병",  rarity: "common", gift: true, sparkle: "village", sparkleTime: "night" },
  { id: "starNote",   name: "별빛 쪽지",  rarity: "common", gift: true, sparkle: "village", sparkleTime: "night" },
  { id: "moonShell",  name: "달빛 조개",  rarity: "common", gift: true, sparkle: "beach",   sparkleTime: "night" },
  { id: "glowWeed",   name: "야광 해초",  rarity: "common", gift: true, sparkle: "beach",   sparkleTime: "night" },
  // 도장 선물(stampGift = 도장 값: 도장 가게에서 사는 귀한 선물. 받으면 정이 두 배). stamp 키는 쓰지 않음(STAMP_SHOP은 가구만)
  { id: "goldLetter",   name: "금박 편지지",       rarity: "epic", gift: true, stampGift: 1 },
  { id: "starBrooch",   name: "별 브로치",         rarity: "epic", gift: true, stampGift: 1 },
  { id: "bouquet",      name: "들꽃 꽃다발",       rarity: "epic", gift: true, stampGift: 1 },
  { id: "rainbowShell", name: "무지개 소라",       rarity: "epic", gift: true, stampGift: 1 },
  { id: "snowGlobe",    name: "눈꽃 스노볼",       rarity: "epic", gift: true, stampGift: 1 },
  { id: "fishTin",      name: "황금 생선 통조림",  rarity: "epic", gift: true, stampGift: 1 },
  { id: "crownCookie",  name: "갈매미 왕관 쿠키",  rarity: "epic", gift: true, stampGift: 2 },
  { id: "knitScarf",    name: "손뜨개 목도리",     rarity: "epic", gift: true, stampGift: 1, clothes: "scarf" },   // 주면 그 갈매미 옷(털목도리)이 되어 바로 둘러 줌
  // 물고기 금메달 기념 가구(medal = 필요한 금메달 종류 수: 낚시로는 안 나옴. 맨 뒤에 붙여 기존 줄 순서가 그대로)
  { id: "medalRug",   name: "금빛 비늘 깔개", rarity: "rare", furniture: "scaleRug",    medal: 4 },
  { id: "medalLamp",  name: "찌 모양 스탠드", rarity: "epic", furniture: "floatLamp",   medal: 8 },
  { id: "medalShelf", name: "메달 진열장",    rarity: "epic", furniture: "trophyShelf", medal: 12 },
  // 🗝 메인 스토리 엔딩 선물(story: 낚시·반짝이·가게로는 안 나옴. 맨 뒤에 붙여 기존 줄 순서가 그대로)
  { id: "bormChair",  name: "보름의 흔들의자", rarity: "legend", furniture: "bormChair", story: true },
  // 🌟 드문 반짝이(rareOf = 바탕 반짝이 id): 반짝이가 생길 때 낮은 확률로 이 모습이 됨(world/sparkles.js SPARKLE_RARE). sparkle 키가 없어 따로 생기지 않음.
  //  선물 갈래는 바탕 반짝이와 같음(bond.js giftDef). 맨 뒤에 붙여 기존 줄 순서가 그대로
  { id: "pinkShell",     name: "분홍 조개껍데기",   rarity: "rare", gift: true, rareOf: "shell" },
  { id: "heartGlass",    name: "하트 바다 유리",     rarity: "rare", gift: true, rareOf: "seaglass" },
  { id: "rainbowGoby",   name: "무지개 망둥어",      rarity: "rare", gift: true, rareOf: "goby" },
  { id: "farPostcard",   name: "먼 섬에서 온 엽서",  rarity: "rare", gift: true, rareOf: "postcard" },
  { id: "doubleBlossom", name: "겹벚꽃 가지",        rarity: "rare", gift: true, rareOf: "blossom" },
  { id: "fiveClover",    name: "다섯잎클로버",       rarity: "rare", gift: true, rareOf: "clover" },
  { id: "goldAcorn",     name: "황금 도토리",        rarity: "rare", gift: true, rareOf: "acorn" },
  { id: "snowCone",      name: "눈꽃 솔방울",        rarity: "rare", gift: true, rareOf: "pinecone" },
  { id: "starIcicle",    name: "별 모양 고드름",     rarity: "rare", gift: true, rareOf: "icicle" },
  { id: "blueFirefly",   name: "푸른 반딧불 병",     rarity: "rare", gift: true, rareOf: "fireflyJar", sparkleTime: "night" },
  { id: "wishNote",      name: "소원 별빛 쪽지",     rarity: "rare", gift: true, rareOf: "starNote",   sparkleTime: "night" },
  { id: "crescentShell", name: "초승달 조개",        rarity: "rare", gift: true, rareOf: "moonShell",  sparkleTime: "night" },
  { id: "rainbowWeed",   name: "무지개 야광 해초",   rarity: "rare", gift: true, rareOf: "glowWeed",   sparkleTime: "night" },
];
// 시장 시세(동전 🪙). 상인 희귀도 배율만큼 비싸게 팔고 싸게 산다.
export const PRICES = { wood: 1, stone: 2, iron: 6, food: 1 };
