#!/usr/bin/env bash
# Feltesz egy Ubuntu 24.04 + nginx EC2 szervert, ami a GitHub repóból szolgálja ki az oldalt.
# Használat: deploy/aws/deploy.sh   (AWS CLI + beállított hitelesítés kell hozzá)
set -euo pipefail

NAME="${NAME:-egylepesseltobb}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.micro}"
REPO_URL="${REPO_URL:-https://github.com/MaczakG/egylepesseltobb.git}"
BRANCH="${BRANCH:-}"       # üresen: a repó alapértelmezett ága
DOMAIN="${DOMAIN:-}"       # pl. "egylepesseltobb.hu,www.egylepesseltobb.hu"
EMAIL="${EMAIL:-}"         # Let's Encrypt értesítésekhez
KEY_NAME="${KEY_NAME:-}"   # meglévő EC2 key pair, ha SSH-hozzáférés kell
SSH_CIDR="${SSH_CIDR:-}"   # innen engedjük az SSH-t, pl. 1.2.3.4/32

here="$(cd "$(dirname "$0")" && pwd)"

existing=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[].Instances[].InstanceId | [0]' --output text)
if [ "$existing" != "None" ]; then
  ip=$(aws ec2 describe-instances --instance-ids "$existing" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
  echo "Már létezik '$NAME' szerver: $existing"
  echo "http://$ip"
  exit 0
fi

vpc=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
if [ "$vpc" = "None" ]; then
  echo "Nincs default VPC ebben a régióban ($(aws configure get region))." >&2
  exit 1
fi

sg=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$NAME-web" "Name=vpc-id,Values=$vpc" \
  --query 'SecurityGroups[0].GroupId' --output text)
if [ "$sg" = "None" ]; then
  echo "Security group létrehozása..."
  sg=$(aws ec2 create-security-group --group-name "$NAME-web" --vpc-id "$vpc" \
    --description "HTTP/HTTPS for $NAME" --query GroupId --output text)
  aws ec2 authorize-security-group-ingress --group-id "$sg" --ip-permissions \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}],Ipv6Ranges=[{CidrIpv6=::/0}]' \
    'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}],Ipv6Ranges=[{CidrIpv6=::/0}]' \
    >/dev/null
fi
if [ -n "$SSH_CIDR" ]; then
  aws ec2 authorize-security-group-ingress --group-id "$sg" --protocol tcp --port 22 \
    --cidr "$SSH_CIDR" >/dev/null 2>&1 || true
fi

ami=$(aws ec2 describe-images --owners 099720109477 \
  --filters 'Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*' \
            'Name=state,Values=available' \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' --output text)

userdata=$(mktemp)
trap 'rm -f "$userdata"' EXIT
{
  echo '#!/bin/bash'
  printf 'REPO_URL=%q\nBRANCH=%q\nDOMAIN=%q\nEMAIL=%q\n' "$REPO_URL" "$BRANCH" "$DOMAIN" "$EMAIL"
  tail -n +2 "$here/user-data.sh"
} > "$userdata"

run_args=(
  --image-id "$ami"
  --instance-type "$INSTANCE_TYPE"
  --security-group-ids "$sg"
  --user-data "file://$userdata"
  --metadata-options HttpTokens=required
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]"
                       "ResourceType=volume,Tags=[{Key=Name,Value=$NAME}]"
  --query 'Instances[0].InstanceId' --output text
)
if [ -n "$KEY_NAME" ]; then
  run_args+=(--key-name "$KEY_NAME")
fi

echo "EC2 példány indítása ($INSTANCE_TYPE, $ami)..."
id=$(aws ec2 run-instances "${run_args[@]}")
aws ec2 wait instance-running --instance-ids "$id"

echo "Fix (Elastic) IP cím hozzárendelése..."
alloc=$(aws ec2 allocate-address --domain vpc \
  --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME}]" \
  --query AllocationId --output text)
aws ec2 associate-address --instance-id "$id" --allocation-id "$alloc" >/dev/null
ip=$(aws ec2 describe-addresses --allocation-ids "$alloc" --query 'Addresses[0].PublicIp' --output text)

echo "Várakozás, amíg a szerver kiszolgálja az oldalt (pár perc)..."
for _ in $(seq 60); do
  if curl -fsS -o /dev/null --max-time 5 "http://$ip/"; then
    echo "Kész: http://$ip"
    if [ -n "$DOMAIN" ]; then
      echo "DNS: állíts be A rekordot erre az IP-re: ${DOMAIN//,/ }"
      echo "A HTTPS tanúsítványt a szerver automatikusan kéri, amint a DNS ide mutat."
    fi
    exit 0
  fi
  sleep 10
done
echo "A szerver ($id, $ip) elindult, de 10 perc alatt sem válaszolt HTTP-n." >&2
echo "Napló: aws ec2 get-console-output --instance-id $id --latest --output text" >&2
exit 1
