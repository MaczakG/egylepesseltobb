# Egy Lépéssel Több – WordPress szerkesztési útmutató

Minden szöveg, kép, menü és szín Elementorban vagy a WordPress adminban szerkeszthető, kódolás nélkül.

## Hol mi van?

| Mit szeretnél módosítani? | Hol? |
|---|---|
| Fejléc (logó, gombok) | Sablonok → Theme Builder → Fejléc: **ELT – Fejléc** |
| Menüpontok | Megjelenés → Menük → **Egy Lépéssel Több – főmenü** |
| Lábléc (partnerek, rendezvények, kapcsolat, térkép) | Theme Builder → Lábléc: **ELT – Lábléc** |
| Főoldal (hero, nagykövetek, területek, alapító) | Oldalak → **Főoldal – Egy Lépéssel Több** → Szerkesztés Elementorral |
| Családkártya kinézete | Theme Builder → Loop elem: **ELT – Családkártya (Loop elem)** |
| Család aloldal kinézete (minden családé egyszerre) | Theme Builder → Egyedi bejegyzés: **ELT – Család oldal (sablon)** |
| Családok adatai | **Alapítvány → Családok** (WordPress admin) |
| Jelentkezések | **Alapítvány → Jelentkezések** |
| Online adományok | **Alapítvány → Adományok (SimplePay)** |
| Küszöb, automatizmus, SimplePay kulcsok | **Alapítvány → Beállítások** |
| Színek, betűk | Elementor → Webhely beállítások → Globális színek / Globális betűtípusok |
| Közös effektek (hover, animációk) | Elementor → Webhely beállítások → Egyéni CSS |

## Család felvétele / módosítása

1. **Alapítvány → Új család**.
2. **Cím** = a család / gyermek neve (pl. „Noel”).
3. **Szövegszerkesztő** = a teljes történet (a család oldalán jelenik meg). A *Szöveg* fülön HTML-ként is szerkeszthető.
4. **Kivonat** = a kártyán megjelenő rövid szöveg.
5. **Borítókép** (jobb oldalt) = a kártya és a család oldalának fő képe.
6. **Család adatai** doboz: rövid alcím, státusz, havi támogatási összeg, jelentkezők száma, gomb felirat (üresen hagyva automatikus, pl. „Segítek Noelnek”).
7. **Képek (galéria)**: további képek a család oldalára, húzással rendezhetők.
8. **Közzététel** – a család azonnal megjelenik a főoldalon és az „Örökbefogadható családok” oldalon.

## Automatikus státuszváltás

- Minden beküldött jelentkezés +1 jelentkezőt ad a kiválasztott családnak.
- Ha a jelentkezők száma eléri a küszöböt (alapból 6), a család státusza magától **Örökbefogadott** lesz: eltűnik a főoldalról és az örökbefogadható listából, és átkerül az „Örökbefogadott családok” oldalra. A család oldalán az űrlap helyett köszönő üzenet jelenik meg.
- A küszöb és a cél-státusz: **Alapítvány → Beállítások**. Mentéskor a szabály minden családra lefut.
- Kézzel bármikor átállíthatod a státuszt a család szerkesztésénél.
- Ha egy jelentkezést a lomtárba teszel (pl. kéretlen üzenet), a jelentkezőszám eggyel csökken.

## Jelentkezési űrlap

Elementor Pro űrlap a család oldalán és az „Örökbefogadható családok” oldalon.

- A **csalad** azonosítójú legördülő lista automatikusan feltöltődik az örökbefogadható családokkal; a család oldalán az adott család előre ki van választva. Más oldalon a `?csalad=ID` paraméter választja ki előre.
- Beküldés utáni műveletek: **Családhoz jelentkezés (ELT)** (tárolás + számlálás) és **E-mail** (értesítés). Az e-mail címzettje az űrlap „E-mail” beállításainál módosítható.
- Mezőazonosítók (Haladó → ID), ezeket ne nevezd át: `csalad`, `nev`, `email`, `telefon`, `uzenet`.

## Online adomány (SimplePay)

1. **Alapítvány → Beállítások → SimplePay**: kereskedő azonosító (MERCHANT) és titkos kulcs (SECRET KEY) a SimplePay kereskedői felületéről. Először **teszt módban** próbáld ki.
2. A Beállítások oldalon látható **IPN URL**-t add meg a SimplePay kereskedői felületén.
3. Az adomány űrlap a **Támogatás** oldalon van („SimplePay adomány (ELT)” művelet). Mezők: `osszeg` (választó, pl. `5 000 Ft|5000`, egyedi összeg: `Egyedi összeg|egyedi`), `egyedi_osszeg`, `nev`, `email`.
4. Fizetés után az adományozó a **Fizetés eredménye** oldalra kerül (a `[elt_fizetes_eredmeny]` rövidkód írja ki a SimplePay által előírt üzeneteket – ne töröld).
5. Élesítés: kapcsold ki a teszt módot, és add meg az éles kereskedői adatokat.

## Rendezvények (lábléc)

Minden rendezvény egy **Alap galéria** widget: az első kép a borító, kattintásra a galéria összes képe lightboxban lapozható. Új kép = Képek hozzáadása a galériához. Cím és dátum: a kártya alatti két szöveg.

## Menü

Megjelenés → Menük. A „#” hivatkozású pontok (Kuratórium, Dokumentumok, Galéria aloldalai, Váradi Eszter díj) helyére tedd be a megfelelő oldalakat, amikor elkészülnek. Az „Adó 1%” és „Fogadj örökbe egy családot” menüpontok (CSS osztály: `elt-menu-cta`) csak a mobil menüben jelennek meg gombként.

## CSS osztályok (Haladó → CSS osztályok)

| Osztály | Hatás |
|---|---|
| `elt-lift` | kártya enyhén megemelkedik hoverre |
| `elt-zoom` | a benne lévő kép finoman nagyít a kártya hoverjére |
| `elt-btn-primary` | elsődleges gomb emelkedés + homokszínű gyűrű |
| `elt-csak-orokbefogadhato` | csak örökbefogadható család oldalán látszik |
| `elt-csak-orokbefogadott` | csak örökbefogadott család oldalán látszik |
| `elt-status-badge` | státusz címke (homok / sötétkék) |
| `elt-partner` | partner logó: szürke → színes |
| `elt-event` | rendezvénykártya (galéria első képe borító) |

## Teendők élesítés előtt

- **Adatkezelési tájékoztató** oldal: jelenleg az előző (INKA VISION) oldal szövege van benne – cseréld le az Alapítvány tájékoztatójára.
- Közösségi ikonok linkjei (lábléc), telefonszám, e-mail cím ellenőrzése.
- Rendezvények képei: jelenleg az Alapítvány meglévő fotói – cseréld valódi rendezvényképekre.
- Űrlap értesítő e-mail feladója (`noreply@bographic.hu`) → éles domainre.
