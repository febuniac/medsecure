const winston = require('winston');
const { S3AuditTransport } = require('./s3AuditTransport');

const transports = [
  new winston.transports.Console(),
  new winston.transports.File({ filename: 'logs/hipaa-audit.log', level: 'info' }),
  new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
];

// Stream HIPAA audit entries to S3 append-only secure storage (HIPAA §164.312(b))
if (process.env.AUDIT_S3_ENABLED !== 'false') {
  transports.push(new S3AuditTransport({ level: 'info' }));
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports,
});
module.exports = { logger };
