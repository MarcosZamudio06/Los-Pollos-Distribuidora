#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_DIR/postgres-backup-common.sh"
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/aws-bind-contract.XXXXXX")
trap 'rm -rf -- "$test_dir"' EXIT

cat > "$test_dir/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$AWS_BIND_CAPTURE"
MOCK
chmod 700 "$test_dir/docker"

export BACKUP_DOCKER_BIN="$test_dir/docker" BACKUP_UPLOAD_IMAGE=fake/aws-cli
export BACKUP_UPLOAD_NETWORK=fake-network AWS_BIND_CAPTURE="$test_dir/args"
export OBJECT_STORAGE_ACCESS_KEY_ID=fixture OBJECT_STORAGE_SECRET_ACCESS_KEY=fixture
export OBJECT_STORAGE_REGION=us-east-1 BACKUP_S3_ACCESS_KEY_ID=fixture
export BACKUP_S3_SECRET_ACCESS_KEY=fixture BACKUP_S3_REGION=us-east-1

contains_pair() {
  local previous= line=
  while IFS= read -r line; do
    if [[ "$previous" == "$1" && "$line" == "$2" ]]; then return 0; fi
    previous=$line
  done < "$AWS_BIND_CAPTURE"
  return 1
}

for helper in backup_object_storage_cli_dir backup_aws_cli_dir; do
  for mode in rw ro; do
    "$helper" "$test_dir" "$mode" s3api list-buckets
    contains_pair -v "$test_dir:/backup:$mode"
    contains_pair --network fake-network
    if [[ "$mode" == rw ]]; then
      contains_pair --user "$(id -u):$(id -g)"
      contains_pair -e HOME=/tmp
    else
      if grep -Fxq -- --user "$AWS_BIND_CAPTURE"; then
        echo 'Read-only AWS mount unexpectedly changed container identity.' >&2
        exit 1
      fi
    fi
  done
done

unset BACKUP_UPLOAD_NETWORK
backup_aws_cli_dir "$test_dir" rw s3api list-buckets
contains_pair --user "$(id -u):$(id -g)"
contains_pair -v "$test_dir:/backup:rw"
if grep -Fxq -- --network "$AWS_BIND_CAPTURE"; then
  echo 'Offline AWS mount unexpectedly specified a network.' >&2
  exit 1
fi
AWS_ACCESS_KEY_ID=fixture AWS_SECRET_ACCESS_KEY=fixture AWS_DEFAULT_REGION=us-east-1 \
  AWS_EC2_METADATA_DISABLED=true \
  backup_aws_cli_run_dir "$test_dir" rw fake-network /bin/sh /backup/check.sh
contains_pair --entrypoint /bin/sh
contains_pair --user "$(id -u):$(id -g)"
printf '%s\n' 'AWS CLI bind-mount ownership contracts passed.'
