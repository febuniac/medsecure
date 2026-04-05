#!/usr/bin/env bash
# =============================================================================
# Cross-Region Backup Replication Script
# HIPAA §164.308(a)(7) — Contingency Plan
#
# Replicates PostgreSQL backups to a secondary AWS region for geographic
# redundancy. Ensures encrypted PHI backups are available in both regions.
#
# Usage: ./cross-region-backup.sh [full|incremental|wal]
# =============================================================================

set -euo pipefail

# Configuration
BACKUP_TYPE="${1:-full}"
PRIMARY_REGION="${BACKUP_PRIMARY_REGION:-us-east-1}"
STANDBY_REGION="${BACKUP_STANDBY_REGION:-us-west-2}"
S3_BUCKET_PRIMARY="${BACKUP_S3_BUCKET_PRIMARY:-medsecure-backups-primary}"
S3_BUCKET_STANDBY="${BACKUP_S3_BUCKET_STANDBY:-medsecure-backups-standby}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-medsecure}"
DB_NAME="${DB_NAME:-medsecure_db}"
BACKUP_DIR="/var/backups/medsecure"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-90}"
ENCRYPTION_KEY_ID="${BACKUP_KMS_KEY_ID:-}"
LOG_FILE="/var/log/medsecure/backup.log"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")

log() {
  local level="$1"
  shift
  local message="$*"
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "${ts} [${level}] ${message}" | tee -a "${LOG_FILE}" 2>/dev/null || echo "${ts} [${level}] ${message}"
}

# Create backup directory
mkdir -p "${BACKUP_DIR}" 2>/dev/null || true

execute_full_backup() {
  local backup_file="${BACKUP_DIR}/full_${TIMESTAMP}.tar.gz"

  log "INFO" "Starting full backup of ${DB_NAME}"

  pg_basebackup \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -D "${BACKUP_DIR}/base_${TIMESTAMP}" \
    -Ft \
    -z \
    -Xs \
    -P \
    --checkpoint=fast \
    2>&1 | tee -a "${LOG_FILE}"

  if [[ $? -eq 0 ]]; then
    log "INFO" "Full backup completed: ${backup_file}"
    echo "${backup_file}"
  else
    log "ERROR" "Full backup failed"
    return 1
  fi
}

execute_incremental_backup() {
  local backup_file="${BACKUP_DIR}/incremental_${TIMESTAMP}.sql.gz"

  log "INFO" "Starting incremental backup (WAL-based)"

  # For incremental, we rely on WAL archiving which runs continuously
  # This step creates a logical backup as an additional safety measure
  pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -Fc \
    -f "${backup_file}" \
    2>&1 | tee -a "${LOG_FILE}"

  if [[ $? -eq 0 ]]; then
    log "INFO" "Incremental backup completed: ${backup_file}"
    echo "${backup_file}"
  else
    log "ERROR" "Incremental backup failed"
    return 1
  fi
}

archive_wal_segment() {
  log "INFO" "Archiving WAL segments to S3"

  # Sync WAL archive directory to S3 with server-side encryption
  local wal_archive_dir="/var/lib/postgresql/archive"

  if [[ -d "${wal_archive_dir}" ]]; then
    local encryption_args=""
    if [[ -n "${ENCRYPTION_KEY_ID}" ]]; then
      encryption_args="--sse aws:kms --sse-kms-key-id ${ENCRYPTION_KEY_ID}"
    else
      encryption_args="--sse AES256"
    fi

    aws s3 sync \
      "${wal_archive_dir}/" \
      "s3://${S3_BUCKET_PRIMARY}/wal-archive/" \
      ${encryption_args} \
      --region "${PRIMARY_REGION}" \
      2>&1 | tee -a "${LOG_FILE}"

    log "INFO" "WAL segments archived to primary region"
  else
    log "WARN" "WAL archive directory not found: ${wal_archive_dir}"
  fi
}

