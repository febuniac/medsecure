/**
 * Certificate Management API Routes
 *
 * Provides endpoints for checking certificate status,
 * triggering manual renewal, and viewing monitoring data.
 */

const express = require('express');
const router = express.Router();
const CertificateManager = require('../services/certificateManager');
const CertificateMonitor = require('../services/certificateMonitor');
const { logger } = require('../utils/logger');

const certManager = new CertificateManager();
const certMonitor = new CertificateMonitor();

/**
 * GET /api/v1/certificates/status
 * Returns the current certificate management and monitoring status.
 */
router.get('/status', (req, res) => {
  try {
    const managerStatus = certManager.getStatus();
    const monitorStatus = certMonitor.getStatus();

    res.json({
      certificateManager: managerStatus,
      certificateMonitor: monitorStatus,
    });
  } catch (err) {
    logger.error('Failed to get certificate status', { error: err.message });
    res.status(500).json({ error: 'Failed to retrieve certificate status' });
  }
});

/**
 * POST /api/v1/certificates/check
 * Triggers an immediate certificate check for all configured domains.
 */
router.post('/check', async (req, res) => {
  try {
    const results = await certMonitor.checkCertificates();
    res.json({ results });
  } catch (err) {
    logger.error('Certificate check failed', { error: err.message });
    res.status(500).json({ error: 'Certificate check failed', details: err.message });
  }
});

/**
 * POST /api/v1/certificates/renew
 * Triggers a manual certificate renewal via certbot.
 */
router.post('/renew', async (req, res) => {
  try {
    const result = await certManager.renewCertificate();
    logger.info('Manual certificate renewal triggered', { userId: req.user?.id });
    res.json({ message: 'Certificate renewal initiated', result });
  } catch (err) {
    logger.error('Manual certificate renewal failed', { error: err.message });
    res.status(500).json({ error: 'Certificate renewal failed', details: err.message });
  }
});

module.exports = router;
