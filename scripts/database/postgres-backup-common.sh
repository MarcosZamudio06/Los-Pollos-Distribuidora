#!/usr/bin/env bash

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  printf '%s\n' 'This file is a library and must be sourced by a backup script.' >&2
  exit 1
fi

backup_die() {
  printf 'PostgreSQL backup operation failed at %s.\n' "${BACKUP_STAGE:-startup}" >&2
  exit 1
}

backup_require_env() {
  local variable

  for variable in "$@"; do
    if [[ -z "${!variable:-}" ]]; then
      printf '%s is required.\n' "$variable" >&2
      exit 2
    fi
  done
}

backup_validate_s3_env() {
  backup_require_env BACKUP_S3_ENDPOINT BACKUP_S3_REGION BACKUP_S3_BUCKET \
    BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY

  case "$BACKUP_S3_ENDPOINT" in
    https://*) ;;
    http://*)
      if [[ "${BACKUP_ALLOW_INSECURE_ENDPOINT:-false}" != "true" ]]; then
        printf '%s\n' 'BACKUP_S3_ENDPOINT must use HTTPS; set BACKUP_ALLOW_INSECURE_ENDPOINT=true only for an isolated local mock.' >&2
        exit 2
      fi
      ;;
    *)
      printf '%s\n' 'BACKUP_S3_ENDPOINT must be an http:// or https:// URL.' >&2
      exit 2
      ;;
  esac

  if [[ ! "$BACKUP_S3_BUCKET" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ]]; then
    printf '%s\n' 'BACKUP_S3_BUCKET contains an invalid bucket name.' >&2
    exit 2
  fi
}

backup_validate_non_negative_integer() {
  local variable=$1
  local value=${2:-}

  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    printf '%s must be a non-negative integer.\n' "$variable" >&2
    exit 2
  fi
}

backup_validate_positive_integer() {
  local variable=$1
  local value=${2:-}

  backup_validate_non_negative_integer "$variable" "$value"
  if (( value < 1 )); then
    printf '%s must be greater than zero.\n' "$variable" >&2
    exit 2
  fi
}

backup_file_size() {
  wc -c < "$1" | tr -d '[:space:]'
}

backup_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

backup_check_disk_space() {
  local directory=$1
  local minimum_bytes=$2
  local available_bytes

  available_bytes=$(df -Pk "$directory" | awk 'NR == 2 { printf "%.0f", $4 * 1024 }')
  if [[ -z "$available_bytes" ]] || (( available_bytes < minimum_bytes )); then
    printf 'Insufficient free space at %s; required at least %s bytes.\n' "$directory" "$minimum_bytes" >&2
    exit 2
  fi
}

backup_compose() {
  if [[ -n "${BACKUP_COMPOSE_PROJECT_NAME:-}" ]]; then
    "$BACKUP_DOCKER_BIN" compose -p "$BACKUP_COMPOSE_PROJECT_NAME" \
      -f "$BACKUP_COMPOSE_FILE" "$@"
    return
  fi

  "$BACKUP_DOCKER_BIN" compose -f "$BACKUP_COMPOSE_FILE" "$@"
}

backup_compose_pg() {
  if [[ -n "${BACKUP_POSTGRES_PASSWORD:-}" ]]; then
    backup_compose exec -T -e "PGPASSWORD=$BACKUP_POSTGRES_PASSWORD" \
      "$BACKUP_POSTGRES_SERVICE" "$@"
    return
  fi

  backup_compose exec -T "$BACKUP_POSTGRES_SERVICE" "$@"
}

backup_aws_cli_dir() {
  local directory=$1
  local mode=$2
  shift 2

  if [[ -n "${BACKUP_UPLOAD_NETWORK:-}" ]]; then
    AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION="$BACKUP_S3_REGION" \
    AWS_EC2_METADATA_DISABLED=true \
      "$BACKUP_DOCKER_BIN" run --rm --network "$BACKUP_UPLOAD_NETWORK" \
        -v "$directory:/backup:$mode" \
        -e AWS_ACCESS_KEY_ID \
        -e AWS_SECRET_ACCESS_KEY \
        -e AWS_DEFAULT_REGION \
        -e AWS_EC2_METADATA_DISABLED \
        "$BACKUP_UPLOAD_IMAGE" "$@"
    return
  fi

  AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="$BACKUP_S3_REGION" \
  AWS_EC2_METADATA_DISABLED=true \
    "$BACKUP_DOCKER_BIN" run --rm \
      -v "$directory:/backup:$mode" \
      -e AWS_ACCESS_KEY_ID \
      -e AWS_SECRET_ACCESS_KEY \
      -e AWS_DEFAULT_REGION \
      -e AWS_EC2_METADATA_DISABLED \
      "$BACKUP_UPLOAD_IMAGE" "$@"
}

backup_s3_args() {
  printf '%s\n' '--endpoint-url' "$BACKUP_S3_ENDPOINT"
}

backup_validate_database_name() {
  local variable=$1
  local value=$2

  if [[ ! "$value" =~ ^[A-Za-z0-9_]+$ ]]; then
    printf '%s contains unsupported characters.\n' "$variable" >&2
    exit 2
  fi
}
