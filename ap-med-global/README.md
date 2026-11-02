# AP Med Global – partnerbemutató sablon

Egységes arculat az AP Med Global partnereinek bemutatásához: Instagram-poszt (4:5) és roll-up (85 × 200 cm).

## Kész anyagok – `export/`

| Fájl | Mire való |
|---|---|
| `instagram/01-zoe-med.png` | Instagram-poszt, 1080 × 1350 px |
| `instagram/02-dr-ahmed-mowla.png` | Instagram-poszt, 1080 × 1350 px |
| `instagram/03-jnn-utazasi-iroda.png` | Instagram-poszt, 1080 × 1350 px |
| `rollup/ap-med-global-rollup-85x200.pdf` | Roll-up nyomdai PDF, 1:1 (850 × 2000 mm, vektoros szöveg és háttér) |
| `rollup/ap-med-global-rollup-85x200-elonezet.png` | Roll-up előnézet |

## Új partner felvétele

1. Tedd a partner képét az `assets/partners/` mappába:
   - **fotó** (portré vagy helyszín): JPG, legalább 1200 px széles;
   - **logó**: átlátszó hátterű PNG vagy SVG, ami sötét háttéren is jól látszik.
2. A `partners.js` fájlban másold le az egyik blokkot, és írd át:
   - `role`: az arany felirat második sora (pl. „bőrgyógyászati partnere”); az első sor mindig „Az AP Med Global”,
   - `name`, `subtitle` (ez el is maradhat), `text` (2–4 sor, kb. 120–170 karakter),
   - `field`: rövid szakterület a roll-up listájához,
   - `visual`: a kép útvonala és típusa (`photo` vagy `logo`).
3. Futtasd: `node render.js` (egy partner: `node render.js <id>`, csak a roll-up: `node render.js rollup`).
   Ehhez Node.js és Playwright kell (`npm i playwright`, majd `npx playwright install chromium`).

A fejléc, a háttér, a horizont, a betűtípusok és a lábléc minden posztnál ugyanaz, csak a kép és a szöveg cserélődik.

## Arculati elemek

- **Betűtípusok** (a `fonts/` mappában, magyar ékezetekkel): Anton (Destination: Better Life), Cormorant Garamond (nevek), Montserrat (feliratok, szövegtörzs). Mindhárom szabad licencű (SIL OFL).
- **Színek**: éjkék űr-háttér (#03060D → #071226), arany (#DDB062), kék fémes színátmenet a „Destination: Better Life” feliraton.
- **AP Med Global logó**: `assets/logos/apmed-global-dark.svg`. Ez a cég weboldalán lévő vektoros logóból készült; sötét háttérhez az „AP” betűk ezüstfehérek, a repülő fehér.

## Mielőtt nyomdába megy

- A Zoé Med és a JNN logóját a korábbi tervezetekből tisztítottam ki. Instagramra jók, de a roll-uphoz kérd el az eredeti (lehetőleg vektoros) fájlokat.
- A Medical Tourism Association és a better logója kis felbontású. Posztra elég, a roll-upon viszont puha lesz, ezért ezekből is az eredeti fájl kell.
- A Dubai Smile logóból csak egy nagyon kicsi változat volt, ezért a roll-up a partnereket névvel és szakterülettel sorolja fel.
- A roll-up PDF kifutó nélkül készült, pontosan 850 × 2000 mm-es méretben. A nyomdától kérdezd meg, kell-e kifutó, és alul kell-e plusz hossz a kazettába. Alul kb. 17 cm üresen maradt.
