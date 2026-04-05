/**
 * Certificate Expiration Monitor
 *
 * Monitors SSL/TLS certificate expiry and sends alerts
 * at configurable thresholds (30, 15, 7, 3, 1 days).
 *
 * Fixes Issue #55: Add certificate expiration monitoring
 */

const tls = require('tls');
const https = require('https');
const cron = require('node-cron');
const { logger } = require('../utils/logger');
const sslConfig = require('../config/ssl');

class CertificateMonitor {
  constructor(config = sslConfig) {
    this.config = config;
    this.monitorTask = null;
    this.alertHistory = new Map(); // Track sent alerts to avoid duplicates
  }

  /**
   * Start the certificate monitoring cron job.
   */
  start() {
    if (!this.config.monitoring.enabled) {
      logger.info('Certificate monitoring is disabled');
      return;
    }

    const { checkIntervalCron } = this.config.monitoring;

    if (!cron.validate(checkIntervalCron)) {
      logger.error(`Invalid cron expression for certificate monitoring: ${checkIntervalCron}`);
      return;
    }

    // Run an initial check immediately
    this.checkCertificates().catch(err => {
      logger.error('Initial certificate check failed', { error: err.message });
    });

    this.monitorTask = cron.schedule(checkIntervalCron, async () => {
      try {
        await this.checkCertificates();
      } catch (err) {
        logger.error('Certificate monitoring check failed', { error: err.message });
      }
    });

    logger.info(`Certificate monitoring started (schedule: ${checkIntervalCron})`);
  }

  /**
   * Check certificates for all configured domains.
   */
  async checkCertificates() {
    const domains = [this.config.domain, ...this.config.additionalDomains];

    const results = [];
    for (const domain of domains) {
      try {
        const result = await this.checkDomainCertificate(domain);
        results.push(result);
        await this._evaluateAndAlert(result);
      } catch (err) {
        logger.error(`Failed to check certificate for ${domain}`, { error: err.message });
        results.push({ domain, error: err.message, status: 'error' });
        await this._sendAlert({
          level: 'critical',
          domain,
          message: `Unable to check certificate for ${domain}: ${err.message}`,
          daysUntilExpiry: null,
        });
      }
    }

    return results;
  }

