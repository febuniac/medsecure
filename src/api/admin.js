const router = require('express').Router();
const db = require('../models/db');
const { logger } = require('../utils/logger');
const { formatErrorResponse } = require('../utils/errorCodes');

router.get('/users', async (req, res) => {
  try {
    const users = await db('users').select('id', 'email', 'name', 'role', 'created_at');
    res.json(users);
  } catch (err) {
    logger.error({ type: 'ADMIN', action: 'list_users_error', error: err.message });
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});

router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const validRoles = ['admin', 'provider', 'nurse', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: `Role must be one of: ${validRoles.join(', ')}` } });
    }

    const user = await db('users').where({ id: req.params.id }).update({ role }).returning('*');
    if (!user.length) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    logger.info({ type: 'ADMIN', action: 'update_role', targetUserId: req.params.id, newRole: role, adminId: req.user.id });
    res.json({ id: user[0].id, email: user[0].email, name: user[0].name, role: user[0].role });
  } catch (err) {
    logger.error({ type: 'ADMIN', action: 'update_role_error', error: err.message });
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});

router.get('/audit-logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const logs = await db('audit_logs').orderBy('created_at', 'desc').limit(limit).offset(offset);
    res.json(logs);
  } catch (err) {
    logger.error({ type: 'ADMIN', action: 'audit_logs_error', error: err.message });
    const { status, body } = formatErrorResponse(err);
    res.status(status).json(body);
  }
});

module.exports = router;
