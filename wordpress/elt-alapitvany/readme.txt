=== Egy Lépéssel Több – Családok és adományok ===
Requires at least: 6.4
Requires PHP: 7.4
Stable tag: 1.1.0
License: GPLv2 or later

Örökbefogadható családok, jelentkezések, automatikus státuszváltás és SimplePay online adományozás.

== Telepítés ==

1. Bővítmények → Új hozzáadása → Bővítmény feltöltése → elt-alapitvany.zip → Telepítés → Bekapcsolás.
2. Alapítvány → Beállítások: küszöb, SimplePay kereskedői adatok, „Fizetés eredménye” oldal.
3. A SimplePay kereskedői felületén add meg IPN URL-ként a Beállítások oldalon látható címet.

== Mit hova? ==

* Alapítvány → Családok: családok (név, történet, kivonat a kártyára, borítókép, galéria, alcím,
  havi összeg, jelentkezők száma, státusz).
* Alapítvány → Jelentkezések: az űrlapon beküldött jelentkezések. Lomtárba helyezve a család
  jelentkezőszáma eggyel csökken.
* Alapítvány → Adományok (SimplePay): online adományok és állapotuk.
* Alapítvány → Beállítások: automatikus státuszváltás és SimplePay.

== Elementor ==

* Űrlap-műveletek (Elementor Pro űrlap → Beküldés utáni műveletek):
  - „Családhoz jelentkezés (ELT)” – mezők: csalad, nev, email, telefon, uzenet
  - „SimplePay adomány (ELT)” – mezők: osszeg, egyedi_osszeg, nev, email
* A „csalad” azonosítójú legördülő listát a bővítmény tölti fel az örökbefogadható családokkal,
  a család oldalán (vagy ?csalad=ID paraméterrel) előre kiválasztva.
* Loop Grid szűrés: Lekérdezés → Lekérdezés azonosító (Query ID) = elt_orokbefogadhato vagy elt_orokbefogadott
* Dinamikus címkék („Egy Lépéssel Több” csoport): Család adat, Család galéria, Jelentkezés link.
* Rövidkódok: [elt_csalad mezo="alcim"], [elt_fizetes_eredmeny]
* CSS osztályok a család oldalán: elt-csak-orokbefogadhato, elt-csak-orokbefogadott

== Adatok ==

A bővítmény kikapcsolása vagy törlése nem törli a családokat, jelentkezéseket és adományokat.
