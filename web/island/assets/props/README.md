# 소품 모델

사용자 방침(2026-11-24): 사용자가 보내는 소품·장식은 **면 수를 줄이지 않는다.** 텍스처는 원본(4096px)에서 그래픽 설정별로 둔다.
경로의 `{T}`가 4k(최고·높음) · 2k(보통) · 1k(낮음·성능 우선)로 바뀐다(src/render/assets.js).

| 모델 | 삼각형(모든 단계 같음) | 원본 파일 |
|---|---|---|
| aquarium (수족관) | 29,223 (+등불 2·수조 창 발광 색 마스크 512px) | underwater_dome_house_3d_model.glb (2026-11-28, 아래) |
| bank (공식은행) | 14,834 | dome_house_3d_model.glb (2026-11-25 교체, 아래) |
| bench | 9,070 | wooden_bench_3d_model.glb |
| cafe (카페) | 14,246 (+등불 발광 마스크 512px, 등불 2) | coffee_shop_3d_model.glb (2026-11-25, 아래) |
| cabbage | 9,234 | tripo_convert_037c8b53… |
| carrot | 9,910 | tripo_convert_b251bc0d… |
| clinic (일반병원) | 14,718 | 4f97629d-….glb (2026-11-26, 아래) |
| cottage (2층집) | 14,304 | 2층집.glb (2026-11-25, 아래) |
| field_plot | 9,436 | tripo_convert_1547a90d… |
| flower_box | 8,998 | flower_box_3d_model.glb |
| fountain (분수) | 28,113 (+셰이더 물: 웅덩이 1,320 · 물줄기 960 · 물방울 점 최대 144) | ornate_fountain_3d_model.glb (2026-11-28, 아래 · 원본 텍스처 8192px) |
| hospital (종합병원) | 14,162 (+등불 발광 마스크 512px, 등불 4) | 3880e5d9-….glb (2026-11-26, 아래) |
| house (작은 집) | 14,646 (+등불 발광 마스크 512px, 등불 1) | round_cottage_3d_model.glb |
| giant_house (자이언트의 집) | 14,154 | fantasy_temple_3d_model.glb (2026-11-25, 아래) |
| lighthouse (등대) | 14,788 | winged_lighthouse_3d_model.glb (2026-11-25, 아래 · 원본 텍스처 2048px) |
| palm | 9,528 | palm_tree_3d_model.glb |
| post (우체국) | 14,388 (+등불 발광 마스크 512px, 등불 1) | fantasy_house_3d_model.glb |
| shop (잡화점) | 14,420 (+등불 발광 마스크 512px, 등불 1) | fantasy_house_3d_model.glb (da8af4be…, 우체국과 다른 파일 · 2026-11-25, 아래) |
| stairs_stone | 9,850 | tripo_convert_ca8a87b0… |
| storehouse | 9,375 | stone_house_3d_model.glb |
| street_lamp | 9,561 (+발광 마스크 256px) | tripo_convert_8a67f70c… |
| windmill (풍차 발전소) | 44,733 = 몸통 33,108 + 날개 11,625 (+등불 발광 마스크 512px, 등불 1) | windmill_3d_model.glb (2026-11-28, 아래) |

만든 방법: 모양은 이전 게임용 파일(원본 모양 그대로, 노멀·금속도 텍스처 뺌) 그대로 두고, 기본색 텍스처만 원본 4096px 그림에서
4096 / 2048 / 1024px(JPEG 품질 92)로 다시 끼움. 원본을 이전 텍스처 크기로 줄여 비교한 평균 색 차이 1.2~4.5/255(같은 그림·같은 방향 확인).

## 나무(tree_4k / 2k / 1k)
원본 47,208면(4096px 텍스처 3장). 섬에 많이 깔려서 나무만 면 수를 줄임.
- tree_4k: 7,080면 · 4096px (최고·높음)
- tree_2k: 4,034면 · 2048px (보통) / tree_1k: 4,034면 · 1024px (낮음·성능 우선)
- 텍스처를 유지한 채로는 gltfpack이 약 4,020면 아래로 줄이지 못함(이음매 보존). 그래서 낮은 단계도 4,034면
- 계절 잎 색은 셰이더가 초록빛이 강한 곳만 바꿈(src/render/seasons.js patchTree)

