const express = require('express');
const helmet = require('helmet');
const { logger } = require('./utils/logger');
const hipaaAudit = require('./middleware/hipaaAudit');
const authMiddleware = require('./middleware/auth');
const { getAuditBackupService } = require('./services/auditBackupService');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '50mb' }));
app.use(hipaaAudit);

app.use('/api/v1/patients', authMiddleware, require('./api/patients'));
app.use('/api/v1/records', authMiddleware, require('./api/records'));
app.use('/api/v1/appointments', authMiddleware, require('./api/appointments'));
app.use('/api/v1/prescriptions', authMiddleware, require('./api/prescriptions'));
app.use('/api/v1/providers', authMiddleware, require('./api/providers'));
app.use('/api/v1/consent', authMiddleware, require('./api/consent'));
app.use('/fhir/r4', authMiddleware, require('./api/fhir'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Graceful shutdown: flush remaining audit log entries to S3
const gracefulShutdown = async (signal) => {
  logger.info({ type: 'SHUTDOWN', signal });
  try {
    const auditBackup = getAuditBackupService();
    await auditBackup.shutdown();
    logger.info({ type: 'SHUTDOWN_COMPLETE', message: 'Audit logs flushed to S3' });
  } catch (err) {
    logger.error({ type: 'SHUTDOWN_ERROR', error: err.message });
  }
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`MedSecure running on port ${PORT}`));
module.exports = app;
