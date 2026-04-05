# MedSecure Disaster Recovery Runbook

## HIPAA §164.308(a)(7) — Contingency Plan

**Document Owner:** MedSecure DevOps & Compliance Team
**Last Updated:** 2026-04-05
**Review Frequency:** Annually (or after any DR event)

---

## 1. Overview

This runbook documents the disaster recovery (DR) procedures for the MedSecure PHI database. It ensures compliance with HIPAA §164.308(a)(7) contingency plan requirements.

### Recovery Objectives

| Metric | Target | Description |
|--------|--------|-------------|
| **RPO** | < 1 hour | Maximum data loss tolerance. Achieved via continuous WAL archiving and streaming replication. |
| **RTO** | < 4 hours | Maximum downtime tolerance. Achieved via automated failover and pre-configured standby. |

### Architecture

```
┌──────────────────┐         Streaming          ┌──────────────────┐
│   PRIMARY DB     │    ──── Replication ────>   │   STANDBY DB     │
│   (us-east-1)    │                             │   (us-west-2)    │
│   PostgreSQL 15  │                             │   PostgreSQL 15  │
└────────┬─────────┘                             └──────────────────┘
         │
         │  WAL Archiving
         ▼
┌──────────────────┐         Cross-Region        ┌──────────────────┐
│   S3 Bucket      │    ──── Replication ────>   │   S3 Bucket      │
│   (us-east-1)    │                             │   (us-west-2)    │
│   AES-256-GCM    │                             │   AES-256-GCM    │
└──────────────────┘                             └──────────────────┘
```

---

## 2. Backup Strategy

### 2.1 Continuous WAL Archiving
- **Frequency:** Continuous (every committed transaction)
- **Method:** PostgreSQL WAL streaming to S3 with server-side encryption
- **Retention:** 90 days
- **RPO Impact:** Provides point-in-time recovery to any moment within retention window

### 2.2 Full Backups
- **Frequency:** Daily at 02:00 UTC
- **Method:** `pg_basebackup` with compression
- **Storage:** S3 with AES-256-GCM encryption (HIPAA requirement)
- **Cross-Region:** Replicated to us-west-2 within 1 hour

### 2.3 Incremental Backups
- **Frequency:** Hourly
- **Method:** WAL-based incremental + logical backup
- **Storage:** S3 with AES-256-GCM encryption
- **RPO Impact:** Ensures < 1 hour data loss in worst case

### 2.4 Cross-Region Replication
- **Primary Region:** us-east-1
- **Standby Region:** us-west-2
- **Method:** S3 Cross-Region Replication with KMS encryption
- **Verification:** Daily integrity checks

---

## 3. Automated Failover Procedure

### 3.1 Automatic Detection
The DR monitoring service continuously checks primary database health:
- Health check interval: 10 seconds
- Failover threshold: 30 seconds (3 consecutive failures)
- Automatic promotion of standby when threshold is exceeded

### 3.2 Automated Failover Steps

1. **Detection:** Health monitor detects primary failure (3 consecutive failed checks)
2. **Verification:** Confirm standby is accessible and replication lag is within RPO
3. **Promotion:** Execute `pg_promote()` on standby server
4. **Validation:** Verify new primary accepts writes (`pg_is_in_recovery() = false`)
5. **Reconfiguration:** Update application connection strings to new primary
6. **Notification:** Alert on-call team via PagerDuty/Slack

### 3.3 Manual Failover

If automated failover fails, execute manually:

```bash
# 1. Verify primary is down
pg_isready -h $DB_HOST -p 5432 -U medsecure

# 2. Check standby status and replication lag
psql -h $DB_STANDBY_HOST -p 5432 -U medsecure -c "SELECT pg_last_xact_replay_timestamp(), pg_is_in_recovery();"

# 3. Promote standby
psql -h $DB_STANDBY_HOST -p 5432 -U medsecure -c "SELECT pg_promote(true, 60);"

# 4. Verify promotion
psql -h $DB_STANDBY_HOST -p 5432 -U medsecure -c "SELECT pg_is_in_recovery();"
# Expected: false

# 5. Update application config
# Update DB_HOST environment variable to point to standby host
# Restart application services

# Or use the automated script:
./infrastructure/disaster-recovery/failover.sh --force
```

---

## 4. Point-in-Time Recovery (PITR)

To recover the database to a specific point in time:

