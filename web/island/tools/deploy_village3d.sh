#!/usr/bin/env bash
# 서버의 village3d 폴더를 섬 버전으로 바꾼다(EC2에서 실행). 필요한 것: bash, curl, tar, python3.
#
#   bash deploy_village3d.sh /village3d/폴더/경로            # 바꾸기 (예전 index.html은 index.village-old.html로 백업)
#   bash deploy_village3d.sh /village3d/폴더/경로 --rollback # 되돌리기
#
# 하는 일: GitHub chatbotgmm/gmm의 BRANCH를 내려받아 web/island를 한 파일(index.html)로 합치고,
#          그 index.html과 assets/suburban/(건물 모델)·assets/gulls/(가벼운 갈매미)만 폴더에 넣는다. models/, assets/nk/, assets/sk/, play.html은 그대로 둔다.
set -euo pipefail

cd /tmp                                   # sudo -u 로 다른 사용자가 실행해도 지금 폴더 권한 문제가 없게
BRANCH="${BRANCH:-ccr-8c22e145-eamoew}"
DIR="${1:-}"
if [ -z "$DIR" ]; then echo "사용법: bash $0 /village3d/폴더/경로 [--rollback]"; exit 1; fi
DIR="${DIR%/}"

if [ "${2:-}" = "--rollback" ]; then
  [ -f "$DIR/index.village-old.html" ] || { echo "백업(index.village-old.html)이 없어요: $DIR"; exit 1; }
  cp "$DIR/index.village-old.html" "$DIR/index.html"
  echo "되돌렸어요: $DIR/index.html ← index.village-old.html"
  exit 0
fi

# 맞는 폴더인지 확인: 갈매미 모델과 기존 index.html이 있어야 함
for f in index.html models/chars.json assets/nk/tree_oak.glb assets/sk/tool-axe.glb; do
  [ -e "$DIR/$f" ] || { echo "이 폴더에 $f 가 없어요. village3d 폴더가 맞는지 확인하세요: $DIR"; exit 1; }
done
command -v python3 >/dev/null || { echo "python3가 없어요 (Amazon Linux: sudo dnf install -y python3, Ubuntu: sudo apt-get install -y python3)"; exit 1; }

# 백업: 처음 한 번은 index.village-old.html, 매번 날짜 붙은 사본도
[ -f "$DIR/index.village-old.html" ] || cp "$DIR/index.html" "$DIR/index.village-old.html"
cp "$DIR/index.html" "$DIR/index.backup-$(date +%Y%m%d-%H%M%S).html"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echo "내려받는 중: chatbotgmm/gmm @ $BRANCH"
curl -fsSL "https://codeload.github.com/chatbotgmm/gmm/tar.gz/refs/heads/$BRANCH" | tar -xz -C "$TMP"
SRC="$(find "$TMP" -maxdepth 1 -mindepth 1 -type d | head -n 1)/web/island"
[ -f "$SRC/tools/bundle.py" ] || { echo "내려받은 파일에 web/island가 없어요"; exit 1; }

python3 "$SRC/tools/bundle.py" "$TMP/index.html" --flat
mkdir -p "$DIR/assets/suburban" "$DIR/assets/gulls"
cp -r "$SRC/assets/suburban/." "$DIR/assets/suburban/"
cp -r "$SRC/assets/gulls/." "$DIR/assets/gulls/"
cp "$TMP/index.html" "$DIR/index.html"

echo
echo "바꿨어요: $DIR/index.html (+ assets/suburban/, assets/gulls/)"
echo "1분쯤 뒤(Cloudflare 캐시 60초) https://gmm.dpdns.org/village3d/ 를 새로고침해 보세요."
echo "되돌리기: bash $0 $DIR --rollback"
