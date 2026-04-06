const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');

const adminRouter = express.Router();

// All routes under this router require admin role
adminRouter.use(requireAdmin);

adminRouter.use('/provider-assignments', require('./providerAssignments'));
adminRouter.use('/baa-agreements', require('./baaAgreements'));
adminRouter.use('/breach-notifications', require('./breachNotification'));
adminRouter.use('/backup-verification', require('./backupVerification'));

module.exports = adminRouter;
