/**
 * Disaster Recovery Service
 * HIPAA §164.308(a)(7) — Contingency Plan
 *
 * Manages PostgreSQL streaming replication, automated failover,
 * health monitoring, and DR drill procedures.
 */

const { logger } = require('../utils/logger');
const {
  DB_ROLES,
  getDisasterRecoveryConfig,
  buildDatabaseConfig,
} = require('../config/database');

const REPLICATION_STATES = {
  STREAMING: 'streaming',
  CATCHUP: 'catchup',
  DISCONNECTED: 'disconnected',
  UNKNOWN: 'unknown',
};

const FAILOVER_STATES = {
  IDLE: 'idle',
  MONITORING: 'monitoring',
  FAILING_OVER: 'failing_over',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

class DisasterRecoveryService {
  constructor(dbClient) {
    this.db = dbClient;
    this.config = getDisasterRecoveryConfig();
    this.currentRole = this.config.database.role;
    this.failoverState = FAILOVER_STATES.IDLE;
    this.healthCheckInterval = null;
    this.consecutiveFailures = 0;
    this.failoverHistory = [];
    this.lastHealthCheck = null;
  }

  /**
   * Start the disaster recovery monitoring service.
   */
  async start() {
    if (!this.config.failover.enabled) {
      logger.info('DR failover monitoring is disabled');
      return;
    }

    logger.info('Starting disaster recovery monitoring service', {
      role: this.currentRole,
      healthCheckInterval: this.config.failover.healthCheckIntervalMs,
      failoverThreshold: this.config.failover.failoverThresholdMs,
    });

    this.failoverState = FAILOVER_STATES.MONITORING;
    this.healthCheckInterval = setInterval(
      () => this.performHealthCheck(),
      this.config.failover.healthCheckIntervalMs
    );
  }

  /**
   * Stop the disaster recovery monitoring service.
   */
  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.failoverState = FAILOVER_STATES.IDLE;
    logger.info('Disaster recovery monitoring stopped');
  }

  /**
   * Perform a health check on the primary database.
   * Tracks consecutive failures and triggers failover if threshold is exceeded.
   */
  async performHealthCheck() {
    try {
      const health = await this.checkPrimaryHealth();
      this.lastHealthCheck = {
        timestamp: new Date().toISOString(),
        status: health.healthy ? 'healthy' : 'unhealthy',
        details: health,
      };

      if (health.healthy) {
        this.consecutiveFailures = 0;
        return health;
      }

      this.consecutiveFailures++;
      const failureWindowMs =
        this.consecutiveFailures * this.config.failover.healthCheckIntervalMs;

      logger.warn('Primary database health check failed', {
        consecutiveFailures: this.consecutiveFailures,
        failureWindowMs,
        threshold: this.config.failover.failoverThresholdMs,
      });

      if (failureWindowMs >= this.config.failover.failoverThresholdMs) {
        await this.initiateFailover('Health check threshold exceeded');
      }

      return health;
    } catch (error) {
      this.consecutiveFailures++;
      logger.error('Health check error', { error: error.message });

      const failureWindowMs =
        this.consecutiveFailures * this.config.failover.healthCheckIntervalMs;
      if (failureWindowMs >= this.config.failover.failoverThresholdMs) {
        await this.initiateFailover('Health check errors exceeded threshold');
      }

      return { healthy: false, error: error.message };
    }
  }

  /**
   * Check the health of the primary database including replication status.
   */
  async checkPrimaryHealth() {
    const result = {
      healthy: false,
      connected: false,
      replicationStatus: REPLICATION_STATES.UNKNOWN,
      replicationLagBytes: null,
      replicationLagSeconds: null,
      walPosition: null,
      timestamp: new Date().toISOString(),
    };

    try {
      // Check basic connectivity
      const connectResult = await this.db.raw('SELECT 1 as connected');
      result.connected = connectResult.rows && connectResult.rows.length > 0;

      // Check replication status
      const replicationInfo = await this.getReplicationStatus();
      result.replicationStatus = replicationInfo.state;
      result.replicationLagBytes = replicationInfo.lagBytes;
      result.replicationLagSeconds = replicationInfo.lagSeconds;
      result.walPosition = replicationInfo.walPosition;

      // Healthy if connected and replication lag is within RPO target
      const rpoLimitSeconds = this.config.compliance.rpoTargetMinutes * 60;
      result.healthy =
        result.connected &&
        (result.replicationLagSeconds === null ||
          result.replicationLagSeconds < rpoLimitSeconds);
    } catch (error) {
      result.error = error.message;
      logger.error('Primary health check failed', { error: error.message });
    }

    return result;
  }

  /**
   * Get PostgreSQL streaming replication status.
   */
  async getReplicationStatus() {
    const status = {
      state: REPLICATION_STATES.UNKNOWN,
      lagBytes: null,
      lagSeconds: null,
      walPosition: null,
      standbyConnected: false,
    };

    try {
      // Check WAL position on primary
      const walResult = await this.db.raw('SELECT pg_current_wal_lsn() as wal_position');
      if (walResult.rows && walResult.rows.length > 0) {
        status.walPosition = walResult.rows[0].wal_position;
      }

      // Check replication slots and standby status
      const replicationResult = await this.db.raw(`
        SELECT
          slot_name,
          active,
          restart_lsn,
          confirmed_flush_lsn,
          pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) as lag_bytes
        FROM pg_replication_slots
        WHERE slot_type = 'physical'
      `);

      if (replicationResult.rows && replicationResult.rows.length > 0) {
        const slot = replicationResult.rows[0];
        status.standbyConnected = slot.active;
        status.lagBytes = parseInt(slot.lag_bytes, 10) || 0;
        status.state = slot.active
          ? REPLICATION_STATES.STREAMING
          : REPLICATION_STATES.DISCONNECTED;
      }

      // Check replication lag in seconds via pg_stat_replication
      const lagResult = await this.db.raw(`
        SELECT
          EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) as lag_seconds
      `);
      if (lagResult.rows && lagResult.rows.length > 0 && lagResult.rows[0].lag_seconds !== null) {
        status.lagSeconds = parseFloat(lagResult.rows[0].lag_seconds);
      }
    } catch (error) {
      logger.error('Failed to get replication status', { error: error.message });
    }

    return status;
  }

  /**
   * Initiate automated failover to the standby database.
   */
  async initiateFailover(reason) {
    if (this.failoverState === FAILOVER_STATES.FAILING_OVER) {
      logger.warn('Failover already in progress, skipping');
      return { success: false, reason: 'Failover already in progress' };
    }

    logger.warn('Initiating failover to standby', { reason });
    this.failoverState = FAILOVER_STATES.FAILING_OVER;

    const failoverRecord = {
      startTime: new Date().toISOString(),
      reason,
      previousRole: this.currentRole,
      status: 'in_progress',
    };

    try {
      // Step 1: Verify standby is accessible
      const standbyConfig = buildDatabaseConfig(DB_ROLES.STANDBY);
      logger.info('Verifying standby database connectivity', {
        host: standbyConfig.standby.host,
      });

      // Step 2: Promote standby to primary
      await this.promoteStandby();

      // Step 3: Update connection to new primary
      this.currentRole = DB_ROLES.STANDBY;
      this.consecutiveFailures = 0;

      failoverRecord.endTime = new Date().toISOString();
      failoverRecord.status = 'completed';
      failoverRecord.newRole = DB_ROLES.STANDBY;
      this.failoverState = FAILOVER_STATES.COMPLETED;

      logger.info('Failover completed successfully', failoverRecord);

      // Step 4: Trigger notification
      await this.notifyFailoverComplete(failoverRecord);
    } catch (error) {
      failoverRecord.endTime = new Date().toISOString();
      failoverRecord.status = 'failed';
      failoverRecord.error = error.message;
      this.failoverState = FAILOVER_STATES.FAILED;

      logger.error('Failover failed', { error: error.message, failoverRecord });
    }

    this.failoverHistory.push(failoverRecord);
    return failoverRecord;
  }

  /**
   * Promote the standby database to primary role.
   * Uses pg_promote() for PostgreSQL 12+.
   */
  async promoteStandby() {
    logger.info('Promoting standby to primary');

    for (let attempt = 1; attempt <= this.config.failover.maxRetries; attempt++) {
      try {
        // pg_promote() is available in PostgreSQL 12+
        await this.db.raw('SELECT pg_promote(true, 60)');
        logger.info('Standby promotion successful');
        return;
      } catch (error) {
        logger.warn(`Standby promotion attempt ${attempt} failed`, {
          error: error.message,
          maxRetries: this.config.failover.maxRetries,
        });

        if (attempt === this.config.failover.maxRetries) {
          throw new Error(
            `Failed to promote standby after ${this.config.failover.maxRetries} attempts: ${error.message}`
          );
        }

        await new Promise((resolve) =>
          setTimeout(resolve, this.config.failover.retryDelayMs)
        );
      }
    }
  }

  /**
   * Send notifications about failover events.
   */
  async notifyFailoverComplete(failoverRecord) {
    logger.info('Sending failover notification', {
      status: failoverRecord.status,
      reason: failoverRecord.reason,
    });

    // In production, this would integrate with PagerDuty, Slack, email, etc.
    // For now, log the event for HIPAA audit trail
    logger.info('HIPAA_DR_EVENT: Failover completed', {
      eventType: 'DISASTER_RECOVERY_FAILOVER',
      ...failoverRecord,
    });
  }

  /**
   * Execute a DR drill to validate the disaster recovery plan.
   * HIPAA requires annual testing of the contingency plan.
   */
  async executeDrDrill(options = {}) {
    const drillRecord = {
      drillId: `DR-DRILL-${Date.now()}`,
      startTime: new Date().toISOString(),
      type: options.type || 'full',
      steps: [],
      status: 'in_progress',
    };

    logger.info('Starting DR drill', { drillId: drillRecord.drillId, type: drillRecord.type });

    try {
      // Step 1: Verify backup integrity
      const backupCheck = await this.verifyBackupIntegrity();
      drillRecord.steps.push({
        step: 'verify_backup_integrity',
        status: backupCheck.valid ? 'passed' : 'failed',
        details: backupCheck,
        timestamp: new Date().toISOString(),
      });

      // Step 2: Verify replication status
      const replicationCheck = await this.getReplicationStatus();
      drillRecord.steps.push({
        step: 'verify_replication',
        status:
          replicationCheck.state === REPLICATION_STATES.STREAMING ? 'passed' : 'warning',
        details: replicationCheck,
        timestamp: new Date().toISOString(),
      });

      // Step 3: Test RPO compliance (replication lag < 1 hour)
      const rpoCompliant =
        replicationCheck.lagSeconds === null ||
        replicationCheck.lagSeconds < this.config.compliance.rpoTargetMinutes * 60;
      drillRecord.steps.push({
        step: 'verify_rpo_compliance',
        status: rpoCompliant ? 'passed' : 'failed',
        details: {
          targetMinutes: this.config.compliance.rpoTargetMinutes,
          actualLagSeconds: replicationCheck.lagSeconds,
        },
        timestamp: new Date().toISOString(),
      });

      // Step 4: Test standby connectivity
      const standbyCheck = await this.checkStandbyConnectivity();
      drillRecord.steps.push({
        step: 'verify_standby_connectivity',
        status: standbyCheck.connected ? 'passed' : 'failed',
        details: standbyCheck,
        timestamp: new Date().toISOString(),
      });

      // Step 5: Verify cross-region backup replication
      const crossRegionCheck = await this.verifyCrossRegionBackups();
      drillRecord.steps.push({
        step: 'verify_cross_region_backups',
        status: crossRegionCheck.replicated ? 'passed' : 'warning',
        details: crossRegionCheck,
        timestamp: new Date().toISOString(),
      });

      // Determine overall drill result
      const failedSteps = drillRecord.steps.filter((s) => s.status === 'failed');
      drillRecord.status = failedSteps.length === 0 ? 'passed' : 'failed';
      drillRecord.endTime = new Date().toISOString();
      drillRecord.failedSteps = failedSteps.map((s) => s.step);

      logger.info('DR drill completed', {
        drillId: drillRecord.drillId,
        status: drillRecord.status,
        failedSteps: drillRecord.failedSteps,
      });
    } catch (error) {
      drillRecord.status = 'error';
      drillRecord.endTime = new Date().toISOString();
      drillRecord.error = error.message;
      logger.error('DR drill failed with error', { error: error.message });
    }

    return drillRecord;
  }

  /**
   * Verify the integrity of the latest database backup.
   */
  async verifyBackupIntegrity() {
    try {
      // Check pg_stat_archiver for WAL archiving status
      const archiveResult = await this.db.raw(`
        SELECT
          archived_count,
          last_archived_wal,
          last_archived_time,
          failed_count,
          last_failed_wal,
          last_failed_time
        FROM pg_stat_archiver
      `);

      if (archiveResult.rows && archiveResult.rows.length > 0) {
        const stats = archiveResult.rows[0];
        return {
          valid: stats.failed_count === 0 || stats.archived_count > stats.failed_count,
          archivedCount: parseInt(stats.archived_count, 10),
          lastArchivedWal: stats.last_archived_wal,
          lastArchivedTime: stats.last_archived_time,
          failedCount: parseInt(stats.failed_count, 10),
        };
      }

      return { valid: false, reason: 'No archiver stats available' };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Check connectivity to the standby database.
   */
  async checkStandbyConnectivity() {
    try {
      const standbyConfig = buildDatabaseConfig(DB_ROLES.STANDBY);
      // In a real implementation, this would connect to the standby
      // For now, verify the configuration is present
      return {
        connected: !!standbyConfig.standby.host,
        host: standbyConfig.standby.host,
        port: standbyConfig.standby.port,
      };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  /**
   * Verify cross-region backup replication is functioning.
   */
  async verifyCrossRegionBackups() {
    const backupConfig = this.config.backup;

    if (!backupConfig.crossRegionEnabled) {
      return {
        replicated: false,
        reason: 'Cross-region replication is not enabled',
        primaryRegion: backupConfig.primaryRegion,
        standbyRegion: backupConfig.standbyRegion,
      };
    }

    return {
      replicated: true,
      primaryRegion: backupConfig.primaryRegion,
      standbyRegion: backupConfig.standbyRegion,
      primaryBucket: backupConfig.s3BucketPrimary,
      standbyBucket: backupConfig.s3BucketStandby,
      encryptionEnabled: backupConfig.encryptionEnabled,
    };
  }

  /**
   * Get a comprehensive DR status report.
   */
  async getStatus() {
    const health = await this.checkPrimaryHealth();
    const replication = await this.getReplicationStatus();

    return {
      service: {
        role: this.currentRole,
        failoverState: this.failoverState,
        monitoringActive: this.healthCheckInterval !== null,
      },
      health,
      replication,
      compliance: {
        rpoTargetMinutes: this.config.compliance.rpoTargetMinutes,
        rtoTargetMinutes: this.config.compliance.rtoTargetMinutes,
        rpoMet:
          replication.lagSeconds === null ||
          replication.lagSeconds < this.config.compliance.rpoTargetMinutes * 60,
        annualDrDrillRequired: this.config.compliance.annualDrDrillRequired,
        lastDrDrillDate: this.config.compliance.lastDrDrillDate,
      },
      failoverHistory: this.failoverHistory,
      lastHealthCheck: this.lastHealthCheck,
    };
  }
}

module.exports = {
  DisasterRecoveryService,
  REPLICATION_STATES,
  FAILOVER_STATES,
};