## 우체국(post_4k / 2k / 1k, 2026-11-25)
원본 fantasy_house_3d_model.glb(14,388면, 4096px 텍스처 3장, EXT_meshopt_compression 압축). 은행·저장고와 같은 방식:
meshopt 압축을 풀어 모양(정점·면·UV·노멀 값)은 그대로 두고, 노멀·금속도 텍스처는 빼고 기본색만 4096 / 2048 / 1024px(JPEG 92)로 넣음.
압축을 푼 까닭: 게임 로더에 MeshoptDecoder가 없어도 읽히게(다른 소품 파일과 같은 형식). 정문은 원본 +x 쪽 → modelYaw −π/2.

## 은행 교체(bank_4k / 2k / 1k, 2026-11-25)
원본 dome_house_3d_model.glb(14,834면, 4096px 텍스처 3장, EXT_meshopt_compression). 기둥 현관·동전 장식 둥근 집. 우체국과 같은 방법(압축 풀기, 면 그대로, 기본색만 4096 / 2048 / 1024px JPEG 92,
metallic 0.1·roughness 0.8, KHR_mesh_quantization). 같은 파일 이름에 덮어씀(catalog 경로 그대로). 정문 +x → modelYaw −π/2.
5×4칸에 맞추면 폭 4.0 m · 깊이 3.8 m · 높이 약 4.3 m(def.height 3.6 → 4.3). ±90° 돌린 모델은 칸의 w·d를 바꿔 맞춤(render/assets.js modelFor; 전에는 폭 3.8 · 깊이 3.6 · 높이 4.1 m로 작게 맞춰졌음).
- 이전 은행(덮어쓰기 전): domed_building_3d_model.glb, 9,735면, bank_4k 2,160,744 / 2k 862,052 / 1k 478,484 bytes(커밋 47f40a9까지의 파일).

## 작은 집(house_4k / 2k / 1k, 2026-11-25)
원본 round_cottage_3d_model.glb(14,646면, 4096px 텍스처 3장, EXT_meshopt_compression). 같은 방법, 정문 +x → modelYaw −π/2. Kenney building-type-a와 지붕 색 바꾸기(roof)는 뺌
(자이언트의 집도 2026-11-25에 사용자 모델로 바뀜, 아래).
크기: 3×3칸에 꽉 채우면 높이 약 2.75 m(계산)로 2층집(2.55 m)보다 커짐 → fit 2.3칸으로 폭 2.2 m · 높이 약 2.1 m(def.height 1.95 → 2.1). 문 앞 칸은 그대로(앞벽에서 문 칸까지 약 0.45 m).

## 2층집(cottage_4k / 2k / 1k, 2026-11-25)
원본 2층집.glb(받은 파일 이름은 aa007fc2-2__.glb, 14,304면, 4096px 텍스처 3장, EXT_meshopt_compression). 발코니·꽃 상자·줄무늬 차양 2층집. 같은 방법(압축 풀기, 면 그대로,
기본색만 4096 / 2048 / 1024px JPEG 92, metallic 0.1·roughness 0.8, KHR_mesh_quantization). 정문(차양·나무 문) +x → modelYaw −π/2(rot 0~3 문 칸 확인).
Kenney building-type-o와 지붕 색 바꾸기(roof)는 뺌(파일은 assets/suburban에 그대로 있음, 쓰는 곳 없음).
크기: 원본 0.77 × 1.0 × 0.76(높이가 가장 큼). 3×3칸에 꽉 채우면 높이 약 3.7 m로 은행(4.3 m)에 가까워짐 → fit 2.7칸으로 폭 2.53 m · 깊이 2.57 m · 높이 3.32 m(def.height 2.55 → 3.3).
작은 집(2.19 × 2.11 × 2.11 m)보다 폭 1.15배 · 높이 1.57배. 방(interior 6×5, 2층 침실)은 그대로.

