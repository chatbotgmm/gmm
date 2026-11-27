#!/usr/bin/env python3
# 섬 계정 저장: 운영 dist/src/app.js에 registerIslandSave를 더한다(두 줄 추가, 기존 줄·바이트 변경 없음).
# 4판(2026-11-27): 운영 app.js 지문이 db02506c…(6849a19c…의 101행 뒤에 /village3d 라우트 11줄을 넣은 판)로 확인됨.
#   - 파일을 바이너리로 읽고 쓴다: CRLF·BOM·끝 줄바꿈을 그대로 두고, 출력하는 '원본 지문'이 sha256sum 값과 같다(CHECK.md 4번 결함 수정).
#   - 앵커는 LF 줄과 CRLF 줄 둘 다 찾고, 넣는 줄은 그 파일의 줄바꿈(앵커 줄 끝과 같은 것)을 쓴다.
#   - 알려진 지문 목록(KNOWN) 중 하나이거나, 아니면 앵커 두 개가 정확히 한 번씩 있을 때만 바꾼다(--require-known이면 목록에 있어야만).
#   - 앵커가 0번/2번 이상이거나 이미 island-save가 들어 있으면 아무것도 쓰지 않고 멈춘다(종료 코드 1).
# 사용: python3 -I patch_app.py <원본 app.js> <출력 app.js> [--require-known]
#  마지막 줄에 '완료 <결과 지문>'을 찍는다. apply.sh는 이 값을 KNOWN 표의 '패치 뒤 지문'과 대조한다.
import hashlib, sys
src, out = sys.argv[1], sys.argv[2]
require_known = '--require-known' in sys.argv[3:]
with open(src, 'rb') as f:
    s = f.read()
# 원본 지문 → (설명, 패치 뒤 지문)
KNOWN = {
    '6849a19cabedeb095eb2ba0404917e0aa383aabd787b08b2d93112f3c3ffbedb': ('9차 expected-before(manual/home-assembly-20261019 빌드)',
                                                                         '8a220d2db58987ee77ccbbcc597098ad31696e133610fbd9de56742c9c27b909'),
    'db02506c8eb41ffb4048d8c4b39fa9c76ecfc3d56e65ee3bdec58007be4cbef5': ('운영 확인값(6849a19c + /village3d 라우트 11줄)',
                                                                         '84fc8959bafb9f97107a6e37711aa61f5b1000f0bb5ae8ede5b6ed16cd99692b'),
}
sha = lambda b: hashlib.sha256(b).hexdigest()
got = sha(s)
print('원본 지문', got, KNOWN[got][0] if got in KNOWN else '(목록에 없음)')
if require_known and got not in KNOWN:
    sys.exit('원본 지문이 목록에 없어 중단')
if b'island-save' in s or b'registerIslandSave' in s:
    sys.exit('이미 island-save가 들어 있어 중단')
def rep(anchor, add, whole_line):
    """anchor가 LF 또는 CRLF 줄 끝 바로 앞에서 정확히 한 번 나올 때(whole_line이면 줄 맨 앞부터 줄 전체), 그 줄 뒤에 add 줄을 같은 줄바꿈으로 넣는다."""
    global s
    anchor = anchor.encode('utf-8'); add = add.encode('utf-8')
    hits = set()
    for eol in (b'\r\n', b'\n'):
        i = s.find(anchor + eol)
        while i != -1:
            e = i + len(anchor)
            lf_only_ok = not (eol == b'\n' and s[e - 1:e] == b'\r')
            start_ok = (not whole_line) or i == 0 or s[i - 1:i] == b'\n'
            if lf_only_ok and start_ok:
                hits.add((i, eol))
            i = s.find(anchor + eol, i + 1)
    if len(hits) != 1:
        sys.exit(f'앵커가 {len(hits)}번 나와 중단(1번이어야 함): {anchor[:70]!r}')
    (i, eol), = hits
    j = i + len(anchor) + len(eol)
    s = s[:j] + add + eol + s[j:]
rep("import { registerMy } from './my.js';",
    "import { registerIslandSave } from './island-save.js';   // 갈매미맨 마을(섬) 계정 저장", True)
rep("gameResetSessionCutoff: options.gameResetSessionCutoff, roster60AccountLevelReader: options.roster60AccountLevelReader });",
    "    registerIslandSave(app, { db, secret: options.secret, gameResetSessionCutoff: options.gameResetSessionCutoff });   // my.js의 preHandler 다음에 등록", False)
res = sha(s)
if got in KNOWN and KNOWN[got][1] != res:
    sys.exit(f'패치 결과 지문이 표와 달라 중단(아무것도 쓰지 않음): {res}')
with open(out, 'wb') as f:
    f.write(s)
print('완료', res)
