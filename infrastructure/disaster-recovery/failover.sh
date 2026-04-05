#!/usr/bin/env bash
# =============================================================================
# PostgreSQL Automated Failover Script
# HIPAA §164.308(a)(7) — Contingency Plan
#
# Promotes the standby PostgreSQL server to primary when the primary is
# unreachable. Designed for RTO < 4 hours with automated health detection.
#
# Usage: ./failover.sh [--dry-run] [--force]
# =============================================================================

set -euo pipefail

# Configuration (override via environment variables)
PRIMARY_HOST="${DB_HOST:-localhost}"
PRIMARY_PORT="${DB_PORT:-5432}"
STANDBY_HOST="${DB_STANDBY_HOST:-localhost}"
STANDBY_PORT="${DB_STANDBY_PORT:-5433}"
DB_USER="${DB_REPLICATION_USER:-replication}"
DB_NAME="${DB_NAME:-medsecure_db}"
HEALTH_CHECK_RETRIES="${DR_MAX_RETRIES:-3}"
HEALTH_CHECK_DELAY="${DR_RETRY_DELAY_MS:-5000}"
LOG_FILE="/var/log/medsecure/failover.log"
NOTIFICATION_WEBHOOK="${DR_NOTIFICATION_WEBHOOK:-}"
DRY_RUN=false
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --force)   FORCE=true; shift ;;
    *)         echo "Unknown option: $1"; exit 1 ;;
  esac
done

log() {
  local level="$1"
  shift
  local message="$*"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "${timestamp} [${level}] ${message}" | tee -a "${LOG_FILE}" 2>/dev/null || echo "${timestamp} [${level}] ${message}"
}

send_notification() {
  local subject="$1"
  local body="$2"

  log "INFO" "HIPAA_DR_EVENT: ${subject} - ${body}"

  if [[ -n "${NOTIFICATION_WEBHOOK}" ]]; then
    curl -s -X POST "${NOTIFICATION_WEBHOOK}" \
      -H "Content-Type: application/json" \
      -d "{\"subject\": \"${subject}\", \"body\": \"${body}\", \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}" \
      || log "WARN" "Failed to send notification webhook"
  fi
}

check_primary_health() {
  log "INFO" "Checking primary database health at ${PRIMARY_HOST}:${PRIMARY_PORT}"

  if pg_isready -h "${PRIMARY_HOST}" -p "${PRIMARY_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t 5 > /dev/null 2>&1; then
    log "INFO" "Primary database is healthy"
    return 0
  else
    log "WARN" "Primary database health check failed"
    return 1
  fi
}

check_standby_health() {
  log "INFO" "Checking standby database health at ${STANDBY_HOST}:${STANDBY_PORT}"

  if pg_isready -h "${STANDBY_HOST}" -p "${STANDBY_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t 5 > /dev/null 2>&1; then
    log "INFO" "Standby database is healthy"
    return 0
  else
    log "ERROR" "Standby database is not accessible"
    return 1
  fi
}

check_replication_lag() {
  log "INFO" "Checking replication lag on standby"

  local lag_seconds
  lag_seconds=$(psql -h "${STANDBY_HOST}" -p "${STANDBY_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
    -t -A -c "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::integer" 2>/dev/null || echo "-1")

  if [[ "${lag_seconds}" == "-1" ]]; then
    log "WARN" "Could not determine replication lag"
    return 1
  fi

  log "INFO" "Current replication lag: ${lag_seconds} seconds"

  # RPO check: lag must be < 3600 seconds (1 hour)
  if [[ "${lag_seconds}" -lt 3600 ]]; then
    log "INFO" "Replication lag is within RPO target (< 1 hour)"
    return 0
  else
    log "WARN" "Replication lag exceeds RPO target: ${lag_seconds}s > 3600s"
    return 1
  fi
}

promote_standby() {
  log "INFO" "Promoting standby to primary"

  if [[ "${DRY_RUN}" == "true" ]]; then
    log "INFO" "[DRY RUN] Would promote standby at ${STANDBY_HOST}:${STANDBY_PORT}"
    return 0
  fi

  # Use pg_promote() via SQL (PostgreSQL 12+)
  psql -h "${STANDBY_HOST}" -p "${STANDBY_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
    -c "SELECT pg_promote(true, 60)" 2>/dev/null

  if [[ $? -eq 0 ]]; then
    log "INFO" "Standby promoted successfully"
    return 0
  fi

  # Fallback: Use pg_ctl promote
  log "WARN" "pg_promote() failed, attempting pg_ctl promote"
  pg_ctl promote -D "${PGDATA:-/var/lib/postgresql/data}" 2>/dev/null

  if [[ $? -eq 0 ]]; then
    log "INFO" "Standby promoted via pg_ctl"
    return 0
  fi

  log "ERROR" "Failed to promote standby"
  return 1
}

