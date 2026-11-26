// 갈매미 모델 받기(DOM·three 없는 순수 로직): 처음에 갈매미 목록(chars.json)과 9종 모델을 한 번 받아 메모리(map)에 두고,
// 섬(views.js)·방(room.js)은 이 map만 씀(다시 받지 않음). 받기가 실패하면 간격을 늘려 가며 자동으로 다시 받고,
// 그래도 안 되면 state = "failed" → 불러오는 중 화면이 까닭 + [다시 시도]를 보여 줌. 다시 시도는 못 받은 것만 다시 받음.

/** 자동 다시 받기 간격(ms): 첫 실패 뒤 1.5초 → 4초 → 10초, 세 번 다시 받고(모두 네 번) 그래도 안 되면 단추.
 *  폰이 와이파이↔데이터를 바꾸거나 서버가 잠깐 바쁜 정도는 몇 초 안에 풀리고, 기다림이 15.5초를 넘으면 말없이 더 기다리기보다 까닭을 보여 주는 편이 나음 */
export const RETRY_DELAYS = [1500, 4000, 10000];

/** n번째 실패(0부터) 뒤 기다릴 시간. 더 다시 받지 않으면 null */
export const retryDelay = (n, delays = RETRY_DELAYS) => (n >= 0 && n < delays.length ? delays[n] : null);

const realSleep = ms => new Promise(r => setTimeout(r, ms));

/** fn을 부르고, 실패하면 retryDelay만큼 기다렸다 다시. 다 실패하면 마지막 오류를 던짐. onRetry(다시 받는 번째 1~, 기다린 ms, 오류) */
export async function withRetry(fn, { delays = RETRY_DELAYS, sleep = realSleep, onRetry = null } = {}) {
  for (let n = 0; ; n++) {
    try { return await fn(n); }
    catch (e) { const d = retryDelay(n, delays); if (d === null) throw e; onRetry?.(n + 1, d, e); await sleep(d); }
  }
}

/** 아직 map에 없는(못 받은) 갈매미 */
export const missingChars = (chars, map) => chars.filter(c => !map.has(c.name));

/** 처음에 한 번 받아 두는 갈매미 모델 묶음. loadSet() → { dir, chars }, loadChar(set, c) → 캐릭터(무엇이든) */
export class GullPool {
  constructor({ loadSet, loadChar, delays = RETRY_DELAYS, sleep = realSleep }) {
    Object.assign(this, { loadSet, loadChar, delays, sleep });
    this.map = new Map(); this.set = null; this.state = "idle";                   // idle → loading → done | failed(→ retry() → loading)
    this.errors = new Map(); this.setError = null; this.retrying = new Set();      // 이번 차례에 못 받은 것(이름 → 오류) · 지금 다시 받으려고 기다리는 것
    this.listeners = new Set(); this.runs = 0;
    this.ready = new Promise(r => { this._done = r; });                           // 9종을 다 받으면(실패하면 [다시 시도] 뒤에라도) 풀림
    this.setReady = new Promise(r => { this._setDone = r; });                     // 갈매미 목록을 받으면 풀림
  }
  get total() { return this.set ? this.set.chars.length : 0; }
  has(name) { return this.map.has(name); }
  get(name) { return this.map.get(name); }
  /** 바뀔 때마다 부름(받음·실패·다시 받는 중). 돌려준 함수로 끊음 */
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) { try { f(this); } catch (e) { console.error(e); } } }
  /** 받기 시작(한 번만). 돌려준 Promise는 이번 차례가 끝나면(다 받았거나 실패해 멈춤) 풀림 — 9종을 다 받은 때는 ready */
  start() { if (this.state === "idle") this.round = this.run(); return this.round; }
  /** [다시 시도]: 실패해 멈춘 때만. 이미 받은 것은 그대로 두고 못 받은 것만 다시 받음 */
  retry() { if (this.state !== "failed") return false; this.round = this.run(); return true; }
  progress() {
    return { state: this.state, done: this.map.size, total: this.total, setKnown: !!this.set, retrying: this.retrying.size,
      failed: this.set ? missingChars(this.set.chars, this.map).filter(c => this.errors.has(c.name)).map(c => c.name) : [],
      setFailed: !!this.setError, kinds: [...this.errors.values(), ...(this.setError ? [this.setError] : [])].map(e => e?.kind || "error") };
  }
  async run() {
    this.runs++; this.state = "loading"; this.errors.clear(); this.setError = null; this.emit();
    const opt = key => ({ delays: this.delays, sleep: this.sleep, onRetry: () => { this.retrying.add(key); this.emit(); } });
    if (!this.set) {
      try { this.set = await withRetry(() => this.loadSet(), opt("#set")); this._setDone(this.set); }
      catch (e) { this.setError = e; this.state = "failed"; this.emit(); return; }
      finally { this.retrying.delete("#set"); }
      this.emit();
    }
    await Promise.all(missingChars(this.set.chars, this.map).map(async c => {
      try { this.map.set(c.name, await withRetry(() => this.loadChar(this.set, c), opt(c.name))); }
      catch (e) { this.errors.set(c.name, e); }
      finally { this.retrying.delete(c.name); this.emit(); }
    }));
    if (missingChars(this.set.chars, this.map).length) { this.state = "failed"; this.emit(); return; }
    this.state = "done"; this.emit(); this._done(this.map);
  }
}

/** 못 받은 까닭 한 줄(불러오는 중 화면). kinds: 오류 종류("network" 연결 끊김 · "missing" 파일 없음 · 그 밖), online: navigator.onLine */
export function failReason({ failed = [], setFailed = false, kinds = [] }, online = true) {
  const what = setFailed ? "갈매미 목록을" : `갈매미 ${failed.length}종(${failed.slice(0, 3).join("·")}${failed.length > 3 ? " 등" : ""})을`;
  const why = online === false || kinds.includes("network") ? "인터넷 연결을 확인해 주세요"
    : kinds.length && kinds.every(k => k === "missing") ? "서버에서 모델 파일을 찾지 못했어요" : "받는 중에 문제가 생겼어요";
  return `${what} 받지 못했어요. ${why}`;
}

/** 불러오는 중 화면의 글·막대. gull = GullPool.progress(), assets = 다른 모델(건물·나무…)의 { done, total }, assetsOver = 다른 모델은 끝남(다 받았거나 90초) */
export function loadingView(gull, assets = { done: 0, total: 0 }, assetsOver = false) {
  const gf = gull.total ? gull.done / gull.total : 0, af = assetsOver ? 1 : assets.total ? assets.done / assets.total : 0;
  const frac = Math.min(1, (gf + af) / 2);
  if (gull.state === "failed") return { text: gull.setFailed ? "갈매미 목록 불러오는 중 · 멈춤" : `갈매미 불러오는 중 ${gull.done}/${gull.total} · 멈춤`, frac, failed: true };
  if (gull.state !== "done") {
    const more = gull.retrying ? " · 다시 받는 중" : "";
    return { text: gull.setKnown ? `갈매미 불러오는 중 ${gull.done}/${gull.total}${more}` : `갈매미 목록 불러오는 중…${more}`, frac, failed: false };
  }
  return { text: assets.total && !assetsOver ? `모델 불러오는 중 ${assets.done} / ${assets.total}` : "거의 다 됐어요…", frac, failed: false };
}
