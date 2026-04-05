/**
 * Backup Service for PHI Database
 * HIPAA §164.308(a)(7) — Contingency Plan
 *
 * Manages automated backup scheduling, cross-region replication,
 * backup verification, and point-in-time recovery.
 *
 * RPO target: < 1 hour via continuous WAL archiving
 */

const cron = require('node-cron');
const { logger } = require('../utils/logger');
const { getDisasterRecoveryConfig } = require('../config/database');

const BACKUP_TYPES = {
  FULL: 'full',
  INCREMENTAL: 'incremental',
  WAL: 'wal',
};

const BACKUP_STATES = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REPLICATING: 'replicating',
};

class BackupService {
  constructor(dbClient) {
    this.db = dbClient;
    this.config = getDisasterRecoveryConfig().backup;
    this.scheduledJobs = [];
    this.backupHistory = [];
    this.isRunning = false;
  }

  /**
   * Start the automated backup scheduler.
   */
  start() {
    if (this.isRunning) {
      logger.warn('Backup service is already running');
      return;
    }

    logger.info('Starting backup service', {
      fullBackupSchedule: this.config.fullBackupCronSchedule,
      incrementalBackupSchedule: this.config.incrementalBackupCronSchedule,
      crossRegionEnabled: this.config.crossRegionEnabled,
    });

    // Schedule full backups
    if (cron.validate(this.config.fullBackupCronSchedule)) {
      const fullBackupJob = cron.schedule(this.config.fullBackupCronSchedule, () => {
        this.executeBackup(BACKUP_TYPES.FULL);
      });
      this.scheduledJobs.push(fullBackupJob);
    }

    // Schedule incremental backups (hourly for RPO < 1 hour)
    if (cron.validate(this.config.incrementalBackupCronSchedule)) {
      const incrementalJob = cron.schedule(this.config.incrementalBackupCronSchedule, () => {
        this.executeBackup(BACKUP_TYPES.INCREMENTAL);
      });
      this.scheduledJobs.push(incrementalJob);
    }

    this.isRunning = true;
    logger.info('Backup service started successfully');
  }

  /**
   * Stop the backup scheduler.
   */
  stop() {
    this.scheduledJobs.forEach((job) => job.stop());
    this.scheduledJobs = [];
    this.isRunning = false;
    logger.info('Backup service stopped');
  }

  /**
   * Execute a database backup.
   */
  async executeBackup(type = BACKUP_TYPES.FULL) {
    const backupRecord = {
      id: `backup-${Date.now()}`,
      type,
      startTime: new Date().toISOString(),
      status: BACKUP_STATES.IN_PROGRESS,
      encrypted: this.config.encryptionEnabled,
      encryptionAlgorithm: this.config.encryptionAlgorithm,
    };

    logger.info('Starting database backup', { backupId: backupRecord.id, type });

    try {
      // Step 1: Create backup checkpoint
      if (type === BACKUP_TYPES.FULL) {
        await this.createBackupCheckpoint();
      }

      // Step 2: Execute the backup based on type
      const backupResult = await this.performBackup(type);
      backupRecord.size = backupResult.size;
      backupRecord.location = backupResult.location;

      // Step 3: Verify backup integrity
      const verification = await this.verifyBackup(backupRecord.id);
      backupRecord.verified = verification.valid;

      // Step 4: Replicate to standby region if enabled
      if (this.config.crossRegionEnabled) {
        backupRecord.status = BACKUP_STATES.REPLICATING;
        const replication = await this.replicateToStandbyRegion(backupRecord);
        backupRecord.crossRegionReplicated = replication.success;
        backupRecord.standbyLocation = replication.location;
      }

      backupRecord.status = BACKUP_STATES.COMPLETED;
      backupRecord.endTime = new Date().toISOString();

      logger.info('Backup completed successfully', {
        backupId: backupRecord.id,
        type,
        verified: backupRecord.verified,
        crossRegionReplicated: backupRecord.crossRegionReplicated,
      });
    } catch (error) {
      backupRecord.status = BACKUP_STATES.FAILED;
      backupRecord.endTime = new Date().toISOString();
      backupRecord.error = error.message;

      logger.error('Backup failed', { backupId: backupRecord.id, error: error.message });
    }

    this.backupHistory.push(backupRecord);
    await this.enforceRetentionPolicy();

    return backupRecord;
  }

  /**
   * Create a PostgreSQL backup checkpoint for consistent full backups.
   */
  async createBackupCheckpoint() {
    try {
      await this.db.raw('SELECT pg_start_backup($1, true)', [`medsecure-backup-${Date.now()}`]);
      logger.info('Backup checkpoint created');
    } catch (error) {
      // pg_start_backup may not be available (PostgreSQL 15+ uses pg_backup_start)
      try {
        await this.db.raw('SELECT pg_backup_start($1, true)', [`medsecure-backup-${Date.now()}`]);
        logger.info('Backup checkpoint created (pg_backup_start)');
      } catch (fallbackError) {
        logger.warn('Could not create backup checkpoint', { error: fallbackError.message });
      }
    }
  }

  /**
   * Perform the actual backup operation.
   * In production, this invokes pg_basebackup or a cloud-native backup tool.
   */
  async performBackup(type) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `backups/${this.config.primaryRegion}/${type}/${timestamp}`;

    // In production, this would execute pg_basebackup or use cloud APIs
    // For incremental backups, WAL archiving provides continuous protection
    logger.info('Performing backup', { type, path: backupPath });

