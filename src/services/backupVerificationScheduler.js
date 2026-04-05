const cron = require('node-cron');
const { logger } = require('../utils/logger');
const { BackupVerificationService } = require('./backupVerificationService');

let lastVerificationResult = null;
let verificationHistory = [];
const MAX_HISTORY = 50;

function getLastVerificationResult() {
  return lastVerificationResult;
}

function getVerificationHistory() {
  return verificationHistory;
}

function scheduleBackupVerification(sourceDb, testDb, schedule = '0 3 * * *') {
  const verificationService = new BackupVerificationService(sourceDb, testDb);

  logger.info({
    type: 'BACKUP_VERIFICATION',
    action: 'scheduler_init',
    schedule
  });

  const task = cron.schedule(schedule, async () => {
    logger.info({
      type: 'BACKUP_VERIFICATION',
      action: 'scheduled_run_start'
    });

    const backupPath = `/backups/medsecure_${new Date().toISOString().split('T')[0]}.sql`;

    try {
      const result = await verificationService.verifyBackup(backupPath);
      lastVerificationResult = result;
      verificationHistory.unshift(result);

      if (verificationHistory.length > MAX_HISTORY) {
        verificationHistory = verificationHistory.slice(0, MAX_HISTORY);
      }

      if (result.status === 'failed') {
        logger.error({
          type: 'BACKUP_VERIFICATION',
          action: 'scheduled_run_failed',
          failedTables: result.tables.filter(t => !t.passed)
        });
      }
    } catch (error) {
      logger.error({
        type: 'BACKUP_VERIFICATION',
        action: 'scheduled_run_error',
        error: error.message
      });
    }
  });

  return task;
}

async function runVerificationNow(sourceDb, testDb) {
  const verificationService = new BackupVerificationService(sourceDb, testDb);
  const backupPath = `/backups/medsecure_${new Date().toISOString().split('T')[0]}.sql`;

  const result = await verificationService.verifyBackup(backupPath);
  lastVerificationResult = result;
  verificationHistory.unshift(result);

  if (verificationHistory.length > MAX_HISTORY) {
    verificationHistory = verificationHistory.slice(0, MAX_HISTORY);
  }

  return result;
}

module.exports = {
  scheduleBackupVerification,
  runVerificationNow,
  getLastVerificationResult,
  getVerificationHistory
};
