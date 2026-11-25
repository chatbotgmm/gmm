// 브라우저 확인(헤드리스): 서버를 직접 띄워 섬을 열고, 마을을 N초 돌린 뒤 콘솔 오류·페이지 오류를 출력. 스크린샷도 남김.
// 사용: node tools/smoke.cjs [출력폴더] [돌릴 초=60] [추가 JS(문자열, 페이지에서 실행·결과 출력)]
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
(async () => {
  const out = process.argv[2] || ".", secs = +(process.argv[3] || 60), extra = process.argv[4] || "";
  const port = 8800 + Math.floor(Math.random() * 150);
  const srv = spawn("python3", ["-m", "http.server", String(port)], { cwd: path.join(__dirname, "..", ".."), stdio: "ignore" });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  p.on("pageerror", e => errs.push("pageerror: " + e.message));
  p.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
  await p.addInitScript(() => { try { localStorage.setItem("galmaemiman-quality", "low"); } catch {} });
  try {
    await p.goto(`http://localhost:${port}/island/index.html`);
    await p.waitForFunction(() => window.__island && window.__island.world, null, { timeout: 120000 });
    await p.waitForTimeout(6000);
    const st = await p.evaluate(s => { window.__island.run(s); const w = window.__island.world; return { units: w.units.length, buildings: w.buildings.size, time: Math.round(w.time) }; }, secs);
    console.log("state", JSON.stringify(st));
    if (extra) console.log("extra", JSON.stringify(await p.evaluate(new Function("return (async () => {" + extra + "})()"))));
    await p.waitForTimeout(1500); await p.screenshot({ path: path.join(out, "smoke.png") });
  } catch (e) { errs.push("smoke: " + e.message); }
  console.log("errors", JSON.stringify(errs));
  await b.close(); srv.kill(); process.exit(errs.length ? 1 : 0);
})();
