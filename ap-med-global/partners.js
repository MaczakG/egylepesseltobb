// AP Med Global – partnerbemutató posztok adatai.
// Új partnerhez másold le az egyik blokkot, írd át a szövegeket és a kép útvonalát,
// majd futtasd: node render.js
//
// role: az arany felirat második sora – az első sor mindig „Az AP Med Global”
// visual.type:
//   "photo" – portré vagy helyszínfotó (jobb oldalon, a háttérbe olvadva)
//   "logo"  – partnerlogó (átlátszó hátterű PNG vagy SVG, sötét háttérre), körbe foglalva
// field: rövid szakterület a roll-up partnerlistájához
// visual.focus: a fotó melyik része maradjon látható ("50% 20%" = vízszintesen közép, felülről 20%)

window.PARTNERS = [
  {
    id: "zoe-med",
    role: "nőgyógyászati partnere",
    name: "Zoé Med Egészségközpont",
    subtitle: "",
    text: "A Zoé Med csapata már három helyszínen, modern magánrendelőkben várja Önt gyermekkortól a változókorig: nyugodt környezetben, diszkréten, személyes odafigyeléssel.",
    visual: { type: "logo", src: "assets/partners/zoemed-logo.png", width: 360 },
    field: "Nőgyógyászat"
  },
  {
    id: "dr-ahmed-mowla",
    role: "vezető fogászati partnere",
    name: "Dr. Ahmed Mowla",
    subtitle: "a Dubai Smile alapítója",
    text: "Nemzetközi csúcstechnológia és dubai laboratóriumi precizitás az esztétikai fogászatban, most már Magyarországon is.",
    visual: { type: "photo", src: "assets/partners/dr-ahmed-mowla.jpg", focus: "54% 0%" },
    field: "Esztétikai fogászat"
  },
  {
    id: "jnn-utazasi-iroda",
    role: "turisztikai partnere",
    name: "JNN Utazási Iroda",
    subtitle: "Jó Napot Nagyvilág",
    text: "A JNN segítségével pácienseink a világ bármely pontjáról kényelmesen eljutnak a kezelésükre. Az utazás kényelmét a pihenéssel és a kikapcsolódással párosítják.",
    visual: { type: "logo", src: "assets/partners/jnn-logo.png", width: 290 },
    field: "Utazásszervezés"
  }
];
