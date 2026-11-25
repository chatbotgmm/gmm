// 드문 하늘(순수 계산: 화면·기기 시계를 모름): 무지개 · 유성우 · 첫눈.
// 날씨 난수(wrnd)·마을 난수(rnd)와 따로 굴리는 난수(world.skyRnd)만 써서, 하늘 일이 다른 일의 순서를 바꾸지 않음.
// secs: 떠 있는 시간(마을 시간, 초) · item: 낚시·바닷가에서 물건을 찾을 확률 배수(world.fx.item) · emote: 올려다본 갈매미의 말풍선
export const SKY_EVENTS = {
  rainbow: { name: "무지개", icon: "🌈", secs: 90, item: 1.5, emote: "🌈", text: "비가 그치고 무지개가 떴어요!", note: "떠 있는 동안 낚시·바닷가에서 물건을 더 잘 찾아요" },
  meteor: { name: "유성우", icon: "🌠", secs: 75, item: 1, emote: "✨", text: "밤하늘에 별똥별이 쏟아져요!", note: "깨어 있는 야행성 갈매미가 별조각을 주울지도 몰라요" },
  firstSnow: { name: "첫눈", icon: "❄️", emote: "❄️", text: "첫눈이 내려요!" },   // 겨울마다 한 번(떠 있는 시간 없음: 알림·소식·기록만)
};
export const RAINBOW_CHANCE = 0.4;        // 낮에 비·폭풍이 맑음으로 바뀔 때 무지개가 뜰 확률
export const METEOR_CHECK_SECS = 30;      // 맑은 밤이 이만큼 이어질 때마다 한 번 굴림
export const METEOR_CHANCE = 0.03;        // 그때 유성우가 올 확률(맑은 밤 약 17분에 한 번꼴)
export const STAR_CHECK_SECS = 10;        // 유성우 동안 이만큼마다, 밖에서 깨어 있는 야행성 갈매미마다 한 번 굴림
export const STAR_CHANCE = 0.12;          // 그때 별조각을 주울 확률
export const STAR_MAX = 2;                // 유성우 한 번에 줍는 별조각은 많아야 이만큼
export const STAR_ITEM = "stardust";      // 별조각(ITEMS의 id)
export const SKY_LOOK_CHANCE = 0.5;       // 하늘 일이 시작될 때, 밖에서 깨어 있는 갈매미가 올려다볼 확률

/** 저장에서 읽은 하늘 기록(예전 저장엔 없음 → 모두 0): { rainbow, meteor, firstSnow } */
export const skySeenFromSave = s => Object.fromEntries(Object.keys(SKY_EVENTS).map(k => [k, Math.max(0, Math.floor(+s?.[k] || 0))]));
/** 이 날짜가 속한 겨울의 해(12월이 든 해: 1~2월은 지난해 겨울). 화면이 world.winterYear에 넣어 줌 */
export const winterYearOf = date => date.getFullYear() - (date.getMonth() < 2 ? 1 : 0);
/** 하늘 난수의 씨앗: 섬 씨앗 + 저장된 마을 시간(초). 시간을 섞지 않으면 불러올 때마다 똑같은 순서가 되풀이돼 같은 때에만 뜨거나 영영 안 뜸 */
export const skySeed = (seed, time = 0) => ((+seed || 0) * 104729 + 31 + Math.floor(+time || 0) * 7919) >>> 0;
