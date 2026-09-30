#!/bin/bash
# EC2 user-data (Ubuntu 24.04): nginx + automatikus frissítés a GitHub repóból.
# A deploy.sh a shebang után beírja a REPO_URL / BRANCH / DOMAIN / EMAIL értékeket.
set -euxo pipefail

REPO_URL="${REPO_URL:-https://github.com/MaczakG/egylepesseltobb.git}"
BRANCH="${BRANCH:-}"   # üresen: a repó alapértelmezett ága
DOMAIN="${DOMAIN:-}"   # pl. "egylepesseltobb.hu,www.egylepesseltobb.hu" – ha meg van adva, HTTPS is lesz
EMAIL="${EMAIL:-}"     # Let's Encrypt értesítésekhez

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx git rsync
if [ -n "$DOMAIN" ]; then
  apt-get install -y certbot python3-certbot-nginx
fi

mkdir -p /etc/egylepesseltobb /var/www/egylepesseltobb
cat > /etc/egylepesseltobb/env <<EOF
REPO_URL=$(printf %q "$REPO_URL")
BRANCH=$(printf %q "$BRANCH")
DOMAIN=$(printf %q "$DOMAIN")
EMAIL=$(printf %q "$EMAIL")
EOF

# --- nginx ---------------------------------------------------------------
server_name="${DOMAIN//,/ }"
cat > /etc/nginx/sites-available/egylepesseltobb <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${server_name:-_};

    root /var/www/egylepesseltobb;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript image/svg+xml;

    add_header X-Content-Type-Options nosniff always;

    location / {
        try_files \$uri \$uri/ =404;
    }

    location /assets/ {
        expires 30d;
    }

    # A mock adatos admin felület ne kerüljön be a keresőkbe.
    location = /admin.html {
        add_header X-Content-Type-Options nosniff always;
        add_header X-Robots-Tag "noindex, nofollow" always;
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
# Lehúzza a legfrissebb változatot a GitHubról és kirakja a webrootba.
set -euo pipefail
. /etc/egylepesseltobb/env
SRC=/opt/egylepesseltobb
WEB=/var/www/egylepesseltobb

if [ -z "$BRANCH" ]; then
  BRANCH=$(git ls-remote --symref "$REPO_URL" HEAD | awk '/^ref:/ { sub("refs/heads/", "", $2); print $2 }')
fi

if [ ! -d "$SRC/.git" ]; then
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$SRC"
else
  git -C "$SRC" fetch --depth 1 origin "$BRANCH"
  git -C "$SRC" reset --hard FETCH_HEAD
fi

rsync -a --delete --exclude '.*' --exclude 'deploy/' --exclude '*.md' --exclude 'wrangler.jsonc' "$SRC/" "$WEB/"

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
