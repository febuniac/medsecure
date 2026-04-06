const express = require('express');
const authMiddleware = require('../middleware/auth');
const adminRouter = require('./admin');

const v1Router = express.Router();

v1Router.use('/patients', authMiddleware, require('./patients'));
v1Router.use('/records', authMiddleware, require('./records'));
v1Router.use('/appointments', authMiddleware, require('./appointments'));
v1Router.use('/prescriptions', authMiddleware, require('./prescriptions'));
v1Router.use('/consent', authMiddleware, require('./consent'));

// Admin-only routes (require authentication + admin role)
v1Router.use(authMiddleware, adminRouter);

v1Router.use('/auth', require('./auth'));

module.exports = v1Router;
