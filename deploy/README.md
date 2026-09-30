# Telepítés AWS-re (EC2, Ubuntu 24.04 + nginx)

A `deploy/aws/deploy.sh` egyetlen paranccsal feltesz egy Linux szervert az AWS-re, ami kiszolgálja az oldalt:

- EC2 példány (alapból `t3.micro`, Ubuntu 24.04), fix (Elastic) IP címmel
- security group: csak a 80-as (HTTP) és 443-as (HTTPS) port nyitott
- nginx: gzip, 30 napos cache az `assets/` alatt, az `admin.html` nem indexelhető
- a szerver a GitHub repóból húzza le az oldalt, és **5 percenként automatikusan frissül** a repó alapértelmezett ágáról, így egy merge után pár percen belül élesben van

## Előfeltételek

- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), beállított hitelesítéssel (`aws configure`, vagy `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_DEFAULT_REGION`)
- a kiválasztott régióban legyen default VPC (új fiókoknál alapból van)
- EC2 jogosultság a felhasználónak (példány, security group, Elastic IP kezelése)

## Indítás

```bash
deploy/aws/deploy.sh
```

A végén kiírja az oldal címét (`http://<IP>`). Ha a szerver már létezik, csak a címét írja ki.

### Saját domain + HTTPS

```bash
DOMAIN="egylepesseltobb.hu,www.egylepesseltobb.hu" EMAIL="info@pelda.hu" deploy/aws/deploy.sh
```

Ezután a domain(ek) A rekordját állítsd a kiírt IP címre. Amint a DNS odamutat, a szerver magától kér Let's Encrypt tanúsítványt (5 percenként újrapróbálja), és átirányít HTTPS-re. A megújítás automatikus.

### További beállítások

| Változó | Alapérték | Jelentés |
| --- | --- | --- |
| `BRANCH` | a repó alapértelmezett ága | melyik ágról frissüljön az oldal |
| `INSTANCE_TYPE` | `t3.micro` | EC2 példánytípus |
| `NAME` | `egylepesseltobb` | az AWS erőforrások neve (`Name` tag) |
| `KEY_NAME` + `SSH_CIDR` | – | SSH-hozzáféréshez: meglévő EC2 key pair neve és az engedélyezett IP tartomány (pl. `1.2.3.4/32`) |

## Törlés

```bash
deploy/aws/destroy.sh
```

Törli a példányt, felszabadítja az Elastic IP-t és törli a security groupot (rákérdez; `FORCE=1`-gyel nem).

## Költség

`t3.micro` + nyilvános IPv4 cím + 8 GB tárhely: nagyjából 13 USD/hó (Frankfurt régió), AWS Free Tier alatt kevesebb vagy ingyenes.
