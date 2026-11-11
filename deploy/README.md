# Telepítés AWS-re (szerver nélkül: S3 + CloudFront + Lambda)

Az oldal szerver nélkül fut: **forgalom nélkül nincs alapdíj**, csak a tényleges használatért (kérések, tárhely) kell fizetni, ami ennél a forgalomnál havi néhány cent.

- **CloudFront** (HTTPS, gyorsítótár): az `assets/` és `uploads/` alatti fájlokat közvetlenül az S3-ból adja, minden mást a Lambdának továbbít. Havonta 1 TB forgalom és 10 millió kérés ingyenes.
- **Lambda** (`server/src/lambda.js`): ugyanaz az Express alkalmazás, mint helyben; csak kéréskor fut (havi 1 millió kérésig ingyenes). Nincs „ébredés”: a hidegindítás kb. 1 másodperc.
- **S3** (verziózva): statikus fájlok, feltöltött képek, a beküldött dokumentumok (nem nyilvános `private/` rész) és az adatbázis. A felülírt vagy törölt fájl és adatbázis **35 napig visszaállítható**.
- **Adatbázis:** az SQLite fájl az S3-ban van (`db/egylepesseltobb.db`). A Lambda letölti; íráskor egy **DynamoDB-zár** alatt frissít, ír és visszatölt, így két egyszerre érkező beküldés sem vész el. (A DynamoDB kérésenként fizetős, üresjáratban ingyenes.)
- **Titkok:** a munkamenet-kulcs az SSM Parameter Store-ban (`/egylepesseltobb/<környezet>/session-secret`, titkosítva); a SimplePay- és SMTP-adatok az admin Beállításaiban.
- **Két egyforma környezet**, saját adatokkal: `staging` és `prod` (CloudFormation stack: `egylepesseltobb-staging`, `egylepesseltobb-prod`).
- **Dokumentumfeltöltés:** a programjelentkezés fájljai a böngészőből aláírt linkkel egyenesen az S3-ba mennek (a Lambda kérésmérete max. 6 MB); az admin a nagy fotókat feltöltés előtt kicsinyíti.

Jelenlegi címek: staging `https://d2f30js17vewf2.cloudfront.net`, éles `https://d20v9tyarwaoj9.cloudfront.net`.

## Telepítés GitHubról

1. A repó **Settings → Secrets and variables → Actions** oldalán legyen meg az `AWS_ACCESS_KEY_ID` és az `AWS_SECRET_ACCESS_KEY` secret (a régió alapból `eu-central-1`, a **Variables** fülön `AWS_REGION` néven módosítható).
2. A **Deploy (serverless)** workflow: a `staging` ágra pusholva a staging, a `main` ágra pusholva az éles környezetet frissíti (előtte lefutnak a tesztek). Kézzel is indítható: **Actions → Deploy (serverless) → Run workflow**.

## Telepítés a saját gépről

Kell hozzá az AWS CLI (beállított hitelesítéssel), a Node.js 24 és a `zip`.

```bash
deploy/serverless/deploy.sh staging          # létrehozás vagy frissítés (stack, kód, statikus fájlok)
deploy/serverless/deploy.sh staging import   # első telepítéskor: a régi oldal tartalma (pár perc)
ADMIN_EMAIL="info@pelda.hu" ADMIN_PASSWORD="…" deploy/serverless/deploy.sh staging create-admin
```

Ugyanez `prod`-dal az éles környezetre. Az import és az admin létrehozása a saját gépen fut, közvetlenül az S3-ban lévő adatbázison (zár alatt).

## Saját domain

1. Kérj tanúsítványt az **ACM**-ben, a **us-east-1** régióban (a CloudFront csak onnan használja), pl. `egylepesseltobb.hu` és `www.egylepesseltobb.hu` névre, DNS-ellenőrzéssel.
2. Telepíts a domainnel: `DOMAIN_NAMES=egylepesseltobb.hu,www.egylepesseltobb.hu CERTIFICATE_ARN=arn:aws:acm:us-east-1:… deploy/serverless/deploy.sh prod` (GitHubról: `PROD_DOMAIN_NAMES` és `PROD_CERTIFICATE_ARN` változó a **Variables** fülön).
3. A DNS-ben a domain CNAME (gyökérdomainnél ALIAS/ANAME) rekordja mutasson a CloudFront címére.

## E-mail küldés a Lambdáról

