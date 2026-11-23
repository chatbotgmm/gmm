# 갈매미맨 마을 — 1단계 (three.js 웹)

「갈매미맨 마을 개발 지시서 & 아키텍처 가이드」 5장의 1단계(폴더 구조, 핵심 데이터 모델, 그리드 바닥 타일 변경 + 건물 배치 프로토타입)를 three.js로 만든 것. Tripo 에셋이 들어갈 자리는 임시 도형(상자·원뿔·원기둥·캡슐)이다.

## 실행
    cd web
    python3 -m http.server 8000      # 브라우저에서 http://localhost:8000/island/
    node --test tests/*.test.js      # 로직 시험 (npm test 와 같음)
three.js 0.170.0은 cdn.jsdelivr.net에서 받는다(인터넷 필요). 빌드 단계 없음.

## 기존 모델 사용
- 갈매미 8마리는 `web/village/models`의 진짜 모델(gmm_char1~8.glb, Idle·Walk·Run 애니메이션)을 쓴다. 크기·걷기/달리기 속도는 `chars.json` 값 그대로(발이 미끄러지지 않게 잰 값). 먼 길(8칸 넘게)은 달린다.
- 해변 바위와 나무는 `web/village/assets/nk`의 Kenney Nature Kit 모델(CC0).
- 그래서 **`web/` 폴더에서 서버를 열어야** 모델이 나온다: `cd web && python3 -m http.server 8000` → http://localhost:8000/island/
- 모델을 못 찾으면(파일을 더블클릭해서 연 경우 등) 갈매미는 캡슐, 나무·바위는 임시 도형으로 나온다.
- 한 파일 만들기: `python3 tools/bundle.py 갈매미맨마을.html` (claude.ai 아티팩트용은 `--artifact`). 모델은 `models/`, `assets/nk/` 폴더(.glb 또는 .glb.json)에서도 찾는다.

## 건물 모델
- Kenney **City Kit (Suburban) 2.0** (CC0, `assets/suburban/License.txt`)에서 6채: 작은 집(a) 2×2, 2층집(o) 2×2, 카페(d) 3×2, 잡화점(b) 3×2, 우체국(f) 3×3, 큰 집(n) 4×3. 받은 곳: https://opengameart.org/content/city-kit-suburban
- 원래 지붕은 초록인데, 지시서의 「파스텔 하늘색·테라코타 지붕」에 맞춰 **지붕 초록만** 셰이더로 바꾼다(`render/roofTint.js`). 같은 초록을 쓰는 마당 덤불은 아래쪽이라 그대로 둔다.
- 이 모델들의 정문은 −z 쪽이라 카탈로그의 `modelYaw: π`로 돌려 섬 규칙(문 = +z)에 맞췄다.
- 못 불러오면 예전 임시 도형으로 나온다.

## 조작
- 👀 둘러보기: 드래그 돌리기, 오른쪽 드래그 옮기기, 휠 확대
  - 갈매미 누르기(또는 오른쪽 목록의 이름): 카메라가 따라감, 빈 땅을 누르면 그만
  - 갈매미 끌기: 들어서 옮김. 건물 위에 놓으면 그 건물에 들어가고, 바다처럼 설 수 없는 곳이면 제자리로 돌아감
- 🖌 바닥 칠하기: 잔디·돌길·나무 데크·흙길·모래를 고르고 누르거나 끌어서 칠함(바다·건물 칸은 안 됨). 붓 크기 1×1·3×3·5×5·7×7(버튼 또는 [ ] 키)
- 🏠 건물 짓기: 고스트가 초록이면 지을 수 있음, 빨강이면 이유가 뜸. 아래를 가리키는 흰 표시가 문 앞 칸. R로 90° 돌리기
- 🧹 철거: 건물을 누르면 철거(안에 있던 갈매미는 문 앞으로 나옴)
- 저장/불러오기: 이 브라우저의 localStorage
- 도구가 켜져 있을 때는 오른쪽 드래그가 시야 돌리기, Esc는 도구 끄기

## 폴더 구조
    src/
      config.js            격자 크기(64×64), 칸 1 m, 청크 16, 해수면, 걸을 수 있는 턱 높이
      util.js              씨앗 난수, 조사(을/를)
      data/
        types.js           핵심 데이터 모델: GridCell, BuildingData, FurnitureData, UnitAIState (+ GroundType, InteractionType, UnitState)
        catalog.js         건물·가구·해안 모듈 종류, 바닥 색, 갈매미 8종. asset 칸에 Tripo .glb/.fbx 경로를 넣는 곳
      world/               (three.js 없음 → Node에서 시험)
        Grid.js            칸 상태, 차지(occupied), 걷기 가능 여부, 다시 그릴 청크 표시
        autotile.js        상하좌우 비트마스크 → 조각 종류(가운데/끝/직선/모서리/T자/십자)와 칠할 사각형
        pathfinding.js     A* 길찾기(8방향), 가까운 걸을 수 있는 칸
        placement.js       차지 칸·문 위치(회전 포함), 지을 수 있는지 판정과 이유
        islandGen.js       섬: 평야 + 모래사장 + 바다, 계단식 언덕, 광장·길, 부두·방파제·등대·바위
        World.js           섬 전체 상태(격자·모듈·건물·유닛), 짓기·철거·칠하기, 저장/불러오기
      units/unitBrain.js   갈매미 AI: 쉬기 → 산책 / 건물로 가기 → 문으로 들어가 머물기 → 나오기
      render/
        groundChunks.js    16×16 청크마다 메쉬 하나로 합쳐 그림, 바뀐 청크만 다시 만듦
        water.js           바다 셰이더
        placeholders.js    임시 도형(건물·모듈·갈매미). 피벗 = 바닥 정중앙, 문 = +z 면
        assets.js          Tripo 에셋 불러오기(바닥 정중앙에 맞추고 차지 칸 크기로 맞춤), 실패하면 임시 도형
        views.js           건물·모듈·유닛 뷰, 건물 위 "안에 있는 갈매미 수" 표시
      systems/tools.js     입력: 칠하기·고스트 미리보기·짓기·철거
      ui/hud.js            도구 막대, 목록·통계 판
      main.js              장면·카메라·빛, 위를 모두 이음
    tests/logic.test.js    로직 시험

## 지시서와 맞춘 점
- **GridCell** `{ groundType, occupiedId, elevation }` 그대로. 바다는 바닥 종류가 아니라 높이(해수면 −0.2 m 아래)로 정함.
- **청크**: 칸마다 오브젝트를 만들지 않고 청크(16×16)마다 메쉬 1개. 바뀐 칸의 청크만 다시 만들고, 오토타일·절벽 면 때문에 이웃 칸이 다른 청크에 있으면 그 청크도 다시 만든다. 화면 오른쪽 판의 "다시 그림" 수로 확인할 수 있다.
- **오토타일**: 돌길·나무 데크·흙길은 상하좌우 같은 종류를 비트마스크(N=1, E=2, S=4, W=8)로 보고 조각을 고른다. 모서리 채움은 대각선 칸까지 본다. 나중에 타일 모델을 쓸 때는 `tileVariant(mask)`의 `kind`·`rot`로 고르면 된다.
- **건물 배치**: 고스트 미리보기와 실제 짓기가 같은 판정(`checkPlacement`)을 쓴다. 지으면 칸을 차지하고 문 앞 칸을 비워 두며, 길찾기는 매 걸음 `canStep`으로 확인하므로 새 건물이 길을 막으면 다시 길을 찾는다.
- **이동 경계**: 바다·방파제는 걸을 수 없는 칸이라 갈매미가 바다로 빠지지 않는다. 부두는 바다 위지만 걸을 수 있는 모듈(높이 0)이다. 턱이 0.25 m보다 높으면(언덕 절벽) 못 오르고, 돌계단(0.15 m씩)으로 오른다.
- **에셋 4종 분리 / 피벗**: 건물·가구·해안 모듈을 따로 카탈로그에 두고, 모두 바닥 정중앙 피벗과 칸 정수배 크기. 실내 방 쉘은 2단계.

## 2단계로 남긴 것
- 실내 방 쉘(L자 컷어웨이) 전환, 바닥재·벽지 바꾸기, 가구 배치·회전·회수. 데이터는 `BuildingData.interior`, `FurnitureData`, 카탈로그 `FURNITURE`(InteractionPoint·InteractionType)에 준비만 함.
- 건물 안 갈매미의 가구 이용(`UnitState.GoToFurniture` / `Interact`). 지금은 건물 안에 일정 시간 머물다 나오고, 건물 위에 안에 있는 수가 표시된다.

## 알려진 한계
- 실제 기기(휴대폰 터치)에서는 시험하지 않았다. Playwright 휴대폰 화면(390×844)에서 레이아웃과 탭만 확인했다.
- 도구가 켜져 있을 때 두 손가락으로 돌리기·확대는 첫 손가락이 도구로 쓰여 잘 안 될 수 있다(도구를 끄고 둘러보기에서 하면 됨).
