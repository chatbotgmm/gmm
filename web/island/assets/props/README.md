# 소품 모델

사용자 방침(2026-11-24): 사용자가 보내는 소품·장식은 **면 수를 줄이지 않는다.** 텍스처는 원본(4096px)에서 그래픽 설정별로 둔다.
경로의 `{T}`가 4k(최고·높음) · 2k(보통) · 1k(낮음·성능 우선)로 바뀐다(src/render/assets.js).

| 모델 | 삼각형(모든 단계 같음) | 원본 파일 |
|---|---|---|
| bank (공식은행) | 14,834 | dome_house_3d_model.glb (2026-11-25 교체, 아래) |
| bench | 9,070 | wooden_bench_3d_model.glb |
| cafe (카페) | 14,246 (+등불 발광 마스크 512px, 등불 2) | coffee_shop_3d_model.glb (2026-11-25, 아래) |
| cabbage | 9,234 | tripo_convert_037c8b53… |
| carrot | 9,910 | tripo_convert_b251bc0d… |
| cottage (2층집) | 14,304 | 2층집.glb (2026-11-25, 아래) |
| field_plot | 9,436 | tripo_convert_1547a90d… |
| flower_box | 8,998 | flower_box_3d_model.glb |
| house (작은 집) | 14,646 (+등불 발광 마스크 512px, 등불 1) | round_cottage_3d_model.glb |
| giant_house (자이언트의 집) | 14,154 | fantasy_temple_3d_model.glb (2026-11-25, 아래) |
| house (작은 집) | 14,646 | round_cottage_3d_model.glb |
| lighthouse (등대) | 14,788 | winged_lighthouse_3d_model.glb (2026-11-25, 아래 · 원본 텍스처 2048px) |
| palm | 9,528 | palm_tree_3d_model.glb |
| post (우체국) | 14,388 (+등불 발광 마스크 512px, 등불 1) | fantasy_house_3d_model.glb |
| shop (잡화점) | 14,420 (+등불 발광 마스크 512px, 등불 1) | fantasy_house_3d_model.glb (da8af4be…, 우체국과 다른 파일 · 2026-11-25, 아래) |
| stairs_stone | 9,850 | tripo_convert_ca8a87b0… |
| storehouse | 9,375 | stone_house_3d_model.glb |
| street_lamp | 9,561 (+발광 마스크 256px) | tripo_convert_8a67f70c… |

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
- 그리기: src/render/daylight.js `lantern()` — 세기는 가로등과 같이 0.15 + 2.2 × 밤(낮에는 거의 안 보이고 밤에 빛남), 전기와 상관없이 켜짐, 짓는 중에는 꺼짐.
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
