// 톡톡 콕 찌르기(아이디어 문서 2번): 갈매미를 가볍게 톡 치면 성격(종족 이름)대로 반응.
//  · 횟수 제한 없음 · 정(bond)·재미·돈은 안 바꿈(쓰다듬기 쉬는 시간·하루 정 상한과 따로 — 우회 수단이 되지 않음) · 월드 난수(rnd·wrnd)를 안 씀(자기 씨앗 난수).
//  · 반응 표: 9종 × 대사 3~4개 + 몸짓(폴짝·도망·느릿 돌아보기·비켜서기·두리번). 몸짓은 한가한 갈매미(쉬기·산책·구경)만,
//    일하거나 가는 중이면 말풍선만(공사·낚시·장사를 끊지 않음).
//  · 자는 갈매미: 💤가 커졌다가 뒤척임(깨우지 않음).
//  · 연타: POKE_COMBO_GAP초 안에 잇달아 POKE_COMBO번이면 신나서 뛰어놀기(zoomies) 또는 POKE_SULK초 동안 살짝 삐침.
//    삐침은 이 모듈 안(Map)에만 있어 저장하지 않음. 삐친 동안 톡 = 등 돌리고 "흥".
//  · 첫 탭 규칙(systems/unitControl.js): 따라가지 않던 갈매미 탭 = 따라가기 + 반응, 이미 따라가는 갈매미 탭 = 톡.
import { PERSONA } from "../data/catalog.js";
import { personaOf, formOf, POKE_HINT, BASE_FORM, addNote } from "../world/evolve.js";
import { UnitState } from "../data/types.js";
const UST = UnitState;
import { nearestWalkable } from "../world/pathfinding.js";
import { seededRandom } from "../util.js";
import { emote, setIdle, _startPathForTest as pokePath, _pokeApi } from "./unitBrain.js";
import { isAsleep } from "../world/dreams.js";

export const POKE_COMBO = 5;          // 연타로 치는 횟수
export const POKE_COMBO_GAP = 1.2;    // 이 초(실제 시간) 안에 다음 톡이 와야 연타로 이어짐
export const POKE_SULK = 10;          // 삐침 길이(초)
export const POKE_ZOOM_REST = 30;     // 뛰어놀기 뒤 이 초 안에 또 연타하면 "이제 그만~" 삐침

// 몸짓: hop 폴짝 · flee 폴짝 뛰고 두 칸 도망 · slow 한참 뒤 천천히 돌아봄 · aside 비켜섬 · look 돌아봄
export const POKE_TABLE = {
  "기본":    { act: "hop",   lines: ["앗, 깜짝이야!", "응? 불렀어?", "헤헤, 간지러워", "나 여기 있어~"] },
  "목수":    { act: "look",  lines: ["뚝딱! 응?", "망치 조심해~", "나무 냄새 나지?", "다음엔 뭐 지을까?"] },
  "미니":    { act: "flee",  lines: ["히익!", "깜짝이야!", "나, 나 안 먹어!", "…휴, 너였구나"] },
  "자이언트": { act: "slow",  lines: ["……응?", "…불렀나…", "……아, 안녕…", "…천천히… 말해…"] },
  "꽃":      { act: "look",  lines: ["꽃향기 맡았어?", "살랑살랑~", "후후, 안녕", "꽃잎 떨어지겠다~"] },
  "황금":    { act: "hop",   lines: ["반짝! 오늘 운 좋은 날?", "에헴, 무슨 일이오", "톡 쳐도 반짝여!", "어머, 손님?"] },
  "물방울":  { act: "hop",   lines: ["퐁!", "찰방찰방~", "바다 가자!", "물 튄다~"] },
  "불씨":    { act: "hop",   lines: ["앗 뜨거!", "화르륵!", "불똥 조심~", "따뜻하지?"] },
  "그림자":  { act: "aside", lines: ["…", "……저리 가", "…조용히 해 줘", "…뭐야"] },
};
export const POKE_SLEEP = ["음냐…", "으응… 5분만…", "zZ… 뒤척뒤척", "쿨…"];
export const POKE_SULK_LINES = ["흥!", "😤 몰라", "…흥, 안 봐", "그만 찔러~"];
export const POKE_ZOOM_LINES = ["신난다!!", "와아아~", "잡아 봐라~"];
export const POKE_SULK_START = ["😤 이제 그만~", "흥, 삐졌어", "아잉, 그만해!"];
export const POKE_SLEEP_SULK = "으으… 자게 해 줘…";

