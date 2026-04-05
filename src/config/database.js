/**
 * Database Configuration with Disaster Recovery Support
 * HIPAA §164.308(a)(7) — Contingency Plan
 *
 * Supports PostgreSQL streaming replication with automatic failover.
 * RPO target: < 1 hour (continuous WAL archiving + streaming replication)
 * RTO target: < 4 hours (automated failover with health monitoring)
 */

const { logger } = require('../utils/logger');

const DB_ROLES = {
  PRIMARY: 'primary',
  STANDBY: 'standby',
};

const DEFAULT_REPLICATION_CONFIG = {
  // WAL (Write-Ahead Log) settings for point-in-time recovery
  walLevel: 'replica',
  maxWalSenders: 10,
  walKeepSize: '1024MB',
  archiveMode: true,
  archiveCommand: process.env.WAL_ARCHIVE_COMMAND || 'test ! -f /archive/%f && cp %p /archive/%f',

  // Streaming replication settings
  synchronousCommit: process.env.SYNCHRONOUS_COMMIT || 'on',
  synchronousStandbyNames: process.env.SYNCHRONOUS_STANDBY_NAMES || '',

  // Replication slots for guaranteed WAL retention
  maxReplicationSlots: 10,
};

const DEFAULT_FAILOVER_CONFIG = {
  enabled: process.env.DR_FAILOVER_ENABLED === 'true',
  healthCheckIntervalMs: parseInt(process.env.DR_HEALTH_CHECK_INTERVAL_MS, 10) || 10000,
  failoverThresholdMs: parseInt(process.env.DR_FAILOVER_THRESHOLD_MS, 10) || 30000,
  maxRetries: parseInt(process.env.DR_MAX_RETRIES, 10) || 3,
  retryDelayMs: parseInt(process.env.DR_RETRY_DELAY_MS, 10) || 5000,
};

const DEFAULT_BACKUP_CONFIG = {
  // Continuous backup schedule (WAL archiving provides point-in-time recovery)
  fullBackupCronSchedule: process.env.BACKUP_FULL_CRON || '0 2 * * *', // Daily at 2 AM
  incrementalBackupCronSchedule: process.env.BACKUP_INCREMENTAL_CRON || '0 * * * *', // Hourly

  // Retention policy
  retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 90,
  retentionMinCount: parseInt(process.env.BACKUP_RETENTION_MIN_COUNT, 10) || 7,

  // Cross-region replication
  crossRegionEnabled: process.env.BACKUP_CROSS_REGION_ENABLED === 'true',
  primaryRegion: process.env.BACKUP_PRIMARY_REGION || 'us-east-1',
  standbyRegion: process.env.BACKUP_STANDBY_REGION || 'us-west-2',
  s3BucketPrimary: process.env.BACKUP_S3_BUCKET_PRIMARY || '',
  s3BucketStandby: process.env.BACKUP_S3_BUCKET_STANDBY || '',

  // Encryption for backups (HIPAA requirement for PHI)
  encryptionEnabled: true,
  encryptionAlgorithm: 'AES-256-GCM',
};

/**
 * Build a database connection config supporting primary and standby roles.
 */
function buildDatabaseConfig(role = DB_ROLES.PRIMARY) {
  const isPrimary = role === DB_ROLES.PRIMARY;

  const primary = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || 'medsecure',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'medsecure_db',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  };

  const standby = {
    host: process.env.DB_STANDBY_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_STANDBY_PORT, 10) || parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_REPLICATION_USER || process.env.DB_USER || 'medsecure',
    password: process.env.DB_REPLICATION_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'medsecure_db',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  };

  return {
    primary,
    standby,
    active: isPrimary ? primary : standby,
    role,
    pool: { min: 2, max: 10 },
  };
}

/**
 * Get the full disaster recovery configuration.
 */
function getDisasterRecoveryConfig() {
  return {
    database: buildDatabaseConfig(
      process.env.DB_ROLE === 'standby' ? DB_ROLES.STANDBY : DB_ROLES.PRIMARY
    ),
    replication: { ...DEFAULT_REPLICATION_CONFIG },
    failover: {
      enabled: process.env.DR_FAILOVER_ENABLED === 'true',
      healthCheckIntervalMs: parseInt(process.env.DR_HEALTH_CHECK_INTERVAL_MS, 10) || 10000,
      failoverThresholdMs: parseInt(process.env.DR_FAILOVER_THRESHOLD_MS, 10) || 30000,
      maxRetries: parseInt(process.env.DR_MAX_RETRIES, 10) || 3,
      retryDelayMs: parseInt(process.env.DR_RETRY_DELAY_MS, 10) || 5000,
    },
    backup: { ...DEFAULT_BACKUP_CONFIG },
    compliance: {
      rpoTargetMinutes: 60,
      rtoTargetMinutes: 240,
      annualDrDrillRequired: true,
      lastDrDrillDate: process.env.LAST_DR_DRILL_DATE || null,
    },
  };
}

module.exports = {
  DB_ROLES,
  buildDatabaseConfig,
  getDisasterRecoveryConfig,
  DEFAULT_REPLICATION_CONFIG,
  DEFAULT_FAILOVER_CONFIG,
  DEFAULT_BACKUP_CONFIG,
};
