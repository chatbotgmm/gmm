// 길 무늬(돌길 돌·틈, 나무 데크 널빤지·이음매, 흙길 자갈): 바닥 청크 재질에 셰이더로 그림.
// 꼭짓점 색으로는 칸당 4조각(멀리선 1조각)보다 잔 무늬를 못 그려서(예전 데크 줄무늬는 꼭짓점 위치에서 늘 0이라 아예 안 보였음) 픽셀마다 계산.
// 세기는 꼭짓점 속성 aPath(종류 + 비율을 수 하나로, groundChunks.js packPath)로 정해 길 칸에만, 칸 선에 맞춰(격자 좌표) 그림.
// 줌에 맞게: 무늬 한 조각이 화면에서 몇 픽셀인지(fwidth)로, 너무 작아지면(약 3픽셀 밑) 잔 무늬는 옅어지고 굵은 무늬(칸 단위)만 남음 → 멀리서도 반짝이거나 물결무늬가 생기지 않음.
// 계절 셰이더(seasons.js)보다 먼저(같은 color_fragment 자리 바로 뒤) 들어가서 눈·가을빛은 무늬 위에 덮임. 툰·클레이 복사본은 toon.js가 onBeforeCompile을 그대로 옮김.
import { CELL, GRID_W, GRID_H } from "../config.js";

const gpf = n => (Number.isInteger(n) ? n.toFixed(1) : String(n));
export const PATTERN = { deckRows: 4, stones: 3, pebbles: 7 };   // 칸당 널빤지 줄·돌 줄·자갈 칸 수(시험용으로 내보냄)

const GLSL = `
float gpH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// 화면에서 한 조각이 몇 픽셀인지 → 1(잘 보임) ~ 0(너무 작음)
float gpFade(float fwPerUnit) { return 1.0 - smoothstep(0.22, 0.4, fwPerUnit); }
// 나무 데크: 칸당 ${PATTERN.deckRows}줄 널빤지(x 방향으로 놓임), 줄마다 밝기 조금씩, 틈은 어둡게, 이음매는 줄마다 엇갈림
float gpDeck(vec2 p, float fw) {
  float rows = ${gpf(PATTERN.deckRows)}, q = p.y * rows, row = floor(q), fy = fract(q);
  float aa = fw * rows;                                       // 널빤지 한 줄 기준 한 픽셀
  float gapY = 1.0 - smoothstep(0.05, 0.05 + aa * 1.2, min(fy, 1.0 - fy));
  float qx = p.x * 0.5 + gpH(vec2(row, 3.7));                  // 널빤지 길이 2칸, 줄마다 이음매 자리 다르게
  float fx = fract(qx), gapX = 1.0 - smoothstep(0.012, 0.012 + fw * 0.5 * 1.2, min(fx, 1.0 - fx));
  float plank = gpH(vec2(row, floor(qx))) - 0.5;
  float fine = gpFade(aa);
  float coarseRow = floor(p.y * 2.0), coarse = (gpH(vec2(coarseRow, floor(p.x * 0.5) + 9.1)) - 0.5) * 0.10;   // 멀리서도 보이는 굵은 결(칸 반 폭)
  return 1.0 + fine * (plank * 0.16 - 0.30 * max(gapY, gapX)) + (1.0 - fine) * coarse;
}
// 돌길: 칸당 ${PATTERN.stones}줄 둥근 네모 돌, 줄마다 반 개씩 엇갈림, 돌마다 밝기 다르고 틈(줄눈)은 어둡게
float gpCobble(vec2 p, float fw) {
  float n = ${gpf(PATTERN.stones)}; vec2 q = p * n; float row = floor(q.y); q.x += 0.5 * mod(row, 2.0);
  vec2 id = floor(q), f = fract(q) - 0.5; float r = 0.16;
  float e = r - length(max(abs(f) - (0.5 - r), 0.0));         // 돌 안쪽으로 갈수록 +(테두리 0)
  float aa = fw * n;
  float mortar = 1.0 - smoothstep(0.06, 0.06 + aa * 1.2, e);
  float stone = gpH(id + 0.37) - 0.5;
  float fine = gpFade(aa);
  vec2 cid = floor(p * 1.5); float coarse = (gpH(cid + 5.3) - 0.5) * 0.12;   // 멀리서: 칸 크기 얼룩
  return 1.0 + fine * (stone * 0.22 - 0.34 * mortar) + (1.0 - fine) * coarse;
}
// 흙길: 잔 자갈(어두운 점)·밝은 모래알, 멀리서는 굵은 얼룩
float gpDirt(vec2 p, float fw) {
  float n = ${gpf(PATTERN.pebbles)}; vec2 q = p * n, id = floor(q), f = fract(q) - 0.5;
  float h = gpH(id + 1.9), aa = fw * n;
  vec2 c = vec2(gpH(id + 4.1), gpH(id + 8.3)) * 0.5 - 0.25;   // 자갈 자리(칸 안에서 조금씩)
  float peb = h > 0.62 ? 1.0 - smoothstep(0.16, 0.16 + aa * 1.2, length(f - c)) : 0.0;
  float grain = h < 0.2 ? 0.06 : 0.0;
  float fine = gpFade(aa);
  float coarse = (gpH(floor(p * 1.5) + 2.2) - 0.5) * 0.12;
  return 1.0 + fine * (grain - 0.24 * peb) + (1.0 - fine) * coarse;
}`;

/** 땅 재질에 길 무늬를 붙임(먼저 붙은 onBeforeCompile은 먼저 부르고 이어서) */
export function groundPattern(mat) {
  if (mat.userData.groundPattern) return mat; mat.userData.groundPattern = true;
  const prev = Object.prototype.hasOwnProperty.call(mat, "onBeforeCompile") ? mat.onBeforeCompile : null, prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.vertexShader = "attribute float aPath; varying float vPath; varying vec2 vPatP;\n" + sh.vertexShader.replace("#include <begin_vertex>",
      `#include <begin_vertex>\n vPath = aPath; vPatP = (modelMatrix * vec4(transformed, 1.0)).xz / ${gpf(CELL)} + vec2(${gpf(GRID_W / 2)}, ${gpf(GRID_H / 2)});`);
    sh.fragmentShader = "varying float vPath; varying vec2 vPatP;\n" + GLSL + "\n" + sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      if (vPath > 0.5) {
        vec2 gpFw2 = fwidth(vPatP); float gpFw = max(max(gpFw2.x, gpFw2.y), 1e-5);
        float gpK = floor(vPath) - 1.0, gpW = clamp((fract(vPath) - 0.05) / 0.9, 0.0, 1.0);                  // 종류(0 돌길·1 데크·2 흙길)와 세기(groundChunks.js packPath)
        float gpM = gpK < 0.5 ? gpCobble(vPatP, gpFw) : gpK < 1.5 ? gpDeck(vPatP, gpFw) : gpDirt(vPatP, gpFw);
        diffuseColor.rgb *= mix(1.0, gpM, gpW);
      }`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : "") + "-pattern";
  mat.needsUpdate = true;
  return mat;
}
