const express = require('express');
const authMiddleware = require('../middleware/auth');

const v1Router = express.Router();

v1Router.use('/patients', authMiddleware, require('./patients'));
v1Router.use('/records', authMiddleware, require('./records'));
v1Router.use('/appointments', authMiddleware, require('./appointments'));
v1Router.use('/prescriptions', authMiddleware, require('./prescriptions'));
v1Router.use('/consent', authMiddleware, require('./consent'));
v1Router.use('/provider-assignments', authMiddleware, require('./providerAssignments'));
v1Router.use('/breach-notifications', authMiddleware, require('./breachNotification'));
v1Router.use('/baa-agreements', authMiddleware, require('./baaAgreements'));
v1Router.use('/backup-verification', authMiddleware, require('./backupVerification'));
v1Router.use('/image-attachments', authMiddleware, require('./imageAttachments'));
v1Router.use('/auth', require('./auth'));

module.exports = v1Router;
