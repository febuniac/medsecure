const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../models/db');
const { logger } = require('../utils/logger');

const { validatePassword } = require('../utils/passwordValidator');

const SALT_ROUNDS = 12;

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'Email and name are required' });
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ error: 'Password does not meet complexity requirements', details: passwordErrors });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await db('users').insert({
      email,
      password: hashedPassword,
      name,
      role: role || 'viewer',
      created_at: new Date()
    }).returning('*');

    logger.info({ type: 'AUTH', action: 'register', userId: user[0].id, email });

    res.status(201).json({ id: user[0].id, email: user[0].email, name: user[0].name, role: user[0].role });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    logger.error({ type: 'AUTH', action: 'register_error', error: err.message });
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db('users').where({ email }).first();
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    logger.info({ type: 'AUTH', action: 'login', userId: user.id, email });

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    logger.error({ type: 'AUTH', action: 'login_error', error: err.message });
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
