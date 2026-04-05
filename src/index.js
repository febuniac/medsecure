const express = require('express');
const helmet = require('helmet');
const { logger } = require('./utils/logger');
const hipaaAudit = require('./middleware/hipaaAudit');
const authMiddleware = require('./middleware/auth');
const db = require('./models/db');
const { DisasterRecoveryService } = require('./services/disasterRecoveryService');
const { BackupService } = require('./services/backupService');
const { initializeHealthRoutes } = require('./api/health');

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

// Initialize disaster recovery services (HIPAA §164.308(a)(7))
const drService = new DisasterRecoveryService(db);
const backupService = new BackupService(db);

// Health check endpoints (unauthenticated for monitoring)
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/health', initializeHealthRoutes(drService, backupService));

// Start DR monitoring and backup scheduling in production
if (process.env.NODE_ENV === 'production') {
  drService.start();
  backupService.start();
  logger.info('Disaster recovery services initialized');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`MedSecure running on port ${PORT}`));
module.exports = app;
