// 🗝 메인 스토리 「갈매미섬의 비밀」 글과 조각 표(데이터만: 계산은 world/story.js, 수첩 화면은 ui/storyView.js).
// 덤으로 즐기는 작은 이야기: 싸움·기한이 없고 평소처럼 놀면 조금씩 채워짐.
// 단서는 플레이어가 직접 줍는 반짝이 · 갈매미가 털어놓는 말 · 하늘 · 소식지·편지 · 수족관 · 작은 섬에서만(갈매미가 낚거나 주운 소지품은 단서가 아님).
// 조각마다 how = 얻는 길(world/story.js가 읽음) · hint = [흐릿한 힌트, 구체적인 힌트](장이 열린 뒤 마을 이틀 동안 조각이 안 늘면 구체적으로) · bonus = 덤(없어도 다음 장)
// text의 {who}는 들려준 갈매미 이름으로 바뀜.

export const STORY_TITLE = "갈매미섬의 비밀";
export const STORY_NEED = 3;            // 장마다 아무 조각이나 3개 → 그 장의 '고칠 곳'이 열림
export const STORY_SEEDS = 3;           // 별씨 3개 = 조각 한 칸 + 등불 고치기 재료
export const STORY_HINT_DAYS = 2;       // 장이 열리고(또는 마지막 조각 뒤) 마을 이틀 동안 조각이 안 늘면 구체적인 힌트
export const STORY_CARD_DAYS = 3;       // 엽서: 장이 열리고 마을 사흘 안에 '다녀온 사이 편지'로 못 받으면 반짝이 줍기에서 대신
export const STORY_POLE_DAYS = 3;       // 말뚝: 조개섬 반짝이를 마을 사흘 동안 안 주우면 본섬 바닷가로 떠밀려 옴
export const STORY_EVERY = 5;           // 이 장이 열려 있는 동안 5번째로 줍는 반짝이에서 쪽지가 나옴
export const STORY_LAMP_R = 6;          // 동굴 입구에서 이 칸 안의 다 지은 가로등
export const STORY_LAMP_N = 2;
export const STORY_WHALE = "whaleshark";
export const STORY_WHALE_GULL = "물방울";