## 카페(cafe_4k / 2k / 1k) · 잡화점(shop_4k / 2k / 1k), 2026-11-25
카페 원본 coffee_shop_3d_model.glb(받은 파일 이름 a8270ed0-…, 14,246면), 잡화점 원본 fantasy_house_3d_model.glb(받은 파일 이름 da8af4be-…, 14,420면 — 우체국 원본과 이름만 같은 다른 파일,
큰 나무 두짝문·날개 지붕. 사용자가 잡화점으로 확인). 둘 다 4096px 텍스처 3장, EXT_meshopt_compression. 같은 방법(압축 풀기, 면 그대로,
기본색만 4096 / 2048 / 1024px JPEG 92, metallic 0.1·roughness 0.8, KHR_mesh_quantization). 정문 +x → modelYaw −π/2(rot 0~3에서 모델 +x와 문 칸 방향 내적 1 확인).
Kenney building-type-d·b와 지붕 색 바꾸기(roof)는 뺌(파일은 assets/suburban에 그대로). 칸(5×3)·문 칸·기능·방은 그대로.
크기: 비율 그대로(늘리지 않음), 칸 가운데, 양옆 빈자리는 그대로 둠. 1층 건물이라 2층집(3.32 m)보다 낮게 맞춤.
- 카페: 원본 0.65 × 0.80 × 1.0(x·높이·z). 5×3칸에 꽉 채우면 높이 약 3.5 m → fit { w: 4, d: 2.55 }로 폭 3.74 m · 깊이 2.42 m · 높이 3.00 m(def.height 2.55 → 3.0). 빈자리: 양옆 0.63 m씩, 앞뒤 0.29 m씩.
- 잡화점: 원본 0.71 × 0.82 × 1.0. 5×3칸에 꽉 채우면 높이 약 3.3 m → fit { w: 4, d: 2.75 }로 폭 3.68 m · 깊이 2.61 m · 높이 3.02 m(def.height 2.55 → 3.0). 빈자리: 양옆 0.66 m씩, 앞뒤 0.19 m씩.
  (fit의 d가 크기를 정함 — 깊이 = d × 0.95. w 4는 걸리지 않는 넉넉한 값)

## 건물 등불 발광(house · post · cafe · shop, 2026-11-25)
문 옆에 달린 등불 유리가 밤에 빛나게, 가로등(street_lamp)과 같은 방식으로 glb 안에 발광 마스크(emissiveTexture)를 넣음 — `tools/glow_mask.py`.
- 마스크: 512px 회색 PNG 한 장을 4k · 2k · 1k 세 파일에 똑같이(파일마다 +1.0~1.7 KB). 재질 이름 `lanternGlow`, emissiveFactor는 가로등과 같은 따뜻한 색,
  재질 extras.lanterns에 등불 중심·크기(빛 번짐 스프라이트 자리)
- 고른 것: 등불 중심(모델 좌표)에서 반지름 안에 있는 밝은 노란 유리 텍셀만. 금빛 지붕 장식·창틀·벽에 그려진 불빛 얼룩은 거리로 빠짐. **창문은 넣지 않음**(등불만)
- 등불 수: 작은 집 1 · 우체국 1 · 잡화점 1 · 카페 2. 2층집(cottage) · 은행(bank) · 저장고(storehouse)는 모델에 등불이 없어 그대로
- 다시 만들기(값은 등불 중심 x,y,z,반지름):
  - `python3 tools/glow_mask.py house 0.3789,-0.2874,-0.1731,0.048`
  - `python3 tools/glow_mask.py post 0.3797,-0.2963,-0.1703,0.055`
  - `python3 tools/glow_mask.py shop 0.3291,-0.1975,-0.2534,0.055`
  - `python3 tools/glow_mask.py cafe 0.2498,-0.2361,0.1053,0.03 0.2536,-0.2368,-0.1048,0.03 --pane 0.62,0.76,0.72,0.82` (카페는 옆 유리가 어두운 노랑으로 그려져 문턱을 낮춤)
- 그리기: src/render/daylight.js `lantern()` — 세기는 가로등과 같이 0.15 + 2.2 × 밤(낮에는 거의 안 보이고 밤에 빛남), 풍차 전기가 닿는 건물만 켜짐(world/power.js — 가로등도 같음), 짓는 중에는 꺼짐.
  실제 빛은 쓰지 않고 등불마다 더하기 색 스프라이트 하나. 건물마다 따로 켜고 끄게 재질만 복사(src/render/assets.js, 텍스처는 같이 씀)
