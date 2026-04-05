const express = require('express');
const helmet = require('helmet');
const { logger } = require('./utils/logger');
const hipaaAudit = require('./middleware/hipaaAudit');
const breachDetection = require('./middleware/breachDetection');
const authMiddleware = require('./middleware/auth');
const httpsEnforcement = require('./middleware/httpsEnforcement');
const { scheduleBackupVerification } = require('./services/backupVerificationScheduler');
const db = require('./models/db');
const knex = require('knex');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '50mb' }));
app.use(httpsEnforcement);
app.use(hipaaAudit);
app.use(breachDetection);

app.use('/api/v1/patients', authMiddleware, require('./api/patients'));
app.use('/api/v1/records', authMiddleware, require('./api/records'));
app.use('/api/v1/appointments', authMiddleware, require('./api/appointments'));
app.use('/api/v1/prescriptions', authMiddleware, require('./api/prescriptions'));
app.use('/api/v1/providers', authMiddleware, require('./api/providers'));
app.use('/api/v1/consent', authMiddleware, require('./api/consent'));
app.use('/api/v1/breach-notifications', authMiddleware, require('./api/breachNotification'));
app.use('/fhir/r4', authMiddleware, require('./api/fhir'));
app.use('/api/v1/backup-verification', authMiddleware, require('./api/backupVerification'));
app.use('/api/v1/admin', authMiddleware, require('./api/admin'));

app.use('/api/v1/auth', require('./api/auth'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

if (process.env.BACKUP_VERIFICATION_ENABLED !== 'false') {
  const testDb = knex({
    client: 'pg',
    connection: {
      host: process.env.TEST_DB_HOST || process.env.DB_HOST || 'localhost',
      port: process.env.TEST_DB_PORT || process.env.DB_PORT || 5432,
      user: process.env.TEST_DB_USER || process.env.DB_USER || 'medsecure',
      password: process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD,
      database: process.env.TEST_DB_NAME || 'medsecure_test_db',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false
    },
    pool: { min: 1, max: 5 }
  });

  const verificationSchedule = process.env.BACKUP_VERIFICATION_SCHEDULE || '0 3 * * *';
  scheduleBackupVerification(db, testDb, verificationSchedule);
  logger.info({ type: 'BACKUP_VERIFICATION', action: 'enabled', schedule: verificationSchedule });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`MedSecure running on port ${PORT}`));
module.exports = app;
