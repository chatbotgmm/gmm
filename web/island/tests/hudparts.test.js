// 화면 공통 부품(hudParts.js) · 위쪽 상태 줄 글자 · world.hour로 기온이 하루 동안 바뀌는지. node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as P from "../src/ui/hudParts.js";
import { World } from "../src/world/World.js";
import { seededRandom } from "../src/util.js";
import * as BK from "../src/world/bank.js";

test("sumHead: 큰 숫자·이름·상태(이모지+낱말)·막대, 글자는 태그로 읽히지 않음", () => {
  const h = P.sumHead({ icon: "🏦", big: "612", label: "내 금고", line: "오늘 +84", bar: 0.5, tone: "low", toneText: "얼마 안 남음" });
  assert.match(h, /class="sum" data-tone="low"/);
  assert.match(h, /<b class="sum-big">612<\/b>/);
  assert.match(h, /⚠️ 얼마 안 남음/, "색만으로 알리지 않게 이모지·낱말");
  assert.match(h, /width:50%/);
  assert.ok(!/data-tone/.test(P.sumHead({ big: "1", tone: "이상한 값" })), "모르는 상태는 보통 색");
  assert.ok(!/rbar/.test(P.sumHead({ big: "1" })), "막대 없으면 안 그림");
  assert.match(P.sumHead({ big: "<b>" }), /&lt;b&gt;/);
  assert.match(P.sumHead({ bar: 7 }), /width:100%/, "막대는 0~100%로 자름");
});

test("moreBox: details.more · 열쇠 · 펼침 · 요약 줄 오른쪽 작은 글", () => {
  const c = P.moreBox("bank.town", "마을에 도는 돈", "<p>x</p>", { note: "9마리" });
  assert.match(c, /^<details class="more" data-more="bank\.town"><summary>/);
  assert.match(c, /<span class="more-n">9마리<\/span>/);
  assert.match(c, /<div class="more-b"><p>x<\/p><\/div><\/details>$/);
  assert.match(P.moreBox("k", "t", "", { open: true }), /<details class="more" data-more="k" open>/);
});

test("valueRows: 큰 값 먼저, 0인 줄은 .zero로 맨 아래", () => {
  const t = P.valueRows([["세금", 0], ["집값", 30], ["옷", -6], ["상환", 12]]);
  const names = [...t.matchAll(/<td>([^<]+)<\/td><td>/g)].map(m => m[1]);
  assert.deepEqual(names, ["집값", "상환", "옷", "세금"]);
  assert.match(t, /<tr class="zero"><td>세금<\/td><td>0<\/td><\/tr>/);
  assert.equal((t.match(/class="zero"/g) || []).length, 1);
});

test("금고 칩: 화면 꼴마다 길이 · 얼마 안 남음/바닥 색 상태와 낱말 · 밀린 품삯 💸 · 예전 섬은 🐚", () => {
  assert.deepEqual([P.vaultChipOf({ vault: 60 }, "portrait").text, P.vaultChipOf({ vault: 60 }, "medium").text, P.vaultChipOf({ vault: 60 }, "wide").text], ["🏦60", "🏦 금고 60", "🏦 내 금고 60"]);
  const low = P.vaultChipOf({ vault: 25, state: "low" }, "wide");
  assert.equal(low.tone, "low"); assert.equal(low.text, "🏦 내 금고 25 ⚠️ 얼마 안 남음");
  const empty = P.vaultChipOf({ vault: 1, owed: 4, state: "empty" }, "portrait");
  assert.equal(empty.tone, "empty"); assert.equal(empty.text, "🏦1🚨💸"); assert.match(empty.tip, /밀린 품삯 🪙4/);
  assert.equal(P.vaultChipOf({ vault: 1234.7 }, "wide").text, "🏦 내 금고 1,234", "천 단위 쉼표·내림");
  assert.deepEqual(P.vaultChipOf({ economy: false, coins: 50 }, "wide"), { text: "🐚 50", tone: null, tip: "가진 조개 · 누르면 🏦 은행" });
  assert.equal(P.townChipOf(1234, "portrait"), "🪙1234", "휴대폰은 쉼표 없이");
  assert.equal(P.vaultChipOf({ vault: 12345 }, "landscape").text, "🏦1.2만"); assert.equal(P.fmtShort(20000), "2만"); assert.equal(P.townChipOf(0, "wide"), "🪙 마을 돈 0");
});

test("기온 칩: 휴대폰 3° · 태블릿·PC 3°C · 4°C 이하 cold · 24°C 이상 hot · 음수는 −", () => {
  assert.deepEqual(P.tempChipOf(3.4, "portrait"), { text: "3°", tone: "cold" });
  assert.deepEqual(P.tempChipOf(-2.6, "wide"), { text: "−3°C", tone: "cold" });
  assert.deepEqual(P.tempChipOf(15, "landscape"), { text: "15°", tone: null });
  assert.deepEqual(P.tempChipOf(23.6, "medium"), { text: "24°C", tone: "hot" });
  assert.match(P.tempNote(2, 14, [{ clothes: [] }, { clothes: ["scarf"] }, {}]), /바깥 2° · 집 안 14° · 🥶 쌀쌀해요 · 옷 없는 갈매미 2마리/);
  assert.match(P.tempNote(30, 21, []), /🥵 더워요/);
});

test("새 섬: 금고 60 → 칩 ok · 25 → low · 1 또는 바닥 사태 → empty · 60으로 되돌리면 ok", () => {
  const w = World.create(7, seededRandom(3), { wild: true });
  const chip = () => P.vaultChipOf({ vault: w.bank.vault, owed: w.bank.owed, state: w.vaultState() }, "wide");
  assert.equal(w.bank.vault, BK.VAULT_START); assert.equal(chip().tone, "ok"); assert.equal(chip().text, "🏦 내 금고 60");
  assert.equal(P.townChipOf(w.moneySupply(), "wide"), "🪙 마을 돈 0", "새 섬은 갈매미가 없어 마을 돈 0");
  w.bank.vault = 25; assert.equal(chip().tone, "low");
  w.bank.vault = 1; assert.equal(chip().tone, "empty");
  w.bank.vault = 60; w.bank.short = 1; assert.equal(chip().tone, "empty", "바닥 사태 진행 중");
  w.bank.short = 0; assert.equal(chip().tone, "ok");
});

test("world.hour를 넘기면 같은 날씨에서 6시와 14시의 기온이 다름(일교차), 안 넘기면 낮/밤 두 단계", () => {
  const w = World.create(7, seededRandom(3), { wild: true }); w.setSeason("autumn"); w.setWeather("clear"); w.weather.t = 1e9; w.snow = 0; w.isNight = false;
  w.hour = 6; w.update(0.1); const a6 = w.air;
  w.hour = 14; w.update(0.1); const a14 = w.air;
  assert.ok(a14 - a6 > 4, `6시 ${a6}° · 14시 ${a14}°`);
  w.hour = null; w.update(0.1); assert.equal(w.air, 15 + 2, "시각을 모르면 낮 +2");
});
