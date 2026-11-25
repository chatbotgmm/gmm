// 건설 갤러리의 건물 사진을 미리 찍어 assets/thumbs/<건물 id>.webp로 저장(헤드리스 브라우저에서 게임을 열어, 게임이 쓰는 것과 같은 코드 src/render/thumbs.js로 찍음).
// 건물 모델을 바꾸거나 새 건물을 넣으면 다시 돌림:  node tools/thumbs.cjs [건물 id …]   (id를 안 주면 건설 메뉴의 건물 전부)
// 사진이 없는 건물은 게임이 그 자리에서 찍어 보여 주므로, 이 도구는 「갤러리를 열 때 모델을 받지 않게」 하는 용도.
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
(async () => {
  const only = process.argv.slice(2), out = path.join(__dirname, "..", "assets", "thumbs");
  fs.mkdirSync(out, { recursive: true });
  const port = 8960 + Math.floor(Math.random() * 30);
  const srv = spawn("python3", ["-m", "http.server", String(port)], { cwd: path.join(__dirname, "..", ".."), stdio: "ignore" });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  p.on("pageerror", e => console.log("pageerror:", e.message));
  await p.addInitScript(() => { try { localStorage.setItem("galmaemiman-quality", "medium"); } catch {} });   // 보통 화질(텍스처 2k)이면 128px 사진엔 넉넉
  let bad = 0;
  try {
    await p.goto(`http://localhost:${port}/island/index.html`);
    await p.waitForFunction(() => window.__island && window.__island.world && document.getElementById("loading").hidden, null, { timeout: 180000 });
    const ids = await p.evaluate(async () => { const { BUILDINGS } = await import("./src/data/catalog.js"); return Object.values(BUILDINGS).filter(d => d.menu !== false).map(d => d.id); });
    for (const id of ids.filter(i => !only.length || only.includes(i))) {
      const url = await p.evaluate(i => window.__island.thumbs.request(i), id);
      if (!url || !url.startsWith("data:image/webp")) { console.log("못 찍음:", id); bad++; continue; }
      const buf = Buffer.from(url.split(",")[1], "base64"); fs.writeFileSync(path.join(out, `${id}.webp`), buf);
      console.log(`${id}.webp ${buf.length} bytes`);
    }
  } catch (e) { console.log("오류:", e.message); bad++; }
  await b.close(); srv.kill(); process.exit(bad ? 1 : 0);
})();