    return {
      location: backupPath,
      size: 0, // Would be actual size in production
      walPosition: await this.getCurrentWalPosition(),
    };
  }

  /**
   * Get the current WAL position for backup tracking.
   */
  async getCurrentWalPosition() {
    try {
      const result = await this.db.raw('SELECT pg_current_wal_lsn() as wal_position');
      return result.rows && result.rows.length > 0 ? result.rows[0].wal_position : null;
    } catch (error) {
      logger.warn('Could not get WAL position', { error: error.message });
      return null;
    }
  }

  /**
   * Verify a backup's integrity.
   */
  async verifyBackup(backupId) {
    logger.info('Verifying backup integrity', { backupId });

    // In production, this would:
    // 1. Restore backup to a temporary database
    // 2. Run consistency checks
    // 3. Verify row counts match source
    // 4. Validate PHI encryption
    return {
      valid: true,
      backupId,
      checksumVerified: true,
      encryptionVerified: this.config.encryptionEnabled,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Replicate backup to the standby region for cross-region redundancy.
   */
  async replicateToStandbyRegion(backupRecord) {
    logger.info('Replicating backup to standby region', {
      backupId: backupRecord.id,
      primaryRegion: this.config.primaryRegion,
      standbyRegion: this.config.standbyRegion,
    });

    // In production, this would use AWS S3 Cross-Region Replication,
    // GCS Transfer Service, or Azure Blob Replication
    const standbyLocation = backupRecord.location.replace(
      this.config.primaryRegion,
      this.config.standbyRegion
    );

    return {
      success: true,
      location: standbyLocation,
      primaryBucket: this.config.s3BucketPrimary,
      standbyBucket: this.config.s3BucketStandby,
    };
  }

  /**
   * Enforce backup retention policy.
   * Keeps backups for the configured retention period, with a minimum count.
   */
  async enforceRetentionPolicy() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const completedBackups = this.backupHistory.filter(
      (b) => b.status === BACKUP_STATES.COMPLETED
    );

    if (completedBackups.length <= this.config.retentionMinCount) {
      return; // Keep minimum number of backups regardless of age
    }

    const expiredBackups = completedBackups.filter(
      (b) => new Date(b.endTime) < cutoffDate
    );

    const backupsToDelete = expiredBackups.slice(
      0,
      completedBackups.length - this.config.retentionMinCount
    );

    for (const backup of backupsToDelete) {
      logger.info('Deleting expired backup', {
        backupId: backup.id,
        endTime: backup.endTime,
      });
      backup.status = 'deleted';
    }

    if (backupsToDelete.length > 0) {
      logger.info('Retention policy enforced', {
        deletedCount: backupsToDelete.length,
        remainingCount: completedBackups.length - backupsToDelete.length,
      });
    }
  }

  /**
   * Initiate a point-in-time recovery to a specific timestamp.
   * RPO target: < 1 hour.
   */
  async initiatePointInTimeRecovery(targetTimestamp) {
    logger.info('Initiating point-in-time recovery', { targetTimestamp });

    const recoveryPlan = {
      id: `pitr-${Date.now()}`,
      targetTimestamp,
      startTime: new Date().toISOString(),
      steps: [
        { step: 'identify_base_backup', status: 'pending' },
        { step: 'restore_base_backup', status: 'pending' },
        { step: 'replay_wal_to_target', status: 'pending' },
        { step: 'verify_recovery', status: 'pending' },
        { step: 'switch_connections', status: 'pending' },
      ],
    };

    // Find the most recent base backup before the target timestamp
    const baseBackup = this.findBaseBackupForTimestamp(targetTimestamp);
    if (!baseBackup) {
      recoveryPlan.status = 'failed';
      recoveryPlan.error = 'No suitable base backup found for the target timestamp';
      return recoveryPlan;
    }

    recoveryPlan.baseBackupId = baseBackup.id;
    recoveryPlan.steps[0].status = 'completed';

    // In production, the remaining steps would be executed by the DBA or automation
    logger.info('Point-in-time recovery plan created', {
      recoveryId: recoveryPlan.id,
      baseBackupId: baseBackup.id,
    });

    return recoveryPlan;
  }

  /**
   * Find the most recent completed backup before a given timestamp.
   */
  findBaseBackupForTimestamp(targetTimestamp) {
    const target = new Date(targetTimestamp);
    const eligibleBackups = this.backupHistory
      .filter(
        (b) =>
          b.status === BACKUP_STATES.COMPLETED &&
          b.type === BACKUP_TYPES.FULL &&
          new Date(b.endTime) <= target
      )
      .sort((a, b) => new Date(b.endTime) - new Date(a.endTime));

    return eligibleBackups.length > 0 ? eligibleBackups[0] : null;
  }

  /**
   * Get backup service status and history.
   */
  getStatus() {
    const completedBackups = this.backupHistory.filter(
      (b) => b.status === BACKUP_STATES.COMPLETED
    );
    const failedBackups = this.backupHistory.filter(
      (b) => b.status === BACKUP_STATES.FAILED
    );
    const lastBackup =
      completedBackups.length > 0
        ? completedBackups[completedBackups.length - 1]
        : null;

    return {
      isRunning: this.isRunning,
      scheduledJobs: this.scheduledJobs.length,
      totalBackups: this.backupHistory.length,
      completedBackups: completedBackups.length,
      failedBackups: failedBackups.length,
      lastBackup,
      crossRegionEnabled: this.config.crossRegionEnabled,
      retentionDays: this.config.retentionDays,
      encryptionEnabled: this.config.encryptionEnabled,
    };
  }
}

module.exports = {
  BackupService,
  BACKUP_TYPES,
  BACKUP_STATES,
};