/** 몸짓을 해도 되는 한가한 상태(일·가는 길·앉은 벤치는 안 끊음) */
const FREE = new Set([UST.Idle, UST.Wander, UST.Avoid, UST.Curious]);
export const isFree = (u, hopOk = false) => FREE.has(u.state) && (!u.once || (hopOk && u.once.key === "Jump")) && !u.insideBuildingId && !u.sailing && !u.swimming;
/** 연타 끝: 뛰어놀기(활발한 종족·기운 있음) 또는 삐침(자이언트·그림자·지침·잠·바로 전에 뛰어놀았음) */
export const comboKind = (u, zoomedAgo = Infinity) => {
  const p = personaOf(u);
  return isAsleep(u) || p.loner || !p.zoomies || (u.needs?.energy ?? 100) < 25 || zoomedAgo < POKE_ZOOM_REST || !isFree(u, true) ? "sulk" : "zoom";   // 톡 폴짝(Jump) 중이어도 뛰어놀기로
};

export class Poke {
  constructor(world, seed = 1) { this.world = world; this.rnd = seededRandom(seed); this.st = new Map(); this.later = []; this.now = 0; }
  /** 갈매미별 저장 안 하는 상태 { n: 연타 수, t: 마지막 톡, k: 대사 차례, sulk: 삐침 끝, zoom: 뛰어논 때 } */
  of(u) { let s = this.st.get(u.unitId); if (!s) this.st.set(u.unitId, s = { n: 0, t: -9, k: 0, sulk: 0, zoom: -Infinity }); return s; }
  sulking(u) { return this.of(u).sulk > this.now; }
  /** 매 프레임(실제 초): 미뤄 둔 몸짓(자이언트 느릿 돌아보기·잠 뒤척임) */
  /** 실제 시계로(ms, performance.now): 프레임 dt는 0.05초 상한이라 느린 기기에서 연타 간격·뒤척임이 늦어짐 */
  stepReal(nowMs) { this.step(this.lastMs == null ? 0 : Math.min(1, Math.max(0, nowMs - this.lastMs) / 1000)); this.lastMs = nowMs; }
  step(dt) {
    this.now += dt;
    for (const l of this.later.splice(0)) { if (l.at > this.now) { this.later.push(l); continue; } if (this.world.units.includes(l.u)) l.f(); }
  }
  /** 톡: from = 보는 사람 자리(격자 좌표 {x,z}, 없으면 안 돌아봄). 돌려줌 { kind: "poke"|"sleep"|"sulk"|"zoom"|"sulkStart", line } */
  poke(u, from = null) {
    const s = this.of(u), w = this.world, now = this.now, rnd = this.rnd;
    s.n = now - s.t <= POKE_COMBO_GAP ? s.n + 1 : 1; s.t = now;
    const face = away => { if (!from || !isFree(u, true)) return;   // 일·벤치·낚시 중엔 방향을 안 바꿈(그 일들은 시작할 때 한 번만 방향을 정함)
      const a = Math.atan2(from.x - u.x, from.z - u.z) + (away ? Math.PI : 0); u.heading = a; if (u.state === UST.Idle) u.lookAt = a; };
    const say = (line, secs = 2) => { emote(u, line, secs); return line; };
    if (this.sulking(u)) { s.n = 0; if (!isAsleep(u)) face(true); return { kind: "sulk", line: say(POKE_SULK_LINES[s.k++ % POKE_SULK_LINES.length]) }; }
    if (s.n >= POKE_COMBO) {
      s.n = 0;
      if (comboKind(u, now - s.zoom) === "zoom") {
        u.once = null; u.anim = null; u.activity = null; setIdle(u, rnd, w, 0);
        if (_pokeApi.startActivity(u, "zoomies", w, rnd)) { u.activity = null; s.zoom = now; return { kind: "zoom", line: say(POKE_ZOOM_LINES[s.k++ % POKE_ZOOM_LINES.length], 2.4) }; }
      }
      s.sulk = now + POKE_SULK;
      if (isAsleep(u)) return { kind: "sulkStart", line: say(POKE_SLEEP_SULK, 2.6) };
      face(true); return { kind: "sulkStart", line: say(POKE_SULK_START[s.k++ % POKE_SULK_START.length], 2.4) };
    }
    if (isAsleep(u)) {                                                         // 💤가 커졌다가 뒤척임(안 깨움)
      emote(u, "💤💤", 0.9); const line = POKE_SLEEP[s.k++ % POKE_SLEEP.length];
      this.later.push({ u, at: now + 0.8, f: () => { if (!isAsleep(u)) return; if (!u.insideBuildingId) u.heading += Math.PI * (0.4 + 0.3 * rnd()); emote(u, line, 2.2); } });
      return { kind: "sleep", line };
    }
    let row = POKE_TABLE[formOf(u)] || POKE_TABLE["기본"], line = row.lines[s.k % row.lines.length];
    const hint = u.disp && !u.evo && formOf(u) === BASE_FORM ? POKE_HINT[u.disp] : null;   // 아직 기본인 갈매미: 3번에 1번꼴로 성향 대사·몸짓(단서)
    if (hint && s.k % 3 === 2) { row = { act: hint.act }; line = hint.line; s.hinted = (s.hinted || 0) + 1; addNote(u, `톡: "${hint.line}"`); }
    s.k++;
    if (!isFree(u)) { face(false); return { kind: "poke", act: "say", line: say(line) }; }   // 일하는 중: 말풍선만
    const act = row.act;
    if (act === "slow") { this.later.push({ u, at: now + 1.4, f: () => { if (isFree(u)) { setIdle(u, rnd, w, 3); face(false); } emote(u, line, 2.4); } }); emote(u, "…", 1.2); return { kind: "poke", act, line }; }
    if (act === "look") { if (u.state === UST.Idle) u.timer = Math.max(u.timer, 1.5); face(false); return { kind: "poke", act, line: say(line) }; }
    if (act === "aside") {                                                     // 옆으로 한 칸 비켜섬(보는 쪽과 직각)
      const a = from ? Math.atan2(from.x - u.x, from.z - u.z) + Math.PI / 2 * (rnd() < 0.5 ? 1 : -1) : rnd() * Math.PI * 2;
      const spot = nearestWalkable(w.grid, Math.floor(u.x + Math.sin(a) * 1.5), Math.floor(u.z + Math.cos(a) * 1.5), 1);
      if (spot && pokePath(u, w, spot[0], spot[1])) u.state = UST.Avoid;
      return { kind: "poke", act, line: say(line) };
    }
    face(false); say(line);
    if (act === "flee") {                                                      // 폴짝 뛰고 두 칸 도망(보는 사람 반대쪽)
      const a = from ? Math.atan2(u.x - from.x, u.z - from.z) : rnd() * Math.PI * 2;
      _pokeApi.doOnce(u, "Jump", null, () => { const spot = nearestWalkable(w.grid, Math.floor(u.x + Math.sin(a) * 2), Math.floor(u.z + Math.cos(a) * 2), 1);
        if (spot && pokePath(u, w, spot[0], spot[1], true)) u.state = UST.Flee; });
      return { kind: "poke", act, line };
    }
    _pokeApi.doOnce(u, "Jump", null, null);                                    // 폴짝(하던 산책은 이어 감)
    return { kind: "poke", act: "hop", line };
  }
}