A Lambdának nincs fix IP-címe, ezért az SMTP-továbbítónál **felhasználónév + (alkalmazás)jelszó** azonosítás kell, IP-cím alapú nem működik. Google Workspace SMTP-továbbítónál (`smtp-relay.gmail.com`) a beállításoknál kapcsold be az „SMTP-hitelesítés megkövetelése” opciót, és az admin **Beállítások → E-mail értesítések** részében add meg a fiók címét és alkalmazásjelszavát.

## Régi, szerveres telepítés (EC2)

A `deploy/aws/` alatti EC2-s telepítés (nginx + Node.js, 5 percenkénti frissítés a GitHubról) még megvan, de folyamatosan fizetős (kb. havi 12 USD). Törlése: `deploy/aws/destroy.sh`.

## Admin felület és adatok

- Belépés: `https://<domain>/admin.html`, az `ADMIN_EMAIL` / `ADMIN_PASSWORD` adatokkal.
- Családstátuszok: **Örökbefogadható**, **Örökbefogadott**, **Feltöltés alatt**, **Archivált**. A főoldalon csak az „Örökbefogadható” státuszú családok jelennek meg, a többi csak az adminban látszik.
- Az automatikus státuszváltás (Beállítások) csak az örökbefogadható és az örökbefogadott családokra vonatkozik.
- Minden gyereknek (családnak) saját aloldala van: `/csaladok/<webcím>`. Az adatbázisból jön a név, az alcím, a történet és a képek (nagyítóval). Rajta van a „Jelentkezem támogatónak” űrlap, a megosztás gombok és további örökbefogadható családok. A havi összeg és a jelentkezők száma nem jelenik meg.
- Új családot és új blogbejegyzést a Családok, illetve a Blog lista „Új család” / „Új bejegyzés” gombjával lehet felvenni.
- A webcím a névből készül, és átnevezéskor nem változik; az adminban a család adatlapján átírható. Ugyanott az „Aloldal ↗” gomb megnyitja az oldalt.
- Aloldala az örökbefogadható és az örökbefogadott családoknak van. Az archivált és a feltöltés alatti családot csak bejelentkezett adminisztrátor látja, előnézetként.
- Családlista lapozás nélkül, minden család egy oldalon: `/csaladok` (az összes nyilvános család, elöl az örökbefogadhatók), `/csaladok?statusz=orokbefogadhato` és `/csaladok?statusz=orokbefogadott`. A menü „Örökbefogadható / Örökbefogadott családok” pontja ide mutat.

## Felhasználók és szerepkörök

- **Adminisztrátor:** mindent elér, a **Felhasználók** menüpontban új felhasználót vehet fel (e-mail, szerepkör, kezdő jelszó), szerepkört és jelszót módosíthat, hozzáférést törölhet.
- **Alapítványi munkatárs:** csak a tartalmat kezeli: Családok, Jelentkezések, Üzenetek, Blog, Termékek, Fizetések. A beállításokat és a felhasználókat nem látja (a szerver is tiltja).
- Mindenki a bal alsó kulcs gombbal módosíthatja a saját jelszavát. Szerepkör- vagy jelszócserénél a felhasználó minden eszközön kijelentkezik. Legalább egy adminisztrátornak mindig maradnia kell.

## Oldalak (a régi oldal aloldalai)

- A régi egylepesseltobb.hu aloldalai a mostani dizájnnal, ugyanazzal a szöveggel és képekkel, a régi címükön érhetők el (pl. `/alapitonk`, `/kuratorium`, `/dokumentumok`, `/1-ado`, `/linkesfizetes`, `/adatkezelesi-tajekoztato`).
- Minden aloldal (oldalak, blog, családok, 404) a főoldal dizájnját követi: nagy nyitókép sötét átmenettel és morzsamenüvel, alatta a főoldal szekcióinak mintájára váltakozó sávok (fehér, homokszín, sötétkék). A régi tartalom elemei ehhez igazodnak: a kép + szöveg blokkok keretezett fotóval (mint az „Alapítónk”), a személyek nagykövet-kártyákon, a kártyák a „Területeink” stílusában, az évszámos felsorolások idővonalként, a „Címke: érték” sorok (adószám, bankszámla…) adatlapként.
- A tartalom a `server/import/wordpress-pages-2026-11-09.json` fájlból kerül be az első induláskor; a képeket és a PDF-eket (alapító okirat, beszámolók, 1%-os nyomtatvány, prospektus) a szerver tölti le a régi oldalról. A PDF-ek a régi fájlnevükön érhetők el (pl. `/uploads/Prospektus.pdf`).
- Az oldalak kiegészíthetők: űrlap (pl. a „Jelentkezz támogatónak” oldalon a támogatói jelentkezés), az örökbefogadható családok kártyái, illetve blogbejegyzések kártyái (pl. a Gálaest, Családi napok, Aláírási ceremónia oldalon a galériák). Az adminban nincs külön menüpontjuk; a tartalmuk az importfájlban módosítható.
- A régi címek átirányítanak: `/fooldal` → főoldal, `/orokbefogadhato-csaladok` és `/orokbefogadott-csaladok` → családlista, `/kozos-elmenyeink` → blog, a régi bejegyzéscímek (`/2025/12/08/<webcím>/`) → a blogbejegyzés vagy a család oldala.

