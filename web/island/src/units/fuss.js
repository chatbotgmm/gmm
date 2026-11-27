// 깜짝 소동과 착지 반응(아이디어 문서 5번). 성격 때문에 생긴 작은 해프닝에 🆘 말풍선이 뜨고, 플레이어가 길게 눌러(또는 끌어) 들어 옮기면 풀림.
//  · 소동 2종(물 위에 내려놓기는 막혀 있어 '너무 멀리 헤엄'은 뺌):
//    perch — 미니(PERSONA.timid)가 가까운 자이언트(몸 크기 1.5배 넘음)를 피해 해변 바위 위로 폴짝 올라갔다가 못 내려옴.
//    doze  — 야행성(PERSONA.nocturnal: 불씨·그림자)이 낮에 길(포장도로·흙길이면 '길 한가운데', 아니면 그 자리)에서 꾸벅꾸벅 졺. 진짜 잠(Sleep)은 아님.
//  · 깨어 있는 갈매미만: 기력이 chrono.js sleepBelow + FUSS_AWAKE보다 많고 배부르고(포만감 > FUSS_FULL) 아프지 않으며, 쉬기·산책 중(Idle·Wander)일 때만 시작.
//    소동 중에 기력이 sleepBelow + 2 아래로 떨어지거나 배고파지면 혼자 풀림(잠·먹기 규칙이 언제나 먼저).
//  · 상태는 Idle 위에 얹음: u.fuss = { kind, pin } 하나만 붙이고 unitBrain은 pin이면 그 프레임을 건너뜀(들려 있을 때처럼). 저장하지 않음(World.toJSON이 고른 칸만 저장).
//  · 상한: 마을 하루(news.js newsDay = 마을 시간 600초)에 FUSS_DAILY번, 한 번에 하나, 끝난 뒤 FUSS_GAP초, 연 뒤 FUSS_FIRST초부터. FUSS_LIFE초 안에 못 풀면 혼자 풀림(하트 없음).
//  · 풀면: 💕 말풍선 + 주변 갈매미 "!" 구경(World.notice "fuss") + 소식지(fussSolved). 돈·정·재미는 안 바꿈. 자기 씨앗 난수(월드 rnd는 notice만).
//  · 착지 반응(모든 갈매미): 들었다 내려놓으면 onLand(u, shook) — 눈·모래면 화면이 "쿵!" 자국을 찍음(render/footprints.js thud).
//    들고 있는 동안 FUSS_SHAKE_WIN초 안에 FUSS_SHAKE_SWING m 넘는 폭으로 FUSS_SHAKE_REVS번 방향을 뒤집으면 흔든 것 → 내려놓으면 DIZZY_SECS초 어질어질 걷기.
import { PERSONA } from "../data/catalog.js";
import { UnitState } from "../data/types.js";
import { seededRandom } from "../util.js";
import { emote, setIdle } from "./unitBrain.js";
import { sleepBelow, isNocturnal } from "./chrono.js";
import { isAsleep } from "../world/dreams.js";
import { newsDay } from "../world/news.js";
import { PAVED } from "../world/roads.js";

const FS = UnitState;   // 한 파일 빌드에서 unitBrain.js의 US와 겹치지 않게
export const FUSS_DAILY = 2;        // 마을 하루에 소동 수(마을 전체)
export const FUSS_GAP = 150;        // 소동이 끝난 뒤 다음 소동까지(마을 시간 초)
export const FUSS_FIRST = 90;       // 섬을 연 뒤 첫 소동까지(마을 시간 초)
export const FUSS_CHECK = 5;        // 이 초마다 한 번 살펴봄
export const FUSS_CHANCE = 0.3;     // 살펴볼 때 소동이 날 확률(조건이 맞을 때)
export const FUSS_LIFE = 120;       // 이 초 안에 못 풀면 혼자 풀림
export const FUSS_AWAKE = 15;       // 기력이 잠 문턱보다 이만큼 넘어야 시작
export const FUSS_FULL = 40;        // 포만감이 이보다 많아야 시작(배고프면 먹기가 먼저)
export const FUSS_RANGE = 6;        // 미니↔자이언트, 미니↔바위 거리(칸)
// 해변 바위 꼭대기 높이(m, 모양 variant 0·1·2 = rock_smallA·B·C). 화면에서 잰 메시 꼭대기 0.504·0.466·0.323 m 그대로 —
// 꼭대기가 뾰족해서 조금만 낮춰도 작은 미니 몸통이 바위 옆면에 묻혀 보임(390×844에서 확인)
export const ROCK_TOPS = [0.504, 0.466, 0.323];
export const rockTop = m => ROCK_TOPS[m?.variant ?? 0] ?? ROCK_TOPS[0];
export const DIZZY_SECS = 2;        // 흔든 뒤 어질어질 걷는 시간(실제 초)
export const FUSS_SHAKE_WIN = 1.5;  // 흔들기 판정 창(실제 초)
export const FUSS_SHAKE_SWING = 0.4; // 한 번 흔든 폭(m): 이보다 짧게 되돌아가는 손떨림은 안 셈
export const FUSS_SHAKE_REVS = 3;   // 창 안에 방향을 이만큼 뒤집으면 흔든 것(움직인 길이로 재면 화면 크기·확대에 따라 PC 마우스로는 안 됐음 — 1440×900에서 확인)

