// 등대 불빛 모양(순수 계산: three.js·기기 시계를 모름 → tests/lighthouse.test.js). daylight.js가 이 값을 램프 유리·둘레 불빛·빛 번짐·빛줄기에 그대로 씀.
//  · 켜진 등대(🗝 이야기 3장 「등대 등불」을 고침, 또는 이야기를 모르는 장면): 밤(glow)만큼 유리 칸이 밝아지고 둘레 불빛·큰 빛 번짐·도는 빛줄기
//  · 잠든 등대(고치기 전): 빛줄기·큰 불빛은 없고, 밤에만 유리 칸에 숯불 같은 작은 불씨가 천천히 숨 쉼(주황 빛 번짐 + 아주 약한 불빛).
//    밤에 깜깜하기만 하면 고장 난 것처럼 보여서, '꺼진 게 아니라 잠든' 등대로 보이게 함
//  · boost(3장 등불·엔딩 연출): 낮에도 켬. fill: 3장 등불을 고친 순간 밤 불빛이 0 → 1로 차오름(툭 켜지지 않고, 불씨에서 이어짐)
export const LH_LIT = 0xffc24a, LH_EMBER = 0xff5a1e;                       // 유리 칸 발광 색: 켜진 불(따뜻한 노랑) · 잠든 불씨(짙은 주황)
export const LH_HALO_LIT = 0xffd98a, LH_HALO_EMBER = 0xff7a32;             // 램프 둘레 빛 번짐 색
export const LH_BEACON_LIT = 0xffd27a, LH_BEACON_EMBER = 0xffa040;         // 둘레 불빛(PointLight) 색: 불씨면 날개·난간에 호박색이 살짝
const c01 = v => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/** { glow 0~1(밤 정도), lit(등불을 고쳤나), boost 0~1(연출), fill 0~1(고친 뒤 차오름), t 초(불씨 숨쉬기) } →
 *  { n 켜진 불빛 세기, ember 잠든 불씨 세기, warm 0(불씨 색)~1(켜진 색), glass 유리 발광 세기, beacon 둘레 불빛(PointLight), halo 빛 번짐 불투명도, haloScale, beam 빛줄기 세기 } */
export function lighthouseLook({ glow = 0, lit = true, boost = 0, fill = 1, t = 0 } = {}) {
  const g = c01(glow), b = c01(boost), f = c01(fill);
  const n = Math.max(lit ? g * f : 0, b);
  const breathe = 0.78 + 0.22 * Math.sin(t * 1.7);                        // 약 3.7초에 한 번 천천히 숨 쉼
  const ember = (lit ? 1 - f : 1) * g * (1 - b) * breathe;
  const warm = n + ember > 1e-4 ? n / (n + ember) : lit || b > 0 ? 1 : 0;
  const glass = 0.12 + 0.78 * Math.max(lit ? f : 0, b) + 3.5 * n + 1.8 * ember;   // 꺼진 유리 0.12 · 낮에 켜진 유리 0.9 · 밤 4.4 · 불씨 많아야 약 1.9(차오르는 동안 줄지 않고 늘기만)
  return { n, ember, warm, glass, beacon: 30 * n + 1.8 * ember, halo: Math.max(0.85 * n, 0.5 * ember), haloScale: 1.9 + 2.6 * warm, beam: n };
}