  /**
   * Check the SSL certificate for a specific domain by connecting via TLS.
   * @param {string} domain - The domain to check
   * @param {number} port - The port to connect to (default: 443)
   * @returns {Promise<Object>} Certificate information
   */
  checkDomainCertificate(domain, port = 443) {
    return new Promise((resolve, reject) => {
      const options = {
        host: domain,
        port,
        servername: domain,
        rejectUnauthorized: false, // Allow expired certs so we can still inspect them
        timeout: 10000,
      };

      const socket = tls.connect(options, () => {
        try {
          const cert = socket.getPeerCertificate(true);
          if (!cert || !cert.valid_to) {
            socket.destroy();
            reject(new Error(`No certificate returned for ${domain}`));
            return;
          }

          const validTo = new Date(cert.valid_to);
          const validFrom = new Date(cert.valid_from);
          const now = new Date();
          const daysUntilExpiry = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));

          const result = {
            domain,
            subject: cert.subject?.CN || domain,
            issuer: cert.issuer?.O || 'Unknown',
            validFrom,
            validTo,
            daysUntilExpiry,
            isExpired: now > validTo,
            serialNumber: cert.serialNumber,
            fingerprint: cert.fingerprint256,
            status: now > validTo ? 'expired' : daysUntilExpiry <= 7 ? 'critical' : daysUntilExpiry <= 15 ? 'warning' : 'ok',
          };

          socket.destroy();
          resolve(result);
        } catch (err) {
          socket.destroy();
          reject(new Error(`Failed to parse certificate for ${domain}: ${err.message}`));
        }
      });

      socket.on('error', (err) => {
        reject(new Error(`TLS connection to ${domain}:${port} failed: ${err.message}`));
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`TLS connection to ${domain}:${port} timed out`));
      });
    });
  }

  /**
   * Evaluate certificate status and send alerts if thresholds are crossed.
   * @param {Object} certInfo - Certificate information from checkDomainCertificate
   */
  async _evaluateAndAlert(certInfo) {
    const { alertThresholds, criticalThresholdDays, warningThresholdDays } = this.config.monitoring;
    const { domain, daysUntilExpiry, isExpired } = certInfo;

    if (isExpired) {
      await this._sendAlert({
        level: 'critical',
        domain,
        message: `CRITICAL: SSL certificate for ${domain} has EXPIRED!`,
        daysUntilExpiry: 0,
      });
      return;
    }

    // Find the most urgent (smallest) matching threshold
    const sortedThresholds = [...alertThresholds].sort((a, b) => a - b);
    let matchedThreshold = null;
    for (const threshold of sortedThresholds) {
      if (daysUntilExpiry <= threshold) {
        matchedThreshold = threshold;
        break;
      }
    }

    if (matchedThreshold !== null) {
      const alertKey = `${domain}-${matchedThreshold}`;

      // Don't re-alert for the same threshold within 24 hours
      const lastAlert = this.alertHistory.get(alertKey);
      if (lastAlert && (Date.now() - lastAlert) < 24 * 60 * 60 * 1000) {
        // Skip — already alerted for this threshold recently
      } else {
        let level;
        if (daysUntilExpiry <= criticalThresholdDays) {
          level = 'critical';
        } else if (daysUntilExpiry <= warningThresholdDays) {
          level = 'warning';
        } else {
          level = 'info';
        }

        await this._sendAlert({
          level,
          domain,
          message: `SSL certificate for ${domain} expires in ${daysUntilExpiry} days (threshold: ${matchedThreshold} days)`,
          daysUntilExpiry,
        });

        this.alertHistory.set(alertKey, Date.now());
      }
    }

    logger.info(`Certificate check: ${domain} - ${daysUntilExpiry} days until expiry`, {
      status: certInfo.status,
      validTo: certInfo.validTo,
    });
  }

  /**
   * Send an alert notification via configured channels.
   * @param {Object} alert - Alert details
   */
  async _sendAlert(alert) {
    const { level, domain, message, daysUntilExpiry } = alert;

    // Log the alert
    const logMethod = level === 'critical' ? 'error' : level === 'warning' ? 'warn' : 'info';
    logger[logMethod]('Certificate expiration alert', {
      type: 'CERT_EXPIRY_ALERT',
      level,
      domain,
      message,
      daysUntilExpiry,
    });

    // Send webhook notification if configured
    if (this.config.notifications.webhookUrl) {
      await this._sendWebhookAlert(alert);
    }
  }

  /**
   * Send alert via webhook (Slack, PagerDuty, etc.).
   * @param {Object} alert - Alert details
   */
  async _sendWebhookAlert(alert) {
    const { webhookUrl } = this.config.notifications;
    const payload = JSON.stringify({
      text: `[${alert.level.toUpperCase()}] ${alert.message}`,
      level: alert.level,
      domain: alert.domain,
      daysUntilExpiry: alert.daysUntilExpiry,
      service: 'MedSecure',
      timestamp: new Date().toISOString(),
    });

    return new Promise((resolve, reject) => {
      const url = new URL(webhookUrl);
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            logger.info('Webhook alert sent successfully', { domain: alert.domain });
            resolve(body);
          } else {
            logger.error('Webhook alert failed', { statusCode: res.statusCode, body });
            reject(new Error(`Webhook returned ${res.statusCode}`));
          }
        });
      });

      req.on('error', (err) => {
        logger.error('Webhook alert request failed', { error: err.message });
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Webhook request timed out'));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Get the current monitoring status and recent alert history.
   * @returns {Object} Monitoring status
   */
  getStatus() {
    const alertHistoryEntries = [];
    for (const [key, timestamp] of this.alertHistory) {
      alertHistoryEntries.push({ key, lastAlerted: new Date(timestamp).toISOString() });
    }

    return {
      enabled: this.config.monitoring.enabled,
      running: this.monitorTask !== null,
      checkInterval: this.config.monitoring.checkIntervalCron,
      alertThresholds: this.config.monitoring.alertThresholds,
      recentAlerts: alertHistoryEntries,
    };
  }

  /**
   * Stop the monitoring cron job and clean up.
   */
  stop() {
    if (this.monitorTask) {
      this.monitorTask.stop();
      this.monitorTask = null;
      logger.info('Certificate monitoring stopped');
    }
  }
}

module.exports = CertificateMonitor;
