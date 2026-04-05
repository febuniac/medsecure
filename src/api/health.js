/**
 * Health Check API with Disaster Recovery Status
 * HIPAA §164.308(a)(7) — Contingency Plan
 *
 * Provides health, replication, and DR status endpoints
 * for monitoring and alerting systems.
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');

let drService = null;
let backupService = null;

/**
 * Initialize health routes with DR and backup services.
 */
function initializeHealthRoutes(disasterRecoveryService, backupSvc) {
  drService = disasterRecoveryService;
  backupService = backupSvc;
  return router;
}

/**
 * GET /health/dr — Disaster recovery status overview
 */
router.get('/dr', async (req, res) => {
  try {
    if (!drService) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Disaster recovery service not initialized',
      });
    }

    const status = await drService.getStatus();
    const httpStatus = status.health.healthy ? 200 : 503;

    return res.status(httpStatus).json({
      status: status.health.healthy ? 'healthy' : 'degraded',
      ...status,
    });
  } catch (error) {
    logger.error('DR health check error', { error: error.message });
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /health/replication — PostgreSQL replication status
 */
router.get('/replication', async (req, res) => {
  try {
    if (!drService) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Disaster recovery service not initialized',
      });
    }

    const replication = await drService.getReplicationStatus();
    return res.status(200).json(replication);
  } catch (error) {
    logger.error('Replication status check error', { error: error.message });
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /health/backup — Backup service status
 */
router.get('/backup', async (req, res) => {
  try {
    if (!backupService) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Backup service not initialized',
      });
    }

    const status = backupService.getStatus();
    return res.status(200).json(status);
  } catch (error) {
    logger.error('Backup status check error', { error: error.message });
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /health/dr/drill — Execute a DR drill (requires admin auth)
 */
router.post('/dr/drill', async (req, res) => {
  try {
    if (!drService) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Disaster recovery service not initialized',
      });
    }

    const options = { type: req.body.type || 'full' };
    const drillResult = await drService.executeDrDrill(options);

    logger.info('HIPAA_AUDIT: DR drill executed', {
      drillId: drillResult.drillId,
      status: drillResult.status,
      initiatedBy: req.user ? req.user.id : 'system',
    });

    return res.status(200).json(drillResult);
  } catch (error) {
    logger.error('DR drill error', { error: error.message });
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = { router, initializeHealthRoutes };
