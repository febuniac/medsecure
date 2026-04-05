const Transport = require('winston-transport');
const { getAuditBackupService } = require('../services/auditBackupService');

/**
 * Custom Winston transport that streams HIPAA audit log entries
 * to S3 append-only storage via AuditBackupService.
 *
 * Only forwards log entries with type === 'HIPAA_AUDIT' to ensure
 * only compliance-relevant entries are backed up to secure storage.
 */
class S3AuditTransport extends Transport {
  constructor(opts = {}) {
    super(opts);
    this.name = 's3-audit';
    this._serviceConfig = opts.serviceConfig || {};
  }

  log(info, callback) {
    // Only back up HIPAA audit entries to S3
    if (info.type !== 'HIPAA_AUDIT') {
      if (callback) callback();
      return;
    }

    const service = getAuditBackupService(this._serviceConfig);
    service
      .log(info)
      .then(() => {
        this.emit('logged', info);
        if (callback) callback();
      })
      .catch((err) => {
        this.emit('warn', err);
        if (callback) callback();
      });
  }
}

module.exports = { S3AuditTransport };
