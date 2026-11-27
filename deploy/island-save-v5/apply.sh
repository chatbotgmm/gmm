#!/usr/bin/env bash
# 섬(갈매미맨 마을) 계정 저장 서버 패치 — 묶음 5판(island-save 모듈은 판 3 그대로). root로 실행: sudo bash <이 폴더>/apply.sh
# 하는 일: 실행 폴더를 복사하지 않고 파일 2개만 바꿈(dist/src/app.js 두 줄 추가 · dist/src/island-save.js 새로/판 올림) → 재시작 → 확인 → 실패 시 바로 되돌림.
# DB: 첫 요청 때 "IslandSave" 표를 CREATE TABLE IF NOT EXISTS로 만들고 빠진 칸만 ALTER TABLE ADD COLUMN(기존 표·줄은 건드리지 않음). 그래도 적용 전에 DB를 백업함.
# defense-update.sh가 지문으로 보는 파일(my.js·site.js·public/defense/*)은 건드리지 않음 → 디펜스 최신 판 올리기와 서로 막지 않음.
# 1판 → 2판(비평 B2): $BK 폴더 4단계 모두 ubuntu 소유 · 디스크 여유(DB 크기+30MB) 확인 · curl|grep 대신 has() ·
#   판 번호로 "이미 적용"/"모듈만 올리기" 판정 · 마지막에 운영과 같은 Prisma 연결로 PRAGMA foreign_keys 출력
# 2판 → 3판(확인 A1·B2): island-save 판 3(prev는 replace:true·지우기·되돌리기 때만) · 7/7 require를 try로 감싸 스택 대신 한 줄
# 3판 → 4판(2026-11-27, 운영 app.js = db02506c…): app.js 지문을 '하나'가 아니라 표(APP_TABLE: 패치 전 → 패치 뒤)로 판정 ·
#   patch_app.py는 바이너리로 읽고 써서 CRLF·바이트 보존, 운영에서 다시 계산한 패치 결과가 표의 값과 같을 때만 진행 ·
#   파일은 git fetch 대신 이 apply.sh와 같은 폴더(묶음)에서 읽음(root 전용 임시 폴더로 복사한 뒤 files.sha256 확인) ·
#   확인에 /village3d/ 응답 코드가 적용 전과 같은지 더함(운영에서 손으로 넣은 village3d 라우트가 살아 있는지)
# 4판 → 5판(2026-11-27, 확인 1~6): '이미 적용' 경로에서도 서버 확인(옛 코드로 돌고 있으면 재시작 1번 → 확인) ·
#   운영에서 확인된 적 없는 기존 기능 항목(/health·/ready·/about harbor.css·kakao-poll 문구)은 적용 전 값을 재고 그때 있던 것만 검사 ·
#   island-save.js를 놓은 뒤 app.js 교체가 실패해도 되돌림 · DATABASE_URL(file:)이 가리키는 파일이 DB 백업 대상과 같은지 비교(값은 찍지 않음, 다르면 경고) ·
#   동시 실행 막기(flock) · 끝날 때 '== apply.sh 끝(종료 코드 N)' 한 줄(백그라운드 실행 로그에서 끝났는지 보려고)
# 잠금(fd 9)은 재시작 명령에 넘기지 않음(9>&-): 새로 뜬 프로세스가 잠금을 물고 있지 않게
# 시험용으로만 GMM_TEST_REL·_BKROOT·_DB·_B·_USER 환경 변수로 경로·주소·소유자를 바꿀 수 있음(sudo는 환경을 지우므로 운영에서는 아래 기본값)
set -Eeuo pipefail
umask 077
[ "$(id -u)" = 0 ] || { echo 'sudo bash 로 실행해 주세요.'; exit 1; }
NAME=island-save-v5                            # 백업 폴더 이름 앞부분
VER=3                                          # 이 묶음의 island-save 판(island-save.js 첫 줄 "// island-save 판: 3"와 같아야 함)
SRC=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)   # 묶음 폴더(apply.sh가 있는 곳)
REL=${GMM_TEST_REL:-/home/ubuntu/gmm-releases}
BKROOT=${GMM_TEST_BKROOT:-/home/ubuntu/gmm-deploy-backups}
U=${GMM_TEST_USER:-ubuntu}   # 실행 폴더·백업 파일 소유자
# app.js 지문 표: '패치 전 패치 뒤 설명'. 패치 전 지문이면 full, 패치 뒤 지문이면 module(이미 패치됨). 그 밖이면 멈춤.
APP_TABLE='
db02506c8eb41ffb4048d8c4b39fa9c76ecfc3d56e65ee3bdec58007be4cbef5 84fc8959bafb9f97107a6e37711aa61f5b1000f0bb5ae8ede5b6ed16cd99692b 운영확인값(6849a19c+village3d라우트11줄)
6849a19cabedeb095eb2ba0404917e0aa383aabd787b08b2d93112f3c3ffbedb 8a220d2db58987ee77ccbbcc597098ad31696e133610fbd9de56742c9c27b909 9차expected-before
'
after_of(){ awk -v h="$1" '$1==h{print $2}' <<<"$APP_TABLE"; }    # 패치 전 → 패치 뒤 (없으면 빈 값)
is_after(){ awk -v h="$1" '$2==h{f=1} END{exit !f}' <<<"$APP_TABLE"; }
DB=${GMM_TEST_DB:-/home/ubuntu/gmm/galmaegiman-confirmed/storage/confirmed.db}
B=${GMM_TEST_B:-http://127.0.0.1:3000}
LOCK=${GMM_TEST_LOCK:-/run/lock/gmm-island-apply.lock}
TMP=$(mktemp -d -p "${GMM_TEST_TMP:-/tmp}" gmm-island-XXXXXX)
trap 'rc=$?; rm -rf "$TMP"; echo "== apply.sh 끝(종료 코드 $rc) $(date -u +%Y-%m-%dT%H:%M:%SZ)"' EXIT
trap 'exit 143' TERM; trap 'exit 129' HUP; trap 'exit 130' INT   # 신호로 죽으면 끝 줄 종료 코드가 0이 아니게(SIGTERM이면 143) — 재부팅·종료 때 '정상 종료'로 보이지 않게
exec 9>"$LOCK"; flock -n 9 || { echo "다른 apply.sh가 아직 실행 중이라 중단(로그를 tail 로 보며 끝나기를 기다려 주세요)"; exit 1; }
say(){ printf '%s\n' "▶ $*"; }
sha(){ [ -f "$1" ] && sha256sum "$1" | cut -d' ' -f1 || echo -; }
ver_of(){ [ -f "$1" ] || { echo 0; return; }; local v; v=$(sed -n '1s#^// island-save 판: \([0-9][0-9]*\)$#\1#p' "$1"); echo "${v:-1}"; }   # 1판에는 판 줄이 없음 → 1
# 확인은 응답을 끝까지 받은 뒤 찾는다(set -o pipefail에서 `curl | grep -q`는 grep이 먼저 끝나면 curl이 실패로 끝나 맞아도 실패가 됨 — 9차 apply.sh와 같은 꼴)
has(){ local body; body=$(curl -fsS --max-time 10 "${@:3}" "$B$1" 2>/dev/null) || return 1; [[ "$body" == *"$2"* ]]; }
post_has(){ local body; body=$(curl -sS --max-time 10 -X POST -H 'x-gmm: 1' -H 'content-type: application/json' -d "$2" "$B$1" 2>/dev/null) || return 1; [[ "$body" == *"$3"* ]]; }
code_is(){ local want=$1 url=$2; shift 2; [ "$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "$@" "$B$url" 2>/dev/null)" = "$want" ]; }
# 5판: 운영에서 확인된 적 없는 기존 기능 항목은 적용 전(1/7)에 재 둔 값(BEFORE_*=1이면 그때 있었음)과 비교한다. 적용 전에 없던 것은 검사하지 않음.
alive(){ local c; c=$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' "$B/health" 2>/dev/null || true); [ -n "$c" ] && [ "$c" != 000 ]; }   # 어떤 HTTP 응답이든 오면 살아 있음
healthy(){ for _ in $(seq 1 60); do alive && { [ "$BEFORE_HEALTH" = 0 ] || has /health '"ok":true'; } && { [ "$BEFORE_READY" = 0 ] || has /ready '"ready":true'; } && return 0; sleep 1; done; return 1; }
measure_before(){
  BEFORE_HEALTH=0; has /health '"ok":true' && BEFORE_HEALTH=1
  BEFORE_READY=0; has /ready '"ready":true' && BEFORE_READY=1
  BEFORE_ABOUT=0; has /about 'site/harbor.css' && BEFORE_ABOUT=1
  BEFORE_POLL=0; post_has /my/api/app/kakao-poll '{"ticket":"x","secret":"y"}' '로그인 요청을 찾지 못했어요' && BEFORE_POLL=1
  yn(){ [ "$1" = 1 ] && echo 있음 || echo '없음(검사 안 함)'; }
  echo "적용 전 기존 기능: /health ok:true $(yn $BEFORE_HEALTH) · /ready ready:true $(yn $BEFORE_READY) · /about harbor.css $(yn $BEFORE_ABOUT) · kakao-poll 문구 $(yn $BEFORE_POLL)"; }
check(){ local i miss loc; for i in $(seq 1 10); do miss=''
  code_is 401 /my/api/island -H 'x-gmm: 1' || miss+=' 섬계정저장(401)'
  code_is 403 /my/api/island || miss+=' 섬머리글검사(403)'
  code_is 401 /my/api/island/0/restore -X POST -H 'x-gmm: 1' -H 'content-type: application/json' -d '{"baseRev":0}' || miss+=' 섬되돌리기(401)'
  code_is 401 /my/api/defense -H 'x-gmm: 1' || miss+=' 디펜스계정저장'
  has /my 'gmm-login-return' -H 'cookie: gmm_ir=v3d' || miss+=' 기존/my화면(표시 쿠키가 있어도 그대로)'
  [ "$BEFORE_ABOUT" = 0 ] || has /about 'site/harbor.css' || miss+=' 사이트(/about)'
  [ "$BEFORE_POLL" = 0 ] || post_has /my/api/app/kakao-poll '{"ticket":"x","secret":"y"}' '로그인 요청을 찾지 못했어요' || miss+=' 게임카카오로그인'
  [ "$BEFORE_HEALTH" = 0 ] || has /health '"ok":true' || miss+=' /health'
  [ "$BEFORE_READY" = 0 ] || has /ready '"ready":true' || miss+=' /ready'
  # 카카오 콜백 취소 흉내: 카카오 로그인이 켜져 있으면 my.js가 /my?kakao=cancel로 보내고, 섬 훅이 /village3d/?login=cancel로 바꿔야 함(꺼져 있으면 404 → 건너뜀)
  loc=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code} %{redirect_url}' -H 'cookie: gmm_ir=v3d' "$B/my/kakao/callback?error=access_denied" 2>/dev/null || true)
  case "$loc" in '302 '*'/village3d/?login=cancel'|404*) ;; *) miss+=" 로그인복귀($loc)";; esac
  code_is "$V3D_BEFORE" /village3d/ || miss+=" 섬화면/village3d/(적용 전 $V3D_BEFORE)"
  [ -z "$miss" ] && return 0; sleep 2; done
  echo "확인 실패 항목:$miss"; return 1; }   # check 끝

