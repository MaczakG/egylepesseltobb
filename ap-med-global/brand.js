// AP Med Global – közös rajzoló segédfüggvények (poszt + roll-up).
// Minden díszítő elem vektoros SVG, így a roll-up PDF-ben is éles marad.
const SVGNS = "http://www.w3.org/2000/svg";
let uid = 0;

// Determinisztikus csillagmező: minden kiadványon ugyanaz.
window.drawStars = function (svg, w, h, count, seed) {
  let s = seed || 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  for (let i = 0; i < count; i++) {
    const c = document.createElementNS(SVGNS, "circle");
    const big = rnd() > 0.93;
    c.setAttribute("cx", (rnd() * w).toFixed(1));
    c.setAttribute("cy", (rnd() * h).toFixed(1));
    c.setAttribute("r", ((big ? 1.1 : 0.55) + rnd() * 0.5) * (w / 1080));
    c.setAttribute("fill", rnd() > 0.7 ? "#cfe0ff" : "#ffffff");
    c.setAttribute("opacity", (0.12 + rnd() * (big ? 0.55 : 0.35)).toFixed(2));
    svg.appendChild(c);
  }
};

// „DESTINATION: / BETTER LIFE” – jobbra zárt, kéken fémes színátmenetes felirat.
window.drawDestination = async function (svg) {
  await document.fonts.load('400 100px "Anton"');
  const id = "dest" + uid++;
  svg.innerHTML = `
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eef5ff"/><stop offset=".55" stop-color="#9cc3f2"/><stop offset="1" stop-color="#4f86d0"/>
    </linearGradient></defs>
    <text x="0" y="66" font-size="68" letter-spacing="4" text-anchor="end" fill="url(#${id})">DESTINATION:</text>
    <text x="1" y="160" font-size="100" letter-spacing="1" text-anchor="end" fill="url(#${id})">BETTER LIFE</text>`;
  const [t1, t2] = svg.querySelectorAll("text");
  // a két sor pontosan egyforma szélességű legyen
  const w2 = t2.getComputedTextLength(), w1 = t1.getComputedTextLength();
  const ls = 4 + (w2 - w1) / 12;
  t1.setAttribute("letter-spacing", ls.toFixed(2));
  t1.setAttribute("x", ls.toFixed(2)); // a záró betűköz ne tolja el a jobb szélt
  const bb = svg.getBBox();
  svg.setAttribute("viewBox", `${bb.x} ${bb.y} ${bb.width} ${bb.height}`);
  svg.style.setProperty("--dest-h", (bb.height / 100).toFixed(4));
};

// Vékony arany pálya a kör alakú partnerképek körül.
window.addRing = function (el) {
  const id = "ring" + uid++;
  const sw = parseFloat(getComputedStyle(el).getPropertyValue("--ring-stroke")) || 0.3;
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("class", "ring");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.innerHTML = `
    <defs><linearGradient id="${id}" x1="0.05" y1="0.1" x2="0.95" y2="0.9">
      <stop offset="0" stop-color="#f6dc9a" stop-opacity=".85"/>
      <stop offset=".42" stop-color="#d9a84e" stop-opacity=".22"/>
      <stop offset=".62" stop-color="#d9a84e" stop-opacity="0"/>
      <stop offset="1" stop-color="#d9a84e" stop-opacity=".4"/>
    </linearGradient></defs>
    <circle cx="50" cy="50" r="${50 - sw / 2}" fill="none" stroke="url(#${id})" stroke-width="${sw}"/>`;
  el.appendChild(svg);
};
