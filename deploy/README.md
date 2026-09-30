# Telepítés AWS-re (EC2, Ubuntu 24.04 + nginx)

A `deploy/aws/deploy.sh` feltesz egy Linux szervert az AWS-re, ami kiszolgálja az oldalt:

- EC2 példány (alapból `t3.micro`, Ubuntu 24.04), fix (Elastic) IP címmel
- security group: csak a 80-as (HTTP) és 443-as (HTTPS) port nyitott
- nginx: gzip, 30 napos cache az `assets/` alatt, az `admin.html` nem indexelhető
- **ideiglenes domain HTTPS-sel**: ha nincs saját domain, az oldal a `<ip-kötőjelekkel>.sslip.io` címen érhető el (pl. `https://3-120-1-2.sslip.io`), ingyenes Let's Encrypt tanúsítvánnyal
- a szerver a GitHub repóból húzza le az oldalt, és **5 percenként automatikusan frissül** a repó alapértelmezett ágáról, így egy merge után pár percen belül élesben van

## Telepítés GitHubról (ajánlott)

1. A repó **Settings → Secrets and variables → Actions** oldalán add hozzá a két secretet:
   - `AWS_ACCESS_KEY_ID` (az `AKIA…` kezdetű azonosító)
   - `AWS_SECRET_ACCESS_KEY`

   A régió alapból `eu-central-1` (Frankfurt); ha mást szeretnél, a **Variables** fülön add meg `AWS_REGION` néven.
2. Merge-öld a `deploy/aws/` változásait az alapértelmezett ágra: a **Deploy AWS** workflow magától lefut, és létrehozza a szervert. Kézzel is indítható: **Actions → Deploy AWS → Run workflow**.
3. A workflow összefoglalójában (a futás oldalán) megjelenik az oldal címe.

Ha a szerver már létezik, a workflow nem hoz létre újat, csak kiírja a címét. Törléshez: **Run workflow**, a művelet legyen `destroy`.

## Telepítés a saját gépről

Kell hozzá az [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), beállított hitelesítéssel (`aws configure`, vagy `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_DEFAULT_REGION`).

```bash
deploy/aws/deploy.sh    # létrehozás
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

## Költség

`t3.micro` + nyilvános IPv4 cím + 8 GB tárhely: nagyjából 13 USD/hó (Frankfurt régió), AWS Free Tier alatt kevesebb vagy ingyenes.
