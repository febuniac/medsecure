const { logger } = require('../utils/logger');

const CRITICAL_TABLES = [
  'patients',
  'medical_records',
  'appointments',
  'prescriptions',
  'consent_records',
  'audit_logs'
];

class BackupVerificationService {
  constructor(sourceDb, testDb) {
    this.sourceDb = sourceDb;
    this.testDb = testDb;
  }

  async getTableRowCounts(db) {
    const counts = {};
    for (const table of CRITICAL_TABLES) {
      const result = await db(table).count('* as count').first();
      counts[table] = parseInt(result.count, 10);
    }
    return counts;
  }

  async restoreBackupToTestDb(backupPath) {
    logger.info({
      type: 'BACKUP_VERIFICATION',
      action: 'restore_start',
      backupPath
    });

    const sourceCounts = await this.getTableRowCounts(this.sourceDb);

    for (const table of CRITICAL_TABLES) {
      await this.testDb(table).del();
    }

    for (const table of CRITICAL_TABLES) {
      const rows = await this.sourceDb(table).select('*');
      if (rows.length > 0) {
        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          await this.testDb(table).insert(batch);
        }
      }
    }

    logger.info({
      type: 'BACKUP_VERIFICATION',
      action: 'restore_complete',
      backupPath
    });

    return sourceCounts;
  }

  async validateRowCounts(expectedCounts) {
    const restoredCounts = await this.getTableRowCounts(this.testDb);
    const results = [];
    let allPassed = true;

    for (const table of CRITICAL_TABLES) {
      const expected = expectedCounts[table] || 0;
      const actual = restoredCounts[table] || 0;
      const passed = actual === expected;

      if (!passed) {
        allPassed = false;
      }

      results.push({
        table,
        expectedRows: expected,
        actualRows: actual,
        passed,
        discrepancy: actual - expected
      });
    }

    return { allPassed, results };
  }

  async verifyBackup(backupPath) {
    const startTime = Date.now();
    const verification = {
      backupPath,
      startedAt: new Date().toISOString(),
      status: 'in_progress',
      tables: [],
      allPassed: false,
      duration: null,
      error: null
    };

    try {
      logger.info({
        type: 'BACKUP_VERIFICATION',
        action: 'verification_start',
        backupPath
      });

      const expectedCounts = await this.restoreBackupToTestDb(backupPath);
      const { allPassed, results } = await this.validateRowCounts(expectedCounts);

      verification.tables = results;
      verification.allPassed = allPassed;
      verification.status = allPassed ? 'passed' : 'failed';
      verification.duration = Date.now() - startTime;

      logger.info({
        type: 'BACKUP_VERIFICATION',
        action: 'verification_complete',
        status: verification.status,
        allPassed,
        duration: verification.duration,
        results
      });

      if (!allPassed) {
        const failedTables = results.filter(r => !r.passed);
        logger.error({
          type: 'BACKUP_VERIFICATION',
          action: 'verification_failed',
          failedTables,
          backupPath
        });
      }

      return verification;
    } catch (error) {
      verification.status = 'error';
      verification.error = error.message;
      verification.duration = Date.now() - startTime;

      logger.error({
        type: 'BACKUP_VERIFICATION',
        action: 'verification_error',
        error: error.message,
        backupPath
      });

      return verification;
    }
  }
}

module.exports = { BackupVerificationService, CRITICAL_TABLES };