export const FUSS_LINES = {
  perch: { sos: ["🆘 무, 무서워서 올라왔는데…", "🆘 못 내려가겠어!", "🆘 누가 좀 내려 줘~"], solved: "💕 휴… 고마워!", self: "끙차… 혼자 겨우 내려왔다", start: "히익! (폴짝)" },
  doze:  { sos: ["🆘 꾸벅… 꾸벅…", "🆘 zZ… (길 한가운데서 졸아요)", "🆘 음냐… 해가 너무 밝아…"], solved: "💕 하암… 고마워, 깜빡 졸았네", self: "하암… 깜빡 졸았다", start: "하암… 졸려…" },
};
export const FUSS_NAME = { perch: "바위 위에서 못 내려오던", doze: "길에서 꾸벅 졸던" };

const free = u => (u.state === FS.Idle || u.state === FS.Wander) && !u.once && !u.insideBuildingId && !u.sailing && !u.swimming && !u.fuss;
/** 소동을 시작해도 되는 깨어 있는 갈매미인가 */
export const fussAwake = (u, world) => free(u) && !isAsleep(u) && !u.sick && (u.full ?? 80) > FUSS_FULL && (u.needs?.energy ?? 100) > sleepBelow(u, world) + FUSS_AWAKE;
/** 소동을 혼자 풀어야 하나(졸리거나 배고파짐 · 야행성 졸기는 밤이 되면) */
const mustEnd = (u, world) => (u.needs?.energy ?? 100) <= sleepBelow(u, world) + 2 || (u.full ?? 80) < 30 || u.sick || (u.fuss.kind === "doze" && world.isNight === true);

/** 미니가 올라갈 바위: 미니에서 FUSS_RANGE칸 안의 해변 바위 가운데 자이언트에서 먼 쪽 → 가까운 쪽 */
export function perchRock(world, u, big) {
  let best = null, bs = -Infinity;
  for (const m of world.modules || []) {
    if (m.defId !== "beachRock") continue; const [x, z] = m.cells[0], cx = x + 0.5, cz = z + 0.5, d = Math.hypot(cx - u.x, cz - u.z);
    if (d > FUSS_RANGE) continue; const s = Math.hypot(cx - big.x, cz - big.z) - d * 0.5; if (s > bs) { bs = s; best = { x: cx, z: cz, cell: [x, z], top: rockTop(m) }; }
  }
  return best;
}

/** 흔들기 판정 한 걸음(h = 들고 있는 동안의 기록): 한쪽으로 FUSS_SHAKE_SWING m 넘게 갔다가 그만큼 되돌아오면 '뒤집기' 1번. 창 안에 FUSS_SHAKE_REVS번이면 true */
export function shakeStep(h, x, z) {
  const p = { x, z };
  if (!h.dir) { const dx = x - h.a.x, dz = z - h.a.z, d = Math.hypot(dx, dz); if (d >= FUSS_SHAKE_SWING) { h.dir = { x: dx / d, z: dz / d }; h.far = p; } return false; }
  const along = q => (q.x - h.a.x) * h.dir.x + (q.z - h.a.z) * h.dir.z;
  if (along(p) >= along(h.far)) { h.far = p; return false; }                       // 같은 쪽으로 더 감
  const bx = x - h.far.x, bz = z - h.far.z, b = Math.hypot(bx, bz);
  if (b < FUSS_SHAKE_SWING || bx * h.dir.x + bz * h.dir.z > -0.5 * b) return false; // 아직 덜 되돌아옴
  h.revs.push(h.t); h.a = h.far; h.dir = { x: bx / b, z: bz / b }; h.far = p;      // 반대쪽으로 충분히 되돌아옴 = 뒤집기
  while (h.revs[0] < h.t - FUSS_SHAKE_WIN) h.revs.shift();
  return h.revs.length >= FUSS_SHAKE_REVS;
}

export class Fuss {
  constructor(world, seed = 1) {
    this.world = world; this.rnd = seededRandom(seed); this.cur = null; this.day = -1; this.n = 0; this.solved = 0;
    this.checkT = 0; this.from = world.time || 0; this.lastEnd = -Infinity; this.held = new Map(); this.dizzy = new Map();
    for (const u of world.units) u.fuss = null;                                  // 저장에 안 들어가지만 혹시 남은 것(시험 받침)
  }
  /** 이 갈매미가 지금 소동 중인가(종류) */
  of(u) { return this.cur && this.cur.u === u ? this.cur.kind : null; }