## Üzenetek (kapcsolat, programjelentkezés, díjjelölés)

- A régi oldal további űrlapjai, ugyanazokkal a mezőkkel:
  - **Kapcsolati űrlap** (az 1% adó oldalon): név, e-mail, üzenet;
  - **Jelentkezés a programba** (Kerülj be programunkba): név, e-mail, telefonszám, a gyermek története, orvosi dokumentumok feltöltése (PDF vagy kép, legfeljebb 5 fájl, egyenként max. 10 MB);
  - **Váradi Eszter-díj jelölés**: jelölő adatai, jelölt neve, díjkategória, nagykövet, indoklás (legalább 200 karakter).
- A díjjelölés legördülő listái (díjkategóriák, nagykövetek) az adminban a **Beállítások** oldalon szerkeszthetők, soronként egy értékkel; a változás az űrlapon azonnal megjelenik, és csak a listában szereplő érték küldhető be. Üres nagykövetlistánál a mező nem jelenik meg.
- Mindegyikhez kell az adatkezelési tájékoztató elfogadása; ugyanaz a védelem a kéretlen beküldések ellen, mint a támogatói jelentkezésnél.
- Az adminban az **Üzenetek** menüpontban jelennek meg (a menüpont mellett az újak száma), típus szerint szűrhetők, állapotuk „Új” vagy „Feldolgozva”, és törölhetők.
- A feltöltött dokumentumok nem nyilvánosak: a szerveren a `/var/lib/egylepesseltobb/private` mappába kerülnek (csak az alkalmazás olvashatja), és csak bejelentkezett adminisztrátor töltheti le őket az üzenetnél. Az üzenet törlésekor a fájlok is törlődnek. A napi mentés ezeket is tartalmazza.

## Támogatói jelentkezések

- Minden család aloldalán van egy „Jelentkezem támogatónak” űrlap:
  - vezetéknév, keresztnév, e-mail, telefonszám;
  - havi összeg és a támogatni kívánt család (az örökbefogadhatók közül, az aktuális előválasztva);
  - „Honnan hallott rólunk?”, megjegyzés;
  - az adatkezelési tájékoztató elfogadása.
- Az űrlap JavaScript nélkül is működik. Hibás adatnál a hibák a mezők alatt jelennek meg, a beírt adatok megmaradnak; siker után köszönő üzenet jelenik meg.
- Minden jelentkezés eggyel növeli a választott család **jelentkezőinek számát**, és lefut rá az automatikus státuszváltás (Beállítások): a küszöb elérésekor a család a beállított státuszt kapja.
- Az adminban a **Jelentkezések** menüpont listázza őket:
  - a menüpont mellett az új jelentkezések száma látszik;
  - állapot: Új / Kapcsolatban / Lezárt;
  - keresés név, e-mail, telefonszám vagy család szerint;
  - CSV-export (Excelben is jól nyílik).
- Jelentkezés törlésekor (pl. kéretlen beküldés) a család jelentkezőinek száma eggyel csökken; a státuszt nem állítja vissza.
- A havi összegek és a „Honnan hallott rólunk?” válaszai a **Beállítások → Jelentkezési űrlap** kártyán módosíthatók.
- Védelem a kéretlen beküldések ellen: egy rejtett mező (a robotok kitöltik, és akkor nem mentjük), valamint IP-címenként óránként legfeljebb 5 jelentkezés.
- Az adatkezelési tájékoztató linkje a lábléc „Adatkezelési tájékoztató” linkjét követi; amíg az `#`, az űrlapon sima szöveg.
- Az adatok (adatbázis, feltöltések) az S3-ban vannak, verziózva: a törölt vagy felülírt adat 35 napig visszaállítható.

