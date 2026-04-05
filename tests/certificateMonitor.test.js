/**
 * Tests for CertificateMonitor service
 *
 * Validates certificate expiration monitoring including:
 * - Monitoring lifecycle (start/stop)
 * - Alert threshold evaluation at 30/15/7/3/1 days
 * - Alert deduplication
 * - Webhook notification delivery
 * - Domain certificate checking via TLS
 */

const tls = require('tls');
const https = require('https');
const CertificateMonitor = require('../src/services/certificateMonitor');

// Suppress logger output during tests
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn((expression, callback) => ({
    stop: jest.fn(),
    expression,
    callback,
  })),
  validate: jest.fn(() => true),
}));

const cron = require('node-cron');
const { logger } = require('../src/utils/logger');

describe('CertificateMonitor', () => {
  let monitor;
  let defaultConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    defaultConfig = {
      domain: 'api.medsecure.com',
      additionalDomains: [],
      monitoring: {
        enabled: true,
        checkIntervalCron: '0 */6 * * *',
        alertThresholds: [30, 15, 7, 3, 1],
        criticalThresholdDays: 7,
        warningThresholdDays: 15,
        infoThresholdDays: 30,
      },
      notifications: {
        webhookUrl: '',
        emailRecipients: ['devops@medsecure.com'],
        slackChannel: '#devops-alerts',
      },
    };

    monitor = new CertificateMonitor(defaultConfig);
  });

  afterEach(() => {
    monitor.stop();
  });

  describe('start()', () => {
    test('should schedule monitoring cron job when enabled', () => {
      // Mock checkCertificates to avoid actual TLS connections
      monitor.checkCertificates = jest.fn().mockResolvedValue([]);

      monitor.start();

      expect(cron.schedule).toHaveBeenCalledWith(
        '0 */6 * * *',
        expect.any(Function)
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Certificate monitoring started')
      );
    });

    test('should not start when monitoring is disabled', () => {
      defaultConfig.monitoring.enabled = false;
      monitor = new CertificateMonitor(defaultConfig);

      monitor.start();

      expect(cron.schedule).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Certificate monitoring is disabled');
    });

    test('should log error for invalid cron expression', () => {
      cron.validate.mockReturnValueOnce(false);

      monitor.start();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid cron expression')
      );
    });

    test('should run initial check on start', () => {
      monitor.checkCertificates = jest.fn().mockResolvedValue([]);

      monitor.start();

      expect(monitor.checkCertificates).toHaveBeenCalled();
    });
  });

  describe('_evaluateAndAlert()', () => {
    test('should send critical alert for expired certificate', async () => {
      const sendAlertSpy = jest.spyOn(monitor, '_sendAlert').mockResolvedValue();

      await monitor._evaluateAndAlert({
        domain: 'api.medsecure.com',
        daysUntilExpiry: -1,
        isExpired: true,
        status: 'expired',
      });

      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'critical',
          domain: 'api.medsecure.com',
          message: expect.stringContaining('EXPIRED'),
        })
      );
    });

    test('should send critical alert when certificate expires within 7 days', async () => {
      const sendAlertSpy = jest.spyOn(monitor, '_sendAlert').mockResolvedValue();

      await monitor._evaluateAndAlert({
        domain: 'api.medsecure.com',
        daysUntilExpiry: 5,
        isExpired: false,
        status: 'critical',
      });

      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'critical',
          daysUntilExpiry: 5,
        })
      );
    });

    test('should send warning alert when certificate expires within 15 days', async () => {
      const sendAlertSpy = jest.spyOn(monitor, '_sendAlert').mockResolvedValue();

      await monitor._evaluateAndAlert({
        domain: 'api.medsecure.com',
        daysUntilExpiry: 12,
        isExpired: false,
        status: 'warning',
      });

      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warning',
          daysUntilExpiry: 12,
        })
      );
    });

    test('should send info alert when certificate expires within 30 days', async () => {
      const sendAlertSpy = jest.spyOn(monitor, '_sendAlert').mockResolvedValue();

      await monitor._evaluateAndAlert({
        domain: 'api.medsecure.com',
        daysUntilExpiry: 25,
        isExpired: false,
        status: 'ok',
      });

      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          daysUntilExpiry: 25,
        })
      );
    });

    test('should not send alert when certificate has more than 30 days', async () => {
      const sendAlertSpy = jest.spyOn(monitor, '_sendAlert').mockResolvedValue();

      await monitor._evaluateAndAlert({
        domain: 'api.medsecure.com',
        daysUntilExpiry: 60,
        isExpired: false,
        status: 'ok',
      });

      expect(sendAlertSpy).not.toHaveBeenCalled();
    });

    test('should not re-alert for same threshold within 24 hours', async () => {
      const sendAlertSpy = jest.spyOn(monitor, '_sendAlert').mockResolvedValue();

      // First alert should fire
      await monitor._evaluateAndAlert({
        domain: 'api.medsecure.com',
        daysUntilExpiry: 5,
        isExpired: false,
        status: 'critical',
      });

      expect(sendAlertSpy).toHaveBeenCalledTimes(1);

      // Second alert for same threshold should be suppressed
      await monitor._evaluateAndAlert({
        domain: 'api.medsecure.com',
        daysUntilExpiry: 5,
        isExpired: false,
        status: 'critical',
      });

      // Should still be 1 call (deduplicated)
      expect(sendAlertSpy).toHaveBeenCalledTimes(1);
    });

    test('should alert again after 24-hour dedup window expires', async () => {
      const sendAlertSpy = jest.spyOn(monitor, '_sendAlert').mockResolvedValue();

      await monitor._evaluateAndAlert({
        domain: 'api.medsecure.com',
        daysUntilExpiry: 5,
        isExpired: false,
        status: 'critical',
      });

      expect(sendAlertSpy).toHaveBeenCalledTimes(1);

      // Simulate 25 hours passing by modifying the alert history timestamp
      // With daysUntilExpiry=5, the smallest matching threshold is 7
      const alertKey = 'api.medsecure.com-7';
      monitor.alertHistory.set(alertKey, Date.now() - (25 * 60 * 60 * 1000));

      await monitor._evaluateAndAlert({
        domain: 'api.medsecure.com',
        daysUntilExpiry: 5,
        isExpired: false,
        status: 'critical',
      });

      expect(sendAlertSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('_sendAlert()', () => {
    test('should log critical alerts as errors', async () => {
      await monitor._sendAlert({
        level: 'critical',
        domain: 'api.medsecure.com',
        message: 'Certificate expired',
        daysUntilExpiry: 0,
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Certificate expiration alert',
        expect.objectContaining({
          type: 'CERT_EXPIRY_ALERT',
          level: 'critical',
        })
      );
    });

    test('should log warning alerts as warnings', async () => {
      await monitor._sendAlert({
        level: 'warning',
        domain: 'api.medsecure.com',
        message: 'Certificate expiring soon',
        daysUntilExpiry: 12,
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Certificate expiration alert',
        expect.objectContaining({
          type: 'CERT_EXPIRY_ALERT',
          level: 'warning',
        })
      );
    });

    test('should log info alerts as info', async () => {
      await monitor._sendAlert({
        level: 'info',
        domain: 'api.medsecure.com',
        message: 'Certificate expiring in 25 days',
        daysUntilExpiry: 25,
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Certificate expiration alert',
        expect.objectContaining({
          type: 'CERT_EXPIRY_ALERT',
          level: 'info',
        })
      );
    });

    test('should not attempt webhook when URL not configured', async () => {
      const webhookSpy = jest.spyOn(monitor, '_sendWebhookAlert');

      await monitor._sendAlert({
        level: 'critical',
        domain: 'api.medsecure.com',
        message: 'test',
        daysUntilExpiry: 0,
      });

      expect(webhookSpy).not.toHaveBeenCalled();
    });

    test('should attempt webhook when URL is configured', async () => {
      defaultConfig.notifications.webhookUrl = 'https://hooks.slack.com/test';
      monitor = new CertificateMonitor(defaultConfig);
      const webhookSpy = jest.spyOn(monitor, '_sendWebhookAlert').mockResolvedValue();

      await monitor._sendAlert({
        level: 'critical',
        domain: 'api.medsecure.com',
        message: 'test',
        daysUntilExpiry: 0,
      });

      expect(webhookSpy).toHaveBeenCalled();
    });
  });

  describe('checkCertificates()', () => {
    test('should check all configured domains', async () => {
      defaultConfig.additionalDomains = ['portal.medsecure.com'];
      monitor = new CertificateMonitor(defaultConfig);

      const checkSpy = jest.spyOn(monitor, 'checkDomainCertificate').mockResolvedValue({
        domain: 'api.medsecure.com',
        daysUntilExpiry: 60,
        isExpired: false,
        status: 'ok',
      });

      jest.spyOn(monitor, '_evaluateAndAlert').mockResolvedValue();

      const results = await monitor.checkCertificates();

      expect(checkSpy).toHaveBeenCalledTimes(2);
      expect(checkSpy).toHaveBeenCalledWith('api.medsecure.com');
      expect(checkSpy).toHaveBeenCalledWith('portal.medsecure.com');
      expect(results).toHaveLength(2);
    });

    test('should handle check failures gracefully and send critical alert', async () => {
      jest.spyOn(monitor, 'checkDomainCertificate').mockRejectedValue(
        new Error('Connection refused')
      );

      const sendAlertSpy = jest.spyOn(monitor, '_sendAlert').mockResolvedValue();

      const results = await monitor.checkCertificates();

      expect(results).toHaveLength(1);
      expect(results[0].error).toBe('Connection refused');
      expect(results[0].status).toBe('error');
      expect(sendAlertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'critical',
          message: expect.stringContaining('Unable to check certificate'),
        })
      );
    });
  });

  describe('getStatus()', () => {
    test('should return monitoring status', () => {
      const status = monitor.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.running).toBe(false);
      expect(status.checkInterval).toBe('0 */6 * * *');
      expect(status.alertThresholds).toEqual([30, 15, 7, 3, 1]);
      expect(status.recentAlerts).toEqual([]);
    });

    test('should include recent alert history', () => {
      monitor.alertHistory.set('api.medsecure.com-7', Date.now());

      const status = monitor.getStatus();

      expect(status.recentAlerts).toHaveLength(1);
      expect(status.recentAlerts[0].key).toBe('api.medsecure.com-7');
    });

    test('should show running state after start', () => {
      monitor.checkCertificates = jest.fn().mockResolvedValue([]);
      monitor.start();

      const status = monitor.getStatus();
      expect(status.running).toBe(true);
    });
  });

  describe('stop()', () => {
    test('should stop the monitoring cron task', () => {
      monitor.checkCertificates = jest.fn().mockResolvedValue([]);
      monitor.start();

      expect(monitor.monitorTask).not.toBeNull();

      const stopSpy = monitor.monitorTask.stop;
      monitor.stop();

      expect(stopSpy).toHaveBeenCalled();
      expect(monitor.monitorTask).toBeNull();
    });

    test('should be safe to call when not running', () => {
      expect(() => monitor.stop()).not.toThrow();
    });
  });
});