## 자이언트의 집(giant_house_4k / 2k / 1k) · 등대(lighthouse_4k / 2k / 1k), 2026-11-25
자이언트의 집 원본 fantasy_temple_3d_model.glb(받은 파일 이름 72ed68a9-…, 14,154면, 4096px 텍스처 3장, EXT_meshopt_compression) — 둥근 지붕·금빛 날개 장식·기둥 현관 신전(사용자가 자이언트의 집으로 정함).
등대 원본 winged_lighthouse_3d_model.glb(받은 파일 이름 4593947a-…, 14,788면, **2048px** 텍스처 3장, 압축 없음·정점 값 float 그대로).
같은 방법(면 그대로, 기본색만 JPEG 92, metallic 0.1·roughness 0.8, 노멀·금속도 텍스처 뺌). 등대는 원본이 2048px이라 키우지 않음 — lighthouse_4k와 2k는 같은 2048px 그림, 1k만 1024px.
- 자이언트의 집: 정문 +x → modelYaw −π/2(rot 0~3에서 모델 +x와 문 칸 방향 내적 1 확인). Kenney building-type-a와 지붕 색 바꾸기(roof)는 뺌. 원본 0.81 × 1.0 × 0.90(x·높이·z).
  5×5칸에 꽉 채우면 높이 약 5.25 m로 우체국(5.1 m)보다 높아짐 → fit 4.7칸으로 폭 4.46 m · 깊이 4.02 m · 높이 4.94 m(def.height 3.0 → 4.9). 2층집(3.32 m)의 1.5배, 은행(4.3 m)보다 높고 우체국보다 낮음.
  이전(Kenney): 폭 4.75 · 깊이 3.76 · 높이 3.05 m. 자이언트(키 1.37 m)가 문 앞에 서면 문 높이와 비슷함. 방(interior 8×8)·문 칸·기능은 그대로.
- 등대: 건물이 아니라 해안 모듈(MODULES.lighthouse, 2×2칸, 못 지나감 그대로). 임시 등대(placeholders.js)의 몸통(lighthouseBody)만 모델로 바꾸고 램프(lighthouseLamp)·빛줄기(lighthouseBeam)는 이름 그대로 둠(render/views.js lighthouseModel) — 밤 불빛은 daylight.js가 그대로 켬.
  높이 modelH 5.5 m(이전 임시 등대 4.2 m · 우체국 5.1 m보다 높음 — 섬에서 가장 높은 건물). 탑 밑동 지름 약 2.06 m(2×2칸), 문 앞 턱까지 반지름 1.12 m, 날개 폭 2.58 m(공중).
  문은 원본 +z → modelYaw −π/4로 섬 가운데(남서)를 봄(문 방향과 등대→섬 가운데 방향 내적 1.00). 이전 등대는 둥근 탑이라 방향이 없었음.
  등불 방(유리 칸): 모델 높이의 0.776~0.903. 램프·빛줄기 높이 lampAt 0.835 × 5.5 = 4.59 m(받침에서. 월드 y 4.44, 이전 3.35). 램프는 유리 칸을 살짝 감싸는 빛 껍질(lampShape, 더하기 색 · 발광 세기 낮 0.9 → 밤 4.4).
  모델을 못 받으면 임시 등대(빨강·하양 줄무늬) 그대로 보임.

## 일반병원(clinic_4k / 2k / 1k) · 종합병원(hospital_4k / 2k / 1k), 2026-11-26
사용자 결정: 병원은 등급별로 — 기본은 일반병원(id `clinic` 그대로, 예전 저장 호환), 다 지은 일반병원을 업그레이드하면 종합병원(world.startUpgrade, 항구 마을부터).
일반병원 원본(받은 파일 이름 4f97629d-….glb, 14,718면) — 날개 지붕 둥근 단층 + 줄무늬 차양 문 + 꼭대기 빨간 십자. 종합병원 원본(받은 파일 이름 3880e5d9-….glb, 14,162면) — 3층 날개 셋 + 가운데 돔 + 빨간 십자.
둘 다 gltfpack 1.2, EXT_meshopt_compression + KHR_mesh_quantization, 4096px 텍스처 3장(기본색 JPEG · 금속도 JPEG · 노멀 PNG). 같은 방법(압축 풀기, 면 그대로,
기본색만 4096 / 2048 / 1024px JPEG 92, metallic 0.1·roughness 0.8, KHR_mesh_quantization). 꼭대기 십자가 모델에 있어 따로 붙이는 십자 판은 없음. Kenney building-type-d(빨갛게 물들인 카페)와 지붕 색 바꾸기(roof)는 뺌.
- 파일: clinic_4k 1,878,960 / 2k 778,924 / 1k 489,988 bytes · hospital_4k 2,430,284 / 2k 1,043,220 / 1k 612,844 bytes(등불 마스크 포함)
- 일반병원: 정문(차양·나무 문) +x → modelYaw −π/2(rot 0~3에서 문이 문 칸 쪽 확인). 4×3칸에 비율 그대로 꽉 채움(fit 없음) → 폭 2.88 m · 깊이 2.85 m · 높이 2.76 m(십자 포함, def.height 2.55 → 2.8).
  카페(3.00 m)·잡화점(3.02 m)보다 조금 낮은 단층. 양옆 빈자리 0.56 m씩.
