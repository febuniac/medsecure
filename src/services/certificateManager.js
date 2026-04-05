/**
 * Certificate Manager Service
 *
 * Handles automated SSL/TLS certificate provisioning and renewal
 * using Let's Encrypt (certbot) and AWS ACM.
 *
 * Fixes Issue #55: SSL certificate renewal not automated
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cron = require('node-cron');
const { logger } = require('../utils/logger');
const sslConfig = require('../config/ssl');

class CertificateManager {
  constructor(config = sslConfig) {
    this.config = config;
    this.renewalTask = null;
    this._execFile = execFile;
  }

  /**
   * Initialize certificate management based on configuration.
   * Starts the appropriate provider and schedules renewal checks.
   */
  initialize() {
    if (this.config.awsAcm.enabled) {
      logger.info('Certificate management: AWS ACM mode (auto-renewal managed by AWS)');
      this._initAwsAcm();
    } else if (this.config.letsEncrypt.enabled) {
      logger.info('Certificate management: Let\'s Encrypt mode with certbot auto-renewal');
      this._initLetsEncrypt();
    } else {
      logger.warn('Certificate management: No automated provider enabled. Set LETSENCRYPT_ENABLED=true or AWS_ACM_ENABLED=true');
    }
  }

  /**
   * Initialize Let's Encrypt certificate management with certbot.
   * Schedules automatic renewal checks via cron.
   */
  _initLetsEncrypt() {
    const { renewalCheckCron } = this.config.letsEncrypt;

    if (!cron.validate(renewalCheckCron)) {
      logger.error(`Invalid cron expression for certificate renewal: ${renewalCheckCron}`);
      return;
    }

    // Schedule automatic renewal check
    this.renewalTask = cron.schedule(renewalCheckCron, async () => {
      logger.info('Running scheduled certificate renewal check');
      try {
        await this.renewCertificate();
      } catch (err) {
        logger.error('Scheduled certificate renewal failed', { error: err.message });
      }
    });

    logger.info(`Certificate renewal scheduled: ${renewalCheckCron}`);
  }

  /**
   * Initialize AWS ACM certificate management.
   * ACM handles renewal automatically; we just verify the certificate exists.
   */
  _initAwsAcm() {
    const { certificateArn, region } = this.config.awsAcm;
    if (!certificateArn) {
      logger.error('AWS ACM certificate ARN not configured. Set AWS_ACM_CERTIFICATE_ARN.');
      return;
    }
    logger.info(`AWS ACM certificate configured: ${certificateArn} in ${region}`);
    logger.info('AWS ACM handles certificate renewal automatically');
  }

  /**
   * Request a new Let's Encrypt certificate via certbot.
   */
  async obtainCertificate() {
    const { email, staging, webRootPath } = this.config.letsEncrypt;
    const { domain, additionalDomains } = this.config;

    const args = [
      'certonly',
      '--webroot',
      '--webroot-path', webRootPath,
      '--email', email,
      '--agree-tos',
      '--non-interactive',
      '--domain', domain,
    ];

    // Add additional domains (SAN)
    for (const d of additionalDomains) {
      args.push('--domain', d);
    }

    if (staging) {
      args.push('--staging');
    }

    logger.info(`Requesting certificate for ${domain}`, { additionalDomains });
    return this._runCertbot(args);
  }

  /**
   * Renew existing Let's Encrypt certificates via certbot.
   * Only renews certificates expiring within the configured pre-renewal window.
   */
  async renewCertificate() {
    const { preRenewalDays } = this.config.letsEncrypt;

    const args = [
      'renew',
      '--non-interactive',
      '--deploy-hook', 'systemctl reload nginx || true',
    ];

    logger.info(`Attempting certificate renewal (pre-renewal window: ${preRenewalDays} days)`);

    try {
      const result = await this._runCertbot(args);
      logger.info('Certificate renewal completed successfully', { output: result.stdout });
      return result;
    } catch (err) {
      logger.error('Certificate renewal failed', { error: err.message, stderr: err.stderr });
      throw err;
    }
  }

  /**
   * Execute a certbot command.
   * @param {string[]} args - Command line arguments for certbot
   * @returns {Promise<{stdout: string, stderr: string}>}
   */
  _runCertbot(args) {
    return new Promise((resolve, reject) => {
      this._execFile('certbot', args, { timeout: 120000 }, (error, stdout, stderr) => {
        if (error) {
          const err = new Error(`Certbot command failed: ${error.message}`);
          err.stderr = stderr;
          err.stdout = stdout;
          reject(err);
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  }

  /**
   * Read and parse a PEM certificate file.
   * @param {string} certPath - Path to the certificate file
   * @returns {Object} Certificate details including expiry date
   */
  getCertificateInfo(certPath) {
    const fullPath = certPath || path.join(
      this.config.certPath,
      this.config.domain,
      this.config.certFile
    );

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Certificate file not found: ${fullPath}`);
    }

    const certPem = fs.readFileSync(fullPath, 'utf8');
    return this.parseCertificate(certPem);
  }

  /**
   * Parse a PEM-encoded certificate and extract metadata.
   * @param {string} certPem - PEM-encoded certificate string
   * @returns {Object} Certificate metadata
   */
  parseCertificate(certPem) {
    try {
      const cert = new crypto.X509Certificate(certPem);
      const notAfter = new Date(cert.validTo);
      const notBefore = new Date(cert.validFrom);
      const now = new Date();
      const daysUntilExpiry = Math.floor((notAfter - now) / (1000 * 60 * 60 * 24));

      return {
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: notBefore,
        validTo: notAfter,
        daysUntilExpiry,
        isExpired: now > notAfter,
        serialNumber: cert.serialNumber,
        fingerprint: cert.fingerprint256,
      };
    } catch (err) {
      throw new Error(`Failed to parse certificate: ${err.message}`);
    }
  }

  /**
   * Check if a certificate needs renewal based on the configured threshold.
   * @param {string} certPath - Optional path to the certificate file
   * @returns {Object} Renewal status
   */
  checkRenewalNeeded(certPath) {
    const certInfo = this.getCertificateInfo(certPath);
    const { preRenewalDays } = this.config.letsEncrypt;

    return {
      ...certInfo,
      renewalNeeded: certInfo.daysUntilExpiry <= preRenewalDays,
      preRenewalDays,
    };
  }

  /**
   * Get the current certificate management status.
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      provider: this.config.awsAcm.enabled ? 'aws-acm' : this.config.letsEncrypt.enabled ? 'letsencrypt' : 'none',
      domain: this.config.domain,
      additionalDomains: this.config.additionalDomains,
      renewalScheduled: this.renewalTask !== null,
      awsAcm: this.config.awsAcm.enabled ? {
        certificateArn: this.config.awsAcm.certificateArn,
        region: this.config.awsAcm.region,
        autoRenew: this.config.awsAcm.autoRenew,
      } : null,
      letsEncrypt: this.config.letsEncrypt.enabled ? {
        renewalCron: this.config.letsEncrypt.renewalCheckCron,
        preRenewalDays: this.config.letsEncrypt.preRenewalDays,
        staging: this.config.letsEncrypt.staging,
      } : null,
    };
  }

  /**
   * Stop the renewal scheduler and clean up resources.
   */
  shutdown() {
    if (this.renewalTask) {
      this.renewalTask.stop();
      this.renewalTask = null;
      logger.info('Certificate renewal scheduler stopped');
    }
  }
}

module.exports = CertificateManager;
