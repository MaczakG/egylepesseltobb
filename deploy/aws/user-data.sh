#!/bin/bash
# EC2 user-data (Ubuntu 24.04): nginx + Node.js backend + automatikus frissítés a GitHub repóból.
# A deploy.sh a shebang után beírja a REPO_URL / BRANCH / DOMAIN / EMAIL / ADMIN_* értékeket.
set -euxo pipefail

REPO_URL="${REPO_URL:-https://github.com/MaczakG/egylepesseltobb.git}"
BRANCH="${BRANCH:-}"                         # üresen: a repó alapértelmezett ága
DOMAIN="${DOMAIN:-}"                         # pl. "egylepesseltobb.hu,www.egylepesseltobb.hu" – ha meg van adva, HTTPS is lesz
EMAIL="${EMAIL:-}"                           # Let's Encrypt értesítésekhez
ADMIN_EMAIL="${ADMIN_EMAIL:-}"               # az első admin felhasználó
ADMIN_PASSWORD_HASH="${ADMIN_PASSWORD_HASH:-}"  # scrypt hash, a jelszó maga nem kerül a szerverre
GDRIVE_TOKEN="${GDRIVE_TOKEN:-}"             # rclone OAuth token (JSON) a napi Google Drive mentéshez
GDRIVE_FOLDER_ID="${GDRIVE_FOLDER_ID:-}"     # a Drive mappa azonosítója (a mappa linkjének vége)
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
NODE_MAJOR=24

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx git rsync curl xz-utils sqlite3 rclone
if [ -n "$DOMAIN" ]; then
  apt-get install -y certbot python3-certbot-nginx
fi

# --- Node.js (hivatalos bináris, ellenőrzőösszeggel) -----------------------
node_base="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
shasums=$(curl -fsSL "$node_base/SHASUMS256.txt")
tarball=$(awk '/linux-x64\.tar\.xz$/ { print $2 }' <<< "$shasums")
curl -fsSL -o "/tmp/$tarball" "$node_base/$tarball"
(cd /tmp && grep " $tarball\$" <<< "$shasums" | sha256sum -c -)
mkdir -p /opt/node
tar -xJf "/tmp/$tarball" -C /opt/node --strip-components=1 --no-same-owner
rm "/tmp/$tarball"
ln -sf /opt/node/bin/node /opt/node/bin/npm /opt/node/bin/npx /usr/local/bin/

# --- alkalmazás felhasználó és beállítások --------------------------------
id egylepesseltobb >/dev/null 2>&1 || useradd --system --home-dir /var/lib/egylepesseltobb --shell /usr/sbin/nologin egylepesseltobb
mkdir -p /etc/egylepesseltobb /var/www/egylepesseltobb /var/lib/egylepesseltobb/uploads
chown -R egylepesseltobb:egylepesseltobb /var/lib/egylepesseltobb
chmod 711 /var/lib/egylepesseltobb          # az nginx átléphet rajta a képekhez, listázni nem tud
chmod 755 /var/lib/egylepesseltobb/uploads

cat > /etc/egylepesseltobb/env <<EOF
REPO_URL=$(printf %q "$REPO_URL")
BRANCH=$(printf %q "$BRANCH")
DOMAIN=$(printf %q "$DOMAIN")
EMAIL=$(printf %q "$EMAIL")
EOF

if [ ! -f /etc/egylepesseltobb/app.env ]; then
  cat > /etc/egylepesseltobb/app.env <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
SITE_DIR=/var/www/egylepesseltobb
DATA_DIR=/var/lib/egylepesseltobb
SESSION_SECRET=$(openssl rand -hex 32)
EOF
  chown root:egylepesseltobb /etc/egylepesseltobb/app.env
  chmod 640 /etc/egylepesseltobb/app.env
fi

cat > /etc/systemd/system/egylepesseltobb-app.service <<'EOF'
[Unit]
Description=Egy Lépéssel Több webalkalmazás
After=network.target

[Service]
User=egylepesseltobb
EnvironmentFile=/etc/egylepesseltobb/app.env
WorkingDirectory=/opt/egylepesseltobb/server
ExecStart=/usr/local/bin/node --disable-warning=ExperimentalWarning src/server.js
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/egylepesseltobb

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable egylepesseltobb-app.service

# --- nginx ---------------------------------------------------------------
# A főoldalt és az API-t a Node szolgálja ki (a családokat az adatbázisból rendereli), a többit az nginx.
server_name="${DOMAIN//,/ }"
cat > /etc/nginx/sites-available/egylepesseltobb <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${server_name:-_};

    root /var/www/egylepesseltobb;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    add_header X-Content-Type-Options nosniff always;

    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    location = / {
        proxy_pass http://127.0.0.1:3000;
    }

    location = /index.html {
        proxy_pass http://127.0.0.1:3000;
    }

    location /api/ {
        client_max_body_size 12m;
        proxy_pass http://127.0.0.1:3000;
    }

    location /uploads/ {
        alias /var/lib/egylepesseltobb/uploads/;
        expires 30d;
    }

    location /assets/ {
        expires 30d;
    }

    location = /admin.html {
        add_header X-Content-Type-Options nosniff always;
        add_header X-Robots-Tag "noindex, nofollow" always;
    }

    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF
ln -sf /etc/nginx/sites-available/egylepesseltobb /etc/nginx/sites-enabled/egylepesseltobb
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# --- frissítő szkript ------------------------------------------------------
cat > /usr/local/bin/egylepesseltobb-update <<'EOF'
#!/bin/bash
# Lehúzza a legfrissebb változatot a GitHubról, kirakja a webrootba, és ha kell, újraindítja a backendet.
set -euo pipefail
. /etc/egylepesseltobb/env
SRC=/opt/egylepesseltobb
WEB=/var/www/egylepesseltobb