update_application_config() {
  log "INFO" "Updating application database configuration"

  if [[ "${DRY_RUN}" == "true" ]]; then
    log "INFO" "[DRY RUN] Would update DB_HOST to ${STANDBY_HOST} and DB_PORT to ${STANDBY_PORT}"
    return 0
  fi

  # Update environment variables for the application
  # In production, this would update the configuration management system
  # (e.g., AWS Parameter Store, HashiCorp Vault, Kubernetes ConfigMap)
  log "INFO" "New primary: ${STANDBY_HOST}:${STANDBY_PORT}"
  log "INFO" "Application configuration should be updated to point to the new primary"
}

verify_new_primary() {
  log "INFO" "Verifying new primary database"

  local is_recovery
  is_recovery=$(psql -h "${STANDBY_HOST}" -p "${STANDBY_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
    -t -A -c "SELECT pg_is_in_recovery()" 2>/dev/null || echo "error")

  if [[ "${is_recovery}" == "f" ]]; then
    log "INFO" "New primary is accepting writes (not in recovery mode)"
    return 0
  else
    log "ERROR" "New primary is still in recovery mode: ${is_recovery}"
    return 1
  fi
}

# =============================================================================
# Main Failover Process
# =============================================================================
main() {
  log "INFO" "============================================"
  log "INFO" "MedSecure Disaster Recovery Failover"
  log "INFO" "HIPAA §164.308(a)(7) Contingency Plan"
  log "INFO" "============================================"
  log "INFO" "Primary: ${PRIMARY_HOST}:${PRIMARY_PORT}"
  log "INFO" "Standby: ${STANDBY_HOST}:${STANDBY_PORT}"
  log "INFO" "Dry Run: ${DRY_RUN}"
  log "INFO" "Force:   ${FORCE}"

  send_notification "DR Failover Initiated" "Checking primary health for ${PRIMARY_HOST}:${PRIMARY_PORT}"

  # Step 1: Verify primary is actually down
  if [[ "${FORCE}" != "true" ]]; then
    local primary_down=false
    for i in $(seq 1 "${HEALTH_CHECK_RETRIES}"); do
      if check_primary_health; then
        log "INFO" "Primary is healthy on attempt ${i}/${HEALTH_CHECK_RETRIES}"
        primary_down=false
        break
      else
        primary_down=true
        log "WARN" "Primary failed health check ${i}/${HEALTH_CHECK_RETRIES}"
        if [[ "${i}" -lt "${HEALTH_CHECK_RETRIES}" ]]; then
          sleep $(( HEALTH_CHECK_DELAY / 1000 ))
        fi
      fi
    done

    if [[ "${primary_down}" != "true" ]]; then
      log "INFO" "Primary is healthy — failover not needed"
      send_notification "DR Failover Cancelled" "Primary database is healthy"
      exit 0
    fi
  fi

  log "WARN" "Primary database confirmed down — proceeding with failover"
  send_notification "DR Failover In Progress" "Primary confirmed down, promoting standby"

  # Step 2: Verify standby is accessible
  if ! check_standby_health; then
    log "ERROR" "Standby database is not accessible — failover cannot proceed"
    send_notification "DR Failover FAILED" "Standby database not accessible"
    exit 1
  fi

  # Step 3: Check replication lag (for RPO compliance)
  check_replication_lag || log "WARN" "Proceeding with failover despite replication lag warning"

  # Step 4: Promote standby to primary
  if ! promote_standby; then
    log "ERROR" "Failed to promote standby — manual intervention required"
    send_notification "DR Failover FAILED" "Could not promote standby to primary"
    exit 1
  fi

  # Step 5: Verify new primary
  sleep 5
  if ! verify_new_primary; then
    log "ERROR" "New primary verification failed — manual intervention required"
    send_notification "DR Failover FAILED" "New primary verification failed"
    exit 1
  fi

  # Step 6: Update application configuration
  update_application_config

  log "INFO" "============================================"
  log "INFO" "FAILOVER COMPLETED SUCCESSFULLY"
  log "INFO" "New primary: ${STANDBY_HOST}:${STANDBY_PORT}"
  log "INFO" "============================================"

  send_notification "DR Failover COMPLETED" "New primary: ${STANDBY_HOST}:${STANDBY_PORT}"
}

main "$@"
