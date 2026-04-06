const router = require('express').Router();
const bcrypt = require('bcrypt');
const db = require('../models/db');
const { logger } = require('../utils/logger');
const { generateToken } = require('../middleware/auth');
const { validatePassword } = require('../utils/passwordValidator');
const { ErrorCodes, formatError } = require('../utils/errorCodes');

const SALT_ROUNDS = 12;

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !name) {
      return res.status(400).json(formatError(ErrorCodes.MISSING_REQUIRED_FIELDS, 'Email and name are required'));
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json(formatError(ErrorCodes.PASSWORD_TOO_WEAK, 'Password does not meet complexity requirements', passwordErrors));
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
      return res.status(409).json(formatError(ErrorCodes.EMAIL_ALREADY_EXISTS, 'Email already registered'));
    }
    logger.error({ type: 'AUTH', action: 'register_error', error: err.message });
    res.status(500).json(formatError(ErrorCodes.REGISTRATION_FAILED, 'Registration failed'));
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json(formatError(ErrorCodes.MISSING_REQUIRED_FIELDS, 'Email and password are required'));
    }

    const user = await db('users').where({ email }).first();
    if (!user) {
      return res.status(401).json(formatError(ErrorCodes.INVALID_CREDENTIALS, 'Invalid credentials'));
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json(formatError(ErrorCodes.INVALID_CREDENTIALS, 'Invalid credentials'));
    }

    const token = generateToken(user);

    logger.info({ type: 'AUTH', action: 'login', userId: user.id, email });

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    logger.error({ type: 'AUTH', action: 'login_error', error: err.message });
    res.status(500).json(formatError(ErrorCodes.LOGIN_FAILED, 'Login failed'));
  }
});

module.exports = router;
