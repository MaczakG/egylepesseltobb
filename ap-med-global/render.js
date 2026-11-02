// Kiexportálja az összes partnerposztot és a roll-upot.
// Használat:  node render.js            (minden)
//             node render.js zoe-med    (csak egy partner posztja)
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const root = __dirname;
const out = path.join(root, "export");
const only = process.argv[2];

async function ready(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (window.__ready) await window.__ready;
    await Promise.all([...document.images].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
  });
  await page.waitForTimeout(150);
}

(async () => {
  global.window = {};
  require(path.join(root, "partners.js"));
  const partners = global.window.PARTNERS;
  fs.mkdirSync(path.join(out, "instagram"), { recursive: true });
  fs.mkdirSync(path.join(out, "rollup"), { recursive: true });

  const browser = await chromium.launch();

  // Instagram posztok – 1080 × 1350 (4:5)
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  for (const [i, p] of partners.entries()) {
    if (only && only !== p.id && only !== "rollup") continue;
    if (only === "rollup") break;
    await page.goto("file://" + path.join(root, "post.html") + "?id=" + encodeURIComponent(p.id));
    await ready(page);
    const file = path.join(out, "instagram", `${String(i + 1).padStart(2, "0")}-${p.id}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1080, height: 1350 } });
    console.log("✓", path.relative(root, file));
  }

  // Roll-up – 850 × 2000 mm: nyomdai PDF (1:1) + előnézeti PNG
  if (!only || only === "rollup") {
    const r = await browser.newPage({ viewport: { width: 850, height: 2000 }, deviceScaleFactor: 2 });
    await r.goto("file://" + path.join(root, "rollup.html") + "?preview");
    await ready(r);
    const png = path.join(out, "rollup", "ap-med-global-rollup-85x200-elonezet.png");
    await r.screenshot({ path: png, fullPage: true });
    console.log("✓", path.relative(root, png));

    const pr = await browser.newPage();
    await pr.goto("file://" + path.join(root, "rollup.html"));
    await ready(pr);
    const pdf = path.join(out, "rollup", "ap-med-global-rollup-85x200.pdf");
    await pr.pdf({ path: pdf, width: "850mm", height: "2000mm", printBackground: true, pageRanges: "1" });
    console.log("✓", path.relative(root, pdf));
  }

  await browser.close();
})();
