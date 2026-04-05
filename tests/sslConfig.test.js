/**
 * Tests for SSL Configuration
 *
 * Validates default configuration values and environment variable overrides.
 */

describe('SSL Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should have correct default domain', () => {
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.domain).toBe('api.medsecure.com');
  });

  test('should have correct default cert paths', () => {
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.certPath).toBe('/etc/letsencrypt/live');
    expect(sslConfig.certFile).toBe('fullchain.pem');
    expect(sslConfig.keyFile).toBe('privkey.pem');
  });

  test('should have Let\'s Encrypt disabled by default', () => {
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.letsEncrypt.enabled).toBe(false);
  });

  test('should have AWS ACM disabled by default', () => {
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.awsAcm.enabled).toBe(false);
  });

  test('should have monitoring enabled by default', () => {
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.monitoring.enabled).toBe(true);
  });

  test('should have correct default alert thresholds', () => {
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.monitoring.alertThresholds).toEqual([30, 15, 7, 3, 1]);
    expect(sslConfig.monitoring.criticalThresholdDays).toBe(7);
    expect(sslConfig.monitoring.warningThresholdDays).toBe(15);
    expect(sslConfig.monitoring.infoThresholdDays).toBe(30);
  });

  test('should override domain from environment', () => {
    process.env.SSL_DOMAIN = 'custom.medsecure.com';
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.domain).toBe('custom.medsecure.com');
  });

  test('should enable Let\'s Encrypt from environment', () => {
    process.env.LETSENCRYPT_ENABLED = 'true';
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.letsEncrypt.enabled).toBe(true);
  });

  test('should enable AWS ACM from environment', () => {
    process.env.AWS_ACM_ENABLED = 'true';
    process.env.AWS_ACM_CERTIFICATE_ARN = 'arn:aws:acm:us-east-1:123:certificate/abc';
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.awsAcm.enabled).toBe(true);
    expect(sslConfig.awsAcm.certificateArn).toBe('arn:aws:acm:us-east-1:123:certificate/abc');
  });

  test('should parse additional domains from comma-separated env var', () => {
    process.env.SSL_ADDITIONAL_DOMAINS = 'portal.medsecure.com,admin.medsecure.com';
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.additionalDomains).toEqual(['portal.medsecure.com', 'admin.medsecure.com']);
  });

  test('should handle empty additional domains', () => {
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.additionalDomains).toEqual([]);
  });

  test('should override notification settings from environment', () => {
    process.env.CERT_ALERT_WEBHOOK_URL = 'https://hooks.slack.com/test';
    process.env.CERT_ALERT_EMAILS = 'admin@medsecure.com,ops@medsecure.com';
    process.env.CERT_ALERT_SLACK_CHANNEL = '#critical-alerts';
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.notifications.webhookUrl).toBe('https://hooks.slack.com/test');
    expect(sslConfig.notifications.emailRecipients).toEqual(['admin@medsecure.com', 'ops@medsecure.com']);
    expect(sslConfig.notifications.slackChannel).toBe('#critical-alerts');
  });

  test('should use Let\'s Encrypt staging from environment', () => {
    process.env.LETSENCRYPT_STAGING = 'true';
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.letsEncrypt.staging).toBe(true);
  });

  test('should override renewal cron from environment', () => {
    process.env.CERT_RENEWAL_CRON = '0 2 * * 1';
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.letsEncrypt.renewalCheckCron).toBe('0 2 * * 1');
  });

  test('should disable monitoring when explicitly set', () => {
    process.env.CERT_MONITORING_ENABLED = 'false';
    const sslConfig = require('../src/config/ssl');
    expect(sslConfig.monitoring.enabled).toBe(false);
  });
});
