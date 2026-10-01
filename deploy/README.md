# Telepítés AWS-re (EC2, Ubuntu 24.04 + nginx + Node.js)

A `deploy/aws/deploy.sh` feltesz egy Linux szervert az AWS-re, ami kiszolgálja az oldalt:

- EC2 példány (alapból `t3.micro`, Ubuntu 24.04), fix (Elastic) IP címmel
- security group: csak a 80-as (HTTP) és 443-as (HTTPS) port nyitott
- nginx + Node.js 24 backend (`server/`, systemd szolgáltatásként): a főoldal családjait és az admin felület API-ját a backend szolgálja ki, a többit az nginx (gzip, 30 napos cache az `assets/` és `uploads/` alatt, az `admin.html` nem indexelhető)
- az adatbázis (SQLite) és a feltöltött képek helye: `/var/lib/egylepesseltobb`
- **ideiglenes domain HTTPS-sel**: ha nincs saját domain, az oldal a `<ip-kötőjelekkel>.sslip.io` címen érhető el (pl. `https://3-120-1-2.sslip.io`), ingyenes Let's Encrypt tanúsítvánnyal
- a szerver a GitHub repóból húzza le az oldalt, és **5 percenként automatikusan frissül** a repó alapértelmezett ágáról, így egy merge után pár percen belül élesben van

## Telepítés GitHubról (ajánlott)

1. A repó **Settings → Secrets and variables → Actions** oldalán add hozzá a secreteket:
   - `AWS_ACCESS_KEY_ID` (az `AKIA…` kezdetű azonosító)
   - `AWS_SECRET_ACCESS_KEY`
   - `ADMIN_EMAIL`: ezzel az e-mail címmel lehet belépni az admin felületre (`/admin.html`)
   - `ADMIN_PASSWORD`: legalább 10 karakter. A szerverre csak a hash-e kerül; belépés után a **Beállítások** oldalon meg is változtatható.
   - `GDRIVE_TOKEN`, `GDRIVE_FOLDER_ID`: a napi Google Drive mentéshez (lásd lent)

   A régió alapból `eu-central-1` (Frankfurt); ha mást szeretnél, a **Variables** fülön add meg `AWS_REGION` néven.
2. Merge-öld a `deploy/aws/` változásait az alapértelmezett ágra: a **Deploy AWS** workflow magától lefut, és létrehozza a szervert. Kézzel is indítható: **Actions → Deploy AWS → Run workflow**.
3. A workflow összefoglalójában (a futás oldalán) megjelenik az oldal címe.

Ha a szerver már létezik, a workflow nem hoz létre újat, csak kiírja a címét. Törléshez: **Run workflow**, a művelet legyen `destroy`.

## Telepítés a saját gépről

Kell hozzá az [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), beállított hitelesítéssel (`aws configure`, vagy `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_DEFAULT_REGION`).

```bash
ADMIN_EMAIL="info@pelda.hu" ADMIN_PASSWORD="…" deploy/aws/deploy.sh    # létrehozás
deploy/aws/destroy.sh   # törlés (rákérdez; FORCE=1-gyel nem)
```

## Saját domain

Az ideiglenes `<ip>.sslip.io` cím mindig megmarad. Mellé saját (al)domain(eke)t a `DOMAIN` megadásával lehet adni (GitHubon a **Run workflow** `domain` mezőjében), például:

```bash
DOMAIN="teszt.egylepesseltobb.hu" EMAIL="info@pelda.hu" deploy/aws/deploy.sh
```

Ezután a domain(ek)hez vegyél fel egy A rekordot a kiírt IP címre. A szerver 5 percenként ellenőrzi a DNS-t: amint egy domain ide mutat, a közös Let's Encrypt tanúsítványt kibővíti vele, és HTTP-ről HTTPS-re irányít. A megújítás automatikus.

A domainnek csak ez az egy A rekordja legyen: ha a régi tárhely IP-je is megmaradt mellette, a Let's Encrypt azt is ellenőrzi, és nem ad tanúsítványt. Ilyenkor a szerver nem is próbálkozik, amíg a régi rekordot nem törlöd.

A domainek listája a szerver létrehozásakor dől el. Új domain hozzáadásához a szervert újra kell telepíteni (`destroy`, majd `deploy`). Az IP cím ilyenkor megváltozik, és az adatbázis is törlődik (a napi mentésből visszaállítható).

## További beállítások

| Változó | Alapérték | Jelentés |
| --- | --- | --- |
| `BRANCH` | a repó alapértelmezett ága | melyik ágról frissüljön az oldal |
| `INSTANCE_TYPE` | `t3.micro` | EC2 példánytípus |
| `NAME` | `egylepesseltobb` | az AWS erőforrások neve (`Name` tag) |
| `KEY_NAME` + `SSH_CIDR` | – | SSH-hozzáféréshez: meglévő EC2 key pair neve és az engedélyezett IP tartomány (pl. `1.2.3.4/32`) |

Előfeltétel: a régióban legyen default VPC (új fiókoknál alapból van), és a felhasználónak legyen EC2 jogosultsága (példány, security group, Elastic IP kezelése).

## Admin felület és adatok