export const STORY_CHAPTERS = [
  { n: 1, id: "ch1", title: "꺼진 등대", learn: "갈매미들이 오기 전에 이 섬에는 등대를 지키던 사람이 살았어요.",
    restore: { id: "door", icon: "🚪", title: "등대 문", cost: { wood: 2 }, at: "lighthouse",
      done: "문이 살짝 열렸어요", art: "🪑☕ 등대 1층: 작은 의자와 찻잔",
      outro: "등대 안은 먼지투성이였지만, 작은 의자와 찻잔이 그대로 있었어요. 누군가 아주 오래 여기서 살았던 것 같아요." },
    pieces: [
      { id: "c1_sign", icon: "🪧", title: "녹슨 문패", text: "\"보름 등대. 불이 꺼져 있으면 문을 두드려 주세요.\" 글씨가 거의 지워졌어요.",
        how: "spark", at: "lighthouse", hint: ["섬 끝 하얀 탑 근처가 반짝여요", "등대 발치에 떨어진 반짝이가 첫 단서예요"] },
      { id: "c1_note", icon: "📜", title: "젖은 쪽지", text: "\"…오늘도 불을 켰다. 바다가 깜깜하면 길 잃는 날개가 생기니까. — 보름\"",
        how: "every", hint: ["바닷가 반짝이 사이에 젖은 종이가 섞여 있대요…", "이 장에서 반짝이를 다섯 번 주우면 쪽지가 나와요"] },
      { id: "c1_tale", icon: "💬", title: "할머니의 할머니 이야기", text: "{who}: \"우리 할머니가 그랬어. 옛날 이 섬엔 밤마다 불을 켜는 사람이 살았대.\"",
        how: "bond", stage: 2, hint: ["누군가와 정이 들면…", "♥♥ 정든 사이가 된 갈매미가 옛이야기를 들려줘요"] },
      { id: "c1_card", icon: "✉️", title: "우체통에 낀 엽서", text: "빛바랜 엽서 앞면엔 등대 그림, 뒷면엔 \"잘 지내니? 불은 잘 켜고 있단다.\"",
        how: "away", hint: ["잠깐 쉬었다 오면…", "게임을 끄고 10분 넘게 쉬었다 오면 우체통에 끼어 있어요. 사흘이 지나면 반짝이에서도 나와요"] },
    ] },
  { n: 2, id: "ch2", title: "길 잃은 날개들", learn: "갈매미들이 이 섬에 온 까닭과 '갈매미'라는 이름의 유래.",
    restore: { id: "cave", icon: "🕯", title: "메아리 굴 밝히기", lamps: STORY_LAMP_N, at: "cave",
      done: "굴 앞이 밝아졌어요", art: "🪶📏 굴 안쪽 방: 눈금 일곱 줄",
      outro: "불을 밝히자 굴 벽에 눈금이 일곱 줄 보였어요. 아기 새들이 얼마나 컸는지 할머니가 재 준 자국이에요. 이제 불씨도 굴이 무섭지 않대요." },
    pieces: [
      { id: "c2_wall", icon: "🖼", title: "굴 벽 그림", text: "등불을 든 사람 하나와 작은 새 일곱 마리가 그려져 있어요. 새들은 모두 그 사람 쪽을 보고 있어요.",
        how: "spark", at: "cave", hint: ["동굴 입구가 반짝여요", "동굴 입구 앞 반짝이를 주우면 벽 그림이 보여요"] },
      { id: "c2_secret1", icon: "🤫", title: "첫 번째 비밀", text: "{who}: \"너한테만 말할게. 우리 첫 할아버지들은 폭풍 속에서 길을 잃었대. 그때 저 멀리서 작은 불빛이 깜빡였대.\"",
        how: "bond", stage: 3, hint: ["아주 소중한 사이가 되면…", "♥♥♥ 소중한 사이가 된 갈매미는 비밀을 털어놓아요"] },
      { id: "c2_name", icon: "📝", title: "매앰 쪽지", text: "\"아기 새들이 매미처럼 '매앰' 하고 운다. 갈매기도 매미도 아니니 '갈매미'라고 불러야겠다. — 보름\"",
        how: "every", hint: ["'매앰' 하는 소리가 어디서 들리는 것 같아요…", "이 장의 다섯 번째 반짝이 밑에 쪽지가 깔려 있어요"] },
      { id: "c2_rainbow", icon: "🌈", title: "무지개 끝 깃털", text: "무지개가 닿은 자리에 아기 새 깃털을 엮은 작은 매듭이 있었어요.", bonus: true,
        how: "sky", sky: "rainbow", hint: ["비가 갠 하늘을 올려다보면…", "무지개가 뜨면 등대 둘레에 반짝이가 생겨요"] },
      { id: "c2_festival", icon: "🪺", title: "일곱 둥지 자국", text: "{who}: \"굴 안쪽 바위에 작은 둥지 자국이 일곱 개 나란히 있었어!\"", bonus: true,
        how: "festival", hint: ["다 함께 즐거운 날에…", "계절 축제가 끝나면 함께한 갈매미가 알려 줘요"] },
    ] },
  { n: 3, id: "ch3", title: "별을 줍던 사람", learn: "등불은 별씨로 켜졌다는 것, 할머니가 떠난 까닭, 갈매미들이 마을을 짓는 까닭.",
    restore: { id: "lamp", icon: "🔥", title: "등대 등불", cost: { iron: 1 }, seeds: STORY_SEEDS, at: "lighthouse",
      done: "밤마다 빛줄기가 돌아요", art: "🗼✨ 다시 켜진 등불",
      outro: "불이 켜지자 갈매미들이 하나둘 나와 등대를 올려다봤어요. 아무도 말하지 않았지만, 다들 아는 것 같았어요." },
    pieces: [
      { id: "c3_seed", icon: "🌟", title: "별씨", text: "손바닥에서 따뜻하게 빛나요. \"등불에 넣으렴\" 하는 목소리가 들리는 것 같아요.",
        how: "seed", hint: ["별이 떨어진 다음 날 아침…", "아침 첫 반짝이 때마다 별씨가 하나 생겨요. 유성우가 오는 밤에도 등대 둘레에 떨어져요"] },
      { id: "c3_bottle", icon: "🍾", title: "병 속 편지", text: "\"다리가 예전 같지 않구나. 바다 건너 딸에게 가 보려 해. 반딧불호를 손봐 두었다.\"",
        how: "every", hint: ["파도에 유리병이 굴러다녀요…", "반짝이를 모으다 보면 다섯 번째쯤 병이 걸려 올라와요"] },
      { id: "c3_secret2", icon: "🤝", title: "두 번째 비밀", text: "{who}: \"할머니가 떠나면서 부탁했대. '섬을 따뜻하게 지켜 줘.' 그래서 우리가 집을 짓고 불을 켜는 거야.\"",
        how: "pet", stage: 3, hint: ["소중한 갈매미를 쓰다듬으면…", "이 장이 열린 다음 날, ♥♥♥ 갈매미를 쓰다듬어 주면 입을 열어요"] },
      { id: "c3_whale", icon: "🦈", title: "큰점박이", text: "수족관 고래상어 앞에서 갈매미들이 속삭여요. \"저 무늬… 할머니 배를 끌어 준 큰점박이랑 닮았다!\"",
        how: "whale", hint: ["아주 큰 손님이 수족관에…", "고래상어를 수족관에 들이거나, 물방울 갈매미와 소중한 사이가 되면 알게 돼요"] },
      { id: "c3_snow", icon: "❄️", title: "첫눈 오던 날", text: "할머니는 첫눈 오던 날 떠났대요. 눈 위에 작은 발자국만 남기고요.", bonus: true,
        how: "snow", hint: ["하얀 것이 처음 내리는 날…", "겨울 첫눈이 오면 알게 돼요"] },
    ] },
  { n: 4, id: "ch4", title: "다시 켜진 불", learn: "할머니가 떠난 자리와 할머니의 답장.",
    restore: { id: "mailbox", icon: "📮", title: "반딧불 우체통", cost: { wood: 2 }, at: "pole", afterEnd: true,
      done: "작은 우체통이 생겼어요", art: "📮🌙 계절마다 할머니 엽서",
      outro: "말뚝 자리에 작은 우체통을 세웠어요. 이제 계절마다 바다 건너에서 엽서가 올 거예요." },
    pieces: [
      { id: "c4_lit", icon: "🗼", title: "켜진 등대", text: "오늘 밤, 보름 등대에 다시 불이 켜졌어요.",
        how: "lit", hint: ["등불을 고치면…", "3장의 등대 등불을 고치면 바로 얻어요"] },
      { id: "c4_pole", icon: "🪵", title: "조개섬의 말뚝", text: "모래에 반쯤 묻힌 말뚝에 밧줄 자국이 있어요. \"반딧불호, 여기서 떠나다.\"",
        how: "spark", at: "islet", hint: ["가장 먼 작은 섬에서…", "조개섬 모래밭에 반짝이가 있어요. 사흘 지나면 본섬 바닷가로 떠밀려 와요"] },
      { id: "c4_blink", icon: "💫", title: "깜빡이는 대답", text: "수평선 끝에서 작은 불빛이 세 번 깜빡였어요. 반짝, 반짝, 반짝.",
        how: "blink", hint: ["불을 켠 뒤 첫 밤에…", "등불을 켠 뒤 밤이 오거나, 마을 하루가 지나면 소식이 와요"] },
      { id: "c4_reply", icon: "💌", title: "보름의 답장", text: "\"사랑하는 갈매미들에게, 그리고 새 등불지기에게.\" 바다를 건너온 유리병 편지예요.",
        how: "spark", at: "lighthouse", hint: ["세 조각이 모이면…", "켜진 등대·말뚝·깜빡임을 모으면 다음 반짝이 차례에 유리병이 와요"] },
    ] },
];
/** 조각 id → { ...조각, ch: 장 번호 } */
export const STORY_PIECES = Object.fromEntries(STORY_CHAPTERS.flatMap(c => c.pieces.map(p => [p.id, { ...p, ch: c.n }])));
export const STORY_PIECE_IDS = Object.keys(STORY_PIECES);
export const STORY_TOTAL = STORY_PIECE_IDS.length;   // 18
export const STORY_BONUS = STORY_PIECE_IDS.filter(id => STORY_PIECES[id].bonus);

