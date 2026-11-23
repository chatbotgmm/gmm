# 갈매미 마을 (웹 3D)

claude.ai 아티팩트(https://claude.ai/code/artifact/9c06abc4-dd8b-4805-bae9-13ecf52ade7b, 버전 1795334569-438e)의 파일 54개를 그대로 옮긴 것.

- `index.html` 갈매미 마을(8마리가 스스로 쉬기·산책·씨앗 먹기·인사·나무 베기·광석 캐기·낚시·집 짓기)
- `play.html` 한 마리를 직접 조작(WASD·Shift·Space·J, 휴대폰은 화면 막대·버튼)
- `models/` 갈매미 8종(.glb, 애니메이션 포함)과 `chars.json`(이름·키·크기·걷기/달리기 속도·타격 시점)
- `assets/` Kenney Nature Kit·Survival Kit, Quaternius minecart (모두 CC0)

## 아티팩트와 다른 점
- 아티팩트는 .glb를 base64로 바꿔 `.glb.json`에 담아 두었다(호스트가 .glb를 서비스하지 않아서). 여기서는 원래 .glb 바이너리로 되돌리고, `loadGLB`가 .glb를 바로 읽게 바꿨다. 그 외 코드는 같다.
- `index.html` 맨 앞에 아티팩트 게시 때 붙은 감싸는 머리말을 빼고 일반 `<head>`를 넣었다.

## 실행
모듈 스크립트와 fetch를 쓰므로 파일을 그냥 열면 안 되고 웹 서버로 연다. three.js(0.170.0)는 cdn.jsdelivr.net에서 받는다.

    cd web/village
    python3 -m http.server 8000
    # 브라우저에서 http://localhost:8000/