say '1/7 사전 확인'
CUR=$(systemctl show gmm-server -p WorkingDirectory --value)
case "$CUR" in "$REL"/?*) ;; *) echo "실행 폴더가 $REL 아래가 아니라 중단: $CUR"; exit 1;; esac
systemctl is-active --quiet gmm-server || { echo '서버가 지금 실행 중이 아니라 중단'; exit 1; }
[ -f "$CUR/dist/src/game-reset-session.js" ] || { echo 'game-reset-session.js가 없어 중단(my.js와 다른 판)'; exit 1; }
for p in dist/src/app.js dist/src/island-save.js; do [ ! -L "$CUR/$p" ] || { echo "바로가기라 중단: $p"; exit 1; }; done
[ -f "$DB" ] && [ ! -L "$DB" ] || { echo "DB를 찾지 못해 중단: $DB"; exit 1; }
# 5판: 서버가 실제로 쓰는 DATABASE_URL(file:)이 가리키는 파일이 위 DB(백업 대상)와 같은지 비교. 값은 화면에 찍지 않는다.
#  찾는 순서: 서버 프로세스 환경 → 명령줄의 --env-file(없으면 실행 폴더의 .env). Node는 이미 있는 환경 변수를 --env-file로 덮지 않음.
#  상대 경로는 Prisma 규칙대로 schema.prisma가 있는 폴더($CUR/prisma) 기준(scripts/setup.sh가 file:../storage/confirmed.db = 설치판 storage/confirmed.db로 다룸).
PID=$(systemctl show gmm-server -p MainPID --value)
DBURL=$(tr '\0' '\n' < "/proc/$PID/environ" 2>/dev/null | sed -n 's/^DATABASE_URL=//p' | head -1 || true); DBSRC=환경
if [ -z "$DBURL" ]; then
  EF=$(tr '\0' '\n' < "/proc/$PID/cmdline" 2>/dev/null | sed -n 's/^--env-file=//p' | tail -1 || true); PCWD=$(readlink "/proc/$PID/cwd" 2>/dev/null || echo "$CUR")
  case "$EF" in '') EF=$CUR/.env;; /*) ;; *) EF=$PCWD/$EF;; esac
  DBURL=$(sed -n 's/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}DATABASE_URL[[:space:]]*=[[:space:]]*//p' "$EF" 2>/dev/null | tail -1 | tr -d '\r' || true)
  DBURL=${DBURL%\"}; DBURL=${DBURL#\"}; DBURL=${DBURL%\'}; DBURL=${DBURL#\'}; DBSRC=".env 파일"
fi
dbfile=''
case "$DBURL" in
  '') echo "DB 경로 비교: 확인할 수 없음(서버 환경과 .env에서 DATABASE_URL을 찾지 못함). DB 백업 대상: $DB";;
  file:*) p=${DBURL#file:}; p=${p%%\?*}
    case "$p" in /*) dbfile=$p;; *) [ -f "$CUR/prisma/schema.prisma" ] && dbfile=$CUR/prisma/$p;; esac
    if [ -z "$dbfile" ]; then echo "DB 경로 비교: 확인할 수 없음(상대 경로인데 $CUR/prisma/schema.prisma 가 없음). DB 백업 대상: $DB"
    elif { [ -e "$dbfile" ] && [ "$(stat -L -c %d:%i "$dbfile")" = "$(stat -L -c %d:%i "$DB")" ]; } || [ "$(realpath -m "$dbfile")" = "$(realpath -m "$DB")" ]; then
      echo "DB 경로 비교: 서버의 DATABASE_URL($DBSRC) 파일 = DB 백업 대상($DB) 같음"
    else echo "⚠ 경고: 서버의 DATABASE_URL($DBSRC)이 가리키는 파일이 DB 백업 대상($DB)과 다름. DB 백업은 서버가 쓰지 않는 파일이 됨(패치·되돌리기에는 영향 없음). 계속하지만 결과를 알려 주세요."; fi;;
  *) echo "DB 경로 비교: 확인할 수 없음(DATABASE_URL이 file: 꼴이 아님). DB 백업 대상: $DB";;
esac
unset p dbfile
dbkb=$(( ($(stat -c %s "$DB") + 1023) / 1024 )); needkb=$(( dbkb + 30720 ))
free=$(df -Pk "$(dirname "$BKROOT")" | awk 'NR==2{print $4}')
[ "$free" -gt "$needkb" ] || { echo "디스크 여유 부족(남음 ${free}KB, DB 백업 ${dbkb}KB + 30MB = ${needkb}KB 필요)으로 중단. deploy/tools/cleanup-releases.sh 로 정리해 주세요."; exit 1; }
echo "디스크 여유 ${free}KB (필요 ${needkb}KB)"
APP_NOW=$(sha "$CUR/dist/src/app.js"); HAVE=$(ver_of "$CUR/dist/src/island-save.js")
if [ -n "$(after_of "$APP_NOW")" ] && [ "$HAVE" = 0 ]; then MODE=full; APP_EXPECT=$(after_of "$APP_NOW")
elif is_after "$APP_NOW" && [ "$HAVE" != 0 ]; then MODE=module; APP_EXPECT=$APP_NOW
else echo "지금 상태를 몰라 중단(아무것도 바꾸지 않음): app.js $(echo "$APP_NOW" | cut -c1-12), island-save 판 $HAVE"; exit 1; fi
[ "$HAVE" -le "$VER" ] || { echo "서버에 더 새 판(판 $HAVE)이 있어 중단. 이 묶음은 판 $VER"; exit 1; }
V3D_BEFORE=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "$B/village3d/" 2>/dev/null || true)
measure_before
echo "app.js $(echo "$APP_NOW" | cut -c1-12) → 패치 뒤 $(echo "$APP_EXPECT" | cut -c1-12) · /village3d/ 지금 응답 $V3D_BEFORE(적용 뒤에도 같아야 함)"
echo "지금: $( [ "$MODE" = full ] && echo '섬 계정 저장 없음 → app.js 패치 + island-save 판 '"$VER" || echo "island-save 판 $HAVE → 판 $VER (app.js는 그대로)")"

say '2/7 묶음 파일 확인(읽기)'
for f in island-save.js patch_app.py files.sha256 apply.sh; do [ -f "$SRC/$f" ] && [ ! -L "$SRC/$f" ] || { echo "묶음에 $f 가 없어 중단: $SRC"; exit 1; }; cp "$SRC/$f" "$TMP/$f"; done   # root 전용 임시 폴더로 복사한 뒤 확인(확인 뒤 바뀌는 것 막기)
(cd "$TMP" && sha256sum -c --quiet files.sha256) || { echo '묶음 파일 지문이 files.sha256과 달라 중단'; exit 1; }
echo "files.sha256 지문 $(sha "$TMP/files.sha256" | cut -c1-16) (설계 문서의 값과 같아야 함)"
[ "$(ver_of "$TMP/island-save.js")" = "$VER" ] || { echo "받은 island-save.js 판이 $VER 이 아니라 중단"; exit 1; }
if [ "$MODE" = module ] && cmp -s "$TMP/island-save.js" "$CUR/dist/src/island-save.js"; then
  # 5판: 파일은 이미 이 묶음과 같음. 하지만 지난 실행이 '파일 교체 뒤·재시작 전'에 끊겼다면 서버는 옛 코드다 → 서버 확인, 실패면 재시작 1번 → 다시 확인
  echo "파일은 이미 적용돼 있어요(island-save 판 $VER). 서버가 새 코드로 도는지 확인합니다."
  LAST=$(ls -d "$BKROOT"/island-save-v*-* 2>/dev/null | tail -1 || true)
  if healthy && check; then echo "이미 적용돼 있어요(서버도 새 코드로 동작). 바꿀 것이 없어요."; exit 0; fi
  echo '서버가 아직 옛 코드로 도는 것 같아요(파일 교체 뒤 재시작이 안 된 경우). 재시작 1번 후 다시 확인합니다.'
  systemctl restart gmm-server 9>&- || true
  if healthy && check; then say "완료: 재시작해 섬 계정 저장 판 $VER 동작(/my/api/island)"; echo "백업 폴더(지난 실행): ${LAST:-못 찾음}"; exit 0; fi
  echo "재시작 뒤에도 확인 실패. 되돌리려면: sudo bash /home/ubuntu/gmm/deploy/tools/defense-rollback.sh ${LAST:-<지난 백업 폴더>}"; exit 1
fi
if [ "$MODE" = full ]; then
  python3 -I "$TMP/patch_app.py" "$CUR/dist/src/app.js" "$TMP/app.js" --require-known || { echo 'patch_app.py가 멈춰 중단(아무것도 바꾸지 않음)'; exit 1; }
  [ "$(sha "$TMP/app.js")" = "$APP_EXPECT" ] || { echo "app.js 패치 결과 지문이 표와 달라 중단: $(sha "$TMP/app.js")"; exit 1; }
  echo "운영에서 다시 계산한 패치 결과 = 표의 값($(echo "$APP_EXPECT" | cut -c1-12)) 확인"
fi

say '3/7 백업(바꿀 파일 + DB)'
BK=$BKROOT/$NAME-$(date -u +%Y%m%dT%H%M%SZ)
[ -d "$BKROOT" ] || install -d -m 700 -o "$U" -g "$U" "$BKROOT"   # 없을 때만 만듦(있는 폴더의 권한은 건드리지 않음)
install -d -m 700 -o "$U" -g "$U" "$BK" "$BK/files" "$BK/files/dist" "$BK/files/dist/src"   # 네 단계 모두 ubuntu(1판은 마지막 폴더만 → DB 백업에서 멈춤)
runuser -u "$U" -- test -w "$BK" || { echo "$U가 백업 폴더에 쓸 수 없어 중단(아무것도 바꾸지 않음): $BK"; exit 1; }
echo "$CUR" > "$BK/working-directory.txt"; echo "island-save 판 $HAVE ($MODE)" > "$BK/stage.txt"; echo yes > "$BK/site-changed.txt"
cp -a "$CUR/dist/src/app.js" "$BK/files/dist/src/app.js"
: > "$BK/new-files.txt"
if [ -f "$CUR/dist/src/island-save.js" ]; then cp -a "$CUR/dist/src/island-save.js" "$BK/files/dist/src/island-save.js"; else echo dist/src/island-save.js > "$BK/new-files.txt"; fi
chown -R "$U:$U" "$BK"
runuser -u "$U" -- python3 -I - "$DB" "$BK/confirmed-before.db" <<'PY'
import sqlite3,sys
src=sqlite3.connect(sys.argv[1]);dst=sqlite3.connect(sys.argv[2]);src.backup(dst);dst.close()
ok=sqlite3.connect(sys.argv[2]).execute('pragma integrity_check').fetchone()[0];assert ok=='ok',ok;print('DB 백업 무결성',ok)
PY
restore(){
  cp -a "$BK/files/dist/src/app.js" "$CUR/dist/src/app.js.restore" && mv -f "$CUR/dist/src/app.js.restore" "$CUR/dist/src/app.js"
  if [ -f "$BK/files/dist/src/island-save.js" ]; then cp -a "$BK/files/dist/src/island-save.js" "$CUR/dist/src/island-save.js.restore" && mv -f "$CUR/dist/src/island-save.js.restore" "$CUR/dist/src/island-save.js"
  else rm -f -- "$CUR/dist/src/island-save.js"; fi; }

say '4/7 파일 바꾸기'
# 5판: 어느 줄이 실패해도(예: island-save.js를 놓은 뒤 app.js 교체 실패) set -e로 그냥 끝나지 않고 되돌린다(|| 왼쪽은 set -e가 꺼지므로 && 로 잇고 결과를 봄)
ok4=1
{ install -m 644 -o "$U" -g "$U" "$TMP/island-save.js" "$CUR/dist/src/island-save.js.new" && mv -f "$CUR/dist/src/island-save.js.new" "$CUR/dist/src/island-save.js"; } || ok4=0
if [ "$ok4" = 1 ] && [ "$MODE" = full ]; then { install -m 644 -o "$U" -g "$U" "$TMP/app.js" "$CUR/dist/src/app.js.new" && mv -f "$CUR/dist/src/app.js.new" "$CUR/dist/src/app.js"; } || ok4=0; fi
if [ "$ok4" = 1 ] && cmp -s "$TMP/island-save.js" "$CUR/dist/src/island-save.js" && [ "$(sha "$CUR/dist/src/app.js")" = "$APP_EXPECT" ]; then :; else
  echo '파일 바꾸기 실패 → 이전 파일로 되돌림(서버는 재시작 전이라 영향 없음)'; rm -f -- "$CUR/dist/src/island-save.js.new" "$CUR/dist/src/app.js.new" 2>/dev/null || true; restore
  [ "$(sha "$CUR/dist/src/app.js")" = "$APP_NOW" ] && { [ -f "$BK/files/dist/src/island-save.js" ] || [ ! -e "$CUR/dist/src/island-save.js" ]; } && echo '되돌림 확인(app.js 지문이 적용 전과 같음)' || echo "되돌림 확인 실패. 백업: $BK"
  exit 1; fi

say '5/7 재시작'
systemctl restart gmm-server 9>&- || true

say '6/7 확인'
if healthy && check; then
  say "완료: 섬 계정 저장 판 $VER 동작(/my/api/island)"
  echo "백업 폴더: $BK"
  echo "되돌리기: deploy/tools/defense-rollback.sh 에 이 백업 폴더를 넣어 실행(같은 백업 형식). IslandSave 표·더한 칸은 남아도 영향 없음"
else
  echo '확인에 실패해 이전 파일로 되돌립니다.'; restore; systemctl restart gmm-server 9>&- || true
  if healthy; then echo '되돌림 완료(이전 상태로 정상 실행 중).'; else echo "되돌림 뒤에도 서버 확인 실패. 백업: $BK"; fi
  exit 1
fi

say '7/7 참고: 외래키 검사(PRAGMA foreign_keys) — 운영과 같은 Prisma 연결로 한 번 찍음(실패해도 패치에는 영향 없음)'
PID=$(systemctl show gmm-server -p MainPID --value); NODE=$(readlink -f "/proc/$PID/exe" 2>/dev/null || command -v node || true)
# DBURL은 1/7에서 찾은 값(서버 환경 또는 .env)을 그대로 씀(화면에 찍지 않음)
# A1: require('@prisma/client')가 없으면 동기 예외 → 예전에는 Node 스택 약 20줄. 이제 try로 잡아 한 줄만 찍는다(t/pmock/run.sh가 이 글을 그대로 꺼내 시험).
FK_JS=$(cat <<'JS'
let d;
try { const { PrismaClient } = require('@prisma/client'); d = new PrismaClient(); }
catch (e) { console.log('확인할 수 없음:', String((e && e.message) || e).split('\n')[0]); process.exit(0); }
d.$queryRawUnsafe('PRAGMA foreign_keys')
  .then((r) => { console.log('foreign_keys =', String(Object.values(r[0])[0]), '(1이면 켜짐: 계정 삭제 때 CASCADE로 섬도 지워짐)'); return d.$disconnect(); })
  .catch((e) => { console.log('확인할 수 없음:', String((e && e.message) || e).split('\n')[0]); process.exit(0); });
JS
)
if [ -n "$NODE" ]; then
  ( cd "$CUR" && timeout 30 runuser -u "$U" -- env ${DBURL:+DATABASE_URL="$DBURL"} "$NODE" -e "$FK_JS" 2>/dev/null ) || echo '확인할 수 없음(node/Prisma 실행 실패)'
else echo '확인할 수 없음(node 경로를 못 찾음)'; fi