// 엔딩: 보름의 답장(넘길 수 있음)
export const STORY_LETTER = {
  title: "💌 보름의 답장",
  lines: [
    "사랑하는 갈매미들에게, 그리고 새 등불지기에게.",
    "어젯밤 창가에서 우리 섬 쪽을 보다가 불빛을 봤단다. 얼마나 기뻤는지 몰라.",
    "나는 딸네 항구에서 잘 지내. 다리는 느려졌지만 밤마다 바다를 봐.",
    "너희가 섬을 이렇게 따뜻하게 지켜 줬구나. 이제 그 섬과 그 불은 너희 거야.",
    "불이 켜져 있는 한, 나는 언제나 보고 있을게.",
  ],
  sign: "— 보름",
};
export const STORY_STAMP = "🏮 등불지기";
export const STORY_CHAIR = "bormChair";            // 엔딩 선물 가구(catalog ITEMS·FURNITURE)
export const STORY_PICTURE = "🧓🐣🐣🐣🐣🐣🐣🐣 할머니와 아기 새 일곱 마리";   // 덤 조각을 다 모으면 수첩에 붙는 그림

// 엔딩 뒤 반딧불 우체통에 계절마다 오는 엽서(숙제 없음)
export const STORY_POSTCARDS = {
  spring: "항구에도 벚꽃이 피었단다. 꽃잎 하나를 편지에 넣었어. 아기 새들 이름은 다 지었니? — 보름",
  summer: "여름 바다는 반짝반짝하지. 큰점박이가 우리 항구 앞을 지나갔대. 너희 섬 쪽으로 갔을 거야. — 보름",
  autumn: "단풍이 들면 등대 계단이 생각나. 오르기 힘들었지만 꼭대기 바람은 참 좋았지. 잘 지내렴. — 보름",
  winter: "첫눈이 오면 너희 섬도 하얗겠구나. 등불 옆은 따뜻하니까, 다들 감기 조심하렴. — 보름",
};
