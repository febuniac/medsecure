/**
 * SSL/TLS Certificate Configuration
 *
 * Centralizes all certificate management settings including
 * Let's Encrypt (certbot), AWS ACM, and monitoring thresholds.
 */

const sslConfig = {
  // Domain configuration
  domain: process.env.SSL_DOMAIN || 'api.medsecure.com',
  additionalDomains: (process.env.SSL_ADDITIONAL_DOMAINS || '').split(',').filter(Boolean),

  // Certificate storage paths
  certPath: process.env.SSL_CERT_PATH || '/etc/letsencrypt/live',
  certFile: process.env.SSL_CERT_FILE || 'fullchain.pem',
  keyFile: process.env.SSL_KEY_FILE || 'privkey.pem',

  // Let's Encrypt / Certbot configuration
  letsEncrypt: {
    enabled: process.env.LETSENCRYPT_ENABLED === 'true',
    email: process.env.LETSENCRYPT_EMAIL || 'devops@medsecure.com',
    staging: process.env.LETSENCRYPT_STAGING === 'true',
    webRootPath: process.env.LETSENCRYPT_WEBROOT || '/var/www/certbot',
    renewalCheckCron: process.env.CERT_RENEWAL_CRON || '0 3 * * *', // Daily at 3 AM
    preRenewalDays: parseInt(process.env.CERT_PRE_RENEWAL_DAYS, 10) || 30,
  },

  // AWS ACM configuration
  awsAcm: {
    enabled: process.env.AWS_ACM_ENABLED === 'true',
    region: process.env.AWS_ACM_REGION || 'us-east-1',
    certificateArn: process.env.AWS_ACM_CERTIFICATE_ARN || '',
    autoRenew: true, // ACM handles renewal automatically
  },

  // Certificate monitoring thresholds (days before expiry)
  monitoring: {
    enabled: process.env.CERT_MONITORING_ENABLED !== 'false', // enabled by default
    checkIntervalCron: process.env.CERT_MONITOR_CRON || '0 */6 * * *', // Every 6 hours
    alertThresholds: [30, 15, 7, 3, 1], // Days before expiry to trigger alerts
    criticalThresholdDays: 7,
    warningThresholdDays: 15,
    infoThresholdDays: 30,
  },

  // Notification configuration
  notifications: {
    webhookUrl: process.env.CERT_ALERT_WEBHOOK_URL || '',
    emailRecipients: (process.env.CERT_ALERT_EMAILS || 'devops@medsecure.com').split(',').filter(Boolean),
    slackChannel: process.env.CERT_ALERT_SLACK_CHANNEL || '#devops-alerts',
  },
};

module.exports = sslConfig;