## Blog

- Az adminban a **Blog** menüpont alatt lehet bejegyzést írni: cím, bevezető, szöveg (képekkel), borítókép, kategória (Hírek, Közös élményeink, Rendezvények, Média megjelenések).
- A közzétett bejegyzések a `/blog` oldalon és a főoldalon (a 3 legfrissebb) jelennek meg; a menü „Közös élményeink” és „Média megjelenések” pontja a megfelelő kategóriára mutat.
- A piszkozatot csak bejelentkezett adminisztrátor látja (előnézet); jövőbeli megjelenési dátummal a bejegyzés időzíthető.
- A webcím (`/blog/...`) a címből készül; közzététel után már ne változtasd, mert a megosztott linkek elromlanak.
- A lábléc „Rendezvényeink – Találkozzunk élőben is” szekciója minden oldalon a 4 legfrissebb „Rendezvények” kategóriájú bejegyzést mutatja (borítókép, cím, dátum, fotók száma), és a galériás bejegyzésre visz. Ha nincs ilyen bejegyzés, a szekció nem jelenik meg.

Az nginx minden olyan útvonalat, amihez nincs statikus fájl, a backendnek ad tovább. A 2026. október 1. előtt telepített szerveren ez még nincs így beállítva, ott a `/blog` és a `/csaladok` oldalakhoz egyszer frissíteni kell az nginx konfigot (vagy újratelepíteni a szervert).

## Termékek és SimplePay fizetés

- Az adminban a **Termékek** menüpont alatt vannak a **terméktípusok** és a termékeik. Minden terméktípus saját aloldal (pl. `/jotekonysagi-galaest`), amely a menü kiválasztott lenyíló pontja alatt jelenik meg (Alapítvány, Fogadj örökbe egy családot, Galéria, Váradi Eszter díj). Új terméktípusnál új aloldal jön létre (név, bevezető szöveg, menüpont); a régi oldalról átvett típusoknál csak a név és a menüpont módosítható. Termék csak terméktípus alá kerülhet, más oldalra nem; terméktípus csak akkor törölhető, ha már nincs terméke.
- Egy termék adatai: terméktípus, név, leírás, ár, gombfelirat, sorrend, megjelenik-e. Az aloldal fizetési kártyái ebből a listából készülnek.
- Az első importkor a régi oldal SimplePay-fizetési linkjeiből (kártyáiból) oldalanként egyszer termékek lesznek; az adminban törölt terméket a későbbi import nem hozza vissza.
- A fizetés az oldalon belül indul (`/fizetes/<termék>`): a támogató megadja a nevét és e-mail-címét, elfogadja az adatkezelési tájékoztatót és az adattovábbítási nyilatkozatot, majd a szerver a SimplePay v2 API-n (aláírt kéréssel) indítja a tranzakciót, és átirányít a SimplePay fizetőoldalára. A számlázási adatokat a SimplePay oldalán adja meg.
- A visszatérő oldal (`/fizetes/vissza`) a SimplePay előírása szerint mutatja az eredményt (sikeres és sikertelen fizetésnél a SimplePay tranzakcióazonosítóval). A végleges állapotot a SimplePay értesítése (IPN, `/fizetes/ipn`) rögzíti.
- A **Fizetések** menüpont listázza az indított fizetéseket (állapot, rendelés- és SimplePay-azonosító, teszt jelölés).
- **Beállítás:** admin **Beállítások → SimplePay fizetés**: kereskedői azonosító (MERCHANT) és titkos kulcs (SECRET KEY) a SimplePay kereskedői felületéről. Előbb teszt (sandbox) módban próbáld ki, utána kapcsold ki a teszt módot. A kártyán látható **IPN címet** a SimplePay kereskedői felületén is meg kell adni.
- Amíg nincs beállítva, a termékek gombjai a régi `checkout.simplepay.hu` fizetési linkekre mutatnak (ha volt ilyen), így a fizetés addig sem áll le.
- A SimplePay logó (lábléc, fizetési oldal) a SimplePay fizetési tájékoztatójára mutat, ahogy az elfogadási feltételek előírják.

## E-mail értesítések

