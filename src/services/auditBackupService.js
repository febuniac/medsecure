const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

const FLUSH_INTERVAL_MS = parseInt(process.env.AUDIT_FLUSH_INTERVAL_MS, 10) || 30000;
const MAX_BUFFER_SIZE = parseInt(process.env.AUDIT_MAX_BUFFER_SIZE, 10) || 100;

class AuditBackupService {
  constructor(config = {}) {
    this.bucket = config.bucket || process.env.AUDIT_S3_BUCKET || 'medsecure-hipaa-audit-logs';
    this.prefix = config.prefix || process.env.AUDIT_S3_PREFIX || 'hipaa-audit';
    this.region = config.region || process.env.AUDIT_S3_REGION || process.env.AWS_REGION || 'us-east-1';
    this.enabled = config.enabled !== undefined ? config.enabled : process.env.AUDIT_S3_ENABLED !== 'false';
    this.flushIntervalMs = config.flushIntervalMs || FLUSH_INTERVAL_MS;
    this.maxBufferSize = config.maxBufferSize || MAX_BUFFER_SIZE;

    this._buffer = [];
    this._flushTimer = null;
    this._flushing = false;

    if (config.s3Client) {
      this.s3 = config.s3Client;
    } else {
      this.s3 = new S3Client({ region: this.region });
    }

    if (this.enabled) {
      this._startFlushTimer();
    }
  }

  /**
   * Enqueue an audit log entry for backup to S3.
   * Entries are buffered and flushed periodically or when the buffer is full.
   */
  async log(entry) {
    if (!this.enabled) return;

    const enrichedEntry = {
      ...entry,
      backupTimestamp: new Date().toISOString(),
      integrityHash: this._computeHash(entry),
    };

    this._buffer.push(enrichedEntry);

    if (this._buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * Flush buffered audit log entries to S3 as a single append-only object.
   * Each flush creates a new immutable object keyed by timestamp + UUID.
   */
  async flush() {
    if (this._flushing || this._buffer.length === 0) return;

    this._flushing = true;
    const entries = this._buffer.splice(0);

    try {
      const now = new Date();
      const datePath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(now.getUTCDate()).padStart(2, '0')}`;
      const batchId = crypto.randomUUID();
      const key = `${this.prefix}/${datePath}/${now.toISOString()}-${batchId}.jsonl`;

      const body = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';

      const batchHash = crypto
        .createHash('sha256')
        .update(body)
        .digest('hex');

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/x-ndjson',
        // S3 Object Lock requires the bucket to have Object Lock enabled.
        // GOVERNANCE mode prevents deletion unless caller has s3:BypassGovernanceRetention.
        ObjectLockMode: 'GOVERNANCE',
        ObjectLockRetainUntilDate: this._getRetentionDate(),
        Metadata: {
          'batch-hash': batchHash,
          'entry-count': String(entries.length),
          'source': 'medsecure-hipaa-audit',
        },
        ServerSideEncryption: 'aws:kms',
      });

      await this.s3.send(command);

      logger.debug({
        type: 'AUDIT_BACKUP_FLUSH',
        entriesCount: entries.length,
        s3Key: key,
        batchHash,
      });
    } catch (err) {
      // Re-add entries to front of buffer on failure so they are retried
      this._buffer.unshift(...entries);
      logger.error({
        type: 'AUDIT_BACKUP_ERROR',
        error: err.message,
        entriesCount: entries.length,
      });
      throw err;
    } finally {
      this._flushing = false;
    }
  }

  /**
   * Compute a SHA-256 integrity hash for a single audit entry.
   * This allows tamper detection when entries are later retrieved.
   */
  _computeHash(entry) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(entry))
      .digest('hex');
  }

  /**
   * HIPAA requires audit logs to be retained for a minimum of 6 years.
   * Returns a date 6 years from now for S3 Object Lock retention.
   */
  _getRetentionDate() {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 6);
    return date;
  }

  _startFlushTimer() {
    if (this._flushTimer) return;
    this._flushTimer = setInterval(async () => {
      try {
        await this.flush();
      } catch (_err) {
        // Error already logged in flush()
      }
    }, this.flushIntervalMs);
    // Allow the process to exit even if the timer is still running
    if (this._flushTimer.unref) {
      this._flushTimer.unref();
    }
  }

  /**
   * Stop the flush timer and flush any remaining entries.
   * Should be called during graceful shutdown.
   */
  async shutdown() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    await this.flush();
  }

  getBufferSize() {
    return this._buffer.length;
  }
}

// Singleton instance for application-wide use
let _instance = null;

function getAuditBackupService(config) {
  if (!_instance) {
    _instance = new AuditBackupService(config);
  }
  return _instance;
}

function resetAuditBackupService() {
  if (_instance) {
    _instance.shutdown().catch(() => {});
    _instance = null;
  }
}

module.exports = {
  AuditBackupService,
  getAuditBackupService,
  resetAuditBackupService,
};
