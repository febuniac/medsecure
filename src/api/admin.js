const router = require('express').Router();
const db = require('../models/db');
const { logger } = require('../utils/logger');
const requireAdmin = require('../middleware/requireAdmin');

// Apply requireAdmin middleware to all admin routes
router.use(requireAdmin);

// List all users
router.get('/users', async (req, res) => {
  try {
    const users = await db('users').select('id', 'email', 'name', 'role', 'created_at');
    logger.info({ type: 'ADMIN', action: 'list_users', adminId: req.user.id });
    res.json(users);
  } catch (err) {
    logger.error({ type: 'ADMIN', action: 'list_users_error', error: err.message });
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Update user role
router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const validRoles = ['admin', 'provider', 'nurse', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role', validRoles });
    }

    const user = await db('users').where({ id: req.params.id }).update({ role }).returning('*');
    if (!user.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info({ type: 'ADMIN', action: 'update_role', adminId: req.user.id, targetUserId: req.params.id, newRole: role });
    res.json({ id: user[0].id, email: user[0].email, name: user[0].name, role: user[0].role });
  } catch (err) {
    logger.error({ type: 'ADMIN', action: 'update_role_error', error: err.message });
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Deactivate user
router.put('/users/:id/deactivate', async (req, res) => {
  try {
    if (req.params.id === String(req.user.id)) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const user = await db('users').where({ id: req.params.id }).update({ active: false }).returning('*');
    if (!user.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info({ type: 'ADMIN', action: 'deactivate_user', adminId: req.user.id, targetUserId: req.params.id });
    res.json({ message: 'User deactivated', userId: req.params.id });
  } catch (err) {
    logger.error({ type: 'ADMIN', action: 'deactivate_user_error', error: err.message });
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// Get audit logs
router.get('/audit-logs', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const logs = await db('audit_logs')
      .orderBy('created_at', 'desc')
      .limit(Math.min(Number(limit), 500))
      .offset(Number(offset));

    logger.info({ type: 'ADMIN', action: 'view_audit_logs', adminId: req.user.id });
    res.json(logs);
  } catch (err) {
    logger.error({ type: 'ADMIN', action: 'audit_logs_error', error: err.message });
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

// Get system settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await db('system_settings').select('*');
    logger.info({ type: 'ADMIN', action: 'view_settings', adminId: req.user.id });
    res.json(settings);
  } catch (err) {
    logger.error({ type: 'ADMIN', action: 'settings_error', error: err.message });
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

module.exports = router;
