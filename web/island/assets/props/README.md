# 소품 모델

사용자 방침(2026-11-24): 사용자가 보내는 소품·장식은 **면 수를 줄이지 않는다.** 텍스처는 원본(4096px)에서 그래픽 설정별로 둔다.
경로의 `{T}`가 4k(최고·높음) · 2k(보통) · 1k(낮음·성능 우선)로 바뀐다(src/render/assets.js).

| 모델 | 삼각형(모든 단계 같음) | 원본 파일 |
|---|---|---|
| bank | 9,735 | domed_building_3d_model.glb |
| bench | 9,070 | wooden_bench_3d_model.glb |
| cabbage | 9,234 | tripo_convert_037c8b53… |
| carrot | 9,910 | tripo_convert_b251bc0d… |
| field_plot | 9,436 | tripo_convert_1547a90d… |
| flower_box | 8,998 | flower_box_3d_model.glb |
| palm | 9,528 | palm_tree_3d_model.glb |
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
