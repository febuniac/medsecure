const express = require('express');
const router = express.Router();
const {
  runVerificationNow,
  getLastVerificationResult,
  getVerificationHistory
} = require('../services/backupVerificationScheduler');
const db = require('../models/db');
const knex = require('knex');

function getTestDb() {
  return knex({
    client: 'pg',
    connection: {
      host: process.env.TEST_DB_HOST || process.env.DB_HOST || 'localhost',
      port: process.env.TEST_DB_PORT || process.env.DB_PORT || 5432,
      user: process.env.TEST_DB_USER || process.env.DB_USER || 'medsecure',
      password: process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD,
      database: process.env.TEST_DB_NAME || 'medsecure_test_db',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false
    },
    pool: { min: 1, max: 5 }
  });
}

router.get('/status', (req, res) => {
  const lastResult = getLastVerificationResult();
  if (!lastResult) {
    return res.json({
      message: 'No backup verification has been run yet',
      lastVerification: null
    });
  }
  res.json({ lastVerification: lastResult });
});

router.get('/history', (req, res) => {
  const history = getVerificationHistory();
  res.json({
    total: history.length,
    verifications: history
  });
});

router.post('/run', async (req, res) => {
  try {
    const testDb = getTestDb();
    const result = await runVerificationNow(db, testDb);
    await testDb.destroy();

    const statusCode = result.status === 'passed' ? 200 : 500;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

module.exports = router;
