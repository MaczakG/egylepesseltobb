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
- Az első indításkor a főoldal eddigi három családja kerül az adatbázisba; ezek az adminban szerkeszthetők.
- A főoldalon az „Örökbefogadható” státuszú családok jelennek meg; az „Örökbefogadott” státuszúak lekerülnek róla.
- Az adatok a szerver lemezén vannak: a `destroy` velük együtt törli a szervert. Naponta mentés készül Google Drive-ra (lásd lent).

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