- 종합병원: 앞뒤(+x·−x) 두 면에 같은 계단 문이 있어 +x 면을 정문으로 → modelYaw −π/2(rot 0~3 확인). 5×4칸(일반병원 칸에서 옆 1줄·뒤 1줄 넓힘, 문 칸 그대로)에 비율 그대로 →
  폭 4.75 m · 깊이 3.43 m · 높이 3.96 m(def.height 4.0). 은행(4.3 m)보다 조금 낮고 일반병원의 1.43배. (원본 accessor의 min/max는 x 0.672라고 적혀 있지만 실제 정점은 0.722 — 게임은 실제 정점으로 맞춤)
- 등불: 종합병원에만 문 옆 금빛 등불 4개(앞뒤 두 문 × 2) → 발광 마스크(`python3 tools/glow_mask.py hospital 0.2838,-0.2877,0.101,0.03 0.2852,-0.2852,-0.1009,0.03 -0.2846,-0.2874,-0.101,0.03 -0.2856,-0.285,0.1009,0.03`,
  밝은 텍셀 28개, 마스크 PNG 669 bytes) · catalog `lit: true`(풍차 전기가 닿을 때만 밤에 켜짐). 일반병원은 등불이 없어 그대로

## 풍차 발전소(windmill_4k / 2k / 1k) · 수족관(aquarium_4k / 2k / 1k), 2026-11-28
사용자가 컨셉 그림으로 만든 Tripo 모델 두 개. 같은 방법(면 그대로, 기본색만 4096 / 2048 / 1024px JPEG 92, metallic 0.1·roughness 0.8, KHR_mesh_quantization —
위치 float · 노멀 int8 · UV float · 인덱스 u16, 노멀·금속도 텍스처 없음·doubleSided 뺌). 만든 스크립트: `tools/import_windmill_aquarium.py`(수족관은 meshopt를 먼저 풀어 넣음) → 그다음 glow_mask.py.
- 파일: windmill_4k 4,153,056 / 2k 2,358,868 / 1k 1,707,824 bytes · aquarium_4k 3,425,024 / 2k 1,787,528 / 1k 1,269,452 bytes(발광 마스크 포함)
- 풍차: 원본 windmill_3d_model.glb(받은 파일 393b8a1c-…, 압축 없음, 메시 54개 tripo_part_0~53 · 텍스처 1장 4096px, 44,733면 · 44,155 정점). 바닥판 없음(가장 넓은 조각 part_12도 탑 몸통).
  - 메시 둘로 합침: 몸통(windmillBody, 재질 lanternGlow — 등불) + 날개(**windBlades** 노드, 재질 windBladesMat — 등불 빛 번짐이 날개를 따라 돌지 않게 재질을 나눔).
  - 날개 조각(조각마다 중심·각도를 재서 고름): part 1(날개 틀 4개 + 오른쪽 아래 돛) · 8 · 9 · 10(돛 3장) · 11(허브) · 25 · 30 · 31 · 32 · 33 · 38 · 39 · 40(안쪽 금빛 마개 8) ·
    34 · 35 · 36 · 37 · 41 · 42 · 43 · 44(바깥 끝 마개 8) · 53(작은 조각). 허브 뒤 굴대(part 49)는 몸통 속이라 몸통에 둠.
  - 피벗 = 허브 중심(0.0005, 0.6560, 0.2252 — 바깥·안쪽 마개 16개가 놓인 원의 중심). 축 = 마개 16개가 놓인 면의 법선(+z에서 0.3° 기욺) → 노드 rotation으로 로컬 z를 이 축에 맞춤.
    views.js가 `rotation.z += dt × 1.6`(로컬 z, 앞에서 보아 반시계)으로 돌리니 허브를 중심으로 흔들림 없이 돎(0.6 rad 돌린 그림에서 허브 자리 그대로 확인).
  - 문·날개 모두 원본 +z → modelYaw 없음(0). 2×2칸에 비율 그대로 꽉 채움(fit 없음) → 폭 1.90 m · 깊이 1.74 m · 높이 3.52 m(def.height 4.2 → 3.5, 이전 코드 풍차는 몸통 3.9 m + 날개),
    날개 끝 원 지름 2.17 m(옆으로 0.09 m씩 칸 밖 공중), 가장 낮은 날개 끝 1.17 m. 문은 탑 가운데라 문 칸(오른쪽 칸 앞)보다 0.5 m 왼쪽(탑 폭이 칸에 꽉 차 옮기지 않음).
  - 등불: 문 오른쪽 등불 유리가 연노랑으로 그려져 문턱을 낮춤 — `python3 tools/glow_mask.py windmill 0.1421,0.1737,0.2062,0.035 --pane 0.85,0.95,0.82,0.88`.
    풍차는 다 지으면 제 전기로 켜짐(lit 표시 없음 — 「불 켜진 건물」 수·전기 없음 배지에 들지 않음, 전기 범위 규칙은 그대로).
  - 모델을 못 받으면 예전처럼 코드로 만든 풍차(views.js windmillModel)를 씀.
