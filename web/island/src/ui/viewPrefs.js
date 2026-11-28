// 화면 보기 갈래(순수: DOM을 모름). 「자세히 보기(관리자)」를 켜면 숨겨 둔 살림 숫자·공식·중앙은행 창구가 보임.
// 규칙(세금·숙박비·금리·물가·대출)은 켜고 끄는 것과 상관없이 그대로 돌아가고, 화면에서만 숨김. 값은 hud가 기기 설정(galmaemiman-ui)에서 읽어 넣음.
export const VIEW = { adv: false };
export const setAdv = on => { VIEW.adv = !!on; };

/** 남은 초 → 쉬운 말(자세히 보기를 켜면 부르는 쪽이 분·초로) */
export const leftWord = s => { const v = Math.max(0, s || 0); return v <= 60 ? "곧" : v <= 240 ? "조금 더" : "한참"; };
/** 만족도(0~100) → 얼굴 */
export const moodFace = sat => sat >= 75 ? "😄" : sat >= 55 ? "🙂" : sat >= 35 ? "😐" : "😣";
