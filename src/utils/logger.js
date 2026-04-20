const winston = require('winston');
const { createRedactionFormat } = require('./phiRedactor');

// Redaction format strips PHI before logs reach external transports
const redactionFormat = createRedactionFormat(winston);

// Base format shared by all transports
const baseFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Redacted format for external/non-HIPAA transports (console, Datadog, etc.)
const redactedFormat = winston.format.combine(
  redactionFormat,
  winston.format.timestamp(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: baseFormat,
  transports: [
    // Console and Datadog-forwarded logs use redacted format
    new winston.transports.Console({ format: redactedFormat }),

    // HIPAA-compliant storage retains original unscrubbed logs
    // This file must be stored on HIPAA-compliant, encrypted storage
    new winston.transports.File({
      filename: 'logs/hipaa-audit.log',
      level: 'info',
      format: baseFormat,
    }),

    // Error logs forwarded externally are also redacted
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: redactedFormat,
    }),
  ],
});

module.exports = { logger };