- 수족관: 원본 underwater_dome_house_3d_model.glb(받은 파일 24c9c1e0-…, gltfpack 1.2, EXT_meshopt_compression + KHR_mesh_quantization, 29,223면 · 29,844 정점, 기본색 4096px 1장).
  meshopt 압축만 풂(노멀 바이트 그대로). 둥근 돔 · 금빛 날개 지붕 · 조개 왕관 · 줄무늬 차양 문 · 청록 수조 창(앞 두 칸 + 옆).
  - 정문(차양·나무 문, 문 옆 등불 2) 원본 +x → modelYaw −π/2. 4×3칸에 비율 그대로 꽉 채움(fit 없음) → 폭 2.80 m · 깊이 2.85 m · 높이 2.96 m(def.height 2.4 → 3.0, 카페 3.0 m와 같은 키).
  - 문은 모델 가운데(두 등불 사이 z ≈ 0)인데 4칸 건물의 문 칸은 가운데에서 오른쪽 0.5 m → 새 값 `modelShift: 0.5`로 모델을 오른쪽으로 0.5 m 옮겨 문이 문 칸 앞에 옴
    (render/views.js buildingModel, 칸 안: 왼쪽 빈자리 1.1 m · 오른쪽 0.1 m). 컨셉 그림처럼 문 왼쪽엔 차양 끝, 오른쪽엔 수조 창이 보임. 방(interior 7×5)은 그대로.
  - 발광: 등불 2 + 수조 창. 수조 유리는 노란 등불과 색이 달라 glow_mask.py에 `--tanks k[,ymax]`를 더함 — 청록 텍셀(모델이 쓰는 텍셀 중 높이 ymax 아래)이 제 색 × k로 빛남,
    마스크는 색 PNG(등불 텍셀에 따뜻한 색), emissiveFactor [1, 1, 1].
    `python3 tools/glow_mask.py aquarium 0.3724,-0.2714,0.1668,0.04 0.3714,-0.2942,-0.1675,0.04 --tanks 0.45,-0.1` (마스크 PNG 57,168 bytes — 수조 면이 넓어 다른 등불 마스크보다 큼).
    세기는 다른 건물 등불과 같음(daylight.js lantern(): 낮 0.15 → 밤 2.35) → 낮에는 수조가 조금 더 맑아 보이는 정도, 밤에 물빛으로 빛남. catalog `lit: true`(풍차 전기가 닿을 때만 켜짐, 범위 밖이면 「전기 없음」 배지).
- 갤러리 사진: `node tools/thumbs.cjs windmill aquarium`(assets/thumbs/windmill.webp 3,540 · aquarium.webp 3,928 bytes)


