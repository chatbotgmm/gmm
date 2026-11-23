# 서버(EC2)의 /village3d/ 를 섬 버전으로 바꾸기

## 지금 서버 상태 (2026-11-23, 밖에서 확인한 것)
- https://gmm.dpdns.org/village3d/ 는 「갈매미 마을」(web/village와 같은 페이지)이다. Cloudflare를 거치고, 캐시는 60초(`cache-control: public, max-age=60`).
- 섬 버전이 쓰는 파일 중 이미 서버에 있는 것: `models/chars.json`, `models/gmm_char1~8.glb`, `assets/nk/`의 나무·바위·그루터기, `assets/sk/`의 도구(도끼·곡괭이·망치)·광석 바위·건조대·양동이·텍스처.
- 없는 것: `assets/suburban/` (건물 6채 + 텍스처), `assets/gulls/` (가벼운 갈매미 8마리, 약 6 MB). 배포 스크립트가 둘 다 넣는다. 그래서 **`index.html`을 바꾸고 `assets/suburban/` 폴더만 더하면 된다.** `models/`, `assets/nk/`, `play.html`은 그대로 둔다.
- 서버 코드(chatbotgmm/server)는 보지 못했다. 그래서 EC2 안의 폴더 위치와, 바꾼 뒤 서버를 다시 켜야 하는지는 확인하지 못했다.

## 올릴 파일 만들기
    cd web/island
    python3 tools/bundle.py dist/index.html --flat
    cp -r assets/suburban dist/assets/
(`--flat`: 모델을 같은 폴더의 `models/`, `assets/`에서만 찾게 함)

## 올리기 (Windows PowerShell 예시)
`키.pem`, `ec2-user`, `서버주소`는 본인 것으로 바꾼다.

1. EC2에서 village3d 폴더 찾기(chars.json이 있는 models 폴더의 부모):

       ssh -i 키.pem ec2-user@서버주소 "sudo find / -path /proc -prune -o -name chars.json -path '*village3d*' -print 2>/dev/null"

   예: `/home/ec2-user/server/public/village3d/models/chars.json` 이면 폴더는 `/home/ec2-user/server/public/village3d`

2. 백업(되돌릴 때 씀):

       ssh -i 키.pem ec2-user@서버주소 "cp /그/폴더/index.html /그/폴더/index.village-old.html"

3. 압축 파일 올리고 풀기:

       scp -i 키.pem village3d-island.zip ec2-user@서버주소:~/
       ssh -i 키.pem ec2-user@서버주소 "cd /그/폴더 && unzip -o ~/village3d-island.zip"

   (unzip이 없으면 `sudo dnf install -y unzip` 또는 `sudo apt-get install -y unzip`)

4. 1분쯤 기다렸다가(Cloudflare 캐시 60초) https://gmm.dpdns.org/village3d/ 를 연다. 바로 보려면 Cloudflare에서 해당 주소 캐시를 지운다.
   그래도 예전 화면이면 서버가 파일을 시작할 때만 읽는 방식일 수 있으니 서버를 다시 켠다(예: `pm2 restart all`, 쓰는 방식에 따라 다름).

## 되돌리기
    ssh -i 키.pem ec2-user@서버주소 "cd /그/폴더 && cp index.village-old.html index.html"
(`assets/suburban/`은 남아 있어도 예전 페이지에 영향 없음)
