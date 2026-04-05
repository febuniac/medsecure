const express = require('express');
const helmet = require('helmet');
const { logger } = require('./utils/logger');
const { checkHealth: checkEncryptionHealth } = require('./utils/encryption');
const hipaaAudit = require('./middleware/hipaaAudit');
const authMiddleware = require('./middleware/auth');

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

app.get('/health', (req, res) => {
  const encryption = checkEncryptionHealth();
  const checks = { encryption };
  const isHealthy = encryption.healthy;

  if (!isHealthy) {
    logger.error('Health check failed: encryption service unavailable', { checks });
  }

  const statusCode = isHealthy ? 200 : 503;
  res.status(statusCode).json({
    status: isHealthy ? 'ok' : 'unhealthy',
    checks
  });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => logger.info(`MedSecure running on port ${PORT}`));
}
module.exports = app;
