#!/usr/bin/env bash
# Törli a deploy.sh által létrehozott AWS erőforrásokat (EC2 példány, Elastic IP, security group).
set -euo pipefail

NAME="${NAME:-egylepesseltobb}"

ids=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[].Instances[].InstanceId' --output text)
allocs=$(aws ec2 describe-addresses --filters "Name=tag:Name,Values=$NAME" \
  --query 'Addresses[].AllocationId' --output text)

echo "Törlendő példányok: ${ids:-nincs}"
echo "Törlendő Elastic IP-k: ${allocs:-nincs}"
echo "Security group: $NAME-web"
if [ "${FORCE:-}" != "1" ]; then
  read -r -p "Biztosan törlöd? (igen/nem) " answer
  [ "$answer" = "igen" ] || exit 1
fi

for alloc in $allocs; do
  assoc=$(aws ec2 describe-addresses --allocation-ids "$alloc" \
    --query 'Addresses[0].AssociationId' --output text)
  if [ "$assoc" != "None" ]; then
    aws ec2 disassociate-address --association-id "$assoc"
  fi
  aws ec2 release-address --allocation-id "$alloc"
done

if [ -n "$ids" ]; then
  # shellcheck disable=SC2086
  aws ec2 terminate-instances --instance-ids $ids >/dev/null
  # shellcheck disable=SC2086
  aws ec2 wait instance-terminated --instance-ids $ids
fi

sg=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$NAME-web" \
  --query 'SecurityGroups[0].GroupId' --output text)
if [ "$sg" != "None" ]; then
  aws ec2 delete-security-group --group-id "$sg"
fi
echo "Kész."
