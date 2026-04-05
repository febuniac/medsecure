const express = require('express');
const helmet = require('helmet');
const { logger } = require('./utils/logger');
const hipaaAudit = require('./middleware/hipaaAudit');
const breachDetection = require('./middleware/breachDetection');
const authMiddleware = require('./middleware/auth');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '50mb' }));
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

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`MedSecure running on port ${PORT}`));
module.exports = app;