  /** 소동 하나를 시작(시험·화면 손잡이용으로도). 못 하면 null */
  start(kind, u) {
    const w = this.world; if (this.cur || !u || !w.units.includes(u)) return null;
    let spot = null;
    if (kind === "perch") {
      const big = w.units.find(o => o !== u && !o.insideBuildingId && (o.scale || 1) > 1.5 && Math.hypot(o.x - u.x, o.z - u.z) < FUSS_RANGE) || { x: u.x + 1, z: u.z };
      const r = perchRock(w, u, big); if (!r) return null;
      spot = { x: r.x, z: r.z, y: w.standHeight(r.x, r.z) + r.top }; u.heading = Math.atan2(big.x - r.x, big.z - r.z);
    } else spot = { x: u.x, z: u.z, y: u.y };
    setIdle(u, this.rnd, w, 1); u.anim = null; u.x = spot.x; u.z = spot.z; u.y = spot.y;
    const cell = w.grid.get(Math.floor(u.x), Math.floor(u.z)), road = kind === "doze" && cell && (PAVED.has(cell.groundType) || cell.groundType === "Dirt");
    u.fuss = { kind, pin: true }; this.cur = { kind, u, spot, t: 0, lifted: false, road, k: 0, sayT: 0 };
    const day = newsDay(w.time); if (day !== this.day) { this.day = day; this.n = 0; } this.n++;
    emote(u, FUSS_LINES[kind].start, 1.4); this.cur.sayT = 1.4;
    this.onStart?.(u, kind, road); return this.cur;
  }
  /** 소동 끝: solved = 플레이어가 옮겨 줌(하트·구경·소식) / 아니면 혼자 풀림 */
  end(solved) {
    const c = this.cur; if (!c) return; const u = c.u, w = this.world; this.cur = null; this.lastEnd = w.time; if (u.fuss?.kind === c.kind) u.fuss = null;   // 흔들어 내려놓아 어질어질(dizzy)이면 그대로
    if (!w.units.includes(u)) return;
    if (u.state !== FS.Held && !u.insideBuildingId) { if (u.state === FS.Idle) u.timer = Math.max(u.timer, 1.5); if (!solved && c.kind === "perch") { u.y = w.standHeight(u.x, u.z); const s = w.grid.isWalkable(Math.floor(u.x), Math.floor(u.z)) ? null : this.nearLand(u); if (s) { u.x = s[0] + 0.5; u.z = s[1] + 0.5; u.y = w.standHeight(u.x, u.z); } } }
    if (solved) {
      this.solved++; if (!u.insideBuildingId) emote(u, FUSS_LINES[c.kind].solved + (this.dizzy.has(u) ? " @_@" : ""), 2.8);
      w.notice(u.x, u.z, "fuss", u);                                               // 근처 갈매미가 "!" 하고 쳐다보고 가끔 구경 옴(unitBrain 호기심)
      w.emit("fussSolved", { u, kind: c.kind });
    } else if (!u.insideBuildingId) emote(u, FUSS_LINES[c.kind].self, 2.2);
    this.onEnd?.(u, c.kind, solved);
  }
  nearLand(u) { const g = this.world.grid, x0 = Math.floor(u.x), z0 = Math.floor(u.z);
    for (let r = 1; r <= 3; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (g.isWalkable(x0 + dx, z0 + dz)) return [x0 + dx, z0 + dz]; return null; }

  /** 살펴보기: 조건 맞는 갈매미가 있으면 소동 하나 */
  roll() {
    const w = this.world, day = newsDay(w.time); if (day !== this.day) { this.day = day; this.n = 0; }
    if (this.cur || this.n >= FUSS_DAILY || w.time - this.from < FUSS_FIRST || w.time - this.lastEnd < FUSS_GAP) return null;
    if (this.rnd() >= FUSS_CHANCE) return null;
    const cands = [];
    for (const u of w.units) {
      if (!fussAwake(u, w)) continue; const p = PERSONA[u.name] || {};
      if (p.timid && w.units.some(o => o !== u && !o.insideBuildingId && (o.scale || 1) > 1.5 && Math.hypot(o.x - u.x, o.z - u.z) < FUSS_RANGE) && perchRock(w, u, u)) cands.push(["perch", u]);
      if (isNocturnal(u) && w.isNight === false) cands.push(["doze", u]);
    }
    if (!cands.length) return null;
    const [kind, u] = cands[Math.floor(this.rnd() * cands.length)]; return this.start(kind, u);
  }

  /** 매 프레임(월드를 돌린 뒤·unitControl.update 뒤). dt = 이 프레임에 흐른 마을 시간(소동 수명·살펴보기), real = 실제 초(흔들기·어질어질 — 느린 기기에서도 2초) */
  step(dt, real = dt) {
    const w = this.world;
    this.watchHeld(real);
    for (const [u, d] of this.dizzy) this.stepDizzy(u, d, real);
    const c = this.cur;
    if (!c) { if ((this.checkT -= dt) <= 0) { this.checkT = FUSS_CHECK; this.roll(); } return; }
    const u = c.u; if (!w.units.includes(u)) { this.cur = null; this.lastEnd = w.time; return; }
    if (u.state === FS.Held) { c.lifted = true; return; }
    if (c.lifted) {                                                                 // 내려놓음: 소동 자리에서 0.6 m 넘게 옮겼으면 풀림, 아니면(내려놓기 실패로 돌아옴) 다시 소동
      c.lifted = false;
      if (u.insideBuildingId || Math.hypot(u.x - c.spot.x, u.z - c.spot.z) > 0.6) { this.end(true); return; }
      u.x = c.spot.x; u.z = c.spot.z; if (this.dizzy.delete(u)) u.anim = null; u.fuss = { kind: c.kind, pin: true };   // 흔들기만 하고 제자리면 어질어질 대신 소동을 이어 감
    }
    c.t += dt;
    if (c.t > FUSS_LIFE || mustEnd(u, w) || u.insideBuildingId) { this.end(false); return; }
    // Idle 위에 얹은 소동: 제자리·쉬는 모습으로 붙잡아 둠(톡의 폴짝·도망 길도 지움)
    if (u.state !== FS.Idle) u.state = FS.Idle; u.path = null; u.goal = null; u.once = null; u.anim = null; u.timer = Math.max(u.timer, 1);
    u.x = c.spot.x; u.z = c.spot.z; u.y = c.spot.y;
    if (c.kind === "doze") u.lookAt = undefined;
    if ((c.sayT -= dt) <= 0 && !(u.emoteT > 0.3)) { const L = FUSS_LINES[c.kind].sos; emote(u, L[c.k++ % L.length], 3); c.sayT = 3.6; }
  }

  /** 들려 있는 갈매미를 지켜봄: 흔들었는지 · 내려놓는 순간(onLand) */
  watchHeld(dt) {
    const w = this.world;
    for (const u of w.units) {
      let h = this.held.get(u);
      if (u.state === FS.Held) {
        if (!h) this.held.set(u, h = { t: 0, shook: false, a: { x: u.x, z: u.z }, far: null, dir: null, revs: [] });
        h.t += dt; if (!h.shook && shakeStep(h, u.x, u.z)) { h.shook = true; emote(u, "으아아~ 흔들지 마~", 1.5); }
      } else if (h) {
        this.held.delete(u);
        if (!w.units.includes(u) || u.insideBuildingId || u.swimming) continue;
        const thud = this.onLand?.(u, h.shook);                                     // 화면: 눈·모래면 쿵 자국(돌려주는 값: 'snow' | 'sand' | null)
        if (thud) emote(u, "쿵!", 1.2);
        if (h.shook) this.startDizzy(u);
      }
    }
  }
  startDizzy(u) {
    setIdle(u, this.rnd, this.world, 1); u.fuss = { kind: "dizzy", pin: true }; u.anim = "Walk";
    this.dizzy.set(u, { t: 0, spin: this.rnd() < 0.5 ? 1 : -1 }); emote(u, "@_@ 어질어질~", DIZZY_SECS);
  }
  stepDizzy(u, d, dt) {
    const w = this.world;
    if (!w.units.includes(u) || u.state === FS.Held || u.insideBuildingId) { this.dizzy.delete(u); if (u.fuss?.kind === "dizzy") u.fuss = null; if (u.anim === "Walk") u.anim = null; return; }
    d.t += dt; u.state = FS.Idle; u.path = null; u.once = null;
    if (d.t >= DIZZY_SECS) { this.dizzy.delete(u); u.fuss = null; u.anim = null; setIdle(u, this.rnd, w, 1.2); emote(u, "휴… 이제 괜찮아", 1.4); return; }
    // 비틀비틀: 한쪽으로 빙글 돌면서 머리가 좌우로 흔들림. 갈 수 없는 칸이면 방향을 꺾음
    u.heading += (d.spin * 1.8 + Math.sin(d.t * 9) * 2.4) * dt;
    const sp = 0.7 * Math.min(1.4, u.scale || 1), nx = u.x + Math.sin(u.heading) * sp * dt, nz = u.z + Math.cos(u.heading) * sp * dt;
    if (w.grid.isWalkable(Math.floor(nx), Math.floor(nz))) { u.x = nx; u.z = nz; } else u.heading += Math.PI / 2;
    const h = w.standHeight(u.x, u.z); if (h != null) u.y += (h - u.y) * Math.min(1, dt * 12);
  }
}
