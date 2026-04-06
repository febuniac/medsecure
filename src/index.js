const express = require('express');
const securityHeaders = require('./middleware/securityHeaders');
const { logger } = require('./utils/logger');
const { validateEnv } = require('./utils/validateEnv');
const corsMiddleware = require('./middleware/cors');
const hipaaAudit = require('./middleware/hipaaAudit');
const breachDetection = require('./middleware/breachDetection');
const httpsEnforcement = require('./middleware/httpsEnforcement');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const correlationId = require('./middleware/correlationId');
const { scheduleBackupVerification } = require('./services/backupVerificationScheduler');
const db = require('./models/db');
const knex = require('knex');
const v1Router = require('./api/v1Router');
const { buildTestDbConfig } = require('./config/database');

validateEnv();

const app = express();
app.use(securityHeaders());
app.use(correlationId);
app.use(corsMiddleware);
app.use(express.json({ limit: '5mb' }));
app.use(httpsEnforcement);
app.use(hipaaAudit);
app.use(breachDetection);
app.use('/api/', apiLimiter);

app.use('/api/v1/patients', authMiddleware, require('./api/patients'));
app.use('/api/v1/records', authMiddleware, require('./api/records'));
app.use('/api/v1/appointments', authMiddleware, require('./api/appointments'));
app.use('/api/v1/prescriptions', authMiddleware, require('./api/prescriptions'));
app.use('/api/v1/providers', authMiddleware, require('./api/providers'));
app.use('/api/v1/consent', authMiddleware, require('./api/consent'));
app.use('/api/v1/image-attachments', authMiddleware, require('./api/imageAttachments'));
app.use('/api/v1/breach-notifications', authMiddleware, require('./api/breachNotification'));
app.use('/fhir/r4', authMiddleware, require('./api/fhir'));
app.use('/api/v1/backup-verification', authMiddleware, require('./api/backupVerification'));

app.use('/api/v1/auth', authLimiter, require('./api/auth'));
app.use('/api/v1', v1Router);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

if (process.env.BACKUP_VERIFICATION_ENABLED !== 'false') {
  const testDb = knex(buildTestDbConfig());

  const verificationSchedule = process.env.BACKUP_VERIFICATION_SCHEDULE || '0 3 * * *';
  scheduleBackupVerification(db, testDb, verificationSchedule);
  logger.info({ type: 'BACKUP_VERIFICATION', action: 'enabled', schedule: verificationSchedule });
}

const { createGracefulShutdown } = require('./utils/gracefulShutdown');
const { shutdown: gracefulShutdown } = createGracefulShutdown(db);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => logger.info(`MedSecure running on port ${PORT}`));

process.on('SIGTERM', () => gracefulShutdown(server, 'SIGTERM'));
process.on('SIGINT', () => gracefulShutdown(server, 'SIGINT'));

module.exports = { app, server, gracefulShutdown };