- Minden látogatói beküldésről (támogatói jelentkezés, kapcsolati űrlap, programjelentkezés, díjjelölés), minden sikeres fizetésről és a sikertelen fizetésindításról levél megy az adminban megadott címzetteknek. A levél egyszerű szöveges: a beküldött adatok és az admin linkje; a válaszcím a beküldő e-mail-címe. A programjelentkezés orvosi dokumentumai nem kerülnek a levélbe, csak az adminból tölthetők le.
- **Beállítás:** admin **Beállítások → E-mail értesítések**: SMTP-szerver, port (587, vagy SSL-lel 465), felhasználónév, alkalmazásjelszó, feladó, címzettek. A „Tesztlevél küldése” előbb ment, aztán küld; hiba esetén a hibaüzenet ott látszik.
  - Google Workspace / Gmail: `smtp.gmail.com`, 587; a fiókon kétlépcsős azonosítás és alkalmazásjelszó kell.
  - Microsoft 365: `smtp.office365.com`, 587; a postafióknál az adminisztrátornak engedélyeznie kell az SMTP AUTH-ot.
- A küldés a háttérben fut; átmeneti hibánál (pl. a Google „421 Try again later” válasza) 30 mp, 2 perc és 10 perc múlva újrapróbálja. Ha a levelezőszerver végleg nem elérhető, a beküldés ettől még sikeres, és az adminban megmarad; az utolsó hiba a beállításoknál látszik.

## Partnerlogók

- A partnerlogók (`assets/img/partner-*.png`, és az oldalak „logos” blokkjainak képei importkor) egységes méretűek: a szerver levágja a felesleges szélt, közel azonos felületűre méretezi, és átlátszó 640×320-as vászon közepére teszi (`server/src/logo.js`). Új logót így érdemes ugyanígy előkészíteni.

## Import a régi oldalról (egylepesseltobb.hu)

- A régi WordPress-oldal tartalma (`server/import/wordpress-2026-11-09.json`) a szerver első indulásakor automatikusan bekerül:
  - a családok a WordPress-kategóriájuk szerint kapnak státuszt (örökbefogadható, örökbefogadott, feltöltés alatt; a „kategória nélküliek” archiváltak), és a három minta-család helyére kerülnek;
  - a rendezvénygalériák (aláírási ceremóniák, családi napok, gálaest, Thai koncert) galériás blogbejegyzések lesznek.
- A képeket a szerver tölti le az egylepesseltobb.hu-ról, és webre méretezi (nagy kép 1600 px, bélyegkép 480 px, WebP); ez a kb. 700 képpel néhány percig tart.
- Az import a háttérben fut, az adminban nem jelenik meg. Ha megszakad (pl. újraindul a szerver), a következő induláskor folytatódik: a már letöltött képeket nem tölti le újra, a már importált tartalmat nem duplikálja, és az adminban azóta módosított családokhoz és bejegyzésekhez nem nyúl.
- Frissítés a régi oldal újabb állapotából: `cd server && node scripts/wp-export.mjs` új exportfájlt készít; az `IMPORT_FILE` útvonalát (`src/wpimport.js`) erre kell átírni. A szerver a következő induláskor újra lefuttatja az importot: felveszi az új családokat és bejegyzéseket, és frissíti a meglévők státuszát és szövegét, kivéve amit azóta az adminban módosítottak.
- Ha nincs rá szükség: `WP_IMPORT=0` a `/etc/egylepesseltobb/app.env`-ben.

## Helyi fejlesztés

```bash
cd server
npm install
ADMIN_PASSWORD="legalabb10karakter" npm run create-admin -- --email admin@pelda.hu
npm run dev     # http://127.0.0.1:3000 és http://127.0.0.1:3000/admin.html
npm test
```

Az adatok helyben a `server/data/` mappába kerülnek (nincs verziókezelve).

## Költség

Forgalom nélkül gyakorlatilag 0: nincs futó szerver, sem adatbázis-példány. Fizetni csak a használatért kell: a CloudFront (havi 1 TB és 10 millió kérés ingyenes), a Lambda (havi 1 millió kérés és 400 000 GB-másodperc ingyenes), a DynamoDB-zár kérései (fillérek), valamint az S3-tárhely (kb. 0,3 GB a képekkel és a régi verziókkal, havonta néhány cent). Az SSM paraméter ingyenes. Környezetenként (staging, éles) ugyanennyi.
