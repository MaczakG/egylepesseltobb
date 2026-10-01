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

Az ideiglenes domain helyett saját domaint a `DOMAIN` megadásával lehet használni (GitHubon a **Run workflow** `domain` mezőjében):

```bash
DOMAIN="egylepesseltobb.hu,www.egylepesseltobb.hu" EMAIL="info@pelda.hu" deploy/aws/deploy.sh
```

Ezután a domain(ek) A rekordját állítsd a kiírt IP címre. Amint a DNS odamutat, a szerver magától kér Let's Encrypt tanúsítványt, és átirányít HTTPS-re. A megújítás automatikus.

A domain a szerver létrehozásakor dől el: egy már futó (ideiglenes domaines) szervert előbb törölni kell (`destroy`), aztán újra létrehozni a saját domainnel. Ilyenkor az IP cím is megváltozik.

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
- Az adatok a szerver lemezén vannak: a `destroy` velük együtt törli a szervert. Éles használat előtt érdemes rendszeres mentést (pl. EBS snapshot) beállítani.

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
