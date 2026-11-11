#!/usr/bin/env bash
# Telepítés a szerver nélküli (S3 + CloudFront + Lambda) környezetbe.
#   deploy/serverless/deploy.sh staging|prod
# Opcionális: DOMAIN_NAMES=egylepesseltobb.hu,www.egylepesseltobb.hu CERTIFICATE_ARN=arn:aws:acm:us-east-1:…
# Első telepítés után a tartalom importja és az admin:
#   deploy/serverless/deploy.sh staging import
#   ADMIN_EMAIL=… ADMIN_PASSWORD=… deploy/serverless/deploy.sh staging create-admin
set -euo pipefail

STAGE=${1:?Add meg: staging vagy prod}
TASK=${2:-deploy}
[[ $STAGE == staging || $STAGE == prod ]] || { echo "Ismeretlen környezet: $STAGE" >&2; exit 1; }
export AWS_REGION=${AWS_REGION:-eu-central-1} AWS_DEFAULT_REGION=${AWS_REGION:-eu-central-1}
STACK=egylepesseltobb-$STAGE
SECRET_PARAM=/egylepesseltobb/$STAGE/session-secret
ROOT=$(cd "$(dirname "$0")/../.." && pwd)

output() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

if [[ $TASK != deploy ]]; then
  cd "$ROOT/server"
  BUCKET=$(output Bucket) LOCK_TABLE=$(output LockTable) node scripts/remote.mjs "$TASK"
  exit
fi

# A munkamenet-kulcs csak az SSM-ben van (titkosítva), a Lambda induláskor olvassa be.
if ! aws ssm get-parameter --name "$SECRET_PARAM" >/dev/null 2>&1; then
  aws ssm put-parameter --name "$SECRET_PARAM" --type SecureString --value "$(openssl rand -hex 32)" >/dev/null
fi

aws cloudformation deploy --stack-name "$STACK" --template-file "$ROOT/deploy/serverless/template.yaml" \
  --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
  --parameter-overrides Stage="$STAGE" SessionSecretParam="$SECRET_PARAM" \
    DomainNames="${DOMAIN_NAMES:-}" CertificateArn="${CERTIFICATE_ARN:-}"

# A Lambda csomag: a két HTML-oldal, a szerver kódja, az importfájlok és a futáshoz kellő csomagok (Linux x64).
BUILD=$(mktemp -d)
trap 'rm -rf "$BUILD"' EXIT
mkdir -p "$BUILD/pkg/server"
cp "$ROOT/index.html" "$ROOT/admin.html" "$BUILD/pkg/"
cp -r "$ROOT/server/src" "$ROOT/server/import" "$ROOT/server/package.json" "$ROOT/server/package-lock.json" "$BUILD/pkg/server/"
(cd "$BUILD/pkg/server" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
(cd "$BUILD/pkg" && zip -qr "$BUILD/function.zip" .)

FUNCTION=$(output FunctionName)
aws lambda update-function-code --function-name "$FUNCTION" --zip-file "fileb://$BUILD/function.zip" >/dev/null
aws lambda wait function-updated-v2 --function-name "$FUNCTION"

BUCKET=$(output Bucket)
aws s3 sync "$ROOT/assets" "s3://$BUCKET/assets" --delete --only-show-errors --cache-control 'public, max-age=86400'
aws cloudfront create-invalidation --distribution-id "$(output DistributionId)" --paths '/assets/*' >/dev/null

echo "Kész: $(output Url)"