if [ -z "$BRANCH" ]; then
  BRANCH=$(git ls-remote --symref "$REPO_URL" HEAD | awk '/^ref:/ { sub("refs/heads/", "", $2); print $2 }')
fi

before=$(git -C "$SRC" rev-parse HEAD 2>/dev/null || echo none)
if [ ! -d "$SRC/.git" ]; then
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$SRC"
else
  git -C "$SRC" fetch --depth 1 origin "$BRANCH"
  git -C "$SRC" reset --hard FETCH_HEAD
fi
after=$(git -C "$SRC" rev-parse HEAD)

rsync -a --delete --exclude '.*' --exclude 'deploy/' --exclude 'server/' --exclude '*.md' "$SRC/" "$WEB/"

if [ "$before" != "$after" ] || [ ! -d "$SRC/server/node_modules" ]; then
  (cd "$SRC/server" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
  systemctl restart egylepesseltobb-app
elif ! systemctl is-active --quiet egylepesseltobb-app; then
  systemctl start egylepesseltobb-app
fi

if [ -n "$DOMAIN" ] && [ ! -d "/etc/letsencrypt/live/${DOMAIN%%,*}" ]; then
  # Csak akkor kérünk tanúsítványt, ha minden domain már erre a szerverre mutat,
  # különben a Let's Encrypt a sikertelen próbálkozások miatt egy időre letiltana.
  token=$(curl -sf --max-time 2 -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token || true)
  my_ip=$(curl -sf --max-time 2 -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/public-ipv4 || true)
  ready=$([ -n "$my_ip" ] && echo 1 || echo 0)
  for d in ${DOMAIN//,/ }; do
    [ "$(getent ahostsv4 "$d" | awk 'NR == 1 { print $1 }')" = "$my_ip" ] || ready=0
  done
  if [ "$ready" = 1 ]; then
    if [ -n "$EMAIL" ]; then email_args=(-m "$EMAIL"); else email_args=(--register-unsafely-without-email); fi
    certbot --nginx --non-interactive --agree-tos --redirect "${email_args[@]}" -d "$DOMAIN" || true
  fi
fi
EOF
chmod 755 /usr/local/bin/egylepesseltobb-update
/usr/local/bin/egylepesseltobb-update

# --- napi mentés Google Drive-ra ------------------------------------------
if [ -n "$GDRIVE_TOKEN" ] && [ -n "$GDRIVE_FOLDER_ID" ]; then
  # A token hozzáfér a Drive-hoz, ezért csak root olvashatja.
  install -m 600 /dev/null /etc/egylepesseltobb/rclone.conf
  cat > /etc/egylepesseltobb/rclone.conf <<EOF
[gdrive]
type = drive
scope = drive
root_folder_id = $GDRIVE_FOLDER_ID
token = $GDRIVE_TOKEN
EOF
  cat > /etc/egylepesseltobb/backup.env <<EOF
BACKUP_KEEP_DAYS=$(printf %q "$BACKUP_KEEP_DAYS")
EOF

  cat > /usr/local/bin/egylepesseltobb-backup <<'EOF'
#!/bin/bash
# Adatbázis + feltöltött képek → egylepesseltobb-ÉÉÉÉ-HH-NN_ÓÓPP.tar.gz a Google Drive mappába.
set -euo pipefail
. /etc/egylepesseltobb/backup.env
DATA=${DATA_DIR:-/var/lib/egylepesseltobb}
RCLONE=(rclone --config "${RCLONE_CONFIG:-/etc/egylepesseltobb/rclone.conf}")

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir "$work/egylepesseltobb"
# A .backup futás közben is konzisztens másolatot ad (a WAL tartalmát is beleérti).
sqlite3 "$DATA/egylepesseltobb.db" ".backup '$work/egylepesseltobb/egylepesseltobb.db'"
cp -a "$DATA/uploads" "$work/egylepesseltobb/uploads"
archive="$work/egylepesseltobb-$(date +%Y-%m-%d_%H%M).tar.gz"
tar -czf "$archive" -C "$work" egylepesseltobb

"${RCLONE[@]}" copy "$archive" gdrive:
"${RCLONE[@]}" delete gdrive: --min-age "${BACKUP_KEEP_DAYS}d" --include 'egylepesseltobb-*.tar.gz'
echo "Mentés feltöltve: $(basename "$archive")"
EOF
  chmod 755 /usr/local/bin/egylepesseltobb-backup

  cat > /etc/systemd/system/egylepesseltobb-backup.service <<'EOF'
[Unit]
Description=egylepesseltobb mentése Google Drive-ra
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/egylepesseltobb-backup
EOF

  cat > /etc/systemd/system/egylepesseltobb-backup.timer <<'EOF'
[Unit]
Description=egylepesseltobb napi mentése

[Timer]
OnCalendar=*-*-* 03:15:00 Europe/Budapest
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now egylepesseltobb-backup.timer
fi

# --- első admin ------------------------------------------------------------
if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD_HASH" ]; then
  (cd /opt/egylepesseltobb/server && sudo -u egylepesseltobb env DATA_DIR=/var/lib/egylepesseltobb \
    /usr/local/bin/node --disable-warning=ExperimentalWarning scripts/create-admin.js \
    --email "$ADMIN_EMAIL" --password-hash "$ADMIN_PASSWORD_HASH")
fi

cat > /etc/systemd/system/egylepesseltobb-update.service <<'EOF'
[Unit]
Description=egylepesseltobb frissítése a GitHubról
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/egylepesseltobb-update
EOF

cat > /etc/systemd/system/egylepesseltobb-update.timer <<'EOF'
[Unit]
Description=egylepesseltobb frissítése 5 percenként

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now egylepesseltobb-update.timer