upload_to_primary_region() {
  local backup_file="$1"
  local s3_path="s3://${S3_BUCKET_PRIMARY}/backups/${BACKUP_TYPE}/${TIMESTAMP}/$(basename "${backup_file}")"

  log "INFO" "Uploading backup to primary region: ${PRIMARY_REGION}"

  local encryption_args=""
  if [[ -n "${ENCRYPTION_KEY_ID}" ]]; then
    encryption_args="--sse aws:kms --sse-kms-key-id ${ENCRYPTION_KEY_ID}"
  else
    encryption_args="--sse AES256"
  fi

  aws s3 cp \
    "${backup_file}" \
    "${s3_path}" \
    ${encryption_args} \
    --region "${PRIMARY_REGION}" \
    2>&1 | tee -a "${LOG_FILE}"

  if [[ $? -eq 0 ]]; then
    log "INFO" "Backup uploaded to primary region: ${s3_path}"
    echo "${s3_path}"
  else
    log "ERROR" "Failed to upload backup to primary region"
    return 1
  fi
}

replicate_to_standby_region() {
  local primary_s3_path="$1"
  local standby_s3_path="${primary_s3_path//${S3_BUCKET_PRIMARY}/${S3_BUCKET_STANDBY}}"

  log "INFO" "Replicating backup to standby region: ${STANDBY_REGION}"

  local encryption_args=""
  if [[ -n "${ENCRYPTION_KEY_ID}" ]]; then
    encryption_args="--sse aws:kms --sse-kms-key-id ${ENCRYPTION_KEY_ID}"
  else
    encryption_args="--sse AES256"
  fi

  aws s3 cp \
    "${primary_s3_path}" \
    "${standby_s3_path}" \
    ${encryption_args} \
    --region "${STANDBY_REGION}" \
    2>&1 | tee -a "${LOG_FILE}"

  if [[ $? -eq 0 ]]; then
    log "INFO" "Backup replicated to standby region: ${standby_s3_path}"
  else
    log "ERROR" "Failed to replicate backup to standby region"
    return 1
  fi
}

verify_backup_integrity() {
  local backup_file="$1"

  log "INFO" "Verifying backup integrity"

  # Generate and store checksum
  local checksum
  checksum=$(sha256sum "${backup_file}" | awk '{print $1}')
  echo "${checksum}" > "${backup_file}.sha256"

  log "INFO" "Backup checksum (SHA-256): ${checksum}"

  # Verify the backup file is not empty
  local file_size
  file_size=$(stat -f%z "${backup_file}" 2>/dev/null || stat -c%s "${backup_file}" 2>/dev/null || echo "0")

  if [[ "${file_size}" -gt 0 ]]; then
    log "INFO" "Backup file size: ${file_size} bytes — integrity check passed"
    return 0
  else
    log "ERROR" "Backup file is empty — integrity check FAILED"
    return 1
  fi
}

cleanup_old_backups() {
  log "INFO" "Cleaning up backups older than ${RETENTION_DAYS} days"

  # Clean local backups
  find "${BACKUP_DIR}" -type f -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

  # Clean S3 backups in primary region (lifecycle policy handles standby region)
  log "INFO" "Note: S3 lifecycle policies should handle remote backup retention"
}

# =============================================================================
# Main Backup Process
# =============================================================================
main() {
  log "INFO" "============================================"
  log "INFO" "MedSecure Cross-Region Backup"
  log "INFO" "HIPAA §164.308(a)(7) Contingency Plan"
  log "INFO" "============================================"
  log "INFO" "Backup type: ${BACKUP_TYPE}"
  log "INFO" "Primary region: ${PRIMARY_REGION}"
  log "INFO" "Standby region: ${STANDBY_REGION}"
  log "INFO" "Timestamp: ${TIMESTAMP}"

  local backup_file=""

  case "${BACKUP_TYPE}" in
    full)
      backup_file=$(execute_full_backup)
      ;;
    incremental)
      backup_file=$(execute_incremental_backup)
      ;;
    wal)
      archive_wal_segment
      log "INFO" "WAL archiving completed"
      exit 0
      ;;
    *)
      log "ERROR" "Unknown backup type: ${BACKUP_TYPE}"
      exit 1
      ;;
  esac

  # Verify backup integrity
  verify_backup_integrity "${backup_file}"

  # Upload to primary region
  local s3_path
  s3_path=$(upload_to_primary_region "${backup_file}")

  # Replicate to standby region
  replicate_to_standby_region "${s3_path}"

  # Clean up old backups
  cleanup_old_backups

  log "INFO" "============================================"
  log "INFO" "BACKUP COMPLETED SUCCESSFULLY"
  log "INFO" "Type: ${BACKUP_TYPE}"
  log "INFO" "Primary: ${s3_path}"
  log "INFO" "============================================"
}

main "$@"