## 분수(fountain_4k / 2k / 1k), 2026-11-28
사용자가 컨셉 그림으로 만든 Tripo 모델 ornate_fountain_3d_model.glb(gltfpack, EXT_meshopt_compression + KHR_mesh_quantization, 메시 1개, 28,113면 · 27,386 정점, 기본색 **8192px** 1장).
둥근 흰 물받이(모서리 돌 4) · 남색·금색 띠 두 단 · 꼭대기 금빛 날개 보석. **물은 모델에 없음**(웅덩이 바닥이 회색 돌, 물구멍도 없음) → 물은 셰이더로 얹음(아래).
- 만든 방법: `node tools/demopt.mjs 원본.glb 푼.glb`(meshopt 풀기, meshoptimizer npm 필요) → `python3 tools/import_prop.py fountain 푼.glb assets/props`
  (한 메시 소품 일반 도구: 면 그대로, 기본색만 4096 / 2048 / 1024px JPEG 92 — 원본 8192px를 줄임, metallic 0.1·roughness 0.8, KHR_mesh_quantization, 노멀 바이트 그대로, doubleSided 뺌)
- 파일: fountain_4k 2,586,120 / 2k 1,487,000 / 1k 1,071,380 bytes
- 크기: 원본 1.0 × 0.613 × 1.0(x·높이·z). 2×2칸에 비율 그대로 꽉 채움(fit 없음) → 폭 1.90 m · 높이 1.16 m(def.height 1.2 그대로). 물받이 테 0.32 m, 컨셉과 같은 납작한 비율. 날개는 ±x로 펼침, 방향 없음(modelYaw 0)
- 물(src/render/fountain.js, 모델 wrap 안에 원본 좌표로 붙음 — views.js buildingModel, catalog `fountainFx: true`). 물 높이는 모델 면을 위→아래 광선으로 재서 정함:
  - 큰 물받이: 바닥 −0.167 · 테 위 −0.14 → 수면 −0.150(반지름 0.372, 테 속까지) / 가운데 단: 바닥 −0.094 · 테 −0.071 → −0.081(0.178) / 위 단: 바닥 0.038 · 테 0.06 → 0.051(0.122) (원본 좌표, ×1.9 = m)
  - 웅덩이 셰이더: 잔물결(잡음 기울기로 면 방향) · 가운데서 퍼지는 물결 · 물 떨어지는 4곳의 동그라미 물결과 흰 거품 · 물빛 그물(가벼운 물 설정에선 뺌) · 프레넬 하늘빛 · 해 반짝임 · 반투명.
    색은 바다(water.js)의 얕은 물 0x8ff0de · 중간 0x2fbfc4, 밤에는 바다와 같은 남색·밝기(daylight.js → setFountainSky), 빛나지 않음
  - 물줄기(흘러내리는 무늬가 아래로 흐르는 띠 12개): 기둥 물구멍 4(위 단으로 휘는 줄기, 45°마다) · 위 단 테 → 가운데 단 4장(45°) · 가운데 단 테 → 큰 물받이 4장(0°·90°…)
  - 물방울: 분수 하나에 Points 하나, 세 종류(물구멍 물보라 · 장막 앞 방울 · 떨어진 자리 튐)를 셰이더가 시간으로 계산(CPU 일 없음). 설정별 수 `fountainDrops`: 최고·높음 144 · 보통 96 · 낮음 48 · 성능 우선 0.
    움직임 줄이기면 물방울 끄고 물결은 0.3배 빠르기. 분수마다 놓인 자리로 시간 차. 공사 중에는 물을 숨김. 멀면 다른 소품처럼 안 그림(main.js 그리기 거리), 화면 밖이면 three가 빼냄(경계 구 지정)
  - 그리기: 분수 하나에 +4번(모델 1 + 웅덩이 1 · 물줄기 1 · 물방울 1, 물은 그림자 없음), 삼각형 +30,393(모델 28,113 + 물 2,280) + 점 144. 재질·모양은 모든 분수가 같이 씀
    (측정, 높음 설정 같은 카메라: 분수 0개 49번 → 1개 53번 → 5개 69번, 점 420 → 564 → 1,140)
- 모델을 못 받으면 예전 코드 분수(views.js decoModel "fountain", 움직이는 fountainWater 원뿔) 그대로
- 갤러리 사진: `node tools/thumbs.cjs fountain`(assets/thumbs/fountain.webp — 밤에 찍어도 분수 물은 낮 밝기, thumbs.js withFountainDay)