```bash
# 1. Stop the target PostgreSQL instance
pg_ctl stop -D /var/lib/postgresql/data

# 2. Restore the most recent base backup before target time
pg_basebackup -h backup-server -D /var/lib/postgresql/data -Fp -Xs -P

# 3. Configure recovery target
cat >> /var/lib/postgresql/data/postgresql.conf << EOF
restore_command = 'aws s3 cp s3://medsecure-backups-primary/wal-archive/%f %p'
recovery_target_time = '2026-04-05 12:00:00 UTC'
recovery_target_action = 'promote'
EOF

# 4. Create recovery signal file
touch /var/lib/postgresql/data/recovery.signal

# 5. Start PostgreSQL
pg_ctl start -D /var/lib/postgresql/data

# 6. Verify recovery
psql -c "SELECT pg_last_xact_replay_timestamp();"
```

---

## 5. Annual DR Drill Procedure

### 5.1 Requirements
- **Frequency:** Annually (minimum), per HIPAA §164.308(a)(7)(ii)(D)
- **Participants:** DevOps, DBA, Security, Compliance teams
- **Documentation:** All results must be documented and retained for 6 years

### 5.2 Drill Steps

1. **Pre-Drill Preparation**
   - [ ] Schedule maintenance window
   - [ ] Notify all stakeholders
   - [ ] Verify backup integrity
   - [ ] Document current replication status

2. **Execute DR Drill**
   - [ ] Simulate primary failure (stop primary in non-production)
   - [ ] Verify automated failover triggers
   - [ ] Measure actual RTO (target: < 4 hours)
   - [ ] Verify data integrity on new primary
   - [ ] Measure actual RPO (target: < 1 hour data loss)

3. **Via API (programmatic drill)**
   ```bash
   curl -X POST https://api.medsecure.com/health/dr/drill \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"type": "full"}'
   ```

4. **Post-Drill Activities**
   - [ ] Document actual RTO and RPO achieved
   - [ ] Record any issues encountered
   - [ ] Update runbook with lessons learned
   - [ ] File compliance report
   - [ ] Restore original primary-standby configuration

### 5.3 Drill Report Template

```
DR Drill Report
Date: YYYY-MM-DD
Drill ID: DR-DRILL-XXXXXXXX

Participants:
- Name, Role

Results:
- RTO Achieved: XX minutes (target: < 240 minutes)
- RPO Achieved: XX minutes (target: < 60 minutes)
- Failover Successful: Yes/No
- Data Integrity Verified: Yes/No
- Cross-Region Backup Verified: Yes/No

Issues Found:
1. Description, Severity, Remediation

Recommendations:
1. Description, Priority

Sign-off:
- Compliance Officer: _______________
- CTO: _______________
```

---

## 6. Monitoring & Alerting

### 6.1 Health Check Endpoints

| Endpoint | Description | Expected Response |
|----------|-------------|-------------------|
| `GET /health` | Basic health check | `{"status": "ok"}` |
| `GET /health/dr` | DR status overview | Full DR status with replication info |
| `GET /health/replication` | Replication lag & status | Streaming state, lag bytes/seconds |
| `GET /health/backup` | Backup service status | Last backup, schedule, retention |

### 6.2 Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Replication lag (seconds) | > 300 | > 1800 |
| Replication lag (bytes) | > 100MB | > 1GB |
| Backup age | > 2 hours | > 6 hours |
| Standby connectivity | N/A | Disconnected |
| Failed backup count | > 1 | > 3 |

---

## 7. Contacts & Escalation

| Role | Contact | Escalation Time |
|------|---------|-----------------|
| On-Call DBA | PagerDuty rotation | Immediate |
| DevOps Lead | PagerDuty rotation | 15 minutes |
| CISO | Direct contact | 30 minutes |
| Compliance Officer | Direct contact | 1 hour |

---

## 8. Compliance References

- **HIPAA §164.308(a)(7)(i)** — Contingency Plan (Required)
- **HIPAA §164.308(a)(7)(ii)(A)** — Data Backup Plan (Required)
- **HIPAA §164.308(a)(7)(ii)(B)** — Disaster Recovery Plan (Required)
- **HIPAA §164.308(a)(7)(ii)(C)** — Emergency Mode Operation Plan (Required)
- **HIPAA §164.308(a)(7)(ii)(D)** — Testing and Revision Procedures (Addressable)
- **HIPAA §164.308(a)(7)(ii)(E)** — Applications and Data Criticality Analysis (Addressable)