- Belépés: `https://<domain>/admin.html`, az `ADMIN_EMAIL` / `ADMIN_PASSWORD` adatokkal.
- Családstátuszok: **Örökbefogadható**, **Örökbefogadott**, **Feltöltés alatt**, **Archivált**. A főoldalon csak az „Örökbefogadható” státuszú családok jelennek meg, a többi csak az adminban látszik.
- Az automatikus státuszváltás (Beállítások) csak az örökbefogadható és az örökbefogadott családokra vonatkozik.
- Minden gyereknek (családnak) saját aloldala van: `/csaladok/<webcím>`. Az adatbázisból jön a név, az alcím, a történet és a képek (nagyítóval). Van rajta „Segíteni szeretnék” gomb, ami a lábléc e-mail címére ír a család nevével a tárgyban, megosztás gomb és további örökbefogadható családok. A havi összeg és a jelentkezők száma nem jelenik meg.
- A webcím a névből készül, és átnevezéskor nem változik; az adminban a család adatlapján átírható. Ugyanott az „Aloldal ↗” gomb megnyitja az oldalt.
- Aloldala az örökbefogadható és az örökbefogadott családoknak van. Az archivált és a feltöltés alatti családot csak bejelentkezett adminisztrátor látja, előnézetként.
- Családlista lapozás nélkül, minden család egy oldalon: `/csaladok` (az összes nyilvános család, elöl az örökbefogadhatók), `/csaladok?statusz=orokbefogadhato` és `/csaladok?statusz=orokbefogadott`. A menü „Örökbefogadható / Örökbefogadott családok” pontja ide mutat.

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
- Az adatok a szerver lemezén vannak: a `destroy` velük együtt törli a szervert. Naponta mentés készül Google Drive-ra (lásd lent).

## Blog

- Az adminban a **Blog** menüpont alatt lehet bejegyzést írni: cím, bevezető, szöveg (képekkel), borítókép, kategória (Hírek, Közös élményeink, Rendezvények, Média megjelenések).
- A közzétett bejegyzések a `/blog` oldalon és a főoldalon (a 3 legfrissebb) jelennek meg; a menü „Közös élményeink” és „Média megjelenések” pontja a megfelelő kategóriára mutat.
- A piszkozatot csak bejelentkezett adminisztrátor látja (előnézet); jövőbeli megjelenési dátummal a bejegyzés időzíthető.
- A webcím (`/blog/...`) a címből készül; közzététel után már ne változtasd, mert a megosztott linkek elromlanak.
- A lábléc „Rendezvényeink – Találkozzunk élőben is” szekciója minden oldalon a 4 legfrissebb „Rendezvények” kategóriájú bejegyzést mutatja (borítókép, cím, dátum, fotók száma), és a galériás bejegyzésre visz. Ha nincs ilyen bejegyzés, a szekció nem jelenik meg.

Az nginx minden olyan útvonalat, amihez nincs statikus fájl, a backendnek ad tovább. A 2026. október 1. előtt telepített szerveren ez még nincs így beállítva, ott a `/blog` és a `/csaladok` oldalakhoz egyszer frissíteni kell az nginx konfigot (vagy újratelepíteni a szervert).

## Import a régi oldalról (egylepesseltobb.hu)

- A régi WordPress-oldal tartalma (`server/import/wordpress-2026-10-01.json`) a szerver első indulásakor automatikusan bekerül:
  - a családok a WordPress-kategóriájuk szerint kapnak státuszt (örökbefogadható, örökbefogadott, feltöltés alatt; a „kategória nélküliek” archiváltak), és a három minta-család helyére kerülnek;
  - a rendezvénygalériák (aláírási ceremóniák, családi napok, gálaest, Thai koncert) galériás blogbejegyzések lesznek.
- A képeket a szerver tölti le az egylepesseltobb.hu-ról, és webre méretezi (nagy kép 1600 px, bélyegkép 480 px, WebP); ez a kb. 700 képpel néhány percig tart.
- Az import a háttérben fut, az adminban nem jelenik meg. Ha megszakad (pl. újraindul a szerver), a következő induláskor folytatódik: a már letöltött képeket nem tölti le újra, a már importált tartalmat nem duplikálja, és az adminban azóta módosított családokhoz és bejegyzésekhez nem nyúl.
- Ha nincs rá szükség: `WP_IMPORT=0` a `/etc/egylepesseltobb/app.env`-ben.

## Napi mentés Google Drive-ra

A szerver minden éjjel (03:15, magyar idő szerint) egy `egylepesseltobb-ÉÉÉÉ-HH-NN_ÓÓPP.tar.gz` fájlt tölt fel a megadott Google Drive mappába. A fájlban az adatbázis és a feltöltött képek vannak. A 30 napnál régebbi mentéseket a szerver törli a mappából (`BACKUP_KEEP_DAYS`).

Beállítás (egyszer kell):

1. A saját gépeden telepítsd az [rclone](https://rclone.org/install/)-t, és futtasd: `rclone authorize "drive"`. Megnyílik a böngésző: lépj be azzal a Google fiókkal, amelyiké a mappa, és engedélyezd a hozzáférést. A parancs végén kiír egy `{"access_token":...}` kezdetű sort.
2. Vedd fel GitHubon a repó secretjei közé:
   - `GDRIVE_TOKEN`: a kiírt `{...}` sor teljes egészében;
   - `GDRIVE_FOLDER_ID`: a mappa linkjének vége, pl. a `https://drive.google.com/drive/folders/1AbC...` linkből az `1AbC...` rész.
3. A beállítás a szerver létrehozásakor kerül fel. Ha a szerver már fut, előbb `destroy`, aztán újra `deploy` kell.

A mentés jelszó-hasheket és a családok adatait tartalmazza: a Drive mappát ne oszd meg linkkel.

Visszaállítás a szerveren: állítsd le a szolgáltatást (`systemctl stop egylepesseltobb-app`), csomagold ki a mentést, másold az `egylepesseltobb.db`-t és az `uploads/` mappát a `/var/lib/egylepesseltobb/` alá (tulajdonos: `egylepesseltobb`), majd indítsd újra a szolgáltatást.

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

`t3.micro` + nyilvános IPv4 cím + 8 GB tárhely: nagyjából 13 USD/hó (Frankfurt régió), AWS Free Tier alatt kevesebb vagy ingyenes.
